import { readFile } from "node:fs/promises";
import { execFileText } from "./tree-kill-command.js";
import {
  createWindowsTreeKillAdapter,
  type WindowsTreeKillOperations,
} from "./tree-kill-windows.js";

export {
  parseWindowsProcessRecord,
  resolveWindowsProcessQueryTimeout,
  selectOwnedWindowsProcesses,
} from "./tree-kill-windows.js";

const PROCESS_POLL_INTERVAL_MS = 25;

/** Maximum wall-clock budget for one command-tree cleanup attempt. */
export const TREE_KILL_CLEANUP_TIMEOUT_MS = 8_000;

export interface TreeKillTarget {
  pid?: number;
  exitCode?: number | null;
  signalCode?: NodeJS.Signals | null;
  kill(signal?: NodeJS.Signals | number): boolean;
  off?(event: "exit", listener: () => void): unknown;
  once?(event: "exit", listener: () => void): unknown;
}

interface TerminateWithTreeKillOptions {
  cleanupTimeoutMs?: number;
  closure?: Promise<void>;
  gracefulSignal?: NodeJS.Signals;
  forceSignal?: NodeJS.Signals;
  gracefulTimeoutMs: number;
  forceTimeoutMs?: number;
  onForceSignal?: () => void;
  operations?: TreeKillOperations;
  linuxOperations?: LinuxTreeKillOperations;
  ownership?: TreeKillOwnership;
  posixOperations?: PosixTreeKillOperations;
  signal?: AbortSignal;
  windowsOperations?: WindowsTreeKillOperations;
}

interface TrackedProcess {
  identity: string;
  pid: number;
  processGroupId?: number;
}

interface TreeKillOperations {
  allowsUnverifiedRootFallback?: boolean;
  snapshot(cleanupSignal: AbortSignal): Promise<TrackedProcess[]>;
  listRunning(
    processes: readonly TrackedProcess[],
    cleanupSignal: AbortSignal,
  ): Promise<TrackedProcess[]>;
  signal(
    processes: readonly TrackedProcess[],
    signal: NodeJS.Signals,
    cleanupSignal: AbortSignal,
  ): Promise<void>;
  now?: () => number;
  waitForPoll?: (delayMs: number, cleanupSignal: AbortSignal) => Promise<void>;
}

interface LinuxTreeKillOperations {
  readProcess(pid: number): Promise<PosixProcessRecord | null>;
  readTopology(cleanupSignal?: AbortSignal): Promise<Map<number, PosixProcessRecord>>;
  signal(pid: number, signal: NodeJS.Signals): void;
  signalProcessGroup(processGroupId: number, signal: NodeJS.Signals): void;
}

interface PosixProcessTableSnapshot {
  complete: boolean;
  records: Map<number, PosixProcessRecord>;
}

type ReadPosixProcessTable = (cleanupSignal?: AbortSignal) => Promise<PosixProcessTableSnapshot>;

type ReadPosixProcessTableOutput = (cleanupSignal?: AbortSignal) => Promise<string>;

interface PosixTreeKillOperations {
  readProcessTable?: ReadPosixProcessTable;
  readProcessTableOutput?: ReadPosixProcessTableOutput;
  signal(pid: number, signal: NodeJS.Signals): void;
  signalProcessGroup(processGroupId: number, signal: NodeJS.Signals): void;
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

class TreeKillCleanupTimeoutError extends Error {
  readonly code = "EXEC_COMMAND_KILL_TIMEOUT";

  constructor() {
    super("Command tree cleanup exceeded its absolute deadline");
    this.name = "TreeKillCleanupTimeoutError";
  }
}

class TreeKillCleanupDeadline {
  private readonly controller = new AbortController();
  private readonly parentAbortListener: (() => void) | null;
  private readonly timeoutHandle: NodeJS.Timeout;
  readonly expiresAtMs: number;

  constructor(
    timeoutMs: number,
    private readonly now: () => number,
    private readonly parentSignal?: AbortSignal,
  ) {
    const boundedTimeoutMs = Math.max(0, timeoutMs);
    this.expiresAtMs = this.now() + boundedTimeoutMs;
    this.timeoutHandle = setTimeout(() => {
      this.abort(new TreeKillCleanupTimeoutError());
    }, boundedTimeoutMs);
    if (parentSignal) {
      this.parentAbortListener = () => {
        this.abort(parentSignal.reason ?? new TreeKillCleanupTimeoutError());
      };
      parentSignal.addEventListener("abort", this.parentAbortListener, { once: true });
      if (parentSignal.aborted) {
        this.parentAbortListener();
      }
    } else {
      this.parentAbortListener = null;
    }
  }

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  remainingMs(): number {
    return Math.max(0, this.expiresAtMs - this.now());
  }

