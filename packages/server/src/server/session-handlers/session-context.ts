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
import type { AgentStorage } from "../agent/agent-storage.js";
import type { AgentPresetStore } from "../agent/agent-preset-store.js";
import type { DaemonConfigStore } from "../daemon-config-store.js";
import type { ProjectRegistry } from "../workspace-registry.js";
import type { SessionOutboundMessage } from "../messages.js";
import type { CheckoutDiffManager } from "../checkout-diff-manager.js";
import type { GitHubService } from "../../services/github-service.js";
import type { WorkspaceGitService } from "../workspace-git-service.js";
import type { ProviderSnapshotManager } from "../agent/provider-snapshot-manager.js";
import type { FileBackedChatService } from "../chat/chat-service.js";
import type { ScheduleService } from "../schedule/service.js";
import type { LoopService } from "../loop-service.js";
import type { TerminalManager } from "../../terminal/terminal-manager.js";
import type { TerminalSessionController } from "../../terminal/terminal-session-controller.js";
import type { ScriptRouteStore } from "../script-proxy.js";
import type { WorkspaceScriptRuntimeStore } from "../workspace-script-runtime-store.js";
import type { WorkspaceRegistry } from "../workspace-registry.js";
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
  readonly agentStorage: AgentStorage;

  // --- Chat / Schedule / Loop services (used by ChatScheduleLoopHandler) ---
  readonly chatService: FileBackedChatService;
  readonly scheduleService: ScheduleService;
  readonly loopService: LoopService;
  readonly agentPresetStore: AgentPresetStore;

  // --- Terminal / Script services (used by TerminalScriptHandler) ---
  readonly terminalManager: TerminalManager | null;
  readonly terminalController: TerminalSessionController;
  readonly scriptRouteStore: ScriptRouteStore | null;
  readonly scriptRuntimeStore: WorkspaceScriptRuntimeStore | null;
  readonly workspaceRegistry: WorkspaceRegistry;
  readonly getDaemonTcpPort: (() => number | null) | null;
  readonly getDaemonTcpHost: (() => string | null) | null;
  readonly resolveScriptHealth: ((hostname: string) => unknown) | null;

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
  /** Resolve an agent identifier to an agent id (owned by Session core). */
  resolveAgentIdentifier(
    identifier: string,
  ): Promise<{ ok: true; agentId: string } | { ok: false; error: string }>;
  /** Check if the client supports a capability. */
  supports(capability: string): boolean;
  /** Emit a workspace script status update (owned by Session core). */
  emitWorkspaceScriptStatusUpdate(workspaceId: string, workspaceDirectory: string): void;
}

/**
 * A handler that can be disposed. Session.cleanup() calls dispose() on every
 * registered handler so they can release subscriptions and timers.
 */
export interface DisposableHandler {
  dispose(): void;
}
