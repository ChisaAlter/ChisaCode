import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  parseLinuxProcStat,
  parseWindowsProcessRecord,
  refreshTrackedPosixProcess,
  resolveWindowsProcessQueryTimeout,
  terminateWithTreeKill,
} from "./tree-kill.js";

let tempDir: string | null = null;
let ownerProcess: ChildProcess | null = null;
let descendantPid: number | null = null;

function isProcessRunning(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitFor(
  check: () => Promise<boolean> | boolean,
  timeoutMs: number,
  message: string,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  async function poll(): Promise<void> {
    if (await check()) return;
    if (Date.now() >= deadline) throw new Error(message);
    await new Promise((resolve) => setImmediate(resolve));
    return poll();
  }
  return poll();
}

async function readPidFileNumber(filePath: string): Promise<number | null> {
  try {
    const raw = (await readFile(filePath, "utf-8")).trim();
    const pid = Number.parseInt(raw, 10);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function killIfRunning(pid: number | null | undefined): void {
  if (!pid || !isProcessRunning(pid)) return;
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // Ignore cleanup races.
  }
}

function spawnOwnerWithDescendant(options: {
  childPidPath: string;
  detachedDescendant: boolean;
}): ChildProcess {
  const descendantOptions = options.detachedDescendant
    ? '{ detached: true, stdio: "ignore" }'
    : '{ stdio: "ignore" }';
  const childUnref = options.detachedDescendant ? "child.unref();" : "";

  return spawn(
    process.execPath,
    [
      "-e",
      `
        const { spawn } = require("node:child_process");
        process.on("SIGTERM", () => {});
        const child = spawn(process.execPath, [
          "-e",
          ${JSON.stringify(`
            const fs = require("node:fs");
            process.on("SIGTERM", () => {});
            fs.writeFileSync(${JSON.stringify(options.childPidPath)}, String(process.pid));
            setInterval(() => {}, 1000);
          `)}
        ], ${descendantOptions});
        ${childUnref}
        setInterval(() => {}, 1000);
      `,
    ],
    { stdio: "ignore" },
  );
}

async function waitForFixtureReady(childPidPath: string): Promise<void> {
  await waitFor(
    async () => {
      descendantPid = await readPidFileNumber(childPidPath);
      return (
        isProcessRunning(ownerProcess?.pid ?? -1) &&
        descendantPid !== null &&
        isProcessRunning(descendantPid)
      );
    },
    5000,
    "owner descendant did not become running in time",
  );
}

async function expectOwnerAndDescendantStopped(message: string): Promise<void> {
  await waitFor(
    () => !isProcessRunning(ownerProcess?.pid ?? -1) && !isProcessRunning(descendantPid ?? -1),
    5000,
    message,
  );
}

afterEach(async () => {
  killIfRunning(ownerProcess?.pid);
  killIfRunning(descendantPid);
  ownerProcess = null;
  descendantPid = null;

  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

describe("terminateWithTreeKill", () => {
  test("distinguishes Linux processes that reuse a PID within one second", () => {
    const original = parseLinuxProcStat(42, createLinuxProcStat(7_001));
    const reused = parseLinuxProcStat(42, createLinuxProcStat(7_002));

    expect(original).toEqual({
      identity: "linux-starttime:7001",
      parentPid: 1,
      pid: 42,
      processGroupId: 42,
    });
    expect(reused).toEqual({
      identity: "linux-starttime:7002",
      parentPid: 1,
      pid: 42,
      processGroupId: 42,
    });
  });

  test("distinguishes reused Windows PIDs by CreationDate", () => {
    const original = parseWindowsProcessRecord({
      CreationDate: "/Date(7001)/",
      ParentProcessId: 1,
      ProcessId: 42,
    });
    const reused = parseWindowsProcessRecord({
      CreationDate: "/Date(7002)/",
      ParentProcessId: 1,
      ProcessId: 42,
    });

    expect(original).toEqual({
      creationTimeMs: 7_001,
      identity: "windows-creation:7001",
      parentPid: 1,
      pid: 42,
    });
    expect(reused).toEqual({
      creationTimeMs: 7_002,
      identity: "windows-creation:7002",
      parentPid: 1,
      pid: 42,
    });
  });

  test("refreshes a tracked POSIX process that moved to another process group", () => {
    const tracked = parseLinuxProcStat(42, createLinuxProcStat(7_001, 42));
    const moved = parseLinuxProcStat(42, createLinuxProcStat(7_001, 99));

    expect(tracked).not.toBeNull();
    expect(moved).not.toBeNull();
    expect(refreshTrackedPosixProcess(tracked!, moved)).toEqual({
      identity: "linux-starttime:7001",
      pid: 42,
      processGroupId: 99,
    });
  });

  test("bounds each Windows process query by the shared cleanup deadline", () => {
    expect(resolveWindowsProcessQueryTimeout(10_000, 7_500)).toBe(2_500);
    expect(() => resolveWindowsProcessQueryTimeout(10_000, 10_000)).toThrow(
      expect.objectContaining({ code: "EXEC_COMMAND_PROCESS_QUERY_TIMEOUT" }),
    );
  });

  test("sends a matching graceful and force signal only once", async () => {
    interface TrackedProcess {
      identity: string;
      pid: number;
    }
    interface TestOperations {
      listRunning(processes: readonly TrackedProcess[]): Promise<TrackedProcess[]>;
      signal(processes: readonly TrackedProcess[], signal: NodeJS.Signals): Promise<void>;
      snapshot(): Promise<TrackedProcess[]>;
    }

    const root = { identity: "root-start", pid: 100 };
    const signals: NodeJS.Signals[] = [];
    const child = {
      exitCode: null,
      signalCode: null,
      kill() {
        return true;
      },
    };
    const operations: TestOperations = {
      async snapshot() {
        return [root];
      },
      async listRunning(processes) {
        return [...processes];
      },
      async signal(_processes, signal) {
        signals.push(signal);
      },
    };
    const options = {
      gracefulSignal: "SIGKILL",
      forceSignal: "SIGKILL",
      gracefulTimeoutMs: 0,
      forceTimeoutMs: 0,
      operations,
    } as Parameters<typeof terminateWithTreeKill>[1] & { operations: TestOperations };

    const result = await terminateWithTreeKill(child, options);

    expect(result).toBe("kill-timeout");
    expect(signals).toEqual(["SIGKILL"]);
  });

  test("sends a matching signal once when process tracking is unavailable", async () => {
    const signals: Array<NodeJS.Signals | number> = [];
    const child = {
      exitCode: null,
      signalCode: null,
      kill(signal: NodeJS.Signals | number = "SIGTERM") {
        signals.push(signal);
        return true;
      },
    };

    const result = await terminateWithTreeKill(child, {
      gracefulSignal: "SIGKILL",
      forceSignal: "SIGKILL",
      gracefulTimeoutMs: 0,
      forceTimeoutMs: 0,
    });

    expect(result).toBe("kill-timeout");
    expect(signals).toEqual(["SIGKILL"]);
  });

  test("polls tracked processes at a bounded interval", async () => {
    interface TrackedProcess {
      identity: string;
      pid: number;
    }
    interface TestOperations {
      listRunning(processes: readonly TrackedProcess[]): Promise<TrackedProcess[]>;
      now(): number;
      signal(processes: readonly TrackedProcess[], signal: NodeJS.Signals): Promise<void>;
      snapshot(): Promise<TrackedProcess[]>;
      waitForPoll(delayMs: number): Promise<void>;
    }

    const root = { identity: "root-start", pid: 100 };
    const pollDelays: number[] = [];
    let now = 0;
    const child = {
      exitCode: null,
      signalCode: null,
      kill() {
        return true;
      },
    };
    const operations: TestOperations = {
      async snapshot() {
        return [root];
      },
      async listRunning(processes) {
        return [...processes];
      },
      async signal() {},
      now() {
        return now;
      },
      async waitForPoll(delayMs) {
        pollDelays.push(delayMs);
        now += delayMs;
      },
    };
    const options = {
      gracefulTimeoutMs: 40,
      forceTimeoutMs: 0,
      operations,
    } as Parameters<typeof terminateWithTreeKill>[1] & { operations: TestOperations };

    await expect(terminateWithTreeKill(child, options)).resolves.toBe("kill-timeout");
    expect(pollDelays).toEqual([25, 15]);
  });

  test("does not report tree termination when the process snapshot fails", async () => {
    interface TrackedProcess {
      identity: string;
      pid: number;
    }
    interface TestOperations {
      listRunning(processes: readonly TrackedProcess[]): Promise<TrackedProcess[]>;
      signal(processes: readonly TrackedProcess[], signal: NodeJS.Signals): Promise<void>;
      snapshot(): Promise<TrackedProcess[]>;
    }

    const signals: Array<NodeJS.Signals | number> = [];
    let exitListener: (() => void) | null = null;
    const child = {
      exitCode: null as number | null,
      signalCode: null as NodeJS.Signals | null,
      kill(signal: NodeJS.Signals | number = "SIGTERM") {
        signals.push(signal);
        this.exitCode = 0;
        exitListener?.();
        return true;
      },
      once(_event: "exit", listener: () => void) {
        exitListener = listener;
      },
    };
    const operations: TestOperations = {
      async snapshot() {
        throw new Error("process table unavailable");
      },
      async listRunning(processes) {
        return [...processes];
      },
      async signal() {},
    };
    const options = {
      gracefulTimeoutMs: 0,
      forceTimeoutMs: 0,
      operations,
    } as Parameters<typeof terminateWithTreeKill>[1] & { operations: TestOperations };

    const result = await terminateWithTreeKill(child, options);

    expect(result).toBe("kill-timeout");
    expect(signals).toEqual(["SIGTERM"]);
  });

  test("returns kill-timeout when tracked signaling cannot revalidate process identity", async () => {
    interface TrackedProcess {
      identity: string;
      pid: number;
    }
    interface TestOperations {
      listRunning(processes: readonly TrackedProcess[]): Promise<TrackedProcess[]>;
      signal(processes: readonly TrackedProcess[], signal: NodeJS.Signals): Promise<void>;
      snapshot(): Promise<TrackedProcess[]>;
    }

    const root = { identity: "root-start", pid: 100 };
    const fallbackSignals: Array<NodeJS.Signals | number> = [];
    let exitListener: (() => void) | null = null;
    const child = {
      exitCode: null as number | null,
      signalCode: null as NodeJS.Signals | null,
      kill(signal: NodeJS.Signals | number = "SIGTERM") {
        fallbackSignals.push(signal);
        this.exitCode = 0;
        exitListener?.();
        return true;
      },
      once(_event: "exit", listener: () => void) {
        exitListener = listener;
      },
    };
    const operations: TestOperations = {
      async snapshot() {
        return [root];
      },
      async listRunning(processes) {
        return [...processes];
      },
      async signal() {
        throw new Error("process identity query failed");
      },
    };
    const options = {
      gracefulTimeoutMs: 0,
      forceTimeoutMs: 0,
      operations,
    } as Parameters<typeof terminateWithTreeKill>[1] & { operations: TestOperations };

    await expect(terminateWithTreeKill(child, options)).resolves.toBe("kill-timeout");
    expect(fallbackSignals).toEqual(["SIGTERM"]);
  });

  test("force-kills a tracked descendant after the root exits gracefully", async () => {
    interface TrackedProcess {
      identity: string;
      pid: number;
    }
    interface TestOperations {
      listRunning(processes: readonly TrackedProcess[]): Promise<TrackedProcess[]>;
      signal(processes: readonly TrackedProcess[], signal: NodeJS.Signals): Promise<void>;
      snapshot(): Promise<TrackedProcess[]>;
    }

    const root = { identity: "root-start", pid: 100 };
    const grandchild = { identity: "grandchild-start", pid: 101 };
    const running = new Set([root.pid, grandchild.pid]);
    const signals: Array<{ pids: number[]; signal: NodeJS.Signals }> = [];
    let exitListener: (() => void) | null = null;
    const child = {
      exitCode: null as number | null,
      signalCode: null as NodeJS.Signals | null,
      kill(signal: NodeJS.Signals | number = "SIGTERM") {
        if (signal === "SIGTERM") {
          running.delete(root.pid);
          this.exitCode = 0;
          exitListener?.();
        }
        return true;
      },
      once(_event: "exit", listener: () => void) {
        exitListener = listener;
      },
    };
    const operations: TestOperations = {
      async snapshot() {
        return [grandchild, root];
      },
      async listRunning(processes) {
        return processes.filter((process) => running.has(process.pid));
      },
      async signal(processes, signal) {
        signals.push({ pids: processes.map((process) => process.pid), signal });
        if (signal === "SIGTERM") {
          running.delete(root.pid);
          child.exitCode = 0;
          exitListener?.();
          return;
        }
        for (const process of processes) {
          running.delete(process.pid);
        }
      },
    };
    const options = {
      gracefulTimeoutMs: 0,
      forceTimeoutMs: 0,
      operations,
    } as Parameters<typeof terminateWithTreeKill>[1] & { operations: TestOperations };

    const result = await terminateWithTreeKill(child, options);

    expect(result).toBe("killed");
    expect(signals).toEqual([
      { pids: [grandchild.pid, root.pid], signal: "SIGTERM" },
      { pids: [grandchild.pid], signal: "SIGKILL" },
    ]);
    expect(Array.from(running)).toEqual([]);
  });

  test.runIf(process.platform === "win32")(
    "kills Windows descendants through taskkill tree cleanup",
    async () => {
      tempDir = await mkdtemp(join(tmpdir(), "chisacode-server-tree-kill-"));
      const childPidPath = join(tempDir, "descendant.pid");

      ownerProcess = spawnOwnerWithDescendant({
        childPidPath,
        detachedDescendant: false,
      });
      expect(ownerProcess.pid).toBeTypeOf("number");
      await waitForFixtureReady(childPidPath);

      const result = await terminateWithTreeKill(ownerProcess, {
        gracefulTimeoutMs: 2000,
        forceTimeoutMs: 2000,
      });

      // tree-kill uses taskkill /T /F on Windows, so the first signal is already forceful.
      expect(result).toBe("terminated");
      await expectOwnerAndDescendantStopped(
        "owner or Windows descendant survived terminateWithTreeKill",
      );
    },
  );

  test.runIf(process.platform !== "win32")(
    "force-kills descendants that started their own process group",
    async () => {
      tempDir = await mkdtemp(join(tmpdir(), "chisacode-server-tree-kill-"));
      const childPidPath = join(tempDir, "descendant.pid");

      ownerProcess = spawnOwnerWithDescendant({
        childPidPath,
        detachedDescendant: true,
      });
      expect(ownerProcess.pid).toBeTypeOf("number");
      await waitForFixtureReady(childPidPath);

      const result = await terminateWithTreeKill(ownerProcess, {
        gracefulTimeoutMs: 100,
        forceTimeoutMs: 2000,
      });

      expect(result).toBe("killed");
      await expectOwnerAndDescendantStopped(
        "owner or separate-process-group descendant survived terminateWithTreeKill",
      );
    },
  );
});

function createLinuxProcStat(startTime: number, processGroupId = 42): string {
  const fieldsBeforeStartTime = [
    "S",
    "1",
    String(processGroupId),
    ...Array.from({ length: 16 }, () => "0"),
  ];
  return `42 (worker with ) in name) ${[...fieldsBeforeStartTime, String(startTime)].join(" ")}`;
}
