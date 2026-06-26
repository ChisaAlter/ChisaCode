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
import type { DownloadTokenStore } from "../file-download/token-store.js";
import type { PushTokenStore } from "../push/token-store.js";
import type { UsageStore } from "../usage/usage-store.js";
import type {
  WorkspaceSetupSnapshot,
  WorkspaceDescriptorPayload,
  EditorTargetDescriptorPayload,
  EditorTargetId,
} from "../messages.js";
import type { PersistedWorkspaceRecord } from "../workspace-registry.js";
import type { CreateChisaCodeWorktreeResult } from "../chisacode-worktree-service.js";
import type { StructuredGenerationDaemonConfig } from "../agent/structured-generation-providers.js";
import type { CreateChisaCodeWorktreeWorkflowResult } from "../worktree-session.js";
import type { CreateAgentLifecycleDispatch } from "../agent/create-agent-lifecycle-dispatch.js";
import type { WorkspaceUpdatesFilter } from "../workspace-directory.js";
import type pino from "pino";

export interface SessionContext {
  // --- Identity & transport ---
  readonly clientId: string;
  readonly sessionId: string;
  readonly sessionLogger: pino.Logger;
  readonly chisacodeHome: string;
  readonly appVersion: string | null;

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
  /** Emit workspace_update messages for multiple workspace ids. */
  emitWorkspaceUpdatesForWorkspaceIds(
    workspaceIds: Iterable<string>,
    options?: { skipReconcile?: boolean; dedupeGitState?: boolean },
  ): Promise<void>;
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

  // --- Config control (for ConfigControlHandler) ---
  /** Emit a lifecycle intent (restart/shutdown). */
  emitLifecycleIntent(intent: unknown): void;

  // --- Workspace subscription state machine (owned by Session, used by WorkspaceProjectHandler) ---
  /** Buffer or emit an agent update — called by workspace domain to push agent changes. */
  bufferOrEmitAgentUpdate(subscription: unknown, payload: unknown): void;
  /** Buffer or emit a workspace update. */
  bufferOrEmitWorkspaceUpdate(subscription: unknown, payload: unknown): void;
  /** Flush bootstrapped workspace updates after initial fetch completes. */
  flushBootstrappedWorkspaceUpdates(options?: unknown): void;
  /** Check if a workspace matches the subscription filter. */
  matchesWorkspaceFilter(input: unknown): boolean;
  /** Reconcile and emit all pending workspace updates. */
  reconcileAndEmitWorkspaceUpdates(): Promise<void>;
  /** Get the current workspace updates subscription state. */
  getWorkspaceUpdatesSubscription(): unknown;
  /** Set the workspace updates subscription state. */
  setWorkspaceUpdatesSubscription(subscription: unknown | null): void;

  // --- Agent lifecycle (for AgentLifecycleHandler) ---
  readonly createAgentLifecycleDispatch: CreateAgentLifecycleDispatch;
  /** Flush bootstrapped agent updates after initial fetch completes. */
  flushBootstrappedAgentUpdates(options?: unknown): void;
  /** Check if an agent matches the subscription filter. */
  matchesAgentFilter(options: unknown): boolean;
  /** Forward an agent update to subscribers. */
  forwardAgentUpdate(agent: unknown): Promise<void>;
  /** Build a stored agent payload. */
  buildStoredAgentPayload(record: unknown): unknown;
  /** Build a project placement for a cwd. */
  buildProjectPlacementForCwd(cwd: string): Promise<unknown>;
  /** Build an agent session config (full signature for create_agent flow). */
  buildAgentSessionConfig(
    config: unknown,
    gitOptions?: unknown,
    legacyWorktreeName?: string,
    firstAgentContext?: unknown,
  ): Promise<unknown>;
  /** Resolve the workspace for creating an agent. */
  resolveCreateAgentWorkspace(cwd: string, workspaceId?: string): Promise<unknown>;
  /** Build an agent payload from a managed agent. */
  buildAgentPayload(agent: unknown): Promise<unknown>;
  /** Check if a provider is visible to the client. */
  isProviderVisibleToClient(provider: string): boolean;
  /** Build a workspace descriptor from input. */
  buildWorkspaceDescriptor(input: unknown): Promise<unknown>;

  // --- Agent selection helpers (for workspace auto-name) ---
  getFocusedAgentSelectionForCwd(cwd: string):
    | {
        provider?: string | null;
        model?: string | null;
        thinkingOptionId?: string | null;
      }
    | undefined;
  readStructuredGenerationDaemonConfig(): StructuredGenerationDaemonConfig;

  // --- Additional shared services ---
  readonly downloadTokenStore: DownloadTokenStore;
  readonly pushTokenStore: PushTokenStore;
  readonly usageStore: UsageStore | null;
  readonly workspaceSetupSnapshots: Map<string, WorkspaceSetupSnapshot>;
  readonly sttLanguage: string;

  // --- Workspace helpers (WorkspaceProjectHandler) ---
  resolveKnownProjectRootForConfig(repoRoot: string): Promise<string | null>;
  listFetchWorkspacesEntries(request: unknown): Promise<{
    entries: WorkspaceDescriptorPayload[];
    pageInfo: { hasNextPage: boolean; cursor: string | null };
  }>;
  syncWorkspaceGitObservers(workspaces: Iterable<WorkspaceDescriptorPayload>): void;
  syncWorkspaceGitObserverForWorkspace(workspace: PersistedWorkspaceRecord): Promise<void>;
  findOrCreateWorkspaceForDirectory(cwd: string): Promise<PersistedWorkspaceRecord>;
  describeWorkspaceRecord(
    workspace: PersistedWorkspaceRecord,
    projectRecord?: unknown,
  ): Promise<WorkspaceDescriptorPayload>;
  describeCreatedWorktreeWorkspace(
    result: CreateChisaCodeWorktreeResult,
  ): Promise<WorkspaceDescriptorPayload>;
  createChisaCodeWorktreeWorkflow(
    input: unknown,
    options?: unknown,
  ): Promise<CreateChisaCodeWorktreeWorkflowResult>;
  archiveWorkspaceRecord(workspaceId: string, archivedAt?: string): Promise<void>;
  markWorkspaceArchiving(workspaceIds: Iterable<string>, archivingAt: string): void;
  clearWorkspaceArchiving(workspaceIds: Iterable<string>): void;
  isPathWithinRoot(rootPath: string, candidatePath: string): boolean;
  getAvailableEditorTargets(): Promise<EditorTargetDescriptorPayload[]>;
  openEditorTarget(options: { editorId: EditorTargetId; path: string }): Promise<void>;
  hasBinaryChannel(): boolean;
  emitBinary(frame: Uint8Array): void;

  // --- Daemon runtime info (for ConfigControlHandler) ---
  readonly serverId: string | undefined;
  readonly daemonVersion: string | undefined;
  readonly daemonRuntimeConfig: DaemonRuntimeConfig | undefined;
  readonly mcpBaseUrl: string | null;
}

export interface DaemonRuntimeConfig {
  listen: string | null;
  relay: {
    enabled: boolean;
    endpoint: string;
    publicEndpoint: string;
    useTls: boolean;
    publicUseTls: boolean;
  } | null;
}

/**
 * A handler that can be disposed. Session.cleanup() calls dispose() on every
 * registered handler so they can release subscriptions and timers.
 */
export interface DisposableHandler {
  dispose(): void;
}
