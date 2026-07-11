import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import treeKill from "tree-kill";

const PROCESS_POLL_INTERVAL_MS = 25;

export interface TreeKillTarget {
  pid?: number;
  exitCode?: number | null;
  signalCode?: NodeJS.Signals | null;
  kill(signal?: NodeJS.Signals | number): boolean;
  once?(event: "exit", listener: () => void): unknown;
}

interface TerminateWithTreeKillOptions {
  gracefulSignal?: NodeJS.Signals;
  forceSignal?: NodeJS.Signals;
  gracefulTimeoutMs: number;
  forceTimeoutMs?: number;
  onForceSignal?: () => void;
  operations?: TreeKillOperations;
}

interface TrackedProcess {
  identity: string;
  pid: number;
}

interface TreeKillOperations {
  snapshot(): Promise<TrackedProcess[]>;
  listRunning(processes: readonly TrackedProcess[]): Promise<TrackedProcess[]>;
  signal(processes: readonly TrackedProcess[], signal: NodeJS.Signals): Promise<void>;
  now?: () => number;
  waitForPoll?: (delayMs: number) => Promise<void>;
}

export type TerminateWithTreeKillResult =
  | "already-exited"
  | "terminated"
  | "killed"
  | "kill-timeout";

type TrackedTerminationResult =
  | TerminateWithTreeKillResult
  | "tracking-unavailable"
  | "tracking-unverified";

export async function terminateWithTreeKill(
  child: TreeKillTarget,
  options: TerminateWithTreeKillOptions,
): Promise<TerminateWithTreeKillResult> {
  if (isProcessExited(child) && !options.operations) {
    return "already-exited";
  }

  const trackedResult = await terminateTrackedProcessTree(child, options);
  if (trackedResult !== "tracking-unavailable" && trackedResult !== "tracking-unverified") {
    return trackedResult;
  }

  const fallbackResult = await terminateRootObservedTree(child, options);
  return trackedResult === "tracking-unverified" ? "kill-timeout" : fallbackResult;
}

async function terminateTrackedProcessTree(
  child: TreeKillTarget,
  options: TerminateWithTreeKillOptions,
): Promise<TrackedTerminationResult> {
  const operations = options.operations ?? createDefaultTreeKillOperations(child);
  if (!operations) {
    return "tracking-unavailable";
  }

  let trackedProcesses: TrackedProcess[];
  try {
    trackedProcesses = await operations.snapshot();
  } catch {
    return "tracking-unverified";
  }
  if (trackedProcesses.length === 0) {
    return "tracking-unverified";
  }

  const gracefulSignal = options.gracefulSignal ?? "SIGTERM";
  const forceSignal = options.forceSignal ?? "SIGKILL";
  if (gracefulSignal === forceSignal) {
    options.onForceSignal?.();
    await operations.signal(trackedProcesses, forceSignal);
    if (options.forceTimeoutMs === undefined) {
      return "killed";
    }
    const survivors = await waitForTrackedProcesses(
      operations,
      trackedProcesses,
      options.forceTimeoutMs,
    );
    return survivors.length === 0 ? "killed" : "kill-timeout";
  }

  await operations.signal(trackedProcesses, gracefulSignal);
  let survivors = await waitForTrackedProcesses(
    operations,
    trackedProcesses,
    options.gracefulTimeoutMs,
  );
  if (survivors.length === 0) {
    return "terminated";
  }

  options.onForceSignal?.();
  await operations.signal(survivors, forceSignal);
  if (options.forceTimeoutMs === undefined) {
    return "killed";
  }
  survivors = await waitForTrackedProcesses(operations, survivors, options.forceTimeoutMs);
  return survivors.length === 0 ? "killed" : "kill-timeout";
}

async function terminateRootObservedTree(
  child: TreeKillTarget,
  options: TerminateWithTreeKillOptions,
): Promise<TerminateWithTreeKillResult> {
  if (isProcessExited(child)) {
    return "already-exited";
  }

  const exitPromise = waitForProcessExit(child);
  const gracefulSignal = options.gracefulSignal ?? "SIGTERM";
  const forceSignal = options.forceSignal ?? "SIGKILL";
  if (gracefulSignal === forceSignal) {
    options.onForceSignal?.();
    await signalTreeOrChild(child, forceSignal);
    if (options.forceTimeoutMs === undefined) {
      return "killed";
    }
    return (await waitForExitOrTimeout(exitPromise, options.forceTimeoutMs))
      ? "killed"
      : "kill-timeout";
  }

  await signalTreeOrChild(child, gracefulSignal);
  if (await waitForExitOrTimeout(exitPromise, options.gracefulTimeoutMs)) {
    return "terminated";
  }

  options.onForceSignal?.();
  await signalTreeOrChild(child, forceSignal);
  if (options.forceTimeoutMs === undefined) {
    return "killed";
  }
  return (await waitForExitOrTimeout(exitPromise, options.forceTimeoutMs))
    ? "killed"
    : "kill-timeout";
}

