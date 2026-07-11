import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import treeKill from "tree-kill";

const PROCESS_POLL_INTERVAL_MS = 25;
const WINDOWS_PROCESS_QUERY_TIMEOUT_MS = 5_000;
const WINDOWS_PROCESS_QUERY_BUDGET_MS = 8_000;
const WINDOWS_CREATION_TIME_TOLERANCE_MS = 1_000;

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
  ownership?: TreeKillOwnership;
}

interface TrackedProcess {
  identity: string;
  pid: number;
  processGroupId?: number;
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

export interface TreeKillOwnership {
  launchedAtMs: number;
  processGroupId?: number;
  rootPid: number;
}

type TrackedTerminationResult =
  | TerminateWithTreeKillResult
  | "tracking-unavailable"
  | "tracking-unverified";

export async function terminateWithTreeKill(
  child: TreeKillTarget,
  options: TerminateWithTreeKillOptions,
): Promise<TerminateWithTreeKillResult> {
  if (isProcessExited(child) && !options.operations && !options.ownership) {
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
  const operations =
    options.operations ?? createDefaultTreeKillOperations(child, options.ownership);
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
    return options.ownership ? "already-exited" : "tracking-unverified";
  }

  const gracefulSignal = options.gracefulSignal ?? "SIGTERM";
  const forceSignal = options.forceSignal ?? "SIGKILL";
  if (gracefulSignal === forceSignal) {
    options.onForceSignal?.();
    try {
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
    } catch {
      return "tracking-unverified";
    }
  }

  let survivors: TrackedProcess[];
  try {
    await operations.signal(trackedProcesses, gracefulSignal);
    survivors = await waitForTrackedProcesses(
      operations,
      trackedProcesses,
      options.gracefulTimeoutMs,
    );
  } catch {
    return "tracking-unverified";
  }
  if (survivors.length === 0) {
    return "terminated";
  }

  options.onForceSignal?.();
  try {
    await operations.signal(survivors, forceSignal);
    if (options.forceTimeoutMs === undefined) {
      return "killed";
    }
    survivors = await waitForTrackedProcesses(operations, survivors, options.forceTimeoutMs);
    return survivors.length === 0 ? "killed" : "kill-timeout";
  } catch {
    return "tracking-unverified";
  }
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

function createDefaultTreeKillOperations(
  child: TreeKillTarget,
  ownership?: TreeKillOwnership,
): TreeKillOperations | null {
  const pid = ownership?.rootPid ?? child.pid;
  if (typeof pid !== "number" || pid <= 0) {
    return null;
  }
  if (process.platform === "win32") {
    const queryDeadlineMs = Date.now() + WINDOWS_PROCESS_QUERY_BUDGET_MS;
    return {
      async snapshot() {
        return snapshotWindowsProcessTree(pid, ownership?.launchedAtMs, queryDeadlineMs);
      },
      async listRunning(processes) {
        return listRunningWindowsProcesses(processes);
      },
      async signal(processes, signal) {
        const running = await listIdentityMatchingWindowsProcesses(processes, queryDeadlineMs);
        for (const process of running) {
          signalPid(process.pid, signal);
        }
      },
    };
  }
  return {
    async snapshot() {
      return snapshotPosixProcessTree(pid, ownership?.processGroupId);
    },
    async listRunning(processes) {
      return listRunningPosixProcesses(processes);
    },
    async signal(processes, signal) {
      const running = await listRunningPosixProcesses(processes);
      const processGroupId = ownership?.processGroupId;
      const hasProcessGroupAnchor =
        processGroupId !== undefined &&
        running.some((process) => process.processGroupId === processGroupId);
      if (hasProcessGroupAnchor) {
        signalProcessGroup(processGroupId, signal);
      }
      for (const process of running) {
        if (hasProcessGroupAnchor && process.processGroupId === processGroupId) {
          continue;
        }
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

async function snapshotPosixProcessTree(
  rootPid: number,
  processGroupId?: number,
): Promise<TrackedProcess[]> {
  if (process.platform === "linux") {
    return snapshotLinuxProcessTree(rootPid, processGroupId);
  }

  const processTable = await readPsProcessTableWithIdentity();
  const trackedPids = collectOwnedProcessPids(rootPid, processGroupId, processTable);
  if (trackedPids.length === 0) {
    return [];
  }
  return trackedPids.flatMap((pid) => {
    const process = processTable.get(pid);
    return process
      ? [{ identity: process.identity, pid, processGroupId: process.processGroupId }]
      : [];
  });
}

async function snapshotLinuxProcessTree(
  rootPid: number,
  processGroupId?: number,
): Promise<TrackedProcess[]> {
  const processTable = await readPosixProcessTopology();
  const trackedPids = collectOwnedProcessPids(rootPid, processGroupId, processTable);
  if (trackedPids.length === 0) {
    return [];
  }
  const tracked: TrackedProcess[] = [];
  for (const pid of trackedPids) {
    const process = await readLinuxProcessRecord(pid);
    const expected = processTable.get(pid);
    if (
      !process ||
      process.parentPid !== expected?.parentPid ||
      process.processGroupId !== expected.processGroupId
    ) {
      throw new Error(`Process ${pid} changed while its tree was being captured`);
    }
    tracked.push({
      identity: process.identity,
      pid,
      processGroupId: process.processGroupId,
    });
  }
  return tracked;
}

function collectOwnedProcessPids(
  rootPid: number,
  processGroupId: number | undefined,
  processTable: ReadonlyMap<number, PosixProcessRecord>,
): number[] {
  const owned = new Set<number>();
  if (processTable.has(rootPid)) {
    for (const pid of collectProcessTreePids(rootPid, processTable)) {
      owned.add(pid);
    }
  }
  if (processGroupId !== undefined) {
    for (const process of processTable.values()) {
      if (process.processGroupId === processGroupId) {
        owned.add(process.pid);
      }
    }
  }
  return orderProcessPidsChildFirst(owned, processTable);
}

function orderProcessPidsChildFirst(
  pids: ReadonlySet<number>,
  processTable: ReadonlyMap<number, { parentPid: number }>,
): number[] {
  const depthByPid = new Map<number, number>();
  const getDepth = (pid: number): number => {
    const knownDepth = depthByPid.get(pid);
    if (knownDepth !== undefined) {
      return knownDepth;
    }
    const parentPid = processTable.get(pid)?.parentPid;
    const depth = parentPid !== undefined && pids.has(parentPid) ? getDepth(parentPid) + 1 : 0;
    depthByPid.set(pid, depth);
    return depth;
  };
  return [...pids].sort((left, right) => getDepth(right) - getDepth(left));
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
  return processes.flatMap((process) => {
    const refreshed = refreshTrackedPosixProcess(process, processTable.get(process.pid) ?? null);
    return refreshed ? [refreshed] : [];
  });
}

async function listRunningLinuxProcesses(
  processes: readonly TrackedProcess[],
): Promise<TrackedProcess[]> {
  const running: TrackedProcess[] = [];
  for (const process of processes) {
    try {
      const current = await readLinuxProcessRecord(process.pid);
      const refreshed = refreshTrackedPosixProcess(process, current);
      if (refreshed) {
        running.push(refreshed);
      }
    } catch {
      running.push(process);
    }
  }
  return running;
}

/**
 * Refreshes process-group ownership after verifying a stable POSIX identity.
 * @param tracked Process identity captured for cleanup
 * @param current Current process-table record for the same PID
 * @returns Refreshed tracking metadata, or null when the PID identity changed
 */
export function refreshTrackedPosixProcess(
  tracked: TrackedProcess,
  current: PosixProcessRecord | null,
): TrackedProcess | null {
  if (!current || current.identity !== tracked.identity) {
    return null;
  }
  return {
    identity: tracked.identity,
    pid: tracked.pid,
    processGroupId: current.processGroupId,
  };
}

interface PosixProcessRecord {
  identity: string;
  parentPid: number;
  pid: number;
  processGroupId: number;
}

async function readPosixProcessTopology(): Promise<Map<number, PosixProcessRecord>> {
  const stdout = await execFileText("ps", ["-eo", "pid=,ppid=,pgid="]);
  const processTable = new Map<number, PosixProcessRecord>();
  for (const line of stdout.split(/\r?\n/u)) {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s*$/u.exec(line);
    if (!match) {
      continue;
    }
    const pid = Number.parseInt(match[1] ?? "", 10);
    const parentPid = Number.parseInt(match[2] ?? "", 10);
    const processGroupId = Number.parseInt(match[3] ?? "", 10);
    if (pid > 0 && parentPid >= 0 && processGroupId > 0) {
      processTable.set(pid, { identity: "", parentPid, pid, processGroupId });
    }
  }
  return processTable;
}

async function readPsProcessTableWithIdentity(): Promise<Map<number, PosixProcessRecord>> {
  // macOS has no procfs starttime. `lstart` is only second-resolution, so identity checks there
  // remain best-effort; bounded polling and post-order signaling keep the reuse window small.
  const args =
    process.platform === "darwin"
      ? ["-axo", "pid=,ppid=,pgid=,lstart="]
      : ["-eo", "pid=,ppid=,pgid=,lstart="];
  const stdout = await execFileText("ps", args);
  const processTable = new Map<number, PosixProcessRecord>();
  for (const line of stdout.split(/\r?\n/u)) {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+?)\s*$/u.exec(line);
    if (!match) {
      continue;
    }
    const pid = Number.parseInt(match[1] ?? "", 10);
    const parentPid = Number.parseInt(match[2] ?? "", 10);
    const processGroupId = Number.parseInt(match[3] ?? "", 10);
    const identity = match[4] ?? "";
    if (pid > 0 && parentPid >= 0 && processGroupId > 0 && identity) {
      processTable.set(pid, { identity, parentPid, pid, processGroupId });
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
  const processGroupId = Number.parseInt(fields[2] ?? "", 10);
  const startTime = fields[19];
  if (
    parsedPid !== pid ||
    parentPid < 0 ||
    processGroupId <= 0 ||
    !startTime ||
    !/^\d+$/u.test(startTime)
  ) {
    return null;
  }
  return {
    identity: `linux-starttime:${startTime}`,
    parentPid,
    pid,
    processGroupId,
  };
}

interface WindowsProcessRecord extends TrackedProcess {
  creationTimeMs: number;
  parentPid: number;
}

interface RawWindowsProcessRecord {
  CreationDate?: unknown;
  ParentProcessId?: unknown;
  ProcessId?: unknown;
}

async function snapshotWindowsProcessTree(
  rootPid: number,
  launchedAtMs?: number,
  queryDeadlineMs?: number,
): Promise<TrackedProcess[]> {
  const processTable = await readWindowsProcessTable(queryDeadlineMs);
  const earliestCreationTime =
    launchedAtMs === undefined
      ? Number.NEGATIVE_INFINITY
      : launchedAtMs - WINDOWS_CREATION_TIME_TOLERANCE_MS;
  const eligibleTable = new Map(
    [...processTable].filter(([, process]) => process.creationTimeMs >= earliestCreationTime),
  );
  const owned = new Set<number>();
  const childrenByParent = new Map<number, number[]>();
  for (const process of eligibleTable.values()) {
    const children = childrenByParent.get(process.parentPid) ?? [];
    children.push(process.pid);
    childrenByParent.set(process.parentPid, children);
  }
  const visit = (pid: number): void => {
    for (const childPid of childrenByParent.get(pid) ?? []) {
      visit(childPid);
    }
    if (eligibleTable.has(pid)) {
      owned.add(pid);
    }
  };
  visit(rootPid);
  return [...owned].flatMap((pid) => {
    const process = eligibleTable.get(pid);
    return process ? [process] : [];
  });
}

async function listRunningWindowsProcesses(
  processes: readonly TrackedProcess[],
): Promise<TrackedProcess[]> {
  return processes.filter((process) => isPidRunning(process.pid));
}

async function listIdentityMatchingWindowsProcesses(
  processes: readonly TrackedProcess[],
  queryDeadlineMs: number,
): Promise<TrackedProcess[]> {
  const processTable = await readWindowsProcessTable(queryDeadlineMs);
  return processes.filter(
    (process) => processTable.get(process.pid)?.identity === process.identity,
  );
}

async function readWindowsProcessTable(
  queryDeadlineMs?: number,
): Promise<Map<number, WindowsProcessRecord>> {
  const timeout =
    queryDeadlineMs === undefined
      ? WINDOWS_PROCESS_QUERY_TIMEOUT_MS
      : resolveWindowsProcessQueryTimeout(queryDeadlineMs);
  const stdout = await execFileText(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CreationDate | ConvertTo-Json -Compress",
    ],
    { timeout },
  );
  const parsed = JSON.parse(stdout) as RawWindowsProcessRecord | RawWindowsProcessRecord[];
  const records = Array.isArray(parsed) ? parsed : [parsed];
  const processTable = new Map<number, WindowsProcessRecord>();
  for (const record of records) {
    const process = parseWindowsProcessRecord(record);
    if (!process) {
      continue;
    }
    processTable.set(process.pid, process);
  }
  return processTable;
}

/**
 * Resolves one Windows process-query timeout from a shared cleanup deadline.
 * @param queryDeadlineMs Absolute deadline shared by all termination queries
 * @param nowMs Current time, injectable for deterministic tests
 * @returns The bounded timeout for the next query
 * @throws {Error} If the shared query budget has been exhausted
 */
export function resolveWindowsProcessQueryTimeout(
  queryDeadlineMs: number,
  nowMs = Date.now(),
): number {
  const remainingMs = Math.floor(queryDeadlineMs - nowMs);
  if (remainingMs <= 0) {
    const error = new Error("Windows process-query cleanup budget was exhausted") as Error & {
      code: string;
    };
    error.code = "EXEC_COMMAND_PROCESS_QUERY_TIMEOUT";
    throw error;
  }
  return Math.min(WINDOWS_PROCESS_QUERY_TIMEOUT_MS, remainingMs);
}

/**
 * Parses a Win32 process record with a stable creation-time identity.
 * @param value Raw record returned by PowerShell `ConvertTo-Json`
 * @returns The normalized record, or null when required fields are invalid
 */
export function parseWindowsProcessRecord(value: unknown): WindowsProcessRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as RawWindowsProcessRecord;
  const pid = Number(record.ProcessId);
  const parentPid = Number(record.ParentProcessId);
  const creationTimeMs = parseWindowsCreationTime(record.CreationDate);
  if (!Number.isInteger(pid) || pid <= 0 || !Number.isInteger(parentPid) || parentPid < 0) {
    return null;
  }
  if (creationTimeMs === null) {
    return null;
  }
  return {
    creationTimeMs,
    identity: `windows-creation:${creationTimeMs}`,
    parentPid,
    pid,
  };
}

function parseWindowsCreationTime(value: unknown): number | null {
  if (typeof value !== "string") {
    return null;
  }
  const serializedDate = /^\/Date\((\d+)\)\/$/u.exec(value);
  if (serializedDate) {
    return Number.parseInt(serializedDate[1] ?? "", 10);
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function execFileText(
  command: string,
  args: string[],
  options: { timeout?: number } = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        encoding: "utf8",
        killSignal: "SIGKILL",
        maxBuffer: 4 * 1024 * 1024,
        timeout: options.timeout,
        windowsHide: true,
      },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(stdout);
      },
    );
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

function signalProcessGroup(processGroupId: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-processGroupId, signal);
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
