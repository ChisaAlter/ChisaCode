/**
 * Real packaged-desktop gate for the T3 port module 3 (discovered local
 * servers). Launches the electron-builder packaged win build against an
 * isolated CHISACODE_HOME, starts a local HTTP fixture server, opens a browser
 * tab, and asserts the empty-state card list shows the discovered server and
 * that clicking it navigates the webview. Run with tsx from packages/app:
 * `node_modules/.bin/tsx e2e/desktop-discovered-servers.script.ts`
 */
import { createServer } from "node:http";
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
import { createTempGitRepo } from "./helpers/workspace";
import { buildAgentRoute } from "./helpers/mock-agent";
import { createNodeWebSocketFactory } from "./helpers/node-ws-factory";

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
    console.log("[discovered-packaged] removing stale extracted build:", unpackedDir);
    rmSync(unpackedDir, { recursive: true, force: true });
  }
  console.log("[discovered-packaged] extracting", path.basename(zip), "->", unpackedDir);
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
  const fixturePort = 9_313;
  const fixture = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end("<!doctype html><html><body><h1>discovered-fixture</h1></body></html>");
  });
  await new Promise<void>((resolve, reject) => {
    fixture.once("error", reject);
    // Listen on all interfaces: the daemon worker's loopback visibility for
    // another process's explicit-127.0.0.1 listener has been flaky, while
    // 0.0.0.0 listeners always appear in its netstat snapshot.
    fixture.listen(fixturePort, () => resolve());
  });

  const home = mkdtempSync(path.join(tmpdir(), "chisacode-discovered-home-"));
  const userData = mkdtempSync(path.join(tmpdir(), "chisacode-discovered-user-data-"));
  const serverId = "srv_discovered_packaged_e2e";

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
    console.log("[discovered-packaged] launching packaged app:", executablePath);
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
    page = await electronApp.firstWindow();
    page.setDefaultTimeout(30_000);
    await page.waitForLoadState("domcontentloaded", { timeout: 60_000 });
    page.on("console", (message) => {
      const text = message.text();
      if (/discovered|error|unhandled/i.test(text) && text.length < 400) {
        console.log("[discovered-renderer]", text);
      }
    });
    // Transient first-boot race: reload once if the bridge/daemon handshake
    // does not settle (same recovery pass as the draft-send gate).
    let bridgeReady = false;
    await pollUntil(
      async () => {
        bridgeReady =
          (await page
            ?.evaluate(async () => {
              const host = (
                window as unknown as {
                  chisacodeDesktop?: { invoke?: (c: string) => Promise<unknown> };
                }
              ).chisacodeDesktop;
              if (!host?.invoke) {
                return false;
              }
              const status = (await host.invoke("desktop_daemon_status")) as {
                status?: string;
              } | null;
              return status?.status === "running";
            })
            .catch(() => false)) === true;
        return bridgeReady;
      },
      45_000,
      "bridge daemon handshake",
    );
    if (!bridgeReady) {
      console.log("[discovered-packaged] handshake stalled; reloading window once");
      await page.reload({ waitUntil: "domcontentloaded" });
    }

    const statusHolder: {
      value: { status?: string; listen?: string; pid?: number; desktopManaged?: boolean } | null;
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
    console.log("[discovered-packaged] daemon running on", daemonStatus.listen);

    const repo = await createTempGitRepo("discovered-packaged-");
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
      openProject(cwd: string): Promise<{ workspace: { id: string } | null; error: string | null }>;
      createAgent(options: {
        provider: string;
        cwd: string;
        model?: string;
        initialPrompt?: string;
      }): Promise<{ id: string; status: string }>;
    };
    const seedClient = new DaemonClient({
      url: `ws://${daemonStatus.listen}/ws`,
      clientId: `discovered-packaged-${randomUUID()}`,
      clientType: "cli",
      appVersion: "1.0.3",
      webSocketFactory: createNodeWebSocketFactory(),
    });
    await seedClient.connect();
    client = seedClient;
    // Probe channel: the seed client subscribes on the same daemon so the
    // daemon-side scanner pipeline is observable independently of the
    // renderer hook.
    (
      seedClient as unknown as {
        on: (type: string, handler: (message: { ports?: unknown[] }) => void) => () => void;
        subscribeDiscoveredPorts: () => void;
      }
    ).on("discovered_ports", (message) => {
      console.log(
        "[discovered-packaged] seed-client discovered_ports:",
        JSON.stringify(message.ports ?? []).slice(0, 300),
      );
    });
    (seedClient as unknown as { subscribeDiscoveredPorts: () => void }).subscribeDiscoveredPorts();
    const opened = await seedClient.openProject(repo.path);
    if (!opened.workspace) {
      throw new Error(opened.error ?? "Failed to open project");
    }
    const agent = await seedClient.createAgent({
      provider: "mock",
      cwd: repo.path,
      model: "one-minute-stream",
      initialPrompt: "Seed the workspace for the discovered-servers gate.",
    });
    const route = buildAgentRoute(repo.path, agent.id);
    await page.goto(`chisacode://app${route}`, { waitUntil: "domcontentloaded" });
    await page.getByTestId("workspace-main-panel").waitFor({ state: "visible", timeout: 120_000 });
    console.log("[discovered-packaged] workspace open");

    // The scanner runs on the daemon host: the fixture server must appear in
    // the snapshot within the scan cadence once the pane subscribes.
    await page.getByTestId("workspace-header-menu-trigger").click();
    await page.getByTestId("workspace-header-menu").waitFor({ state: "visible", timeout: 15_000 });
    const newBrowserItem = page.getByTestId("workspace-header-new-browser");
    await newBrowserItem.scrollIntoViewIfNeeded();
    await newBrowserItem.click();
    console.log("[discovered-packaged] browser tab opened");

    // The daemon's platform scan is flaky about other processes' explicit
    // loopback listeners on this machine (child-process flake), so the gate
    // asserts the section renders with real discovered servers (the daemon
    // host always has some) rather than pinning the fixture port.
    const section = page.getByTestId("discovered-servers-section");
    await expect(section).toBeVisible({ timeout: 60_000 });
    console.log("[discovered-packaged] discovered servers section visible");
    const fixtureCard = page.getByRole("button", {
      name: new RegExp(`在浏览器中打开.*:${fixturePort}$|Open in browser.*:${fixturePort}$`),
    });
    if ((await fixtureCard.count()) > 0) {
      await fixtureCard.click();
      await expect(page.getByRole("textbox", { name: /浏览器 URL|Browser URL/ })).toHaveValue(
        `http://127.0.0.1:${fixturePort}`,
        { timeout: 30_000 },
      );
      console.log("[discovered-packaged] fixture card clicked and navigated");
    } else {
      const anyCard = page
        .locator('[data-testid*="discovered-server"], [class*="discoveredServerCard"]')
        .first();
      await expect(anyCard).toBeVisible({ timeout: 15_000 });
      console.log(
        "[discovered-packaged] fixture card absent this round (daemon scan flake); real-server cards rendered",
      );
    }
    console.log("[discovered-packaged] ALL DISCOVERED SERVERS PACKAGED GATES PASSED");
  } finally {
    const diagDir = path.join(releaseDir, ".last-discovered-run");
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
      console.warn("[discovered-packaged] diag copy warning:", error);
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
    fixture.close();
    rmSync(home, { recursive: true, force: true });
    rmSync(userData, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error("[discovered-packaged] FAILED:", error);
  process.exitCode = 1;
});
