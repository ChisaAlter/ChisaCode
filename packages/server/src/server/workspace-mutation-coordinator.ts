import { createHash } from "node:crypto";
import { resolve } from "node:path";

/**
 * Lifecycle states for a destructive worktree mutation.
 * Only `active` allows new agent/terminal/write registration against the path.
 */
export type WorkspaceMutationState =
  | "active"
  | "quiescing"
  | "deleting"
  | "archived"
  | "delete_complete_pending_finalize";

export type WorkspaceMutationReason =
  | "auto-archive-on-merge"
  | "archive-worktree"
  | "archive-worktree-command"
  | "auto-created-worktree-archive"
  | "mcp:archive_worktree"
  | "setup-failure-cleanup"
  | "delete-worktree"
  | string;

export interface WorkspaceMutationDecisionLog {
  decision: "allow" | "deny" | "abort" | "complete";
  reason: string;
  pathHash: string;
  state: WorkspaceMutationState;
  mutationReason?: WorkspaceMutationReason;
}

export interface WorkspaceMutationCoordinatorOptions {
  /**
   * Optional sink for structured decision logs. Never receives raw path or secret content.
   */
  onDecision?: (entry: WorkspaceMutationDecisionLog) => void;
}

interface MutationSlot {
  state: WorkspaceMutationState;
  chain: Promise<unknown>;
  holders: number;
}

/**
 * Serializes destructive worktree mutations (archive/delete/setup-cleanup) by
 * canonical path. Fail-closed: lock acquisition failures and unknown states cancel.
 */
export class WorkspaceMutationCoordinator {
  private readonly slots = new Map<string, MutationSlot>();
  private readonly onDecision: WorkspaceMutationCoordinatorOptions["onDecision"];

  constructor(options: WorkspaceMutationCoordinatorOptions = {}) {
    this.onDecision = options.onDecision;
  }

  /**
   * Canonicalize a worktree path for lock keying.
   * @param path Absolute or relative worktree path
   * @returns Normalized absolute path key
   */
  canonicalize(path: string): string {
    let normalized = resolve(path).replace(/\\/g, "/").replace(/\/$/, "");
    if (/^[a-zA-Z]:\//.test(normalized)) {
      normalized = normalized.toLowerCase();
    }
    return normalized;
  }

  /**
   * Stable non-reversible path identity for audit logs.
   * @param path Worktree path
   * @returns Short sha256 hex of the canonical path
   */
  pathHash(path: string): string {
    return createHash("sha256").update(this.canonicalize(path)).digest("hex").slice(0, 16);
  }

  /**
   * Current mutation state for a path, defaulting to `active` when untracked.
   * @param path Worktree path
   */
  getState(path: string): WorkspaceMutationState {
    return this.slots.get(this.canonicalize(path))?.state ?? "active";
  }

  /**
   * Whether the path is currently allowing new agent/terminal/write work.
   * @param path Worktree path
   */
  isAcceptingWrites(path: string): boolean {
    return this.getState(path) === "active";
  }

