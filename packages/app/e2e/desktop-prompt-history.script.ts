/**
 * Real packaged-desktop gate for the T3 port module 1 (composer prompt history).
 *
 * Launches the electron-builder packaged win build (ChisaCode.exe from the
 * newest ChisaCode-Setup-*-x64.zip in packages/desktop/release) — NOT the
 * dev-mode electron — against an isolated CHISACODE_HOME, then drives the
 * real renderer window via Playwright's `_electron` API and asserts the
 * prompt-history behaviors on the packaged desktop surface:
 *
 *   1. ArrowUp on an empty composer recalls the newest sent prompt
 *   2. Editing the recalled text ends browsing; the next ArrowUp restarts
 *      from the newest entry
 *   3. ArrowDown steps forward past the newest entry and clears the draft
 *   4. Inside a multi-line draft, ArrowUp on a lower line does not recall
 *
 * Run with tsx from packages/app: `pnpm exec tsx e2e/desktop-prompt-history.script.ts`
 */
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { _electron, type ElectronApplication, type Page } from "playwright";
import { expect } from "@playwright/test";
import { createTempGitRepo, removeDirectoryWithRetry } from "./helpers/workspace";
import { buildAgentRoute } from "./helpers/mock-agent";
import { createNodeWebSocketFactory } from "./helpers/node-ws-factory";
import { composerInput } from "./helpers/app";
import { expectComposerDraft, expectComposerEditable, submitMessage } from "./helpers/composer";

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const desktopDir = path.join(repoRoot, "packages/desktop");
const releaseDir = path.join(desktopDir, "release");
const unpackedDir = path.join(releaseDir, ".unpacked-x64");
const packagedExe = path.join(unpackedDir, "ChisaCode.exe");

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
  const occupied = () =>
    new Promise<boolean>((resolve) => {
      const socket = net.connect({ host: "127.0.0.1", port });
      socket.once("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.once("error", () => resolve(false));
    });
  if (!(await occupied())) {
    return;
  }
  console.log(`[prompt-history-packaged] port ${port} occupied; killing stale dev daemon workers`);
  // Only dev-mode supervisor workers (daemon-worker.ts) can be stale here; the
  // packaged daemon runs node-entrypoint-runner.js and is never targeted.
  const script =
    "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | " +
    "Where-Object { $_.CommandLine -like '*daemon-worker*' } | " +
    "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }";
  spawnSync("powershell.exe", ["-NoProfile", "-Command", script], { stdio: "ignore" });
  await new Promise((resolve) => setTimeout(resolve, 1500));
  if (await occupied()) {
    throw new Error(`port ${port} still occupied after stale-worker cleanup`);
  }
}

/** Extracts the newest packaged win build once and returns the ChisaCode.exe path. */
async function ensurePackagedBuild(): Promise<string> {
  const zip = readdirSync(releaseDir)
    .filter((name) => /^ChisaCode-Setup-.*-x64\.zip$/.test(name))
    .map((name) => path.join(releaseDir, name))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
  if (!zip) {
    if (existsSync(packagedExe)) {
      return packagedExe;
    }
    throw new Error("no ChisaCode-Setup-*-x64.zip in packages/desktop/release");
  }

  const extractedBuildIsCurrent = (() => {
    try {
      return existsSync(packagedExe) && statSync(packagedExe).mtimeMs >= statSync(zip).mtimeMs;
    } catch {
      return false;
    }
  })();
  if (extractedBuildIsCurrent) {
    return packagedExe;
  }

  if (existsSync(unpackedDir)) {
    console.log("[prompt-history-packaged] removing stale extracted build:", unpackedDir);
    await removeDirectoryWithRetry(unpackedDir);
  }

  console.log("[prompt-history-packaged] extracting", path.basename(zip), "->", unpackedDir);
  mkdirSync(unpackedDir, { recursive: true });
  let result = spawnSync("unzip", ["-q", zip, "-d", unpackedDir], {
    stdio: "ignore",
    timeout: 600_000,
  });
  if (result.status !== 0) {
    result = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${unpackedDir}' -Force`,
      ],
      { stdio: "ignore", timeout: 600_000 },
    );
  }
  if (result.status !== 0 || !existsSync(packagedExe)) {
    rmSync(unpackedDir, { recursive: true, force: true });
    throw new Error(`failed to extract packaged build (status ${result.status})`);
  }
  return packagedExe;
}

