import { randomUUID } from "node:crypto";
import {
  AGENT_LIFECYCLE_STATUSES,
  type AgentLifecycleStatus,
} from "@chisacode/protocol/agent-lifecycle";
import {
  labelsForAgentRelation,
  readAgentRelation,
  type AgentRelation,
} from "@chisacode/protocol/agent-labels";
import type { EffectiveMcpServersResult } from "./mcp-server-management.js";
import type { Logger } from "pino";
import { z } from "zod/v3";
import type { TerminalManager } from "../../terminal/terminal-manager.js";

import {
  getAgentStreamEventTurnId,
  type AgentCapabilityFlags,
  type AgentClient,
  type AgentCreateSessionOptions,
  type AgentFeature,
  type AgentSlashCommand,
  type AgentMode,
  type AgentPermissionRequest,
  type AgentPermissionResponse,
  type AgentPermissionResult,
  type AgentPersistenceHandle,
  type AgentPromptInput,
  type AgentProvider,
  type AgentRunOptions,
  type AgentRunResult,
  type AgentSession,
  type AgentSessionConfig,
  type AgentSkillEffectivePolicy,
  type AgentStreamEvent,
  type AgentTimelineItem,
  type AgentUsage,
  type AgentRuntimeInfo,
  type ListPersistedAgentsOptions,
  type PersistedAgentDescriptor,
} from "./agent-sdk-types.js";
import type { AgentStorage, StoredAgentRecord, StoredAgentTitleSource } from "./agent-storage.js";
import type {
  AgentTimelineFetchOptions,
  AgentTimelineFetchResult,
  AgentTimelineRow,
  AgentTimelineStore,
} from "./agent-timeline-store-types.js";
import { AgentTimelineController } from "./agent-timeline-controller.js";
import { AgentLaunchConfigController } from "./agent-launch-config-controller.js";
import {
  AgentProviderController,
  type ImportablePersistedAgentQueryOptions,
  type ProviderAvailability,
  type ProviderClientMap,
  type ProviderEnabledMap,
} from "./agent-provider-controller.js";
import {
  AGENT_STREAM_COALESCE_DEFAULT_WINDOW_MS,
  AgentStreamCoalescer,
} from "./agent-stream-coalescer.js";
import { ForegroundRunState, type ForegroundTurnWaiter } from "./foreground-run-state.js";
import type { RewindMode } from "./rewind/rewind.js";
import { formatSystemNotificationPrompt, isSystemInjectedEnvelope } from "./agent-prompt.js";
import { createUsageEventRecord, type UsageStore } from "../usage/usage-store.js";
import {
  GenerativeUiActionQueue,
  type GenerativeUiQueuedAction,
} from "./generative-ui-action-queue.js";
import { AgentHistoryController, type HydrateTimelineOptions } from "./agent-history-controller.js";
import { AgentManagerEventBus } from "./agent-manager-event-bus.js";
import { AgentArchiveController, type AgentArchivedCallback } from "./agent-archive-controller.js";
import { AgentMetadataController } from "./agent-metadata-controller.js";
import { AgentPermissionController } from "./agent-permission-controller.js";
import { AgentRunControlController } from "./agent-run-control-controller.js";
import { AgentRuntimeConfigurationController } from "./agent-runtime-configuration-controller.js";
import {
  AgentSessionRescueController,
  type AgentSessionRescueTimeouts,
} from "./agent-session-rescue-controller.js";
import {
  AgentWaitController,
  type WaitForAgentOptions,
  type WaitForAgentResult,
  type WaitForAgentStartOptions,
} from "./agent-wait-controller.js";
import { AgentForegroundExecutionController } from "./agent-foreground-execution-controller.js";

export { AGENT_LIFECYCLE_STATUSES, type AgentLifecycleStatus };
export type {
  AgentTimelineCursor,
  AgentTimelineFetchDirection,
  AgentTimelineFetchOptions,
  AgentTimelineFetchResult,
  AgentTimelineRow,
  AgentTimelineWindow,
} from "./agent-timeline-store-types.js";
export type {
  ImportablePersistedAgentQueryOptions,
  ProviderAvailability,
} from "./agent-provider-controller.js";
export type { AgentArchivedCallback } from "./agent-archive-controller.js";
export type { AgentSessionRescueTimeouts } from "./agent-session-rescue-controller.js";
export type {
  WaitForAgentOptions,
  WaitForAgentResult,
  WaitForAgentStartOptions,
} from "./agent-wait-controller.js";

export type AgentManagerEvent =
  | { type: "agent_state"; agent: ManagedAgent }
  | {
      type: "agent_stream";
      agentId: string;
      event: AgentStreamEvent;
      seq?: number;
      epoch?: string;
      timestamp?: string;
    };

export type AgentSubscriber = (event: AgentManagerEvent) => void;

export interface SubscribeOptions {
  agentId?: string;
  replayState?: boolean;
}

export type AgentAttentionCallback = (params: {
  agentId: string;
  provider: AgentProvider;
  reason: "finished" | "error" | "permission";
}) => void;

export interface AgentManagerOptions {
  clients?: ProviderClientMap;
  providerDefinitions?: ProviderEnabledMap;
  idFactory?: () => string;
  registry?: AgentStorage;
  onAgentAttention?: AgentAttentionCallback;
  durableTimelineStore?: AgentTimelineStore;
  terminalManager?: TerminalManager | null;
  mcpBaseUrl?: string;
  appendSystemPrompt?: string;
  resolveSkillPolicy?: (
    agentId: string,
    config: AgentSessionConfig,
  ) => AgentSkillEffectivePolicy | undefined;
  resolveMcpServers?: (
    agentId: string,
    config: AgentSessionConfig,
  ) => EffectiveMcpServersResult | undefined;
  usageStore?: UsageStore;
  agentStreamCoalesceWindowMs?: number;
  rescueTimeouts?: AgentSessionRescueTimeouts;
  logger: Logger;
}

type AttentionState =
  | { requiresAttention: false }
  | {
      requiresAttention: true;
      attentionReason: "finished" | "error" | "permission";
      attentionTimestamp: Date;
    };

function resolveInitialAttention(input: AttentionState | undefined): AttentionState {
  if (input == null || !input.requiresAttention) {
    return { requiresAttention: false };
  }
  return {
    requiresAttention: true,
    attentionReason: input.attentionReason,
    attentionTimestamp: new Date(input.attentionTimestamp),
  };
}

interface StreamEventFlags {
  shouldDispatchEvent: boolean;
  shouldNotifyWaiters: boolean;
}

interface HandleStreamEventOptions {
  fromHistory?: boolean;
}

interface ManagedAgentBase {
  id: string;
  provider: AgentProvider;
  cwd: string;
  capabilities: AgentCapabilityFlags;
  config: AgentSessionConfig;
  runtimeInfo?: AgentRuntimeInfo;
  createdAt: Date;
  updatedAt: Date;
  availableModes: AgentMode[];
  features?: AgentFeature[];
  currentModeId: string | null;
  pendingPermissions: Map<string, AgentPermissionRequest>;
  bufferedPermissionResolutions: Map<
    string,
    Extract<AgentStreamEvent, { type: "permission_resolved" }>
  >;
  inFlightPermissionResponses: Set<string>;
  pendingReplacement: boolean;
  persistence: AgentPersistenceHandle | null;
  historyPrimed: boolean;
  lastUserMessageAt: Date | null;
  lastUsage?: AgentUsage;
  lastError?: string;
  attention: AttentionState;
  foregroundTurnWaiters: Set<ForegroundTurnWaiter>;
  finalizedForegroundTurnIds: Set<string>;
  unsubscribeSession: (() => void) | null;
  /**
   * Internal agents are hidden from listings and don't trigger notifications.
   */
  internal?: boolean;
  /**
   * User-defined labels for categorizing agents (e.g., { surface: "workspace" }).
   */
  labels: Record<string, string>;
  relation?: AgentRelation;
}

type ManagedAgentWithSession = ManagedAgentBase & {
  session: AgentSession;
};

type ManagedAgentInitializing = ManagedAgentWithSession & {
  lifecycle: "initializing";
  activeForegroundTurnId: null;
};

type ManagedAgentIdle = ManagedAgentWithSession & {
  lifecycle: "idle";
  activeForegroundTurnId: null;
};

type ManagedAgentRunning = ManagedAgentWithSession & {
  lifecycle: "running";
  activeForegroundTurnId: string | null;
};

type ManagedAgentError = ManagedAgentWithSession & {
  lifecycle: "error";
  activeForegroundTurnId: null;
  lastError: string;
};

type ManagedAgentClosed = ManagedAgentBase & {
  lifecycle: "closed";
  session: null;
  activeForegroundTurnId: null;
};

export type ManagedAgent =
  | ManagedAgentInitializing
  | ManagedAgentIdle
  | ManagedAgentRunning
  | ManagedAgentError
  | ManagedAgentClosed;

export interface AgentMetricsSnapshot {
  total: number;
  byLifecycle: Record<string, number>;
  withActiveForegroundTurn: number;
  timelineStats: {
    totalItems: number;
    maxItemsPerAgent: number;
  };
}

type ActiveManagedAgent =
  | ManagedAgentInitializing
  | ManagedAgentIdle
  | ManagedAgentRunning
  | ManagedAgentError;

