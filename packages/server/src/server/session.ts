import equal from "fast-deep-equal";
import { v4 as uuidv4 } from "uuid";
import { TTLCache } from "@isaacs/ttlcache";
import pMemoize from "p-memoize";
import { basename, resolve, sep } from "path";
import { z } from "zod";
import type { ToolSet } from "ai";
import { CLIENT_CAPS, type ClientCapability } from "@chisacode/protocol/client-capabilities";
import {
  isLegacyEditorTargetId,
  serializeAgentStreamEvent,
  type AgentSnapshotPayload,
  type AgentAttachment,
  type FirstAgentContext,
  type SessionInboundMessage,
  type SessionOutboundMessage,
  type FileExplorerRequest,
  type FileDownloadTokenRequest,
  type GitSetupOptions,
  type CloseItemsRequest,
  type EditorTargetDescriptorPayload,
  type EditorTargetId,
  type ProjectPlacementPayload,
  type WorkspaceSetupSnapshot,
  type WorkspaceDescriptorPayload,
} from "./messages.js";
import type { TerminalManager } from "../terminal/terminal-manager.js";
import { TerminalSessionController } from "../terminal/terminal-session-controller.js";
import {
  encodeFileTransferFrame,
  FileTransferOpcode,
  type TerminalStreamFrame,
} from "@chisacode/protocol/binary-frames/index";
import { CursorError } from "./pagination/cursor.js";
import { SortablePager, type SortSpec } from "./pagination/sortable-pager.js";
import { TTSManager } from "./agent/tts-manager.js";
import { STTManager } from "./agent/stt-manager.js";
import type { SpeechToTextProvider, TextToSpeechProvider } from "./speech/speech-provider.js";
import type { TurnDetectionProvider } from "./speech/turn-detection-provider.js";
import { maybePersistTtsDebugAudio } from "./agent/tts-debug.js";
import { isChisaCodeDictationDebugEnabled } from "./agent/recordings-debug.js";
import { listAvailableEditorTargets, openInEditorTarget } from "./editor-targets.js";
import {
  DictationStreamManager,
  type DictationStreamOutboundMessage,
} from "./dictation/dictation-stream-manager.js";
import {
  createVoiceTurnController,
  type VoiceTurnController,
} from "./voice/voice-turn-controller.js";
import {
  buildConfigOverrides,
  extractTimestamps,
  isStoredAgentProviderAvailable,
  toAgentPersistenceHandle,
} from "./persistence-hooks.js";
import { ensureAgentLoaded } from "./agent/agent-loading.js";
import {
  sendPromptToAgent,
  waitForAgentRunStartWithTimeout,
  unarchiveAgentState,
} from "./agent/agent-prompt.js";
import { resolveCreateAgentTitles } from "./agent/create-agent-title.js";
import { AgentPresetStore } from "./agent/agent-preset-store.js";
import { respondToAgentPermission } from "./agent/permission-response.js";
import { experimental_createMCPClient } from "ai";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { VoiceCallerContext, VoiceSpeakHandler } from "./voice-types.js";
import {
  buildWorkspaceScriptPayloads,
  readChisaCodeConfigForProjection,
} from "./script-status-projection.js";
import { deriveProjectSlug } from "./workspace-git-metadata.js";
import type { ScriptHealthState } from "./script-health-monitor.js";
import type { WorkspaceScriptRuntimeStore } from "./workspace-script-runtime-store.js";
import type { DaemonConfigStore } from "./daemon-config-store.js";
import { getAgentStatusPriority } from "@chisacode/protocol/agent-state-bucket";
import {
  buildUsageSummary,
  exportUsageEvents,
  pruneUsageEvents,
  type UsageStore,
} from "./usage/usage-store.js";
import type { WorkspaceGitRuntimeSnapshot, WorkspaceGitService } from "./workspace-git-service.js";

import { AgentManager } from "./agent/agent-manager.js";
import { ProviderSnapshotManager, resolveSnapshotCwd } from "./agent/provider-snapshot-manager.js";
import type {
  AgentManagerEvent,
  AgentTimelineCursor,
  AgentTimelineFetchDirection,
  ManagedAgent,
} from "./agent/agent-manager.js";
import { createAgentCommand } from "./agent/create-agent/create.js";
import {
  archiveAgentCommand,
  cancelAgentRunCommand,
  closeAgentCommand,
  setAgentModeCommand,
  updateAgentCommand,
} from "./agent/lifecycle-command.js";
import {
  buildStoredAgentPayload,
  resolveEffectiveThinkingOptionId,
  resolveStoredAgentPayloadUpdatedAt,
  toAgentPayload,
} from "./agent/agent-projections.js";
import {
  appendTimelineItemIfAgentKnown,
  emitLiveTimelineItemIfAgentKnown,
} from "./agent/timeline-append.js";
import {
  projectTimelineRows,
  selectTimelineWindowByProjectedLimit,
  type TimelineProjectionMode,
} from "./agent/timeline-projection.js";
import {
  StructuredAgentFallbackError,
  StructuredAgentResponseError,
  generateStructuredAgentResponseWithFallback,
} from "./agent/agent-response-loop.js";
import {
  resolveStructuredGenerationProviders,
  type StructuredGenerationDaemonConfig,
} from "./agent/structured-generation-providers.js";
import {
  getAgentStreamEventTurnId,
  type AgentPersistenceHandle,
  type AgentPermissionResponse,
  type AgentPromptContentBlock,
  type AgentPromptInput,
  type AgentRunOptions,
  type AgentSessionConfig,
  type ProviderSnapshotEntry,
} from "./agent/agent-sdk-types.js";
import type { StoredAgentRecord } from "./agent/agent-storage.js";
import type { AgentStorage } from "./agent/agent-storage.js";
import {
  ImportSessionsRequestError,
  importProviderSession,
  listImportableProviderSessions,
  normalizeImportAgentRequest,
} from "./agent/import-sessions.js";
import {
  checkoutLiteFromGitSnapshot,
  normalizeWorkspaceId as normalizePersistedWorkspaceId,
  deriveProjectGroupingName,
  classifyDirectoryForProjectMembership,
  deriveWorkspaceDisplayName,
} from "./workspace-registry-model.js";
import {
  createPersistedProjectRecord,
  createPersistedWorkspaceRecord,
  resolveProjectDisplayName,
  type PersistedProjectRecord,
  type PersistedWorkspaceRecord,
  type ProjectRegistry,
  type WorkspaceRegistry,
} from "./workspace-registry.js";
import {
  buildVoiceModeSystemPrompt,
  stripVoiceModeSystemPrompt,
  wrapSpokenInput,
} from "./voice-config.js";
import { isVoicePermissionAllowed } from "./voice-permission-policy.js";
import { DownloadTokenStore } from "./file-download/token-store.js";
import { PushTokenStore } from "./push/token-store.js";
import { buildMetadataPrompt } from "../utils/build-metadata-prompt.js";
import { archivePersistedWorkspaceRecord } from "./workspace-archive-service.js";
import { WorkspaceReconciliationService } from "./workspace-reconciliation-service.js";
import type { ScriptRouteStore } from "./script-proxy.js";
import { CheckoutDiffManager } from "./checkout-diff-manager.js";
import {
  buildCheckoutPrStatusPayloadFromSnapshot,
  buildCheckoutStatusPayloadFromSnapshot,
} from "./checkout/status-projection.js";
import { toResolver, type Resolvable } from "./speech/provider-resolver.js";
import type { SpeechReadinessSnapshot, SpeechReadinessState } from "./speech/speech-runtime.js";
import type pino from "pino";
import type { FileBackedChatService } from "./chat/chat-service.js";
import { LoopService } from "./loop-service.js";
import { ScheduleService } from "./schedule/service.js";
import { createGitHubService, type GitHubService } from "../services/github-service.js";
import {
  summarizeFetchWorkspacesEntries,
  WorkspaceDirectory,
  type WorkspaceUpdatesFilter,
} from "./workspace-directory.js";
import {
  createChisaCodeWorktree,
  type CreateChisaCodeWorktreeInput,
  type CreateChisaCodeWorktreeResult,
} from "./chisacode-worktree-service.js";
import {
  buildAgentSessionConfig as buildWorktreeAgentSessionConfig,
  createChisaCodeWorktreeWorkflow as createWorktreeWorkflow,
  type CreateChisaCodeWorktreeSetupContinuationInput,
  type CreateChisaCodeWorktreeWorkflowResult,
  handleCreateChisaCodeWorktreeRequest as handleCreateWorktreeRequest,
  handleChisaCodeWorktreeArchiveRequest as handleWorktreeArchiveRequest,
  handleChisaCodeWorktreeListRequest as handleWorktreeListRequest,
  handleWorkspaceSetupStatusRequest as handleWorkspaceSetupStatusRequestMessage,
} from "./worktree-session.js";
import { toWorktreeWireError } from "./worktree-errors.js";
import { CreateAgentLifecycleDispatch } from "./agent/create-agent-lifecycle-dispatch.js";
import {
  WORKSPACE_GIT_WATCH_REMOVED_STATE_KEY,
  FETCH_AGENTS_SORT_KEYS,
  resolveKnownProjectRootForConfig,
  type GitMutationRefreshReason,
  LEGACY_PROVIDER_IDS,
  LEGACY_MODE_ICONS,
  errorToFriendlyMessage,
  resolveSubscriptionId,
  diffChangeTypeFor,
  buildWorkspaceCheckout,
  clientSupportsAllProviders,
  clientSupportsFlexibleEditorIds,
  beginAgentDeleteIfSupported,
  resolveWaitForFinishError,
} from "./session-helpers.js";

// Re-export so existing imports from "./session.js" keep working.
export { resolveWaitForFinishError } from "./session-helpers.js";
export { type SessionRuntimeMetrics } from "./session-internal-types.js";

import {
  type ProcessingPhase,
  type WorkspaceGitWatchTarget,
  type SessionRuntimeMetrics,
  type AgentMcpTransportFactory,
  type VoiceTranscriptionResultPayload,
  type VoiceFeatureUnavailableContext,
  type VoiceFeatureUnavailableResponseMetadata,
  VoiceFeatureUnavailableError,
} from "./session-internal-types.js";
import {
  PCM_SAMPLE_RATE,
  PCM_CHANNELS,
  PCM_BITS_PER_SAMPLE,
  MIN_STREAMING_SEGMENT_DURATION_MS,
  MIN_STREAMING_SEGMENT_BYTES,
  type VoiceModeBaseConfig,
  type AudioBufferState,
  convertPCMToWavBuffer,
} from "./session-audio.js";
import { CheckoutGitHandler } from "./session-handlers/checkout-git-handler.js";
import { ChatScheduleLoopHandler } from "./session-handlers/chat-schedule-loop-handler.js";
import { ConfigControlHandler } from "./session-handlers/config-control-handler.js";
import { ProviderHandler } from "./session-handlers/provider-handler.js";
import { TerminalScriptHandler } from "./session-handlers/terminal-script-handler.js";
import { WorkspaceProjectHandler } from "./session-handlers/workspace-project-handler.js";
import { AgentLifecycleHandler } from "./session-handlers/agent-lifecycle-handler.js";
import type { SessionContext } from "./session-handlers/session-context.js";

type FetchAgentsRequestMessage = Extract<SessionInboundMessage, { type: "fetch_agents_request" }>;
type FetchAgentHistoryRequestMessage = Extract<
  SessionInboundMessage,
  { type: "fetch_agent_history_request" }
>;
type AgentDirectoryRequestMessage = FetchAgentsRequestMessage | FetchAgentHistoryRequestMessage;
type FetchAgentsRequestFilter = NonNullable<FetchAgentsRequestMessage["filter"]>;
type FetchAgentsRequestSort = NonNullable<FetchAgentsRequestMessage["sort"]>[number];
type FetchAgentsResponsePayload = Extract<
  SessionOutboundMessage,
  { type: "fetch_agents_response" }
>["payload"];
type FetchAgentsResponseEntry = FetchAgentsResponsePayload["entries"][number];
type FetchAgentsResponsePageInfo = FetchAgentsResponsePayload["pageInfo"];
type AgentUpdatePayload = Extract<SessionOutboundMessage, { type: "agent_update" }>["payload"];
type AgentUpdatesFilter = FetchAgentsRequestFilter;
interface AgentUpdatesSubscriptionState {
  subscriptionId: string;
  filter?: AgentUpdatesFilter;
  isBootstrapping: boolean;
  pendingUpdatesByAgentId: Map<string, AgentUpdatePayload>;
}
type FetchWorkspacesRequestMessage = Extract<
  SessionInboundMessage,
  { type: "fetch_workspaces_request" }
>;
type FetchWorkspacesRequestFilter = NonNullable<FetchWorkspacesRequestMessage["filter"]>;
type FetchWorkspacesResponsePayload = Extract<
  SessionOutboundMessage,
  { type: "fetch_workspaces_response" }
>["payload"];
type FetchWorkspacesResponseEntry = FetchWorkspacesResponsePayload["entries"][number];
type FetchWorkspacesResponsePageInfo = FetchWorkspacesResponsePayload["pageInfo"];
type WorkspaceUpdatePayload = Extract<
  SessionOutboundMessage,
  { type: "workspace_update" }
>["payload"];
interface WorkspaceUpdatesSubscriptionState {
  subscriptionId: string;
  filter?: WorkspaceUpdatesFilter;
  isBootstrapping: boolean;
  pendingUpdatesByWorkspaceId: Map<string, WorkspaceUpdatePayload>;
  lastEmittedByWorkspaceId: Map<string, WorkspaceUpdatePayload>;
}

class SessionRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "SessionRequestError";
  }
}

const AgentIdSchema = z.string().uuid();
const AVAILABLE_EDITOR_TARGETS_CACHE_TTL_MS = 60_000;
const AVAILABLE_EDITOR_TARGETS_CACHE_KEY = "available";

export interface SessionOptions {
  clientId: string;
  appVersion?: string | null;
  clientCapabilities?: Record<string, unknown> | null;
  onMessage: (msg: SessionOutboundMessage) => void;
  onBinaryMessage?: (frame: Uint8Array) => void;
  onLifecycleIntent?: (intent: SessionLifecycleIntent) => void;
  logger: pino.Logger;
  downloadTokenStore: DownloadTokenStore;
  pushTokenStore: PushTokenStore;
  chisacodeHome: string;
  agentManager: AgentManager;
  agentStorage: AgentStorage;
  usageStore?: UsageStore;
  projectRegistry: ProjectRegistry;
  workspaceRegistry: WorkspaceRegistry;
  chatService: FileBackedChatService;
  scheduleService: ScheduleService;
  loopService: LoopService;
  checkoutDiffManager: CheckoutDiffManager;
  github?: GitHubService;
  createAgentMcpTransport?: AgentMcpTransportFactory;
  workspaceGitService: WorkspaceGitService;
  daemonConfigStore: DaemonConfigStore;
  mcpBaseUrl?: string | null;
  stt: Resolvable<SpeechToTextProvider | null>;
  sttLanguage?: string;
  tts: Resolvable<TextToSpeechProvider | null>;
  terminalManager: TerminalManager | null;
  providerSnapshotManager: ProviderSnapshotManager;
  scriptRouteStore?: ScriptRouteStore;
  scriptRuntimeStore?: WorkspaceScriptRuntimeStore;
  workspaceSetupSnapshots?: Map<string, WorkspaceSetupSnapshot>;
  onBranchChanged?: (
    workspaceId: string,
    oldBranch: string | null,
    newBranch: string | null,
  ) => void;
  getDaemonTcpPort?: () => number | null;
  getDaemonTcpHost?: () => string | null;
  resolveScriptHealth?: (hostname: string) => ScriptHealthState | null;
  voice?: {
    turnDetection?: Resolvable<TurnDetectionProvider | null>;
  };
  voiceBridge?: {
    registerVoiceSpeakHandler?: (agentId: string, handler: VoiceSpeakHandler) => void;
    unregisterVoiceSpeakHandler?: (agentId: string) => void;
    registerVoiceCallerContext?: (agentId: string, context: VoiceCallerContext) => void;
    unregisterVoiceCallerContext?: (agentId: string) => void;
  };
  dictation?: {
    finalTimeoutMs?: number;
    stt?: Resolvable<SpeechToTextProvider | null>;
    sttLanguage?: string;
    getSpeechReadiness?: () => SpeechReadinessSnapshot;
  };
  serverId?: string;
  daemonVersion?: string;
  daemonRuntimeConfig?: {
    listen: string | null;
    relay: {
      enabled: boolean;
      endpoint: string;
      publicEndpoint: string;
      useTls: boolean;
      publicUseTls: boolean;
    } | null;
  };
}

