import { execFileText } from "./tree-kill-command.js";
import {
  createGenericPosixTreeKillAdapter,
  createLinuxTreeKillAdapter,
  type LinuxTreeKillOperations,
  type PosixTreeKillOperations,
} from "./tree-kill-posix.js";
import {
  createWindowsTreeKillAdapter,
  type WindowsTreeKillOperations,
} from "./tree-kill-windows.js";

export {
  parseWindowsProcessRecord,
  resolveWindowsProcessQueryTimeout,
  selectOwnedWindowsProcesses,
} from "./tree-kill-windows.js";
export { parseLinuxProcStat, refreshTrackedPosixProcess } from "./tree-kill-posix.js";

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
    return createLinuxTreeKillAdapter({
      operations: linuxOperations,
      processGroupId: ownership?.processGroupId,
      rootPid: pid,
    });
  }
  return createGenericPosixTreeKillAdapter({
    operations: posixOperations,
    processGroupId: ownership?.processGroupId,
    rootPid: pid,
  });
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
