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
  readonly github: GitHubService | undefined;
  readonly checkoutDiffManager: CheckoutDiffManager;

  // --- Lifecycle state (core-owned, shared) ---
  readonly abortController: AbortController;

  // --- Message emission (every handler needs this) ---
  emit(message: SessionOutboundMessage): void;
}

/**
 * A handler that can be disposed. Session.cleanup() calls dispose() on every
 * registered handler so they can release subscriptions and timers.
 */
export interface DisposableHandler {
  dispose(): void;
}
