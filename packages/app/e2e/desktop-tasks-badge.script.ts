/**
 * Packaged Electron real-surface check for the composer tasks badge (T3 port M6+18).
 *
 *   npx tsx e2e/desktop-tasks-badge.script.ts
 *
 * Launches the win-unpacked app on a dedicated daemon port with the mock
 * provider enabled, drives a turn that emits a todo list, and asserts the
 * badge above the composer shows the right counts.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { _electron, type ElectronApplication, type Page } from "playwright";
import { createTempGitRepo } from "./helpers/workspace";
import { createNodeWebSocketFactory } from "./helpers/node-ws-factory";
import { buildHostWorkspaceRoute } from "../src/utils/host-routes";

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const packagedExe = path.join(repoRoot, "packages/desktop/release/win-unpacked/ChisaCode.exe");
const evidenceDir = path.join(repoRoot, ".omo", "evidence");
/** Dedicated port so the check never touches a user daemon on 6767. */
const DAEMON_PORT = 6801;

function log(message: string): void {
  console.log(`[desktop-tasks-badge] ${message}`);
}

async function pollUntil(
  poll: () => Promise<boolean>,
  timeoutMs: number,
  label: string,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await poll()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function ensurePortFree(port: number): Promise<void> {
  const occupied = await new Promise<boolean>((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
  if (!occupied) {
    return;
  }
  log(`port ${port} occupied; stopping ChisaCode + daemon workers only`);
  spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      [
        "Get-Process ChisaCode -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue",
        "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and ($_.CommandLine -like '*daemon-worker*' -or $_.CommandLine -like '*node-entrypoint-runner*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }",
        "Start-Sleep -Seconds 2",
      ].join("; "),
    ],
    { stdio: "ignore" },
  );
  await new Promise((resolve) => setTimeout(resolve, 1500));
}

interface SeedClient {
  close(): Promise<void>;
  openProject(cwd: string): Promise<{
    workspace: { id: string; workspaceDirectory: string } | null;
    error: string | null;
  }>;
  createAgent(options: Record<string, unknown>): Promise<{ id: string; provider: string }>;
}

async function main(): Promise<void> {
  if (!existsSync(packagedExe)) {
    throw new Error(`missing packaged exe: ${packagedExe}`);
  }

  const home = mkdtempSync(path.join(tmpdir(), "chisacode-tasks-badge-home-"));
  const userData = mkdtempSync(path.join(tmpdir(), "chisacode-tasks-badge-user-data-"));
  mkdirSync(home, { recursive: true });
  // The desktop daemon-manager resolves its listen address from the persisted
  // config, so seed it before launch: otherwise the app adopts whatever daemon
  // already owns the default port.
  writeFileSync(
    path.join(home, "config.json"),
    `${JSON.stringify({ daemon: { listen: `127.0.0.1:${DAEMON_PORT}` } }, null, 2)}\n`,
    "utf8",
  );
  mkdirSync(evidenceDir, { recursive: true });

  let electronApp: ElectronApplication | null = null;
  let page: Page | null = null;
  let seedClient: (SeedClient & { connect(): Promise<void> }) | null = null;
  let repoCleanup: (() => Promise<void>) | null = null;
  let badgeText = "";
  let expandedRowCount = 0;
  let pass = false;

  try {
    await ensurePortFree(DAEMON_PORT);
    electronApp = await _electron.launch({
      executablePath: packagedExe,
      env: {
        ...process.env,
        CHISACODE_HOME: home,
        CHISACODE_ELECTRON_USER_DATA_DIR: userData,
        CHISACODE_DICTATION_ENABLED: "0",
        CHISACODE_VOICE_MODE_ENABLED: "0",
        CHISACODE_RELAY_ENABLED: "0",
        // Registers the bundled mock provider so the todo-list mode can drive
        // real badge data without external credentials.
        CHISACODE_ENABLE_DEV_PROVIDERS: "1",
        CHISACODE_LISTEN: `127.0.0.1:${DAEMON_PORT}`,
      },
    });
    page = await electronApp.firstWindow();
    page.setDefaultTimeout(60_000);
    await page.waitForLoadState("domcontentloaded", { timeout: 90_000 });

    const statusHolder: {
      value: { status?: string; listen?: string; serverId?: string } | null;
    } = { value: null };
    await pollUntil(
      async () => {
        const status = await page!.evaluate(async () => {
          const host = (
            window as unknown as {
              chisacodeDesktop?: { invoke?: (c: string) => Promise<unknown> };
            }
          ).chisacodeDesktop;
          if (!host?.invoke) return null;
          try {
            return (await host.invoke("desktop_daemon_status")) as {
              status?: string;
              listen?: string;
              serverId?: string;
            };
          } catch {
            return null;
          }
        });
        statusHolder.value = status;
        return Boolean(status?.listen || status?.status === "running");
      },
      90_000,
      "desktop daemon online",
    );
    const daemonStatus = statusHolder.value;
    if (!daemonStatus?.listen) {
      throw new Error(`daemon status missing listen: ${JSON.stringify(daemonStatus)}`);
    }
    if (!daemonStatus.listen.includes(String(DAEMON_PORT))) {
      throw new Error(
        `daemon adopted unexpected listen ${daemonStatus.listen}; expected port ${DAEMON_PORT}`,
      );
    }
    const serverId = daemonStatus.serverId || "local";
    log(`daemon online listen=${daemonStatus.listen} serverId=${serverId}`);

    const repo = await createTempGitRepo("tasks-badge-qa-");
    repoCleanup = repo.cleanup;

    const DaemonClient = (
      await import(pathToFileURL(path.join(repoRoot, "packages/client/dist/daemon-client.js")).href)
    ).DaemonClient as new (config: {
      url: string;
      clientId: string;
      clientType: string;
      appVersion: string;
      webSocketFactory: unknown;
    }) => SeedClient & { connect(): Promise<void> };

    const client = new DaemonClient({
      url: `ws://${daemonStatus.listen}/ws`,
      clientId: `tasks-badge-seed-${randomUUID()}`,
      clientType: "cli",
      appVersion: "1.0.2",
      webSocketFactory: createNodeWebSocketFactory(),
    });
    await client.connect();
    seedClient = client;

    const opened = await client.openProject(repo.path);
    if (!opened.workspace) {
      throw new Error(opened.error ?? "openProject failed");
    }
    const agent = await client.createAgent({
      provider: "mock",
      cwd: repo.path,
      model: "ten-second-stream",
      title: "desktop-tasks-badge-qa",
      initialPrompt: "Emit a todo list.",
    });
    log(`created agent ${agent.id}`);

    const agentRoute = `${buildHostWorkspaceRoute(serverId, repo.path)}?open=${encodeURIComponent(
      `agent:${agent.id}`,
    )}`;
    await page.goto(`chisacode://app${agentRoute}`, { waitUntil: "domcontentloaded" });

    const badge = page.getByTestId("composer-tasks-badge").first();
    await badge.waitFor({ state: "visible", timeout: 120_000 });
    badgeText = (await badge.innerText()).trim();
    log(`badge text=${badgeText}`);

    await badge.click();
    const taskRows = page.getByTestId("composer-tasks-badge-row");
    await taskRows.first().waitFor({ state: "visible", timeout: 10_000 });
    expandedRowCount = await taskRows.count();

    const shotPath = path.join(
      evidenceDir,
      `desktop-tasks-badge-${new Date().toISOString().replace(/[:.]/g, "-")}.png`,
    );
    await page.screenshot({ path: shotPath, fullPage: true });
    log(`screenshot=${shotPath}`);

    pass = badgeText.includes("2/3") && expandedRowCount === 3;

    const evidencePath = path.join(
      evidenceDir,
      `desktop-tasks-badge-${new Date().toISOString().replace(/[:.]/g, "-")}.md`,
    );
    writeFileSync(
      evidencePath,
      [
        "# Desktop composer tasks badge verification",
        "",
        `- pass: ${pass}`,
        `- badgeText: ${badgeText}`,
        `- expandedRowCount: ${expandedRowCount}`,
        `- screenshot: ${shotPath}`,
        "",
      ].join("\n"),
      "utf8",
    );
    log(`evidence=${evidencePath}`);

    if (!pass) {
      throw new Error(`tasks badge checks failed: badgeText=${badgeText} rows=${expandedRowCount}`);
    }
    log("PASS desktop tasks badge verified");
  } finally {
    if (seedClient) {
      await seedClient.close().catch(() => undefined);
    }
    if (repoCleanup) {
      await repoCleanup().catch(() => undefined);
    }
    if (electronApp) {
      await electronApp.close().catch(() => undefined);
    }
  }
}

main().catch((error) => {
  console.error("[desktop-tasks-badge] FAILED:", error);
  process.exit(1);
});