  run<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this.signal.aborted) {
      return Promise.reject(this.signal.reason ?? new TreeKillCleanupTimeoutError());
    }
    return new Promise<T>((resolve, reject) => {
      let completed = false;
      const finish = (settle: () => void) => {
        if (completed) {
          return;
        }
        completed = true;
        this.signal.removeEventListener("abort", onAbort);
        settle();
      };
      const onAbort = () => {
        finish(() => reject(this.signal.reason ?? new TreeKillCleanupTimeoutError()));
      };
      this.signal.addEventListener("abort", onAbort, { once: true });
      let operationPromise: Promise<T>;
      try {
        operationPromise = operation(this.signal);
      } catch (error) {
        finish(() => reject(error));
        return;
      }
      void operationPromise.then(
        (value) => finish(() => resolve(value)),
        (error: unknown) => finish(() => reject(error)),
      );
    });
  }

  dispose(): void {
    clearTimeout(this.timeoutHandle);
    if (this.parentSignal && this.parentAbortListener) {
      this.parentSignal.removeEventListener("abort", this.parentAbortListener);
    }
  }

  private abort(reason: unknown): void {
    if (!this.signal.aborted) {
      this.controller.abort(reason);
    }
  }
}

export async function terminateWithTreeKill(
  child: TreeKillTarget,
  options: TerminateWithTreeKillOptions,
): Promise<TerminateWithTreeKillResult> {
  const now = options.operations?.now ?? Date.now;
  const deadline = new TreeKillCleanupDeadline(
    options.cleanupTimeoutMs ?? TREE_KILL_CLEANUP_TIMEOUT_MS,
    now,
    options.signal,
  );
  try {
    const hasWindowsProcessTracking =
      options.windowsOperations !== undefined ||
      (process.platform === "win32" &&
        options.linuxOperations === undefined &&
        options.posixOperations === undefined);
    if (
      isProcessExited(child) &&
      !options.operations &&
      !options.ownership &&
      !hasWindowsProcessTracking
    ) {
      return "already-exited";
    }

    const operations =
      options.operations ??
      createDefaultTreeKillOperations(
        child,
        options.ownership,
        deadline,
        options.windowsOperations,
        options.linuxOperations,
        options.posixOperations,
      );
    const trackedResult = await terminateTrackedProcessTree(options, deadline, operations);
    if (trackedResult !== "tracking-unavailable" && trackedResult !== "tracking-unverified") {
      return trackedResult;
    }
    if (
      trackedResult === "tracking-unverified" &&
      operations?.allowsUnverifiedRootFallback === false
    ) {
      return "kill-timeout";
    }

    const fallbackResult = await terminateRootObservedTree(child, options, deadline);
    return trackedResult === "tracking-unverified" ? "kill-timeout" : fallbackResult;
  } catch (error) {
    if (deadline.signal.aborted) {
      return "kill-timeout";
    }
    throw error;
  } finally {
    deadline.dispose();
  }
}