export type SessionLifecycleIntent =
  | {
      type: "shutdown";
      clientId: string;
      requestId: string;
    }
  | {
      type: "restart";
      clientId: string;
      requestId: string;
      reason?: string;
    };

function parseClientCapabilities(
  capabilities: Record<string, unknown> | null | undefined,
): ReadonlySet<ClientCapability> {
  if (!capabilities) {
    return new Set();
  }
  const known = new Set<ClientCapability>(Object.values(CLIENT_CAPS));
  const result: ClientCapability[] = [];
  for (const [key, value] of Object.entries(capabilities)) {
    if (value === true && known.has(key as ClientCapability)) {
      result.push(key as ClientCapability);
    }
  }
  return new Set(result);
}

/**
 * Session represents a single connected client session.
 * It owns all state management, orchestration logic, and message processing.
 * Session has no knowledge of WebSockets - it only emits and receives messages.
 */
export class Session {
  private readonly clientId: string;
  private appVersion: string | null;
  private clientCapabilities: ReadonlySet<ClientCapability>;
  private readonly sessionId: string;
  private readonly onMessage: (msg: SessionOutboundMessage) => void;
  private readonly onBinaryMessage: ((frame: Uint8Array) => void) | null;
  private readonly onLifecycleIntent: ((intent: SessionLifecycleIntent) => void) | null;
  private readonly sessionLogger: pino.Logger;
  private readonly chisacodeHome: string;

  // State machine
  private abortController: AbortController;
  private processingPhase: ProcessingPhase = "idle";

  // Voice mode state
  private isVoiceMode = false;
  private speechInProgress = false;

  private dictationStreamManager!: DictationStreamManager;
  private resolveVoiceTurnDetection!: () => TurnDetectionProvider | null;
  private voiceTurnController: VoiceTurnController | null = null;
  private voiceInputChunkCount = 0;
  private voiceInputBytes = 0;
  private voiceInputWindowStartedAt = Date.now();

  // Audio buffering for interruption handling
  private pendingAudioSegments: Array<{ audio: Buffer; format: string }> = [];
  private bufferTimeout: ReturnType<typeof setTimeout> | null = null;
  private audioBuffer: AudioBufferState | null = null;

  // Optional TTS debug capture (persisted per utterance)
  private readonly ttsDebugStreams = new Map<string, { format: string; chunks: Buffer[] }>();

  // Per-session managers
  private ttsManager!: TTSManager;
  private sttManager!: STTManager;

  // Per-session MCP client and tools
  private agentMcpClient: Awaited<ReturnType<typeof experimental_createMCPClient>> | null = null;
  private agentTools: ToolSet | null = null;
  private agentManager: AgentManager;
  private readonly agentStorage: AgentStorage;
  private readonly usageStore: UsageStore | null;
  private readonly projectRegistry: ProjectRegistry;
  private readonly workspaceRegistry: WorkspaceRegistry;
  private readonly chatService: FileBackedChatService;
  private readonly scheduleService: ScheduleService;
  private readonly loopService: LoopService;
  private readonly checkoutDiffManager: CheckoutDiffManager;
  private readonly github: GitHubService;
  private readonly workspaceGitService: WorkspaceGitService;
  private readonly daemonConfigStore: DaemonConfigStore;
  private readonly mcpBaseUrl: string | null;
  private readonly downloadTokenStore: DownloadTokenStore;
  private readonly pushTokenStore: PushTokenStore;
  private unsubscribeAgentEvents: (() => void) | null = null;
  private agentUpdatesSubscription: AgentUpdatesSubscriptionState | null = null;
  private workspaceUpdatesSubscription: WorkspaceUpdatesSubscriptionState | null = null;
  private clientActivity: {
    deviceType: "web" | "mobile";
    focusedAgentId: string | null;
    lastActivityAt: Date;
    appVisible: boolean;
    appVisibilityChangedAt: Date;
  } | null = null;
  private readonly terminalManager: TerminalManager | null;
  private readonly providerSnapshotManager: ProviderSnapshotManager;
  private readonly agentPresetStore: AgentPresetStore;
  private unsubscribeProviderSnapshotEvents: (() => void) | null = null;
  private readonly scriptRouteStore: ScriptRouteStore | null;
  private readonly scriptRuntimeStore: WorkspaceScriptRuntimeStore | null;
  private readonly onBranchChanged?: (
    workspaceId: string,
    oldBranch: string | null,
    newBranch: string | null,
  ) => void;
  private readonly getDaemonTcpPort: (() => number | null) | null;
  private readonly getDaemonTcpHost: (() => string | null) | null;
  private readonly resolveScriptHealth: ((hostname: string) => ScriptHealthState | null) | null;
  private readonly terminalController: TerminalSessionController;
  private inflightRequests = 0;
  private peakInflightRequests = 0;
  private readonly availableEditorTargetsCache = new TTLCache<
    string,
    EditorTargetDescriptorPayload[]
  >({
    ttl: AVAILABLE_EDITOR_TARGETS_CACHE_TTL_MS,
    max: 1,
    checkAgeOnGet: true,
  });
  private readonly getMemoizedAvailableEditorTargets = pMemoize(
    async () => this.resolveAvailableEditorTargets(),
    {
      cache: this.availableEditorTargetsCache,
      cacheKey: () => AVAILABLE_EDITOR_TARGETS_CACHE_KEY,
    },
  );
  private readonly workspaceGitWatchTargets = new Map<string, WorkspaceGitWatchTarget>();
  private readonly workspaceSetupSnapshots: Map<string, WorkspaceSetupSnapshot>;
  private readonly workspaceGitFetchSubscriptions = new Map<string, () => void>();
  private readonly workspaceGitSubscriptions = new Map<string, () => void>();
  private readonly workspaceDirectory: WorkspaceDirectory;
  private registerVoiceSpeakHandler?: (agentId: string, handler: VoiceSpeakHandler) => void;
  private unregisterVoiceSpeakHandler?: (agentId: string) => void;
  private registerVoiceCallerContext?: (agentId: string, context: VoiceCallerContext) => void;
  private unregisterVoiceCallerContext?: (agentId: string) => void;
  private getSpeechReadiness?: () => SpeechReadinessSnapshot;
  private readonly sttLanguage: string;
  private readonly serverId: string | undefined;
  private readonly daemonVersion: string | undefined;
  private readonly daemonRuntimeConfig: SessionOptions["daemonRuntimeConfig"];
  private readonly createAgentLifecycleDispatch: CreateAgentLifecycleDispatch;
  private voiceModeAgentId: string | null = null;
  private voiceModeBaseConfig: VoiceModeBaseConfig | null = null;
  private readonly checkoutGitHandler: CheckoutGitHandler;
  private readonly chatScheduleLoopHandler: ChatScheduleLoopHandler;
  private readonly configControlHandler: ConfigControlHandler;
  private readonly providerHandler: ProviderHandler;
  private readonly terminalScriptHandler: TerminalScriptHandler;
  private readonly workspaceProjectHandler: WorkspaceProjectHandler;
  private readonly agentLifecycleHandler: AgentLifecycleHandler;

  constructor(options: SessionOptions) {
    const {
      clientId,
      appVersion,
      clientCapabilities,
      onMessage,
      onBinaryMessage,
      onLifecycleIntent,
      logger,
      downloadTokenStore,
      pushTokenStore,
      chisacodeHome,
      agentManager,
      agentStorage,
      usageStore,
      projectRegistry,
      workspaceRegistry,
      chatService,
      scheduleService,
      loopService,
      checkoutDiffManager,
      github,
      workspaceGitService,
      daemonConfigStore,
      mcpBaseUrl,
      stt,
      sttLanguage,
      tts,
      terminalManager,
      providerSnapshotManager,
      scriptRouteStore,
      scriptRuntimeStore,
      workspaceSetupSnapshots,
      onBranchChanged,
      getDaemonTcpPort,
      getDaemonTcpHost,
      resolveScriptHealth,
      voice,
      voiceBridge,
      dictation,
      serverId,
      daemonVersion,
      daemonRuntimeConfig,
    } = options;
    this.clientId = clientId;
    this.appVersion = appVersion ?? null;
    this.clientCapabilities = parseClientCapabilities(clientCapabilities);
    this.sessionId = uuidv4();
    this.onMessage = onMessage;
    this.onBinaryMessage = onBinaryMessage ?? null;
    this.onLifecycleIntent = onLifecycleIntent ?? null;
    this.downloadTokenStore = downloadTokenStore;
    this.pushTokenStore = pushTokenStore;
    this.chisacodeHome = chisacodeHome;
    this.sessionLogger = logger.child({
      module: "session",
      clientId: this.clientId,
      sessionId: this.sessionId,
    });
    this.agentManager = agentManager;
    this.agentStorage = agentStorage;
    this.usageStore = usageStore ?? null;
    this.projectRegistry = projectRegistry;
    this.workspaceRegistry = workspaceRegistry;
    this.chatService = chatService;
    this.scheduleService = scheduleService;
    this.loopService = loopService;
    this.checkoutDiffManager = checkoutDiffManager;
    this.github = github ?? createGitHubService();
    this.workspaceGitService = workspaceGitService;
    this.daemonConfigStore = daemonConfigStore;
    this.mcpBaseUrl = mcpBaseUrl ?? null;
    this.terminalManager = terminalManager;
    this.agentPresetStore = new AgentPresetStore({
      chisacodeHome: this.chisacodeHome,
      logger: this.sessionLogger,
    });
    this.terminalController = new TerminalSessionController({
      terminalManager,
      emit: (msg) => this.emit(msg),
      emitBinary: (frame) => this.emitBinary(frame),
      hasBinaryChannel: () => this.onBinaryMessage !== null,
      isPathWithinRoot: (rootPath, candidatePath) => this.isPathWithinRoot(rootPath, candidatePath),
      sessionLogger: this.sessionLogger,
    });
    this.createAgentLifecycleDispatch = new CreateAgentLifecycleDispatch({
      chisacodeHome: this.chisacodeHome,
      agentManager: this.agentManager,
      agentStorage: this.agentStorage,
      github: this.github,
      workspaceGitService: this.workspaceGitService,
      createChisaCodeWorktreeWorkflow: (input, workflowOptions) =>
        this.createChisaCodeWorktreeWorkflow(input, workflowOptions),
      archiveAgentForClose: (agentId) => this.archiveAgentForClose(agentId),
      archiveWorkspaceRecord: (workspaceId) => this.archiveWorkspaceRecord(workspaceId),
      emit: (message) => this.emit(message),
      emitAgentRemove: (agentId) => {
        if (this.agentUpdatesSubscription) {
          this.bufferOrEmitAgentUpdate(this.agentUpdatesSubscription, {
            kind: "remove",
            agentId,
          });
        }
      },
      emitWorkspaceUpdatesForWorkspaceIds: (workspaceIds) =>
        this.emitWorkspaceUpdatesForWorkspaceIds(workspaceIds),
      markWorkspaceArchiving: (workspaceIds, archivingAt) =>
        this.markWorkspaceArchiving(workspaceIds, archivingAt),
      clearWorkspaceArchiving: (workspaceIds) => this.clearWorkspaceArchiving(workspaceIds),
      isPathWithinRoot: (rootPath, candidatePath) => this.isPathWithinRoot(rootPath, candidatePath),
      killTerminalsUnderPath: (rootPath) =>
        this.terminalController.killTerminalsUnderPath(rootPath),
      logger: this.sessionLogger,
    });
    this.providerSnapshotManager = providerSnapshotManager;
    this.scriptRouteStore = scriptRouteStore ?? null;
    this.scriptRuntimeStore = scriptRuntimeStore ?? null;
    this.workspaceSetupSnapshots = workspaceSetupSnapshots ?? new Map();
    this.onBranchChanged = onBranchChanged;
    this.getDaemonTcpPort = getDaemonTcpPort ?? null;
    this.getDaemonTcpHost = getDaemonTcpHost ?? null;
    this.resolveScriptHealth = resolveScriptHealth ?? null;
    this.sttLanguage = sttLanguage ?? "en";
    this.subscribeToOptionalManagers();
    this.bindVoiceBridges({ voice, voiceBridge, dictation });
    this.serverId = serverId;
    this.daemonVersion = daemonVersion;
    this.daemonRuntimeConfig = daemonRuntimeConfig;
    this.abortController = new AbortController();
    this.workspaceDirectory = new WorkspaceDirectory({
      logger: this.sessionLogger,
      projectRegistry: this.projectRegistry,
      workspaceRegistry: this.workspaceRegistry,
      listAgentPayloads: () => this.listAgentPayloads(),
      isProviderVisibleToClient: (provider) => this.isProviderVisibleToClient(provider),
      buildWorkspaceDescriptor: (input) => this.buildWorkspaceDescriptor(input),
    });

    this.initializePerSessionManagers({ tts, stt, sttLanguage, dictation });

    // Initialize agent MCP client asynchronously
    void this.initializeAgentMcp();
    this.subscribeToAgentEvents();

    // Initialize handlers with a shared SessionContext facade.
    const sessionContext = this.createSessionContext();
    this.checkoutGitHandler = new CheckoutGitHandler(sessionContext);
    this.chatScheduleLoopHandler = new ChatScheduleLoopHandler(sessionContext);
    this.configControlHandler = new ConfigControlHandler(sessionContext);
    this.providerHandler = new ProviderHandler(sessionContext);
    this.terminalScriptHandler = new TerminalScriptHandler(sessionContext);
    this.workspaceProjectHandler = new WorkspaceProjectHandler(sessionContext);
    this.agentLifecycleHandler = new AgentLifecycleHandler(sessionContext);

    this.sessionLogger.trace({}, "agent.session.lifecycle.created");
  }