function createDefaultTreeKillOperations(child: TreeKillTarget): TreeKillOperations | null {
  const pid = child.pid;
  if (typeof pid !== "number" || pid <= 0) {
    return null;
  }
  if (process.platform === "win32") {
    const root = { identity: `windows:${pid}`, pid };
    return {
      async snapshot() {
        return [root];
      },
      async listRunning(processes) {
        return processes.filter((process) => isPidRunning(process.pid));
      },
      async signal(_processes, signal) {
        await signalTreeOrChild(child, signal);
      },
    };
  }
  return {
    async snapshot() {
      return snapshotPosixProcessTree(pid);
    },
    async listRunning(processes) {
      return listRunningPosixProcesses(processes);
    },
    async signal(processes, signal) {
      const running = await listRunningPosixProcesses(processes);
      for (const process of running) {
        signalPid(process.pid, signal);
      }
    },
  };
}

async function waitForTrackedProcesses(
  operations: TreeKillOperations,
  processes: readonly TrackedProcess[],
  timeoutMs: number,
): Promise<TrackedProcess[]> {
  const now = operations.now ?? Date.now;
  const waitForPoll = operations.waitForPoll ?? waitForProcessPoll;
  const deadline = now() + Math.max(0, timeoutMs);
  let survivors = await operations.listRunning(processes);
  while (survivors.length > 0) {
    const remainingMs = deadline - now();
    if (remainingMs <= 0) {
      break;
    }
    await waitForPoll(Math.min(PROCESS_POLL_INTERVAL_MS, remainingMs));
    survivors = await operations.listRunning(survivors);
  }
  return survivors;
}