async function terminateTrackedProcessTree(
  options: TerminateWithTreeKillOptions,
  deadline: TreeKillCleanupDeadline,
  operations: TreeKillOperations | null,
): Promise<TrackedTerminationResult> {
  if (!operations) {
    return "tracking-unavailable";
  }

  let trackedProcesses: TrackedProcess[];
  try {
    trackedProcesses = await deadline.run((cleanupSignal) => operations.snapshot(cleanupSignal));
  } catch (error) {
    rethrowCleanupDeadline(error, deadline);
    return "tracking-unverified";
  }
  if (trackedProcesses.length === 0) {
    if (options.closure) {
      try {
        await deadline.run(async () => options.closure);
        return "already-exited";
      } catch (error) {
        rethrowCleanupDeadline(error, deadline);
      }
    }
    return "tracking-unverified";
  }

  const gracefulSignal = options.gracefulSignal ?? "SIGTERM";
  const forceSignal = options.forceSignal ?? "SIGKILL";
  if (gracefulSignal === forceSignal) {
    options.onForceSignal?.();
    try {
      await deadline.run((cleanupSignal) =>
        operations.signal(trackedProcesses, forceSignal, cleanupSignal),
      );
      if (options.forceTimeoutMs === undefined) {
        return "killed";
      }
      const survivors = await waitForTrackedProcesses(
        operations,
        trackedProcesses,
        options.forceTimeoutMs,
        deadline,
      );
      return survivors.length === 0 ? "killed" : "kill-timeout";
    } catch (error) {
      rethrowCleanupDeadline(error, deadline);
      return "tracking-unverified";
    }
  }

  let survivors: TrackedProcess[];
  try {
    await deadline.run((cleanupSignal) =>
      operations.signal(trackedProcesses, gracefulSignal, cleanupSignal),
    );
    survivors = await waitForTrackedProcesses(
      operations,
      trackedProcesses,
      options.gracefulTimeoutMs,
      deadline,
    );
  } catch (error) {
    rethrowCleanupDeadline(error, deadline);
    return "tracking-unverified";
  }
  if (survivors.length === 0) {
    return "terminated";
  }

  options.onForceSignal?.();
  try {
    await deadline.run((cleanupSignal) => operations.signal(survivors, forceSignal, cleanupSignal));
    if (options.forceTimeoutMs === undefined) {
      return "killed";
    }
    survivors = await waitForTrackedProcesses(
      operations,
      survivors,
      options.forceTimeoutMs,
      deadline,
    );
    return survivors.length === 0 ? "killed" : "kill-timeout";
  } catch (error) {
    rethrowCleanupDeadline(error, deadline);
    return "tracking-unverified";
  }
}

function rethrowCleanupDeadline(error: unknown, deadline: TreeKillCleanupDeadline): void {
  if (deadline.signal.aborted) {
    throw error;
  }
}

async function terminateRootObservedTree(
  child: TreeKillTarget,
  options: TerminateWithTreeKillOptions,
  deadline: TreeKillCleanupDeadline,
): Promise<TerminateWithTreeKillResult> {
  if (isProcessExited(child)) {
    return "already-exited";
  }

  const gracefulSignal = options.gracefulSignal ?? "SIGTERM";
  const forceSignal = options.forceSignal ?? "SIGKILL";
  if (gracefulSignal === forceSignal) {
    options.onForceSignal?.();
    await deadline.run((cleanupSignal) =>
      signalTreeOrChild(child, forceSignal, cleanupSignal, deadline.remainingMs()),
    );
    if (options.forceTimeoutMs === undefined) {
      return "killed";
    }
    return (await waitForExitOrTimeout(child, options.forceTimeoutMs, deadline))
      ? "killed"
      : "kill-timeout";
  }

  await deadline.run((cleanupSignal) =>
    signalTreeOrChild(child, gracefulSignal, cleanupSignal, deadline.remainingMs()),
  );
  if (await waitForExitOrTimeout(child, options.gracefulTimeoutMs, deadline)) {
    return "terminated";
  }

  options.onForceSignal?.();
  await deadline.run((cleanupSignal) =>
    signalTreeOrChild(child, forceSignal, cleanupSignal, deadline.remainingMs()),
  );
  if (options.forceTimeoutMs === undefined) {
    return "killed";
  }
  return (await waitForExitOrTimeout(child, options.forceTimeoutMs, deadline))
    ? "killed"
    : "kill-timeout";
}