  private createSessionContext(): SessionContext {
    return {
      clientId: this.clientId,
      sessionId: this.sessionId,
      sessionLogger: this.sessionLogger,
      chisacodeHome: this.chisacodeHome,
      appVersion: this.appVersion,
      agentManager: this.agentManager,
      agentStorage: this.agentStorage,
      daemonConfigStore: this.daemonConfigStore,
      projectRegistry: this.projectRegistry,
      providerSnapshotManager: this.providerSnapshotManager,
      workspaceGitService: this.workspaceGitService,
      github: this.github,
      checkoutDiffManager: this.checkoutDiffManager,
      abortController: this.abortController,
      chatService: this.chatService,
      scheduleService: this.scheduleService,
      loopService: this.loopService,
      agentPresetStore: this.agentPresetStore,
      terminalManager: this.terminalManager,
      terminalController: this.terminalController,
      scriptRouteStore: this.scriptRouteStore,
      scriptRuntimeStore: this.scriptRuntimeStore,
      workspaceRegistry: this.workspaceRegistry,
      getDaemonTcpPort: this.getDaemonTcpPort,
      getDaemonTcpHost: this.getDaemonTcpHost,
      resolveScriptHealth: this.resolveScriptHealth,
      emit: (message) => this.emit(message),
      notifyGitMutation: (cwd, reason, opts) => this.notifyGitMutation(cwd, reason, opts),
      emitWorkspaceUpdateForCwd: (cwd) => this.emitWorkspaceUpdateForCwd(cwd),
      emitWorkspaceUpdateForWorkspaceId: (workspaceId) =>
        this.emitWorkspaceUpdateForWorkspaceId(workspaceId),
      emitWorkspaceUpdatesForWorkspaceIds: (workspaceIds, options) =>
        this.emitWorkspaceUpdatesForWorkspaceIds(workspaceIds, options),
      handleWorkspaceGitBranchSnapshot: (cwd, branchName) =>
        this.handleWorkspaceGitBranchSnapshot(cwd, branchName),
      generateCommitMessage: (cwd) => this.generateCommitMessage(cwd),
      generatePullRequestText: (cwd, baseRef) => this.generatePullRequestText(cwd, baseRef),
      resolveAgentIdentifier: (identifier) => this.resolveAgentIdentifier(identifier),
      supports: (capability) => this.supports(capability as ClientCapability),
      emitWorkspaceScriptStatusUpdate: (workspaceId, workspaceDirectory) =>
        this.emitWorkspaceScriptStatusUpdate(workspaceId, workspaceDirectory),
      // New handlers (Config / Workspace / AgentLifecycle)
      emitLifecycleIntent: (intent) => this.emitLifecycleIntent(intent as SessionLifecycleIntent),
      bufferOrEmitAgentUpdate: (subscription, payload) =>
        this.bufferOrEmitAgentUpdate(
          subscription as AgentUpdatesSubscriptionState,
          payload as AgentUpdatePayload,
        ),
      bufferOrEmitWorkspaceUpdate: (subscription, payload) =>
        this.bufferOrEmitWorkspaceUpdate(
          subscription as WorkspaceUpdatesSubscriptionState,
          payload as WorkspaceUpdatePayload,
        ),
      flushBootstrappedWorkspaceUpdates: (options) =>
        this.flushBootstrappedWorkspaceUpdates(
          options as Parameters<typeof this.flushBootstrappedWorkspaceUpdates>[0],
        ),
      matchesWorkspaceFilter: (input) =>
        this.matchesWorkspaceFilter(input as Parameters<typeof this.matchesWorkspaceFilter>[0]),
      reconcileAndEmitWorkspaceUpdates: () => this.reconcileAndEmitWorkspaceUpdates(),
      getWorkspaceUpdatesSubscription: () => this.workspaceUpdatesSubscription,
      setWorkspaceUpdatesSubscription: (subscription) => {
        this.workspaceUpdatesSubscription =
          subscription as WorkspaceUpdatesSubscriptionState | null;
      },
      flushBootstrappedAgentUpdates: (options) =>
        this.flushBootstrappedAgentUpdates(
          options as Parameters<typeof this.flushBootstrappedAgentUpdates>[0],
        ),
      matchesAgentFilter: (options) =>
        this.matchesAgentFilter(options as Parameters<typeof this.matchesAgentFilter>[0]),
      forwardAgentUpdate: (agent) =>
        this.forwardAgentUpdate(agent as Parameters<typeof this.forwardAgentUpdate>[0]),
      buildStoredAgentPayload: (record) =>
        this.buildStoredAgentPayload(record as Parameters<typeof this.buildStoredAgentPayload>[0]),
      buildProjectPlacementForCwd: (cwd) => this.buildProjectPlacementForCwd(cwd),
      buildAgentSessionConfig: (config, gitOptions, legacyWorktreeName, firstAgentContext) =>
        this.buildAgentSessionConfig(
          config as Parameters<typeof this.buildAgentSessionConfig>[0],
          gitOptions as Parameters<typeof this.buildAgentSessionConfig>[1],
          legacyWorktreeName as Parameters<typeof this.buildAgentSessionConfig>[2],
          firstAgentContext as Parameters<typeof this.buildAgentSessionConfig>[3],
        ),
      resolveCreateAgentWorkspace: (cwd, workspaceId) =>
        this.resolveCreateAgentWorkspace(
          cwd as Parameters<typeof this.resolveCreateAgentWorkspace>[0],
          workspaceId as Parameters<typeof this.resolveCreateAgentWorkspace>[1],
        ),
      createAgentLifecycleDispatch: this.createAgentLifecycleDispatch,
      buildAgentPayload: (agent) =>
        this.buildAgentPayload(agent as Parameters<typeof this.buildAgentPayload>[0]),
      isProviderVisibleToClient: (provider) => this.isProviderVisibleToClient(provider),
      buildWorkspaceDescriptor: (input) =>
        this.buildWorkspaceDescriptor(input as Parameters<typeof this.buildWorkspaceDescriptor>[0]),
      downloadTokenStore: this.downloadTokenStore,
      pushTokenStore: this.pushTokenStore,
      usageStore: this.usageStore,
      workspaceSetupSnapshots: this.workspaceSetupSnapshots,
      sttLanguage: this.sttLanguage,
      resolveKnownProjectRootForConfig: (repoRoot) =>
        resolveKnownProjectRootForConfig({
          repoRoot,
          projectRegistry: this.projectRegistry,
        }),
      // WorkspaceProjectHandler additions (cast as any to avoid structural type mismatch)
      listFetchWorkspacesEntries: (request) => (this.listFetchWorkspacesEntries as any)(request),
      syncWorkspaceGitObservers: (workspaces) =>
        (this.syncWorkspaceGitObservers as any)(workspaces),
      syncWorkspaceGitObserverForWorkspace: (workspace) =>
        (this.syncWorkspaceGitObserverForWorkspace as any)(workspace),
      findOrCreateWorkspaceForDirectory: (cwd) =>
        (this.findOrCreateWorkspaceForDirectory as any)(cwd),
      describeWorkspaceRecord: (workspace, projectRecord) =>
        (this.describeWorkspaceRecord as any)(workspace, projectRecord),
      describeCreatedWorktreeWorkspace: (result) =>
        (this.describeCreatedWorktreeWorkspace as any)(result),
      createChisaCodeWorktreeWorkflow: (input, options) =>
        (this.createChisaCodeWorktreeWorkflow as any)(input, options),
      archiveWorkspaceRecord: (workspaceId, archivedAt) =>
        (this.archiveWorkspaceRecord as any)(workspaceId, archivedAt),
      markWorkspaceArchiving: (workspaceIds, archivingAt) =>
        (this.markWorkspaceArchiving as any)(workspaceIds, archivingAt),
      clearWorkspaceArchiving: (workspaceIds) =>
        (this.clearWorkspaceArchiving as any)(workspaceIds),
      isPathWithinRoot: (rootPath, candidatePath) =>
        (this.isPathWithinRoot as any)(rootPath, candidatePath),
      getAvailableEditorTargets: () => (this.getAvailableEditorTargets as any)(),
      openEditorTarget: (options) => (this.openEditorTarget as any)(options),
      hasBinaryChannel: () => this.onBinaryMessage !== null,
      emitBinary: (frame) => this.emitBinary(frame),

      // Agent selection helpers for workspace auto-name
      getFocusedAgentSelectionForCwd: (cwd) => this.getFocusedAgentSelectionForCwd(cwd),
      readStructuredGenerationDaemonConfig: () => this.readStructuredGenerationDaemonConfig(),

      serverId: this.serverId,
      daemonVersion: this.daemonVersion,
      daemonRuntimeConfig: this.daemonRuntimeConfig,
      mcpBaseUrl: this.mcpBaseUrl,
    };
  }

  updateAppVersion(appVersion: string | null): void {
    if (appVersion && appVersion !== this.appVersion) {
      this.appVersion = appVersion;
    }
  }

  updateClientCapabilities(capabilities: Record<string, unknown> | null): void {
    this.clientCapabilities = parseClientCapabilities(capabilities);
  }

  supports(capability: ClientCapability): boolean {
    return this.clientCapabilities.has(capability);
  }

  // COMPAT(customModeIcons): rewrite icons unknown to v0.1.83 clients (whose MODE_ICONS
  // map is a closed enum and would render `undefined`, crashing in render). Drop
  // this and the cap gate when floor >= v0.1.84.
  private downgradeModeIconsForClient<T extends { icon?: string }>(modes: T[]): T[] {
    if (this.supports(CLIENT_CAPS.customModeIcons)) return modes;
    return modes.map((mode) =>
      mode.icon && !LEGACY_MODE_ICONS.has(mode.icon) ? { ...mode, icon: "ShieldCheck" } : mode,
    );
  }

  private downgradeEntryModesForClient<T extends { modes?: { icon?: string }[] }>(
    entries: T[],
  ): T[] {
    if (this.supports(CLIENT_CAPS.customModeIcons)) return entries;
    return entries.map((entry) =>
      entry.modes ? { ...entry, modes: this.downgradeModeIconsForClient(entry.modes) } : entry,
    );
  }

  async syncWorkspaceGitObserverForWorkspace(workspace: PersistedWorkspaceRecord): Promise<void> {
    const descriptor = await this.describeWorkspaceRecordWithGitData(workspace);
    this.syncWorkspaceGitObservers([descriptor]);
  }

  async emitWorkspaceUpdateForWorkspaceId(workspaceId: string): Promise<void> {
    await this.emitWorkspaceUpdatesForWorkspaceIds([workspaceId], { skipReconcile: true });
  }

  async archiveWorkspaceRecordForExternalMutation(workspaceId: string): Promise<void> {
    await this.archiveWorkspaceRecord(workspaceId);
  }

  markWorkspaceArchivingForExternalMutation(
    workspaceIds: Iterable<string>,
    archivingAt: string,
  ): void {
    this.markWorkspaceArchiving(workspaceIds, archivingAt);
  }

  clearWorkspaceArchivingForExternalMutation(workspaceIds: Iterable<string>): void {
    this.clearWorkspaceArchiving(workspaceIds);
  }

  async emitWorkspaceUpdatesForExternalWorkspaceIds(workspaceIds: Iterable<string>): Promise<void> {
    await this.emitWorkspaceUpdatesForWorkspaceIds(workspaceIds);
  }

  async emitWorkspaceUpdatesForExternalCwds(cwds: Iterable<string>): Promise<void> {
    await Promise.all(Array.from(cwds, (cwd) => this.emitWorkspaceUpdateForCwd(cwd)));
  }

  async warmWorkspaceGitDataForWorkspace(workspace: PersistedWorkspaceRecord): Promise<void> {
    await this.syncWorkspaceGitObserverForWorkspace(workspace);
    await this.emitWorkspaceUpdateForWorkspaceId(workspace.workspaceId);
  }

  /**
   * Get the client's current activity state
   */
  public getClientActivity(): {
    deviceType: "web" | "mobile";
    focusedAgentId: string | null;
    lastActivityAt: Date;
    appVisible: boolean;
    appVisibilityChangedAt: Date;
  } | null {
    return this.clientActivity;
  }

  private getFocusedAgentSelectionForCwd(cwd: string):
    | {
        provider?: string | null;
        model?: string | null;
        thinkingOptionId?: string | null;
      }
    | undefined {
    const focusedAgentId = this.clientActivity?.focusedAgentId;
    if (!focusedAgentId) {
      return undefined;
    }

    const agent = this.agentManager.getAgent(focusedAgentId);
    if (!agent || agent.cwd !== cwd) {
      return undefined;
    }

    return {
      provider: agent.provider,
      model: agent.runtimeInfo?.model ?? agent.config.model ?? null,
      thinkingOptionId:
        agent.runtimeInfo?.thinkingOptionId ?? agent.config.thinkingOptionId ?? null,
    };
  }

  private readStructuredGenerationDaemonConfig(): StructuredGenerationDaemonConfig {
    return {
      metadataGeneration: this.daemonConfigStore.get().metadataGeneration,
    };
  }

  public getRuntimeMetrics(): SessionRuntimeMetrics {
    const terminalMetrics = this.terminalController.getMetrics();
    return {
      terminalDirectorySubscriptionCount: terminalMetrics.directorySubscriptionCount,
      terminalSubscriptionCount: terminalMetrics.streamSubscriptionCount,
      inflightRequests: this.inflightRequests,
      peakInflightRequests: this.peakInflightRequests,
    };
  }

  public emitServerMessage(message: SessionOutboundMessage): void {
    this.emit(message);
  }

  /**
   * Send initial state to client after connection
   */
  public async sendInitialState(): Promise<void> {
    // No unsolicited agent list hydration. Callers must use fetch_agents_request.
  }

  /**
   * Normalize a user prompt (with optional image metadata) for AgentManager
   */
  private buildAgentPrompt(
    text: string,
    images?: Array<{ data: string; mimeType: string }>,
    attachments?: AgentAttachment[],
  ): AgentPromptInput {
    const normalized = text?.trim() ?? "";
    const hasImages = Boolean(images && images.length > 0);
    const hasAttachments = Boolean(attachments && attachments.length > 0);
    if (!hasImages && !hasAttachments) {
      return normalized;
    }
    const blocks: AgentPromptContentBlock[] = [];
    if (normalized.length > 0) {
      blocks.push({ type: "text", text: normalized });
    }
    for (const image of images ?? []) {
      blocks.push({ type: "image", data: image.data, mimeType: image.mimeType });
    }
    for (const attachment of attachments ?? []) {
      blocks.push(attachment);
    }
    return blocks;
  }

  /**
   * Interrupt the agent's active run so the next prompt starts a fresh turn.
   * Returns once the manager confirms the stream has been cancelled.
   */
  private async interruptAgentIfRunning(agentId: string): Promise<void> {
    const snapshot = this.agentManager.getAgent(agentId);
    if (!snapshot) {
      this.sessionLogger.trace({ agentId }, "agent.session.interrupt.not_found");
      throw new Error(`Agent ${agentId} not found`);
    }

    const hasInFlightRun = this.agentManager.hasInFlightRun(agentId);
    if (!hasInFlightRun) {
      this.sessionLogger.trace(
        {
          agentId,
          provider: snapshot.provider,
          lifecycle: snapshot.lifecycle,
          hasInFlightRun,
        },
        "agent.session.interrupt.skip_not_running",
      );
      return;
    }

    this.sessionLogger.debug(
      { agentId, lifecycle: snapshot.lifecycle, hasInFlightRun },
      "interruptAgentIfRunning: interrupting",
    );

    const t0 = Date.now();
    const cancelled = await this.agentManager.cancelAgentRun(agentId);
    this.sessionLogger.debug(
      { agentId, cancelled, durationMs: Date.now() - t0 },
      "interruptAgentIfRunning: cancelAgentRun completed",
    );
    if (!cancelled) {
      this.sessionLogger.warn(
        { agentId },
        "interruptAgentIfRunning: reported running but no active run was cancelled",
      );
    }
  }

  /**
   * Initialize Agent MCP client for this session using the daemon's HTTP MCP endpoint.
   */
  private async initializeAgentMcp(): Promise<void> {
    try {
      if (!this.mcpBaseUrl) {
        this.sessionLogger.info(
          "Skipping Agent MCP initialization because no MCP base URL is configured",
        );
        return;
      }
      const transport = new StreamableHTTPClientTransport(new URL(this.mcpBaseUrl));

      this.agentMcpClient = await experimental_createMCPClient({
        transport,
      });

      this.agentTools = (await this.agentMcpClient.tools()) as ToolSet;
      const agentToolCount = Object.keys(this.agentTools ?? {}).length;
      this.sessionLogger.trace({ agentToolCount }, "agent.session.mcp_init");
    } catch (error) {
      this.sessionLogger.error({ err: error }, "Failed to initialize Agent MCP");
    }
  }

  /**
   * Subscribe to AgentManager events and forward them to the client
   */
  private subscribeToOptionalManagers(): void {
    // VOICE_DISABLED — was used for voice provider lifecycle
  }

