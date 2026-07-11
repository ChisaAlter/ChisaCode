import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

import { buildSelfNodeCommand } from "../server/chisacode-env.js";
import { execCommand, platformShell, spawnProcess } from "./spawn.js";

const printEnvScript = `
const keys = [
  "CUSTOM",
  "ELECTRON_NO_ATTACH_CONSOLE",
  "ELECTRON_RUN_AS_NODE",
  "CHISACODE_DESKTOP_MANAGED",
  "CHISACODE_NODE_ENV",
  "CHISACODE_SUPERVISED",
];
const values = Object.fromEntries(keys.map((key) => [key, process.env[key] ?? null]));
console.log(JSON.stringify(values));
`;

function parsePrintedEnv(stdout: string): Record<string, string | null> {
  return JSON.parse(stdout.trim()) as Record<string, string | null>;
}

describe("execCommand", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const tempDir of tempDirs) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  test("returns stdout and stderr for a successful command", async () => {
    const result = await execCommand("echo", ["hello"]);

    expect(result.stdout.trim()).toBe("hello");
    expect(result.stderr).toBe("");
  });

  test("closes readiness watcher when the command exits before the marker", async () => {
    const cwd = realpathSync(mkdtempSync(path.join(tmpdir(), "spawn-readiness-test-")));
    tempDirs.push(cwd);
    const commandError = new Error("command exited before readiness");

    await expect(
      waitForPathCreation(path.join(cwd, "missing.pid"), Promise.reject(commandError)),
    ).rejects.toBe(commandError);
  });

  test("times out a command tree launched through the platform shell", async () => {
    const cwd = realpathSync(mkdtempSync(path.join(tmpdir(), "spawn-timeout-test-")));
    tempDirs.push(cwd);
    const fixture = createShellTreeFixture(cwd);
    const shell = platformShell();
    const commandPromise = execCommand(shell.command, [...shell.flag, fixture.command], {
      cwd,
      timeout: 2_000,
    });
    let ownerPid: number | null = null;
    let grandchildPid: number | null = null;

    try {
      await waitForPathCreation(fixture.grandchildPidPath, commandPromise);
      ownerPid = readPid(fixture.ownerPidPath);
      grandchildPid = readPid(fixture.grandchildPidPath);
      expect(isProcessRunning(ownerPid)).toBe(true);
      expect(isProcessRunning(grandchildPid)).toBe(true);

      const error = await commandPromise.then(
        () => new Error("Expected command to reject"),
        (reason: unknown) =>
          reason as Error & { code?: string; stderr?: string; stdout?: string; timeoutMs?: number },
      );

      await vi.waitFor(
        () => {
          expect(isProcessRunning(ownerPid)).toBe(false);
          expect(isProcessRunning(grandchildPid)).toBe(false);
        },
        { timeout: 5_000 },
      );
      expect(error).toMatchObject({
        name: "ExecCommandTimeoutError",
        code: "EXEC_COMMAND_TIMEOUT",
        timeoutMs: 2_000,
      });
    } finally {
      await commandPromise.catch(() => {});
      killIfRunning(grandchildPid);
      killIfRunning(ownerPid);
      await waitForProcessesStopped([ownerPid, grandchildPid]);
    }
  }, 15_000);

  test("preserves nonzero exit details", async () => {
    const error = await execCommand(process.execPath, [
      "-e",
      'console.error("failure"); process.exit(7);',
    ]).then(
      () => new Error("Expected command to reject"),
      (reason: unknown) => reason as Error & { code?: number; stdout?: string; stderr?: string },
    );

    expect(error.code).toBe(7);
    expect(error.stdout).toBe("");
    expect(error.stderr?.trim()).toBe("failure");
  });

  test("rejects when stdout exceeds maxBuffer", async () => {
    await expect(
      execCommand(process.execPath, ["-e", 'process.stdout.write("x".repeat(2048));'], {
        maxBuffer: 1024,
      }),
    ).rejects.toMatchObject({ code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" });
  });

  test("aborts a command tree launched through the platform shell", async () => {
    const cwd = realpathSync(mkdtempSync(path.join(tmpdir(), "spawn-signal-test-")));
    tempDirs.push(cwd);
    const fixture = createShellTreeFixture(cwd);
    const shell = platformShell();
    const controller = new AbortController();
    const commandPromise = execCommand(shell.command, [...shell.flag, fixture.command], {
      cwd,
      signal: controller.signal,
      timeout: 10_000,
    });
    let ownerPid: number | null = null;
    let grandchildPid: number | null = null;

    try {
      await waitForPathCreation(fixture.grandchildPidPath, commandPromise);
      ownerPid = readPid(fixture.ownerPidPath);
      grandchildPid = readPid(fixture.grandchildPidPath);
      expect(isProcessRunning(ownerPid)).toBe(true);
      expect(isProcessRunning(grandchildPid)).toBe(true);

      controller.abort(new Error("stop requested"));

      await expect(commandPromise).rejects.toMatchObject({
        name: "AbortError",
        code: "ABORT_ERR",
      });
      await vi.waitFor(
        () => {
          expect(isProcessRunning(ownerPid)).toBe(false);
          expect(isProcessRunning(grandchildPid)).toBe(false);
        },
        { timeout: 5_000 },
      );
    } finally {
      controller.abort(new Error("test cleanup"));
      await commandPromise.catch(() => {});
      killIfRunning(grandchildPid);
      killIfRunning(ownerPid);
      await waitForProcessesStopped([ownerPid, grandchildPid]);
    }
  }, 15_000);

  test("runs the command in the provided cwd", async () => {
    const cwd = realpathSync(mkdtempSync(path.join(tmpdir(), "spawn-test-")));
    tempDirs.push(cwd);

    const command =
      process.platform === "win32"
        ? {
            command: process.execPath,
            args: ["-e", "console.log(process.cwd())"],
          }
        : { command: "pwd", args: [] };

    const result = await execCommand(command.command, command.args, { cwd });

    expect(realpathSync(result.stdout.trim())).toBe(cwd);
    expect(result.stderr).toBe("");
  });

  test("treats env as the replacement base and finalizes external command env", async () => {
    const result = await execCommand(process.execPath, ["-e", printEnvScript], {
      baseEnv: {
        ELECTRON_RUN_AS_NODE: "0",
        CUSTOM: "from-base",
        PATH: process.env.PATH,
        CHISACODE_NODE_ENV: "production",
        CHISACODE_SUPERVISED: "1",
      },
      env: {
        CUSTOM: "from-env",
        ELECTRON_NO_ATTACH_CONSOLE: "1",
        CHISACODE_DESKTOP_MANAGED: "1",
        CHISACODE_NODE_ENV: "test",
      },
      envOverlay: {
        CUSTOM: "from-overlay",
        ELECTRON_RUN_AS_NODE: undefined,
      },
    });

    expect(parsePrintedEnv(result.stdout)).toEqual({
      CUSTOM: "from-overlay",
      ELECTRON_NO_ATTACH_CONSOLE: null,
      ELECTRON_RUN_AS_NODE: null,
      CHISACODE_DESKTOP_MANAGED: null,
      CHISACODE_NODE_ENV: null,
      CHISACODE_SUPERVISED: null,
    });
  });

  test("does not inherit process.env when env replacement is supplied", async () => {
    process.env.CHISACODE_TEST_SHOULD_NOT_LEAK = "leaked";
    try {
      const result = await execCommand(
        process.execPath,
        [
          "-e",
          "console.log(JSON.stringify({ leaked: process.env.CHISACODE_TEST_SHOULD_NOT_LEAK ?? null }))",
        ],
        {
          env: {
            PATH: process.env.PATH,
          },
        },
      );

      expect(JSON.parse(result.stdout.trim())).toEqual({ leaked: null });
    } finally {
      delete process.env.CHISACODE_TEST_SHOULD_NOT_LEAK;
    }
  });

  test("spawnProcess finalizes external command env", async () => {
    const child = spawnProcess(process.execPath, ["-e", printEnvScript], {
      baseEnv: {
        ELECTRON_RUN_AS_NODE: "0",
        PATH: process.env.PATH,
        CHISACODE_NODE_ENV: "production",
      },
      envOverlay: {
        CUSTOM: "spawn-overlay",
        CHISACODE_SUPERVISED: "1",
      },
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    child.stdout?.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr?.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    const exitCode = await new Promise<number | null>((resolve, reject) => {
      child.on("error", reject);
      child.on("close", resolve);
    });

    expect(Buffer.concat(stderrChunks).toString()).toBe("");
    expect(exitCode).toBe(0);
    expect(parsePrintedEnv(Buffer.concat(stdoutChunks).toString())).toEqual({
      CUSTOM: "spawn-overlay",
      ELECTRON_NO_ATTACH_CONSOLE: null,
      ELECTRON_RUN_AS_NODE: null,
      CHISACODE_DESKTOP_MANAGED: null,
      CHISACODE_NODE_ENV: null,
      CHISACODE_SUPERVISED: null,
    });
  });

  test("internal env mode preserves ChisaCode-owned launcher env", async () => {
    const result = await execCommand(process.execPath, ["-e", printEnvScript], {
      envMode: "internal",
      baseEnv: {
        ELECTRON_RUN_AS_NODE: "1",
        PATH: process.env.PATH,
        CHISACODE_NODE_ENV: "production",
      },
      envOverlay: {
        CUSTOM: "internal",
        CHISACODE_SUPERVISED: "1",
      },
    });

    expect(parsePrintedEnv(result.stdout)).toEqual({
      CUSTOM: "internal",
      ELECTRON_NO_ATTACH_CONSOLE: null,
      ELECTRON_RUN_AS_NODE: "1",
      CHISACODE_DESKTOP_MANAGED: null,
      CHISACODE_NODE_ENV: "production",
      CHISACODE_SUPERVISED: "1",
    });
  });

  test("does not realpath commands while finalizing external command env", async () => {
    const realpathSpy = vi.spyOn(fs.realpathSync, "native");

    await execCommand("/some/random/binary", ["--version"], {
      env: {
        PATH: process.env.PATH,
      },
      timeout: 100,
    }).catch(() => {});

    expect(realpathSpy).not.toHaveBeenCalled();
  });

  test("self node command explicitly enables Electron node mode", async () => {
    const command = buildSelfNodeCommand(["-e", printEnvScript], {
      CUSTOM: "from-helper",
    });

    const result = await execCommand(command.command, command.args, {
      env: command.env,
      envMode: "internal",
    });

    expect(parsePrintedEnv(result.stdout)).toEqual({
      CUSTOM: "from-helper",
      ELECTRON_NO_ATTACH_CONSOLE: null,
      ELECTRON_RUN_AS_NODE: "1",
      CHISACODE_DESKTOP_MANAGED: null,
      CHISACODE_NODE_ENV: null,
      CHISACODE_SUPERVISED: null,
    });
  });
});

interface ShellTreeFixture {
  command: string;
  ownerPidPath: string;
  grandchildPidPath: string;
}

function createShellTreeFixture(cwd: string): ShellTreeFixture {
  const ownerScriptPath = path.join(cwd, "owner.cjs");
  const grandchildScriptPath = path.join(cwd, "grandchild.cjs");
  const ownerPidPath = path.join(cwd, "owner.pid");
  const grandchildPidPath = path.join(cwd, "grandchild.pid");
  writeFileSync(
    grandchildScriptPath,
    [
      'const fs = require("node:fs");',
      'const net = require("node:net");',
      "const server = net.createServer();",
      `server.listen(0, "127.0.0.1", () => fs.writeFileSync(${JSON.stringify(grandchildPidPath)}, String(process.pid)));`,
    ].join("\n"),
  );
  writeFileSync(
    ownerScriptPath,
    [
      'const { spawn } = require("node:child_process");',
      'const fs = require("node:fs");',
      `fs.writeFileSync(${JSON.stringify(ownerPidPath)}, String(process.pid));`,
      `const grandchild = spawn(process.execPath, [${JSON.stringify(grandchildScriptPath)}], { stdio: "ignore" });`,
      'grandchild.once("error", (error) => { console.error(error); process.exit(1); });',
      "process.stdin.resume();",
    ].join("\n"),
  );
  return {
    command: `${path.basename(process.execPath)} ${path.basename(ownerScriptPath)}`,
    ownerPidPath,
    grandchildPidPath,
  };
}

function readPid(target: string): number {
  return Number.parseInt(readFileSync(target, "utf8").trim(), 10);
}

function isProcessRunning(pid: number | null): boolean {
  if (pid === null || !Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function killIfRunning(pid: number | null): void {
  if (!isProcessRunning(pid)) {
    return;
  }
  try {
    process.kill(pid!, "SIGKILL");
  } catch {
    // Ignore cleanup races.
  }
}

async function waitForProcessesStopped(pids: Array<number | null>): Promise<void> {
  await vi.waitFor(
    () => {
      expect(pids.map(isProcessRunning)).toEqual(pids.map(() => false));
    },
    { timeout: 5_000 },
  );
}

function waitForPathCreation(target: string, commandPromise: Promise<unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const watcher = fs.watch(path.dirname(target));
    const finish = (settle: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      watcher.close();
      settle();
    };
    const finishIfReady = () => {
      if (!fs.existsSync(target)) {
        return;
      }
      finish(resolve);
    };
    watcher.on("change", finishIfReady);
    watcher.on("error", (error) => {
      finish(() => reject(error));
    });
    void commandPromise.then(
      () => {
        return finish(() =>
          reject(new Error(`Command exited before ${path.basename(target)} was ready`)),
        );
      },
      (error: unknown) => {
        return finish(() => reject(error instanceof Error ? error : new Error(String(error))));
      },
    );
    finishIfReady();
  });
}