function createDefaultTreeKillOperations(
  child: TreeKillTarget,
  ownership: TreeKillOwnership | undefined,
  deadline: TreeKillCleanupDeadline,
  windowsOperations?: WindowsTreeKillOperations,
  linuxOperations?: LinuxTreeKillOperations,
  posixOperations?: PosixTreeKillOperations,
): TreeKillOperations | null {
  const pid = ownership?.rootPid ?? child.pid;
  if (typeof pid !== "number" || pid <= 0) {
    return null;
  }
  if (windowsOperations || (process.platform === "win32" && !linuxOperations && !posixOperations)) {
    return createWindowsTreeKillAdapter({
      launchedAtMs: ownership?.launchedAtMs,
      operations: windowsOperations,
      queryDeadlineMs: deadline.expiresAtMs,
      rootExited: () => isProcessExited(child),
      rootPid: pid,
    });
  }
  if (linuxOperations || (process.platform === "linux" && !posixOperations)) {
    const resolvedLinuxOperations =
      linuxOperations ??
      ({
        readProcess: readLinuxProcessRecord,
        readTopology: readPosixProcessTopology,
        signal: signalPid,
        signalProcessGroup,
      } satisfies LinuxTreeKillOperations);
    return {
      async snapshot(cleanupSignal) {
        return snapshotLinuxProcessTree(
          pid,
          ownership?.processGroupId,
          cleanupSignal,
          resolvedLinuxOperations,
        );
      },
      async listRunning(processes) {
        return listRunningLinuxProcesses(processes, resolvedLinuxOperations.readProcess);
      },
      async signal(processes, signal) {
        const running = await listSignalableLinuxProcesses(
          processes,
          resolvedLinuxOperations.readProcess,
        );
        const processGroupId = ownership?.processGroupId;
        const hasProcessGroupAnchor =
          processGroupId !== undefined &&
          running.some((process) => process.processGroupId === processGroupId);
        if (hasProcessGroupAnchor) {
          resolvedLinuxOperations.signalProcessGroup(processGroupId, signal);
        }
        for (const process of running) {
          if (hasProcessGroupAnchor && process.processGroupId === processGroupId) {
            continue;
          }
          resolvedLinuxOperations.signal(process.pid, signal);
        }
      },
    };
  }
  const resolvedPosixOperations =
    posixOperations ??
    ({
      signal: signalPid,
      signalProcessGroup,
    } satisfies PosixTreeKillOperations);
  const readProcessTable =
    resolvedPosixOperations.readProcessTable ??
    ((cleanupSignal?: AbortSignal) =>
      readPsProcessTableWithIdentity(
        cleanupSignal,
        resolvedPosixOperations.readProcessTableOutput,
      ));
  return {
    async snapshot(cleanupSignal) {
      return snapshotGenericPosixProcessTree(
        pid,
        ownership?.processGroupId,
        cleanupSignal,
        readProcessTable,
      );
    },
    async listRunning(processes, cleanupSignal) {
      return listRunningGenericPosixProcesses(processes, cleanupSignal, readProcessTable);
    },
    async signal(processes, signal, cleanupSignal) {
      const running = await listSignalableGenericPosixProcesses(
        processes,
        cleanupSignal,
        readProcessTable,
      );
      const processGroupId = ownership?.processGroupId;
      const hasProcessGroupAnchor =
        processGroupId !== undefined &&
        running.some((process) => process.processGroupId === processGroupId);
      if (hasProcessGroupAnchor) {
        resolvedPosixOperations.signalProcessGroup(processGroupId, signal);
      }
      for (const process of running) {
        if (hasProcessGroupAnchor && process.processGroupId === processGroupId) {
          continue;
        }
        resolvedPosixOperations.signal(process.pid, signal);
      }
    },
  };
}

async function waitForTrackedProcesses(
  operations: TreeKillOperations,
  processes: readonly TrackedProcess[],
  timeoutMs: number,
  cleanupDeadline: TreeKillCleanupDeadline,
): Promise<TrackedProcess[]> {
  const now = operations.now ?? Date.now;
  const waitForPoll = operations.waitForPoll ?? waitForProcessPoll;
  const phaseDeadlineMs = Math.min(cleanupDeadline.expiresAtMs, now() + Math.max(0, timeoutMs));
  let survivors = await cleanupDeadline.run((cleanupSignal) =>
    operations.listRunning(processes, cleanupSignal),
  );
  while (survivors.length > 0) {
    const remainingMs = phaseDeadlineMs - now();
    if (remainingMs <= 0) {
      break;
    }
    await cleanupDeadline.run((cleanupSignal) =>
      waitForPoll(Math.min(PROCESS_POLL_INTERVAL_MS, remainingMs), cleanupSignal),
    );
    survivors = await cleanupDeadline.run((cleanupSignal) =>
      operations.listRunning(survivors, cleanupSignal),
    );
  }
  return survivors;
}

function waitForProcessPoll(delayMs: number, cleanupSignal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    let timer: NodeJS.Timeout | null = null;
    const finish = (settle: () => void) => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      cleanupSignal?.removeEventListener("abort", onAbort);
      settle();
    };
    const onAbort = () => {
      finish(() => reject(cleanupSignal?.reason ?? new TreeKillCleanupTimeoutError()));
    };
    cleanupSignal?.addEventListener("abort", onAbort, { once: true });
    timer = setTimeout(() => finish(resolve), delayMs);
    if (cleanupSignal?.aborted) {
      onAbort();
    }
  });
}

