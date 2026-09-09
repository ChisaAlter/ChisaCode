/**
 * Packaged Electron real-surface check for the composer banner stack (T3 port M7).
 *
 *   npx tsx e2e/desktop-composer-banner.script.ts
 *
 * Expects packages/desktop/release/win-unpacked/ChisaCode.exe. Uses the bundled
 * mock provider (failing-turn prompt mode) so the check does not depend on any
 * external provider credentials.
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
const DAEMON_PORT = 6799;

function log(message: string): void {
  console.log(`[desktop-composer-banner] ${message}`);
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
  sendMessage(agentId: string, text: string): Promise<unknown>;
}

function evaluateBannerChecks(observed: Record<string, unknown>): boolean {
  const seam = observed.seam as Record<string, string> | undefined;
  if (!seam) {
    return false;
  }
  // Electron scales the 1px border by the display device-pixel ratio, so
  // compare numerically instead of against the exact CSS string.
  const sideBorderWidth = Number.parseFloat(seam.cardBorderLeftWidth ?? "0");
  const seamSquared =
    seam.bannerBorderBottomWidth === "0px" &&
    seam.bannerBottomLeftRadius === "0px" &&
    seam.cardBorderTopWidth === "0px" &&
    seam.cardTopLeftRadius === "0px" &&
    sideBorderWidth > 0 &&
    sideBorderWidth < 2 &&
    seam.cardBottomLeftRadius === "18px";
  return (
    seamSquared &&
    observed.dismissed === true &&
    String(observed.secondBannerText).includes("会话历史同步失败") &&
    !String(observed.secondBannerText).includes("上游限流")
  );
}

async function main(): Promise<void> {
  if (!existsSync(packagedExe)) {
    throw new Error(`missing packaged exe: ${packagedExe}`);
  }

  const home = mkdtempSync(path.join(tmpdir(), "chisacode-banner-home-"));
  const userData = mkdtempSync(path.join(tmpdir(), "chisacode-banner-user-data-"));
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
  let seedClient: SeedClient | null = null;
  let repoCleanup: (() => Promise<void>) | null = null;
  let pass = false;
  const observed: Record<string, unknown> = {};

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
        // Registers the bundled mock provider so the failing-turn mode can
        // drive a real daemon error without external credentials.
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
    const serverId = daemonStatus.serverId || "local";
    log(`daemon online listen=${daemonStatus.listen} serverId=${serverId}`);

    const repo = await createTempGitRepo("banner-qa-");
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
      clientId: `banner-seed-${randomUUID()}`,
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
      title: "desktop-composer-banner-qa",
      initialPrompt: "Say hello.",
    });
    log(`created agent ${agent.id}`);

    const agentRoute = `${buildHostWorkspaceRoute(serverId, repo.path)}?open=${encodeURIComponent(
      `agent:${agent.id}`,
    )}`;
    await page.goto(`chisacode://app${agentRoute}`, { waitUntil: "domcontentloaded" });
    await pollUntil(
      async () => (await page!.getByTestId("composer-input-card").count()) > 0,
      120_000,
      "composer visible",
    );

    // Fail a turn on the settled agent.
    await client.sendMessage(agent.id, "Fail the turn: 上游限流（HTTP 429）");
    const banner = page.getByTestId("agent-run-error-banner").first();
    await banner.waitFor({ state: "visible", timeout: 90_000 });
    observed.bannerText = await banner.innerText();

    observed.seam = await banner.evaluate((element) => {
      const bannerStyle = window.getComputedStyle(element);
      const card = document.querySelector('[data-testid="composer-input-card"]');
      const cardStyle = card ? window.getComputedStyle(card) : null;
      return {
        bannerBorderBottomWidth: bannerStyle.borderBottomWidth,
        bannerBottomLeftRadius: bannerStyle.borderBottomLeftRadius,
        bannerBackground: bannerStyle.backgroundColor,
        cardBorderTopWidth: cardStyle?.borderTopWidth ?? null,
        cardBorderLeftWidth: cardStyle?.borderLeftWidth ?? null,
        cardTopLeftRadius: cardStyle?.borderTopLeftRadius ?? null,
        cardBottomLeftRadius: cardStyle?.borderBottomLeftRadius ?? null,
      };
    });
    log(`seam=${JSON.stringify(observed.seam)}`);

    await page.getByTestId("agent-run-error-banner-dismiss").first().click();
    await banner.waitFor({ state: "hidden", timeout: 20_000 });
    observed.dismissed = true;

    // A different failure in the same thread must still surface.
    await client.sendMessage(agent.id, "Fail the turn: 会话历史同步失败");
    const secondBanner = page.getByTestId("agent-run-error-banner").first();
    await secondBanner.waitFor({ state: "visible", timeout: 90_000 });
    observed.secondBannerText = await secondBanner.innerText();

    const shotPath = path.join(
      evidenceDir,
      `desktop-composer-banner-${new Date().toISOString().replace(/[:.]/g, "-")}.png`,
    );
    await page.screenshot({ path: shotPath, fullPage: true });
    log(`screenshot=${shotPath}`);

    pass = evaluateBannerChecks(observed);

    const evidencePath = path.join(
      evidenceDir,
      `desktop-composer-banner-${new Date().toISOString().replace(/[:.]/g, "-")}.md`,
    );
    writeFileSync(
      evidencePath,
      [
        "# Desktop composer banner verification",
        "",
        `- pass: ${pass}`,
        `- screenshot: ${shotPath}`,
        "",
        "```json",
        JSON.stringify(observed, null, 2),
        "```",
        "",
      ].join("\n"),
      "utf8",
    );
    log(`evidence=${evidencePath}`);

    if (!pass) {
      throw new Error(`banner checks failed: ${JSON.stringify(observed)}`);
    }
    log("PASS desktop composer banner verified");
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
  console.error("[desktop-composer-banner] FAILED:", error);
  process.exit(1);
});