const SYSTEM_ERROR_PREFIX = "[System Error]";

function attachPersistenceCwd(
  handle: AgentPersistenceHandle | null,
  cwd: string,
): AgentPersistenceHandle | null {
  if (!handle) {
    return null;
  }
  return {
    ...handle,
    metadata: {
      ...handle.metadata,
      cwd,
    },
  };
}

const AgentIdSchema = z.string().uuid();

function isTurnTerminalEvent(event: AgentStreamEvent): boolean {
  return (
    event.type === "turn_completed" ||
    event.type === "turn_failed" ||
    event.type === "turn_canceled"
  );
}

function validateAgentId(agentId: string, source: string): string {
  const result = AgentIdSchema.safeParse(agentId);
  if (!result.success) {
    throw new Error(`${source}: agentId must be a UUID`);
  }
  return result.data;
}

export class AgentManager {
  private readonly agents = new Map<string, ActiveManagedAgent>();
  private readonly archive: AgentArchiveController;
  private readonly foregroundExecution: AgentForegroundExecutionController;
  private readonly history: AgentHistoryController;
  private readonly launchConfig: AgentLaunchConfigController;
  private readonly metadata: AgentMetadataController;
  private readonly permissions: AgentPermissionController;
  private readonly providers: AgentProviderController;
  private readonly runControl: AgentRunControlController;
  private readonly runtimeConfiguration: AgentRuntimeConfigurationController;
  private readonly sessionRescue: AgentSessionRescueController;
  private readonly timeline: AgentTimelineController;
  private readonly waits: AgentWaitController;
  private readonly agentsAwaitingInitialSnapshotPersist = new Set<string>();
  private readonly sessionEventTails = new Map<string, Promise<void>>();
  private readonly foregroundRuns = new ForegroundRunState();
  private readonly eventBus: AgentManagerEventBus;
  private readonly idFactory: () => string;
  private readonly registry?: AgentStorage;
  private readonly previousStatuses = new Map<string, AgentLifecycleStatus>();
  private readonly backgroundTasks = new Set<Promise<void>>();
  private readonly agentStreamCoalescer: AgentStreamCoalescer;
  private readonly generativeUiActionQueue: GenerativeUiActionQueue;
  private onAgentAttention?: AgentAttentionCallback;
  private logger: Logger;
  private readonly usageStore?: UsageStore;

  constructor(options: AgentManagerOptions) {
    this.idFactory = options?.idFactory ?? (() => randomUUID());
    this.registry = options?.registry;
    this.onAgentAttention = options?.onAgentAttention;
    this.usageStore = options.usageStore;
    this.logger = options.logger.child({ module: "agent", component: "agent-manager" });
    this.eventBus = new AgentManagerEventBus({
      logger: this.logger,
      validateAgentId,
      getAgent: (agentId) => this.agents.get(agentId) ?? null,
      listAgents: () => this.agents.values(),
    });
    this.waits = new AgentWaitController({
      getAgent: (agentId) => this.getAgent(agentId),
      getLastAssistantMessage: (agentId) => this.getLastAssistantMessage(agentId),
      getPendingRun: (agentId) => this.foregroundRuns.getPendingRun(agentId),
      subscribe: (callback, waitOptions) => this.subscribe(callback, waitOptions),
    });
    this.permissions = new AgentPermissionController({
      broadcastAttention: (agent) => this.broadcastAgentAttention(agent, "permission"),
      dispatchStream: (agentId, event, metadata) => this.dispatchStream(agentId, event, metadata),
      emitState: (agent) => this.emitState(agent),
      getAgent: (agentId) => this.requireSessionAgent(agentId),
      getSessionEventTail: (agentId) => this.sessionEventTails.get(agentId),
      logger: this.logger,
      persistSnapshot: (agent) => this.persistSnapshot(agent),
      refreshSessionState: (agent) => this.refreshSessionState(agent),
      touchUpdatedAt: (agent) => this.touchUpdatedAt(agent),
    });
    this.foregroundExecution = new AgentForegroundExecutionController({
      attachPersistenceCwd,
      emitState: (agent) => this.emitState(agent),
      foregroundRuns: this.foregroundRuns,
      getAgent: (agentId) => this.requireSessionAgent(agentId),
      handleStreamEvent: (agent, event) => this.handleStreamEvent(agent, event),
      isTerminalEvent: isTurnTerminalEvent,
      logger: this.logger,
      onAgentTerminal: (agentId) => this.generativeUiActionQueue.onAgentTerminal(agentId),
      refreshRuntimeInfo: (agent) => this.refreshRuntimeInfo(agent),
      touchUpdatedAt: (agent) => this.touchUpdatedAt(agent),
    });
    this.providers = new AgentProviderController({
      clients: options.clients ?? {},
      providerDefinitions: options.providerDefinitions ?? {},
      logger: this.logger,
    });
    this.launchConfig = new AgentLaunchConfigController({
      appendSystemPrompt: options.appendSystemPrompt ?? "",
      logger: this.logger,
      mcpBaseUrl: options.mcpBaseUrl ?? null,
      providers: this.providers,
      resolveMcpServers: options.resolveMcpServers,
      resolveSkillPolicy: options.resolveSkillPolicy,
    });
    this.timeline = new AgentTimelineController({
      durableStore: options.durableTimelineStore,
      logger: this.logger,
      trackBackgroundTask: (task) => this.trackBackgroundTask(task),
    });
    this.metadata = new AgentMetadataController({
      emitState: (agent, emitOptions) => this.emitState(agent, emitOptions),
      getAgent: (agentId) => this.agents.get(agentId) ?? null,
      isAwaitingInitialSnapshotPersist: (agentId) =>
        this.agentsAwaitingInitialSnapshotPersist.has(agentId),
      persistSnapshot: (agent, persistOptions) => this.persistSnapshot(agent, persistOptions),
      registry: this.registry,
    });
    this.runtimeConfiguration = new AgentRuntimeConfigurationController({
      emitState: (agent) => this.emitState(agent),
      providers: this.providers,
      reloadAgentSession: async (agentId, overrides) => {
        await this.reloadAgentSession(agentId, overrides);
      },
      touchUpdatedAt: (agent) => this.touchUpdatedAt(agent),
    });
    this.archive = new AgentArchiveController({
      archiveNativeSessionBestEffort: (provider, persistence) =>
        this.providers.archiveNativeSessionBestEffort(provider, persistence),
      closeAgent: (agentId) => this.closeAgent(agentId),
      dispatchAgentState: (agent) => this.dispatch({ type: "agent_state", agent }),
      getAgent: (agentId) => this.agents.get(agentId) ?? null,
      logger: this.logger,
      notifyAgentState: (agentId) => this.notifyAgentState(agentId),
      persistSnapshot: (agent, persistOptions) => this.persistSnapshot(agent, persistOptions),
      registry: this.registry,
    });
    this.sessionRescue = new AgentSessionRescueController(this.logger, options.rescueTimeouts);
    this.runControl = new AgentRunControlController({
      clearPendingPermissions: (agent) => this.permissions.clearAfterInterrupt(agent),
      dispatchSessionEvent: (agent, event) => this.dispatchSessionEvent(agent, event),
      emitState: (agent) => this.emitState(agent),
      findAgent: (agentId) => this.agents.get(agentId) ?? null,
      foregroundRuns: this.foregroundRuns,
      getAgent: (agentId) => this.requireSessionAgent(agentId),
      interruptSession: (session, agentId) => this.sessionRescue.interruptSession(session, agentId),
      logger: this.logger,
      streamAgent: (agentId, prompt, runOptions) =>
        this.foregroundExecution.stream(agentId, prompt, runOptions),
      subscribe: (callback, subscribeOptions) => this.subscribe(callback, subscribeOptions),
      touchUpdatedAt: (agent) => this.touchUpdatedAt(agent),
    });
    this.generativeUiActionQueue = new GenerativeUiActionQueue({
      getAgentStatus: (agentId) => {
        const agent = this.agents.get(agentId);
        if (!agent) return undefined;
        return this.hasInFlightRun(agentId) ? "running" : agent.lifecycle;
      },
      dispatchPrompt: (agentId, prompt) => this.initiateGenerativeUiPrompt(agentId, prompt),
      log: (metadata) => {
        this.logger.warn(metadata, "Generative UI action batch was dropped");
      },
    });
    this.agentStreamCoalescer = new AgentStreamCoalescer({
      windowMs: options.agentStreamCoalesceWindowMs ?? AGENT_STREAM_COALESCE_DEFAULT_WINDOW_MS,
      timers: { setTimeout, clearTimeout },
      onFlush: ({ agentId, item, provider, turnId }) => {
        const event = this.recordAndDispatchTimelineItem(agentId, item, provider, turnId);
        this.notifyForegroundTurnWaiters(agentId, event);
      },
    });
    this.history = new AgentHistoryController({
      cancelAgentRun: (agentId) => this.runControl.cancel(agentId),
      coalescer: this.agentStreamCoalescer,
      dispatchStream: (agentId, event, metadata) => this.dispatchStream(agentId, event, metadata),
      emitState: (agent) => this.emitState(agent),
      foregroundRuns: this.foregroundRuns,
      getAgent: (agentId) => this.requireSessionAgent(agentId),
      logger: this.logger,
      persistSnapshot: (agent) => this.persistSnapshot(agent),
      refreshRuntimeInfo: (agent) => this.refreshRuntimeInfo(agent),
      timeline: this.timeline,
      touchUpdatedAt: (agent) => this.touchUpdatedAt(agent),
    });
  }