async function snapshotGenericPosixProcessTree(
  rootPid: number,
  processGroupId?: number,
  cleanupSignal?: AbortSignal,
  readProcessTable: ReadPosixProcessTable = readPsProcessTableWithIdentity,
): Promise<TrackedProcess[]> {
  const processTable = await readProcessTable(cleanupSignal);
  if (!processTable.complete) {
    throw new Error("POSIX process table snapshot was incomplete");
  }
  const trackedPids = collectOwnedProcessPids(rootPid, processGroupId, processTable.records);
  if (trackedPids.length === 0) {
    return [];
  }
  return trackedPids.flatMap((pid) => {
    const process = processTable.records.get(pid);
    return process
      ? [{ identity: process.identity, pid, processGroupId: process.processGroupId }]
      : [];
  });
}

async function snapshotLinuxProcessTree(
  rootPid: number,
  processGroupId?: number,
  cleanupSignal?: AbortSignal,
  operations: Pick<LinuxTreeKillOperations, "readProcess" | "readTopology"> = {
    readProcess: readLinuxProcessRecord,
    readTopology: readPosixProcessTopology,
  },
): Promise<TrackedProcess[]> {
  const processTable = await operations.readTopology(cleanupSignal);
  const trackedPids = collectOwnedProcessPids(rootPid, processGroupId, processTable);
  if (trackedPids.length === 0) {
    return [];
  }
  const tracked: TrackedProcess[] = [];
  for (const pid of trackedPids) {
    const process = await operations.readProcess(pid);
    const expected = processTable.get(pid);
    if (!process) {
      continue;
    }
    if (
      !expected ||
      process.parentPid !== expected.parentPid ||
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

async function listRunningGenericPosixProcesses(
  processes: readonly TrackedProcess[],
  cleanupSignal?: AbortSignal,
  readProcessTable: ReadPosixProcessTable = readPsProcessTableWithIdentity,
): Promise<TrackedProcess[]> {
  let processTable: PosixProcessTableSnapshot;
  try {
    processTable = await readProcessTable(cleanupSignal);
  } catch {
    return [...processes];
  }
  if (!processTable.complete) {
    return [...processes];
  }
  return processes.flatMap((process) => {
    const refreshed = refreshTrackedPosixProcess(
      process,
      processTable.records.get(process.pid) ?? null,
    );
    return refreshed ? [refreshed] : [];
  });
}

async function listSignalableGenericPosixProcesses(
  processes: readonly TrackedProcess[],
  cleanupSignal: AbortSignal,
  readProcessTable: ReadPosixProcessTable,
): Promise<TrackedProcess[]> {
  const processTable = await readProcessTable(cleanupSignal);
  if (!processTable.complete) {
    throw new Error("POSIX process table refresh was incomplete before signaling");
  }
  return processes.flatMap((process) => {
    const refreshed = refreshTrackedPosixProcessForSignal(
      process,
      processTable.records.get(process.pid) ?? null,
    );
    return refreshed ? [refreshed] : [];
  });
}

async function listRunningLinuxProcesses(
  processes: readonly TrackedProcess[],
  readProcess: LinuxTreeKillOperations["readProcess"] = readLinuxProcessRecord,
): Promise<TrackedProcess[]> {
  const running: TrackedProcess[] = [];
  for (const process of processes) {
    try {
      const current = await readProcess(process.pid);
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

async function listSignalableLinuxProcesses(
  processes: readonly TrackedProcess[],
  readProcess: LinuxTreeKillOperations["readProcess"],
): Promise<TrackedProcess[]> {
  const running: TrackedProcess[] = [];
  for (const process of processes) {
    const current = await readProcess(process.pid);
    const refreshed = refreshTrackedPosixProcessForSignal(process, current);
    if (refreshed) {
      running.push(refreshed);
    }
  }
  return running;
}

function refreshTrackedPosixProcessForSignal(
  tracked: TrackedProcess,
  current: PosixProcessRecord | null,
): TrackedProcess | null {
  if (current === null) {
    return null;
  }
  if (current.pid !== tracked.pid || current.identity !== tracked.identity) {
    throw new Error(`Process ${tracked.pid} identity changed before signaling`);
  }
  return {
    identity: tracked.identity,
    pid: tracked.pid,
    processGroupId: current.processGroupId,
  };
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

async function readPosixProcessTopology(
  cleanupSignal?: AbortSignal,
): Promise<Map<number, PosixProcessRecord>> {
  const stdout = await execFileText("ps", ["-eo", "pid=,ppid=,pgid="], {
    signal: cleanupSignal,
  });
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

async function readPsProcessTableWithIdentity(
  cleanupSignal?: AbortSignal,
  readOutput: ReadPosixProcessTableOutput = readPsProcessTableOutput,
): Promise<PosixProcessTableSnapshot> {
  const stdout = await readOutput(cleanupSignal);
  return parsePsProcessTableWithIdentity(stdout);
}

async function readPsProcessTableOutput(cleanupSignal?: AbortSignal): Promise<string> {
  // macOS has no procfs starttime. `lstart` is only second-resolution, so identity checks there
  // remain best-effort; bounded polling and post-order signaling keep the reuse window small.
  const args =
    process.platform === "darwin"
      ? ["-axo", "pid=,ppid=,pgid=,lstart="]
      : ["-eo", "pid=,ppid=,pgid=,lstart="];
  return execFileText("ps", args, { signal: cleanupSignal });
}

function parsePsProcessTableWithIdentity(value: string): PosixProcessTableSnapshot {
  const records = new Map<number, PosixProcessRecord>();
  let complete = true;
  let sawRecord = false;
  for (const line of value.split(/\r?\n/u)) {
    if (line.trim().length === 0) {
      continue;
    }
    sawRecord = true;
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+?)\s*$/u.exec(line);
    if (!match) {
      complete = false;
      continue;
    }
    const pid = Number.parseInt(match[1] ?? "", 10);
    const parentPid = Number.parseInt(match[2] ?? "", 10);
    const processGroupId = Number.parseInt(match[3] ?? "", 10);
    const identity = match[4] ?? "";
    const normalizedIdentity = identity.trim();
    const isValid =
      Number.isSafeInteger(pid) &&
      pid > 0 &&
      Number.isSafeInteger(parentPid) &&
      parentPid >= 0 &&
      Number.isSafeInteger(processGroupId) &&
      processGroupId > 0 &&
      normalizedIdentity.length > 0 &&
      !records.has(pid);
    if (!isValid) {
      complete = false;
      continue;
    }
    records.set(pid, { identity: normalizedIdentity, parentPid, pid, processGroupId });
  }
  return { complete: complete && sawRecord, records };
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

async function signalTreeOrChild(
  child: TreeKillTarget,
  signal: NodeJS.Signals,
  cleanupSignal: AbortSignal,
  remainingMs: number,
): Promise<void> {
  if (isProcessExited(child)) {
    return;
  }

  const pid = child.pid;
  if (typeof pid !== "number" || pid <= 0) {
    signalDirectChild(child, signal);
    return;
  }
  if (process.platform !== "win32") {
    signalDirectChild(child, signal);
    return;
  }

  try {
    await execFileText("taskkill.exe", ["/pid", String(pid), "/T", "/F"], {
      signal: cleanupSignal,
      timeout: Math.max(1, Math.floor(remainingMs)),
    });
  } catch (error) {
    if (cleanupSignal.aborted) {
      throw error;
    }
    signalDirectChild(child, signal);
  }
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

function waitForExitOrTimeout(
  child: TreeKillTarget,
  timeoutMs: number,
  deadline: TreeKillCleanupDeadline,
): Promise<boolean> {
  if (isProcessExited(child)) {
    return Promise.resolve(true);
  }
  const boundedTimeoutMs = Math.min(Math.max(0, timeoutMs), deadline.remainingMs());
  return new Promise<boolean>((resolve, reject) => {
    let timer: NodeJS.Timeout | null = null;
    const finish = (settle: () => void) => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      child.off?.("exit", onExit);
      deadline.signal.removeEventListener("abort", onAbort);
      settle();
    };
    const onExit = () => finish(() => resolve(true));
    const onAbort = () => {
      finish(() => reject(deadline.signal.reason ?? new TreeKillCleanupTimeoutError()));
    };
    child.once?.("exit", onExit);
    deadline.signal.addEventListener("abort", onAbort, { once: true });
    timer = setTimeout(() => finish(() => resolve(isProcessExited(child))), boundedTimeoutMs);
    if (deadline.signal.aborted) {
      onAbort();
    }
  });
}