async function main(): Promise<void> {
  const home = mkdtempSync(path.join(tmpdir(), "chisacode-prompt-history-home-"));
  const userData = mkdtempSync(path.join(tmpdir(), "chisacode-prompt-history-user-data-"));
  const serverId = "srv_prompt_history_packaged_e2e";
  const prompt = "Recall me with arrow keys please.";

  process.env.CHISACODE_HOME = home;
  process.env.CHISACODE_SERVER_ID = serverId;
  process.env.E2E_SERVER_ID = serverId;

  let electronApp: ElectronApplication | null = null;
  let page: Page | null = null;
  let client: { close(): Promise<void> } | null = null;
  let daemonPid: number | null = null;

  try {
    await ensurePortFree(6767);
    const executablePath = await ensurePackagedBuild();
    console.log("[prompt-history-packaged] launching packaged app:", executablePath);
    electronApp = await _electron.launch({
      executablePath,
      env: {
        ...process.env,
        CHISACODE_HOME: home,
        CHISACODE_ELECTRON_USER_DATA_DIR: userData,
        CHISACODE_ENABLE_DEV_PROVIDERS: "1",
        CHISACODE_DICTATION_ENABLED: "0",
        CHISACODE_VOICE_MODE_ENABLED: "0",
        CHISACODE_RELAY_ENABLED: "0",
      },
    });
    console.log("[prompt-history-packaged] packaged app launched, grabbing first window");
    page = await electronApp.firstWindow();
    page.setDefaultTimeout(30_000);
    await page.waitForLoadState("domcontentloaded", { timeout: 60_000 });
    console.log("[prompt-history-packaged] window url:", page.url());

    const statusHolder: {
      value: {
        status?: string;
        listen?: string;
        pid?: number;
        desktopManaged?: boolean;
      } | null;
    } = { value: null };
    await pollUntil(
      async () => {
        const current = await page
          ?.evaluate(async () => {
            const host = (
              window as unknown as {
                chisacodeDesktop?: { invoke?: (c: string) => Promise<unknown> };
              }
            ).chisacodeDesktop;
            if (!host?.invoke) {
              return null;
            }
            try {
              return (await host.invoke("desktop_daemon_status")) as {
                status?: string;
                listen?: string;
                pid?: number;
                desktopManaged?: boolean;
              };
            } catch {
              return null;
            }
          })
          .catch(() => null);
        statusHolder.value = current ?? null;
        const daemonStatus = statusHolder.value;
        return (
          daemonStatus?.status === "running" &&
          daemonStatus.desktopManaged === true &&
          typeof daemonStatus.listen === "string" &&
          daemonStatus.listen.length > 0 &&
          typeof daemonStatus.pid === "number"
        );
      },
      120_000,
      "desktop-managed daemon running",
    );
    const daemonStatus = statusHolder.value;
    if (!daemonStatus || typeof daemonStatus.pid !== "number") {
      throw new Error("desktop-managed daemon status missing pid after poll");
    }
    daemonPid = daemonStatus.pid;
    console.log(
      "[prompt-history-packaged] daemon status:",
      JSON.stringify(daemonStatus).slice(0, 300),
    );

    const repo = await createTempGitRepo("prompt-history-packaged-");
    const DaemonClient = (
      await import(pathToFileURL(path.join(repoRoot, "packages/client/dist/daemon-client.js")).href)
    ).DaemonClient as new (config: {
      url: string;
      clientId: string;
      clientType: string;
      appVersion: string;
      webSocketFactory: unknown;
    }) => {
      connect(): Promise<void>;
      close(): Promise<void>;
      openProject(cwd: string): Promise<{
        workspace: { id: string } | null;
        error: string | null;
      }>;
      createAgent(options: {
        provider: string;
        cwd: string;
        model?: string;
      }): Promise<{ id: string; status: string }>;
    };
    const seedClient = new DaemonClient({
      url: `ws://${daemonStatus.listen}/ws`,
      clientId: `prompt-history-packaged-${randomUUID()}`,
      clientType: "cli",
      appVersion: "1.0.3",
      webSocketFactory: createNodeWebSocketFactory(),
    });
    await seedClient.connect();
    client = seedClient;
    const opened = await seedClient.openProject(repo.path);
    if (!opened.workspace) {
      throw new Error(opened.error ?? "Failed to open project");
    }
    const agent = await seedClient.createAgent({
      provider: "mock",
      cwd: repo.path,
      model: "one-minute-stream",
    });
    const route = buildAgentRoute(repo.path, agent.id);
    await page.goto(`chisacode://app${route}`, { waitUntil: "domcontentloaded" });
    await page.getByTestId("workspace-main-panel").waitFor({ state: "visible", timeout: 120_000 });
    await expectComposerEditable(page);
    console.log("[prompt-history-packaged] agent route open, composer editable");

    // Send one prompt and let the one-minute mock stream drain so the user
    // message settles into the canonical history before recalling.
    await submitMessage(page, prompt);
    await expect(page.getByRole("button", { name: /stop|cancel|停止|取消/i }).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole("button", { name: /stop|cancel|停止|取消/i })).toHaveCount(0, {
      timeout: 120_000,
    });
    console.log("[prompt-history-packaged] prompt sent, turn settled");

    const composer = composerInput(page);

    // 1. ArrowUp on an empty composer recalls the newest sent prompt.
    await composer.click();
    await composer.press("ArrowUp");
    await expectComposerDraft(page, prompt);
    console.log("[prompt-history-packaged] ArrowUp recalled the sent prompt");

    // 2. Editing the recalled text ends browsing; the next ArrowUp restarts
    // from the newest entry rather than continuing from a stale position.
    await composer.press("End");
    await composer.type(" ");
    await composer.press("ArrowUp");
    await expectComposerDraft(page, prompt);
    console.log("[prompt-history-packaged] edit ended browsing, ArrowUp restarted at newest");

    // 3. ArrowDown steps forward past the newest entry and clears the draft.
    await composer.press("ArrowDown");
    await expectComposerDraft(page, "");
    console.log("[prompt-history-packaged] ArrowDown cleared the draft");

    // 4. Inside a multi-line draft, ArrowUp on a lower line moves the caret
    // within the text instead of recalling history.
    const multiline = "first line\nsecond line";
    await composer.fill(multiline);
    await composer.press("ArrowUp");
    await expectComposerDraft(page, multiline);
    console.log("[prompt-history-packaged] multiline ArrowUp did not recall");

    console.log("[prompt-history-packaged] ALL PROMPT HISTORY PACKAGED GATES PASSED");
  } finally {
    const diagDir = path.join(releaseDir, ".last-prompt-history-run");
    try {
      mkdirSync(diagDir, { recursive: true });
      for (const [src, name] of [
        [path.join(home, "daemon.log"), "daemon.log"],
        [path.join(userData, "logs", "main.log"), "desktop-main.log"],
      ] as const) {
        if (existsSync(src)) {
          rmSync(path.join(diagDir, name), { force: true });
          copyFileSync(src, path.join(diagDir, name));
        }
      }
    } catch (error) {
      console.warn("[prompt-history-packaged] diag copy warning:", error);
    }
    const boundedClose = (closer: () => Promise<void>) =>
      Promise.race([
        closer(),
        new Promise<void>((resolve) => {
          setTimeout(resolve, 10_000);
        }),
      ]).catch(() => undefined);
    await boundedClose(() => page?.close().catch(() => undefined) ?? Promise.resolve());
    await boundedClose(() => electronApp?.close().catch(() => undefined) ?? Promise.resolve());
    await boundedClose(() => client?.close().catch(() => undefined) ?? Promise.resolve());
    if (daemonPid) {
      try {
        spawnSync("taskkill", ["/pid", String(daemonPid), "/T", "/F"], { stdio: "ignore" });
      } catch {
        // Best effort.
      }
    }
    rmSync(home, { recursive: true, force: true });
    rmSync(userData, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error("[prompt-history-packaged] FAILED:", error);
  process.exitCode = 1;
});