  /**
   * Enqueues a generative UI action without interrupting an active agent turn.
   * @param agentId Target agent identifier
   * @param action Validated action payload
   * @returns Confirmation that the action entered the manager-owned queue
   */
  enqueueGenerativeUiAction(agentId: string, action: GenerativeUiQueuedAction): { queued: true } {
    this.requireAgent(agentId);
    this.generativeUiActionQueue.enqueue(agentId, action);
    return { queued: true };
  }

  private async initiateGenerativeUiPrompt(agentId: string, prompt: string): Promise<void> {
    let started = false;
    let resolveInitiated!: () => void;
    let rejectInitiated!: (error: unknown) => void;
    const initiated = new Promise<void>((resolvePromise, rejectPromise) => {
      resolveInitiated = resolvePromise;
      rejectInitiated = rejectPromise;
    });
    const task = (async () => {
      try {
        for await (const _event of this.foregroundExecution.stream(
          agentId,
          formatSystemNotificationPrompt(prompt),
          undefined,
          {
            onStarted: () => {
              started = true;
              resolveInitiated();
            },
            onStartFailed: rejectInitiated,
          },
        )) {
          // The normal session event pipeline persists and broadcasts every event.
        }
      } catch (error) {
        if (!started) {
          rejectInitiated(error);
          return;
        }
        this.logger.warn(
          { agentId, reason: "dispatch_failed" },
          "Generative UI follow-up prompt failed after initiation",
        );
      }
    })();
    this.trackBackgroundTask(task);
    await initiated;
  }
  registerClient(provider: AgentProvider, client: AgentClient): void {
    this.providers.registerClient(provider, client);
  }

  updateProviderRegistry(input: {
    providerDefinitions: ProviderEnabledMap;
    clients: ProviderClientMap;
  }): void {
    this.providers.updateProviderRegistry(input);
  }

  getRegisteredProviderIds(): AgentProvider[] {
    return this.providers.getRegisteredProviderIds();
  }

  setAgentAttentionCallback(callback: AgentAttentionCallback): void {
    this.onAgentAttention = callback;
  }

  setAgentArchivedCallback(callback: AgentArchivedCallback): void {
    this.archive.setArchivedCallback(callback);
  }

  setMcpBaseUrl(url: string | null): void {
    this.launchConfig.setMcpBaseUrl(url);
  }

  validateCompanionMcpToken(parentAgentId: string, token: string): boolean {
    return this.launchConfig.validateCompanionMcpToken(parentAgentId, token);
  }

  setAppendSystemPrompt(prompt: string | null | undefined): void {
    this.launchConfig.setAppendSystemPrompt(prompt);
  }

  public getMetricsSnapshot(): AgentMetricsSnapshot {
    const byLifecycle: Record<string, number> = {};
    let withActiveForegroundTurn = 0;
    let totalItems = 0;
    let maxItemsPerAgent = 0;

    for (const agent of this.agents.values()) {
      byLifecycle[agent.lifecycle] = (byLifecycle[agent.lifecycle] ?? 0) + 1;

      if (agent.activeForegroundTurnId !== null) {
        withActiveForegroundTurn++;
      }

      if (!this.timeline.has(agent.id)) {
        continue;
      }

      const len = this.timeline.getItemCount(agent.id);
      totalItems += len;
      if (len > maxItemsPerAgent) {
        maxItemsPerAgent = len;
      }
    }

    return {
      total: this.agents.size,
      byLifecycle,
      withActiveForegroundTurn,
      timelineStats: {
        totalItems,
        maxItemsPerAgent,
      },
    };
  }

  private touchUpdatedAt(agent: ManagedAgent): Date {
    return this.metadata.touchUpdatedAt(agent);
  }

  hasInFlightRun(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return false;
    }

