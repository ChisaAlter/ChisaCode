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
  type AgentSkillsPolicyPatchRequest,
  type AgentSkillsInstallRequest,
  type AgentSkillsUninstallRequest,
  type AgentMcpServersUpsertRequest,
  type AgentMcpServersPolicyPatchRequest,
  type AgentMcpServersDeleteRequest,
  type StartWorkspaceScriptRequest,
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
import { getPidLockInfo } from "./pid-lock.js";
import { generateLocalPairingOffer } from "./pairing-offer.js";
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
  formatSystemNotificationPrompt,
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
import { spawnWorkspaceScript } from "./worktree-bootstrap.js";
import type { WorkspaceScriptRuntimeStore } from "./workspace-script-runtime-store.js";
import type { DaemonConfigStore } from "./daemon-config-store.js";
import { runSyntheticModelTest } from "./model-gateway/model-gateway.js";
import { getErrorMessage, getErrorMessageOr } from "@chisacode/protocol/error-utils";
import { getAgentStatusPriority } from "@chisacode/protocol/agent-state-bucket";
import {
  buildUsageSummary,
  exportUsageEvents,
  pruneUsageEvents,
  type UsageStore,
} from "./usage/usage-store.js";
import type { WorkspaceGitRuntimeSnapshot, WorkspaceGitService } from "./workspace-git-service.js";

