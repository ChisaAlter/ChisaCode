import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  type DaemonLaunchRuntime,
  type DetachedDaemonProcess,
  resolveLocalDaemonState,
  startLocalDaemonDetached,
  startLocalDaemonForeground,
} from "./local-daemon.js";

type RecordedDaemonLaunch =
  | {
      mode: "detached";
      command: string;
      args: string[];
      options: Parameters<DaemonLaunchRuntime["spawnDetached"]>[2];
    }
  | {
      mode: "foreground";
      command: string;
      args: string[];
      options: Parameters<DaemonLaunchRuntime["spawnForeground"]>[2];
    };

class FakeDaemonProcess extends EventEmitter implements DetachedDaemonProcess {
  pid = 4242;
  wasUnreferenced = false;

  unref(): void {
    this.wasUnreferenced = true;
  }
}

class FakeDaemonRuntime implements DaemonLaunchRuntime {
  readonly recordedLaunches: RecordedDaemonLaunch[] = [];
  readonly daemonProcess = new FakeDaemonProcess();
  foregroundStatus = 0;
  runnerEntry = "/repo/packages/server/scripts/supervisor-entrypoint.ts";

  resolveRunnerEntry(): string {
    return this.runnerEntry;
  }

  resolveHome(env: NodeJS.ProcessEnv): string {
    return env.CHISACODE_HOME ?? "/tmp/chisacode";
  }

  spawnDetached(
    command: string,
    args: string[],
    options: Parameters<DaemonLaunchRuntime["spawnDetached"]>[2],
  ): DetachedDaemonProcess {
    this.recordedLaunches.push({ mode: "detached", command, args, options });
    return this.daemonProcess;
  }

  spawnForeground(
    command: string,
    args: string[],
    options: Parameters<DaemonLaunchRuntime["spawnForeground"]>[2],
  ) {
    this.recordedLaunches.push({ mode: "foreground", command, args, options });
    return { status: this.foregroundStatus, error: undefined };
  }
}

const tempRoots: string[] = [];

async function createChisaCodeHome(config: unknown): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "chisacode-local-daemon-"));
  tempRoots.push(root);
  const chisacodeHome = path.join(root, ".chisacode");
  await mkdir(chisacodeHome, { recursive: true });
  await writeFile(path.join(chisacodeHome, "config.json"), JSON.stringify(config, null, 2));
  return chisacodeHome;
}

function expectSupervisorLaunch(argv: string[]): void {
  const joined = argv.join(" ");
  expect(joined).toContain("supervisor-entrypoint");
  expect(joined).not.toContain("src/server/index.ts");
  expect(joined).not.toContain("dist/server/server/index.js");
  expect(joined).not.toContain("src/server/daemon-worker.ts");
  expect(joined).not.toContain("dist/server/server/daemon-worker.js");
}

describe("local daemon launch supervision", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(async () => {
    await Promise.all(
      tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
    );
  });

  test("foreground start spawns supervisor-entrypoint instead of server/index", async () => {
    const runtime = new FakeDaemonRuntime();

    const status = startLocalDaemonForeground(
      { home: "/tmp/chisacode-test", relay: false },
      runtime,
    );

    expect(status).toBe(0);
    expect(runtime.recordedLaunches.map((launch) => launch.mode)).toEqual(["foreground"]);
    const launch = runtime.recordedLaunches[0];
    expect(launch?.mode).toBe("foreground");
    expect(launch?.command).toBe(process.execPath);
    expectSupervisorLaunch(launch?.args ?? []);
    expect(launch?.args).toContain("--no-relay");
  });

  test("detached start spawns supervisor-entrypoint instead of server/index", async () => {
    vi.useFakeTimers();
    const runtime = new FakeDaemonRuntime();

    const resultPromise = startLocalDaemonDetached(
      { home: "/tmp/chisacode-test", mcp: false },
      runtime,
    );
    await vi.advanceTimersByTimeAsync(1200);
    const result = await resultPromise;

    expect(result).toEqual({ pid: 4242, logPath: "/tmp/chisacode-test/daemon.log" });
    expect(runtime.daemonProcess.wasUnreferenced).toBe(true);
    expect(runtime.recordedLaunches.map((launch) => launch.mode)).toEqual(["detached"]);
    const launch = runtime.recordedLaunches[0];
    expect(launch?.mode).toBe("detached");
    expect(launch?.command).toBe(process.execPath);
    expectSupervisorLaunch(launch?.args ?? []);
    expect(launch?.args).toContain("--no-mcp");
  });

  test("relay TLS flag is passed to the supervised daemon", async () => {
    const runtime = new FakeDaemonRuntime();

    const status = startLocalDaemonForeground(
      {
        home: "/tmp/chisacode-test",
        relayUseTls: true,
      },
      runtime,
    );

    expect(status).toBe(0);
    expect(runtime.recordedLaunches.map((launch) => launch.mode)).toEqual(["foreground"]);
    const launch = runtime.recordedLaunches[0];
    expect(launch?.mode).toBe("foreground");
    expect(launch?.args).toContain("--relay-use-tls");
    expect(launch?.options?.env?.CHISACODE_RELAY_USE_TLS).toBe("true");
  });

  test("local daemon state keeps public relay TLS separate from daemon relay TLS", async () => {
    const home = await createChisaCodeHome({
      version: 1,
      daemon: {
        relay: {
          endpoint: "10.0.0.5:51185",
          publicEndpoint: "chisacode.example.com",
          useTls: false,
          publicUseTls: true,
        },
      },
    });

    const state = resolveLocalDaemonState({ home });

    expect(state.relayEndpoint).toBe("chisacode.example.com");
    expect(state.relayUseTls).toBe(false);
    expect(state.relayPublicUseTls).toBe(true);
  });
});