    return (
      agent.lifecycle === "running" ||
      Boolean(agent.activeForegroundTurnId) ||
      this.foregroundRuns.hasPendingRun(agentId)
    );
  }

  subscribe(callback: AgentSubscriber, options?: SubscribeOptions): () => void {
    return this.eventBus.subscribe(callback, options);
  }

  listAgents(): ManagedAgent[] {
    return Array.from(this.agents.values())
      .filter((agent) => !agent.internal)
      .map((agent) => Object.assign({}, agent));
  }

  async listImportablePersistedAgents(
    options?: ImportablePersistedAgentQueryOptions,
  ): Promise<PersistedAgentDescriptor[]> {
    return await this.providers.listImportablePersistedAgents(options);
  }

  async findPersistedAgent(
    provider: AgentProvider,
    sessionId: string,
    options?: Pick<ListPersistedAgentsOptions, "cwd">,
  ): Promise<PersistedAgentDescriptor | null> {
    return await this.providers.findPersistedAgent(provider, sessionId, options);
  }

  async listProviderAvailability(): Promise<ProviderAvailability[]> {
    return await this.providers.listProviderAvailability();
  }

  async listDraftCommands(config: AgentSessionConfig): Promise<AgentSlashCommand[]> {
    const normalizedConfig = await this.launchConfig.normalizeConfig(config);
    const launchConfig = this.launchConfig.buildRuntimeLaunchConfig(normalizedConfig);
    return await this.providers.listDraftCommands(launchConfig, normalizedConfig.provider);
  }

  async listDraftFeatures(config: AgentSessionConfig): Promise<AgentFeature[]> {
    const normalizedConfig = await this.launchConfig.normalizeConfig(config);
    const launchConfig = this.launchConfig.buildRuntimeLaunchConfig(normalizedConfig);
    return await this.providers.listDraftFeatures(launchConfig, normalizedConfig.provider);
  }

  getAgent(id: string): ManagedAgent | null {
    const agent = this.agents.get(id);
    return agent ? { ...agent } : null;
  }

  getTimeline(id: string): AgentTimelineItem[] {
    this.requireAgent(id);
    return this.timeline.getItems(id);
  }

  async getTimelineRows(id: string): Promise<AgentTimelineRow[]> {
    this.requireAgent(id);
    return await this.timeline.getRows(id);
  }

  fetchTimeline(id: string, options?: AgentTimelineFetchOptions): AgentTimelineFetchResult {
    this.requireAgent(id);
    return this.timeline.fetch(id, options);
  }

  async createAgent(
    config: AgentSessionConfig,
    agentId?: string,
    options?: {
      labels?: Record<string, string>;
      relation?: AgentRelation;
      workspaceId?: string;
      initialPrompt?: string;
      env?: Record<string, string>;
      persistSession?: boolean;
      initialTitle?: string | null;
    },
  ): Promise<ManagedAgent> {
    const resolvedAgentId = validateAgentId(agentId ?? this.idFactory(), "createAgent");
    this.providers.requireEnabledProvider(config.provider);
    this.providers.requireEnabledProvider(config.runtimeProvider ?? config.provider);
    const normalizedConfig = await this.launchConfig.prepareAgentConfig(config, resolvedAgentId);
    const launchConfig = this.launchConfig.buildRuntimeLaunchConfig(normalizedConfig);
    const launchContext = this.launchConfig.buildLaunchContext(resolvedAgentId, options?.env);
    const client = await this.providers.requireAvailableClient(launchConfig.provider);
    const createOptions = this.buildCreateSessionOptions(options);
    const session = await client.createSession(launchConfig, launchContext, createOptions);
    const relation = readAgentRelation(options?.labels, options?.relation) ?? undefined;
    return this.registerSession(session, normalizedConfig, resolvedAgentId, {
      labels: labelsForAgentRelation(options?.labels, relation),
      relation,
      workspaceId: options?.workspaceId,
      initialTitle: options?.initialTitle,
    });
  }

  private buildCreateSessionOptions(options?: {
    persistSession?: boolean;
  }): AgentCreateSessionOptions | undefined {
    return options?.persistSession === undefined
      ? undefined
      : { persistSession: options.persistSession };
  }

  // Reconstruct an agent from provider persistence. Callers should explicitly
  // hydrate timeline history after resume.
  async resumeAgentFromPersistence(
    handle: AgentPersistenceHandle,
    overrides?: Partial<AgentSessionConfig>,
    agentId?: string,
    options?: {
      createdAt?: Date;
      updatedAt?: Date;
      lastUserMessageAt?: Date | null;
      labels?: Record<string, string>;
      relation?: AgentRelation;
    },
  ): Promise<ManagedAgent> {
    const resolvedAgentId = validateAgentId(
      agentId ?? this.idFactory(),
      "resumeAgentFromPersistence",
    );
    const metadata = { ...((handle.metadata ?? {}) as Partial<AgentSessionConfig>) };
    delete metadata.title;
    const mergedConfig = {
      ...metadata,
      ...overrides,
      provider: handle.provider,
    } as AgentSessionConfig;
    const normalizedConfig = await this.launchConfig.prepareAgentConfig(
      mergedConfig,
      resolvedAgentId,
    );
    const resumeOverrides: Partial<AgentSessionConfig> = { ...overrides };
    let hasResumeOverrides = overrides !== undefined;

    if (normalizedConfig.model !== mergedConfig.model) {
      resumeOverrides.model = normalizedConfig.model;
      hasResumeOverrides = true;
    }

    if (normalizedConfig.modeId !== mergedConfig.modeId) {
      resumeOverrides.modeId = normalizedConfig.modeId;
      hasResumeOverrides = true;
    }

    if (metadata.daemonAppendSystemPrompt !== normalizedConfig.daemonAppendSystemPrompt) {
      resumeOverrides.daemonAppendSystemPrompt = normalizedConfig.daemonAppendSystemPrompt;
      hasResumeOverrides = true;
    }

    if (JSON.stringify(metadata.extra) !== JSON.stringify(normalizedConfig.extra)) {
      resumeOverrides.extra = normalizedConfig.extra;
      hasResumeOverrides = true;
    }

    const launchConfig = this.launchConfig.buildRuntimeLaunchConfig(normalizedConfig);
    const runtimeProvider = launchConfig.provider;
    const launchContext = this.launchConfig.buildLaunchContext(resolvedAgentId);
    const client = this.providers.requireClient(runtimeProvider);
    const available = await client.isAvailable();
    if (!available) {
      throw new Error(
        `Provider '${runtimeProvider}' is not available. Please ensure the CLI is installed.`,
      );
    }
    const session =
      handle.provider === runtimeProvider
        ? await client.resumeSession(
            handle,
            hasResumeOverrides ? resumeOverrides : undefined,
            launchContext,
          )
        : await client.createSession(launchConfig, launchContext);
    const relation = readAgentRelation(options?.labels, options?.relation) ?? undefined;
    return this.registerSession(session, normalizedConfig, resolvedAgentId, {
      ...options,
      labels: labelsForAgentRelation(options?.labels, relation),
      relation,
    });
  }

  // Hot-reload an active agent session with config overrides. By default the
  // in-memory timeline is preserved (used for voice-mode toggles and similar
  // config swaps). When `rehydrateFromDisk` is set, the timeline is wiped so a
  // new epoch is minted and provider history is re-streamed — this is what the
  // user-facing "Reload agent" action wants when the on-disk session was
  // mutated outside ChisaCode.
  async reloadAgentSession(
    agentId: string,
    overrides?: Partial<AgentSessionConfig>,
    options?: { rehydrateFromDisk?: boolean },
  ): Promise<ManagedAgent> {
    let existing = this.requireSessionAgent(agentId);
    if (this.hasInFlightRun(agentId)) {
      await this.cancelAgentRun(agentId);
      existing = this.requireSessionAgent(agentId);
    }
    const rehydrateFromDisk = options?.rehydrateFromDisk ?? false;
    const preservedHistoryPrimed = existing.historyPrimed;
    const preservedLastUsage = existing.lastUsage;
    const preservedLastError = existing.lastError;
    const preservedAttention = existing.attention;
    const handle = existing.persistence;
    const currentRuntimeProvider =
      handle?.provider ?? existing.config.runtimeProvider ?? existing.provider;
    const runtimeProvider =
      overrides?.runtimeProvider ?? existing.config.runtimeProvider ?? currentRuntimeProvider;
    const client = this.providers.requireClient(runtimeProvider);
    const reloadHandle = handle?.provider === runtimeProvider ? handle : null;
    const refreshConfig = {
      ...existing.config,
      ...overrides,
      provider: existing.provider,
      runtimeProvider,
    } as AgentSessionConfig;
    const normalizedConfig = await this.launchConfig.prepareAgentConfig(refreshConfig, agentId);
    const launchConfig = this.launchConfig.buildRuntimeLaunchConfig(normalizedConfig);
    const launchContext = this.launchConfig.buildLaunchContext(agentId);

    const session = reloadHandle
      ? await client.resumeSession(reloadHandle, launchConfig, launchContext)
      : await client.createSession(launchConfig, launchContext);

    this.agentStreamCoalescer.flushAndDiscard(agentId);
    // Remove the existing agent entry before swapping sessions
    this.agents.delete(agentId);
    if (existing.unsubscribeSession) {
      existing.unsubscribeSession();
      existing.unsubscribeSession = null;
    }
    this.foregroundRuns.clearAgent(agentId, existing);
    await this.sessionRescue.closeReloadedSession(existing.session, agentId);

    if (rehydrateFromDisk) {
      // Wipe both durable and in-memory timeline so registerSession mints a
      // new epoch and hydrateTimelineFromProvider re-streams the freshly read
      // provider history into an empty timeline.
      await this.timeline.deleteAll(agentId);
    }

    // Preserve existing labels and timeline during reload.
    return this.registerSession(session, normalizedConfig, agentId, {
      labels: existing.labels,
      relation: existing.relation,
      createdAt: existing.createdAt,
      updatedAt: existing.updatedAt,
      lastUserMessageAt: existing.lastUserMessageAt,
      historyPrimed: rehydrateFromDisk ? false : preservedHistoryPrimed,
      lastUsage: preservedLastUsage,
      lastError: preservedLastError,
      attention: preservedAttention,
    });
  }

  async closeAgent(agentId: string): Promise<void> {
    const agent = this.requireAgent(agentId);
    this.generativeUiActionQueue.clearAgent(agentId);
    this.logger.trace(
      {
        agentId,
        provider: agent.provider,
        sessionId: agent.persistence?.sessionId ?? undefined,
        turnId: agent.activeForegroundTurnId ?? undefined,
        lifecycle: agent.lifecycle,
        activeForegroundTurnId: agent.activeForegroundTurnId,
        pendingPermissions: agent.pendingPermissions.size,
      },
      "agent.manager.close.start",
    );
    const closedAgent = this.prepareAgentForClosure(agent, "agent closed");
    await agent.session.close();
    this.timeline.deleteMemory(agentId);
    await this.persistSnapshot(closedAgent);
    this.emitClosedAgent(closedAgent, { persist: false });
    this.logger.trace(
      {
        agentId,
        provider: closedAgent.provider,
        sessionId: closedAgent.persistence?.sessionId ?? undefined,
      },
      "agent.manager.close.complete",
    );
  }

  async archiveAgent(agentId: string): Promise<{ archivedAt: string }> {
    const agent = this.requireAgent(agentId);
    return await this.archive.archiveAgent(agent);
  }

  async setAgentMode(agentId: string, modeId: string): Promise<void> {
    const agent = this.requireSessionAgent(agentId);
    await this.runtimeConfiguration.setMode(agent, modeId);
  }

  async setAgentModel(
    agentId: string,
    modelId: string | null,
    options?: { runtimeProvider?: AgentProvider | string | null },
  ): Promise<void> {
    const agent = this.requireSessionAgent(agentId);
    await this.runtimeConfiguration.setModel(agent, modelId, options);
  }

  async setAgentThinkingOption(agentId: string, thinkingOptionId: string | null): Promise<void> {
    const agent = this.requireSessionAgent(agentId);
    await this.runtimeConfiguration.setThinkingOption(agent, thinkingOptionId);
  }

  async setAgentFeature(agentId: string, featureId: string, value: unknown): Promise<void> {
    const agent = this.requireAgent(agentId);
    await this.runtimeConfiguration.setFeature(agent, featureId, value);
  }

  async setTitle(agentId: string, title: string): Promise<void> {
    const agent = this.requireAgent(agentId);
    await this.metadata.setTitle(agent, title);
  }

  async setGeneratedTitle(agentId: string, title: string): Promise<void> {
    const agent = this.requireAgent(agentId);
    await this.metadata.setGeneratedTitle(agent, title);
  }

  async setLabels(agentId: string, labels: Record<string, string>): Promise<void> {
    const agent = this.requireAgent(agentId);
    await this.metadata.setLabels(agent, labels);
  }

  notifyAgentState(agentId: string): void {
    this.metadata.notifyAgentState(agentId);
  }

  async clearAgentAttention(agentId: string): Promise<void> {
    const agent = this.requireAgent(agentId);
    await this.metadata.clearAgentAttention(agent);
  }

  async archiveSnapshot(agentId: string, archivedAt: string): Promise<StoredAgentRecord> {
    return await this.archive.archiveSnapshot(agentId, archivedAt);
  }

  async unarchiveSnapshot(agentId: string): Promise<boolean> {
    return await this.archive.unarchiveSnapshot(agentId);
  }

  async unarchiveSnapshotByHandle(handle: AgentPersistenceHandle): Promise<void> {
    await this.archive.unarchiveSnapshotByHandle(handle);
  }

  async updateAgentMetadata(
    agentId: string,
    updates: {
      title?: string;
      labels?: Record<string, string>;
    },
  ): Promise<void> {
    await this.metadata.updateAgentMetadata(agentId, updates);
  }

  async runAgent(
    agentId: string,
    prompt: AgentPromptInput,
    options?: AgentRunOptions,
  ): Promise<AgentRunResult> {
    const events = this.streamAgent(agentId, prompt, options);
    const timeline: AgentTimelineItem[] = [];
    let finalText = "";
    let usage: AgentUsage | undefined;
    let canceled = false;

    for await (const event of events) {
      if (event.type === "timeline") {
        timeline.push(event.item);
      } else if (event.type === "turn_completed") {
        usage = event.usage;
      } else if (event.type === "turn_failed") {
        throw new Error(this.formatTurnFailedMessage(event));
      } else if (event.type === "turn_canceled") {
        canceled = true;
      }
    }

    finalText = this.getLastAssistantMessageFromTimeline(timeline) ?? "";

    const agent = this.requireAgent(agentId);
    const sessionId = agent.persistence?.sessionId;
    if (!sessionId) {
      throw new Error(`Agent ${agentId} has no persistence.sessionId after run completed`);
    }
    return {
      sessionId,
      finalText,
      usage,
      timeline,
      canceled,
    };
  }

  /**
   * Try to run a prompt out-of-band — i.e. without allocating a foreground turn
   * and without canceling any active turn. Returns true when the session
   * accepted the prompt as a side-effect command (e.g. /goal pause). Events
   * emitted by the handler flow through dispatchStream so they persist and
   * broadcast like normal timeline events.
   */
  tryRunOutOfBand(agentId: string, prompt: AgentPromptInput): boolean {
    const agent = this.requireSessionAgent(agentId);
    const handler = agent.session.tryHandleOutOfBand?.(prompt);
    if (!handler) {
      return false;
    }
    const dispatch = (event: AgentStreamEvent): void => {
      // Persist timeline items so they show up in fetchAgentTimeline; broadcast
      // for live subscribers. Other event types are broadcast only.
      if (event.type === "timeline") {
        this.touchUpdatedAt(agent);
        const row = this.recordTimeline(agent.id, event.item);
        this.dispatchStream(agent.id, event, {
          seq: row.seq,
          epoch: this.timeline.getEpoch(agent.id),
          timestamp: row.timestamp,
        });
        return;
      }
      this.dispatchStream(agent.id, event, { timestamp: new Date().toISOString() });
    };
    void (async () => {
      try {
        await handler.run({ emit: dispatch });
      } catch (error) {
        const text = error instanceof Error ? error.message : "Out-of-band command failed";
        dispatch({
          type: "timeline",
          provider: agent.provider,
          item: { type: "assistant_message", text: `[Error] ${text}` },
        });
      }
    })();
    return true;
  }

  async appendTimelineItem(agentId: string, item: AgentTimelineItem): Promise<void> {
    const agent = this.requireAgent(agentId);
    this.touchUpdatedAt(agent);
    const row = this.recordTimeline(agentId, item);
    this.dispatchStream(
      agentId,
      {
        type: "timeline",
        item,
        provider: agent.provider,
      },
      {
        seq: row.seq,
        epoch: this.timeline.getEpoch(agentId),
        timestamp: row.timestamp,
      },
    );
    await this.persistSnapshot(agent);
  }

  async emitLiveTimelineItem(agentId: string, item: AgentTimelineItem): Promise<void> {
    const agent = this.requireAgent(agentId);
    this.touchUpdatedAt(agent);
    this.dispatchStream(agentId, {
      type: "timeline",
      item,
      provider: agent.provider,
    });
  }

  streamAgent(
    agentId: string,
    prompt: AgentPromptInput,
    options?: AgentRunOptions,
  ): AsyncGenerator<AgentStreamEvent> {
    return this.foregroundExecution.stream(agentId, prompt, options);
  }

  replaceAgentRun(
    agentId: string,
    prompt: AgentPromptInput,
    options?: AgentRunOptions,
  ): AsyncGenerator<AgentStreamEvent> {
    return this.runControl.replace(agentId, prompt, options);
  }

  async waitForAgentRunStart(agentId: string, options?: WaitForAgentStartOptions): Promise<void> {
    await this.waits.waitForRunStart(agentId, options);
  }

  async respondToPermission(
    agentId: string,
    requestId: string,
    response: AgentPermissionResponse,
  ): Promise<AgentPermissionResult | void> {
    return this.permissions.respond(agentId, requestId, response);
  }

  async cancelAgentRun(agentId: string): Promise<boolean> {
    return this.runControl.cancel(agentId);
  }

  getPendingPermissions(agentId: string): AgentPermissionRequest[] {
    return this.permissions.list(agentId);
  }

  /**
   * Hydrates the timeline from provider history if the agent's durable
   * timeline is empty (e.g., imported agents that have provider history
   * on disk but no persisted timeline rows). No-ops if already hydrated.
   */
  async hydrateTimelineFromProvider(
    agentId: string,
    options?: HydrateTimelineOptions,
  ): Promise<void> {
    await this.history.hydrate(agentId, options);
  }

  async rewind(agentId: string, messageId: string, mode: RewindMode): Promise<void> {
    await this.history.rewind(agentId, messageId, mode);
  }

  async deleteCommittedTimeline(agentId: string): Promise<void> {
    await this.timeline.deleteCommitted(agentId);
  }

  async getLastAssistantMessage(agentId: string): Promise<string | null> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return null;
    }

    return await this.timeline.getLastAssistantMessage(agentId);
  }

  private getLastAssistantMessageFromTimeline(
    timeline: readonly AgentTimelineItem[],
  ): string | null {
    const chunks: string[] = [];
    for (let i = timeline.length - 1; i >= 0; i--) {
      const item = timeline[i];
      if (item.type !== "assistant_message") {
        if (chunks.length) {
          break;
        }
        continue;
      }
      chunks.push(item.text);
    }
    return chunks.length > 0 ? chunks.toReversed().join("") : null;
  }

  async waitForAgentEvent(
    agentId: string,
    options?: WaitForAgentOptions,
  ): Promise<WaitForAgentResult> {
    return await this.waits.waitForEvent(agentId, options);
  }

  private async registerSession(
    session: AgentSession,
    config: AgentSessionConfig,
    agentId: string,
    options?: {
      workspaceId?: string;
      createdAt?: Date;
      updatedAt?: Date;
      lastUserMessageAt?: Date | null;
      labels?: Record<string, string>;
      relation?: AgentRelation;
      timeline?: AgentTimelineItem[];
      timelineRows?: AgentTimelineRow[];
      timelineNextSeq?: number;
      historyPrimed?: boolean;
      lastUsage?: AgentUsage;
      lastError?: string;
      attention?: AttentionState;
      initialTitle?: string | null;
    },
  ): Promise<ManagedAgent> {
    const resolvedAgentId = validateAgentId(agentId, "registerSession");
    if (this.agents.has(resolvedAgentId)) {
      throw new Error(`Agent with id ${resolvedAgentId} already exists`);
    }
    const initialPersistedTitle = await this.resolveInitialPersistedTitle(
      resolvedAgentId,
      config,
      options?.initialTitle ?? null,
    );

    const now = new Date();
    const { durableTimelineHasRows } = await this.timeline.initializeForAgent({
      agentId: resolvedAgentId,
      now,
      options,
    });

    const managed = this.buildManagedAgentForRegister({
      resolvedAgentId,
      session,
      config,
      now,
      durableTimelineHasRows,
      options,
    });

    this.agents.set(resolvedAgentId, managed);
    // Initialize previousStatus to track transitions
    this.previousStatuses.set(resolvedAgentId, managed.lifecycle);
    await this.refreshRuntimeInfo(managed);
    await this.persistSnapshot(managed, {
      workspaceId: options?.workspaceId,
      title: initialPersistedTitle.title,
      titleSource: initialPersistedTitle.titleSource,
    });
    this.emitState(managed, { persist: false });

    await this.refreshSessionState(managed);
    managed.lifecycle = "idle";
    await this.persistSnapshot(managed, { workspaceId: options?.workspaceId });
    this.emitState(managed, { persist: false });
    this.subscribeToSession(managed);
    return { ...managed };
  }

  private buildManagedAgentForRegister(params: {
    resolvedAgentId: string;
    session: AgentSession;
    config: AgentSessionConfig;
    now: Date;
    durableTimelineHasRows: boolean;
    options:
      | {
          createdAt?: Date;
          updatedAt?: Date;
          lastUserMessageAt?: Date | null;
          labels?: Record<string, string>;
          relation?: AgentRelation;
          historyPrimed?: boolean;
          lastUsage?: AgentUsage;
          lastError?: string;
          attention?: AttentionState;
        }
      | undefined;
  }): ActiveManagedAgent {
    const { resolvedAgentId, session, config, now, durableTimelineHasRows, options } = params;
    return {
      id: resolvedAgentId,
      provider: config.provider,
      cwd: config.cwd,
      session,
      capabilities: session.capabilities,
      config,
      runtimeInfo: undefined,
      lifecycle: "initializing",
      createdAt: options?.createdAt ?? now,
      updatedAt: options?.updatedAt ?? now,
      availableModes: [],
      currentModeId: null,
      pendingPermissions: new Map<string, AgentPermissionRequest>(),
      bufferedPermissionResolutions: new Map(),
      inFlightPermissionResponses: new Set(),
      pendingReplacement: false,
      activeForegroundTurnId: null,
      foregroundTurnWaiters: new Set<ForegroundTurnWaiter>(),
      finalizedForegroundTurnIds: new Set<string>(),
      unsubscribeSession: null,
      persistence: attachPersistenceCwd(session.describePersistence(), config.cwd),
      historyPrimed: options?.historyPrimed ?? durableTimelineHasRows,
      lastUserMessageAt: options?.lastUserMessageAt ?? null,
      lastUsage: options?.lastUsage,
      lastError: options?.lastError,
      attention: resolveInitialAttention(options?.attention),
      internal: config.internal ?? false,
      labels: options?.labels ?? {},
      relation: options?.relation,
    } as ActiveManagedAgent;
  }

  private prepareAgentForClosure(
    agent: ActiveManagedAgent,
    cancelReason: string,
  ): ManagedAgentClosed {
    this.agentStreamCoalescer.flushAndDiscard(agent.id);
    this.agents.delete(agent.id);
    this.previousStatuses.delete(agent.id);
    if (agent.unsubscribeSession) {
      agent.unsubscribeSession();
      agent.unsubscribeSession = null;
    }
    this.foregroundRuns.cancelWaiters(agent, (turnId) => ({
      type: "turn_canceled",
      provider: agent.provider,
      reason: cancelReason,
      turnId,
    }));
    this.foregroundRuns.settlePendingRun(agent.id);
    return {
      ...agent,
      lifecycle: "closed",
      session: null,
      activeForegroundTurnId: null,
    };
  }

  private emitClosedAgent(agent: ManagedAgentClosed, options?: { persist?: boolean }): void {
    this.emitState(agent, options);
  }
  private subscribeToSession(agent: ActiveManagedAgent): void {
    if (agent.unsubscribeSession) {
      return;
    }
    const agentId = agent.id;
    const unsubscribe = agent.session.subscribe((event: AgentStreamEvent) => {
      this.enqueueSessionEvent(agentId, event);
    });
    agent.unsubscribeSession = unsubscribe;
  }

  private enqueueSessionEvent(agentId: string, event: AgentStreamEvent): void {
    this.logger.trace(
      {
        agentId,
        provider: event.provider,
        sessionId: this.agents.get(agentId)?.persistence?.sessionId ?? undefined,
        turnId: getAgentStreamEventTurnId(event),
        event,
      },
      "agent.manager.enqueue",
    );
    const previous = this.sessionEventTails.get(agentId) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(async () => {
        const current = this.agents.get(agentId);
        if (!current) {
          return;
        }
        if (current.session == null) {
          return;
        }
        this.logger.trace(
          {
            agentId,
            provider: event.provider,
            sessionId: current.persistence?.sessionId ?? undefined,
            turnId: getAgentStreamEventTurnId(event),
            event,
          },
          "agent.manager.dequeue",
        );
        await this.dispatchSessionEvent(current, event);
        return;
      })
      .catch((err) => {
        this.logger.error(
          { err, agentId, eventType: event.type },
          "Failed to process session event",
        );
      });

    this.sessionEventTails.set(agentId, next);
    this.trackBackgroundTask(next);
    void next.finally(() => {
      if (this.sessionEventTails.get(agentId) === next) {
        this.sessionEventTails.delete(agentId);
      }
    });
  }

  private async dispatchSessionEvent(
    agent: ActiveManagedAgent,
    event: AgentStreamEvent,
  ): Promise<void> {
    const turnId = getAgentStreamEventTurnId(event);
    const matchingWaiters = this.foregroundRuns.getMatchingWaiters(agent, turnId);
    this.logger.trace(
      {
        agentId: agent.id,
        provider: event.provider,
        sessionId: agent.persistence?.sessionId ?? undefined,
        turnId,
        matchingWaiterCount: matchingWaiters.length,
        event,
      },
      "agent.manager.dispatch_session_event",
    );

    const shouldNotifyWaiters = await this.handleStreamEvent(agent, event);

    if (!shouldNotifyWaiters) {
      return;
    }

    this.foregroundRuns.notifyWaiters(matchingWaiters, event, {
      terminal: isTurnTerminalEvent(event),
    });
    if (isTurnTerminalEvent(event) && matchingWaiters.length === 0) {
      this.generativeUiActionQueue.onAgentTerminal(agent.id);
    }
    this.logger.trace(
      {
        agentId: agent.id,
        provider: event.provider,
        sessionId: agent.persistence?.sessionId ?? undefined,
        turnId,
        notifiedWaiterCount: matchingWaiters.length,
        terminal: isTurnTerminalEvent(event),
        event,
      },
      "agent.manager.notify_waiters",
    );
  }

  private async resolveInitialPersistedTitle(
    agentId: string,
    config: AgentSessionConfig,
    fallbackTitle: string | null,
  ): Promise<{ title: string | null; titleSource: StoredAgentTitleSource }> {
    const existing = await this.registry?.get(agentId);
    if (existing) {
      return {
        title: existing.title ?? null,
        titleSource: existing.titleSource ?? "legacy",
      };
    }
    const explicitTitle =
      typeof config.title === "string" && config.title.trim().length > 0
        ? config.title.trim()
        : null;
    if (explicitTitle) {
      return { title: explicitTitle, titleSource: "explicit" };
    }
    return {
      title: fallbackTitle,
      titleSource: fallbackTitle ? "initial_prompt" : "legacy",
    };
  }

  private async persistSnapshot(
    agent: ManagedAgent,
    options?: {
      workspaceId?: string;
      title?: string | null;
      titleSource?: StoredAgentTitleSource;
      internal?: boolean;
    },
  ): Promise<void> {
    if (!this.registry) {
      return;
    }
    // Don't persist internal agents - they're ephemeral system tasks
    if (agent.internal) {
      return;
    }
    if (options?.workspaceId !== undefined) {
      await this.registry.applySnapshot(agent, options.workspaceId, options);
      return;
    }
    await this.registry.applySnapshot(agent, options);
  }

  private async refreshSessionState(agent: ActiveManagedAgent): Promise<void> {
    try {
      const modes = await agent.session.getAvailableModes();
      agent.availableModes = modes;
    } catch (error) {
      this.logger.debug({ err: error, agentId: agent.id }, "Failed to refresh available modes");
      agent.availableModes = [];
    }

    try {
      agent.currentModeId = await agent.session.getCurrentMode();
    } catch (error) {
      this.logger.debug({ err: error, agentId: agent.id }, "Failed to refresh current mode");
      agent.currentModeId = null;
    }

    this.permissions.refreshFromSession(agent);

    this.syncFeaturesFromSession(agent);
    await this.refreshRuntimeInfo(agent);
  }

  private async refreshRuntimeInfo(agent: ActiveManagedAgent): Promise<void> {
    try {
      const newInfo = await agent.session.getRuntimeInfo();
      const changed =
        newInfo.model !== agent.runtimeInfo?.model ||
        newInfo.thinkingOptionId !== agent.runtimeInfo?.thinkingOptionId ||
        newInfo.sessionId !== agent.runtimeInfo?.sessionId ||
        newInfo.modeId !== agent.runtimeInfo?.modeId;
      agent.runtimeInfo = newInfo;
      if (!agent.persistence && newInfo.sessionId) {
        agent.persistence = attachPersistenceCwd(
          { provider: newInfo.provider, sessionId: newInfo.sessionId },
          agent.cwd,
        );
      }
      // Emit state if runtimeInfo changed so clients get the updated model
      if (changed) {
        this.emitState(agent);
      }
    } catch (error) {
      // Keep existing runtimeInfo if refresh fails.
      this.logger.debug({ err: error, agentId: agent.id }, "Failed to refresh runtime info");
    }
  }

  private notifyForegroundTurnWaiters(agentId: string, event: AgentStreamEvent): void {
    const turnId = getAgentStreamEventTurnId(event);
    if (turnId == null) {
      return;
    }

    const agent = this.agents.get(agentId);
    if (!agent) {
      return;
    }

    this.foregroundRuns.notifyAgentWaiters(agent, event);
    this.logger.trace(
      {
        agentId,
        provider: event.provider,
        sessionId: agent.persistence?.sessionId ?? undefined,
        turnId,
        event,
      },
      "agent.manager.notify_waiters.coalesced",
    );
  }

  private async handleStreamEvent(
    agent: ActiveManagedAgent,
    event: AgentStreamEvent,
    options?: HandleStreamEventOptions,
  ): Promise<boolean> {
    const eventTurnId = getAgentStreamEventTurnId(event);
    const isForegroundEvent = Boolean(eventTurnId && agent.activeForegroundTurnId === eventTurnId);
    this.traceHandleStreamEventStart(agent, event, eventTurnId, isForegroundEvent);
    if (
      eventTurnId &&
      isTurnTerminalEvent(event) &&
      this.foregroundRuns.hasFinalizedTurn(agent, eventTurnId)
    ) {
      return false;
    }

    // Only update timestamp for live events, not history replay
    if (!options?.fromHistory) {
      this.touchUpdatedAt(agent);
      if (this.agentStreamCoalescer.handle(agent.id, event)) {
        this.traceCoalescerBuffered(agent, event, eventTurnId);
        return false;
      }
      this.agentStreamCoalescer.flushFor(agent.id);
    }

    const flags: StreamEventFlags = { shouldDispatchEvent: true, shouldNotifyWaiters: true };

    const dispatchPromise = this.dispatchStreamEventByType({
      agent,
      event,
      options,
      isForegroundEvent,
      eventTurnId,
      flags,
    });
    if (dispatchPromise) {
      await dispatchPromise;
    }

    if (!options?.fromHistory && isForegroundEvent && isTurnTerminalEvent(event)) {
      this.foregroundExecution.finalize(agent, eventTurnId);
    }

    if (!options?.fromHistory && flags.shouldDispatchEvent) {
      this.dispatchStream(agent.id, event, { timestamp: new Date().toISOString() });
    }

    this.traceHandleStreamEventEnd(agent, event, eventTurnId, flags);

    return flags.shouldNotifyWaiters;
  }

  private traceHandleStreamEventStart(
    agent: ActiveManagedAgent,
    event: AgentStreamEvent,
    turnId: string | undefined,
    isForegroundEvent: boolean,
  ): void {
    this.logger.trace(
      {
        agentId: agent.id,
        provider: event.provider,
        sessionId: agent.persistence?.sessionId ?? undefined,
        turnId,
        lifecycle: agent.lifecycle,
        activeForegroundTurnId: agent.activeForegroundTurnId,
        isForegroundEvent,
        event,
      },
      "agent.manager.handle_stream_event.start",
    );
  }

  private traceCoalescerBuffered(
    agent: ActiveManagedAgent,
    event: AgentStreamEvent,
    turnId: string | undefined,
  ): void {
    this.logger.trace(
      {
        agentId: agent.id,
        provider: event.provider,
        sessionId: agent.persistence?.sessionId ?? undefined,
        turnId,
        event,
      },
      "agent.manager.coalescer.buffer",
    );
  }

  private traceHandleStreamEventEnd(
    agent: ActiveManagedAgent,
    event: AgentStreamEvent,
    turnId: string | undefined,
    flags: StreamEventFlags,
  ): void {
    this.logger.trace(
      {
        agentId: agent.id,
        provider: event.provider,
        sessionId: agent.persistence?.sessionId ?? undefined,
        turnId,
        lifecycle: agent.lifecycle,
        activeForegroundTurnId: agent.activeForegroundTurnId,
        shouldDispatchEvent: flags.shouldDispatchEvent,
        shouldNotifyWaiters: flags.shouldNotifyWaiters,
        event,
      },
      "agent.manager.handle_stream_event.end",
    );
  }

  private dispatchStreamEventByType(params: {
    agent: ActiveManagedAgent;
    event: AgentStreamEvent;
    options: HandleStreamEventOptions | undefined;
    isForegroundEvent: boolean;
    eventTurnId: string | undefined;
    flags: StreamEventFlags;
  }): Promise<void> | undefined {
    const { agent, event, options, isForegroundEvent, eventTurnId, flags } = params;
    switch (event.type) {
      case "thread_started":
        this.onStreamThreadStarted(agent);
        return undefined;
      case "usage_updated":
        agent.lastUsage = event.usage;
        this.emitState(agent);
        return undefined;
      case "mode_changed":
        agent.currentModeId = event.currentModeId;
        agent.availableModes = event.availableModes;
        if (agent.runtimeInfo) {
          agent.runtimeInfo = { ...agent.runtimeInfo, modeId: event.currentModeId };
        }
        flags.shouldDispatchEvent = false;
        this.emitState(agent);
        return undefined;
      case "model_changed":
        agent.runtimeInfo = event.runtimeInfo;
        if (!agent.persistence && event.runtimeInfo.sessionId) {
          agent.persistence = attachPersistenceCwd(
            { provider: event.runtimeInfo.provider, sessionId: event.runtimeInfo.sessionId },
            agent.cwd,
          );
        }
        agent.currentModeId = event.runtimeInfo.modeId ?? agent.currentModeId;
        flags.shouldDispatchEvent = false;
        this.emitState(agent);
        return undefined;
      case "thinking_option_changed":
        if (agent.runtimeInfo) {
          agent.runtimeInfo = {
            ...agent.runtimeInfo,
            thinkingOptionId: event.thinkingOptionId,
          };
        }
        flags.shouldDispatchEvent = false;
        this.emitState(agent);
        return undefined;
      case "timeline":
        return this.onStreamTimelineEvent({ agent, event, options, isForegroundEvent, flags });
      case "turn_completed":
        this.onStreamTurnCompleted({
          agent,
          event,
          eventTurnId,
          isForegroundEvent,
          fromHistory: options?.fromHistory === true,
        });
        return undefined;
      case "turn_failed":
        return this.onStreamTurnFailed({
          agent,
          event,
          eventTurnId,
          isForegroundEvent,
          options,
        });
      case "turn_canceled":
        this.onStreamTurnCanceled({ agent, event, eventTurnId, isForegroundEvent, options });
        return undefined;
      case "turn_started":
        this.onStreamTurnStarted({ agent, eventTurnId, isForegroundEvent });
        return undefined;
      case "permission_requested":
        this.permissions.onRequested(agent, event);
        return undefined;
      case "permission_resolved": {
        const shouldDispatchEvent = this.permissions.onResolved(agent, event, options);
        if (!shouldDispatchEvent) {
          flags.shouldDispatchEvent = false;
        }
        return undefined;
      }
      default:
        return undefined;
    }
  }

  private onStreamThreadStarted(agent: ActiveManagedAgent): void {
    const previousSessionId = agent.persistence?.sessionId ?? null;
    const handle = agent.session.describePersistence();
    if (handle) {
      agent.persistence = attachPersistenceCwd(handle, agent.cwd);
      if (agent.persistence?.sessionId !== previousSessionId) {
        this.emitState(agent);
      }
    }
    void this.refreshRuntimeInfo(agent);
  }

  private async onStreamTimelineEvent(params: {
    agent: ActiveManagedAgent;
    event: Extract<AgentStreamEvent, { type: "timeline" }>;
    options: { fromHistory?: boolean } | undefined;
    isForegroundEvent: boolean;
    flags: StreamEventFlags;
  }): Promise<void> {
    const { agent, event, options, flags } = params;

    if (event.item.type === "user_message" && isSystemInjectedEnvelope(event.item.text)) {
      flags.shouldDispatchEvent = false;
      flags.shouldNotifyWaiters = false;
      return;
    }

    if (options?.fromHistory) {
      this.recordTimeline(
        agent.id,
        event.item,
        event.timestamp ? { timestamp: event.timestamp } : undefined,
      );
      flags.shouldDispatchEvent = false;
      flags.shouldNotifyWaiters = false;
      return;
    }

    this.recordAndDispatchTimelineItem(agent.id, event.item, event.provider, event.turnId);
    if (event.item.type === "user_message") {
      agent.lastUserMessageAt = new Date();
      this.emitState(agent);
    }
    flags.shouldDispatchEvent = false;
    flags.shouldNotifyWaiters = true;
  }

  private onStreamTurnCompleted(params: {
    agent: ActiveManagedAgent;
    event: Extract<AgentStreamEvent, { type: "turn_completed" }>;
    eventTurnId: string | undefined;
    isForegroundEvent: boolean;
    fromHistory: boolean;
  }): void {
    const { agent, event, eventTurnId, isForegroundEvent, fromHistory } = params;
    this.logger.trace(
      {
        agentId: agent.id,
        provider: agent.provider,
        sessionId: agent.persistence?.sessionId ?? undefined,
        turnId: eventTurnId,
        lifecycle: agent.lifecycle,
        activeForegroundTurnId: agent.activeForegroundTurnId,
      },
      "agent.manager.turn.completed",
    );
    agent.lastUsage = event.usage;
    if (!fromHistory) {
      this.recordUsageEvent(agent, event, eventTurnId);
    }
    agent.lastError = undefined;
    if (!isForegroundEvent && agent.lifecycle !== "idle" && !agent.pendingReplacement) {
      (agent as ActiveManagedAgent).lifecycle = "idle";
      this.emitState(agent);
    }
    void this.refreshRuntimeInfo(agent);
  }

  private recordUsageEvent(
    agent: ActiveManagedAgent,
    event: Extract<AgentStreamEvent, { type: "turn_completed" }>,
    eventTurnId: string | undefined,
  ): void {
    if (!this.usageStore || !event.usage) {
      return;
    }
    const record = createUsageEventRecord({
      agentId: agent.id,
      cwd: agent.cwd,
      provider: event.provider,
      model: agent.runtimeInfo?.model ?? agent.config.model ?? null,
      turnId: eventTurnId,
      usage: event.usage,
      messageCount: 1,
    });
    if (!record) {
      return;
    }
    const appendTask = this.usageStore.append(record).catch((error) => {
      this.logger.warn({ err: error, agentId: agent.id }, "Failed to record usage event");
    });
    this.backgroundTasks.add(appendTask);
    appendTask.finally(() => this.backgroundTasks.delete(appendTask));
  }

  private async onStreamTurnFailed(params: {
    agent: ActiveManagedAgent;
    event: Extract<AgentStreamEvent, { type: "turn_failed" }>;
    eventTurnId: string | undefined;
    isForegroundEvent: boolean;
    options: { fromHistory?: boolean } | undefined;
  }): Promise<void> {
    const { agent, event, eventTurnId, isForegroundEvent, options } = params;
    this.logger.warn(
      {
        agentId: agent.id,
        provider: agent.provider,
        sessionId: agent.persistence?.sessionId ?? undefined,
        turnId: eventTurnId,
        lifecycle: agent.lifecycle,
        activeForegroundTurnId: agent.activeForegroundTurnId,
        eventTurnId,
        error: event.error,
        code: event.code,
        diagnostic: event.diagnostic,
      },
      "handleStreamEvent: turn_failed",
    );
    if (!isForegroundEvent) {
      agent.lifecycle = "error";
    }
    agent.lastError = event.error;
    await this.appendSystemErrorTimelineMessage(
      agent,
      event.provider,
      this.formatTurnFailedMessage(event),
      options,
    );
    this.permissions.resolvePending(agent, event.provider, options, "Turn failed");
    if (!isForegroundEvent) {
      this.emitState(agent);
    }
  }

  private onStreamTurnCanceled(params: {
    agent: ActiveManagedAgent;
    event: Extract<AgentStreamEvent, { type: "turn_canceled" }>;
    eventTurnId: string | undefined;
    isForegroundEvent: boolean;
    options:
      | {
          fromHistory?: boolean;
        }
      | undefined;
  }): void {
    const { agent, event, eventTurnId, isForegroundEvent, options } = params;
    this.logger.trace(
      {
        agentId: agent.id,
        provider: agent.provider,
        sessionId: agent.persistence?.sessionId ?? undefined,
        turnId: eventTurnId,
        lifecycle: agent.lifecycle,
        activeForegroundTurnId: agent.activeForegroundTurnId,
        eventTurnId,
      },
      "agent.manager.turn.canceled",
    );
    if (!isForegroundEvent && !agent.pendingReplacement) {
      agent.lifecycle = "idle";
    }
    agent.lastError = undefined;
    this.permissions.resolvePending(agent, event.provider, options, "Interrupted");
    if (!isForegroundEvent) {
      this.emitState(agent);
    }
  }

  private onStreamTurnStarted(params: {
    agent: ActiveManagedAgent;
    eventTurnId: string | undefined;
    isForegroundEvent: boolean;
  }): void {
    const { agent, eventTurnId, isForegroundEvent } = params;
    this.logger.trace(
      {
        agentId: agent.id,
        provider: agent.provider,
        sessionId: agent.persistence?.sessionId ?? undefined,
        turnId: eventTurnId,
        lifecycle: agent.lifecycle,
        activeForegroundTurnId: agent.activeForegroundTurnId,
      },
      "agent.manager.turn.started",
    );
    if (!isForegroundEvent) {
      agent.lifecycle = "running";
      this.emitState(agent);
    }
  }

  private recordAndDispatchTimelineItem(
    agentId: string,
    item: AgentTimelineItem,
    provider: AgentProvider,
    turnId?: string,
  ): AgentStreamEvent {
    const row = this.recordTimeline(agentId, item);
    const event: AgentStreamEvent = {
      type: "timeline",
      item,
      provider,
      ...(turnId !== undefined ? { turnId } : {}),
    };
    this.dispatchStream(agentId, event, {
      seq: row.seq,
      epoch: this.timeline.getEpoch(agentId),
      timestamp: row.timestamp,
    });
    return event;
  }

  private async appendSystemErrorTimelineMessage(
    agent: ActiveManagedAgent,
    provider: AgentProvider,
    message: string,
    options?: { fromHistory?: boolean },
  ): Promise<void> {
    if (options?.fromHistory) {
      return;
    }

    const normalized = message.trim();
    if (!normalized) {
      return;
    }

    const text = `${SYSTEM_ERROR_PREFIX} ${normalized}`;
    const lastItem = await this.timeline.getLastItem(agent.id);
    if (lastItem?.type === "assistant_message" && lastItem.text === text) {
      return;
    }

    const item: AgentTimelineItem = { type: "assistant_message", text };
    const row = this.recordTimeline(agent.id, item);
    this.dispatchStream(
      agent.id,
      {
        type: "timeline",
        item,
        provider,
      },
      {
        seq: row.seq,
        epoch: this.timeline.getEpoch(agent.id),
        timestamp: row.timestamp,
      },
    );
  }

  private formatTurnFailedMessage(
    event: Extract<AgentStreamEvent, { type: "turn_failed" }>,
  ): string {
    const base = event.error.trim();
    const parts = [base.length > 0 ? base : "Provider run failed"];
    const code = event.code?.trim();
    if (code) {
      parts.push(`code: ${code}`);
    }
    const diagnostic = event.diagnostic?.trim();
    if (diagnostic && diagnostic !== base) {
      parts.push(diagnostic);
    }
    return parts.join("\n\n");
  }

  private recordTimeline(
    agentId: string,
    item: AgentTimelineItem,
    options?: { timestamp?: string },
  ): AgentTimelineRow {
    return this.timeline.append(agentId, item, options);
  }

  private emitState(agent: ManagedAgent, options?: { persist?: boolean }): void {
    // Keep attention as an edge-triggered unread signal, not a level signal.
    this.checkAndSetAttention(agent);
    if (options?.persist !== false) {
      this.enqueueBackgroundPersist(agent);
    }

    this.syncFeaturesFromSession(agent);

    this.logger.trace(
      {
        agentId: agent.id,
        provider: agent.provider,
        sessionId: agent.persistence?.sessionId ?? undefined,
        turnId: agent.activeForegroundTurnId ?? undefined,
        lifecycle: agent.lifecycle,
        activeForegroundTurnId: agent.activeForegroundTurnId,
        pendingPermissions: agent.pendingPermissions.size,
        persist: options?.persist !== false,
      },
      "agent.manager.emit_state",
    );

    this.dispatch({
      type: "agent_state",
      agent: { ...agent },
    });
  }

  private syncFeaturesFromSession(agent: ManagedAgent): void {
    if ("session" in agent && agent.session?.features) {
      agent.features = agent.session.features;
    }
  }

  private checkAndSetAttention(agent: ManagedAgent): void {
    const previousStatus = this.previousStatuses.get(agent.id);
    const currentStatus = agent.lifecycle;

    // Track the new status
    this.previousStatuses.set(agent.id, currentStatus);

    // Skip attention tracking for internal agents
    if (agent.internal) {
      return;
    }

    // Skip if already requires attention
    if (agent.attention.requiresAttention) {
      return;
    }

    // Check if agent transitioned from running to idle (finished)
    if (previousStatus === "running" && currentStatus === "idle") {
      agent.attention = {
        requiresAttention: true,
        attentionReason: "finished",
        attentionTimestamp: new Date(),
      };
      this.broadcastAgentAttention(agent, "finished");
      return;
    }

    // Check if agent entered error state
    if (previousStatus !== "error" && currentStatus === "error") {
      agent.attention = {
        requiresAttention: true,
        attentionReason: "error",
        attentionTimestamp: new Date(),
      };
      this.broadcastAgentAttention(agent, "error");
      return;
    }
  }

  private enqueueBackgroundPersist(agent: ManagedAgent): void {
    const task = this.persistSnapshot(agent).catch((err) => {
      this.logger.error({ err, agentId: agent.id }, "Failed to persist agent snapshot");
    });
    this.trackBackgroundTask(task);
  }

  private trackBackgroundTask(task: Promise<void>): void {
    this.backgroundTasks.add(task);
    void task.finally(() => {
      this.backgroundTasks.delete(task);
    });
  }

  /**
   * Flush any background persistence work (best-effort).
   * Used by daemon shutdown paths to avoid unhandled rejections after cleanup.
   */
  async flush(): Promise<void> {
    this.agentStreamCoalescer.flushAll();
    // Drain tasks, including tasks spawned while awaiting.
    while (this.backgroundTasks.size > 0) {
      const pending = Array.from(this.backgroundTasks);
      await Promise.allSettled(pending);
    }
  }

  private broadcastAgentAttention(
    agent: ManagedAgent,
    reason: "finished" | "error" | "permission",
  ): void {
    this.onAgentAttention?.({
      agentId: agent.id,
      provider: agent.provider,
      reason,
    });
  }

  private dispatchStream(
    agentId: string,
    event: AgentStreamEvent,
    metadata?: { seq?: number; epoch?: string; timestamp?: string },
  ): void {
    const agent = this.agents.get(agentId);
    this.logger.trace(
      {
        agentId,
        provider: event.provider,
        sessionId: agent?.persistence?.sessionId ?? undefined,
        turnId: getAgentStreamEventTurnId(event),
        metadata,
        event,
      },
      "agent.manager.dispatch_stream",
    );
    this.dispatch({ type: "agent_stream", agentId, event, ...metadata });
  }

  private dispatch(event: AgentManagerEvent): void {
    this.eventBus.dispatch(event);
  }

  private requireAgent(id: string): ActiveManagedAgent {
    const normalizedId = validateAgentId(id, "requireAgent");
    const agent = this.agents.get(normalizedId);
    if (!agent) {
      throw new Error(`Unknown agent '${normalizedId}'`);
    }
    return agent;
  }

  private requireSessionAgent(id: string): ActiveManagedAgent {
    const agent = this.requireAgent(id);
    if (agent.session === null) {
      throw new Error(`Agent '${agent.id}' has no managed session`);
    }
    return agent;
  }
}