function waitForProcessPoll(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

async function snapshotPosixProcessTree(rootPid: number): Promise<TrackedProcess[]> {
  if (process.platform === "linux") {
    return snapshotLinuxProcessTree(rootPid);
  }

  const processTable = await readPsProcessTableWithIdentity();
  if (!processTable.has(rootPid)) {
    return [];
  }
  const trackedPids = collectProcessTreePids(rootPid, processTable);
  return trackedPids.flatMap((pid) => {
    const process = processTable.get(pid);
    return process ? [{ identity: process.identity, pid }] : [];
  });
}

async function snapshotLinuxProcessTree(rootPid: number): Promise<TrackedProcess[]> {
  const processTable = await readPosixProcessTopology();
  if (!processTable.has(rootPid)) {
    return [];
  }
  const tracked: TrackedProcess[] = [];
  for (const pid of collectProcessTreePids(rootPid, processTable)) {
    const process = await readLinuxProcessRecord(pid);
    const expectedParentPid = processTable.get(pid)?.parentPid;
    if (!process || process.parentPid !== expectedParentPid) {
      throw new Error(`Process ${pid} changed while its tree was being captured`);
    }
    tracked.push({ identity: process.identity, pid });
  }
  return tracked;
}

function collectProcessTreePids(
  rootPid: number,
  processTable: ReadonlyMap<number, { parentPid: number }>,
): number[] {
  const childrenByParent = new Map<number, number[]>();
  for (const [pid, process] of processTable) {
    const children = childrenByParent.get(process.parentPid) ?? [];
    children.push(pid);
    childrenByParent.set(process.parentPid, children);
  }

  const tracked: number[] = [];
  const visit = (pid: number): void => {
    for (const childPid of childrenByParent.get(pid) ?? []) {
      visit(childPid);
    }
    tracked.push(pid);
  };
  visit(rootPid);
  return tracked;
}

async function listRunningPosixProcesses(
  processes: readonly TrackedProcess[],
): Promise<TrackedProcess[]> {
  if (process.platform === "linux") {
    return listRunningLinuxProcesses(processes);
  }

  let processTable: Map<number, PosixProcessRecord>;
  try {
    processTable = await readPsProcessTableWithIdentity();
  } catch {
    return [...processes];
  }
  return processes.filter((process) => {
    return processTable.get(process.pid)?.identity === process.identity;
  });
}

async function listRunningLinuxProcesses(
  processes: readonly TrackedProcess[],
): Promise<TrackedProcess[]> {
  const running: TrackedProcess[] = [];
  for (const process of processes) {
    try {
      const current = await readLinuxProcessRecord(process.pid);
      if (current?.identity === process.identity) {
        running.push(process);
      }
    } catch {
      running.push(process);
    }
  }
  return running;
}

interface PosixProcessRecord {
  identity: string;
  parentPid: number;
  pid: number;
}

async function readPosixProcessTopology(): Promise<Map<number, PosixProcessRecord>> {
  const stdout = await execFileText("ps", ["-eo", "pid=,ppid="]);
  const processTable = new Map<number, PosixProcessRecord>();
  for (const line of stdout.split(/\r?\n/u)) {
    const match = /^\s*(\d+)\s+(\d+)\s*$/u.exec(line);
    if (!match) {
      continue;
    }
    const pid = Number.parseInt(match[1] ?? "", 10);
    const parentPid = Number.parseInt(match[2] ?? "", 10);
    if (pid > 0 && parentPid >= 0) {
      processTable.set(pid, { identity: "", parentPid, pid });
    }
  }
  return processTable;
}

async function readPsProcessTableWithIdentity(): Promise<Map<number, PosixProcessRecord>> {
  // macOS has no procfs starttime. `lstart` is only second-resolution, so identity checks there
  // remain best-effort; bounded polling and post-order signaling keep the reuse window small.
  const args =
    process.platform === "darwin" ? ["-axo", "pid=,ppid=,lstart="] : ["-eo", "pid=,ppid=,lstart="];
  const stdout = await execFileText("ps", args);
  const processTable = new Map<number, PosixProcessRecord>();
  for (const line of stdout.split(/\r?\n/u)) {
    const match = /^\s*(\d+)\s+(\d+)\s+(.+?)\s*$/u.exec(line);
    if (!match) {
      continue;
    }
    const pid = Number.parseInt(match[1] ?? "", 10);
    const parentPid = Number.parseInt(match[2] ?? "", 10);
    const identity = match[3] ?? "";
    if (pid > 0 && parentPid >= 0 && identity) {
      processTable.set(pid, { identity, parentPid, pid });
    }
  }
  return processTable;
}

async function readLinuxProcessRecord(pid: number): Promise<PosixProcessRecord | null> {
  let value: string;
  try {
    value = await readFile(`/proc/${pid}/stat`, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ESRCH") {
      return null;
    }
    throw error;
  }
  const process = parseLinuxProcStat(pid, value);
  if (!process) {
    throw new Error(`Unable to parse /proc/${pid}/stat`);
  }
  return process;
}

/**
 * Parses stable Linux process identity fields from `/proc/<pid>/stat`.
 * @param pid Expected process ID from the procfs directory name
 * @param value Raw procfs stat record
 * @returns The process record, or null when the record is malformed
 */
export function parseLinuxProcStat(pid: number, value: string): PosixProcessRecord | null {
  const commandStart = value.indexOf("(");
  const commandEnd = value.lastIndexOf(")");
  if (commandStart <= 0 || commandEnd <= commandStart) {
    return null;
  }
  const parsedPid = Number.parseInt(value.slice(0, commandStart).trim(), 10);
  const fields = value
    .slice(commandEnd + 1)
    .trim()
    .split(/\s+/u);
  const parentPid = Number.parseInt(fields[1] ?? "", 10);
  const startTime = fields[19];
  if (parsedPid !== pid || parentPid < 0 || !startTime || !/^\d+$/u.test(startTime)) {
    return null;
  }
  return {
    identity: `linux-starttime:${startTime}`,
    parentPid,
    pid,
  };
}

function execFileText(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout);
    });
  });
}

function isPidRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function signalPid(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(pid, signal);
  } catch {
    // Ignore cleanup races.
  }
}

function signalTreeOrChild(child: TreeKillTarget, signal: NodeJS.Signals): Promise<void> {
  if (isProcessExited(child)) {
    return Promise.resolve();
  }

  const pid = child.pid;
  if (typeof pid !== "number" || pid <= 0) {
    signalDirectChild(child, signal);
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    treeKill(pid, signal, (error) => {
      if (error) {
        signalDirectChild(child, signal);
      }
      resolve();
    });
  });
}

function signalDirectChild(child: TreeKillTarget, signal: NodeJS.Signals): void {
  try {
    child.kill(signal);
  } catch {
    // Ignore cleanup races.
  }
}

function isProcessExited(child: TreeKillTarget): boolean {
  return (
    (child.exitCode !== null && child.exitCode !== undefined) ||
    (child.signalCode !== null && child.signalCode !== undefined)
  );
}

function waitForProcessExit(child: TreeKillTarget): Promise<void> {
  if (isProcessExited(child)) {
    return Promise.resolve();
  }
  if (!child.once) {
    return new Promise(() => undefined);
  }

  return new Promise((resolve) => {
    child.once?.("exit", resolve);
  });
}

async function waitForExitOrTimeout(
  exitPromise: Promise<void>,
  timeoutMs: number,
): Promise<boolean> {
  let timer: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      exitPromise.then(() => true),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