import { AgentManager } from "./agent/agent-manager.js";
import {
  installUserSkillsFromGitHub,
  installUserSkillsFromLocalDirectory,
  listManagedSkills,
  uninstallUserInstalledSkills,
} from "./agent/skills-management.js";
import {
  deleteManagedMcpServer,
  listManagedMcpServers,
  patchManagedMcpServerPolicy,
  upsertManagedMcpServer,
} from "./agent/mcp-server-management.js";
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
  type AgentProvider,
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
import {
  listDirectoryEntries,
  readExplorerFile,
  readExplorerFileBytes,
  getDownloadableFileInfo,
} from "./file-explorer/service.js";
import { DownloadTokenStore } from "./file-download/token-store.js";
import { PushTokenStore } from "./push/token-store.js";
import {
  readChisaCodeConfigForEdit,
  writeChisaCodeConfigForEdit,
  type ProjectConfigRpcError,
} from "../utils/chisacode-config-file.js";
import { buildMetadataPrompt } from "../utils/build-metadata-prompt.js";
import { archivePersistedWorkspaceRecord } from "./workspace-archive-service.js";
import { WorkspaceReconciliationService } from "./workspace-reconciliation-service.js";
import type { ScriptRouteStore } from "./script-proxy.js";
import {
  checkoutResolvedBranch,
  type CheckoutExistingBranchResult,
} from "../utils/checkout-git.js";
import { getProjectIcon } from "../utils/project-icon.js";
import { expandTilde } from "../utils/path.js";
import { CheckoutDiffManager } from "./checkout-diff-manager.js";
import {
  buildCheckoutPrStatusPayloadFromSnapshot,
  buildCheckoutStatusPayloadFromSnapshot,
} from "./checkout/status-projection.js";
import { toResolver, type Resolvable } from "./speech/provider-resolver.js";
import type { SpeechReadinessSnapshot, SpeechReadinessState } from "./speech/speech-runtime.js";
import type pino from "pino";
import {
  ChatServiceError,
  FileBackedChatService,
  parseMentionAgentIds,
} from "./chat/chat-service.js";
import { notifyChatMentions, prepareChatMentionFanout } from "./chat/chat-mentions.js";
import { LoopService } from "./loop-service.js";
import { ScheduleService } from "./schedule/service.js";
import { execCommand } from "../utils/spawn.js";
import { createGitHubService, type GitHubService } from "../services/github-service.js";
import {
  summarizeFetchWorkspacesEntries,
  WorkspaceDirectory,
  type WorkspaceUpdatesFilter,
} from "./workspace-directory.js";
import {
  attemptFirstAgentBranchAutoName,
  createChisaCodeWorktree,
  type CreateChisaCodeWorktreeInput,
  type CreateChisaCodeWorktreeResult,
} from "./chisacode-worktree-service.js";
import { generateBranchNameFromFirstAgentContext } from "./worktree-branch-name-generator.js";
import {
  assertSafeGitRef as assertWorktreeSafeGitRef,
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

    // Initialize handlers with a SessionContext facade.
    this.checkoutGitHandler = new CheckoutGitHandler({
      clientId: this.clientId,
      sessionId: this.sessionId,
      sessionLogger: this.sessionLogger,
      chisacodeHome: this.chisacodeHome,
      agentManager: this.agentManager,
      daemonConfigStore: this.daemonConfigStore,
      projectRegistry: this.projectRegistry,
      providerSnapshotManager: this.providerSnapshotManager,
      workspaceGitService: this.workspaceGitService,
      github: this.github,
      checkoutDiffManager: this.checkoutDiffManager,
      abortController: this.abortController,
      emit: (message) => this.emit(message),
      notifyGitMutation: (cwd, reason, opts) => this.notifyGitMutation(cwd, reason, opts),
      emitWorkspaceUpdateForCwd: (cwd) => this.emitWorkspaceUpdateForCwd(cwd),
      emitWorkspaceUpdateForWorkspaceId: (workspaceId) =>
        this.emitWorkspaceUpdateForWorkspaceId(workspaceId),
      handleWorkspaceGitBranchSnapshot: (cwd, branchName) =>
        this.handleWorkspaceGitBranchSnapshot(cwd, branchName),
      generateCommitMessage: (cwd) => this.generateCommitMessage(cwd),
      generatePullRequestText: (cwd, baseRef) => this.generatePullRequestText(cwd, baseRef),
    });

    this.sessionLogger.trace({}, "agent.session.lifecycle.created");
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

  private hasActiveAgentRun(agentId: string | null): boolean {
    if (!agentId) {
      return false;
    }
    return this.agentManager.hasInFlightRun(agentId);
  }

  private handleAgentRunError(agentId: string, error: unknown, context: string): void {
    const message = errorToFriendlyMessage(error);
    this.sessionLogger.error({ err: error, agentId, context }, `${context} for agent ${agentId}`);
    this.emit({
      type: "activity_log",
      payload: {
        id: uuidv4(),
        timestamp: new Date(),
        type: "error",
        content: `${context}: ${message}`,
      },
    });
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
    this.terminalController.start();
    const handleProviderSnapshotChange = (entries: ProviderSnapshotEntry[], cwd: string) => {
      // COMPAT(providersSnapshot): keep provider visibility gating for older clients.
      const visibleEntries = entries.filter((entry) =>
        this.isProviderVisibleToClient(entry.provider),
      );
      const snapshotCwd = cwd === resolveSnapshotCwd() ? undefined : cwd;
      this.emit({
        type: "providers_snapshot_update",
        payload: {
          ...(snapshotCwd ? { cwd: snapshotCwd } : {}),
          entries: this.downgradeEntryModesForClient(visibleEntries),
          generatedAt: new Date().toISOString(),
        },
      });
    };
    this.providerSnapshotManager.on("change", handleProviderSnapshotChange);
    this.unsubscribeProviderSnapshotEvents = () => {
      this.providerSnapshotManager.off("change", handleProviderSnapshotChange);
    };
  }

  private bindVoiceBridges(params: {
    voice: SessionOptions["voice"];
    voiceBridge: SessionOptions["voiceBridge"];
    dictation: SessionOptions["dictation"];
  }): void {
    const { voice, voiceBridge, dictation } = params;
    this.resolveVoiceTurnDetection = toResolver(voice?.turnDetection ?? null);
    this.registerVoiceSpeakHandler = voiceBridge?.registerVoiceSpeakHandler;
    this.unregisterVoiceSpeakHandler = voiceBridge?.unregisterVoiceSpeakHandler;
    this.registerVoiceCallerContext = voiceBridge?.registerVoiceCallerContext;
    this.unregisterVoiceCallerContext = voiceBridge?.unregisterVoiceCallerContext;
    this.getSpeechReadiness = dictation?.getSpeechReadiness;
  }

  private initializePerSessionManagers(params: {
    tts: SessionOptions["tts"];
    stt: SessionOptions["stt"];
    sttLanguage: SessionOptions["sttLanguage"];
    dictation: SessionOptions["dictation"];
  }): void {
    const { tts, stt, sttLanguage, dictation } = params;
    this.ttsManager = new TTSManager(this.sessionId, this.sessionLogger, tts);
    this.sttManager = new STTManager(this.sessionId, this.sessionLogger, stt, {
      language: sttLanguage,
    });
    this.dictationStreamManager = new DictationStreamManager({
      logger: this.sessionLogger,
      sessionId: this.sessionId,
      emit: (msg) => this.handleDictationManagerMessage(msg),
      stt: dictation?.stt ?? null,
      language: dictation?.sttLanguage,
      finalTimeoutMs: dictation?.finalTimeoutMs,
    });
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
      this.dispatchAgentRewindMessage(msg) ??
      this.dispatchUsageMessage(msg) ??
      this.dispatchAgentLifecycleMessage(msg) ??
      this.dispatchAgentConfigMessage(msg) ??
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
      case "voice_audio_chunk":
        return this.handleAudioChunk(msg);
      case "abort_request":
        return this.handleAbort();
      case "audio_played":
        this.handleAudioPlayed(msg.id);
        return undefined;
      case "set_voice_mode":
        return this.handleSetVoiceMode(msg.enabled, msg.agentId, msg.requestId);
      case "dictation_stream_start":
        return this.handleDictationStreamStart(msg);
      case "dictation_stream_chunk":
        return this.dictationStreamManager.handleChunk({
          dictationId: msg.dictationId,
          seq: msg.seq,
          audioBase64: msg.audio,
          format: msg.format,
        });
      case "dictation_stream_finish":
        return this.dictationStreamManager.handleFinish(msg.dictationId, msg.finalSeq);
      case "dictation_stream_cancel":
        this.dictationStreamManager.handleCancel(msg.dictationId);
        return undefined;
      case "restart_server_request":
        return this.handleRestartServerRequest(msg.requestId, msg.reason);
      case "shutdown_server_request":
        return this.handleShutdownServerRequest(msg.requestId);
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

  private dispatchAgentRewindMessage(msg: SessionInboundMessage): Promise<void> | undefined {
    switch (msg.type) {
      case "agent.rewind.request":
        return this.handleAgentRewindRequest(msg);
      default:
        return undefined;
    }
  }

  private async handleDictationStreamStart(
    msg: Extract<SessionInboundMessage, { type: "dictation_stream_start" }>,
  ): Promise<void> {
    const unavailable = this.resolveVoiceFeatureUnavailableContext("dictation");
    if (unavailable) {
      this.emit({
        type: "dictation_stream_error",
        payload: {
          dictationId: msg.dictationId,
          error: unavailable.message,
          retryable: unavailable.retryable,
          reasonCode: unavailable.reasonCode,
          missingModelIds: unavailable.missingModelIds,
        },
      });
      return;
    }
    await this.dictationStreamManager.handleStart(msg.dictationId, msg.format);
  }

  private dispatchUsageMessage(msg: SessionInboundMessage): Promise<void> | undefined {
    switch (msg.type) {
      case "usage.summary.get.request":
        return this.handleUsageSummaryGet(msg);
      case "usage.export.request":
        return this.handleUsageExport(msg);
      case "usage.clear.request":
        return this.handleUsageClear(msg);
      default:
        return undefined;
    }
  }

  private dispatchAgentLifecycleMessage(msg: SessionInboundMessage): Promise<void> | undefined {
    switch (msg.type) {
      case "fetch_agents_request":
        return this.handleFetchAgents(msg);
      case "fetch_agent_history_request":
        return this.handleFetchAgentHistory(msg);
      case "fetch_recent_provider_sessions_request":
        return this.handleFetchRecentProviderSessions(msg);
      case "fetch_agent_request":
        return this.handleFetchAgent(msg.agentId, msg.requestId);
      case "delete_agent_request":
        return this.handleDeleteAgentRequest(msg.agentId, msg.requestId);
      case "archive_agent_request":
        return this.handleArchiveAgentRequest(msg.agentId, msg.requestId);
      case "close_items_request":
        return this.handleCloseItemsRequest(msg);
      case "update_agent_request":
        return this.handleUpdateAgentRequest(msg.agentId, msg.name, msg.labels, msg.requestId);
      case "project.rename.request":
        return this.handleProjectRenameRequest(msg.projectId, msg.customName, msg.requestId);
      case "send_agent_message_request":
        return this.handleSendAgentMessageRequest(msg);
      case "wait_for_finish_request":
        return this.handleWaitForFinish(msg.agentId, msg.requestId, msg.timeoutMs);
      case "create_agent_request":
        return this.handleCreateAgentRequest(msg);
      case "resume_agent_request":
        return this.handleResumeAgentRequest(msg);
      case "import_agent_request":
        return this.handleImportAgentRequest(msg);
      case "refresh_agent_request":
        return this.handleRefreshAgentRequest(msg);
      case "cancel_agent_request":
        return this.handleCancelAgentRequest(msg.agentId, msg.requestId);
      case "fetch_agent_timeline_request":
        return this.handleFetchAgentTimelineRequest(msg);
      case "agent_permission_response":
        return this.handleAgentPermissionResponse(msg.agentId, msg.requestId, msg.response);
      case "clear_agent_attention":
        return this.handleClearAgentAttention(msg.agentId, msg.requestId);
      default:
        return undefined;
    }
  }

  private dispatchAgentConfigMessage(msg: SessionInboundMessage): Promise<void> | undefined {
    switch (msg.type) {
      case "set_agent_mode_request":
        return this.handleSetAgentModeRequest(msg.agentId, msg.modeId, msg.requestId);
      case "set_agent_model_request":
        return this.handleSetAgentModelRequest(
          msg.agentId,
          msg.modelId,
          msg.requestId,
          msg.runtimeProvider,
        );
      case "set_agent_feature_request":
        return this.handleSetAgentFeatureRequest(
          msg.agentId,
          msg.featureId,
          msg.value,
          msg.requestId,
        );
      case "set_agent_thinking_request":
        return this.handleSetAgentThinkingRequest(msg.agentId, msg.thinkingOptionId, msg.requestId);
      case "get_daemon_config_request":
        this.emit({
          type: "get_daemon_config_response",
          payload: { requestId: msg.requestId, config: this.daemonConfigStore.get() },
        });
        return undefined;
      case "daemon.get_status.request":
        return this.handleDaemonGetStatusRequest(msg);
      case "daemon.get_pairing_offer.request":
        return this.handleDaemonGetPairingOfferRequest(msg);
      case "set_daemon_config_request":
        this.emit({
          type: "set_daemon_config_response",
          payload: {
            requestId: msg.requestId,
            config: this.daemonConfigStore.patch(msg.config),
          },
        });
        return undefined;
      case "read_project_config_request":
        return this.handleReadProjectConfigRequest(msg);
      case "write_project_config_request":
        return this.handleWriteProjectConfigRequest(msg);
      default:
        return undefined;
    }
  }

  private async handleReadProjectConfigRequest(
    msg: Extract<SessionInboundMessage, { type: "read_project_config_request" }>,
  ): Promise<void> {
    const repoRoot = await resolveKnownProjectRootForConfig({
      repoRoot: msg.repoRoot,
      projectRegistry: this.projectRegistry,
    });
    if (!repoRoot) {
      this.emitProjectConfigReadFailure(msg, { code: "project_not_found" });
      return;
    }

    const result = readChisaCodeConfigForEdit(repoRoot);
    if (!result.ok) {
      this.sessionLogger.warn(
        { repoRoot, requestId: msg.requestId, outcome: result.error.code },
        "Failed to read project config",
      );
      this.emitProjectConfigReadFailure(msg, result.error, repoRoot);
      return;
    }

    if (result.config === null) {
      this.sessionLogger.debug(
        { repoRoot, requestId: msg.requestId, outcome: "missing_project_config" },
        "Project config missing",
      );
    }

    this.emit({
      type: "read_project_config_response",
      payload: {
        requestId: msg.requestId,
        repoRoot,
        ok: true,
        config: result.config,
        revision: result.revision,
      },
    });
  }

  private async handleWriteProjectConfigRequest(
    msg: Extract<SessionInboundMessage, { type: "write_project_config_request" }>,
  ): Promise<void> {
    const repoRoot = await resolveKnownProjectRootForConfig({
      repoRoot: msg.repoRoot,
      projectRegistry: this.projectRegistry,
    });
    if (!repoRoot) {
      this.emitProjectConfigWriteFailure(msg, { code: "project_not_found" });
      return;
    }

    this.sessionLogger.debug(
      { repoRoot, requestId: msg.requestId, outcome: "write_attempt" },
      "Writing project config",
    );
    const result = writeChisaCodeConfigForEdit({
      repoRoot,
      config: msg.config,
      expectedRevision: msg.expectedRevision,
    });
    if (!result.ok) {
      this.sessionLogger.debug(
        { repoRoot, requestId: msg.requestId, outcome: result.error.code },
        "Project config write did not complete",
      );
      this.emitProjectConfigWriteFailure(msg, result.error, repoRoot);
      return;
    }

    this.sessionLogger.debug(
      { repoRoot, requestId: msg.requestId, outcome: "written" },
      "Project config written",
    );
    this.emit({
      type: "write_project_config_response",
      payload: {
        requestId: msg.requestId,
        repoRoot,
        ok: true,
        config: result.config,
        revision: result.revision,
      },
    });
  }

  private emitProjectConfigReadFailure(
    msg: Extract<SessionInboundMessage, { type: "read_project_config_request" }>,
    error: ProjectConfigRpcError,
    repoRoot = msg.repoRoot,
  ): void {
    this.emit({
      type: "read_project_config_response",
      payload: {
        requestId: msg.requestId,
        repoRoot,
        ok: false,
        error,
      },
    });
  }

  private emitProjectConfigWriteFailure(
    msg: Extract<SessionInboundMessage, { type: "write_project_config_request" }>,
    error: ProjectConfigRpcError,
    repoRoot = msg.repoRoot,
  ): void {
    this.emit({
      type: "write_project_config_response",
      payload: {
        requestId: msg.requestId,
        repoRoot,
        ok: false,
        error,
      },
    });
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
    switch (msg.type) {
      case "fetch_workspaces_request":
        return this.handleFetchWorkspacesRequest(msg);
      case "chisacode_worktree_list_request":
        return this.handleChisaCodeWorktreeListRequest(msg);
      case "chisacode_worktree_archive_request":
        return this.handleChisaCodeWorktreeArchiveRequest(msg);
      case "create_chisacode_worktree_request":
        return this.handleCreateChisaCodeWorktreeRequest(msg);
      case "workspace_setup_status_request":
        return this.handleWorkspaceSetupStatusRequest(msg);
      case "list_available_editors_request":
        return this.handleListAvailableEditorsRequest(msg);
      case "open_in_editor_request":
        return this.handleOpenInEditorRequest(msg);
      case "open_project_request":
        return this.handleOpenProjectRequest(msg);
      case "archive_workspace_request":
        return this.handleArchiveWorkspaceRequest(msg);
      case "file_explorer_request":
        return this.handleFileExplorerRequest(msg);
      case "project_icon_request":
        return this.handleProjectIconRequest(msg);
      case "file_download_token_request":
        return this.handleFileDownloadTokenRequest(msg);
      default:
        return undefined;
    }
  }

  private dispatchProviderMessage(msg: SessionInboundMessage): Promise<void> | undefined {
    switch (msg.type) {
      case "list_provider_models_request":
        return this.handleListProviderModelsRequest(msg);
      case "list_provider_modes_request":
        return this.handleListProviderModesRequest(msg);
      case "list_provider_features_request":
        return this.handleListProviderFeaturesRequest(msg);
      case "list_available_providers_request":
        return this.handleListAvailableProvidersRequest(msg);
      case "get_providers_snapshot_request":
        return this.handleGetProvidersSnapshotRequest(msg);
      case "refresh_providers_snapshot_request":
        return this.handleRefreshProvidersSnapshotRequest(msg);
      case "provider_diagnostic_request":
        return this.handleProviderDiagnosticRequest(msg);
      case "provider.tooling.run.request":
        return this.handleProviderToolingActionRequest(msg);
      case "agent.presets.list.request":
        return this.handleAgentPresetsListRequest(msg);
      case "model_gateway.moa.test.request":
        return this.handleModelGatewayMoaTestRequest(msg);
      default:
        return undefined;
    }
  }

  private dispatchTerminalMessage(msg: SessionInboundMessage): Promise<void> | undefined {
    if (msg.type === "start_workspace_script_request") {
      return this.handleStartWorkspaceScriptRequest(msg);
    }
    return this.terminalController.dispatch(msg);
  }

  private dispatchChatScheduleLoopMessage(msg: SessionInboundMessage): Promise<void> | undefined {
    switch (msg.type) {
      case "chat/create":
        return this.handleChatCreateRequest(msg);
      case "chat/list":
        return this.handleChatListRequest(msg);
      case "chat/inspect":
        return this.handleChatInspectRequest(msg);
      case "chat/delete":
        return this.handleChatDeleteRequest(msg);
      case "chat/post":
        return this.handleChatPostRequest(msg);
      case "chat/read":
        return this.handleChatReadRequest(msg);
      case "chat/wait":
        return this.handleChatWaitRequest(msg);
      case "loop/run":
        return this.handleLoopRunRequest(msg);
      case "loop/list":
        return this.handleLoopListRequest(msg);
      case "loop/inspect":
        return this.handleLoopInspectRequest(msg);
      case "loop/logs":
        return this.handleLoopLogsRequest(msg);
      case "loop/stop":
        return this.handleLoopStopRequest(msg);
      default:
        return this.dispatchScheduleMessage(msg);
    }
  }

  private dispatchScheduleMessage(msg: SessionInboundMessage): Promise<void> | undefined {
    switch (msg.type) {
      case "schedule/create":
        return this.handleScheduleCreateRequest(msg);
      case "schedule/list":
        return this.handleScheduleListRequest(msg);
      case "schedule/inspect":
        return this.handleScheduleInspectRequest(msg);
      case "schedule/logs":
        return this.handleScheduleLogsRequest(msg);
      case "schedule/pause":
        return this.handleSchedulePauseRequest(msg);
      case "schedule/resume":
        return this.handleScheduleResumeRequest(msg);
      case "schedule/delete":
        return this.handleScheduleDeleteRequest(msg);
      case "schedule/run-once":
        return this.handleScheduleRunOnceRequest(msg);
      case "schedule/update":
        return this.handleScheduleUpdateRequest(msg);
      default:
        return undefined;
    }
  }

  private async dispatchMiscMessage(msg: SessionInboundMessage): Promise<void> {
    switch (msg.type) {
      case "list_commands_request":
        await this.handleListCommandsRequest(msg);
        return;
      case "agent.skills.list.request":
        await this.handleAgentSkillsListRequest(msg.requestId);
        return;
      case "agent.skills.policy.patch.request":
        await this.handleAgentSkillsPolicyPatchRequest(msg);
        return;
      case "agent.skills.install.request":
        await this.handleAgentSkillsInstallRequest(msg);
        return;
      case "agent.skills.uninstall.request":
        await this.handleAgentSkillsUninstallRequest(msg);
        return;
      case "agent.mcp_servers.list.request":
        await this.handleAgentMcpServersListRequest(msg.requestId);
        return;
      case "agent.mcp_servers.upsert.request":
        await this.handleAgentMcpServersUpsertRequest(msg);
        return;
      case "agent.mcp_servers.policy.patch.request":
        await this.handleAgentMcpServersPolicyPatchRequest(msg);
        return;
      case "agent.mcp_servers.delete.request":
        await this.handleAgentMcpServersDeleteRequest(msg);
        return;
      case "register_push_token":
        this.handleRegisterPushToken(msg.token);
        return;
    }
  }

  public resetPeakInflight(): void {
    this.peakInflightRequests = this.inflightRequests;
  }

  public handleBinaryFrame(frame: TerminalStreamFrame): void {
    this.terminalController.handleBinaryFrame(frame);
  }

  private async handleRestartServerRequest(requestId: string, reason?: string): Promise<void> {
    const payload: { status: string } & Record<string, unknown> = {
      status: "restart_requested",
      clientId: this.clientId,
    };
    if (reason && reason.trim().length > 0) {
      payload.reason = reason;
    }
    payload.requestId = requestId;

    this.sessionLogger.warn({ reason }, "Restart requested via websocket");
    this.emit({
      type: "status",
      payload,
    });

    this.emitLifecycleIntent({
      type: "restart",
      clientId: this.clientId,
      requestId,
      ...(reason ? { reason } : {}),
    });
  }

  private async handleShutdownServerRequest(requestId: string): Promise<void> {
    this.sessionLogger.warn("Shutdown requested via websocket");
    this.emit({
      type: "status",
      payload: {
        status: "shutdown_requested",
        clientId: this.clientId,
        requestId,
      },
    });

    this.emitLifecycleIntent({
      type: "shutdown",
      clientId: this.clientId,
      requestId,
    });
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

  private async handleDeleteAgentRequest(agentId: string, requestId: string): Promise<void> {
    this.sessionLogger.info({ agentId }, `Deleting agent ${agentId} from registry`);

    const knownCwd =
      this.agentManager.getAgent(agentId)?.cwd ??
      (await this.agentStorage.get(agentId))?.cwd ??
      null;

    // File-backed storage still needs an early delete fence before closeAgent().
    beginAgentDeleteIfSupported(this.agentStorage, agentId);

    try {
      await closeAgentCommand({ agentManager: this.agentManager }, agentId);
    } catch (error) {
      this.sessionLogger.warn(
        { err: error, agentId },
        `Failed to close agent ${agentId} during delete`,
      );
    }

    // Drain queued persistence from the just-closed agent before removing its
    // durable snapshot, otherwise an in-flight background write can recreate it.
    await this.agentManager.flush();

    try {
      await this.agentStorage.remove(agentId);
      await this.agentManager.deleteCommittedTimeline(agentId);
    } catch (error) {
      this.sessionLogger.error({ err: error, agentId }, `Failed to fully delete agent ${agentId}`);
    }

    this.emit({
      type: "agent_deleted",
      payload: {
        agentId,
        requestId,
      },
    });

    if (this.agentUpdatesSubscription) {
      this.bufferOrEmitAgentUpdate(this.agentUpdatesSubscription, {
        kind: "remove",
        agentId,
      });
    }

    if (knownCwd) {
      await this.emitWorkspaceUpdateForCwd(knownCwd);
    }
  }

  private async handleArchiveAgentRequest(agentId: string, requestId: string): Promise<void> {
    this.sessionLogger.info({ agentId }, `Archiving agent ${agentId}`);

    const { archivedAt } = await this.archiveAgentForClose(agentId);

    this.emit({
      type: "agent_archived",
      payload: {
        agentId,
        archivedAt,
        requestId,
      },
    });
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

  private async handleCloseItemsRequest(msg: CloseItemsRequest): Promise<void> {
    const archiveResults = await Promise.allSettled(
      msg.agentIds.map((agentId) => this.archiveAgentForClose(agentId)),
    );
    const agents = [];
    for (let i = 0; i < archiveResults.length; i += 1) {
      const result = archiveResults[i];
      if (result.status === "fulfilled") {
        agents.push(result.value);
      } else {
        this.sessionLogger.warn(
          { err: result.reason, agentId: msg.agentIds[i], requestId: msg.requestId },
          "Failed to archive agent during close_items batch",
        );
      }
    }

    const terminals = [];
    for (const terminalId of msg.terminalIds) {
      try {
        terminals.push(this.terminalController.killTerminalForClose(terminalId));
      } catch (error) {
        this.sessionLogger.warn(
          { err: error, terminalId, requestId: msg.requestId },
          "Failed to kill terminal during close_items batch",
        );
        terminals.push({
          terminalId,
          success: false,
        });
      }
    }

    this.emit({
      type: "close_items_response",
      payload: {
        agents,
        terminals,
        requestId: msg.requestId,
      },
    });
  }

  private async unarchiveAgentByHandle(handle: AgentPersistenceHandle): Promise<void> {
    const records = await this.agentStorage.list();
    const matched = records.find(
      (record) =>
        record.persistence?.provider === handle.provider &&
        record.persistence?.sessionId === handle.sessionId,
    );
    if (!matched) {
      return;
    }
    await unarchiveAgentState(this.agentStorage, this.agentManager, matched.id);
  }

  private async handleUpdateAgentRequest(
    agentId: string,
    name: string | undefined,
    labels: Record<string, string> | undefined,
    requestId: string,
  ): Promise<void> {
    this.sessionLogger.info(
      {
        agentId,
        requestId,
        hasName: typeof name === "string",
        labelCount: labels ? Object.keys(labels).length : 0,
      },
      "session: update_agent_request",
    );

    try {
      const result = await updateAgentCommand(
        { agentManager: this.agentManager },
        { agentId, name, labels },
      );

      if (!result.accepted) {
        this.emit({
          type: "update_agent_response",
          payload: {
            requestId,
            agentId,
            accepted: false,
            error: result.error,
          },
        });
        return;
      }

      this.emit({
        type: "update_agent_response",
        payload: { requestId, agentId, accepted: true, error: null },
      });
    } catch (error) {
      this.sessionLogger.error(
        { err: error, agentId, requestId },
        "session: update_agent_request error",
      );
      this.emit({
        type: "activity_log",
        payload: {
          id: uuidv4(),
          timestamp: new Date(),
          type: "error",
          content: `Failed to update agent: ${getErrorMessage(error)}`,
        },
      });
      this.emit({
        type: "update_agent_response",
        payload: {
          requestId,
          agentId,
          accepted: false,
          error: getErrorMessageOr(error, "Failed to update agent"),
        },
      });
    }
  }

  private async handleProjectRenameRequest(
    projectId: string,
    customName: string | null,
    requestId: string,
  ): Promise<void> {
    this.sessionLogger.info(
      { projectId, requestId, hasCustomName: typeof customName === "string" },
      "session: project.rename.request",
    );

    try {
      const existing = await this.projectRegistry.get(projectId);
      if (!existing) {
        this.emit({
          type: "project.rename.response",
          payload: {
            requestId,
            projectId,
            accepted: false,
            customName: null,
            error: "Project not found",
          },
        });
        return;
      }

      const trimmed = customName?.trim() ?? "";
      const nextCustomName = trimmed.length === 0 ? null : trimmed;

      await this.projectRegistry.upsert({
        ...existing,
        customName: nextCustomName,
        updatedAt: new Date().toISOString(),
      });

      this.emit({
        type: "project.rename.response",
        payload: {
          requestId,
          projectId,
          accepted: true,
          customName: nextCustomName,
          error: null,
        },
      });

      // Re-emit descriptors for every workspace under this project so the new
      // resolved name lands in the UI immediately.
      const workspaces = await this.workspaceRegistry.list();
      const affectedWorkspaceIds = workspaces
        .filter((workspace) => workspace.projectId === projectId)
        .map((workspace) => workspace.workspaceId);
      if (affectedWorkspaceIds.length > 0) {
        await this.emitWorkspaceUpdatesForWorkspaceIds(affectedWorkspaceIds, {
          skipReconcile: true,
        });
      }
    } catch (error) {
      this.sessionLogger.error(
        { err: error, projectId, requestId },
        "session: project.rename.request error",
      );
      this.emit({
        type: "activity_log",
        payload: {
          id: uuidv4(),
          timestamp: new Date(),
          type: "error",
          content: `Failed to rename project: ${getErrorMessage(error)}`,
        },
      });
      this.emit({
        type: "project.rename.response",
        payload: {
          requestId,
          projectId,
          accepted: false,
          customName: null,
          error: getErrorMessageOr(error, "Failed to rename project"),
        },
      });
    }
  }

  private toVoiceFeatureUnavailableContext(
    state: SpeechReadinessState,
  ): VoiceFeatureUnavailableContext {
    return {
      reasonCode: state.reasonCode,
      message: state.message,
      retryable: state.retryable,
      missingModelIds: [...state.missingModelIds],
    };
  }

  private resolveModeReadinessState(
    readiness: SpeechReadinessSnapshot,
    mode: "voice_mode" | "dictation",
  ): SpeechReadinessState {
    if (mode === "voice_mode") {
      return readiness.realtimeVoice;
    }
    return readiness.dictation;
  }

  private getVoiceFeatureUnavailableResponseMetadata(
    error: unknown,
  ): VoiceFeatureUnavailableResponseMetadata {
    if (!(error instanceof VoiceFeatureUnavailableError)) {
      return {};
    }
    return {
      reasonCode: error.reasonCode,
      retryable: error.retryable,
      missingModelIds: error.missingModelIds,
    };
  }

  private resolveVoiceFeatureUnavailableContext(
    mode: "voice_mode" | "dictation",
  ): VoiceFeatureUnavailableContext | null {
    const readiness = this.getSpeechReadiness?.();
    if (!readiness) {
      return null;
    }

    const modeReadiness = this.resolveModeReadinessState(readiness, mode);
    if (!modeReadiness.enabled) {
      return this.toVoiceFeatureUnavailableContext(modeReadiness);
    }
    if (!readiness.voiceFeature.available) {
      return this.toVoiceFeatureUnavailableContext(readiness.voiceFeature);
    }
    if (!modeReadiness.available) {
      return this.toVoiceFeatureUnavailableContext(modeReadiness);
    }
    return null;
  }

  /**
   * Handle voice mode toggle
   */
  private async handleSetVoiceMode(
    enabled: boolean,
    agentId?: string,
    requestId?: string,
  ): Promise<void> {
    const startedAt = Date.now();
    try {
      this.sessionLogger.info(
        { enabled, requestedAgentId: agentId ?? null, requestId: requestId ?? null },
        "set_voice_mode started",
      );
      if (enabled) {
        const unavailable = this.resolveVoiceFeatureUnavailableContext("voice_mode");
        if (unavailable) {
          throw new VoiceFeatureUnavailableError(unavailable);
        }

        const normalizedAgentId = this.parseVoiceTargetAgentId(agentId ?? "", "set_voice_mode");

        if (
          this.isVoiceMode &&
          this.voiceModeAgentId &&
          this.voiceModeAgentId !== normalizedAgentId
        ) {
          this.sessionLogger.info(
            {
              previousAgentId: this.voiceModeAgentId,
              nextAgentId: normalizedAgentId,
              elapsedMs: Date.now() - startedAt,
            },
            "set_voice_mode disabling previous active voice agent",
          );
          await this.disableVoiceModeForActiveAgent(true);
        }

        if (!this.isVoiceMode || this.voiceModeAgentId !== normalizedAgentId) {
          this.sessionLogger.info(
            { agentId: normalizedAgentId, elapsedMs: Date.now() - startedAt },
            "set_voice_mode enabling voice for agent",
          );
          const refreshedAgentId = await this.enableVoiceModeForAgent(normalizedAgentId);
          this.voiceModeAgentId = refreshedAgentId;
          this.sessionLogger.info(
            { agentId: refreshedAgentId, elapsedMs: Date.now() - startedAt },
            "set_voice_mode agent enable complete",
          );
        }

        this.sessionLogger.info(
          { agentId: this.voiceModeAgentId, elapsedMs: Date.now() - startedAt },
          "set_voice_mode starting voice turn controller",
        );
        await this.startVoiceTurnController();
        this.sessionLogger.info(
          { agentId: this.voiceModeAgentId, elapsedMs: Date.now() - startedAt },
          "set_voice_mode voice turn controller started",
        );
        this.isVoiceMode = true;
        this.sessionLogger.info(
          {
            agentId: this.voiceModeAgentId,
            elapsedMs: Date.now() - startedAt,
          },
          "Voice mode enabled for existing agent",
        );
        if (requestId) {
          this.emit({
            type: "set_voice_mode_response",
            payload: {
              requestId,
              enabled: true,
              agentId: this.voiceModeAgentId,
              accepted: true,
              error: null,
            },
          });
        }
        return;
      }

      this.sessionLogger.info(
        { agentId: this.voiceModeAgentId, elapsedMs: Date.now() - startedAt },
        "set_voice_mode disabling active voice mode",
      );
      await this.disableVoiceModeForActiveAgent(true);
      this.isVoiceMode = false;
      this.sessionLogger.info({ elapsedMs: Date.now() - startedAt }, "Voice mode disabled");
      if (requestId) {
        this.emit({
          type: "set_voice_mode_response",
          payload: {
            requestId,
            enabled: false,
            agentId: null,
            accepted: true,
            error: null,
          },
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to set voice mode";
      const unavailable = this.getVoiceFeatureUnavailableResponseMetadata(error);
      this.sessionLogger.error(
        {
          err: error,
          enabled,
          requestedAgentId: agentId ?? null,
          elapsedMs: Date.now() - startedAt,
        },
        "set_voice_mode failed",
      );
      if (requestId) {
        this.emit({
          type: "set_voice_mode_response",
          payload: {
            requestId,
            enabled: this.isVoiceMode,
            agentId: this.voiceModeAgentId,
            accepted: false,
            error: errorMessage,
            ...unavailable,
          },
        });
        return;
      }
      throw error;
    }
  }

  private parseVoiceTargetAgentId(rawId: string, source: string): string {
    const parsed = AgentIdSchema.safeParse(rawId.trim());
    if (!parsed.success) {
      throw new Error(`${source}: agentId must be a UUID`);
    }
    return parsed.data;
  }

  private async enableVoiceModeForAgent(agentId: string): Promise<string> {
    const startedAt = Date.now();
    this.sessionLogger.info({ agentId }, "enableVoiceModeForAgent.ensureAgentLoaded.start");
    const existing = await ensureAgentLoaded(agentId, {
      agentManager: this.agentManager,
      agentStorage: this.agentStorage,
      logger: this.sessionLogger,
    });
    this.sessionLogger.info(
      { agentId, elapsedMs: Date.now() - startedAt },
      "enableVoiceModeForAgent.ensureAgentLoaded.done",
    );

    this.registerVoiceBridgeForAgent(agentId);

    const baseConfig: VoiceModeBaseConfig = {
      systemPrompt: stripVoiceModeSystemPrompt(existing.config.systemPrompt),
    };
    this.voiceModeBaseConfig = baseConfig;
    const refreshOverrides: Partial<AgentSessionConfig> = {
      systemPrompt: buildVoiceModeSystemPrompt(baseConfig.systemPrompt, true),
    };

    try {
      this.sessionLogger.info(
        { agentId, elapsedMs: Date.now() - startedAt },
        "enableVoiceModeForAgent.reloadAgentSession.start",
      );
      const refreshed = await this.agentManager.reloadAgentSession(agentId, refreshOverrides);
      this.sessionLogger.info(
        { agentId, refreshedAgentId: refreshed.id, elapsedMs: Date.now() - startedAt },
        "enableVoiceModeForAgent.reloadAgentSession.done",
      );
      return refreshed.id;
    } catch (error) {
      this.unregisterVoiceSpeakHandler?.(agentId);
      this.unregisterVoiceCallerContext?.(agentId);
      this.voiceModeBaseConfig = null;
      throw error;
    }
  }

  private async disableVoiceModeForActiveAgent(restoreAgentConfig: boolean): Promise<void> {
    await this.stopVoiceTurnController();

    const agentId = this.voiceModeAgentId;
    if (!agentId) {
      this.voiceModeBaseConfig = null;
      return;
    }

    this.unregisterVoiceSpeakHandler?.(agentId);
    this.unregisterVoiceCallerContext?.(agentId);

    if (restoreAgentConfig && this.voiceModeBaseConfig) {
      const baseConfig = this.voiceModeBaseConfig;
      try {
        await this.agentManager.reloadAgentSession(agentId, {
          systemPrompt: buildVoiceModeSystemPrompt(baseConfig.systemPrompt, false),
        });
      } catch (error) {
        this.sessionLogger.warn(
          { err: error, agentId },
          "Failed to restore agent config while disabling voice mode",
        );
      }
    }

    this.voiceModeBaseConfig = null;
    this.voiceModeAgentId = null;
  }

  private handleDictationManagerMessage(msg: DictationStreamOutboundMessage): void {
    this.emit(msg as unknown as SessionOutboundMessage);
  }

  private async startVoiceTurnController(): Promise<void> {
    if (this.voiceTurnController) {
      this.sessionLogger.info("startVoiceTurnController skipped: already running");
      return;
    }

    const turnDetection = this.resolveVoiceTurnDetection();
    if (!turnDetection) {
      throw new Error("Voice turn detection is not configured");
    }
    const stt = this.sttManager.getProvider();
    if (!stt) {
      throw new Error("Voice speech-to-text is not configured");
    }

    this.sessionLogger.info(
      { providerId: turnDetection.id },
      "startVoiceTurnController creating controller",
    );

    const controller = createVoiceTurnController({
      logger: this.sessionLogger.child({ component: "voice-turn-controller" }),
      turnDetection,
      stt,
      sttLanguage: this.sttLanguage,
      callbacks: {
        onSpeechStarted: async () => {
          this.sessionLogger.debug("Voice VAD speech_started");
        },
        onPartialTranscript: async ({ segmentId, transcript }) => {
          this.sessionLogger.info(
            { segmentId, transcriptLength: transcript.trim().length },
            "voice_input_state emitting isSpeaking=true",
          );
          this.emit({
            type: "voice_input_state",
            payload: {
              isSpeaking: true,
            },
          });
          await this.handleVoiceSpeechStart();
        },
        onSpeechStopped: async () => {
          this.handleVoiceSpeechStopped();
          this.setPhase("transcribing");
          this.emit({
            type: "activity_log",
            payload: {
              id: uuidv4(),
              timestamp: new Date(),
              type: "system",
              content: "Transcribing audio...",
            },
          });
        },
        onFinalTranscript: async ({
          transcript,
          language,
          durationMs,
          avgLogprob,
          isLowConfidence,
        }) => {
          const requestId = uuidv4();
          const transcriptText = isLowConfidence ? "" : transcript.trim();
          if (isLowConfidence) {
            this.sessionLogger.debug(
              { text: transcript, avgLogprob },
              "Filtered low-confidence transcription (likely non-speech)",
            );
          }
          this.sessionLogger.info(
            {
              requestId,
              isVoiceMode: this.isVoiceMode,
              transcriptLength: transcriptText.length,
              transcript: transcriptText,
            },
            "Transcription result",
          );
          await this.handleTranscriptionResultPayload({
            text: transcriptText,
            requestId,
            ...(language ? { language } : {}),
            duration: durationMs,
            ...(avgLogprob !== undefined ? { avgLogprob } : {}),
            ...(isLowConfidence !== undefined ? { isLowConfidence } : {}),
          });
        },
        onError: (error) => {
          this.sessionLogger.error({ err: error }, "Voice turn controller failed");
        },
      },
    });

    this.sessionLogger.info("startVoiceTurnController connecting controller");
    await controller.start();
    this.voiceTurnController = controller;
    this.sessionLogger.info("startVoiceTurnController connected");
  }

  private async stopVoiceTurnController(): Promise<void> {
    if (!this.voiceTurnController) {
      return;
    }

    const controller = this.voiceTurnController;
    this.voiceTurnController = null;
    await controller.stop();
  }

  private handleVoiceSpeechStopped(): void {
    this.sessionLogger.info("voice_input_state emitting isSpeaking=false");
    this.emit({
      type: "voice_input_state",
      payload: {
        isSpeaking: false,
      },
    });
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
      this.handleAgentRunError(agentId, error, "Failed to send agent message");
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Handle create agent request
   */
  private async handleCreateAgentRequest(
    msg: Extract<SessionInboundMessage, { type: "create_agent_request" }>,
  ): Promise<void> {
    const {
      config,
      worktreeName,
      requestId,
      initialPrompt,
      clientMessageId,
      outputSchema,
      git,
      worktree,
      autoArchive,
      images,
      attachments,
      labels,
      relationKind,
      env,
    } = msg;
    this.sessionLogger.info(
      { cwd: config.cwd, provider: config.provider, worktreeName },
      `Creating agent in ${config.cwd} (${config.provider})${
        worktreeName ? ` with worktree ${worktreeName}` : ""
      }`,
    );

    let createdWorktreeForCleanup: CreateChisaCodeWorktreeWorkflowResult | null = null;
    let createdAgentId: string | null = null;
    try {
      const trimmedPrompt = initialPrompt?.trim();
      const { explicitTitle, provisionalTitle } = resolveCreateAgentTitles({
        configTitle: config.title,
        initialPrompt: trimmedPrompt,
      });

      const firstAgentContext: FirstAgentContext = {
        ...(trimmedPrompt ? { prompt: trimmedPrompt } : {}),
        ...(attachments && attachments.length > 0 ? { attachments } : {}),
      };
      const createdWorktree = await this.createAgentLifecycleDispatch.createWorktreeForRequest({
        cwd: config.cwd,
        target: worktree,
        firstAgentContext,
        hasLegacyGitOptions: Boolean(git),
      });
      createdWorktreeForCleanup = createdWorktree;
      const createAgentConfig: AgentSessionConfig = createdWorktree
        ? { ...config, cwd: createdWorktree.worktree.worktreePath }
        : config;

      const { snapshot, liveSnapshot } = await createAgentCommand(
        {
          agentManager: this.agentManager,
          agentStorage: this.agentStorage,
          logger: this.sessionLogger,
          chisacodeHome: this.chisacodeHome,
          workspaceGitService: this.workspaceGitService,
          providerSnapshotManager: this.providerSnapshotManager,
          daemonConfig: this.readStructuredGenerationDaemonConfig(),
        },
        {
          kind: "session",
          config: createAgentConfig,
          workspaceId: msg.workspaceId,
          worktreeName,
          initialPrompt,
          clientMessageId,
          outputSchema,
          images,
          attachments,
          git,
          labels,
          relationKind,
          env,
          provisionalTitle,
          explicitTitle,
          firstAgentContext,
          buildSessionConfig: (sessionConfig, gitOptions, legacyWorktreeName, ctx) =>
            this.buildAgentSessionConfig(sessionConfig, gitOptions, legacyWorktreeName, ctx),
          resolveWorkspace: ({ cwd, workspaceId }) =>
            this.resolveCreateAgentWorkspace(cwd, workspaceId),
        },
      );
      createdAgentId = snapshot.id;
      await this.forwardAgentUpdate(snapshot);
      this.createAgentLifecycleDispatch.registerAutoArchiveIfRequested({
        autoArchive,
        agentId: snapshot.id,
        createdWorktree,
      });

      if (requestId) {
        const agentPayload = await this.buildAgentPayload(liveSnapshot);
        this.emit({
          type: "status",
          payload: {
            status: "agent_created",
            agentId: liveSnapshot.id,
            requestId,
            agent: agentPayload,
          },
        });
      }

      this.sessionLogger.info(
        { agentId: snapshot.id, provider: snapshot.provider },
        `Created agent ${snapshot.id} (${snapshot.provider})`,
      );
    } catch (error) {
      await this.createAgentLifecycleDispatch.cleanupCreatedWorktreeAfterFailedAgentCreate({
        createdWorktree: createdWorktreeForCleanup,
        createdAgentId,
      });
      const wireError = toWorktreeWireError(error);
      this.sessionLogger.error({ err: error }, "Failed to create agent");
      if (requestId) {
        this.emit({
          type: "status",
          payload: {
            status: "agent_create_failed",
            requestId,
            error: wireError.message,
            errorCode: wireError.code,
          },
        });
      }
      this.emit({
        type: "activity_log",
        payload: {
          id: uuidv4(),
          timestamp: new Date(),
          type: "error",
          content: `Failed to create agent: ${wireError.message}`,
        },
      });
    }
  }

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

  private async handleResumeAgentRequest(
    msg: Extract<SessionInboundMessage, { type: "resume_agent_request" }>,
  ): Promise<void> {
    const { handle, overrides, requestId } = msg;
    if (!handle) {
      this.sessionLogger.warn("Resume request missing persistence handle");
      if (requestId) {
        this.emit({
          type: "rpc_error",
          payload: {
            requestId,
            requestType: msg.type,
            error: "Unable to resume agent: missing persistence handle",
            code: "agent_resume_failed",
          },
        });
      }
      this.emit({
        type: "activity_log",
        payload: {
          id: uuidv4(),
          timestamp: new Date(),
          type: "error",
          content: "Unable to resume agent: missing persistence handle",
        },
      });
      return;
    }
    this.sessionLogger.info(
      { sessionId: handle.sessionId, provider: handle.provider },
      `Resuming agent ${handle.sessionId} (${handle.provider})`,
    );
    try {
      await this.unarchiveAgentByHandle(handle);
      const snapshot = await this.agentManager.resumeAgentFromPersistence(handle, overrides);
      await unarchiveAgentState(this.agentStorage, this.agentManager, snapshot.id);
      await this.agentManager.hydrateTimelineFromProvider(snapshot.id);
      await this.forwardAgentUpdate(snapshot);
      const timelineSize = this.agentManager.getTimeline(snapshot.id).length;
      if (requestId) {
        const agentPayload = await this.buildAgentPayload(snapshot);
        this.emit({
          type: "status",
          payload: {
            status: "agent_resumed",
            agentId: snapshot.id,
            requestId,
            timelineSize,
            agent: agentPayload,
          },
        });
      }
    } catch (error) {
      const message = getErrorMessage(error);
      this.sessionLogger.error({ err: error }, "Failed to resume agent");
      if (requestId) {
        this.emit({
          type: "rpc_error",
          payload: {
            requestId,
            requestType: msg.type,
            error: message,
            code: "agent_resume_failed",
          },
        });
      }
      this.emit({
        type: "activity_log",
        payload: {
          id: uuidv4(),
          timestamp: new Date(),
          type: "error",
          content: `Failed to resume agent: ${message}`,
        },
      });
    }
  }

  private async handleImportAgentRequest(
    msg: Extract<SessionInboundMessage, { type: "import_agent_request" }>,
  ): Promise<void> {
    const normalized = normalizeImportAgentRequest(msg);
    if ("error" in normalized) {
      this.emit({
        type: "status",
        payload: {
          status: "agent_create_failed",
          requestId: msg.requestId,
          error: normalized.error,
        },
      });
      return;
    }
    const { provider, providerHandleId, requestId } = normalized;
    this.sessionLogger.info(
      { providerHandleId, provider },
      `Importing agent ${providerHandleId} (${provider})`,
    );

    try {
      const { snapshot, timelineSize } = await importProviderSession({
        request: normalized,
        agentManager: this.agentManager,
        agentStorage: this.agentStorage,
        workspaceGitService: this.workspaceGitService,
        providerSnapshotManager: this.providerSnapshotManager,
        daemonConfig: this.readStructuredGenerationDaemonConfig(),
        chisacodeHome: this.chisacodeHome,
        logger: this.sessionLogger,
      });
      await this.registerWorkspaceForImportedAgent(snapshot.cwd);
      await this.forwardAgentUpdate(snapshot);
      const agentPayload = await this.buildAgentPayload(snapshot);
      this.emit({
        type: "status",
        payload: {
          status: "agent_resumed",
          agentId: snapshot.id,
          requestId,
          timelineSize,
          agent: agentPayload,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.sessionLogger.error({ err: error }, "Failed to import agent");
      this.emit({
        type: "status",
        payload: {
          status: "agent_create_failed",
          requestId,
          error: message,
        },
      });
      this.emit({
        type: "activity_log",
        payload: {
          id: uuidv4(),
          timestamp: new Date(),
          type: "error",
          content: `Failed to import agent: ${message}`,
        },
      });
    }
  }

  private async handleRefreshAgentRequest(
    msg: Extract<SessionInboundMessage, { type: "refresh_agent_request" }>,
  ): Promise<void> {
    const { agentId, requestId } = msg;
    this.sessionLogger.info({ agentId }, `Refreshing agent ${agentId} from persistence`);

    try {
      await unarchiveAgentState(this.agentStorage, this.agentManager, agentId);
      let snapshot: ManagedAgent;
      const existing = this.agentManager.getAgent(agentId);
      if (existing) {
        await this.interruptAgentIfRunning(agentId);
        snapshot = await this.agentManager.reloadAgentSession(agentId, undefined, {
          rehydrateFromDisk: true,
        });
      } else {
        const record = await this.agentStorage.get(agentId);
        if (!record) {
          throw new Error(`Agent not found: ${agentId}`);
        }
        const registeredProviderIds = this.providerSnapshotManager.listRegisteredProviderIds();
        if (!isStoredAgentProviderAvailable(record, registeredProviderIds)) {
          throw new Error(`Agent ${agentId} references unavailable provider '${record.provider}'`);
        }
        const handle = toAgentPersistenceHandle(registeredProviderIds, record.persistence);
        if (!handle) {
          throw new Error(`Agent ${agentId} cannot be refreshed because it lacks persistence`);
        }
        snapshot = await this.agentManager.resumeAgentFromPersistence(
          handle,
          buildConfigOverrides(record),
          agentId,
          extractTimestamps(record),
        );
      }
      await this.agentManager.hydrateTimelineFromProvider(agentId);
      await this.forwardAgentUpdate(snapshot);
      const timelineSize = this.agentManager.getTimeline(agentId).length;
      if (requestId) {
        this.emit({
          type: "status",
          payload: {
            status: "agent_refreshed",
            agentId,
            requestId,
            timelineSize,
          },
        });
      }
    } catch (error) {
      const message = getErrorMessage(error);
      this.sessionLogger.error({ err: error, agentId }, `Failed to refresh agent ${agentId}`);
      if (requestId) {
        this.emit({
          type: "rpc_error",
          payload: {
            requestId,
            requestType: msg.type,
            error: message,
            code: "agent_refresh_failed",
          },
        });
      }
      this.emit({
        type: "activity_log",
        payload: {
          id: uuidv4(),
          timestamp: new Date(),
          type: "error",
          content: `Failed to refresh agent: ${message}`,
        },
      });
    }
  }

  private async handleCancelAgentRequest(agentId: string, requestId?: string): Promise<void> {
    this.sessionLogger.info({ agentId }, `Cancel request received for agent ${agentId}`);

    try {
      await cancelAgentRunCommand(
        { agentManager: this.agentManager, logger: this.sessionLogger },
        agentId,
      );
      if (requestId) {
        const agent = this.agentManager.getAgent(agentId);
        const payload = agent ? await this.buildAgentPayload(agent) : null;
        this.emit({
          type: "cancel_agent_response",
          payload: {
            requestId,
            agentId,
            agent: payload,
          },
        });
      }
    } catch (error) {
      this.handleAgentRunError(agentId, error, "Failed to cancel running agent on request");
    }
  }

  private async handleAgentRewindRequest(
    msg: Extract<SessionInboundMessage, { type: "agent.rewind.request" }>,
  ): Promise<void> {
    try {
      await this.agentManager.rewind(msg.agentId, msg.messageId, msg.mode);
      this.emit({
        type: "agent.rewind.response",
        payload: {
          requestId: msg.requestId,
          agentId: msg.agentId,
          ok: true,
          error: null,
        },
      });
    } catch (error) {
      this.emit({
        type: "agent.rewind.response",
        payload: {
          requestId: msg.requestId,
          agentId: msg.agentId,
          ok: false,
          error: error instanceof Error ? error.message : "Failed to rewind agent",
        },
      });
    }
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
        checkoutExistingBranch: (cwd, branch) => this.checkoutExistingBranch(cwd, branch),
        createBranchFromBase: (params) => this.createBranchFromBase(params),
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
      void this.maybeAutoNameWorkspaceBranchForFirstAgent(input).catch((error) => {
        this.sessionLogger.warn(
          { err: error, cwd: input.workspace.cwd },
          "Failed to auto-name worktree branch",
        );
      });
    }, 0);
  }

  private async maybeAutoNameWorkspaceBranchForFirstAgent(input: {
    workspace: PersistedWorkspaceRecord;
    firstAgentContext: FirstAgentContext;
  }): Promise<PersistedWorkspaceRecord> {
    const result = await attemptFirstAgentBranchAutoName({
      cwd: input.workspace.cwd,
      firstAgentContext: input.firstAgentContext,
      generateBranchNameFromContext: ({ cwd, firstAgentContext }) => {
        return generateBranchNameFromFirstAgentContext({
          agentManager: this.agentManager,
          cwd,
          workspaceGitService: this.workspaceGitService,
          providerSnapshotManager: this.providerSnapshotManager,
          daemonConfig: this.readStructuredGenerationDaemonConfig(),
          currentSelection: this.getFocusedAgentSelectionForCwd(cwd),
          firstAgentContext,
          logger: this.sessionLogger,
        });
      },
    });
    if (!result.renamed || !result.branchName) {
      return input.workspace;
    }

    const updatedWorkspace: PersistedWorkspaceRecord = {
      ...input.workspace,
      displayName: result.branchName,
      updatedAt: new Date().toISOString(),
    };
    await this.workspaceRegistry.upsert(updatedWorkspace);
    await this.notifyGitMutation(input.workspace.cwd, "rename-branch");
    await this.emitWorkspaceUpdateForCwd(input.workspace.cwd);
    return updatedWorkspace;
  }

  private emitProviderDisabledResponse(
    kind: "models" | "modes",
    provider: AgentProvider,
    requestId: string,
    fetchedAt: string,
  ): void {
    const payload = {
      provider,
      error: `Provider ${provider} is disabled`,
      fetchedAt,
      requestId,
    };
    if (kind === "models") {
      this.emit({ type: "list_provider_models_response", payload });
    } else {
      this.emit({ type: "list_provider_modes_response", payload });
    }
  }

  private async handleListProviderModelsRequest(
    msg: Extract<SessionInboundMessage, { type: "list_provider_models_request" }>,
  ): Promise<void> {
    const cwd = resolveSnapshotCwd(msg.cwd ? expandTilde(msg.cwd) : undefined);
    const fetchedAt = new Date().toISOString();

    const entry = await this.getProviderSnapshotEntryForRead(cwd, msg.provider);

    if (!entry) {
      this.emit({
        type: "list_provider_models_response",
        payload: {
          provider: msg.provider,
          error: `Unknown provider: ${msg.provider}`,
          fetchedAt,
          requestId: msg.requestId,
        },
      });
      return;
    }

    if (!entry.enabled) {
      this.emitProviderDisabledResponse("models", msg.provider, msg.requestId, fetchedAt);
      return;
    }

    if (entry.status === "ready") {
      this.emit({
        type: "list_provider_models_response",
        payload: {
          provider: msg.provider,
          models: entry.models ?? [],
          error: null,
          fetchedAt: entry.fetchedAt ?? fetchedAt,
          requestId: msg.requestId,
        },
      });
      return;
    }

    const errorMessage =
      entry.status === "error"
        ? (entry.error ?? `Failed to list models for ${msg.provider}`)
        : `Provider ${msg.provider} is not available`;

    this.emit({
      type: "list_provider_models_response",
      payload: {
        provider: msg.provider,
        error: errorMessage,
        fetchedAt,
        requestId: msg.requestId,
      },
    });
  }

  private async handleListProviderModesRequest(
    msg: Extract<SessionInboundMessage, { type: "list_provider_modes_request" }>,
  ): Promise<void> {
    const fetchedAt = new Date().toISOString();
    const cwd = resolveSnapshotCwd(msg.cwd ? expandTilde(msg.cwd) : undefined);
    const entry = await this.getProviderSnapshotEntryForRead(cwd, msg.provider);

    if (!entry) {
      this.emit({
        type: "list_provider_modes_response",
        payload: {
          provider: msg.provider,
          error: `Unknown provider: ${msg.provider}`,
          fetchedAt,
          requestId: msg.requestId,
        },
      });
      return;
    }

    if (!entry.enabled) {
      this.emitProviderDisabledResponse("modes", msg.provider, msg.requestId, fetchedAt);
      return;
    }

    if (entry.status === "ready") {
      this.emit({
        type: "list_provider_modes_response",
        payload: {
          provider: msg.provider,
          modes: this.downgradeModeIconsForClient(entry.modes ?? []),
          error: null,
          fetchedAt: entry.fetchedAt ?? fetchedAt,
          requestId: msg.requestId,
        },
      });
      return;
    }

    const errorMessage =
      entry.status === "error"
        ? (entry.error ?? `Failed to list modes for ${msg.provider}`)
        : `Provider ${msg.provider} is not available`;

    this.emit({
      type: "list_provider_modes_response",
      payload: {
        provider: msg.provider,
        error: errorMessage,
        fetchedAt,
        requestId: msg.requestId,
      },
    });
  }

  private async getProviderSnapshotEntryForRead(
    cwd: string,
    provider: AgentProvider,
  ): Promise<ProviderSnapshotEntry | undefined> {
    const manager = this.providerSnapshotManager;
    const findEntry = () =>
      manager.getSnapshot(cwd).find((candidate) => candidate.provider === provider);

    let entry = findEntry();
    if (entry && !entry.enabled) {
      return entry;
    }
    if (!entry || entry.status === "loading") {
      // Awaits the in-flight warmup (deduped per-cwd) so old clients still get
      // a resolved answer rather than a loading placeholder.
      await manager.warmUpSnapshotForCwd({ cwd, providers: [provider] });
      entry = findEntry();
    }
    return entry;
  }

  private buildDraftAgentSessionConfig(draftConfig: {
    provider: AgentProvider;
    cwd: string;
    modeId?: string;
    model?: string;
    thinkingOptionId?: string;
    featureValues?: Record<string, unknown>;
  }): AgentSessionConfig {
    return {
      provider: draftConfig.provider,
      cwd: expandTilde(draftConfig.cwd),
      ...(draftConfig.modeId ? { modeId: draftConfig.modeId } : {}),
      ...(draftConfig.model ? { model: draftConfig.model } : {}),
      ...(draftConfig.thinkingOptionId ? { thinkingOptionId: draftConfig.thinkingOptionId } : {}),
      ...(draftConfig.featureValues ? { featureValues: draftConfig.featureValues } : {}),
    };
  }

  private async handleListProviderFeaturesRequest(
    msg: Extract<SessionInboundMessage, { type: "list_provider_features_request" }>,
  ): Promise<void> {
    const fetchedAt = new Date().toISOString();
    try {
      const sessionConfig = this.buildDraftAgentSessionConfig(msg.draftConfig);
      const features = await this.agentManager.listDraftFeatures(sessionConfig);
      this.emit({
        type: "list_provider_features_response",
        payload: {
          provider: msg.draftConfig.provider,
          features,
          error: null,
          fetchedAt,
          requestId: msg.requestId,
        },
      });
    } catch (error) {
      this.sessionLogger.error(
        { err: error, provider: msg.draftConfig.provider, draftConfig: msg.draftConfig },
        `Failed to list features for ${msg.draftConfig.provider}`,
      );
      this.emit({
        type: "list_provider_features_response",
        payload: {
          provider: msg.draftConfig.provider,
          error: getErrorMessage(error),
          fetchedAt,
          requestId: msg.requestId,
        },
      });
    }
  }

  private async handleDaemonGetStatusRequest(
    msg: Extract<SessionInboundMessage, { type: "daemon.get_status.request" }>,
  ): Promise<void> {
    try {
      const pidInfo = await getPidLockInfo(this.chisacodeHome);
      const providers = (await this.agentManager.listProviderAvailability()).map((p) => ({
        provider: p.provider,
        available: p.available,
        error: p.error ?? null,
      }));
      this.emit({
        type: "daemon.get_status.response",
        payload: {
          requestId: msg.requestId,
          serverId: this.serverId ?? "",
          version: this.daemonVersion ?? null,
          pid: process.pid,
          nodePath: process.execPath,
          startedAt: pidInfo?.startedAt ?? null,
          listen: this.daemonRuntimeConfig?.listen ?? null,
          relay: this.daemonRuntimeConfig?.relay ?? null,
          providers,
        },
      });
    } catch (error) {
      this.sessionLogger.error({ err: error }, "Failed to handle daemon status request");
      this.emit({
        type: "daemon.get_status.response",
        payload: {
          requestId: msg.requestId,
          serverId: this.serverId ?? "",
          version: this.daemonVersion ?? null,
          pid: process.pid,
          nodePath: process.execPath,
          startedAt: null,
          listen: null,
          relay: null,
          providers: [],
        },
      });
    }
  }

  private async handleDaemonGetPairingOfferRequest(
    msg: Extract<SessionInboundMessage, { type: "daemon.get_pairing_offer.request" }>,
  ): Promise<void> {
    try {
      const relay = this.daemonRuntimeConfig?.relay;
      const pairing = await generateLocalPairingOffer({
        chisacodeHome: this.chisacodeHome,
        relayEnabled: relay?.enabled ?? true,
        relayEndpoint: relay?.endpoint,
        relayPublicEndpoint: relay?.publicEndpoint,
        relayUseTls: relay?.useTls,
        relayPublicUseTls: relay?.publicUseTls,
        includeQr: true,
        logger: this.sessionLogger,
      });
      this.emit({
        type: "daemon.get_pairing_offer.response",
        payload: {
          requestId: msg.requestId,
          url: pairing.url ?? "",
          qr: pairing.qr ?? null,
          relayEnabled: pairing.relayEnabled,
        },
      });
    } catch (error) {
      this.sessionLogger.error({ err: error }, "Failed to handle daemon pairing offer request");
      this.emit({
        type: "rpc_error",
        payload: {
          requestId: msg.requestId,
          requestType: "daemon.get_pairing_offer.request",
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  private async handleListAvailableProvidersRequest(
    msg: Extract<SessionInboundMessage, { type: "list_available_providers_request" }>,
  ): Promise<void> {
    const fetchedAt = new Date().toISOString();
    try {
      const providers = (await this.agentManager.listProviderAvailability()).filter((provider) =>
        this.isProviderVisibleToClient(provider.provider),
      );
      this.emit({
        type: "list_available_providers_response",
        payload: {
          providers,
          error: null,
          fetchedAt,
          requestId: msg.requestId,
        },
      });
    } catch (error) {
      this.sessionLogger.error({ err: error }, "Failed to list provider availability");
      this.emit({
        type: "list_available_providers_response",
        payload: {
          providers: [],
          error: getErrorMessage(error),
          fetchedAt,
          requestId: msg.requestId,
        },
      });
    }
  }

  private async handleGetProvidersSnapshotRequest(
    msg: Extract<SessionInboundMessage, { type: "get_providers_snapshot_request" }>,
  ): Promise<void> {
    // COMPAT(providersSnapshot): keep legacy provider-list RPCs alongside snapshot flow.
    const entries = this.providerSnapshotManager
      .getSnapshot(msg.cwd ? expandTilde(msg.cwd) : undefined)
      .filter((entry) => this.isProviderVisibleToClient(entry.provider));

    this.emit({
      type: "get_providers_snapshot_response",
      payload: {
        entries: this.downgradeEntryModesForClient(entries),
        generatedAt: new Date().toISOString(),
        requestId: msg.requestId,
      },
    });
  }

  private async handleRefreshProvidersSnapshotRequest(
    msg: Extract<SessionInboundMessage, { type: "refresh_providers_snapshot_request" }>,
  ): Promise<void> {
    if (msg.cwd) {
      await this.providerSnapshotManager.refreshSnapshotForCwd({
        cwd: expandTilde(msg.cwd),
        providers: msg.providers,
      });
    } else {
      await this.providerSnapshotManager.refreshSettingsSnapshot({
        providers: msg.providers,
      });
    }
    this.emit({
      type: "refresh_providers_snapshot_response",
      payload: {
        acknowledged: true,
        requestId: msg.requestId,
      },
    });
  }

  private async handleProviderDiagnosticRequest(
    msg: Extract<SessionInboundMessage, { type: "provider_diagnostic_request" }>,
  ): Promise<void> {
    try {
      const { diagnostic, details } = await this.providerSnapshotManager.getProviderDiagnostic(
        msg.provider,
      );
      this.emit({
        type: "provider_diagnostic_response",
        payload: {
          provider: msg.provider,
          diagnostic,
          details,
          requestId: msg.requestId,
        },
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.sessionLogger.error(
        { err, provider: msg.provider },
        `Failed to get provider diagnostic for ${msg.provider}`,
      );
      this.emit({
        type: "rpc_error",
        payload: {
          requestId: msg.requestId,
          requestType: msg.type,
          error: `Failed to get provider diagnostic: ${err.message}`,
          code: "provider_diagnostic_failed",
        },
      });
    }
  }

  private async handleProviderToolingActionRequest(
    msg: Extract<SessionInboundMessage, { type: "provider.tooling.run.request" }>,
  ): Promise<void> {
    try {
      const result = await this.providerSnapshotManager.runProviderToolingAction(
        msg.provider,
        msg.action,
      );
      this.emit({
        type: "provider.tooling.run.response",
        payload: {
          ...result,
          requestId: msg.requestId,
        },
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.sessionLogger.error(
        { err, provider: msg.provider, action: msg.action },
        `Failed to run provider tooling action for ${msg.provider}`,
      );
      this.emit({
        type: "rpc_error",
        payload: {
          requestId: msg.requestId,
          requestType: msg.type,
          error: `Failed to ${msg.action} provider: ${err.message}`,
          code: "provider_tooling_action_failed",
        },
      });
    }
  }

  private async handleAgentPresetsListRequest(
    msg: Extract<SessionInboundMessage, { type: "agent.presets.list.request" }>,
  ): Promise<void> {
    try {
      const presets = await this.agentPresetStore.list();
      this.emit({
        type: "agent.presets.list.response",
        payload: {
          presets,
          requestId: msg.requestId,
        },
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.sessionLogger.error({ err }, "Failed to list agent presets");
      this.emit({
        type: "rpc_error",
        payload: {
          requestId: msg.requestId,
          requestType: msg.type,
          error: `Failed to list agent presets: ${err.message}`,
          code: "agent_presets_list_failed",
        },
      });
    }
  }

  private async handleModelGatewayMoaTestRequest(
    msg: Extract<SessionInboundMessage, { type: "model_gateway.moa.test.request" }>,
  ): Promise<void> {
    const gateway = this.daemonConfigStore.get().modelGateways[msg.gatewayId];
    if (!gateway || gateway.enabled === false) {
      this.emit({
        type: "model_gateway.moa.test.response",
        payload: {
          requestId: msg.requestId,
          gatewayId: msg.gatewayId,
          result: null,
          error: "Unknown model gateway",
        },
      });
      return;
    }

    try {
      const result = await runSyntheticModelTest({
        gateway,
        syntheticModel: msg.syntheticModel,
        prompt: msg.prompt,
      });
      this.emit({
        type: "model_gateway.moa.test.response",
        payload: {
          requestId: msg.requestId,
          gatewayId: msg.gatewayId,
          result,
          error: null,
        },
      });
    } catch (error) {
      this.emit({
        type: "model_gateway.moa.test.response",
        payload: {
          requestId: msg.requestId,
          gatewayId: msg.gatewayId,
          result: null,
          error: getErrorMessage(error),
        },
      });
    }
  }

  private assertSafeGitRef(ref: string, label: string): void {
    if (!/^[A-Za-z0-9._/-]+$/.test(ref)) {
      throw new Error(`Invalid ${label}: ${ref}`);
    }
    assertWorktreeSafeGitRef(ref, label);
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

  private async ensureCleanWorkingTree(cwd: string): Promise<void> {
    const dirty = await this.isWorkingTreeDirty(cwd);
    if (dirty) {
      throw new Error(
        "Working directory has uncommitted changes. Commit or stash before switching branches.",
      );
    }
  }

  private async isWorkingTreeDirty(cwd: string): Promise<boolean> {
    try {
      const snapshot = await this.workspaceGitService.getSnapshot(cwd);
      return snapshot.git.isDirty === true;
    } catch (error) {
      throw new Error(`Unable to inspect git status for ${cwd}: ${getErrorMessage(error)}`, {
        cause: error,
      });
    }
  }

  private async checkoutExistingBranch(
    cwd: string,
    branch: string,
  ): Promise<CheckoutExistingBranchResult> {
    this.assertSafeGitRef(branch, "branch");
    const resolution = await this.workspaceGitService.validateBranchRef(cwd, branch);
    if (resolution.kind === "not-found") {
      throw new Error(`Branch not found: ${branch}`);
    }
    await this.ensureCleanWorkingTree(cwd);
    const result = await checkoutResolvedBranch({
      cwd,
      resolution,
    });
    await this.notifyGitMutation(cwd, "switch-branch", { invalidateGithub: true });
    return result;
  }

  private async createBranchFromBase(params: {
    cwd: string;
    baseBranch: string;
    newBranchName: string;
  }): Promise<void> {
    const { cwd, baseBranch, newBranchName } = params;
    this.assertSafeGitRef(baseBranch, "base branch");
    this.assertSafeGitRef(newBranchName, "new branch");

    const baseResolution = await this.workspaceGitService.validateBranchRef(cwd, baseBranch);
    if (baseResolution.kind === "not-found") {
      throw new Error(`Base branch not found: ${baseBranch}`);
    }

    const exists = await this.doesLocalBranchExist(cwd, newBranchName);
    if (exists) {
      throw new Error(`Branch already exists: ${newBranchName}`);
    }

    await this.ensureCleanWorkingTree(cwd);
    await execCommand("git", ["checkout", "-b", newBranchName, baseBranch], {
      cwd,
    });
    await this.notifyGitMutation(cwd, "create-branch");
  }

  private async doesLocalBranchExist(cwd: string, branch: string): Promise<boolean> {
    this.assertSafeGitRef(branch, "branch");
    return this.workspaceGitService.hasLocalBranch(cwd, branch);
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
   * Handle set agent mode request
   */
  private async handleSetAgentModeRequest(
    agentId: string,
    modeId: string,
    requestId: string,
  ): Promise<void> {
    this.sessionLogger.info({ agentId, modeId, requestId }, "session: set_agent_mode_request");

    try {
      await setAgentModeCommand({ agentManager: this.agentManager }, { agentId, modeId });
      this.sessionLogger.info(
        { agentId, modeId, requestId },
        "session: set_agent_mode_request success",
      );
      this.emit({
        type: "set_agent_mode_response",
        payload: { requestId, agentId, accepted: true, error: null },
      });
    } catch (error) {
      this.sessionLogger.error(
        { err: error, agentId, modeId, requestId },
        "session: set_agent_mode_request error",
      );
      this.emit({
        type: "activity_log",
        payload: {
          id: uuidv4(),
          timestamp: new Date(),
          type: "error",
          content: `Failed to set agent mode: ${getErrorMessage(error)}`,
        },
      });
      this.emit({
        type: "set_agent_mode_response",
        payload: {
          requestId,
          agentId,
          accepted: false,
          error: getErrorMessageOr(error, "Failed to set agent mode"),
        },
      });
    }
  }

  private async handleSetAgentModelRequest(
    agentId: string,
    modelId: string | null,
    requestId: string,
    runtimeProvider?: string | null,
  ): Promise<void> {
    this.sessionLogger.info(
      { agentId, modelId, runtimeProvider, requestId },
      "session: set_agent_model_request",
    );

    try {
      await this.agentManager.setAgentModel(agentId, modelId, { runtimeProvider });
      this.sessionLogger.info(
        { agentId, modelId, runtimeProvider, requestId },
        "session: set_agent_model_request success",
      );
      this.emit({
        type: "set_agent_model_response",
        payload: { requestId, agentId, accepted: true, error: null },
      });
    } catch (error) {
      this.sessionLogger.error(
        { err: error, agentId, modelId, runtimeProvider, requestId },
        "session: set_agent_model_request error",
      );
      this.emit({
        type: "activity_log",
        payload: {
          id: uuidv4(),
          timestamp: new Date(),
          type: "error",
          content: `Failed to set agent model: ${getErrorMessage(error)}`,
        },
      });
      this.emit({
        type: "set_agent_model_response",
        payload: {
          requestId,
          agentId,
          accepted: false,
          error: getErrorMessageOr(error, "Failed to set agent model"),
        },
      });
    }
  }

  private async handleSetAgentFeatureRequest(
    agentId: string,
    featureId: string,
    value: unknown,
    requestId: string,
  ): Promise<void> {
    this.sessionLogger.info(
      { agentId, featureId, value, requestId },
      "session: set_agent_feature_request",
    );

    try {
      await this.agentManager.setAgentFeature(agentId, featureId, value);
      this.sessionLogger.info(
        { agentId, featureId, value, requestId },
        "session: set_agent_feature_request success",
      );
      this.emit({
        type: "set_agent_feature_response",
        payload: { requestId, agentId, accepted: true, error: null },
      });
    } catch (error) {
      this.sessionLogger.error(
        { err: error, agentId, featureId, value, requestId },
        "session: set_agent_feature_request error",
      );
      this.emit({
        type: "activity_log",
        payload: {
          id: uuidv4(),
          timestamp: new Date(),
          type: "error",
          content: `Failed to set agent feature: ${getErrorMessage(error)}`,
        },
      });
      this.emit({
        type: "set_agent_feature_response",
        payload: {
          requestId,
          agentId,
          accepted: false,
          error: getErrorMessageOr(error, "Failed to set agent feature"),
        },
      });
    }
  }

  private async handleSetAgentThinkingRequest(
    agentId: string,
    thinkingOptionId: string | null,
    requestId: string,
  ): Promise<void> {
    this.sessionLogger.info(
      { agentId, thinkingOptionId, requestId },
      "session: set_agent_thinking_request",
    );

    try {
      await this.agentManager.setAgentThinkingOption(agentId, thinkingOptionId);
      this.sessionLogger.info(
        { agentId, thinkingOptionId, requestId },
        "session: set_agent_thinking_request success",
      );
      this.emit({
        type: "set_agent_thinking_response",
        payload: { requestId, agentId, accepted: true, error: null },
      });
    } catch (error) {
      this.sessionLogger.error(
        { err: error, agentId, thinkingOptionId, requestId },
        "session: set_agent_thinking_request error",
      );
      this.emit({
        type: "activity_log",
        payload: {
          id: uuidv4(),
          timestamp: new Date(),
          type: "error",
          content: `Failed to set agent thinking option: ${getErrorMessage(error)}`,
        },
      });
      this.emit({
        type: "set_agent_thinking_response",
        payload: {
          requestId,
          agentId,
          accepted: false,
          error: getErrorMessageOr(error, "Failed to set agent thinking option"),
        },
      });
    }
  }

  /**
   * Handle clearing agent attention flag
   */
  private async handleClearAgentAttention(
    agentId: string | string[],
    requestId?: string,
  ): Promise<void> {
    const agentIds = Array.isArray(agentId) ? agentId : [agentId];

    try {
      await Promise.all(agentIds.map((id) => this.agentManager.clearAgentAttention(id)));
      if (requestId) {
        const agents = (
          await Promise.all(
            agentIds.map(async (id) => {
              const agent = this.agentManager.getAgent(id);
              return agent ? this.buildAgentPayload(agent) : null;
            }),
          )
        ).filter((payload): payload is NonNullable<typeof payload> => payload !== null);
        this.emit({
          type: "clear_agent_attention_response",
          payload: {
            requestId,
            agentId,
            agents,
          },
        });
      }
    } catch (error) {
      this.sessionLogger.error({ err: error, agentIds }, "Failed to clear agent attention");
      // Don't throw - this is not critical
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
  private handleRegisterPushToken(token: string): void {
    this.pushTokenStore.addToken(token);
    this.sessionLogger.info("Registered push token");
  }

  private async handleAgentSkillsListRequest(requestId: string): Promise<void> {
    try {
      const config = this.daemonConfigStore.get();
      const agents = this.agentManager
        .listAgents()
        .filter((agent) => !agent.internal)
        .map((agent) => ({
          id: agent.id,
          provider: agent.config.provider,
          title: agent.config.title ?? null,
          lastStatus: agent.lifecycle,
          session: agent.session,
        }));
      const result = await listManagedSkills(agents, config);
      this.emit({
        type: "agent.skills.list.response",
        payload: {
          requestId,
          scopes: result.scopes,
          skills: result.skills,
          policy: config.skills,
          errors: result.errors,
        },
      });
    } catch (error) {
      this.emit({
        type: "agent.skills.list.response",
        payload: {
          requestId,
          scopes: [{ type: "global", label: "Global" }],
          skills: [],
          policy: this.daemonConfigStore.get().skills,
          errors: [getErrorMessage(error)],
        },
      });
    }
  }

  private async handleAgentSkillsPolicyPatchRequest(
    msg: AgentSkillsPolicyPatchRequest,
  ): Promise<void> {
    try {
      const current = this.daemonConfigStore.get();
      const nextSkills = {
        ...current.skills,
        global: { ...current.skills.global },
        providers: { ...current.skills.providers },
        agents: { ...current.skills.agents },
        installedSources: { ...current.skills.installedSources },
      };

      if (msg.scope.type === "global") {
        nextSkills.global = {
          ...nextSkills.global,
          disabledSkillNames: msg.policy.disabledSkillNames ?? nextSkills.global.disabledSkillNames,
        };
      } else if (msg.scope.type === "provider") {
        const existing = nextSkills.providers[msg.scope.provider] ?? {
          enabledSkillNames: [],
          disabledSkillNames: [],
        };
        nextSkills.providers[msg.scope.provider] = {
          ...existing,
          enabledSkillNames: msg.policy.enabledSkillNames ?? existing.enabledSkillNames,
          disabledSkillNames: msg.policy.disabledSkillNames ?? existing.disabledSkillNames,
        };
      } else {
        const existing = nextSkills.agents[msg.scope.agentId] ?? {
          enabledSkillNames: [],
          disabledSkillNames: [],
        };
        nextSkills.agents[msg.scope.agentId] = {
          ...existing,
          enabledSkillNames: msg.policy.enabledSkillNames ?? existing.enabledSkillNames,
          disabledSkillNames: msg.policy.disabledSkillNames ?? existing.disabledSkillNames,
        };
      }

      const next = this.daemonConfigStore.replace({ ...current, skills: nextSkills });
      this.emit({
        type: "agent.skills.policy.patch.response",
        payload: {
          requestId: msg.requestId,
          ok: true,
          policy: next.skills,
          error: null,
        },
      });
    } catch (error) {
      this.emit({
        type: "agent.skills.policy.patch.response",
        payload: {
          requestId: msg.requestId,
          ok: false,
          policy: this.daemonConfigStore.get().skills,
          error: getErrorMessage(error),
        },
      });
    }
  }

  private async handleAgentSkillsInstallRequest(msg: AgentSkillsInstallRequest): Promise<void> {
    try {
      const result =
        msg.source.type === "github"
          ? await installUserSkillsFromGitHub(msg.source.value, { replace: msg.replace })
          : await installUserSkillsFromLocalDirectory(expandTilde(msg.source.path), {
              replace: msg.replace,
            });
      const current = this.daemonConfigStore.get();
      const next = this.daemonConfigStore.replace({
        ...current,
        skills: {
          ...current.skills,
          installedSources: {
            ...current.skills.installedSources,
            [result.installedSource.id]: result.installedSource,
          },
        },
      });
      this.emit({
        type: "agent.skills.install.response",
        payload: {
          requestId: msg.requestId,
          ok: true,
          installedSource: next.skills.installedSources[result.installedSource.id] ?? null,
          skills: result.skillNames,
          error: null,
        },
      });
    } catch (error) {
      this.emit({
        type: "agent.skills.install.response",
        payload: {
          requestId: msg.requestId,
          ok: false,
          installedSource: null,
          skills: [],
          error: getErrorMessage(error),
        },
      });
    }
  }

  private async handleAgentSkillsUninstallRequest(msg: AgentSkillsUninstallRequest): Promise<void> {
    try {
      const current = this.daemonConfigStore.get();
      const source = current.skills.installedSources[msg.sourceId];
      if (!source) {
        throw new Error(`Installed skill source not found: ${msg.sourceId}`);
      }
      const removedSkillNames = await uninstallUserInstalledSkills(source.skillNames);
      const { [msg.sourceId]: _removed, ...installedSources } = current.skills.installedSources;
      const next = this.daemonConfigStore.replace({
        ...current,
        skills: {
          ...current.skills,
          installedSources,
        },
      });
      this.emit({
        type: "agent.skills.uninstall.response",
        payload: {
          requestId: msg.requestId,
          ok: true,
          removedSkillNames,
          policy: next.skills,
          error: null,
        },
      });
    } catch (error) {
      this.emit({
        type: "agent.skills.uninstall.response",
        payload: {
          requestId: msg.requestId,
          ok: false,
          removedSkillNames: [],
          policy: this.daemonConfigStore.get().skills,
          error: getErrorMessage(error),
        },
      });
    }
  }

  private async handleAgentMcpServersListRequest(requestId: string): Promise<void> {
    try {
      const config = this.daemonConfigStore.get();
      const agents = this.agentManager
        .listAgents()
        .filter((agent) => !agent.internal)
        .map((agent) => ({
          id: agent.id,
          provider: agent.config.provider,
          title: agent.config.title ?? null,
          lastStatus: agent.lifecycle,
        }));
      const result = listManagedMcpServers(agents, config, { mcpBaseUrl: this.mcpBaseUrl });
      this.emit({
        type: "agent.mcp_servers.list.response",
        payload: {
          requestId,
          scopes: result.scopes,
          servers: result.servers,
          policy: config.mcpServers,
          errors: result.errors,
        },
      });
    } catch (error) {
      this.emit({
        type: "agent.mcp_servers.list.response",
        payload: {
          requestId,
          scopes: [{ type: "global", label: "Global" }],
          servers: [],
          policy: this.daemonConfigStore.get().mcpServers,
          errors: [getErrorMessage(error)],
        },
      });
    }
  }

  private async handleAgentMcpServersUpsertRequest(
    msg: AgentMcpServersUpsertRequest,
  ): Promise<void> {
    try {
      const current = this.daemonConfigStore.get();
      const next = this.daemonConfigStore.replace(
        upsertManagedMcpServer(current, msg.server, msg.originalName),
      );
      const savedServer =
        next.mcpServers.servers[msg.server.name.trim()] ??
        Object.values(next.mcpServers.servers).find(
          (server) => server.name === msg.server.name.trim(),
        ) ??
        null;
      this.emit({
        type: "agent.mcp_servers.upsert.response",
        payload: {
          requestId: msg.requestId,
          ok: true,
          server: savedServer,
          policy: next.mcpServers,
          error: null,
        },
      });
    } catch (error) {
      this.emit({
        type: "agent.mcp_servers.upsert.response",
        payload: {
          requestId: msg.requestId,
          ok: false,
          server: null,
          policy: this.daemonConfigStore.get().mcpServers,
          error: getErrorMessage(error),
        },
      });
    }
  }

  private async handleAgentMcpServersPolicyPatchRequest(
    msg: AgentMcpServersPolicyPatchRequest,
  ): Promise<void> {
    try {
      const current = this.daemonConfigStore.get();
      const next = this.daemonConfigStore.replace(
        patchManagedMcpServerPolicy(current, msg.scope, msg.policy),
      );
      this.emit({
        type: "agent.mcp_servers.policy.patch.response",
        payload: {
          requestId: msg.requestId,
          ok: true,
          policy: next.mcpServers,
          error: null,
        },
      });
    } catch (error) {
      this.emit({
        type: "agent.mcp_servers.policy.patch.response",
        payload: {
          requestId: msg.requestId,
          ok: false,
          policy: this.daemonConfigStore.get().mcpServers,
          error: getErrorMessage(error),
        },
      });
    }
  }

  private async handleAgentMcpServersDeleteRequest(
    msg: AgentMcpServersDeleteRequest,
  ): Promise<void> {
    try {
      const current = this.daemonConfigStore.get();
      const next = this.daemonConfigStore.replace(deleteManagedMcpServer(current, msg.name));
      this.emit({
        type: "agent.mcp_servers.delete.response",
        payload: {
          requestId: msg.requestId,
          ok: true,
          removedServerName: msg.name,
          policy: next.mcpServers,
          error: null,
        },
      });
    } catch (error) {
      this.emit({
        type: "agent.mcp_servers.delete.response",
        payload: {
          requestId: msg.requestId,
          ok: false,
          removedServerName: null,
          policy: this.daemonConfigStore.get().mcpServers,
          error: getErrorMessage(error),
        },
      });
    }
  }

  /**
   * Handle list commands request for an agent
   */
  private async handleListCommandsRequest(
    msg: Extract<SessionInboundMessage, { type: "list_commands_request" }>,
  ): Promise<void> {
    const { agentId, requestId, draftConfig } = msg;
    this.sessionLogger.debug(
      { agentId, draftConfig },
      `Handling list commands request for agent ${agentId}`,
    );

    try {
      const agents = this.agentManager.listAgents();
      const agent = agents.find((a) => a.id === agentId);

      if (agent?.session?.listCommands) {
        const commands = await agent.session.listCommands();
        this.emit({
          type: "list_commands_response",
          payload: {
            agentId,
            commands,
            error: null,
            requestId,
          },
        });
        return;
      }

      if (!agent && draftConfig) {
        const sessionConfig: AgentSessionConfig = {
          provider: draftConfig.provider,
          cwd: expandTilde(draftConfig.cwd),
          ...(draftConfig.modeId ? { modeId: draftConfig.modeId } : {}),
          ...(draftConfig.model ? { model: draftConfig.model } : {}),
          ...(draftConfig.thinkingOptionId
            ? { thinkingOptionId: draftConfig.thinkingOptionId }
            : {}),
        };

        const commands = await this.agentManager.listDraftCommands(sessionConfig);
        this.emit({
          type: "list_commands_response",
          payload: {
            agentId,
            commands,
            error: null,
            requestId,
          },
        });
        return;
      }

      this.emit({
        type: "list_commands_response",
        payload: {
          agentId,
          commands: [],
          error: agent ? `Agent does not support listing commands` : `Agent not found: ${agentId}`,
          requestId,
        },
      });
    } catch (error) {
      this.sessionLogger.error({ err: error, agentId, draftConfig }, "Failed to list commands");
      this.emit({
        type: "list_commands_response",
        payload: {
          agentId,
          commands: [],
          error: getErrorMessage(error),
          requestId,
        },
      });
    }
  }

  /**
   * Handle agent permission response from user
   */
  private async handleAgentPermissionResponse(
    agentId: string,
    requestId: string,
    response: AgentPermissionResponse,
  ): Promise<void> {
    try {
      await respondToAgentPermission({
        agentManager: this.agentManager,
        agentId,
        requestId,
        response,
        logger: this.sessionLogger,
      });
    } catch (error) {
      this.sessionLogger.error(
        { err: error, agentId, requestId },
        "Failed to respond to permission",
      );
      this.emit({
        type: "activity_log",
        payload: {
          id: uuidv4(),
          timestamp: new Date(),
          type: "error",
          content: `Failed to respond to permission: ${getErrorMessage(error)}`,
        },
      });
      throw error;
    }
  }

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

  private async handleChisaCodeWorktreeListRequest(
    msg: Extract<SessionInboundMessage, { type: "chisacode_worktree_list_request" }>,
  ): Promise<void> {
    return handleWorktreeListRequest(
      {
        emit: (message) => this.emit(message),
        chisacodeHome: this.chisacodeHome,
        workspaceGitService: this.workspaceGitService,
      },
      msg,
    );
  }

  private async handleChisaCodeWorktreeArchiveRequest(
    msg: Extract<SessionInboundMessage, { type: "chisacode_worktree_archive_request" }>,
  ): Promise<void> {
    return handleWorktreeArchiveRequest(
      {
        chisacodeHome: this.chisacodeHome,
        github: this.github,
        workspaceGitService: this.workspaceGitService,
        agentManager: this.agentManager,
        agentStorage: this.agentStorage,
        archiveWorkspaceRecord: (workspaceId) => this.archiveWorkspaceRecord(workspaceId),
        emit: (message) => this.emit(message),
        emitWorkspaceUpdatesForWorkspaceIds: (workspaceIds) =>
          this.emitWorkspaceUpdatesForWorkspaceIds(workspaceIds),
        markWorkspaceArchiving: (workspaceIds, archivingAt) =>
          this.markWorkspaceArchiving(workspaceIds, archivingAt),
        clearWorkspaceArchiving: (workspaceIds) => this.clearWorkspaceArchiving(workspaceIds),
        isPathWithinRoot: (rootPath, candidatePath) =>
          this.isPathWithinRoot(rootPath, candidatePath),
        killTerminalsUnderPath: (rootPath) =>
          this.terminalController.killTerminalsUnderPath(rootPath),
        sessionLogger: this.sessionLogger,
      },
      msg,
    );
  }

  /**
   * Handle read-only file explorer requests scoped to a workspace cwd
   */
  private async handleFileExplorerRequest(request: FileExplorerRequest): Promise<void> {
    const { cwd: workspaceCwd, path: requestedPath = ".", mode, requestId } = request;
    const cwd = workspaceCwd.trim();
    if (!cwd) {
      this.emit({
        type: "file_explorer_response",
        payload: {
          cwd: workspaceCwd,
          path: requestedPath,
          mode,
          directory: null,
          file: null,
          error: "cwd is required",
          requestId,
        },
      });
      return;
    }

    try {
      if (mode === "list") {
        const directory = await listDirectoryEntries({
          root: cwd,
          relativePath: requestedPath,
        });

        this.emit({
          type: "file_explorer_response",
          payload: {
            cwd,
            path: directory.path,
            mode,
            directory,
            file: null,
            error: null,
            requestId,
          },
        });
      } else {
        if (request.acceptBinary && this.onBinaryMessage) {
          const file = await readExplorerFileBytes({
            root: cwd,
            relativePath: requestedPath,
          });

          this.emitBinary(
            encodeFileTransferFrame({
              opcode: FileTransferOpcode.FileBegin,
              requestId,
              metadata: {
                mime: file.mimeType,
                size: file.size,
                encoding: file.encoding,
                modifiedAt: file.modifiedAt,
              },
            }),
          );
          this.emitBinary(
            encodeFileTransferFrame({
              opcode: FileTransferOpcode.FileChunk,
              requestId,
              payload: file.bytes,
            }),
          );
          this.emitBinary(
            encodeFileTransferFrame({
              opcode: FileTransferOpcode.FileEnd,
              requestId,
            }),
          );
        } else {
          const file = await readExplorerFile({
            root: cwd,
            relativePath: requestedPath,
          });

          this.emit({
            type: "file_explorer_response",
            payload: {
              cwd,
              path: file.path,
              mode,
              directory: null,
              file,
              error: null,
              requestId,
            },
          });
        }
      }
    } catch (error) {
      this.sessionLogger.error(
        { err: error, cwd, path: requestedPath },
        `Failed to fulfill file explorer request for workspace ${cwd}`,
      );
      this.emit({
        type: "file_explorer_response",
        payload: {
          cwd,
          path: requestedPath,
          mode,
          directory: null,
          file: null,
          error: getErrorMessage(error),
          requestId,
        },
      });
    }
  }

  /**
   * Handle project icon request for a given cwd
   */
  private async handleProjectIconRequest(
    request: Extract<SessionInboundMessage, { type: "project_icon_request" }>,
  ): Promise<void> {
    const { cwd, requestId } = request;

    try {
      const icon = await getProjectIcon(cwd);
      this.emit({
        type: "project_icon_response",
        payload: {
          cwd,
          icon,
          error: null,
          requestId,
        },
      });
    } catch (error) {
      this.emit({
        type: "project_icon_response",
        payload: {
          cwd,
          icon: null,
          error: getErrorMessage(error),
          requestId,
        },
      });
    }
  }

  /**
   * Handle file download token request scoped to a workspace cwd
   */
  private async handleFileDownloadTokenRequest(request: FileDownloadTokenRequest): Promise<void> {
    const { cwd: workspaceCwd, path: requestedPath, requestId } = request;
    const cwd = workspaceCwd.trim();
    if (!cwd) {
      this.emit({
        type: "file_download_token_response",
        payload: {
          cwd: workspaceCwd,
          path: requestedPath,
          token: null,
          fileName: null,
          mimeType: null,
          size: null,
          error: "cwd is required",
          requestId,
        },
      });
      return;
    }

    this.sessionLogger.debug(
      { cwd, path: requestedPath },
      `Handling file download token request for workspace ${cwd} (${requestedPath})`,
    );

    try {
      const info = await getDownloadableFileInfo({
        root: cwd,
        relativePath: requestedPath,
      });

      const entry = this.downloadTokenStore.issueToken({
        path: info.path,
        absolutePath: info.absolutePath,
        fileName: info.fileName,
        mimeType: info.mimeType,
        size: info.size,
      });

      this.emit({
        type: "file_download_token_response",
        payload: {
          cwd,
          path: info.path,
          token: entry.token,
          fileName: entry.fileName,
          mimeType: entry.mimeType,
          size: entry.size,
          error: null,
          requestId,
        },
      });
    } catch (error) {
      this.sessionLogger.error(
        { err: error, cwd, path: requestedPath },
        `Failed to issue download token for workspace ${cwd}`,
      );
      this.emit({
        type: "file_download_token_response",
        payload: {
          cwd,
          path: requestedPath,
          token: null,
          fileName: null,
          mimeType: null,
          size: null,
          error: getErrorMessage(error),
          requestId,
        },
      });
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

  private async getAgentPayloadById(agentId: string): Promise<AgentSnapshotPayload | null> {
    const live = this.agentManager.getAgent(agentId);
    if (live) {
      const payload = await this.buildAgentPayload(live);
      return this.isProviderVisibleToClient(payload.provider) ? payload : null;
    }

    const record = await this.agentStorage.get(agentId);
    if (!record || record.internal) {
      return null;
    }
    const payload = this.buildStoredAgentPayload(record);
    return this.isProviderVisibleToClient(payload.provider) ? payload : null;
  }

  private async buildActiveProjectPlacementsByWorkspaceCwd(): Promise<
    Map<string, ProjectPlacementPayload>
  > {
    const [persistedWorkspaces, persistedProjects] = await Promise.all([
      this.workspaceRegistry.list(),
      this.projectRegistry.list(),
    ]);
    const activeProjects = new Map(
      persistedProjects
        .filter((project) => !project.archivedAt)
        .map((project) => [project.projectId, project] as const),
    );
    const placementsByCwd = new Map<string, ProjectPlacementPayload>();

    const pairs = persistedWorkspaces.flatMap((workspace) => {
      if (workspace.archivedAt) return [];
      const project = activeProjects.get(workspace.projectId);
      if (!project) return [];
      return [{ workspace, project }];
    });
    const placements = await Promise.all(
      pairs.map(({ workspace, project }) =>
        this.buildProjectPlacementForWorkspace(workspace, project),
      ),
    );
    for (let i = 0; i < pairs.length; i += 1) {
      placementsByCwd.set(normalizePersistedWorkspaceId(pairs[i].workspace.cwd), placements[i]);
    }

    return placementsByCwd;
  }

  private async collectFetchAgentsEntries(params: {
    candidates: AgentSnapshotPayload[];
    limit: number;
    getPlacement: (cwd: string) => Promise<ProjectPlacementPayload | null>;
    filter: AgentUpdatesFilter | undefined;
  }): Promise<FetchAgentsResponseEntry[]> {
    const { candidates, limit, getPlacement, filter } = params;
    const matchedEntries: FetchAgentsResponseEntry[] = [];
    const batchSize = 25;
    for (
      let start = 0;
      start < candidates.length && matchedEntries.length <= limit;
      start += batchSize
    ) {
      const batch = candidates.slice(start, start + batchSize);
      const batchEntries = await Promise.all(
        batch.map(async (agent) => {
          const project = await getPlacement(agent.cwd);
          return project ? { agent, project } : null;
        }),
      );
      for (const entry of batchEntries) {
        if (!entry) {
          continue;
        }
        if (
          !this.matchesAgentFilter({
            agent: entry.agent,
            project: entry.project,
            filter,
          })
        ) {
          continue;
        }
        matchedEntries.push(entry);
        if (matchedEntries.length > limit) {
          break;
        }
      }
    }
    return matchedEntries;
  }

  private async listFetchAgentsEntries(request: AgentDirectoryRequestMessage): Promise<{
    entries: FetchAgentsResponseEntry[];
    pageInfo: FetchAgentsResponsePageInfo;
  }> {
    const filter =
      request.type === "fetch_agent_history_request" &&
      request.filter?.includeArchived === undefined
        ? { ...request.filter, includeArchived: true }
        : request.filter;
    const scope = request.type === "fetch_agents_request" ? request.scope : undefined;
    const sort = this.agentsPager.normalizeSort(request.sort);

    let agents = await this.listAgentPayloads({
      labels: filter?.labels,
      includeUnavailablePersisted: request.type === "fetch_agent_history_request",
    });
    const activePlacementsByCwd =
      scope === "active" ? await this.buildActiveProjectPlacementsByWorkspaceCwd() : null;
    if (activePlacementsByCwd) {
      agents = agents.filter(
        (agent) =>
          !agent.archivedAt && activePlacementsByCwd.has(normalizePersistedWorkspaceId(agent.cwd)),
      );
    }

    const placementByCwd = new Map<string, Promise<ProjectPlacementPayload | null>>();
    const getPlacement = (cwd: string): Promise<ProjectPlacementPayload | null> => {
      if (activePlacementsByCwd) {
        return Promise.resolve(
          activePlacementsByCwd.get(normalizePersistedWorkspaceId(cwd)) ?? null,
        );
      }
      const existing = placementByCwd.get(cwd);
      if (existing) {
        return existing;
      }
      const placementPromise = this.buildProjectPlacementForCwd(cwd);
      placementByCwd.set(cwd, placementPromise);
      return placementPromise;
    };

    let candidates = [...agents];
    candidates.sort((left, right) => this.agentsPager.compare(left, right, sort));
    const cursorToken = request.page?.cursor;
    if (cursorToken) {
      const cursor = this.decodeAgentCursor(cursorToken, sort);
      candidates = candidates.filter(
        (agent) => this.agentsPager.compareWithCursor(agent, cursor, sort) > 0,
      );
    }

    const limit = request.page?.limit ?? 200;

    const matchedEntries = await this.collectFetchAgentsEntries({
      candidates,
      limit,
      getPlacement,
      filter,
    });

    const pagedEntries = matchedEntries.slice(0, limit);
    const hasMore = matchedEntries.length > limit;
    const nextCursor =
      hasMore && pagedEntries.length > 0
        ? this.agentsPager.encode(pagedEntries[pagedEntries.length - 1].agent, sort)
        : null;

    return {
      entries: pagedEntries,
      pageInfo: {
        nextCursor,
        prevCursor: request.page?.cursor ?? null,
        hasMore,
      },
    };
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

  private decodeAgentCursor(token: string, sort: SortSpec<FetchAgentsRequestSort["key"]>[]) {
    try {
      return this.agentsPager.decode(token, sort);
    } catch (error) {
      if (error instanceof CursorError) {
        throw new SessionRequestError("invalid_cursor", error.message);
      }
      throw error;
    }
  }

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

  private async handleFetchAgents(
    request: Extract<SessionInboundMessage, { type: "fetch_agents_request" }>,
  ): Promise<void> {
    const requestedSubscriptionId = request.subscribe?.subscriptionId?.trim();
    const subscriptionId = resolveSubscriptionId(request.subscribe, requestedSubscriptionId);

    try {
      if (subscriptionId) {
        this.agentUpdatesSubscription = {
          subscriptionId,
          filter: request.filter,
          isBootstrapping: true,
          pendingUpdatesByAgentId: new Map(),
        };
      }

      const payload = await this.listFetchAgentsEntries(request);
      const snapshotUpdatedAtByAgentId = new Map<string, number>();
      for (const entry of payload.entries) {
        const parsedUpdatedAt = Date.parse(entry.agent.updatedAt);
        if (!Number.isNaN(parsedUpdatedAt)) {
          snapshotUpdatedAtByAgentId.set(entry.agent.id, parsedUpdatedAt);
        }
      }

      this.emit({
        type: "fetch_agents_response",
        payload: {
          requestId: request.requestId,
          ...(subscriptionId ? { subscriptionId } : {}),
          ...payload,
        },
      });

      if (subscriptionId && this.agentUpdatesSubscription?.subscriptionId === subscriptionId) {
        this.flushBootstrappedAgentUpdates({ snapshotUpdatedAtByAgentId });
      }
    } catch (error) {
      if (subscriptionId && this.agentUpdatesSubscription?.subscriptionId === subscriptionId) {
        this.agentUpdatesSubscription = null;
      }
      const code = error instanceof SessionRequestError ? error.code : "fetch_agents_failed";
      const message = error instanceof Error ? error.message : "Failed to fetch agents";
      this.sessionLogger.error({ err: error }, "Failed to handle fetch_agents_request");
      this.emit({
        type: "rpc_error",
        payload: {
          requestId: request.requestId,
          requestType: request.type,
          error: message,
          code,
        },
      });
    }
  }

  private async handleFetchAgentHistory(
    request: Extract<SessionInboundMessage, { type: "fetch_agent_history_request" }>,
  ): Promise<void> {
    try {
      const payload = await this.listFetchAgentsEntries(request);
      this.emit({
        type: "fetch_agent_history_response",
        payload: {
          requestId: request.requestId,
          ...payload,
        },
      });
    } catch (error) {
      const code = error instanceof SessionRequestError ? error.code : "fetch_agent_history_failed";
      const message = error instanceof Error ? error.message : "Failed to fetch agent history";
      this.sessionLogger.error({ err: error }, "Failed to handle fetch_agent_history_request");
      this.emit({
        type: "rpc_error",
        payload: {
          requestId: request.requestId,
          requestType: request.type,
          error: message,
          code,
        },
      });
    }
  }

  private async handleFetchRecentProviderSessions(
    request: Extract<SessionInboundMessage, { type: "fetch_recent_provider_sessions_request" }>,
  ): Promise<void> {
    try {
      const result = await listImportableProviderSessions({
        request,
        agentManager: this.agentManager,
        agentStorage: this.agentStorage,
        providerSnapshotManager: this.providerSnapshotManager,
      });
      this.emit({
        type: "fetch_recent_provider_sessions_response",
        payload: {
          requestId: request.requestId,
          entries: result.entries,
          ...(result.filteredAlreadyImportedCount > 0
            ? { filteredAlreadyImportedCount: result.filteredAlreadyImportedCount }
            : {}),
        },
      });
    } catch (error) {
      const code =
        error instanceof ImportSessionsRequestError
          ? error.code
          : "fetch_recent_provider_sessions_failed";
      const message =
        error instanceof Error ? error.message : "Failed to fetch recent provider sessions";
      this.sessionLogger.error(
        { err: error },
        "Failed to handle fetch_recent_provider_sessions_request",
      );
      this.emit({
        type: "rpc_error",
        payload: {
          requestId: request.requestId,
          requestType: request.type,
          error: message,
          code,
        },
      });
    }
  }

  private async listRetainedUsageEvents() {
    if (!this.usageStore) {
      return [];
    }
    const records = await this.usageStore.list();
    const retained = pruneUsageEvents({ events: records });
    if (retained.length !== records.length) {
      await this.usageStore.replace(retained);
    }
    return retained;
  }

  private async handleUsageSummaryGet(
    request: Extract<SessionInboundMessage, { type: "usage.summary.get.request" }>,
  ): Promise<void> {
    try {
      const records = await this.listRetainedUsageEvents();
      this.emit({
        type: "usage.summary.get.response",
        payload: {
          requestId: request.requestId,
          summary: buildUsageSummary({
            events: records,
            rangeDays: request.rangeDays,
          }),
        },
      });
    } catch (error) {
      this.sessionLogger.error({ err: error }, "Failed to handle usage.summary.get.request");
      this.emit({
        type: "rpc_error",
        payload: {
          requestId: request.requestId,
          requestType: request.type,
          error: error instanceof Error ? error.message : "Failed to fetch usage summary",
          code: "usage_summary_failed",
        },
      });
    }
  }

  private async handleUsageExport(
    request: Extract<SessionInboundMessage, { type: "usage.export.request" }>,
  ): Promise<void> {
    try {
      const records = await this.listRetainedUsageEvents();
      this.emit({
        type: "usage.export.response",
        payload: {
          requestId: request.requestId,
          format: request.format,
          filename: `chisacode-usage.${request.format}`,
          content: exportUsageEvents(records, request.format),
        },
      });
    } catch (error) {
      this.sessionLogger.error({ err: error }, "Failed to handle usage.export.request");
      this.emit({
        type: "rpc_error",
        payload: {
          requestId: request.requestId,
          requestType: request.type,
          error: error instanceof Error ? error.message : "Failed to export usage",
          code: "usage_export_failed",
        },
      });
    }
  }

  private async handleUsageClear(
    request: Extract<SessionInboundMessage, { type: "usage.clear.request" }>,
  ): Promise<void> {
    try {
      await this.usageStore?.clear();
      this.emit({
        type: "usage.clear.response",
        payload: {
          requestId: request.requestId,
          cleared: true,
        },
      });
    } catch (error) {
      this.sessionLogger.error({ err: error }, "Failed to handle usage.clear.request");
      this.emit({
        type: "rpc_error",
        payload: {
          requestId: request.requestId,
          requestType: request.type,
          error: error instanceof Error ? error.message : "Failed to clear usage",
          code: "usage_clear_failed",
        },
      });
    }
  }

  private async handleFetchWorkspacesRequest(
    request: Extract<SessionInboundMessage, { type: "fetch_workspaces_request" }>,
  ): Promise<void> {
    const requestedSubscriptionId = request.subscribe?.subscriptionId?.trim();
    const subscriptionId = resolveSubscriptionId(request.subscribe, requestedSubscriptionId);

    try {
      this.sessionLogger.debug(
        {
          requestId: request.requestId,
          subscribeRequested: Boolean(request.subscribe),
          filter: request.filter ?? null,
          sort: request.sort ?? null,
          page: request.page ?? null,
        },
        "fetch_workspaces_request_received",
      );
      if (subscriptionId) {
        this.workspaceUpdatesSubscription = {
          subscriptionId,
          filter: request.filter,
          isBootstrapping: true,
          pendingUpdatesByWorkspaceId: new Map(),
          lastEmittedByWorkspaceId: new Map(),
        };
      }

      const payload = await this.listFetchWorkspacesEntries(request);
      this.syncWorkspaceGitObservers(payload.entries);
      this.sessionLogger.debug(
        {
          requestId: request.requestId,
          subscriptionId,
          pageInfo: payload.pageInfo,
          payload: summarizeFetchWorkspacesEntries(payload.entries),
        },
        "fetch_workspaces_response_ready",
      );
      const snapshotLatestActivityByWorkspaceId = new Map<string, number>();
      for (const entry of payload.entries) {
        const parsedLatestActivity = entry.activityAt
          ? Date.parse(entry.activityAt)
          : Number.NEGATIVE_INFINITY;
        if (!Number.isNaN(parsedLatestActivity)) {
          snapshotLatestActivityByWorkspaceId.set(entry.id, parsedLatestActivity);
        }
      }

      this.emit({
        type: "fetch_workspaces_response",
        payload: {
          requestId: request.requestId,
          ...(subscriptionId ? { subscriptionId } : {}),
          ...payload,
        },
      });

      if (subscriptionId && this.workspaceUpdatesSubscription?.subscriptionId === subscriptionId) {
        this.flushBootstrappedWorkspaceUpdates({ snapshotLatestActivityByWorkspaceId });
        void this.reconcileAndEmitWorkspaceUpdates();
      }
    } catch (error) {
      if (subscriptionId && this.workspaceUpdatesSubscription?.subscriptionId === subscriptionId) {
        this.workspaceUpdatesSubscription = null;
      }
      const code = error instanceof SessionRequestError ? error.code : "fetch_workspaces_failed";
      const message = error instanceof Error ? error.message : "Failed to fetch workspaces";
      this.sessionLogger.error({ err: error }, "Failed to handle fetch_workspaces_request");
      this.emit({
        type: "rpc_error",
        payload: {
          requestId: request.requestId,
          requestType: request.type,
          error: message,
          code,
        },
      });
    }
  }

  private async registerWorkspaceForImportedAgent(cwd: string): Promise<void> {
    try {
      const workspace = await this.findOrCreateWorkspaceForDirectory(cwd);
      await this.syncWorkspaceGitObserverForWorkspace(workspace);
      await this.describeWorkspaceRecord(workspace);
      await this.emitWorkspaceUpdateForCwd(workspace.cwd);
    } catch (error) {
      this.sessionLogger.warn(
        { err: error, cwd },
        "Failed to register workspace for imported agent",
      );
    }
  }

  private async handleOpenProjectRequest(
    request: Extract<SessionInboundMessage, { type: "open_project_request" }>,
  ): Promise<void> {
    try {
      const workspace = await this.findOrCreateWorkspaceForDirectory(request.cwd);
      await this.syncWorkspaceGitObserverForWorkspace(workspace);
      const descriptor = await this.describeWorkspaceRecord(workspace);
      await this.emitWorkspaceUpdateForCwd(workspace.cwd);
      this.emit({
        type: "open_project_response",
        payload: {
          requestId: request.requestId,
          workspace: descriptor,
          error: null,
        },
      });
      void this.workspaceGitService
        .getSnapshot(workspace.cwd, {
          force: true,
          includeGitHub: true,
          reason: "open_project",
        })
        .catch((error) => {
          this.sessionLogger.warn(
            { err: error, cwd: workspace.cwd },
            "Background snapshot refresh failed after open_project",
          );
        });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to open project";
      this.sessionLogger.error({ err: error, cwd: request.cwd }, "Failed to open project");
      this.emit({
        type: "open_project_response",
        payload: {
          requestId: request.requestId,
          workspace: null,
          error: message,
        },
      });
    }
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

  private async handleStartWorkspaceScriptRequest(
    request: StartWorkspaceScriptRequest,
  ): Promise<void> {
    try {
      if (!this.terminalManager || !this.scriptRouteStore || !this.scriptRuntimeStore) {
        throw new Error("Workspace scripts are not available on this daemon");
      }

      const workspace = await this.workspaceRegistry.get(request.workspaceId);
      if (!workspace) {
        throw new Error(`Workspace not found: ${request.workspaceId}`);
      }
      const gitMetadata = await this.workspaceGitService.getWorkspaceGitMetadata(workspace.cwd);

      const serviceResult = await spawnWorkspaceScript({
        repoRoot: workspace.cwd,
        workspaceId: workspace.workspaceId,
        projectSlug: gitMetadata.projectSlug,
        branchName: gitMetadata.currentBranch,
        scriptName: request.scriptName,
        daemonPort: this.getDaemonTcpPort?.() ?? null,
        daemonListenHost: this.getDaemonTcpHost?.() ?? null,
        routeStore: this.scriptRouteStore,
        runtimeStore: this.scriptRuntimeStore,
        terminalManager: this.terminalManager,
        logger: this.sessionLogger,
        onLifecycleChanged: () => {
          this.emitWorkspaceScriptStatusUpdate(workspace.workspaceId, workspace.cwd);
        },
      });

      this.emitWorkspaceScriptStatusUpdate(workspace.workspaceId, workspace.cwd);
      this.emit({
        type: "start_workspace_script_response",
        payload: {
          requestId: request.requestId,
          workspaceId: request.workspaceId,
          scriptName: request.scriptName,
          terminalId: serviceResult.terminalId,
          error: null,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to start workspace script";
      this.sessionLogger.error(
        {
          err: error,
          workspaceId: request.workspaceId,
          scriptName: request.scriptName,
        },
        "Failed to start workspace script",
      );
      this.emit({
        type: "start_workspace_script_response",
        payload: {
          requestId: request.requestId,
          workspaceId: request.workspaceId,
          scriptName: request.scriptName,
          terminalId: null,
          error: message,
        },
      });
    }
  }

  private async handleListAvailableEditorsRequest(
    request: Extract<SessionInboundMessage, { type: "list_available_editors_request" }>,
  ): Promise<void> {
    try {
      const editors = await this.getAvailableEditorTargets();
      this.emit({
        type: "list_available_editors_response",
        payload: {
          requestId: request.requestId,
          editors,
          error: null,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to list available editors";
      this.sessionLogger.error(
        { err: error, requestType: request.type },
        "Failed to list available editors",
      );
      this.emit({
        type: "list_available_editors_response",
        payload: {
          requestId: request.requestId,
          editors: [],
          error: message,
        },
      });
    }
  }

  private async handleOpenInEditorRequest(
    request: Extract<SessionInboundMessage, { type: "open_in_editor_request" }>,
  ): Promise<void> {
    try {
      await this.openEditorTarget({ editorId: request.editorId, path: request.path });
      this.emit({
        type: "open_in_editor_response",
        payload: {
          requestId: request.requestId,
          error: null,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to open in editor";
      this.sessionLogger.error(
        {
          err: error,
          editorId: request.editorId,
          path: request.path,
          requestType: request.type,
        },
        "Failed to open in editor",
      );
      this.emit({
        type: "open_in_editor_response",
        payload: {
          requestId: request.requestId,
          error: message,
        },
      });
    }
  }

  private async handleCreateChisaCodeWorktreeRequest(
    request: Extract<SessionInboundMessage, { type: "create_chisacode_worktree_request" }>,
  ): Promise<void> {
    return handleCreateWorktreeRequest(
      {
        chisacodeHome: this.chisacodeHome,
        describeWorkspaceRecord: (result) => this.describeCreatedWorktreeWorkspace(result),
        emit: (message) => this.emit(message),
        sessionLogger: this.sessionLogger,
        createChisaCodeWorktreeWorkflow: (input) => this.createChisaCodeWorktreeWorkflow(input),
      },
      request,
    );
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

  private async handleWorkspaceSetupStatusRequest(
    request: Extract<SessionInboundMessage, { type: "workspace_setup_status_request" }>,
  ): Promise<void> {
    return handleWorkspaceSetupStatusRequestMessage(
      {
        emit: (message) => this.emit(message),
        workspaceSetupSnapshots: this.workspaceSetupSnapshots,
      },
      request,
    );
  }

  private async handleArchiveWorkspaceRequest(
    request: Extract<SessionInboundMessage, { type: "archive_workspace_request" }>,
  ): Promise<void> {
    try {
      const existing = await this.workspaceRegistry.get(request.workspaceId);
      if (!existing) {
        throw new Error(`Workspace not found: ${request.workspaceId}`);
      }
      if (existing.kind === "worktree") {
        throw new Error("Use worktree archive for ChisaCode worktrees");
      }
      const archivedAt = new Date().toISOString();
      await this.archiveWorkspaceRecord(existing.workspaceId, archivedAt);
      await this.emitWorkspaceUpdateForCwd(existing.cwd);
      this.emit({
        type: "archive_workspace_response",
        payload: {
          requestId: request.requestId,
          workspaceId: request.workspaceId,
          archivedAt,
          error: null,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to archive workspace";
      this.sessionLogger.error(
        { err: error, workspaceId: request.workspaceId },
        "Failed to archive workspace",
      );
      this.emit({
        type: "archive_workspace_response",
        payload: {
          requestId: request.requestId,
          workspaceId: request.workspaceId,
          archivedAt: null,
          error: message,
        },
      });
    }
  }

  private async handleFetchAgent(agentIdOrIdentifier: string, requestId: string): Promise<void> {
    const resolved = await this.resolveAgentIdentifier(agentIdOrIdentifier);
    if (!resolved.ok) {
      this.emit({
        type: "fetch_agent_response",
        payload: { requestId, agent: null, project: null, error: resolved.error },
      });
      return;
    }

    const agent = await this.getAgentPayloadById(resolved.agentId);
    if (!agent) {
      this.emit({
        type: "fetch_agent_response",
        payload: {
          requestId,
          agent: null,
          project: null,
          error: `Agent not found: ${resolved.agentId}`,
        },
      });
      return;
    }

    const project = await this.buildProjectPlacementForCwd(agent.cwd);
    this.emit({
      type: "fetch_agent_response",
      payload: { requestId, agent, project, error: null },
    });
  }

  private loadProjectedTimelineWindow(params: {
    agentId: string;
    direction: AgentTimelineFetchDirection;
    cursor: AgentTimelineCursor | undefined;
    requestedLimit: number;
    timeline: ReturnType<AgentManager["fetchTimeline"]>;
  }): {
    timeline: ReturnType<AgentManager["fetchTimeline"]>;
    selectedRows: ReturnType<typeof selectTimelineWindowByProjectedLimit>["selectedRows"];
    minSeq: number | null;
    maxSeq: number | null;
  } {
    const { agentId, direction, cursor, requestedLimit } = params;
    let timeline = params.timeline;
    const projectedLimit = Math.max(1, Math.floor(requestedLimit));
    let fetchLimit = projectedLimit;
    let projectedWindow = selectTimelineWindowByProjectedLimit({
      rows: timeline.rows,
      direction,
      limit: projectedLimit,
      collapseToolLifecycle: false,
    });

    while (timeline.hasOlder) {
      const needsMoreProjectedEntries = projectedWindow.projectedEntries.length < projectedLimit;
      const firstLoadedRow = timeline.rows[0];
      const firstSelectedRow = projectedWindow.selectedRows[0];
      const startsAtLoadedBoundary =
        firstLoadedRow != null &&
        firstSelectedRow != null &&
        firstSelectedRow.seq === firstLoadedRow.seq;
      const boundaryIsAssistantChunk =
        startsAtLoadedBoundary && firstLoadedRow.item.type === "assistant_message";

      if (!needsMoreProjectedEntries && !boundaryIsAssistantChunk) {
        break;
      }

      const maxRows = Math.max(0, timeline.window.maxSeq - timeline.window.minSeq + 1);
      const nextFetchLimit = Math.min(maxRows, fetchLimit * 2);
      if (nextFetchLimit <= fetchLimit) {
        break;
      }

      fetchLimit = nextFetchLimit;
      timeline = this.agentManager.fetchTimeline(agentId, {
        direction,
        cursor,
        limit: fetchLimit,
      });
      projectedWindow = selectTimelineWindowByProjectedLimit({
        rows: timeline.rows,
        direction,
        limit: projectedLimit,
        collapseToolLifecycle: false,
      });
    }

    return {
      timeline,
      selectedRows: projectedWindow.selectedRows,
      minSeq: projectedWindow.minSeq,
      maxSeq: projectedWindow.maxSeq,
    };
  }

  private async handleFetchAgentTimelineRequest(
    msg: Extract<SessionInboundMessage, { type: "fetch_agent_timeline_request" }>,
  ): Promise<void> {
    const direction: AgentTimelineFetchDirection = msg.direction ?? (msg.cursor ? "after" : "tail");
    const projection: TimelineProjectionMode = msg.projection ?? "projected";
    const requestedLimit = msg.limit;
    const limit = requestedLimit ?? (direction === "after" ? 0 : undefined);
    const shouldLimitByProjectedWindow =
      projection === "canonical" &&
      direction === "tail" &&
      typeof requestedLimit === "number" &&
      requestedLimit > 0;
    const cursor: AgentTimelineCursor | undefined = msg.cursor
      ? {
          epoch: msg.cursor.epoch,
          seq: msg.cursor.seq,
        }
      : undefined;

    try {
      const snapshot = await ensureAgentLoaded(msg.agentId, {
        agentManager: this.agentManager,
        agentStorage: this.agentStorage,
        logger: this.sessionLogger,
      });
      const agentPayload = await this.buildAgentPayload(snapshot);

      let timeline = this.agentManager.fetchTimeline(msg.agentId, {
        direction,
        cursor,
        limit:
          shouldLimitByProjectedWindow && typeof requestedLimit === "number"
            ? Math.max(1, Math.floor(requestedLimit))
            : limit,
      });
      let hasOlder = timeline.hasOlder;
      let hasNewer = timeline.hasNewer;
      let startCursor: { epoch: string; seq: number } | null = null;
      let endCursor: { epoch: string; seq: number } | null = null;
      let entries: ReturnType<typeof projectTimelineRows>;

      if (shouldLimitByProjectedWindow) {
        const projectedResult = this.loadProjectedTimelineWindow({
          agentId: msg.agentId,
          direction,
          cursor,
          requestedLimit,
          timeline,
        });
        timeline = projectedResult.timeline;
        entries = projectTimelineRows({ rows: projectedResult.selectedRows, mode: projection });
        if (projectedResult.minSeq !== null && projectedResult.maxSeq !== null) {
          startCursor = { epoch: timeline.epoch, seq: projectedResult.minSeq };
          endCursor = { epoch: timeline.epoch, seq: projectedResult.maxSeq };
          hasOlder = projectedResult.minSeq > timeline.window.minSeq;
          hasNewer = false;
        }
      } else {
        const firstRow = timeline.rows[0];
        const lastRow = timeline.rows[timeline.rows.length - 1];
        startCursor = firstRow ? { epoch: timeline.epoch, seq: firstRow.seq } : null;
        endCursor = lastRow ? { epoch: timeline.epoch, seq: lastRow.seq } : null;
        entries = projectTimelineRows({ rows: timeline.rows, mode: projection });
      }

      this.emit({
        type: "fetch_agent_timeline_response",
        payload: {
          requestId: msg.requestId,
          agentId: msg.agentId,
          agent: agentPayload,
          direction,
          projection,
          epoch: timeline.epoch,
          reset: timeline.reset,
          staleCursor: timeline.staleCursor,
          gap: timeline.gap,
          window: timeline.window,
          startCursor,
          endCursor,
          hasOlder,
          hasNewer,
          entries: entries.map((entry) => ({
            provider: snapshot.provider,
            item: entry.item,
            timestamp: entry.timestamp,
            seqStart: entry.seqStart,
            seqEnd: entry.seqEnd,
            sourceSeqRanges: entry.sourceSeqRanges,
            collapsed: this.supports(CLIENT_CAPS.reasoningMergeEnum)
              ? entry.collapsed
              : entry.collapsed.filter((value) => value !== "reasoning_merge"),
          })),
          error: null,
        },
      });
    } catch (error) {
      this.sessionLogger.error(
        { err: error, agentId: msg.agentId },
        "Failed to handle fetch_agent_timeline_request",
      );
      this.emit({
        type: "fetch_agent_timeline_response",
        payload: {
          requestId: msg.requestId,
          agentId: msg.agentId,
          agent: null,
          direction,
          projection,
          epoch: "",
          reset: false,
          staleCursor: false,
          gap: false,
          window: { minSeq: 0, maxSeq: 0, nextSeq: 0 },
          startCursor: null,
          endCursor: null,
          hasOlder: false,
          hasNewer: false,
          entries: [],
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  private async handleSendAgentMessageRequest(
    msg: Extract<SessionInboundMessage, { type: "send_agent_message_request" }>,
  ): Promise<void> {
    const resolved = await this.resolveAgentIdentifier(msg.agentId);
    if (!resolved.ok) {
      this.emit({
        type: "send_agent_message_response",
        payload: {
          requestId: msg.requestId,
          agentId: msg.agentId,
          accepted: false,
          error: resolved.error,
        },
      });
      return;
    }

    try {
      const agentId = resolved.agentId;

      const prompt = this.buildAgentPrompt(msg.text, msg.images, msg.attachments);
      this.sessionLogger.trace(
        {
          agentId,
          messageId: msg.messageId,
          textPrefix: msg.text.slice(0, 80),
        },
        "agent.session.send_agent_message",
      );
      let dispatchResult: { outOfBand: boolean };
      try {
        dispatchResult = await sendPromptToAgent({
          agentManager: this.agentManager,
          agentStorage: this.agentStorage,
          agentId,
          prompt,
          messageId: msg.messageId,
          logger: this.sessionLogger,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.handleAgentRunError(agentId, error, "Failed to send agent message");
        this.emit({
          type: "send_agent_message_response",
          payload: {
            requestId: msg.requestId,
            agentId,
            accepted: false,
            error: message,
          },
        });
        return;
      }

      if (dispatchResult.outOfBand) {
        this.emit({
          type: "send_agent_message_response",
          payload: {
            requestId: msg.requestId,
            agentId,
            accepted: true,
            error: null,
          },
        });
        return;
      }

      try {
        await waitForAgentRunStartWithTimeout(this.agentManager, agentId);
      } catch (error) {
        this.emit({
          type: "send_agent_message_response",
          payload: {
            requestId: msg.requestId,
            agentId,
            accepted: false,
            error: errorToFriendlyMessage(error),
          },
        });
        return;
      }

      this.emit({
        type: "send_agent_message_response",
        payload: {
          requestId: msg.requestId,
          agentId,
          accepted: true,
          error: null,
        },
      });
    } catch (error) {
      this.emit({
        type: "send_agent_message_response",
        payload: {
          requestId: msg.requestId,
          agentId: resolved.agentId,
          accepted: false,
          error: errorToFriendlyMessage(error),
        },
      });
    }
  }

  private async handleWaitForFinish(
    agentIdOrIdentifier: string,
    requestId: string,
    timeoutMs?: number,
  ): Promise<void> {
    const resolved = await this.resolveAgentIdentifier(agentIdOrIdentifier);
    if (!resolved.ok) {
      this.emit({
        type: "wait_for_finish_response",
        payload: {
          requestId,
          status: "error",
          final: null,
          error: resolved.error,
          lastMessage: null,
        },
      });
      return;
    }

    const agentId = resolved.agentId;
    const live = this.agentManager.getAgent(agentId);
    if (!live) {
      const record = await this.agentStorage.get(agentId);
      if (!record || record.internal) {
        this.emit({
          type: "wait_for_finish_response",
          payload: {
            requestId,
            status: "error",
            final: null,
            error: `Agent not found: ${agentId}`,
            lastMessage: null,
          },
        });
        return;
      }
      const final = this.buildStoredAgentPayload(record);
      let status: "permission" | "error" | "idle";
      if (record.attentionReason === "permission") {
        status = "permission";
      } else if (record.lastStatus === "error") {
        status = "error";
      } else {
        status = "idle";
      }
      const error = resolveWaitForFinishError({ status, final });
      this.emit({
        type: "wait_for_finish_response",
        payload: { requestId, status, final, error, lastMessage: null },
      });
      return;
    }

    const abortController = new AbortController();
    const hasTimeout = typeof timeoutMs === "number" && timeoutMs > 0;
    const timeoutHandle = hasTimeout
      ? setTimeout(() => {
          abortController.abort("timeout");
        }, timeoutMs)
      : null;

    try {
      let result = await this.agentManager.waitForAgentEvent(agentId, {
        signal: abortController.signal,
        waitForActive: true,
      });
      let final = await this.getAgentPayloadById(agentId);
      if (!final) {
        throw new Error(`Agent ${agentId} disappeared while waiting`);
      }

      let status: "permission" | "error" | "idle";
      if (result.permission) {
        status = "permission";
      } else if (result.status === "error") {
        status = "error";
      } else {
        status = "idle";
      }
      const error = resolveWaitForFinishError({ status, final });

      this.emit({
        type: "wait_for_finish_response",
        payload: { requestId, status, final, error, lastMessage: result.lastMessage },
      });
    } catch (error) {
      const isAbort =
        error instanceof Error &&
        (error.name === "AbortError" || error.message.toLowerCase().includes("aborted"));
      if (!isAbort) {
        const message = errorToFriendlyMessage(error);
        this.sessionLogger.error({ err: error, agentId }, "wait_for_finish_request failed");
        const final = await this.getAgentPayloadById(agentId);
        this.emit({
          type: "wait_for_finish_response",
          payload: {
            requestId,
            status: "error",
            final,
            error: message,
            lastMessage: null,
          },
        });
        return;
      }

      const final = await this.getAgentPayloadById(agentId);
      if (!final) {
        throw new Error(`Agent ${agentId} disappeared while waiting`, { cause: error });
      }
      this.emit({
        type: "wait_for_finish_response",
        payload: { requestId, status: "timeout", final, error: null, lastMessage: null },
      });
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  /**
   * Handle audio chunk for buffering and transcription
   */
  private async ensureAudioBufferForFormat(
    chunkFormat: string,
    isPCMChunk: boolean,
  ): Promise<AudioBufferState> {
    if (!this.audioBuffer) {
      this.audioBuffer = {
        chunks: [],
        format: chunkFormat,
        isPCM: isPCMChunk,
        totalPCMBytes: 0,
      };
      return this.audioBuffer;
    }
    if (this.audioBuffer.isPCM !== isPCMChunk) {
      this.sessionLogger.debug(
        {
          oldFormat: this.audioBuffer.isPCM ? "pcm" : this.audioBuffer.format,
          newFormat: chunkFormat,
        },
        `Audio format changed mid-stream, flushing current buffer`,
      );
      const finalized = this.finalizeBufferedAudio();
      if (finalized) {
        await this.processCompletedAudio(finalized.audio, finalized.format);
      }
      this.audioBuffer = {
        chunks: [],
        format: chunkFormat,
        isPCM: isPCMChunk,
        totalPCMBytes: 0,
      };
      return this.audioBuffer;
    }
    if (!this.audioBuffer.isPCM) {
      this.audioBuffer.format = chunkFormat;
    }
    return this.audioBuffer;
  }

  private async forwardAudioChunkToVoiceTurn(
    msg: Extract<SessionInboundMessage, { type: "voice_audio_chunk" }>,
    chunkFormat: string,
  ): Promise<void> {
    if (!this.voiceTurnController) {
      throw new Error("Voice mode is enabled but the voice turn controller is not running");
    }
    const chunkBytes = Buffer.byteLength(msg.audio, "base64");
    this.voiceInputChunkCount += 1;
    this.voiceInputBytes += chunkBytes;
    const now = Date.now();
    if (this.voiceInputChunkCount % 50 === 0 || now - this.voiceInputWindowStartedAt >= 1000) {
      this.sessionLogger.info(
        {
          chunkCount: this.voiceInputChunkCount,
          audioBytes: this.voiceInputBytes,
          windowMs: now - this.voiceInputWindowStartedAt,
          format: chunkFormat,
        },
        "Voice input chunk summary",
      );
      this.voiceInputWindowStartedAt = now;
      this.voiceInputChunkCount = 0;
      this.voiceInputBytes = 0;
    }
    await this.voiceTurnController.appendClientChunk({
      audioBase64: msg.audio,
      format: chunkFormat,
    });
  }

  private async handleAudioChunk(
    msg: Extract<SessionInboundMessage, { type: "voice_audio_chunk" }>,
  ): Promise<void> {
    if (!this.isVoiceMode) {
      this.sessionLogger.warn(
        "Received voice_audio_chunk while voice mode is disabled; transcript will be emitted but voice assistant turn is skipped",
      );
    }

    const chunkFormat = msg.format || "audio/wav";

    if (this.isVoiceMode) {
      await this.forwardAudioChunkToVoiceTurn(msg, chunkFormat);
      return;
    }

    const chunkBuffer = Buffer.from(msg.audio, "base64");
    const isPCMChunk = chunkFormat.toLowerCase().includes("pcm");

    const buffer = await this.ensureAudioBufferForFormat(chunkFormat, isPCMChunk);

    buffer.chunks.push(chunkBuffer);
    if (buffer.isPCM) {
      buffer.totalPCMBytes += chunkBuffer.length;
    }

    // In non-voice mode, use streaming threshold to process chunks
    const reachedStreamingThreshold =
      !this.isVoiceMode && buffer.isPCM && buffer.totalPCMBytes >= MIN_STREAMING_SEGMENT_BYTES;

    if (!msg.isLast && reachedStreamingThreshold) {
      return;
    }

    const bufferedState = this.audioBuffer;
    const finalized = this.finalizeBufferedAudio();
    if (!finalized) {
      return;
    }

    if (!msg.isLast && reachedStreamingThreshold) {
      this.sessionLogger.debug(
        {
          minDuration: MIN_STREAMING_SEGMENT_DURATION_MS,
          pcmBytes: bufferedState?.totalPCMBytes ?? 0,
        },
        `Minimum chunk duration reached (~${MIN_STREAMING_SEGMENT_DURATION_MS}ms, ${
          bufferedState?.totalPCMBytes ?? 0
        } PCM bytes) – triggering STT`,
      );
    } else {
      this.sessionLogger.debug(
        { audioBytes: finalized.audio.length, chunks: bufferedState?.chunks.length ?? 0 },
        `Complete audio segment (${finalized.audio.length} bytes, ${bufferedState?.chunks.length ?? 0} chunk(s))`,
      );
    }

    await this.processCompletedAudio(finalized.audio, finalized.format);
  }

  private finalizeBufferedAudio(): { audio: Buffer; format: string } | null {
    if (!this.audioBuffer) {
      return null;
    }

    const bufferState = this.audioBuffer;
    this.audioBuffer = null;

    if (bufferState.isPCM) {
      const pcmBuffer = Buffer.concat(bufferState.chunks);
      const wavBuffer = convertPCMToWavBuffer(
        pcmBuffer,
        PCM_SAMPLE_RATE,
        PCM_CHANNELS,
        PCM_BITS_PER_SAMPLE,
      );
      return {
        audio: wavBuffer,
        format: "audio/wav",
      };
    }

    return {
      audio: Buffer.concat(bufferState.chunks),
      format: bufferState.format,
    };
  }

  private async processCompletedAudio(audio: Buffer, format: string): Promise<void> {
    if (this.processingPhase === "transcribing") {
      this.sessionLogger.debug(
        { phase: this.processingPhase, segmentCount: this.pendingAudioSegments.length + 1 },
        `Buffering audio segment (phase: ${this.processingPhase})`,
      );
      this.pendingAudioSegments.push({
        audio,
        format,
      });
      this.setBufferTimeout();
      return;
    }

    if (this.pendingAudioSegments.length > 0) {
      this.pendingAudioSegments.push({
        audio,
        format,
      });
      this.sessionLogger.debug(
        { segmentCount: this.pendingAudioSegments.length },
        `Processing ${this.pendingAudioSegments.length} buffered segments together`,
      );

      const pendingSegments = [...this.pendingAudioSegments];
      this.pendingAudioSegments = [];
      this.clearBufferTimeout();

      const combinedAudio = Buffer.concat(pendingSegments.map((segment) => segment.audio));
      const combinedFormat = pendingSegments[pendingSegments.length - 1].format;

      await this.processAudio(combinedAudio, combinedFormat);
      return;
    }

    await this.processAudio(audio, format);
  }

  private async flushPendingAudioSegments(reason: string): Promise<void> {
    if (this.processingPhase === "transcribing" || this.pendingAudioSegments.length === 0) {
      return;
    }

    const pendingSegments = [...this.pendingAudioSegments];
    this.pendingAudioSegments = [];
    this.clearBufferTimeout();

    this.sessionLogger.debug(
      { reason, segmentCount: pendingSegments.length },
      `Flushing ${pendingSegments.length} buffered audio segment(s)`,
    );

    const combinedAudio = Buffer.concat(pendingSegments.map((segment) => segment.audio));
    const combinedFormat = pendingSegments[pendingSegments.length - 1].format;

    await this.processAudio(combinedAudio, combinedFormat);
  }

  /**
   * Process audio through STT and then LLM
   */
  private async processAudio(audio: Buffer, format: string): Promise<void> {
    this.setPhase("transcribing");

    this.emit({
      type: "activity_log",
      payload: {
        id: uuidv4(),
        timestamp: new Date(),
        type: "system",
        content: "Transcribing audio...",
      },
    });

    try {
      const requestId = uuidv4();
      const result = await this.sttManager.transcribe(audio, format, {
        requestId,
        label: this.isVoiceMode ? "voice" : "buffered",
      });

      const transcriptText = result.text.trim();
      this.sessionLogger.info(
        {
          requestId,
          isVoiceMode: this.isVoiceMode,
          transcriptLength: transcriptText.length,
          transcript: transcriptText,
        },
        "Transcription result",
      );

      await this.handleTranscriptionResultPayload({
        text: result.text,
        language: result.language,
        duration: result.duration,
        requestId,
        avgLogprob: result.avgLogprob,
        isLowConfidence: result.isLowConfidence,
        byteLength: result.byteLength,
        format: result.format,
        debugRecordingPath: result.debugRecordingPath,
      });
    } catch (error) {
      this.setPhase("idle");
      this.clearSpeechInProgress("transcription error");
      await this.flushPendingAudioSegments("transcription error");
      this.emit({
        type: "activity_log",
        payload: {
          id: uuidv4(),
          timestamp: new Date(),
          type: "error",
          content: `Transcription error: ${getErrorMessage(error)}`,
        },
      });
      throw error;
    }
  }

  private async handleTranscriptionResultPayload(
    result: VoiceTranscriptionResultPayload,
  ): Promise<void> {
    const transcriptText = result.text.trim();

    this.emit({
      type: "transcription_result",
      payload: {
        text: result.text,
        ...(result.language ? { language: result.language } : {}),
        ...(result.duration !== undefined ? { duration: result.duration } : {}),
        requestId: result.requestId,
        ...(result.avgLogprob !== undefined ? { avgLogprob: result.avgLogprob } : {}),
        ...(result.isLowConfidence !== undefined
          ? { isLowConfidence: result.isLowConfidence }
          : {}),
        ...(result.byteLength !== undefined ? { byteLength: result.byteLength } : {}),
        ...(result.format ? { format: result.format } : {}),
        ...(result.debugRecordingPath ? { debugRecordingPath: result.debugRecordingPath } : {}),
      },
    });

    if (!transcriptText) {
      this.sessionLogger.debug("Empty transcription (false positive), not aborting");
      this.setPhase("idle");
      this.clearSpeechInProgress("empty transcription");
      await this.flushPendingAudioSegments("empty transcription");
      return;
    }

    // Has content - abort any in-progress stream now
    this.createAbortController();

    if (result.debugRecordingPath) {
      this.emit({
        type: "activity_log",
        payload: {
          id: uuidv4(),
          timestamp: new Date(),
          type: "system",
          content: `Saved input audio: ${result.debugRecordingPath}`,
          metadata: {
            recordingPath: result.debugRecordingPath,
            ...(result.format ? { format: result.format } : {}),
            requestId: result.requestId,
          },
        },
      });
    }

    this.emit({
      type: "activity_log",
      payload: {
        id: uuidv4(),
        timestamp: new Date(),
        type: "transcript",
        content: result.text,
        metadata: {
          ...(result.language ? { language: result.language } : {}),
          ...(result.duration !== undefined ? { duration: result.duration } : {}),
        },
      },
    });

    this.clearSpeechInProgress("transcription complete");
    this.setPhase("idle");
    if (!this.isVoiceMode) {
      this.sessionLogger.debug(
        { requestId: result.requestId },
        "Skipping voice agent processing because voice mode is disabled",
      );
      await this.flushPendingAudioSegments("voice mode disabled");
      return;
    }

    const agentId = this.voiceModeAgentId;
    if (!agentId) {
      this.sessionLogger.warn(
        { requestId: result.requestId },
        "Skipping voice agent processing because no agent is currently voice-enabled",
      );
      await this.flushPendingAudioSegments("no active voice agent");
      return;
    }

    await this.handleSendAgentMessage(
      agentId,
      result.text,
      undefined,
      undefined,
      undefined,
      undefined,
      { spokenInput: true },
    );
    await this.flushPendingAudioSegments("transcription complete");
  }

  private registerVoiceBridgeForAgent(agentId: string): void {
    this.registerVoiceSpeakHandler?.(agentId, async ({ text, signal }) => {
      this.sessionLogger.info(
        {
          agentId,
          textLength: text.length,
          preview: text.slice(0, 160),
        },
        "Voice speak tool call received by session handler",
      );
      const abortSignal = signal ?? this.abortController.signal;
      await this.ttsManager.generateAndWaitForPlayback(
        text,
        (msg) => this.emit(msg),
        abortSignal,
        true,
      );
      this.sessionLogger.info(
        { agentId, textLength: text.length },
        "Voice speak tool call finished playback",
      );
      this.emit({
        type: "activity_log",
        payload: {
          id: uuidv4(),
          timestamp: new Date(),
          type: "assistant",
          content: text,
        },
      });
    });

    this.registerVoiceCallerContext?.(agentId, {
      childAgentDefaultLabels: {},
      allowCustomCwd: false,
      enableVoiceTools: true,
    });
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
  private handleAudioPlayed(id: string): void {
    this.ttsManager.confirmAudioPlayed(id);
  }

  /**
   * Mark speech detection start and abort any active playback/agent run.
   */
  private async handleVoiceSpeechStart(): Promise<void> {
    if (this.speechInProgress) {
      return;
    }

    const chunkReceivedAt = Date.now();
    const phaseBeforeAbort = this.processingPhase;
    const hadActiveStream = this.hasActiveAgentRun(this.voiceModeAgentId);

    this.speechInProgress = true;
    this.sessionLogger.debug("Voice speech detected – aborting playback and active agent run");

    if (this.pendingAudioSegments.length > 0) {
      this.sessionLogger.debug(
        { segmentCount: this.pendingAudioSegments.length },
        `Dropping ${this.pendingAudioSegments.length} buffered audio segment(s) due to voice speech`,
      );
      this.pendingAudioSegments = [];
    }

    if (this.audioBuffer) {
      this.sessionLogger.debug(
        { chunks: this.audioBuffer.chunks.length, pcmBytes: this.audioBuffer.totalPCMBytes },
        `Clearing partial audio buffer (${this.audioBuffer.chunks.length} chunk(s)${
          this.audioBuffer.isPCM ? `, ${this.audioBuffer.totalPCMBytes} PCM bytes` : ""
        })`,
      );
      this.audioBuffer = null;
    }

    this.clearBufferTimeout();

    this.abortController.abort();
    await this.handleAbort();

    const latencyMs = Date.now() - chunkReceivedAt;
    this.sessionLogger.debug(
      { latencyMs, phaseBeforeAbort, hadActiveStream },
      "[Telemetry] barge_in.llm_abort_latency",
    );
  }

  /**
   * Clear speech-in-progress flag once the user turn has completed
   */
  private clearSpeechInProgress(reason: string): void {
    if (!this.speechInProgress) {
      return;
    }

    this.speechInProgress = false;
    this.sessionLogger.debug({ reason }, `Speech turn complete (${reason}) – resuming TTS`);
  }

  /**
   * Create new AbortController, aborting the previous one
   */
  private createAbortController(): AbortController {
    this.abortController.abort();
    this.abortController = new AbortController();
    this.ttsDebugStreams.clear();
    return this.abortController;
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
  private setBufferTimeout(): void {
    this.clearBufferTimeout();

    this.bufferTimeout = setTimeout(async () => {
      this.sessionLogger.debug("Buffer timeout reached, processing pending segments");

      if (this.processingPhase === "transcribing") {
        this.sessionLogger.debug(
          { segmentCount: this.pendingAudioSegments.length },
          "Buffer timeout deferred because transcription is still in progress",
        );
        this.setBufferTimeout();
        return;
      }

      if (this.pendingAudioSegments.length > 0) {
        const segments = [...this.pendingAudioSegments];
        this.pendingAudioSegments = [];
        this.bufferTimeout = null;

        const combined = Buffer.concat(segments.map((s) => s.audio));
        await this.processAudio(combined, segments[0].format);
      }
    }, 10000); // 10 second timeout
  }

  /**
   * Clear buffer timeout
   */
  private clearBufferTimeout(): void {
    if (this.bufferTimeout) {
      clearTimeout(this.bufferTimeout);
      this.bufferTimeout = null;
    }
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

    for (const unsubscribe of this.workspaceGitSubscriptions.values()) {
      unsubscribe();
    }
    this.workspaceGitSubscriptions.clear();
  }

  private emitChatRpcError(request: { requestId: string; type: string }, error: unknown): void {
    const message = error instanceof Error ? error.message : "Chat request failed";
    const code = error instanceof ChatServiceError ? error.code : "chat_request_failed";
    this.sessionLogger.error({ err: error, requestType: request.type }, "Chat request failed");
    this.emit({
      type: "rpc_error",
      payload: {
        requestId: request.requestId,
        requestType: request.type,
        error: message,
        code,
      },
    });
  }

  private async handleChatCreateRequest(
    request: Extract<SessionInboundMessage, { type: "chat/create" }>,
  ): Promise<void> {
    try {
      const room = await this.chatService.createRoom({
        name: request.name,
        purpose: request.purpose,
      });
      this.emit({
        type: "chat/create/response",
        payload: {
          requestId: request.requestId,
          room,
          error: null,
        },
      });
    } catch (error) {
      this.emitChatRpcError(request, error);
    }
  }

  private async handleChatListRequest(
    request: Extract<SessionInboundMessage, { type: "chat/list" }>,
  ): Promise<void> {
    try {
      const rooms = await this.chatService.listRooms();
      this.emit({
        type: "chat/list/response",
        payload: {
          requestId: request.requestId,
          rooms,
          error: null,
        },
      });
    } catch (error) {
      this.emitChatRpcError(request, error);
    }
  }

  private async handleChatInspectRequest(
    request: Extract<SessionInboundMessage, { type: "chat/inspect" }>,
  ): Promise<void> {
    try {
      const result = await this.chatService.inspectRoom({
        room: request.room,
      });
      this.emit({
        type: "chat/inspect/response",
        payload: {
          requestId: request.requestId,
          room: result.room,
          error: null,
        },
      });
    } catch (error) {
      this.emitChatRpcError(request, error);
    }
  }

  private async handleChatDeleteRequest(
    request: Extract<SessionInboundMessage, { type: "chat/delete" }>,
  ): Promise<void> {
    try {
      const result = await this.chatService.deleteRoom({
        room: request.room,
      });
      this.emit({
        type: "chat/delete/response",
        payload: {
          requestId: request.requestId,
          room: result.room,
          error: null,
        },
      });
    } catch (error) {
      this.emitChatRpcError(request, error);
    }
  }

  private async handleChatPostRequest(
    request: Extract<SessionInboundMessage, { type: "chat/post" }>,
  ): Promise<void> {
    try {
      const authorAgentId = request.authorAgentId?.trim() || this.clientId;
      const mentionAgentIds = parseMentionAgentIds(request.body);
      const storedAgents = await this.agentStorage.list();
      const liveAgents = this.agentManager.listAgents();
      const fanout = await prepareChatMentionFanout({
        authorAgentId,
        mentionAgentIds,
        storedAgents,
        liveAgents,
        listRoomPosterAgentIds: () =>
          this.chatService.listRoomPosterAgentIds({ room: request.room }),
      });
      if (!fanout.ok) {
        throw new ChatServiceError("chat_mention_fanout_limit_exceeded", fanout.error);
      }
      const message = await this.chatService.dispatchMessage({
        room: request.room,
        authorAgentId,
        body: request.body,
        replyToMessageId: request.replyToMessageId,
      });
      this.emit({
        type: "chat/post/response",
        payload: {
          requestId: request.requestId,
          message,
          error: null,
        },
      });
      void notifyChatMentions({
        room: request.room,
        authorAgentId,
        body: request.body,
        mentionAgentIds: message.mentionAgentIds,
        logger: this.sessionLogger,
        storedAgents,
        liveAgents,
        prepared: fanout.prepared,
        resolveAgentIdentifier: (identifier) => this.resolveAgentIdentifier(identifier),
        sendAgentMessage: async (agentId, text) => {
          await sendPromptToAgent({
            agentManager: this.agentManager,
            agentStorage: this.agentStorage,
            agentId,
            prompt: formatSystemNotificationPrompt(text),
            unarchive: false,
            logger: this.sessionLogger,
          });
        },
      });
    } catch (error) {
      this.emitChatRpcError(request, error);
    }
  }

  private async handleChatReadRequest(
    request: Extract<SessionInboundMessage, { type: "chat/read" }>,
  ): Promise<void> {
    try {
      const messages = await this.chatService.readMessages({
        room: request.room,
        limit: request.limit,
        since: request.since,
        authorAgentId: request.authorAgentId,
      });
      this.emit({
        type: "chat/read/response",
        payload: {
          requestId: request.requestId,
          messages,
          error: null,
        },
      });
    } catch (error) {
      this.emitChatRpcError(request, error);
    }
  }

  private async handleChatWaitRequest(
    request: Extract<SessionInboundMessage, { type: "chat/wait" }>,
  ): Promise<void> {
    try {
      const messages = await this.chatService.waitForMessages({
        room: request.room,
        afterMessageId: request.afterMessageId,
        timeoutMs: request.timeoutMs,
      });
      this.emit({
        type: "chat/wait/response",
        payload: {
          requestId: request.requestId,
          messages,
          timedOut: messages.length === 0,
          error: null,
        },
      });
    } catch (error) {
      this.emitChatRpcError(request, error);
    }
  }

  private toScheduleSummary(
    schedule: Awaited<ReturnType<ScheduleService["inspect"]>>,
  ): Extract<
    SessionOutboundMessage,
    { type: "schedule/list/response" }
  >["payload"]["schedules"][number] {
    const { runs: _runs, ...summary } = schedule;
    return summary;
  }

  private emitScheduleRpcError(
    request: Extract<
      SessionInboundMessage,
      {
        type:
          | "schedule/create"
          | "schedule/list"
          | "schedule/inspect"
          | "schedule/logs"
          | "schedule/pause"
          | "schedule/resume"
          | "schedule/delete"
          | "schedule/run-once"
          | "schedule/update";
      }
    >,
    error: unknown,
  ): void {
    const message = error instanceof Error ? error.message : String(error);
    this.sessionLogger.error({ err: error, requestType: request.type }, "Schedule request failed");
    this.emit({
      type: "rpc_error",
      payload: {
        requestId: request.requestId,
        requestType: request.type,
        error: message,
        code: "schedule_request_failed",
      },
    });
  }

  private async handleScheduleCreateRequest(
    request: Extract<SessionInboundMessage, { type: "schedule/create" }>,
  ): Promise<void> {
    try {
      const target =
        request.target.type === "self"
          ? { type: "agent" as const, agentId: request.target.agentId }
          : request.target;
      const schedule = await this.scheduleService.create({
        prompt: request.prompt,
        name: request.name,
        cadence: request.cadence,
        target,
        maxRuns: request.maxRuns,
        expiresAt: request.expiresAt,
        runOnCreate: request.runOnCreate,
      });
      this.emit({
        type: "schedule/create/response",
        payload: {
          requestId: request.requestId,
          schedule: this.toScheduleSummary(schedule),
          error: null,
        },
      });
    } catch (error) {
      this.emitScheduleRpcError(request, error);
    }
  }

  private async handleScheduleListRequest(
    request: Extract<SessionInboundMessage, { type: "schedule/list" }>,
  ): Promise<void> {
    try {
      const schedules = await this.scheduleService.list();
      this.emit({
        type: "schedule/list/response",
        payload: {
          requestId: request.requestId,
          schedules: schedules.map((schedule) => this.toScheduleSummary(schedule)),
          error: null,
        },
      });
    } catch (error) {
      this.emitScheduleRpcError(request, error);
    }
  }

  private async handleScheduleInspectRequest(
    request: Extract<SessionInboundMessage, { type: "schedule/inspect" }>,
  ): Promise<void> {
    try {
      const schedule = await this.scheduleService.inspect(request.scheduleId);
      this.emit({
        type: "schedule/inspect/response",
        payload: {
          requestId: request.requestId,
          schedule,
          error: null,
        },
      });
    } catch (error) {
      this.emitScheduleRpcError(request, error);
    }
  }

  private async handleScheduleLogsRequest(
    request: Extract<SessionInboundMessage, { type: "schedule/logs" }>,
  ): Promise<void> {
    try {
      const runs = await this.scheduleService.logs(request.scheduleId);
      this.emit({
        type: "schedule/logs/response",
        payload: {
          requestId: request.requestId,
          runs,
          error: null,
        },
      });
    } catch (error) {
      this.emitScheduleRpcError(request, error);
    }
  }

  private async handleSchedulePauseRequest(
    request: Extract<SessionInboundMessage, { type: "schedule/pause" }>,
  ): Promise<void> {
    try {
      const schedule = await this.scheduleService.pause(request.scheduleId);
      this.emit({
        type: "schedule/pause/response",
        payload: {
          requestId: request.requestId,
          schedule: this.toScheduleSummary(schedule),
          error: null,
        },
      });
    } catch (error) {
      this.emitScheduleRpcError(request, error);
    }
  }

  private async handleScheduleResumeRequest(
    request: Extract<SessionInboundMessage, { type: "schedule/resume" }>,
  ): Promise<void> {
    try {
      const schedule = await this.scheduleService.resume(request.scheduleId);
      this.emit({
        type: "schedule/resume/response",
        payload: {
          requestId: request.requestId,
          schedule: this.toScheduleSummary(schedule),
          error: null,
        },
      });
    } catch (error) {
      this.emitScheduleRpcError(request, error);
    }
  }

  private async handleScheduleDeleteRequest(
    request: Extract<SessionInboundMessage, { type: "schedule/delete" }>,
  ): Promise<void> {
    try {
      await this.scheduleService.delete(request.scheduleId);
      this.emit({
        type: "schedule/delete/response",
        payload: {
          requestId: request.requestId,
          scheduleId: request.scheduleId,
          error: null,
        },
      });
    } catch (error) {
      this.emitScheduleRpcError(request, error);
    }
  }

  private async handleScheduleRunOnceRequest(
    request: Extract<SessionInboundMessage, { type: "schedule/run-once" }>,
  ): Promise<void> {
    try {
      const schedule = await this.scheduleService.runOnce(request.scheduleId);
      this.emit({
        type: "schedule/run-once/response",
        payload: {
          requestId: request.requestId,
          schedule,
          error: null,
        },
      });
    } catch (error) {
      this.emitScheduleRpcError(request, error);
    }
  }

  private async handleScheduleUpdateRequest(
    request: Extract<SessionInboundMessage, { type: "schedule/update" }>,
  ): Promise<void> {
    try {
      const schedule = await this.scheduleService.update({
        id: request.scheduleId,
        ...(request.name !== undefined ? { name: request.name } : {}),
        ...(request.prompt !== undefined ? { prompt: request.prompt } : {}),
        ...(request.cadence !== undefined ? { cadence: request.cadence } : {}),
        ...(request.newAgentConfig !== undefined ? { newAgentConfig: request.newAgentConfig } : {}),
        ...(request.maxRuns !== undefined ? { maxRuns: request.maxRuns } : {}),
        ...(request.expiresAt !== undefined ? { expiresAt: request.expiresAt } : {}),
      });
      this.emit({
        type: "schedule/update/response",
        payload: {
          requestId: request.requestId,
          schedule,
          error: null,
        },
      });
    } catch (error) {
      this.emitScheduleRpcError(request, error);
    }
  }

  private emitLoopRpcError(
    request: Extract<
      SessionInboundMessage,
      {
        type: "loop/run" | "loop/list" | "loop/inspect" | "loop/logs" | "loop/stop";
      }
    >,
    error: unknown,
  ): void {
    const message = error instanceof Error ? error.message : String(error);
    this.sessionLogger.error({ err: error, requestType: request.type }, "Loop request failed");
    this.emit({
      type: "rpc_error",
      payload: {
        requestId: request.requestId,
        requestType: request.type,
        error: message,
        code: "loop_request_failed",
      },
    });
  }

  private async handleLoopRunRequest(
    request: Extract<SessionInboundMessage, { type: "loop/run" }>,
  ): Promise<void> {
    try {
      const loop = await this.loopService.runLoop({
        prompt: request.prompt,
        cwd: request.cwd,
        provider: request.provider,
        model: request.model,
        modeId: request.modeId,
        workerProvider: request.workerProvider,
        workerModel: request.workerModel,
        verifierProvider: request.verifierProvider,
        verifierModel: request.verifierModel,
        verifierModeId: request.verifierModeId,
        verifyPrompt: request.verifyPrompt,
        verifyChecks: request.verifyChecks,
        archive: request.archive,
        name: request.name,
        sleepMs: request.sleepMs,
        maxIterations: request.maxIterations,
        maxTimeMs: request.maxTimeMs,
      });
      this.emit({
        type: "loop/run/response",
        payload: {
          requestId: request.requestId,
          loop,
          error: null,
        },
      });
    } catch (error) {
      this.emitLoopRpcError(request, error);
    }
  }

  private async handleLoopListRequest(
    request: Extract<SessionInboundMessage, { type: "loop/list" }>,
  ): Promise<void> {
    try {
      const loops = await this.loopService.listLoops();
      this.emit({
        type: "loop/list/response",
        payload: {
          requestId: request.requestId,
          loops,
          error: null,
        },
      });
    } catch (error) {
      this.emitLoopRpcError(request, error);
    }
  }

  private async handleLoopInspectRequest(
    request: Extract<SessionInboundMessage, { type: "loop/inspect" }>,
  ): Promise<void> {
    try {
      const loop = await this.loopService.inspectLoop(request.id);
      this.emit({
        type: "loop/inspect/response",
        payload: {
          requestId: request.requestId,
          loop,
          error: null,
        },
      });
    } catch (error) {
      this.emitLoopRpcError(request, error);
    }
  }

  private async handleLoopLogsRequest(
    request: Extract<SessionInboundMessage, { type: "loop/logs" }>,
  ): Promise<void> {
    try {
      const result = await this.loopService.getLoopLogs(request.id, request.afterSeq ?? 0);
      this.emit({
        type: "loop/logs/response",
        payload: {
          requestId: request.requestId,
          loop: result.loop,
          entries: result.entries,
          nextCursor: result.nextCursor,
          error: null,
        },
      });
    } catch (error) {
      this.emitLoopRpcError(request, error);
    }
  }

  private async handleLoopStopRequest(
    request: Extract<SessionInboundMessage, { type: "loop/stop" }>,
  ): Promise<void> {
    try {
      const loop = await this.loopService.stopLoop(request.id);
      this.emit({
        type: "loop/stop/response",
        payload: {
          requestId: request.requestId,
          loop,
          error: null,
        },
      });
    } catch (error) {
      this.emitLoopRpcError(request, error);
    }
  }
}