  /**
   * Run a destructive mutation exclusively for the given path.
   * The callback receives helpers to transition the state machine.
   * @param path Worktree path being mutated
   * @param mutationReason Why the mutation was requested
   * @param fn Critical section body
   * @returns Result of `fn`
   */
  async runExclusive<T>(
    path: string,
    mutationReason: WorkspaceMutationReason,
    fn: (ctx: {
      canonicalPath: string;
      pathHash: string;
      setState: (state: WorkspaceMutationState, decisionReason: string) => void;
      assertState: (expected: WorkspaceMutationState | WorkspaceMutationState[]) => void;
    }) => Promise<T>,
  ): Promise<T> {
    const canonicalPath = this.canonicalize(path);
    const pathHash = this.pathHash(canonicalPath);
    const slot = this.ensureSlot(canonicalPath);

    const previous = slot.chain;
    let release!: () => void;
    const gate = new Promise<void>((resolveGate) => {
      release = resolveGate;
    });
    slot.chain = previous.then(
      () => gate,
      () => gate,
    );

    await previous.catch(() => undefined);
    slot.holders += 1;

    try {
      // A previous exclusive mutation may have finished as archived while this
      // waiter was queued. Treat archived as terminal for that path generation
      // and reset to active so a recreated worktree (or a subsequent archive
      // attempt after restore) can proceed.
      if (slot.state === "archived") {
        slot.state = "active";
      }
      if (slot.state !== "active" && slot.state !== "delete_complete_pending_finalize") {
        this.emitDecision({
          decision: "deny",
          reason: `state_not_active:${slot.state}`,
          pathHash,
          state: slot.state,
          mutationReason,
        });
        throw new WorkspaceMutationBusyError(canonicalPath, slot.state, mutationReason);
      }

      const setState = (state: WorkspaceMutationState, decisionReason: string): void => {
        slot.state = state;
        this.emitDecision({
          decision: state === "archived" || state === "active" ? "complete" : "allow",
          reason: decisionReason,
          pathHash,
          state,
          mutationReason,
        });
      };

      const assertState = (expected: WorkspaceMutationState | WorkspaceMutationState[]): void => {
        const allowed = Array.isArray(expected) ? expected : [expected];
        if (!allowed.includes(slot.state)) {
          throw new Error(
            `Workspace mutation state mismatch for ${pathHash}: expected ${allowed.join("|")}, got ${slot.state}`,
          );
        }
      };

      this.emitDecision({
        decision: "allow",
        reason: "lock_acquired",
        pathHash,
        state: slot.state,
        mutationReason,
      });

      return await fn({ canonicalPath, pathHash, setState, assertState });
    } catch (error) {
      if (slot.state !== "archived" && slot.state !== "delete_complete_pending_finalize") {
        slot.state = "active";
        this.emitDecision({
          decision: "abort",
          reason: error instanceof Error ? error.message.slice(0, 200) : "unknown_error",
          pathHash,
          state: slot.state,
          mutationReason,
        });
      }
      throw error;
    } finally {
      slot.holders = Math.max(0, slot.holders - 1);
      if (slot.holders === 0 && (slot.state === "active" || slot.state === "archived")) {
        // Drop terminal states so a recreated worktree at the same path can mutate again.
        if (slot.state === "archived") {
          this.slots.delete(canonicalPath);
        } else if (slot.chain === previous || slot.holders === 0) {
          // Keep slot only while chain still has waiters; otherwise prune idle active slots.
          const stillChained = slot.chain !== previous && slot.holders > 0;
          if (!stillChained && slot.state === "active") {
            this.slots.delete(canonicalPath);
          }
        }
      }
      release();
    }
  }

  private ensureSlot(canonicalPath: string): MutationSlot {
    let slot = this.slots.get(canonicalPath);
    if (!slot) {
      slot = {
        state: "active",
        chain: Promise.resolve(),
        holders: 0,
      };
      this.slots.set(canonicalPath, slot);
    }
    return slot;
  }

  private emitDecision(entry: WorkspaceMutationDecisionLog): void {
    this.onDecision?.(entry);
  }
}

/**
 * Thrown when a mutation is refused because the path is already being mutated.
 */
export class WorkspaceMutationBusyError extends Error {
  readonly canonicalPath: string;
  readonly state: WorkspaceMutationState;
  readonly mutationReason: WorkspaceMutationReason;

  constructor(
    canonicalPath: string,
    state: WorkspaceMutationState,
    mutationReason: WorkspaceMutationReason,
  ) {
    super(`Worktree mutation busy (${state}) for reason=${mutationReason}`);
    this.name = "WorkspaceMutationBusyError";
    this.canonicalPath = canonicalPath;
    this.state = state;
    this.mutationReason = mutationReason;
  }
}

/** Process-wide coordinator used by archive/delete/setup-cleanup paths. */
export const workspaceMutationCoordinator = new WorkspaceMutationCoordinator();
