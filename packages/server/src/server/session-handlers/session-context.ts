/**
 * SessionContext is the interface that Session exposes to its handlers.
 *
 * Handlers receive a SessionContext (not the Session itself) so that:
 * 1. Dependencies are explicit — a handler's constructor signature documents
 *    exactly what it needs.
 * 2. Handlers are testable in isolation — inject a mock context rather than
 *    constructing an entire Session.
 * 3. The coupling surface is bounded — handlers cannot reach into arbitrary
 *    Session internals, only what SessionContext exposes.
 *
 * This interface is populated incrementally as handlers are extracted. Each
 * extraction adds only the members that handler needs.
 */

import type { AgentManager } from "../agent/agent-manager.js";
import type { DaemonConfigStore } from "../daemon-config-store.js";
import type { ProjectRegistry } from "../workspace-registry.js";
import type { SessionOutboundMessage } from "../messages.js";
import type { CheckoutDiffManager } from "../checkout-diff-manager.js";
import type { GitHubService } from "../../services/github-service.js";
import type { WorkspaceGitService } from "../workspace-git-service.js";
import type { ProviderSnapshotManager } from "../agent/provider-snapshot-manager.js";
import type { GitMutationRefreshReason } from "../session-helpers.js";
import type pino from "pino";

export interface SessionContext {
  // --- Identity & transport ---
  readonly clientId: string;
  readonly sessionId: string;
  readonly sessionLogger: pino.Logger;
  readonly chisacodeHome: string;

  // --- Shared services (used by multiple handlers) ---
  readonly agentManager: AgentManager;
  readonly daemonConfigStore: DaemonConfigStore;
  readonly projectRegistry: ProjectRegistry;
  readonly providerSnapshotManager: ProviderSnapshotManager;

  // --- Git services (used by CheckoutGit + WorkspaceProject handlers) ---
  readonly workspaceGitService: WorkspaceGitService;
  readonly github: GitHubService;
  readonly checkoutDiffManager: CheckoutDiffManager;

  // --- Lifecycle state (core-owned, shared) ---
  readonly abortController: AbortController;

  // --- Message emission (every handler needs this) ---
  emit(message: SessionOutboundMessage): void;

  // --- Cross-domain methods (called by CheckoutGitHandler but owned by Session core) ---
  /** Force-refresh workspace git snapshot after a mutation. */
  notifyGitMutation(
    cwd: string,
    reason: GitMutationRefreshReason,
    options?: { invalidateGithub?: boolean },
  ): Promise<void>;
  /** Emit a workspace_update message for the workspace owning this cwd. */
  emitWorkspaceUpdateForCwd(cwd: string): Promise<void>;
  /** Emit a workspace_update message for a specific workspace id. */
  emitWorkspaceUpdateForWorkspaceId(workspaceId: string): Promise<void>;
  /** Handle a git branch snapshot change observed by the watcher. */
  handleWorkspaceGitBranchSnapshot(cwd: string, branchName: string | null): void;
  /** Generate a commit message via structured generation (owned by Session core). */
  generateCommitMessage(cwd: string): Promise<string>;
  /** Generate PR title/body via structured generation (owned by Session core). */
  generatePullRequestText(cwd: string, baseRef?: string): Promise<{ title: string; body: string }>;
}

/**
 * A handler that can be disposed. Session.cleanup() calls dispose() on every
 * registered handler so they can release subscriptions and timers.
 */
export interface DisposableHandler {
  dispose(): void;
}