  // VOICE_DISABLED: bindVoiceBridges is a no-op stub.
  private bindVoiceBridges(_params: {
    voice?: SessionOptions["voice"];
    voiceBridge?: SessionOptions["voiceBridge"];
    dictation?: SessionOptions["dictation"];
  }): void {
    // Voice feature disabled — no-op.
  }

  // VOICE_DISABLED: initializePerSessionManagers is a no-op stub.
  private initializePerSessionManagers(_params: {
    tts?: SessionOptions["tts"];
    stt?: SessionOptions["stt"];
    sttLanguage?: SessionOptions["sttLanguage"];
    dictation?: SessionOptions["dictation"];
  }): void {
    // Voice feature disabled — no-op.
  }

  private subscribeToAgentEvents(): void {
    if (this.unsubscribeAgentEvents) {
      this.unsubscribeAgentEvents();
    }

    this.unsubscribeAgentEvents = this.agentManager.subscribe(
      (event) => {
        if (event.type === "agent_state") {
          this.sessionLogger.trace(
            {
              agentId: event.agent.id,
              provider: event.agent.provider,
              providerSessionId: event.agent.persistence?.sessionId ?? undefined,
              turnId: event.agent.activeForegroundTurnId ?? undefined,
              lifecycle: event.agent.lifecycle,
            },
            "agent.session.forward_update",
          );
          void this.forwardAgentUpdate(event.agent);
          return;
        }

        if (
          this.isVoiceMode &&
          this.voiceModeAgentId === event.agentId &&
          event.event.type === "permission_requested" &&
          isVoicePermissionAllowed(event.event.request)
        ) {
          const requestId = event.event.request.id;
          void this.agentManager
            .respondToPermission(event.agentId, requestId, {
              behavior: "allow",
            })
            .catch((error) => {
              this.sessionLogger.warn(
                {
                  err: error,
                  agentId: event.agentId,
                  requestId,
                },
                "Failed to auto-allow speak tool permission in voice mode",
              );
            });
        }

        const serializedEvent = serializeAgentStreamEvent(event.event);
        if (!serializedEvent) {
          return;
        }
        this.sessionLogger.trace(
          {
            agentId: event.agentId,
            provider: event.event.provider,
            turnId: getAgentStreamEventTurnId(event.event),
            seq: event.seq,
            epoch: event.epoch,
            event: event.event,
          },
          "agent.session.forward_stream",
        );

        this.emit({
          type: "agent_stream",
          payload: this.buildAgentStreamPayload(event, serializedEvent),
        });

        if (event.event.type === "permission_requested") {
          this.emit({
            type: "agent_permission_request",
            payload: {
              agentId: event.agentId,
              request: event.event.request,
            },
          });
        } else if (event.event.type === "permission_resolved") {
          this.emit({
            type: "agent_permission_resolved",
            payload: {
              agentId: event.agentId,
              requestId: event.event.requestId,
              resolution: event.event.resolution,
            },
          });
        }

        // Title updates may be applied asynchronously after agent creation.
      },
      { replayState: false },
    );
  }

  private buildAgentStreamPayload(
    event: Extract<AgentManagerEvent, { type: "agent_stream" }>,
    serializedEvent: Extract<SessionOutboundMessage, { type: "agent_stream" }>["payload"]["event"],
  ): Extract<SessionOutboundMessage, { type: "agent_stream" }>["payload"] {
    return {
      agentId: event.agentId,
      event: serializedEvent,
      timestamp: event.timestamp ?? new Date().toISOString(),
      ...(typeof event.seq === "number" ? { seq: event.seq } : {}),
      ...(typeof event.epoch === "string" ? { epoch: event.epoch } : {}),
    };
  }

  private async buildAgentPayload(agent: ManagedAgent): Promise<AgentSnapshotPayload> {
    const storedRecord = await this.agentStorage.get(agent.id);
    const title = storedRecord?.title ?? null;
    const payload = toAgentPayload(agent, { title });
    const storedUpdatedAt = storedRecord ? resolveStoredAgentPayloadUpdatedAt(storedRecord) : null;
    if (storedUpdatedAt) {
      const liveUpdatedAt = Date.parse(payload.updatedAt);
      const persistedUpdatedAt = Date.parse(storedUpdatedAt);
      if (Number.isNaN(liveUpdatedAt) || persistedUpdatedAt > liveUpdatedAt) {
        payload.updatedAt = storedUpdatedAt;
      }
    }
    payload.archivedAt = storedRecord?.archivedAt ?? null;
    return payload;
  }

  private buildStoredAgentPayload(
    record: StoredAgentRecord,
    registeredProviderIds = this.providerSnapshotManager.listRegisteredProviderIds(),
  ): AgentSnapshotPayload {
    return buildStoredAgentPayload(record, registeredProviderIds);
  }

  private isProviderVisibleToClient(provider: string): boolean {
    if (clientSupportsAllProviders(this.appVersion)) {
      return true;
    }
    return LEGACY_PROVIDER_IDS.has(provider);
  }

  private filterEditorsForClient(
    editors: EditorTargetDescriptorPayload[],
  ): EditorTargetDescriptorPayload[] {
    if (clientSupportsFlexibleEditorIds(this.appVersion)) {
      return editors;
    }
    return editors.filter((editor) => isLegacyEditorTargetId(editor.id));
  }

  private agentThinkingOptionMatchesFilter(
    agent: AgentSnapshotPayload,
    filter: AgentUpdatesFilter,
  ): boolean {
    if (filter.thinkingOptionId === undefined) {
      return true;
    }
    const expectedThinkingOptionId = resolveEffectiveThinkingOptionId({
      configuredThinkingOptionId: filter.thinkingOptionId ?? null,
    });
    const resolvedThinkingOptionId =
      agent.effectiveThinkingOptionId ??
      resolveEffectiveThinkingOptionId({
        runtimeInfo: agent.runtimeInfo,
        configuredThinkingOptionId: agent.thinkingOptionId ?? null,
      });
    return resolvedThinkingOptionId === expectedThinkingOptionId;
  }

  private matchesAgentStructuralFilter(
    agent: AgentSnapshotPayload,
    project: ProjectPlacementPayload,
    filter: AgentUpdatesFilter,
  ): boolean {
    if (filter.statuses && filter.statuses.length > 0) {
      const statuses = new Set(filter.statuses);
      if (!statuses.has(agent.status)) {
        return false;
      }
    }

    if (typeof filter.requiresAttention === "boolean") {
      const requiresAttention = agent.requiresAttention ?? false;
      if (requiresAttention !== filter.requiresAttention) {
        return false;
      }
    }

    if (filter.projectKeys && filter.projectKeys.length > 0) {
      const projectKeys = new Set(filter.projectKeys.filter((item) => item.trim().length > 0));
      if (projectKeys.size > 0 && !projectKeys.has(project.projectKey)) {
        return false;
      }
    }
    return true;
  }

  private matchesAgentFilter(options: {
    agent: AgentSnapshotPayload;
    project: ProjectPlacementPayload;
    filter?: AgentUpdatesFilter;
  }): boolean {
    const { agent, project, filter } = options;

    if (filter?.labels) {
      const matchesLabels = Object.entries(filter.labels).every(
        ([key, value]) => agent.labels[key] === value,
      );
      if (!matchesLabels) {
        return false;
      }
    }

    const includeArchived = filter?.includeArchived ?? false;
    if (!includeArchived && agent.archivedAt) {
      return false;
    }

    if (filter && !this.agentThinkingOptionMatchesFilter(agent, filter)) {
      return false;
    }

    if (filter && !this.matchesAgentStructuralFilter(agent, project, filter)) {
      return false;
    }

    return true;
  }

  private getAgentUpdateTargetId(update: AgentUpdatePayload): string {
    return update.kind === "remove" ? update.agentId : update.agent.id;
  }

  private bufferOrEmitAgentUpdate(
    subscription: AgentUpdatesSubscriptionState,
    payload: AgentUpdatePayload,
  ): void {
    if (payload.kind === "upsert" && !this.isProviderVisibleToClient(payload.agent.provider)) {
      return;
    }
    if (subscription.isBootstrapping) {
      subscription.pendingUpdatesByAgentId.set(this.getAgentUpdateTargetId(payload), payload);
      return;
    }

    this.emit({
      type: "agent_update",
      payload,
    });
  }

  private flushBootstrappedAgentUpdates(options?: {
    snapshotUpdatedAtByAgentId?: Map<string, number>;
  }): void {
    const subscription = this.agentUpdatesSubscription;
    if (!subscription || !subscription.isBootstrapping) {
      return;
    }

    subscription.isBootstrapping = false;
    const pending = Array.from(subscription.pendingUpdatesByAgentId.values());
    subscription.pendingUpdatesByAgentId.clear();

    for (const payload of pending) {
      if (payload.kind === "upsert") {
        const snapshotUpdatedAt = options?.snapshotUpdatedAtByAgentId?.get(payload.agent.id);
        if (typeof snapshotUpdatedAt === "number") {
          const updateUpdatedAt = Date.parse(payload.agent.updatedAt);
          if (!Number.isNaN(updateUpdatedAt) && updateUpdatedAt <= snapshotUpdatedAt) {
            continue;
          }
        }
      }

      this.emit({
        type: "agent_update",
        payload,
      });
    }
  }

  private async findWorkspaceByDirectory(
    cwd: string,
    options?: { refreshGit?: boolean },
  ): Promise<PersistedWorkspaceRecord | null> {
    const normalizedCwd = await this.resolveWorkspaceDirectory(cwd, options);
    const workspaces = await this.workspaceRegistry.list();
    const workspaceId = this.resolveRegisteredWorkspaceIdForCwd(normalizedCwd, workspaces);
    return workspaces.find((workspace) => workspace.workspaceId === workspaceId) ?? null;
  }

  private async findExactWorkspaceByDirectory(
    cwd: string,
    options?: { refreshGit?: boolean },
  ): Promise<PersistedWorkspaceRecord | null> {
    const normalizedCwd = await this.resolveWorkspaceDirectory(cwd, options);
    const workspaces = await this.workspaceRegistry.list();
    return workspaces.find((workspace) => workspace.cwd === normalizedCwd) ?? null;
  }

  private async resolveWorkspaceDirectory(
    cwd: string,
    options?: { refreshGit?: boolean },
  ): Promise<string> {
    const normalizedCwd = normalizePersistedWorkspaceId(cwd);
    if (options?.refreshGit === false) {
      const snapshot = this.workspaceGitService.peekSnapshot(normalizedCwd);
      return normalizePersistedWorkspaceId(snapshot?.git.repoRoot ?? normalizedCwd);
    }

    const checkout = await this.workspaceGitService.getCheckout(normalizedCwd);
    return normalizePersistedWorkspaceId(checkout.worktreeRoot ?? normalizedCwd);
  }

  private async buildProjectPlacementForWorkspace(
    workspace: PersistedWorkspaceRecord,
    projectRecord?: PersistedProjectRecord | null,
  ): Promise<ProjectPlacementPayload> {
    const project = projectRecord ?? (await this.projectRegistry.get(workspace.projectId));
    if (!project) {
      throw new Error(`Project not found for workspace ${workspace.workspaceId}`);
    }
    const checkout = buildWorkspaceCheckout(workspace, project);
    return {
      projectKey: project.projectId,
      projectName: resolveProjectDisplayName(project),
      checkout,
    };
  }

  private async buildProjectPlacementForCwd(
    cwd: string,
    options?: { refreshGit?: boolean; fallback?: boolean },
  ): Promise<ProjectPlacementPayload | null> {
    const workspace = await this.findWorkspaceByDirectory(cwd, {
      refreshGit: options?.refreshGit,
    });
    if (!workspace) {
      if (!options?.fallback) {
        return null;
      }

      const normalizedCwd = normalizePersistedWorkspaceId(cwd);
      return {
        projectKey: normalizedCwd,
        projectName: deriveProjectGroupingName(normalizedCwd),
        checkout: {
          cwd: normalizedCwd,
          isGit: false,
          currentBranch: null,
          remoteUrl: null,
          worktreeRoot: null,
          isChisaCodeOwnedWorktree: false,
          mainRepoRoot: null,
        },
      };
    }
    return this.buildProjectPlacementForWorkspace(workspace);
  }

  private async forwardAgentUpdate(agent: ManagedAgent): Promise<void> {
    try {
      const subscription = this.agentUpdatesSubscription;
      const payload = await this.buildAgentPayload(agent);
      if (subscription) {
        const project = await this.buildProjectPlacementForCwd(payload.cwd, {
          refreshGit: false,
          fallback: true,
        });
        if (!project) {
          throw new Error(`Workspace not found for agent ${payload.id}`);
        }
        const matches = this.matchesAgentFilter({
          agent: payload,
          project,
          filter: subscription.filter,
        });

        if (matches) {
          this.bufferOrEmitAgentUpdate(subscription, {
            kind: "upsert",
            agent: payload,
            project,
          });
        } else {
          this.bufferOrEmitAgentUpdate(subscription, {
            kind: "remove",
            agentId: payload.id,
          });
        }
      }

      await this.emitWorkspaceUpdateForCwd(payload.cwd);
    } catch (error) {
      this.sessionLogger.error({ err: error }, "Failed to emit agent update");
    }
  }

  /**
   * Main entry point for processing session messages
   */
  public async handleMessage(msg: SessionInboundMessage): Promise<void> {
    this.inflightRequests++;
    if (this.inflightRequests > this.peakInflightRequests) {
      this.peakInflightRequests = this.inflightRequests;
    }
    try {
      this.sessionLogger.trace(
        {
          messageType: msg.type,
          payloadBytes: JSON.stringify(msg).length,
        },
        "agent.session.inbound",
      );
      try {
        await this.dispatchInboundMessage(msg);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.sessionLogger.error({ err }, "Error handling message");

        const requestId =
          "requestId" in msg && typeof msg.requestId === "string" ? msg.requestId : undefined;
        if (typeof requestId === "string") {
          try {
            this.emit({
              type: "rpc_error",
              payload: {
                requestId,
                requestType: msg.type,
                error: `Request failed: ${err.message}`,
                code: "handler_error",
              },
            });
          } catch (emitError) {
            this.sessionLogger.error({ err: emitError }, "Failed to emit rpc_error");
          }
        }

        this.emit({
          type: "activity_log",
          payload: {
            id: uuidv4(),
            timestamp: new Date(),
            type: "error",
            content: `Error: ${err.message}`,
          },
        });
      }
    } finally {
      this.inflightRequests--;
    }
  }

  private async dispatchInboundMessage(msg: SessionInboundMessage): Promise<void> {
    const promise =
      this.dispatchVoiceAndControlMessage(msg) ??
      this.dispatchAgentLifecycleMessage(msg) ??
      this.dispatchCheckoutMessage(msg) ??
      this.dispatchWorkspaceAndProjectMessage(msg) ??
      this.dispatchProviderMessage(msg) ??
      this.dispatchTerminalMessage(msg) ??
      this.dispatchChatScheduleLoopMessage(msg) ??
      this.dispatchMiscMessage(msg);
    if (promise) await promise;
  }

  private dispatchVoiceAndControlMessage(msg: SessionInboundMessage): Promise<void> | undefined {
    switch (msg.type) {
      // Voice cases: silently ignored (voice feature disabled)
      case "voice_audio_chunk":
      case "audio_played":
      case "set_voice_mode":
      case "dictation_stream_start":
      case "dictation_stream_chunk":
      case "dictation_stream_finish":
      case "dictation_stream_cancel":
        return undefined;
      case "abort_request":
        return this.handleAbort();
      case "client_heartbeat":
        this.handleClientHeartbeat(msg);
        return undefined;
      case "ping": {
        const now = Date.now();
        this.emit({
          type: "pong",
          payload: {
            requestId: msg.requestId,
            clientSentAt: msg.clientSentAt,
            serverReceivedAt: now,
            serverSentAt: now,
          },
        });
        return undefined;
      }
      default:
        return undefined;
    }
  }

  private dispatchAgentLifecycleMessage(msg: SessionInboundMessage): Promise<void> | undefined {
    return this.agentLifecycleHandler.dispatch(msg);
  }

  // eslint-disable-next-line complexity
  private dispatchCheckoutMessage(msg: SessionInboundMessage): Promise<void> | undefined {
    switch (msg.type) {
      case "checkout_status_request":
        return this.checkoutGitHandler.handleCheckoutStatusRequest(msg);
      case "validate_branch_request":
        return this.checkoutGitHandler.handleValidateBranchRequest(msg);
      case "branch_suggestions_request":
        return this.checkoutGitHandler.handleBranchSuggestionsRequest(msg);
      case "directory_suggestions_request":
        return this.checkoutGitHandler.handleDirectorySuggestionsRequest(msg);
      case "subscribe_checkout_diff_request":
        return this.checkoutGitHandler.handleSubscribeCheckoutDiffRequest(msg);
      case "unsubscribe_checkout_diff_request":
        this.checkoutGitHandler.handleUnsubscribeCheckoutDiffRequest(msg);
        return undefined;
      case "checkout_switch_branch_request":
        return this.checkoutGitHandler.handleCheckoutSwitchBranchRequest(msg);
      case "checkout.rename_branch.request":
        return this.checkoutGitHandler.handleCheckoutRenameBranchRequest(msg);
      case "checkout_commit_request":
        return this.checkoutGitHandler.handleCheckoutCommitRequest(msg);
      case "checkout_merge_request":
        return this.checkoutGitHandler.handleCheckoutMergeRequest(msg);
      case "checkout_merge_from_base_request":
        return this.checkoutGitHandler.handleCheckoutMergeFromBaseRequest(msg);
      case "checkout_pull_request":
        return this.checkoutGitHandler.handleCheckoutPullRequest(msg);
      case "checkout_push_request":
        return this.checkoutGitHandler.handleCheckoutPushRequest(msg);
      case "checkout.refresh.request":
        return this.checkoutGitHandler.handleCheckoutRefreshRequest(msg);
      case "checkout_pr_create_request":
        return this.checkoutGitHandler.handleCheckoutPrCreateRequest(msg);
      case "checkout_pr_merge_request":
        return this.checkoutGitHandler.handleCheckoutPrMergeRequest(msg);
      case "checkout.github.set_auto_merge.request":
        return this.checkoutGitHandler.handleCheckoutGithubSetAutoMergeRequest(msg);
      case "checkout_pr_status_request":
        return this.checkoutGitHandler.handleCheckoutPrStatusRequest(msg);
      case "pull_request_timeline_request":
        return this.checkoutGitHandler.handlePullRequestTimelineRequest(msg);
      case "github_search_request":
        return this.checkoutGitHandler.handleGitHubSearchRequest(msg);
      case "stash_save_request":
        return this.checkoutGitHandler.handleStashSaveRequest(msg);
      case "stash_pop_request":
        return this.checkoutGitHandler.handleStashPopRequest(msg);
      case "stash_list_request":
        return this.checkoutGitHandler.handleStashListRequest(msg);
      default:
        return undefined;
    }
  }

  private dispatchWorkspaceAndProjectMessage(
    msg: SessionInboundMessage,
  ): Promise<void> | undefined {
    return this.workspaceProjectHandler.dispatch(msg);
  }

  private dispatchProviderMessage(msg: SessionInboundMessage): Promise<void> | undefined {
    switch (msg.type) {
      case "list_provider_models_request":
        return this.providerHandler.handleListProviderModelsRequest(msg);
      case "list_provider_modes_request":
        return this.providerHandler.handleListProviderModesRequest(msg);
      case "list_provider_features_request":
        return this.providerHandler.handleListProviderFeaturesRequest(msg);
      case "list_available_providers_request":
        return this.providerHandler.handleListAvailableProvidersRequest(msg);
      case "get_providers_snapshot_request":
        return this.providerHandler.handleGetProvidersSnapshotRequest(msg);
      case "refresh_providers_snapshot_request":
        return this.providerHandler.handleRefreshProvidersSnapshotRequest(msg);
      case "provider_diagnostic_request":
        return this.providerHandler.handleProviderDiagnosticRequest(msg);
      case "provider.tooling.run.request":
        return this.providerHandler.handleProviderToolingActionRequest(msg);
      case "agent.presets.list.request":
        return this.providerHandler.handleAgentPresetsListRequest(msg);
      case "model_gateway.moa.test.request":
        return this.providerHandler.handleModelGatewayMoaTestRequest(msg);
      default:
        return undefined;
    }
  }

  private dispatchTerminalMessage(msg: SessionInboundMessage): Promise<void> | undefined {
    return this.terminalScriptHandler.dispatchTerminalMessage(msg);
  }

  private dispatchChatScheduleLoopMessage(msg: SessionInboundMessage): Promise<void> | undefined {
    switch (msg.type) {
      case "chat/create":
        return this.chatScheduleLoopHandler.handleChatCreateRequest(msg);
      case "chat/list":
        return this.chatScheduleLoopHandler.handleChatListRequest(msg);
      case "chat/inspect":
        return this.chatScheduleLoopHandler.handleChatInspectRequest(msg);
      case "chat/delete":
        return this.chatScheduleLoopHandler.handleChatDeleteRequest(msg);
      case "chat/post":
        return this.chatScheduleLoopHandler.handleChatPostRequest(msg);
      case "chat/read":
        return this.chatScheduleLoopHandler.handleChatReadRequest(msg);
      case "chat/wait":
        return this.chatScheduleLoopHandler.handleChatWaitRequest(msg);
      case "loop/run":
        return this.chatScheduleLoopHandler.handleLoopRunRequest(msg);
      case "loop/list":
        return this.chatScheduleLoopHandler.handleLoopListRequest(msg);
      case "loop/inspect":
        return this.chatScheduleLoopHandler.handleLoopInspectRequest(msg);
      case "loop/logs":
        return this.chatScheduleLoopHandler.handleLoopLogsRequest(msg);
      case "loop/stop":
        return this.chatScheduleLoopHandler.handleLoopStopRequest(msg);
      default:
        return this.dispatchScheduleMessage(msg);
    }
  }

  private dispatchScheduleMessage(msg: SessionInboundMessage): Promise<void> | undefined {
    switch (msg.type) {
      case "schedule/create":
        return this.chatScheduleLoopHandler.handleScheduleCreateRequest(msg);
      case "schedule/list":
        return this.chatScheduleLoopHandler.handleScheduleListRequest(msg);
      case "schedule/inspect":
        return this.chatScheduleLoopHandler.handleScheduleInspectRequest(msg);
      case "schedule/logs":
        return this.chatScheduleLoopHandler.handleScheduleLogsRequest(msg);
      case "schedule/pause":
        return this.chatScheduleLoopHandler.handleSchedulePauseRequest(msg);
      case "schedule/resume":
        return this.chatScheduleLoopHandler.handleScheduleResumeRequest(msg);
      case "schedule/delete":
        return this.chatScheduleLoopHandler.handleScheduleDeleteRequest(msg);
      case "schedule/run-once":
        return this.chatScheduleLoopHandler.handleScheduleRunOnceRequest(msg);
      case "schedule/update":
        return this.chatScheduleLoopHandler.handleScheduleUpdateRequest(msg);
      default:
        return undefined;
    }
  }

  private async dispatchMiscMessage(msg: SessionInboundMessage): Promise<void> {
    return this.configControlHandler.dispatch(msg);
  }

  public resetPeakInflight(): void {
    this.peakInflightRequests = this.inflightRequests;
  }

  public handleBinaryFrame(frame: TerminalStreamFrame): void {
    this.terminalController.handleBinaryFrame(frame);
  }

  private emitLifecycleIntent(intent: SessionLifecycleIntent): void {
    if (!this.onLifecycleIntent) {
      return;
    }
    try {
      this.onLifecycleIntent(intent);
    } catch (error) {
      this.sessionLogger.error({ err: error, intent }, "Lifecycle intent handler failed");
    }
  }

  private async archiveAgentForClose(
    agentId: string,
  ): Promise<{ agentId: string; archivedAt: string }> {
    const { archivedAt, record: archivedRecord } = await archiveAgentCommand(
      {
        agentManager: this.agentManager,
        agentStorage: this.agentStorage,
        logger: this.sessionLogger,
      },
      agentId,
    );

    if (this.agentUpdatesSubscription) {
      const payload = this.buildStoredAgentPayload(archivedRecord);
      const project = await this.buildProjectPlacementForCwd(payload.cwd);
      if (project) {
        const matches = this.matchesAgentFilter({
          agent: payload,
          project,
          filter: this.agentUpdatesSubscription.filter,
        });
        this.bufferOrEmitAgentUpdate(
          this.agentUpdatesSubscription,
          matches
            ? {
                kind: "upsert",
                agent: payload,
                project,
              }
            : {
                kind: "remove",
                agentId,
              },
        );
      } else {
        this.bufferOrEmitAgentUpdate(this.agentUpdatesSubscription, {
          kind: "remove",
          agentId,
        });
      }
      await this.emitWorkspaceUpdateForCwd(payload.cwd);
    }

    return { agentId, archivedAt };
  }

  private toVoiceFeatureUnavailableContext(_state: unknown): unknown {
    throw new Error("VOICE_DISABLED");
  }

  private resolveModeReadinessState(_readiness: unknown, _mode: string): unknown {
    throw new Error("VOICE_DISABLED");
  }

  private getVoiceFeatureUnavailableResponseMetadata(_error: unknown): unknown {
    throw new Error("VOICE_DISABLED");
  }

  private resolveVoiceFeatureUnavailableContext(_mode: string): unknown {
    throw new Error("VOICE_DISABLED");
  }

  /**
   * Handle voice mode toggle
   */
  private async handleSetVoiceMode(
    _enabled: boolean,
    _agentId?: string,
    _requestId?: string,
  ): Promise<void> {
    // VOICE_DISABLED
  }

  private parseVoiceTargetAgentId(_rawId: string, _source: string): string {
    throw new Error("VOICE_DISABLED");
  }

  private async enableVoiceModeForAgent(_agentId: string): Promise<string> {
    throw new Error("VOICE_DISABLED");
  }

  private async disableVoiceModeForActiveAgent(_restoreAgentConfig: boolean): Promise<void> {
    // VOICE_DISABLED
  }

  private handleDictationManagerMessage(_msg: unknown): void {
    // VOICE_DISABLED
  }

  private async startVoiceTurnController(): Promise<void> {
    // VOICE_DISABLED
  }

  private async stopVoiceTurnController(): Promise<void> {
    // VOICE_DISABLED
  }

  private handleVoiceSpeechStopped(): void {
    // VOICE_DISABLED
  }

  /**
   * Handle text message to agent (with optional image attachments)
   */
  private async handleSendAgentMessage(
    agentId: string,
    text: string,
    messageId?: string,
    images?: Array<{ data: string; mimeType: string }>,
    attachments?: AgentAttachment[],
    runOptions?: AgentRunOptions,
    options?: { spokenInput?: boolean },
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    this.sessionLogger.info(
      {
        agentId,
        textPreview: text.substring(0, 50),
        imageCount: images?.length ?? 0,
        attachmentCount: attachments?.length ?? 0,
      },
      `Sending text to agent ${agentId}${
        images && images.length > 0 ? ` with ${images.length} image attachment(s)` : ""
      }${
        attachments && attachments.length > 0
          ? ` and ${attachments.length} structured attachment(s)`
          : ""
      }`,
    );

    const promptText = options?.spokenInput ? wrapSpokenInput(text) : text;
    const prompt = this.buildAgentPrompt(promptText, images, attachments);

    try {
      await sendPromptToAgent({
        agentManager: this.agentManager,
        agentStorage: this.agentStorage,
        agentId,
        prompt,
        messageId,
        runOptions,
        logger: this.sessionLogger,
      });
      return { ok: true };
    } catch (error) {
      this.agentLifecycleHandler.handleAgentRunError(agentId, error, "Failed to send agent message");
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Handle create agent request
   */
  private async resolveCreateAgentWorkspace(
    cwd: string,
    workspaceId?: string,
  ): Promise<{ workspaceId: string }> {
    const resolvedWorkspace = workspaceId
      ? await this.workspaceRegistry.get(workspaceId)
      : ((await this.findWorkspaceByDirectory(cwd)) ??
        (await this.findOrCreateWorkspaceForDirectory(cwd)));
    if (!resolvedWorkspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }
    return { workspaceId: resolvedWorkspace.workspaceId };
  }

  private async buildAgentSessionConfig(
    config: AgentSessionConfig,
    gitOptions?: GitSetupOptions,
    legacyWorktreeName?: string,
    firstAgentContext?: FirstAgentContext,
  ): Promise<{
    sessionConfig: AgentSessionConfig;
    setupContinuation?: CreateChisaCodeWorktreeWorkflowResult["setupContinuation"];
  }> {
    return buildWorktreeAgentSessionConfig(
      {
        chisacodeHome: this.chisacodeHome,
        sessionLogger: this.sessionLogger,
        workspaceGitService: this.workspaceGitService,
        createChisaCodeWorktree: (input, serviceOptions) =>
          this.createChisaCodeWorktreeWorkflow(input, {
            ...serviceOptions,
            setupContinuation: {
              kind: "agent",
              terminalManager: this.terminalManager,
              appendTimelineItem: ({ agentId, item }) =>
                appendTimelineItemIfAgentKnown({
                  agentManager: this.agentManager,
                  agentId,
                  item,
                }),
              emitLiveTimelineItem: ({ agentId, item }) =>
                emitLiveTimelineItemIfAgentKnown({
                  agentManager: this.agentManager,
                  agentId,
                  item,
                }),
              logger: this.sessionLogger,
            },
          }),
        checkoutExistingBranch: (cwd, branch) => this.checkoutGitHandler.checkoutExistingBranch(cwd, branch),
        createBranchFromBase: (params) => this.checkoutGitHandler.createBranchFromBase(params),
        github: this.github,
      },
      config,
      gitOptions,
      legacyWorktreeName,
      firstAgentContext,
    );
  }

  private scheduleAutoNameWorkspaceBranchForFirstAgent(input: {
    workspace: PersistedWorkspaceRecord;
    firstAgentContext: FirstAgentContext;
  }): void {
    setTimeout(() => {
      void this.workspaceProjectHandler.maybeAutoNameWorkspaceBranchForFirstAgent(input).catch((error) => {
        this.sessionLogger.warn(
          { err: error, cwd: input.workspace.cwd },
          "Failed to auto-name worktree branch",
        );
      });
    }, 0);
  }

  private isPathWithinRoot(rootPath: string, candidatePath: string): boolean {
    const resolvedRoot = resolve(rootPath);
    const resolvedCandidate = resolve(candidatePath);
    if (resolvedCandidate === resolvedRoot) {
      return true;
    }
    return resolvedCandidate.startsWith(resolvedRoot + sep);
  }

  private async generateCommitMessage(cwd: string): Promise<string> {
    const diff = await this.workspaceGitService.getCheckoutDiff(cwd, {
      mode: "uncommitted",
      includeStructured: true,
    });
    const schema = z.object({
      message: z
        .string()
        .min(1)
        .max(72)
        .describe("Concise git commit message, imperative mood, no trailing period."),
    });
    const fileList =
      diff.structured && diff.structured.length > 0
        ? [
            "Files changed:",
            ...diff.structured.map((file) => {
              const changeType = diffChangeTypeFor(file);
              const status = file.status && file.status !== "ok" ? ` [${file.status}]` : "";
              return `${changeType}\t${file.path}\t(+${file.additions} -${file.deletions})${status}`;
            }),
          ].join("\n")
        : "Files changed: (unknown)";
    const maxPatchChars = 120_000;
    const patch =
      diff.diff.length > maxPatchChars
        ? `${diff.diff.slice(0, maxPatchChars)}\n\n... (diff truncated to ${maxPatchChars} chars)\n`
        : diff.diff;
    const prompt = await buildMetadataPrompt({
      cwd,
      workspaceGitService: this.workspaceGitService,
      configKey: "commitMessage",
      before: "Write a concise git commit message for the changes below.",
      after: [
        "Return JSON only with a single field 'message'.",
        "",
        fileList,
        "",
        patch.length > 0 ? patch : "(No diff available)",
      ].join("\n"),
    });
    const providers = await resolveStructuredGenerationProviders({
      cwd,
      providerSnapshotManager: this.providerSnapshotManager,
      daemonConfig: this.readStructuredGenerationDaemonConfig(),
      currentSelection: this.getFocusedAgentSelectionForCwd(cwd),
    });
    try {
      const result = await generateStructuredAgentResponseWithFallback({
        manager: this.agentManager,
        cwd,
        prompt,
        schema,
        schemaName: "CommitMessage",
        maxRetries: 2,
        providers,
        persistSession: false,
        agentConfigOverrides: {
          title: "Commit generator",
          internal: true,
        },
      });
      return result.message;
    } catch (error) {
      if (
        error instanceof StructuredAgentResponseError ||
        error instanceof StructuredAgentFallbackError
      ) {
        return "Update files";
      }
      throw error;
    }
  }

  private async generatePullRequestText(
    cwd: string,
    baseRef?: string,
  ): Promise<{
    title: string;
    body: string;
  }> {
    const diff = await this.workspaceGitService.getCheckoutDiff(cwd, {
      mode: "base",
      baseRef,
      includeStructured: true,
    });
    const schema = z.object({
      title: z.string().min(1).max(72),
      body: z.string().min(1),
    });
    const fileList =
      diff.structured && diff.structured.length > 0
        ? [
            "Files changed:",
            ...diff.structured.map((file) => {
              const changeType = diffChangeTypeFor(file);
              const status = file.status && file.status !== "ok" ? ` [${file.status}]` : "";
              return `${changeType}\t${file.path}\t(+${file.additions} -${file.deletions})${status}`;
            }),
          ].join("\n")
        : "Files changed: (unknown)";
    const maxPatchChars = 200_000;
    const patch =
      diff.diff.length > maxPatchChars
        ? `${diff.diff.slice(0, maxPatchChars)}\n\n... (diff truncated to ${maxPatchChars} chars)\n`
        : diff.diff;
    const prompt = await buildMetadataPrompt({
      cwd,
      workspaceGitService: this.workspaceGitService,
      configKey: "pullRequest",
      before: "Write a pull request title and body for the changes below.",
      after: [
        "Return JSON only with fields 'title' and 'body'.",
        "",
        fileList,
        "",
        patch.length > 0 ? patch : "(No diff available)",
      ].join("\n"),
    });
    const providers = await resolveStructuredGenerationProviders({
      cwd,
      providerSnapshotManager: this.providerSnapshotManager,
      daemonConfig: this.readStructuredGenerationDaemonConfig(),
      currentSelection: this.getFocusedAgentSelectionForCwd(cwd),
    });
    try {
      return await generateStructuredAgentResponseWithFallback({
        manager: this.agentManager,
        cwd,
        prompt,
        schema,
        schemaName: "PullRequest",
        maxRetries: 2,
        providers,
        persistSession: false,
        agentConfigOverrides: {
          title: "PR generator",
          internal: true,
        },
      });
    } catch (error) {
      if (
        error instanceof StructuredAgentResponseError ||
        error instanceof StructuredAgentFallbackError
      ) {
        return {
          title: "Update changes",
          body: "Automated PR generated by ChisaCode.",
        };
      }
      throw error;
    }
  }

  private async notifyGitMutation(
    cwd: string,
    reason: GitMutationRefreshReason,
    options?: { invalidateGithub?: boolean },
  ): Promise<void> {
    if (options?.invalidateGithub) {
      this.github.invalidate({ cwd });
    }
    try {
      await this.workspaceGitService.getSnapshot(cwd, { force: true, reason });
    } catch (error) {
      this.sessionLogger.warn(
        { err: error, cwd, reason },
        "Failed to force-refresh workspace git snapshot after mutation",
      );
    }
  }

  /**
   * Handle client heartbeat for activity tracking
   */
  private handleClientHeartbeat(msg: {
    deviceType: "web" | "mobile";
    focusedAgentId: string | null;
    lastActivityAt: string;
    appVisible: boolean;
    appVisibilityChangedAt?: string;
  }): void {
    const appVisibilityChangedAt = msg.appVisibilityChangedAt
      ? new Date(msg.appVisibilityChangedAt)
      : new Date(msg.lastActivityAt);
    this.clientActivity = {
      deviceType: msg.deviceType,
      focusedAgentId: msg.focusedAgentId,
      lastActivityAt: new Date(msg.lastActivityAt),
      appVisible: msg.appVisible,
      appVisibilityChangedAt,
    };
  }

  /**
   * Handle push token registration
   */
  /**
   * Handle agent permission response from user
   */
  private closeWorkspaceGitWatchTarget(target: WorkspaceGitWatchTarget): void {
    if (target.debounceTimer) {
      clearTimeout(target.debounceTimer);
      target.debounceTimer = null;
    }
    for (const watcher of target.watchers) {
      try {
        watcher.close();
      } catch {
        // Ignore watcher close errors
      }
    }
    target.watchers.length = 0;
  }

  private async removeWorkspaceGitWatchTarget(cwd: string): Promise<void> {
    const normalizedCwd = normalizePersistedWorkspaceId(cwd);
    const target = this.workspaceGitWatchTargets.get(normalizedCwd);
    if (target) {
      this.closeWorkspaceGitWatchTarget(target);
      this.workspaceGitWatchTargets.delete(normalizedCwd);
    }
  }

  private removeWorkspaceGitSubscription(cwd: string): void {
    const normalizedCwd = normalizePersistedWorkspaceId(cwd);
    const target = this.workspaceGitWatchTargets.get(normalizedCwd);
    if (target) {
      const unsubscribeFetch = this.workspaceGitFetchSubscriptions.get(normalizedCwd);
      unsubscribeFetch?.();
      this.workspaceGitFetchSubscriptions.delete(normalizedCwd);
      this.closeWorkspaceGitWatchTarget(target);
      this.workspaceGitWatchTargets.delete(normalizedCwd);
    }
    this.workspaceGitSubscriptions.get(normalizedCwd)?.();
    this.workspaceGitSubscriptions.delete(normalizedCwd);
  }

  private workspaceGitDescriptorStateKey(workspace: WorkspaceDescriptorPayload | null): string {
    if (!workspace) {
      return WORKSPACE_GIT_WATCH_REMOVED_STATE_KEY;
    }
    return JSON.stringify([
      workspace.name,
      workspace.diffStat ? [workspace.diffStat.additions, workspace.diffStat.deletions] : null,
    ]);
  }

  private shouldSkipWorkspaceGitWatchUpdate(
    workspaceId: string,
    workspace: WorkspaceDescriptorPayload | null,
  ): boolean {
    const target = this.workspaceGitWatchTargets.get(workspaceId);
    if (!target) {
      return false;
    }
    const nextStateKey = this.workspaceGitDescriptorStateKey(workspace);
    if (target.latestDescriptorStateKey === nextStateKey) {
      return true;
    }
    target.latestDescriptorStateKey = nextStateKey;
    return false;
  }

  private rememberWorkspaceGitDescriptorState(
    workspaceId: string,
    workspace: WorkspaceDescriptorPayload | null,
  ): void {
    const target = this.workspaceGitWatchTargets.get(workspaceId);
    if (!target) {
      return;
    }
    target.latestDescriptorStateKey = this.workspaceGitDescriptorStateKey(workspace);
    target.lastBranchName = workspace?.name ?? null;
  }

  private handleWorkspaceGitBranchSnapshot(cwd: string, branchName: string | null): void {
    const target = this.workspaceGitWatchTargets.get(normalizePersistedWorkspaceId(cwd));
    if (!target) {
      return;
    }

    const previousBranchName = target.lastBranchName;
    if (branchName === previousBranchName) {
      return;
    }

    target.lastBranchName = branchName;
    this.onBranchChanged?.(target.workspaceId, previousBranchName, branchName);
  }

  private syncWorkspaceGitObservers(workspaces: Iterable<WorkspaceDescriptorPayload>): void {
    for (const workspace of workspaces) {
      this.syncWorkspaceGitObserver(workspace.workspaceDirectory, {
        isGit: workspace.projectKind === "git",
        workspaceId: workspace.id,
      });
      this.rememberWorkspaceGitDescriptorState(workspace.workspaceDirectory, workspace);
    }
  }

  private syncWorkspaceGitObserver(
    cwd: string,
    options: { isGit: boolean; workspaceId: string },
  ): void {
    const normalizedCwd = normalizePersistedWorkspaceId(cwd);
    if (!options.isGit) {
      this.removeWorkspaceGitSubscription(normalizedCwd);
      return;
    }

    if (this.workspaceGitSubscriptions.has(normalizedCwd)) {
      return;
    }

    const target: WorkspaceGitWatchTarget = {
      cwd: normalizedCwd,
      workspaceId: options.workspaceId,
      watchers: [],
      debounceTimer: null,
      refreshPromise: null,
      refreshQueued: false,
      latestDescriptorStateKey: null,
      lastBranchName: null,
    };
    this.workspaceGitWatchTargets.set(normalizedCwd, target);

    const subscription = this.workspaceGitService.registerWorkspace(
      { cwd: normalizedCwd },
      (snapshot) => {
        this.handleWorkspaceGitBranchSnapshot(normalizedCwd, snapshot.git.currentBranch ?? null);
        void this.emitWorkspaceUpdateForCwd(normalizedCwd);
        this.emitCheckoutStatusUpdate(normalizedCwd, snapshot);
      },
    );
    this.workspaceGitSubscriptions.set(normalizedCwd, subscription.unsubscribe);
  }

  private emitCheckoutStatusUpdate(cwd: string, snapshot: WorkspaceGitRuntimeSnapshot): void {
    try {
      const requestId = `subscription:${cwd}`;
      this.emit({
        type: "checkout_status_update",
        payload: {
          ...buildCheckoutStatusPayloadFromSnapshot({
            cwd,
            requestId,
            snapshot,
          }),
          prStatus: buildCheckoutPrStatusPayloadFromSnapshot({
            cwd,
            requestId,
            snapshot,
          }),
        },
      });
    } catch (error) {
      this.sessionLogger.warn(
        { err: error, cwd },
        "Failed to emit workspace checkout status update",
      );
    }
  }

  /**
   * Build the current agent list payload (live + persisted), optionally filtered by labels.
   */
  private async listAgentPayloads(filter?: {
    labels?: Record<string, string>;
    includeUnavailablePersisted?: boolean;
  }): Promise<AgentSnapshotPayload[]> {
    // Get live agents with session modes
    const agentSnapshots = this.agentManager.listAgents();
    const liveAgents = await Promise.all(
      agentSnapshots.map((agent) => this.buildAgentPayload(agent)),
    );

    // Add persisted agents that have not been lazily initialized yet
    // (excluding internal agents which are for ephemeral system tasks)
    const registryRecords = await this.agentStorage.list();
    const liveIds = new Set(agentSnapshots.map((a) => a.id));
    const registeredProviderIds = this.providerSnapshotManager.listRegisteredProviderIds();
    const persistedAgents = registryRecords
      .filter((record) => !liveIds.has(record.id) && !record.internal)
      .filter(
        (record) =>
          filter?.includeUnavailablePersisted === true ||
          isStoredAgentProviderAvailable(record, registeredProviderIds),
      )
      .map((record) => this.buildStoredAgentPayload(record, registeredProviderIds));

    let agents = [...liveAgents, ...persistedAgents];

    agents = agents.filter((agent) => this.isProviderVisibleToClient(agent.provider));

    // Filter by labels if filter provided
    if (filter?.labels) {
      const filterLabels = filter.labels;
      agents = agents.filter((agent) =>
        Object.entries(filterLabels).every(([key, value]) => agent.labels[key] === value),
      );
    }

    return agents;
  }

  private async resolveAgentIdentifier(
    identifier: string,
  ): Promise<{ ok: true; agentId: string } | { ok: false; error: string }> {
    const trimmed = identifier.trim();
    if (!trimmed) {
      return { ok: false, error: "Agent identifier cannot be empty" };
    }

    const stored = await this.agentStorage.list();
    const storedRecords = stored.filter((record) => !record.internal);
    const knownIds = new Set<string>();
    for (const record of storedRecords) {
      knownIds.add(record.id);
    }
    for (const agent of this.agentManager.listAgents()) {
      knownIds.add(agent.id);
    }

    if (knownIds.has(trimmed)) {
      return { ok: true, agentId: trimmed };
    }

    const prefixMatches = Array.from(knownIds).filter((id) => id.startsWith(trimmed));
    if (prefixMatches.length === 1) {
      return { ok: true, agentId: prefixMatches[0] };
    }
    if (prefixMatches.length > 1) {
      return {
        ok: false,
        error: `Agent identifier "${trimmed}" is ambiguous (${prefixMatches
          .slice(0, 5)
          .map((id) => id.slice(0, 8))
          .join(", ")}${prefixMatches.length > 5 ? ", …" : ""})`,
      };
    }

    const titleMatches = storedRecords.filter((record) => record.title === trimmed);
    if (titleMatches.length === 1) {
      return { ok: true, agentId: titleMatches[0].id };
    }
    if (titleMatches.length > 1) {
      return {
        ok: false,
        error: `Agent title "${trimmed}" is ambiguous (${titleMatches
          .slice(0, 5)
          .map((r) => r.id.slice(0, 8))
          .join(", ")}${titleMatches.length > 5 ? ", …" : ""})`,
      };
    }

    return { ok: false, error: `Agent not found: ${trimmed}` };
  }

  private readonly agentsPager = new SortablePager<
    AgentSnapshotPayload,
    FetchAgentsRequestSort["key"]
  >({
    validKeys: FETCH_AGENTS_SORT_KEYS,
    defaultSort: [{ key: "updated_at", direction: "desc" }],
    label: "fetch_agents",
    getId: (agent) => agent.id,
    getSortValue: (agent, key): number | string => {
      switch (key) {
        case "status_priority":
          return getAgentStatusPriority({
            status: agent.status,
            pendingPermissionCount: agent.pendingPermissions?.length ?? 0,
            requiresAttention: agent.requiresAttention,
            attentionReason: agent.attentionReason ?? null,
          });
        case "created_at":
          return Date.parse(agent.createdAt);
        case "updated_at":
          return Date.parse(agent.updatedAt);
        case "title":
          return agent.title?.toLocaleLowerCase() ?? "";
      }
    },
  });


  private async describeWorkspaceRecord(
    workspace: PersistedWorkspaceRecord,
    projectRecord?: PersistedProjectRecord | null,
  ): Promise<WorkspaceDescriptorPayload> {
    const resolvedProjectRecord =
      projectRecord ?? (await this.projectRegistry.get(workspace.projectId));

    let diffStat: { additions: number; deletions: number } | null = null;
    const snapshot = this.workspaceGitService.peekSnapshot(workspace.cwd);
    if (snapshot?.git.diffStat) {
      diffStat = snapshot.git.diffStat;
    }

    return {
      id: workspace.workspaceId,
      projectId: workspace.projectId,
      projectDisplayName: resolvedProjectRecord
        ? resolveProjectDisplayName(resolvedProjectRecord)
        : workspace.projectId,
      projectCustomName: resolvedProjectRecord?.customName ?? null,
      projectRootPath: resolvedProjectRecord?.rootPath ?? workspace.cwd,
      workspaceDirectory: workspace.cwd,
      projectKind: (resolvedProjectRecord?.kind ?? "directory") === "git" ? "git" : "non_git",
      workspaceKind: workspace.kind,
      name: workspace.displayName,
      archivingAt: null,
      status: "done",
      activityAt: null,
      diffStat,
      scripts:
        this.scriptRouteStore && this.scriptRuntimeStore
          ? buildWorkspaceScriptPayloads({
              workspaceId: workspace.workspaceId,
              workspaceDirectory: workspace.cwd,
              chisacodeConfig: readChisaCodeConfigForProjection(workspace.cwd, this.sessionLogger),
              routeStore: this.scriptRouteStore,
              runtimeStore: this.scriptRuntimeStore,
              daemonPort: this.getDaemonTcpPort?.() ?? null,
              gitMetadata: this.resolveWorkspaceScriptGitMetadata(workspace.cwd),
              resolveHealth: this.resolveScriptHealth ?? undefined,
            })
          : [],
      ...(resolvedProjectRecord
        ? {
            project: await this.buildProjectPlacementForWorkspace(workspace, resolvedProjectRecord),
          }
        : {}),
    };
  }

  private buildWorkspaceGitRuntimePayload(
    snapshot: WorkspaceGitRuntimeSnapshot,
  ): NonNullable<WorkspaceDescriptorPayload["gitRuntime"]> | null {
    if (!snapshot.git.isGit) {
      return null;
    }

    return {
      currentBranch: snapshot.git.currentBranch,
      remoteUrl: snapshot.git.remoteUrl,
      isChisaCodeOwnedWorktree: snapshot.git.isChisaCodeOwnedWorktree,
      isDirty: snapshot.git.isDirty,
      aheadBehind: snapshot.git.aheadBehind,
      aheadOfOrigin: snapshot.git.aheadOfOrigin,
      behindOfOrigin: snapshot.git.behindOfOrigin,
    };
  }

  private buildWorkspaceGitHubRuntimePayload(
    snapshot: WorkspaceGitRuntimeSnapshot,
  ): NonNullable<WorkspaceDescriptorPayload["githubRuntime"]> {
    return {
      featuresEnabled: snapshot.github.featuresEnabled,
      pullRequest: snapshot.github.pullRequest,
      error: snapshot.github.error,
    };
  }

  private async describeWorkspaceRecordWithGitData(
    workspace: PersistedWorkspaceRecord,
    projectRecord?: PersistedProjectRecord | null,
  ): Promise<WorkspaceDescriptorPayload> {
    const base = await this.describeWorkspaceRecord(workspace, projectRecord);
    const snapshot = this.workspaceGitService.peekSnapshot(workspace.cwd);
    if (!snapshot) {
      return base;
    }

    const checkout = checkoutLiteFromGitSnapshot(workspace.cwd, snapshot.git);
    const displayName = deriveWorkspaceDisplayName({ cwd: workspace.cwd, checkout });

    return {
      ...base,
      name: displayName,
      diffStat: snapshot.git.diffStat ?? null,
      gitRuntime: this.buildWorkspaceGitRuntimePayload(snapshot) ?? undefined,
      githubRuntime: this.buildWorkspaceGitHubRuntimePayload(snapshot),
    };
  }

  private async describeCreatedWorktreeWorkspace(
    result: CreateChisaCodeWorktreeResult,
  ): Promise<WorkspaceDescriptorPayload> {
    const projectRecord = await this.projectRegistry.get(result.workspace.projectId);
    return {
      id: result.workspace.workspaceId,
      projectId: result.workspace.projectId,
      projectDisplayName: projectRecord
        ? resolveProjectDisplayName(projectRecord)
        : result.workspace.projectId,
      projectCustomName: projectRecord?.customName ?? null,
      projectRootPath: projectRecord?.rootPath ?? result.repoRoot,
      workspaceDirectory: result.workspace.cwd,
      projectKind: "git",
      workspaceKind: result.workspace.kind,
      name: result.worktree.branchName || result.workspace.displayName,
      archivingAt: null,
      status: "done",
      activityAt: null,
      diffStat: { additions: 0, deletions: 0 },
      scripts: [],
      gitRuntime: {
        currentBranch: result.worktree.branchName || null,
        remoteUrl: null,
        isChisaCodeOwnedWorktree: true,
        isDirty: false,
        aheadBehind: null,
        aheadOfOrigin: null,
        behindOfOrigin: null,
      },
      githubRuntime: null,
    };
  }

  private async buildWorkspaceDescriptor(input: {
    workspace: PersistedWorkspaceRecord;
    projectRecord?: PersistedProjectRecord | null;
    includeGitData: boolean;
  }): Promise<WorkspaceDescriptorPayload> {
    if (input.includeGitData && input.projectRecord?.kind === "git") {
      return this.describeWorkspaceRecordWithGitData(input.workspace, input.projectRecord);
    }
    return this.describeWorkspaceRecord(input.workspace, input.projectRecord);
  }

  markWorkspaceArchiving(workspaceIds: Iterable<string>, archivingAt: string): void {
    this.workspaceDirectory.markArchiving(workspaceIds, archivingAt);
  }

  clearWorkspaceArchiving(workspaceIds: Iterable<string>): void {
    this.workspaceDirectory.clearArchiving(workspaceIds);
  }

  private async buildWorkspaceDescriptorMap(options: {
    includeGitData: boolean;
    workspaceIds?: Iterable<string>;
  }): Promise<Map<string, WorkspaceDescriptorPayload>> {
    return this.workspaceDirectory.buildDescriptorMap(options);
  }

  private resolveRegisteredWorkspaceIdForCwd(
    cwd: string,
    workspaces: PersistedWorkspaceRecord[],
  ): string {
    return this.workspaceDirectory.resolveRegisteredWorkspaceIdForCwd(cwd, workspaces);
  }

  private matchesWorkspaceFilter(input: {
    workspace: WorkspaceDescriptorPayload;
    filter: FetchWorkspacesRequestFilter | undefined;
  }): boolean {
    return this.workspaceDirectory.matchesFilter(input);
  }

  private async listFetchWorkspacesEntries(
    request: Extract<SessionInboundMessage, { type: "fetch_workspaces_request" }>,
  ): Promise<{
    entries: FetchWorkspacesResponseEntry[];
    pageInfo: FetchWorkspacesResponsePageInfo;
  }> {
    try {
      return await this.workspaceDirectory.listFetchEntries(request);
    } catch (error) {
      if (error instanceof CursorError) {
        throw new SessionRequestError("invalid_cursor", error.message);
      }
      throw error;
    }
  }

  private bufferOrEmitWorkspaceUpdate(
    subscription: WorkspaceUpdatesSubscriptionState,
    payload: WorkspaceUpdatePayload,
  ): void {
    if (subscription.isBootstrapping) {
      const workspaceId = payload.kind === "upsert" ? payload.workspace.id : payload.id;
      subscription.pendingUpdatesByWorkspaceId.set(workspaceId, payload);
      return;
    }
    const workspaceId = payload.kind === "upsert" ? payload.workspace.id : payload.id;
    subscription.lastEmittedByWorkspaceId.set(workspaceId, payload);
    this.emit({
      type: "workspace_update",
      payload,
    });
  }

  private flushBootstrappedWorkspaceUpdates(options?: {
    snapshotLatestActivityByWorkspaceId?: Map<string, number>;
  }): void {
    const subscription = this.workspaceUpdatesSubscription;
    if (!subscription || !subscription.isBootstrapping) {
      return;
    }

    subscription.isBootstrapping = false;
    const pending = Array.from(subscription.pendingUpdatesByWorkspaceId.values());
    subscription.pendingUpdatesByWorkspaceId.clear();

    for (const payload of pending) {
      if (payload.kind === "upsert") {
        const snapshotLatestActivity = options?.snapshotLatestActivityByWorkspaceId?.get(
          payload.workspace.id,
        );
        if (typeof snapshotLatestActivity === "number") {
          const updateLatestActivity = payload.workspace.activityAt
            ? Date.parse(payload.workspace.activityAt)
            : Number.NEGATIVE_INFINITY;
          if (
            !Number.isNaN(updateLatestActivity) &&
            updateLatestActivity <= snapshotLatestActivity
          ) {
            continue;
          }
        }
      }
      this.emit({
        type: "workspace_update",
        payload,
      });
    }
  }

  private async findOrCreateWorkspaceForDirectory(cwd: string): Promise<PersistedWorkspaceRecord> {
    const inputCwd = normalizePersistedWorkspaceId(cwd);
    const normalizedCwd = await this.resolveWorkspaceDirectory(cwd);
    const existingWorkspace = await this.findExactWorkspaceByDirectory(normalizedCwd, {
      refreshGit: false,
    });
    if (existingWorkspace) {
      if (existingWorkspace.archivedAt && inputCwd !== normalizedCwd) {
        const timestamp = new Date().toISOString();
        const displayName = basename(inputCwd) || inputCwd;
        const projectRecord = createPersistedProjectRecord({
          projectId: inputCwd,
          rootPath: inputCwd,
          kind: "non_git",
          displayName,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
        await this.projectRegistry.upsert(projectRecord);
        const workspaceRecord = createPersistedWorkspaceRecord({
          workspaceId: inputCwd,
          projectId: projectRecord.projectId,
          cwd: inputCwd,
          kind: "directory",
          displayName,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
        await this.workspaceRegistry.upsert(workspaceRecord);
        return workspaceRecord;
      }
      return this.reclassifyOrUnarchiveWorkspaceForDirectory({
        workspace: existingWorkspace,
        project: await this.projectRegistry.get(existingWorkspace.projectId),
        cwd: normalizedCwd,
      });
    }

    return this.createWorkspaceForDirectory(normalizedCwd);
  }

  private async createWorkspaceForDirectory(cwd: string): Promise<PersistedWorkspaceRecord> {
    const checkout = await this.workspaceGitService.getCheckout(cwd);
    const membership = classifyDirectoryForProjectMembership({ cwd, checkout });
    const timestamp = new Date().toISOString();

    const projectRecord = await this.resolveProjectRecordForPlacement({
      membership,
      timestamp,
    });
    await this.projectRegistry.upsert(projectRecord);

    const workspaceRecord = createPersistedWorkspaceRecord({
      workspaceId: membership.workspaceId,
      projectId: projectRecord.projectId,
      cwd,
      kind: membership.workspaceKind,
      displayName: membership.workspaceDisplayName,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await this.workspaceRegistry.upsert(workspaceRecord);
    return workspaceRecord;
  }

  private async reclassifyOrUnarchiveWorkspaceForDirectory(input: {
    workspace: PersistedWorkspaceRecord;
    project: PersistedProjectRecord | null;
    cwd: string;
  }): Promise<PersistedWorkspaceRecord> {
    const checkout = await this.workspaceGitService.getCheckout(input.cwd);
    const membership = classifyDirectoryForProjectMembership({ cwd: input.cwd, checkout });
    const timestamp = new Date().toISOString();
    const projectRecord = await this.resolveProjectRecordForPlacement({
      membership,
      timestamp,
    });
    const projectId = projectRecord.projectId;
    const kind = membership.workspaceKind;
    const displayName = membership.workspaceDisplayName;

    if (
      input.workspace.workspaceId === membership.workspaceId &&
      input.workspace.projectId === projectId &&
      input.workspace.kind === kind &&
      input.workspace.displayName === displayName
    ) {
      return this.ensureWorkspaceRecordUnarchived(input.workspace);
    }

    await this.projectRegistry.upsert(projectRecord);

    const nextWorkspace = {
      ...input.workspace,
      workspaceId: membership.workspaceId,
      projectId,
      cwd: input.cwd,
      kind,
      displayName,
      archivedAt: null,
      updatedAt: timestamp,
    };
    await this.workspaceRegistry.upsert(nextWorkspace);
    return nextWorkspace;
  }

  private async resolveProjectRecordForPlacement(input: {
    membership: ReturnType<typeof classifyDirectoryForProjectMembership>;
    timestamp: string;
  }): Promise<PersistedProjectRecord> {
    const rootPath = input.membership.projectRootPath;
    const kind = input.membership.projectKind;
    const projects = await this.projectRegistry.list();
    const existingProject =
      projects.find((project) => !project.archivedAt && project.rootPath === rootPath) ??
      projects.find((project) => project.rootPath === rootPath) ??
      null;

    if (!existingProject) {
      return createPersistedProjectRecord({
        projectId: input.membership.projectKey,
        rootPath,
        kind,
        displayName: input.membership.projectName,
        createdAt: input.timestamp,
        updatedAt: input.timestamp,
      });
    }

    return {
      ...existingProject,
      rootPath,
      kind,
      archivedAt: null,
      updatedAt: input.timestamp,
    };
  }

  private async ensureWorkspaceRecordUnarchived(
    workspace: PersistedWorkspaceRecord,
  ): Promise<PersistedWorkspaceRecord> {
    const project = await this.projectRegistry.get(workspace.projectId);
    if (!workspace.archivedAt && (!project || !project.archivedAt)) {
      return workspace;
    }

    const timestamp = new Date().toISOString();
    let unarchivedWorkspace = workspace;
    if (workspace.archivedAt) {
      unarchivedWorkspace = { ...workspace, archivedAt: null, updatedAt: timestamp };
      await this.workspaceRegistry.upsert(unarchivedWorkspace);
    }
    if (project?.archivedAt) {
      await this.projectRegistry.upsert({
        ...project,
        archivedAt: null,
        updatedAt: timestamp,
      });
    }
    return unarchivedWorkspace;
  }

  private async createChisaCodeWorktree(
    input: CreateChisaCodeWorktreeInput,
    options?: {
      resolveDefaultBranch?: (repoRoot: string) => Promise<string>;
    },
  ): Promise<CreateChisaCodeWorktreeResult> {
    const result = await createChisaCodeWorktree(input, {
      github: this.github,
      ...(options?.resolveDefaultBranch
        ? { resolveDefaultBranch: options.resolveDefaultBranch }
        : {}),
      projectRegistry: this.projectRegistry,
      workspaceRegistry: this.workspaceRegistry,
      workspaceGitService: this.workspaceGitService,
    });
    void Promise.all([
      this.notifyGitMutation(input.cwd, "create-worktree"),
      this.notifyGitMutation(result.worktree.worktreePath, "create-worktree"),
    ]).catch((error) => {
      this.sessionLogger.warn(
        { err: error, cwd: input.cwd, worktreePath: result.worktree.worktreePath },
        "Failed to warm git snapshots after creating worktree",
      );
    });
    return result;
  }

  private async archiveWorkspaceRecord(workspaceId: string, archivedAt?: string): Promise<void> {
    const existingWorkspace = await archivePersistedWorkspaceRecord({
      workspaceId,
      archivedAt,
      workspaceRegistry: this.workspaceRegistry,
      projectRegistry: this.projectRegistry,
    });
    if (!existingWorkspace) {
      this.removeWorkspaceGitSubscription(workspaceId);
      return;
    }

    await this.removeWorkspaceGitWatchTarget(existingWorkspace.cwd);
    this.scriptRuntimeStore?.removeForWorkspace(existingWorkspace.cwd);
    this.removeWorkspaceGitSubscription(workspaceId);
  }

  private async reconcileAndEmitWorkspaceUpdates(): Promise<void> {
    if (!this.workspaceUpdatesSubscription) {
      return;
    }
    try {
      const changedWorkspaceIds = await this.reconcileActiveWorkspaceRecords();
      if (changedWorkspaceIds.size === 0) {
        return;
      }
      await this.emitWorkspaceUpdatesForWorkspaceIds(changedWorkspaceIds, {
        skipReconcile: true,
      });
    } catch (error) {
      this.sessionLogger.error({ err: error }, "Background workspace reconciliation failed");
    }
  }

  private async reconcileActiveWorkspaceRecords(): Promise<Set<string>> {
    const service = new WorkspaceReconciliationService({
      projectRegistry: this.projectRegistry,
      workspaceRegistry: this.workspaceRegistry,
      logger: this.sessionLogger,
      workspaceGitService: this.workspaceGitService,
    });
    const result = await service.runOnce();
    const changedWorkspaceIds = new Set<string>();
    const changedProjectIds = new Set<string>();

    await Promise.all(
      result.changesApplied.map(async (change) => {
        switch (change.kind) {
          case "workspace_archived":
            await this.removeWorkspaceGitWatchTarget(change.directory);
            this.scriptRuntimeStore?.removeForWorkspace(change.directory);
            this.removeWorkspaceGitSubscription(change.workspaceId);
            changedWorkspaceIds.add(change.workspaceId);
            break;
          case "workspace_updated":
            changedWorkspaceIds.add(change.workspaceId);
            break;
          case "project_archived":
          case "project_updated":
            changedProjectIds.add(change.projectId);
            break;
        }
      }),
    );

    if (changedProjectIds.size > 0) {
      for (const workspace of await this.workspaceRegistry.list()) {
        if (changedProjectIds.has(workspace.projectId)) {
          changedWorkspaceIds.add(workspace.workspaceId);
        }
      }
    }

    return changedWorkspaceIds;
  }

  private async emitWorkspaceUpdatesForWorkspaceIds(
    workspaceIds: Iterable<string>,
    options?: { skipReconcile?: boolean; dedupeGitState?: boolean },
  ): Promise<void> {
    const subscription = this.workspaceUpdatesSubscription;
    if (!subscription) {
      return;
    }

    const uniqueWorkspaceIds = new Set(Array.from(workspaceIds));
    if (uniqueWorkspaceIds.size === 0) {
      return;
    }

    const descriptorsByWorkspaceId = await this.buildWorkspaceDescriptorMap({
      workspaceIds: uniqueWorkspaceIds,
      includeGitData: true,
    });

    for (const workspaceId of uniqueWorkspaceIds) {
      const workspace = descriptorsByWorkspaceId.get(workspaceId);
      const nextWorkspace =
        workspace && this.matchesWorkspaceFilter({ workspace, filter: subscription.filter })
          ? workspace
          : null;
      if (
        options?.dedupeGitState &&
        this.shouldSkipWorkspaceGitWatchUpdate(workspaceId, nextWorkspace)
      ) {
        continue;
      }
      const watchTarget = this.workspaceGitWatchTargets.get(workspaceId);
      if (watchTarget && this.onBranchChanged) {
        const newBranchName = nextWorkspace?.name ?? null;
        if (newBranchName !== watchTarget.lastBranchName) {
          this.onBranchChanged(workspaceId, watchTarget.lastBranchName, newBranchName);
        }
      }
      this.rememberWorkspaceGitDescriptorState(workspaceId, nextWorkspace);

      if (!nextWorkspace) {
        subscription.lastEmittedByWorkspaceId.delete(workspaceId);
        this.bufferOrEmitWorkspaceUpdate(subscription, {
          kind: "remove",
          id: workspaceId,
        });
        continue;
      }

      const nextPayload: WorkspaceUpdatePayload = {
        kind: "upsert",
        workspace: nextWorkspace,
      };

      const lastEmitted = subscription.lastEmittedByWorkspaceId.get(workspaceId);
      if (
        lastEmitted &&
        lastEmitted.kind === "upsert" &&
        equal(lastEmitted.workspace, nextWorkspace)
      ) {
        continue;
      }

      this.bufferOrEmitWorkspaceUpdate(subscription, nextPayload);
    }

    if (!options?.skipReconcile) {
      void this.reconcileAndEmitWorkspaceUpdates();
    }
  }

  private async emitWorkspaceUpdateForCwd(
    cwd: string,
    options?: {
      skipReconcile?: boolean;
      dedupeGitState?: boolean;
    },
  ): Promise<void> {
    const workspaces = await this.workspaceRegistry.list();
    const workspaceId = this.resolveRegisteredWorkspaceIdForCwd(cwd, workspaces);
    await this.emitWorkspaceUpdatesForWorkspaceIds([workspaceId], options);
  }

  private buildWorkspaceScriptPayloadSnapshot(
    workspaceId: string,
    workspaceDirectory: string,
  ): WorkspaceDescriptorPayload["scripts"] {
    if (!this.scriptRouteStore || !this.scriptRuntimeStore) {
      return [];
    }
    return buildWorkspaceScriptPayloads({
      workspaceId,
      workspaceDirectory,
      chisacodeConfig: readChisaCodeConfigForProjection(workspaceDirectory, this.sessionLogger),
      routeStore: this.scriptRouteStore,
      runtimeStore: this.scriptRuntimeStore,
      daemonPort: this.getDaemonTcpPort?.() ?? null,
      gitMetadata: this.resolveWorkspaceScriptGitMetadata(workspaceDirectory),
      resolveHealth: this.resolveScriptHealth ?? undefined,
    });
  }

  private resolveWorkspaceScriptGitMetadata(
    workspaceDirectory: string,
  ): { projectSlug: string; currentBranch: string | null } | undefined {
    const snapshot = this.workspaceGitService.peekSnapshot(workspaceDirectory);
    if (!snapshot) {
      return undefined;
    }
    return {
      projectSlug: deriveProjectSlug(
        workspaceDirectory,
        snapshot.git.isGit ? snapshot.git.remoteUrl : null,
      ),
      currentBranch: snapshot.git.currentBranch,
    };
  }

  private emitWorkspaceScriptStatusUpdate(workspaceId: string, workspaceDirectory: string): void {
    this.emit({
      type: "script_status_update",
      payload: {
        workspaceId,
        scripts: this.buildWorkspaceScriptPayloadSnapshot(workspaceId, workspaceDirectory),
      },
    });
  }

  async resolveAvailableEditorTargets(): Promise<EditorTargetDescriptorPayload[]> {
    return listAvailableEditorTargets();
  }

  async getAvailableEditorTargets() {
    return this.filterEditorsForClient(await this.getMemoizedAvailableEditorTargets());
  }

  async openEditorTarget(options: { editorId: EditorTargetId; path: string }): Promise<void> {
    await openInEditorTarget(options);
  }

  private async createChisaCodeWorktreeWorkflow(
    input: CreateChisaCodeWorktreeInput,
    options?: {
      resolveDefaultBranch?: (repoRoot: string) => Promise<string>;
      setupContinuation?: CreateChisaCodeWorktreeSetupContinuationInput;
    },
  ): Promise<CreateChisaCodeWorktreeWorkflowResult> {
    return createWorktreeWorkflow(
      {
        chisacodeHome: this.chisacodeHome,
        createChisaCodeWorktree: (workflowInput, serviceOptions) =>
          this.createChisaCodeWorktree(workflowInput, serviceOptions),
        warmWorkspaceGitData: (workspace) => this.warmWorkspaceGitDataForWorkspace(workspace),
        autoNameWorkspaceBranchForFirstAgent: (autoNameInput) =>
          this.scheduleAutoNameWorkspaceBranchForFirstAgent(autoNameInput),
        emitWorkspaceUpdateForCwd: (cwd, emitOptions) =>
          this.emitWorkspaceUpdateForCwd(cwd, emitOptions),
        cacheWorkspaceSetupSnapshot: (workspaceId, snapshot) => {
          this.workspaceSetupSnapshots.set(workspaceId, snapshot);
        },
        emit: (message) => this.emit(message),
        sessionLogger: this.sessionLogger,
        terminalManager: this.terminalManager,
        archiveWorkspaceRecord: (workspaceId) => this.archiveWorkspaceRecord(workspaceId),
        scriptRouteStore: this.scriptRouteStore,
        scriptRuntimeStore: this.scriptRuntimeStore,
        getDaemonTcpPort: this.getDaemonTcpPort,
        getDaemonTcpHost: this.getDaemonTcpHost,
        onScriptsChanged: (workspaceId, workspaceDirectory) => {
          this.emitWorkspaceScriptStatusUpdate(workspaceId, workspaceDirectory);
        },
      },
      input,
      options,
    );
  }

  /**
   * Handle audio chunk for buffering and transcription
   */
  private async ensureAudioBufferForFormat(
    _chunkFormat: string,
    _isPCMChunk: boolean,
  ): Promise<unknown> {
    throw new Error("VOICE_DISABLED");
  }

  private async forwardAudioChunkToVoiceTurn(
    _msg: Extract<SessionInboundMessage, { type: "voice_audio_chunk" }>,
    _chunkFormat: string,
  ): Promise<void> {
    // VOICE_DISABLED
  }

  private async handleAudioChunk(
    _msg: Extract<SessionInboundMessage, { type: "voice_audio_chunk" }>,
  ): Promise<void> {
    // VOICE_DISABLED
  }

  private finalizeBufferedAudio(): { audio: Buffer; format: string } | null {
    return null;
  }

  private async processCompletedAudio(_audio: Buffer, _format: string): Promise<void> {
    // VOICE_DISABLED
  }

  private async flushPendingAudioSegments(_reason: string): Promise<void> {
    // VOICE_DISABLED
  }

  /**
   * Process audio through STT and then LLM
   */
  private async processAudio(_audio: Buffer, _format: string): Promise<void> {
    // VOICE_DISABLED
  }

  private async handleTranscriptionResultPayload(_result: unknown): Promise<void> {
    // VOICE_DISABLED
  }

  private registerVoiceBridgeForAgent(_agentId: string): void {
    // VOICE_DISABLED
  }

  /**
   * Handle abort request from client
   */
  private async handleAbort(): Promise<void> {
    this.sessionLogger.info(
      { phase: this.processingPhase },
      `Abort request, phase: ${this.processingPhase}`,
    );

    this.abortController.abort();
    this.ttsManager.cancelPendingPlaybacks("abort request");

    // Voice abort should always interrupt active agent output immediately.
    if (this.isVoiceMode && this.voiceModeAgentId) {
      try {
        await this.interruptAgentIfRunning(this.voiceModeAgentId);
      } catch (error) {
        this.sessionLogger.warn(
          { err: error, agentId: this.voiceModeAgentId },
          "Failed to interrupt active voice-mode agent on abort",
        );
      }
    }

    if (this.processingPhase === "transcribing") {
      // Still in STT phase - we'll buffer the next audio
      this.sessionLogger.debug("Will buffer next audio (currently transcribing)");
      // Phase stays as 'transcribing', handleAudioChunk will handle buffering
      return;
    }

    // Reset phase to idle and clear pending non-voice buffers.
    this.setPhase("idle");
    this.pendingAudioSegments = [];
    this.clearBufferTimeout();
  }

  /**
   * Handle audio playback confirmation from client
   */
  private handleAudioPlayed(_id: string): void {
    // VOICE_DISABLED
  }

  /**
   * Mark speech detection start and abort any active playback/agent run.
   */
  private async handleVoiceSpeechStart(): Promise<void> {
    // VOICE_DISABLED
  }

  /**
   * Clear speech-in-progress flag once the user turn has completed
   */
  private clearSpeechInProgress(_reason: string): void {
    // VOICE_DISABLED
  }

  /**
   * Create new AbortController, aborting the previous one
   */
  private createAbortController(): void {
    this.abortController = new AbortController();
  }

  /**
   * Set the processing phase
   */
  private setPhase(phase: ProcessingPhase): void {
    this.processingPhase = phase;
    this.sessionLogger.debug({ phase }, `Phase: ${phase}`);
  }

  /**
   * Set timeout to process buffered audio segments
   */
  private setBufferTimeout(_durationMs: number): void {
    // VOICE_DISABLED
  }

  /**
   * Clear buffer timeout
   */
  private clearBufferTimeout(): void {
    // VOICE_DISABLED
  }

  /**
   * Emit a message to the client
   */
  private emit(msg: SessionOutboundMessage): void {
    this.sessionLogger.trace(
      {
        messageType: msg.type,
        payloadBytes: JSON.stringify(msg).length,
      },
      "agent.session.outbound",
    );
    if (
      msg.type === "audio_output" &&
      (process.env.TTS_DEBUG_AUDIO_DIR || isChisaCodeDictationDebugEnabled()) &&
      msg.payload.groupId &&
      typeof msg.payload.audio === "string"
    ) {
      const groupId = msg.payload.groupId;
      const existing =
        this.ttsDebugStreams.get(groupId) ??
        ({ format: msg.payload.format, chunks: [] } satisfies {
          format: string;
          chunks: Buffer[];
        });

      try {
        existing.chunks.push(Buffer.from(msg.payload.audio, "base64"));
        existing.format = msg.payload.format;
        this.ttsDebugStreams.set(groupId, existing);
      } catch {
        // ignore malformed base64
      }

      if (msg.payload.isLastChunk) {
        const final = this.ttsDebugStreams.get(groupId);
        this.ttsDebugStreams.delete(groupId);
        if (final && final.chunks.length > 0) {
          void (async () => {
            const recordingPath = await maybePersistTtsDebugAudio(
              Buffer.concat(final.chunks),
              { sessionId: this.sessionId, groupId, format: final.format },
              this.sessionLogger,
            );
            if (recordingPath) {
              this.onMessage({
                type: "activity_log",
                payload: {
                  id: uuidv4(),
                  timestamp: new Date(),
                  type: "system",
                  content: `Saved TTS audio: ${recordingPath}`,
                  metadata: { recordingPath, format: final.format, groupId },
                },
              });
            }
          })();
        }
      }
    }
    this.onMessage(msg);
  }

  private emitBinary(frame: Uint8Array): void {
    if (!this.onBinaryMessage) {
      return;
    }
    try {
      this.onBinaryMessage(frame);
    } catch (error) {
      this.sessionLogger.error({ err: error }, "Failed to emit binary frame");
    }
  }

  /**
   * Clean up session resources
   */
  public async cleanup(): Promise<void> {
    this.sessionLogger.trace({}, "agent.session.lifecycle.cleanup");

    if (this.unsubscribeAgentEvents) {
      this.unsubscribeAgentEvents();
      this.unsubscribeAgentEvents = null;
    }
    if (this.unsubscribeProviderSnapshotEvents) {
      this.unsubscribeProviderSnapshotEvents();
      this.unsubscribeProviderSnapshotEvents = null;
    }

    // Abort any ongoing operations
    this.abortController.abort();

    // Clear timeouts
    this.clearBufferTimeout();

    // Clear buffers
    this.pendingAudioSegments = [];
    this.audioBuffer = null;
    await this.stopVoiceTurnController();

    // Cleanup managers
    this.ttsManager.cleanup();
    this.sttManager.cleanup();
    this.dictationStreamManager.cleanupAll();

    // Close MCP clients
    if (this.agentMcpClient) {
      try {
        await this.agentMcpClient.close();
      } catch (error) {
        this.sessionLogger.error({ err: error }, "Failed to close Agent MCP client");
      }
      this.agentMcpClient = null;
      this.agentTools = null;
    }

    await this.disableVoiceModeForActiveAgent(true);
    this.isVoiceMode = false;

    this.terminalController.dispose();

    this.checkoutGitHandler.dispose();
    this.chatScheduleLoopHandler.dispose();
    this.configControlHandler.dispose();
    this.providerHandler.dispose();
    this.terminalScriptHandler.dispose();
    this.workspaceProjectHandler.dispose();
    this.agentLifecycleHandler.dispose();

    for (const unsubscribe of this.workspaceGitSubscriptions.values()) {
      unsubscribe();
    }
    this.workspaceGitSubscriptions.clear();
  }
}
