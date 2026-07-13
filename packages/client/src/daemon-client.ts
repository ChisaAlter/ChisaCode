import type { z } from "zod";
import { CLIENT_CAPS } from "@chisacode/protocol/client-capabilities";
import {
  AgentCreateFailedStatusPayloadSchema,
  AgentCreatedStatusPayloadSchema,
  AgentRefreshedStatusPayloadSchema,
  AgentResumedStatusPayloadSchema,
  CheckoutRenameBranchResponseSchema,
  parseServerInfoStatusPayload,
  RestartRequestedStatusPayloadSchema,
  ShutdownRequestedStatusPayloadSchema,
  SessionInboundMessageSchema,
  type ServerInfoStatusPayload,
  WSOutboundMessageSchema,
} from "@chisacode/protocol/messages";
import type {
  AgentStreamEventPayload,
  AgentSnapshotPayload,
  ProjectPlacementPayload,
  AgentPermissionResolvedMessage,
  CreateAgentRequestMessage,
  CreateChisaCodeWorktreeRequest,
  FileDownloadTokenResponse,
  FileExplorerResponse,
  FetchAgentTimelineResponseMessage,
  GitSetupOptions,
  CheckoutStatusResponse,
  CheckoutCommitResponse,
  CheckoutMergeResponse,
  CheckoutMergeFromBaseResponse,
  CheckoutPullResponse,
  CheckoutPushResponse,
  CheckoutRefreshResponse,
  CheckoutPrCreateResponse,
  CheckoutPrMergeResponse,
  CheckoutPrMergeMethod,
  CheckoutGithubSetAutoMergeResponse,
  CheckoutPrStatusResponse,
  PullRequestTimelineResponse,
  CheckoutSwitchBranchResponse,
  StashSaveResponse,
  StashPopResponse,
  StashListResponse,
  ValidateBranchResponse,
  BranchSuggestionsResponse,
  GitHubSearchResponse,
  GitHubSearchRequest,
  DirectorySuggestionsResponse,
  ChisaCodeWorktreeListResponse,
  ChisaCodeWorktreeArchiveResponse,
  ProjectIconResponse,
  ListAvailableEditorsResponseMessage,
  OpenInEditorResponseMessage,
  OpenProjectResponseMessage,
  ArchiveWorkspaceResponseMessage,
  WorkspaceSetupStatusResponseMessage,
  ListCommandsResponse,
  ListProviderFeaturesResponseMessage,
  ListProviderModelsResponseMessage,
  ListProviderModesResponseMessage,
  ListAvailableProvidersResponse,
  GetProvidersSnapshotResponseMessage,
  RefreshProvidersSnapshotResponseMessage,
  ProviderDiagnosticResponseMessage,
  ProviderToolingActionResponseMessage,
  AgentPresetsListResponseMessage,
  ModelGatewayMoaTestResponseMessage,
  DaemonGetStatusResponse,
  DaemonGetPairingOfferResponse,
  AgentSkillManagementScope,
  AgentSkillsListResponse,
  AgentSkillsPolicyPatchResponse,
  AgentSkillsInstallResponse,
  AgentSkillsInstallSourceSchema,
  AgentSkillsUninstallResponse,
  AgentMcpServerManagementScope,
  AgentMcpServersListResponse,
  AgentMcpServersUpsertResponse,
  AgentMcpServersPolicyPatchResponse,
  AgentMcpServersDeleteResponse,
  ManagedMcpServerConfig,
  AgentRewindResponseMessage,
  SubscribeTerminalRequest,
  CloseItemsResponse,
  TerminalInput,
  SessionInboundMessage,
  SessionOutboundMessage,
  SendAgentMessageRequest,
  EditorTargetId,
  ChisaCodeConfigRaw,
  ChisaCodeConfigRevision,
  UsageClearResponseMessage,
  UsageExportResponseMessage,
  UsageSummaryGetResponseMessage,
} from "@chisacode/protocol/messages";
import type { SyntheticModelConfig } from "@chisacode/protocol/provider-config";
import type {
  AgentPermissionRequest,
  AgentPermissionResponse,
  AgentPersistenceHandle,
  AgentProvider,
  AgentSessionConfig,
} from "@chisacode/protocol/agent-types";
import type { MutableDaemonConfig, MutableDaemonConfigPatch } from "@chisacode/protocol/messages";
import { isRelayClientWebSocketUrl } from "@chisacode/protocol/daemon-endpoints";
import {
  asUint8Array,
  decodeFileTransferFrame,
  decodeTerminalStreamFrame,
  TerminalStreamOpcode,
  type FileTransferFrame,
} from "@chisacode/protocol/binary-frames/index";
import {
  createRelayE2eeTransportFactory,
  createWebSocketTransportFactory,
  decodeMessageData,
  defaultWebSocketFactory,
  describeTransportClose,
  describeTransportError,
  type DaemonTransport,
  type DaemonTransportFactory,
  type WebSocketFactory,
} from "./daemon-client-transport.js";
import { CheckoutCommandClient } from "./daemon-client-checkout-commands.js";
import { CheckoutSubscriptionClient } from "./daemon-client-checkout-subscriptions.js";
import { ConfigCommandClient } from "./daemon-client-config-commands.js";
import { ProviderCommandClient } from "./daemon-client-provider-commands.js";
import { AgentExtensionCommandClient } from "./daemon-client-agent-extension-commands.js";
import { AutomationCommandClient } from "./daemon-client-automation-commands.js";
import { WorkspaceCommandClient } from "./daemon-client-workspace-commands.js";
import { DaemonClientRuntimeMetrics } from "./daemon-client-runtime-metrics.js";
import {
  BinaryFileTransferManager,
  legacyExplorerFileToBytes,
  type FileReadResult,
} from "./daemon-client-file-transfer.js";
import {
  TerminalClient,
  type CaptureTerminalPayload,
  type CreateTerminalPayload,
  type KillTerminalPayload,
  type ListTerminalsPayload,
  type RenameTerminalInput,
  type RenameTerminalResult,
  type SubscribeTerminalPayload,
  type TerminalStreamEvent,
} from "./daemon-client-terminal-client.js";

export type { FileReadResult } from "./daemon-client-file-transfer.js";

export interface Logger {
  debug(obj: object, msg?: string): void;
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}

const consoleLogger: Logger = {
  debug: () => {},
  info: (obj, msg) => console.log(msg, obj),
  warn: (obj, msg) => console.warn(msg, obj),
  error: (obj, msg) => console.error(msg, obj),
};

const perfNow: () => number =
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? () => performance.now()
    : () => Date.now();

interface ImportAgentInputBase {
  cwd?: string;
  labels?: Record<string, string>;
}

export type ImportAgentInput =
  | (ImportAgentInputBase & {
      providerId: string;
      providerHandleId: string;
    })
  | (ImportAgentInputBase & {
      provider: AgentProvider;
      sessionId: string;
    });

function normalizePassword(value: string | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  return value.length > 0 ? value : null;
}

export type {
  DaemonTransport,
  DaemonTransportFactory,
  WebSocketFactory,
  WebSocketLike,
} from "./daemon-client-transport.js";

export type { RenameTerminalInput, RenameTerminalResult, TerminalStreamEvent };

export type ConnectionState =
  | { status: "idle" }
  | { status: "connecting"; attempt: number }
  | { status: "connected" }
  | { status: "disconnected"; reason?: string }
  | { status: "disposed" };

export type DaemonEvent =
  | {
      type: "agent_update";
      agentId: string;
      payload: Extract<SessionOutboundMessage, { type: "agent_update" }>["payload"];
    }
  | {
      type: "workspace_update";
      workspaceId: string;
      payload: Extract<SessionOutboundMessage, { type: "workspace_update" }>["payload"];
    }
  | {
      type: "workspace_setup_progress";
      workspaceId: string;
      payload: Extract<SessionOutboundMessage, { type: "workspace_setup_progress" }>["payload"];
    }
  | {
      type: "agent_stream";
      agentId: string;
      event: AgentStreamEventPayload;
      timestamp: string;
      seq?: number;
      epoch?: string;
    }
  | { type: "status"; payload: { status: string } & Record<string, unknown> }
  | { type: "agent_deleted"; agentId: string }
  | {
      type: "agent_permission_request";
      agentId: string;
      request: AgentPermissionRequest;
    }
  | {
      type: "agent_permission_resolved";
      agentId: string;
      requestId: string;
      resolution: AgentPermissionResponse;
    }
  | {
      type: "providers_snapshot_update";
      payload: Extract<SessionOutboundMessage, { type: "providers_snapshot_update" }>["payload"];
    }
  | { type: "error"; message: string };

export type DaemonEventHandler = (event: DaemonEvent) => void;

export interface DaemonClientConfig {
  url: string;
  clientId: string;
  clientType?: "mobile" | "browser" | "cli" | "mcp";
  appVersion?: string;
  runtimeGeneration?: number | null;
  password?: string;
  authHeader?: string;
  suppressSendErrors?: boolean;
  transportFactory?: DaemonTransportFactory;
  webSocketFactory?: WebSocketFactory;
  logger?: Logger;
  connectTimeoutMs?: number;
  e2ee?: {
    enabled?: boolean;
    daemonPublicKeyB64?: string;
  };
  reconnect?: {
    enabled?: boolean;
    baseDelayMs?: number;
    maxDelayMs?: number;
  };
  runtimeMetricsIntervalMs?: number;
  runtimeMetricsWindowMs?: number;
}

export interface SendMessageOptions {
  messageId?: string;
  images?: Array<{ data: string; mimeType: string }>;
  attachments?: SendAgentMessageRequest["attachments"];
}

type AgentConfigOverrides = Partial<Omit<AgentSessionConfig, "provider" | "cwd">>;

export interface CreateAgentRequestOptions extends AgentConfigOverrides {
  config?: AgentSessionConfig;
  provider?: AgentProvider;
  cwd?: string;
  env?: CreateAgentRequestMessage["env"];
  workspaceId?: string;
  initialPrompt?: string;
  clientMessageId?: string;
  outputSchema?: Record<string, unknown>;
  images?: CreateAgentRequestMessage["images"];
  attachments?: CreateAgentRequestMessage["attachments"];
  git?: GitSetupOptions;
  worktree?: CreateAgentRequestMessage["worktree"];
  autoArchive?: CreateAgentRequestMessage["autoArchive"];
  worktreeName?: string;
  requestId?: string;
  labels?: Record<string, string>;
}

export interface CreateChisaCodeWorktreeInput extends Pick<
  CreateChisaCodeWorktreeRequest,
  | "cwd"
  | "projectId"
  | "worktreeSlug"
  | "firstAgentContext"
  | "refName"
  | "action"
  | "githubPrNumber"
> {}

type CheckoutStatusPayload = CheckoutStatusResponse["payload"];
type SubscribeCheckoutDiffPayload = Extract<
  SessionOutboundMessage,
  { type: "subscribe_checkout_diff_response" }
>["payload"];
type CheckoutDiffPayload = Omit<SubscribeCheckoutDiffPayload, "subscriptionId">;
type CheckoutCommitPayload = CheckoutCommitResponse["payload"];
type CheckoutMergePayload = CheckoutMergeResponse["payload"];
type CheckoutMergeFromBasePayload = CheckoutMergeFromBaseResponse["payload"];
type CheckoutPullPayload = CheckoutPullResponse["payload"];
type CheckoutPushPayload = CheckoutPushResponse["payload"];
type CheckoutRefreshPayload = CheckoutRefreshResponse["payload"];
type CheckoutPrCreatePayload = CheckoutPrCreateResponse["payload"];
type CheckoutPrMergePayload = CheckoutPrMergeResponse["payload"];
type CheckoutGithubSetAutoMergePayload = CheckoutGithubSetAutoMergeResponse["payload"];
type CheckoutPrStatusPayload = CheckoutPrStatusResponse["payload"];
type PullRequestTimelinePayload = PullRequestTimelineResponse["payload"];
type CheckoutSwitchBranchPayload = CheckoutSwitchBranchResponse["payload"];
export type RenameBranchResult = z.infer<typeof CheckoutRenameBranchResponseSchema>["payload"];
type StashSavePayload = StashSaveResponse["payload"];
type StashPopPayload = StashPopResponse["payload"];
type StashListPayload = StashListResponse["payload"];
type ValidateBranchPayload = ValidateBranchResponse["payload"];
type BranchSuggestionsPayload = BranchSuggestionsResponse["payload"];
type GitHubSearchPayload = GitHubSearchResponse["payload"];
type DirectorySuggestionsPayload = DirectorySuggestionsResponse["payload"];
type ChisaCodeWorktreeListPayload = ChisaCodeWorktreeListResponse["payload"];
type ChisaCodeWorktreeArchivePayload = ChisaCodeWorktreeArchiveResponse["payload"];
type CreateChisaCodeWorktreePayload = Extract<
  SessionOutboundMessage,
  { type: "create_chisacode_worktree_response" }
>["payload"];
type FileExplorerPayload = FileExplorerResponse["payload"];
export type FileExplorerDirectoryPayload = NonNullable<FileExplorerPayload["directory"]>;
type FileDownloadTokenPayload = FileDownloadTokenResponse["payload"];
type ListProviderFeaturesPayload = ListProviderFeaturesResponseMessage["payload"];
type ListProviderModelsPayload = ListProviderModelsResponseMessage["payload"];
type ListProviderModesPayload = ListProviderModesResponseMessage["payload"];
type ListAvailableProvidersPayload = ListAvailableProvidersResponse["payload"];
type GetProvidersSnapshotPayload = GetProvidersSnapshotResponseMessage["payload"];
type RefreshProvidersSnapshotPayload = RefreshProvidersSnapshotResponseMessage["payload"];
type ProviderDiagnosticPayload = ProviderDiagnosticResponseMessage["payload"];
type ProviderToolingActionPayload = ProviderToolingActionResponseMessage["payload"];
type AgentPresetsListPayload = AgentPresetsListResponseMessage["payload"];
type ModelGatewayMoaTestPayload = ModelGatewayMoaTestResponseMessage["payload"];
type DaemonStatusPayload = DaemonGetStatusResponse["payload"];
type DaemonPairingOfferPayload = DaemonGetPairingOfferResponse["payload"];
type ReadProjectConfigPayload = Extract<
  SessionOutboundMessage,
  { type: "read_project_config_response" }
>["payload"];
type WriteProjectConfigPayload = Extract<
  SessionOutboundMessage,
  { type: "write_project_config_response" }
>["payload"];
type ListCommandsPayload = ListCommandsResponse["payload"];
type AgentSkillsListPayload = AgentSkillsListResponse["payload"];
type AgentSkillsPolicyPatchPayload = AgentSkillsPolicyPatchResponse["payload"];
type AgentSkillsInstallPayload = AgentSkillsInstallResponse["payload"];
type AgentSkillsInstallSource = z.infer<typeof AgentSkillsInstallSourceSchema>;
type AgentSkillsUninstallPayload = AgentSkillsUninstallResponse["payload"];
type AgentMcpServersListPayload = AgentMcpServersListResponse["payload"];
type AgentMcpServersUpsertPayload = AgentMcpServersUpsertResponse["payload"];
type AgentMcpServersPolicyPatchPayload = AgentMcpServersPolicyPatchResponse["payload"];
type AgentMcpServersDeletePayload = AgentMcpServersDeleteResponse["payload"];
type ListCommandsDraftConfig = Pick<
  AgentSessionConfig,
  "provider" | "cwd" | "modeId" | "model" | "thinkingOptionId" | "featureValues"
>;
export interface WriteProjectConfigInput {
  repoRoot: string;
  config: ChisaCodeConfigRaw;
  expectedRevision: ChisaCodeConfigRevision | null;
  requestId?: string;
}
interface ListCommandsOptions {
  requestId?: string;
  draftConfig?: ListCommandsDraftConfig;
}

export interface RunModelGatewayMoaTestInput {
  gatewayId: string;
  syntheticModel: SyntheticModelConfig;
  prompt: string;
  requestId?: string;
}
type SetVoiceModePayload = Extract<
  SessionOutboundMessage,
  { type: "set_voice_mode_response" }
>["payload"];
type DictationFinishAcceptedPayload = Extract<
  SessionOutboundMessage,
  { type: "dictation_stream_finish_accepted" }
>["payload"];
type AgentPermissionResolvedPayload = AgentPermissionResolvedMessage["payload"];
type CloseItemsPayload = CloseItemsResponse["payload"];
type ChatCreatePayload = Extract<
  SessionOutboundMessage,
  { type: "chat/create/response" }
>["payload"];
type ChatListPayload = Extract<SessionOutboundMessage, { type: "chat/list/response" }>["payload"];
type ChatInspectPayload = Extract<
  SessionOutboundMessage,
  { type: "chat/inspect/response" }
>["payload"];
type ChatDeletePayload = Extract<
  SessionOutboundMessage,
  { type: "chat/delete/response" }
>["payload"];
type ChatPostPayload = Extract<SessionOutboundMessage, { type: "chat/post/response" }>["payload"];
type ChatReadPayload = Extract<SessionOutboundMessage, { type: "chat/read/response" }>["payload"];
type ChatWaitPayload = Extract<SessionOutboundMessage, { type: "chat/wait/response" }>["payload"];
type LoopRunPayload = Extract<SessionOutboundMessage, { type: "loop/run/response" }>["payload"];
type LoopListPayload = Extract<SessionOutboundMessage, { type: "loop/list/response" }>["payload"];
type LoopInspectPayload = Extract<
  SessionOutboundMessage,
  { type: "loop/inspect/response" }
>["payload"];
type LoopLogsPayload = Extract<SessionOutboundMessage, { type: "loop/logs/response" }>["payload"];
type LoopStopPayload = Extract<SessionOutboundMessage, { type: "loop/stop/response" }>["payload"];
type ScheduleCreatePayload = Extract<
  SessionOutboundMessage,
  { type: "schedule/create/response" }
>["payload"];
type ScheduleListPayload = Extract<
  SessionOutboundMessage,
  { type: "schedule/list/response" }
>["payload"];
type ScheduleInspectPayload = Extract<
  SessionOutboundMessage,
  { type: "schedule/inspect/response" }
>["payload"];
type ScheduleLogsPayload = Extract<
  SessionOutboundMessage,
  { type: "schedule/logs/response" }
>["payload"];
type SchedulePausePayload = Extract<
  SessionOutboundMessage,
  { type: "schedule/pause/response" }
>["payload"];
type ScheduleResumePayload = Extract<
  SessionOutboundMessage,
  { type: "schedule/resume/response" }
>["payload"];
type ScheduleDeletePayload = Extract<
  SessionOutboundMessage,
  { type: "schedule/delete/response" }
>["payload"];
type ScheduleRunOncePayload = Extract<
  SessionOutboundMessage,
  { type: "schedule/run-once/response" }
>["payload"];
type ScheduleUpdatePayload = Extract<
  SessionOutboundMessage,
  { type: "schedule/update/response" }
>["payload"];
export type FetchAgentTimelinePayload = FetchAgentTimelineResponseMessage["payload"];

export type FetchAgentTimelineDirection = FetchAgentTimelinePayload["direction"];
export type FetchAgentTimelineProjection = FetchAgentTimelinePayload["projection"];
export type FetchAgentTimelineCursor = NonNullable<FetchAgentTimelinePayload["startCursor"]>;
export interface FetchAgentTimelineOptions {
  direction?: FetchAgentTimelineDirection;
  cursor?: FetchAgentTimelineCursor;
  limit?: number;
  projection?: FetchAgentTimelineProjection;
  requestId?: string;
}

type AgentRefreshedStatusPayload = z.infer<typeof AgentRefreshedStatusPayloadSchema>;
type RestartRequestedStatusPayload = z.infer<typeof RestartRequestedStatusPayloadSchema>;
type ShutdownRequestedStatusPayload = z.infer<typeof ShutdownRequestedStatusPayloadSchema>;
type FetchAgentsPayload = Extract<
  SessionOutboundMessage,
  { type: "fetch_agents_response" }
>["payload"];
type FetchAgentsRequest = Extract<SessionInboundMessage, { type: "fetch_agents_request" }>;
export type FetchAgentsOptions = Omit<FetchAgentsRequest, "type" | "requestId"> & {
  requestId?: string;
};
export type FetchAgentsEntry = FetchAgentsPayload["entries"][number];
export type FetchAgentsPageInfo = FetchAgentsPayload["pageInfo"];
type FetchAgentHistoryPayload = Extract<
  SessionOutboundMessage,
  { type: "fetch_agent_history_response" }
>["payload"];
type FetchAgentHistoryRequest = Extract<
  SessionInboundMessage,
  { type: "fetch_agent_history_request" }
>;
export type FetchAgentHistoryOptions = Omit<FetchAgentHistoryRequest, "type" | "requestId"> & {
  requestId?: string;
};
export type FetchAgentHistoryEntry = FetchAgentHistoryPayload["entries"][number];
export type FetchAgentHistoryPageInfo = FetchAgentHistoryPayload["pageInfo"];
type FetchRecentProviderSessionsPayload = Extract<
  SessionOutboundMessage,
  { type: "fetch_recent_provider_sessions_response" }
>["payload"];
type FetchRecentProviderSessionsRequest = Extract<
  SessionInboundMessage,
  { type: "fetch_recent_provider_sessions_request" }
>;
export type FetchRecentProviderSessionsOptions = Omit<
  FetchRecentProviderSessionsRequest,
  "type" | "requestId"
> & {
  requestId?: string;
};
export type FetchRecentProviderSessionEntry = FetchRecentProviderSessionsPayload["entries"][number];
export type UsageSummaryPayload = UsageSummaryGetResponseMessage["payload"];
type UsageSummaryGetRequest = Extract<SessionInboundMessage, { type: "usage.summary.get.request" }>;
export type FetchUsageSummaryOptions = Omit<UsageSummaryGetRequest, "type" | "requestId"> & {
  requestId?: string;
};
export type UsageExportPayload = UsageExportResponseMessage["payload"];
type UsageExportRequest = Extract<SessionInboundMessage, { type: "usage.export.request" }>;
export type ExportUsageOptions = Omit<UsageExportRequest, "type" | "requestId"> & {
  requestId?: string;
};
export type UsageClearPayload = UsageClearResponseMessage["payload"];
type FetchWorkspacesPayload = Extract<
  SessionOutboundMessage,
  { type: "fetch_workspaces_response" }
>["payload"];
type FetchWorkspacesRequest = Extract<SessionInboundMessage, { type: "fetch_workspaces_request" }>;
export type FetchWorkspacesOptions = Omit<FetchWorkspacesRequest, "type" | "requestId"> & {
  requestId?: string;
};
export type FetchWorkspacesEntry = FetchWorkspacesPayload["entries"][number];
export type FetchWorkspacesPageInfo = FetchWorkspacesPayload["pageInfo"];
export interface CreateChatRoomOptions {
  name: string;
  purpose?: string | null;
  requestId?: string;
}
export interface InspectChatRoomOptions {
  room: string;
  requestId?: string;
}
export interface DeleteChatRoomOptions {
  room: string;
  requestId?: string;
}
export interface PostChatMessageOptions {
  room: string;
  body: string;
  authorAgentId?: string;
  replyToMessageId?: string | null;
  requestId?: string;
}
export interface ReadChatMessagesOptions {
  room: string;
  limit?: number;
  since?: string;
  authorAgentId?: string;
  requestId?: string;
}
export interface WaitForChatMessagesOptions {
  room: string;
  afterMessageId?: string | null;
  timeoutMs?: number;
  requestId?: string;
}
export interface RunLoopOptions {
  prompt: string;
  cwd: string;
  provider?: string;
  model?: string;
  modeId?: string;
  verifierProvider?: string;
  verifierModel?: string;
  verifierModeId?: string;
  verifyPrompt?: string | null;
  verifyChecks?: string[];
  name?: string | null;
  sleepMs?: number;
  maxIterations?: number;
  maxTimeMs?: number;
  requestId?: string;
}
export interface InspectLoopOptions {
  id: string;
  requestId?: string;
}
export interface LoopLogsOptions {
  id: string;
  afterSeq?: number;
  requestId?: string;
}
export interface StopLoopOptions {
  id: string;
  requestId?: string;
}
export interface CreateScheduleOptions {
  prompt: string;
  name?: string | null;
  cadence:
    | {
        type: "every";
        everyMs: number;
      }
    | {
        type: "cron";
        expression: string;
      };
  target:
    | {
        type: "self";
        agentId: string;
      }
    | {
        type: "agent";
        agentId: string;
      }
    | {
        type: "new-agent";
        config: {
          provider: AgentProvider;
          cwd: string;
          modeId?: string;
          model?: string;
          thinkingOptionId?: string;
          title?: string | null;
          approvalPolicy?: string;
          sandboxMode?: string;
          networkAccess?: boolean;
          webSearch?: boolean;
          extra?: AgentSessionConfig["extra"];
          systemPrompt?: string;
          mcpServers?: AgentSessionConfig["mcpServers"];
        };
      };
  maxRuns?: number;
  expiresAt?: string;
  runOnCreate?: boolean;
  requestId?: string;
}
export interface InspectScheduleOptions {
  id: string;
  requestId?: string;
}
export interface UpdateScheduleNewAgentConfig {
  provider?: string;
  model?: string | null;
  modeId?: string | null;
  cwd?: string;
}
export interface UpdateScheduleOptions {
  id: string;
  name?: string | null;
  prompt?: string;
  cadence?:
    | {
        type: "every";
        everyMs: number;
      }
    | {
        type: "cron";
        expression: string;
      };
  newAgentConfig?: UpdateScheduleNewAgentConfig;
  maxRuns?: number | null;
  expiresAt?: string | null;
  requestId?: string;
}
export interface RenameBranchInput {
  cwd: string;
  branch: string;
  requestId?: string;
}
type ListAvailableEditorsPayload = ListAvailableEditorsResponseMessage["payload"];
type OpenInEditorPayload = OpenInEditorResponseMessage["payload"];
type OpenProjectPayload = OpenProjectResponseMessage["payload"];
type ArchiveWorkspacePayload = ArchiveWorkspaceResponseMessage["payload"];
type WorkspaceSetupStatusPayload = WorkspaceSetupStatusResponseMessage["payload"];
export type EditorTargetDescriptor = ListAvailableEditorsPayload["editors"][number];

export interface FetchAgentResult {
  agent: AgentSnapshotPayload;
  project: ProjectPlacementPayload | null;
}

export interface WaitForFinishResult {
  status: "idle" | "error" | "permission" | "timeout";
  final: AgentSnapshotPayload | null;
  error: string | null;
  lastMessage: string | null;
}

interface Waiter<T> {
  predicate: (msg: SessionOutboundMessage) => T | null;
  resolve(value: T): void;
  reject(error: Error): void;
  timeoutHandle: ReturnType<typeof setTimeout> | null;
}

interface WaitHandle<T> {
  promise: Promise<T>;
  cancel: (error: Error) => void;
}

type RpcWaitResult<T> = { kind: "ok"; value: T } | { kind: "error"; error: DaemonRpcError };
type GetDaemonConfigResponse = Extract<
  SessionOutboundMessage,
  { type: "get_daemon_config_response" }
>;
type SetDaemonConfigResponse = Extract<
  SessionOutboundMessage,
  { type: "set_daemon_config_response" }
>;
type CorrelatedResponseMessage =
  | Extract<SessionOutboundMessage, { payload: { requestId: string } }>
  | GetDaemonConfigResponse
  | SetDaemonConfigResponse;
type CorrelatedResponseType = CorrelatedResponseMessage["type"];
type CorrelatedResponsePayload<TType extends CorrelatedResponseType> = Extract<
  CorrelatedResponseMessage,
  { type: TType }
>["payload"];

class DaemonRpcError extends Error {
  readonly requestId: string;
  readonly requestType?: string;
  readonly code?: string;

  constructor(params: { requestId: string; error: string; requestType?: string; code?: string }) {
    const parts = [params.error];
    if (params.requestType) parts.push(`requestType=${params.requestType}`);
    if (params.code) parts.push(`code=${params.code}`);
    super(parts.join(" "));
    this.name = "DaemonRpcError";
    this.requestId = params.requestId;
    this.requestType = params.requestType;
    this.code = params.code;
  }
}

const DEFAULT_RECONNECT_BASE_DELAY_MS = 1500;
const DEFAULT_RECONNECT_MAX_DELAY_MS = 30000;
const DEFAULT_CONNECT_TIMEOUT_MS = 15000;
const DEFAULT_LIVENESS_TIMEOUT_MS = 5000;
const DEFAULT_FETCH_AGENT_TIMELINE_TIMEOUT_MS = 60000;
const LIVENESS_FAILURE_RECONNECT_THRESHOLD = 2;

/** Default timeout for waiting for connection before sending queued messages */
const DEFAULT_SEND_QUEUE_TIMEOUT_MS = 10000;
const DEFAULT_DICTATION_FINISH_ACCEPT_TIMEOUT_MS = 15000;
const DEFAULT_DICTATION_FINISH_FALLBACK_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_DICTATION_FINISH_TIMEOUT_GRACE_MS = 5000;

function isWaiterTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith("Timeout waiting for message");
}

function normalizeClientId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function hashForLog(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return `h_${Math.abs(hash).toString(16)}`;
}

function toReasonCode(reason: string | null | undefined): string | null {
  if (!reason) {
    return null;
  }
  const normalized = reason.toLowerCase();
  if (normalized.includes("timed out")) {
    return "connect_timeout";
  }
  if (normalized.includes("disposed")) {
    return "disposed";
  }
  if (normalized.includes("client closed")) {
    return "client_closed";
  }
  if (normalized.includes("transport")) {
    return "transport_error";
  }
  if (normalized.includes("failed to connect")) {
    return "connect_failed";
  }
  return "unknown";
}

interface PendingSend {
  message: SessionInboundMessage;
  resolve: () => void;
  reject: (error: Error) => void;
  timeoutHandle: ReturnType<typeof setTimeout>;
}

interface LivenessProbe {
  promise: Promise<{ rttMs: number }>;
  resolve: (value: { rttMs: number }) => void;
  reject: (error: Error) => void;
  timeoutHandle: ReturnType<typeof setTimeout>;
  startedAt: number;
}

export class DaemonClient {
  private transport: DaemonTransport | null = null;
  private transportCleanup: Array<() => void> = [];
  private rawMessageListeners: Set<(message: SessionOutboundMessage) => void> = new Set();
  private messageHandlers: Map<
    SessionOutboundMessage["type"],
    Set<(message: SessionOutboundMessage) => void>
  > = new Map();
  private eventListeners: Set<DaemonEventHandler> = new Set();
  private waiters: Set<Waiter<unknown>> = new Set();
  private connectionListeners: Set<(status: ConnectionState) => void> = new Set();
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private connectTimeout: ReturnType<typeof setTimeout> | null = null;
  private pendingGenericTransportErrorTimeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private shouldReconnect = true;
  private connectPromise: Promise<void> | null = null;
  private connectResolve: (() => void) | null = null;
  private connectReject: ((error: Error) => void) | null = null;
  private lastErrorValue: string | null = null;
  private connectionState: ConnectionState = { status: "idle" };
  private readonly checkoutCommands: CheckoutCommandClient;
  private readonly checkoutSubscriptions: CheckoutSubscriptionClient;
  private readonly configCommands: ConfigCommandClient;
  private readonly providerCommands: ProviderCommandClient;
  private readonly agentExtensionCommands: AgentExtensionCommandClient;
  private readonly automationCommands: AutomationCommandClient;
  private readonly workspaceCommands: WorkspaceCommandClient;
  private readonly terminalClient: TerminalClient;
  private readonly binaryFileTransfers = new BinaryFileTransferManager();
  private logger: Logger;
  private pendingSendQueue: PendingSend[] = [];
  private readonly logConnectionPath: "direct" | "relay";
  private readonly logServerId: string | null;
  private readonly logClientIdHash: string;
  private readonly logGeneration: number | null;
  private lastServerInfoMessage: ServerInfoStatusPayload | null = null;
  private runtimeMetricsInterval: ReturnType<typeof setInterval> | null = null;
  private runtimeMetrics: DaemonClientRuntimeMetrics | null = null;
  private livenessProbe: LivenessProbe | null = null;
  private consecutiveLivenessFailures = 0;

  constructor(private config: DaemonClientConfig) {
    this.logger = config.logger ?? consoleLogger;
    this.checkoutCommands = new CheckoutCommandClient({
      request: (params) => this.sendCorrelatedSessionRequest(params),
    });
    this.checkoutSubscriptions = new CheckoutSubscriptionClient({
      createRequestId: (requestId) => this.createRequestId(requestId),
      sendRequest: (params) => this.sendRequest(params),
      sendMessage: (message) => this.sendSessionMessage(message),
    });
    this.configCommands = new ConfigCommandClient({
      request: (params) => this.sendCorrelatedSessionRequest(params),
    });
    this.providerCommands = new ProviderCommandClient({
      request: (params) => this.sendCorrelatedSessionRequest(params),
    });
    this.agentExtensionCommands = new AgentExtensionCommandClient({
      request: (params) => this.sendCorrelatedSessionRequest(params),
    });
    this.automationCommands = new AutomationCommandClient({
      request: (params) => this.sendCorrelatedSessionRequest(params),
    });
    this.workspaceCommands = new WorkspaceCommandClient({
      request: (params) => this.sendCorrelatedSessionRequest(params),
    });
    this.terminalClient = new TerminalClient({
      request: (params) => this.sendCorrelatedSessionRequest(params),
      isConnected: () => Boolean(this.transport && this.connectionState.status === "connected"),
      sendMessage: (message) => this.sendSessionMessage(message),
      sendBinaryFrame: (frame) => this.sendBinaryFrame(frame),
    });
    this.logConnectionPath = isRelayClientWebSocketUrl(this.config.url) ? "relay" : "direct";
    let parsedUrlForLog: URL | null = null;
    try {
      parsedUrlForLog = new URL(this.config.url);
    } catch {
      parsedUrlForLog = null;
    }
    const parsedServerIdForLog = normalizeClientId(parsedUrlForLog?.searchParams.get("serverId"));
    this.logServerId = parsedServerIdForLog ?? parsedUrlForLog?.host ?? null;
    const resolvedClientId = normalizeClientId(this.config.clientId);
    if (!resolvedClientId) {
      throw new Error("Daemon client requires a non-empty clientId");
    }
    this.config.clientId = resolvedClientId;
    this.logClientIdHash = hashForLog(resolvedClientId);
    this.logGeneration =
      typeof this.config.runtimeGeneration === "number" &&
      Number.isFinite(this.config.runtimeGeneration)
        ? this.config.runtimeGeneration
        : null;
    const runtimeMetricsIntervalMs =
      typeof config.runtimeMetricsIntervalMs === "number" && config.runtimeMetricsIntervalMs > 0
        ? config.runtimeMetricsIntervalMs
        : 0;
    if (runtimeMetricsIntervalMs > 0) {
      const runtimeMetricsWindowMs =
        typeof config.runtimeMetricsWindowMs === "number" && config.runtimeMetricsWindowMs > 0
          ? Math.max(config.runtimeMetricsWindowMs, runtimeMetricsIntervalMs)
          : undefined;
      this.runtimeMetrics = new DaemonClientRuntimeMetrics(
        this.logger,
        {
          connectionPath: this.logConnectionPath,
          serverId: this.logServerId,
          getConnectionStatus: () => this.connectionState.status,
        },
        runtimeMetricsWindowMs ? { windowMs: runtimeMetricsWindowMs } : undefined,
      );
      this.runtimeMetricsInterval = setInterval(() => {
        this.runtimeMetrics?.flush();
      }, runtimeMetricsIntervalMs);
    }
  }

  // ============================================================================
  // Connection
  // ============================================================================

  async connect(): Promise<void> {
    if (this.connectionState.status === "disposed") {
      throw new Error("Daemon client is disposed");
    }
    if (this.connectionState.status === "connected") {
      return;
    }
    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.shouldReconnect = true;
    this.connectPromise = new Promise((resolve, reject) => {
      this.connectResolve = resolve;
      this.connectReject = reject;
      this.attemptConnect();
    });

    return this.connectPromise;
  }

  private attemptConnect(): void {
    if (this.connectionState.status === "disposed") {
      this.rejectConnect(new Error("Daemon client is disposed"));
      return;
    }
    if (!this.shouldReconnect) {
      this.rejectConnect(new Error("Daemon client is closed"));
      return;
    }

    if (this.connectionState.status === "connecting") {
      return;
    }

    const headers: Record<string, string> = {};
    const password = normalizePassword(this.config.password);
    if (password) {
      headers.Authorization = `Bearer ${password}`;
    } else if (this.config.authHeader) {
      headers.Authorization = this.config.authHeader;
    }
    const protocols = password ? [`chisacode.bearer.${password}`] : undefined;

    try {
      // Reconnect can overlap with browser close/error delivery ordering.
      // Always dispose previous transport before constructing the next one.
      this.disposeTransport();
      const baseTransportFactory =
        this.config.transportFactory ??
        createWebSocketTransportFactory(this.config.webSocketFactory ?? defaultWebSocketFactory);
      const shouldUseRelayE2ee =
        this.config.e2ee?.enabled === true && isRelayClientWebSocketUrl(this.config.url);

      let transportFactory = baseTransportFactory;
      if (shouldUseRelayE2ee) {
        const daemonPublicKeyB64 = this.config.e2ee?.daemonPublicKeyB64;
        if (!daemonPublicKeyB64) {
          throw new Error("daemonPublicKeyB64 is required for relay E2EE");
        }
        transportFactory = createRelayE2eeTransportFactory({
          baseFactory: baseTransportFactory,
          daemonPublicKeyB64,
          logger: this.logger,
        });
      }
      const transportUrl = this.resolveTransportUrlForAttempt();
      const transport = transportFactory({
        url: transportUrl,
        headers,
        ...(protocols ? { protocols } : {}),
      });
      this.transport = transport;
      this.lastServerInfoMessage = null;

      this.updateConnectionState(
        {
          status: "connecting",
          attempt: this.reconnectAttempt,
        },
        { event: "CONNECT_REQUEST" },
      );
      this.resetConnectTimeout();
      const timeoutMs = Math.max(1, this.config.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS);
      this.connectTimeout = setTimeout(() => {
        if (this.connectionState.status !== "connecting") {
          return;
        }
        this.lastErrorValue = "Connection timed out";
        this.disposeTransport(1001, "Connection timed out");
        this.scheduleReconnect({
          reason: "Connection timed out",
          event: "CONNECT_TIMEOUT",
          reasonCode: "connect_timeout",
        });
      }, timeoutMs);

      this.transportCleanup = [
        transport.onOpen(() => {
          if (this.transport !== transport) {
            return;
          }
          if (this.pendingGenericTransportErrorTimeout) {
            clearTimeout(this.pendingGenericTransportErrorTimeout);
            this.pendingGenericTransportErrorTimeout = null;
          }
          this.lastErrorValue = null;
          this.sendHelloMessage();
        }),
        transport.onClose((event) => {
          if (this.transport !== transport) {
            return;
          }
          this.resetConnectTimeout();
          if (this.pendingGenericTransportErrorTimeout) {
            clearTimeout(this.pendingGenericTransportErrorTimeout);
            this.pendingGenericTransportErrorTimeout = null;
          }
          const reason = describeTransportClose(event);
          if (reason) {
            this.lastErrorValue = reason;
          }
          this.scheduleReconnect({
            reason,
            event: "TRANSPORT_CLOSE",
            reasonCode: "transport_closed",
          });
        }),
        transport.onError((event) => {
          if (this.transport !== transport) {
            return;
          }
          this.resetConnectTimeout();
          const reason = describeTransportError(event);
          const isGeneric = reason === "Transport error";
          // Browser WebSocket.onerror often provides no useful details and is followed
          // by a close event (often with code 1006). Prefer surfacing the close details
          // instead of immediately disconnecting with a generic "Transport error".
          if (isGeneric) {
            this.lastErrorValue ??= reason;
            if (!this.pendingGenericTransportErrorTimeout) {
              this.pendingGenericTransportErrorTimeout = setTimeout(() => {
                this.pendingGenericTransportErrorTimeout = null;
                if (
                  this.connectionState.status === "connected" ||
                  this.connectionState.status === "connecting"
                ) {
                  this.lastErrorValue = reason;
                  this.scheduleReconnect({
                    reason,
                    event: "TRANSPORT_ERROR",
                    reasonCode: "transport_error",
                  });
                }
              }, 250);
            }
            return;
          }

          if (this.pendingGenericTransportErrorTimeout) {
            clearTimeout(this.pendingGenericTransportErrorTimeout);
            this.pendingGenericTransportErrorTimeout = null;
          }
          this.lastErrorValue = reason;
          this.scheduleReconnect({
            reason,
            event: "TRANSPORT_ERROR",
            reasonCode: "transport_error",
          });
        }),
        transport.onMessage((data) => {
          if (this.transport === transport) {
            this.handleTransportMessage(data, transport);
          }
        }),
      ];
    } catch (error) {
      this.resetConnectTimeout();
      const message = error instanceof Error ? error.message : "Failed to connect";
      this.lastErrorValue = message;
      this.scheduleReconnect({
        reason: message,
        event: "CONNECT_FAILED",
        reasonCode: "connect_failed",
      });
      // scheduleReconnect may already rejectConnect (e.g. when disposed) before
      // reaching here; only reject if the connect promise is still pending so we
      // don't double-reject. rejectConnect itself no-ops on a null connectReject,
      // but guarding keeps the control flow explicit.
      if (this.connectReject) {
        this.rejectConnect(error instanceof Error ? error : new Error(message));
      }
    }
  }

  private resolveConnect(): void {
    if (this.connectResolve) {
      this.connectResolve();
    }
    this.connectPromise = null;
    this.connectResolve = null;
    this.connectReject = null;
  }

  private rejectConnect(error: Error): void {
    if (this.connectReject) {
      this.connectReject(error);
    }
    this.connectPromise = null;
    this.connectResolve = null;
    this.connectReject = null;
  }

  async close(): Promise<void> {
    if (this.connectionState.status === "disposed") {
      return;
    }
    this.shouldReconnect = false;
    this.rejectConnect(new Error("Daemon client closed"));
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.resetConnectTimeout();
    this.disposeTransport(1000, "Client closed");
    this.clearWaiters(new Error("Daemon client closed"));
    this.rejectPendingSendQueue(new Error("Daemon client closed"));
    this.rejectLivenessProbe(new Error("Daemon client closed"));
    this.terminalClient.clearStreamSlots();
    this.binaryFileTransfers.clearActiveTransfers();
    this.lastServerInfoMessage = null;
    if (this.runtimeMetricsInterval) {
      clearInterval(this.runtimeMetricsInterval);
      this.runtimeMetricsInterval = null;
      this.runtimeMetrics?.flush({ final: true });
      this.runtimeMetrics = null;
    }
    this.updateConnectionState(
      { status: "disposed" },
      { event: "DISPOSE", reason: "Client closed", reasonCode: "disposed" },
    );
  }

  ensureConnected(): void {
    if (this.connectionState.status === "disposed") {
      return;
    }
    if (!this.shouldReconnect) {
      this.shouldReconnect = true;
    }
    if (
      this.connectionState.status === "connected" ||
      this.connectionState.status === "connecting"
    ) {
      return;
    }
    // connect() handles its own failures via scheduleReconnect + rejectConnect,
    // but a rejection here would otherwise become an unhandled promise rejection.
    // Surface it to the logger so the failure is at least observable.
    void this.connect().catch((error: unknown) => {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.warn({ err }, "ensureConnected connect() rejected");
    });
  }

  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  subscribeConnectionStatus(listener: (status: ConnectionState) => void): () => void {
    this.connectionListeners.add(listener);
    listener(this.connectionState);
    return () => {
      this.connectionListeners.delete(listener);
    };
  }

  get isConnected(): boolean {
    return this.connectionState.status === "connected";
  }

  get isConnecting(): boolean {
    return this.connectionState.status === "connecting";
  }

  get lastError(): string | null {
    return this.lastErrorValue;
  }

  // ============================================================================
  // Message Subscription
  // ============================================================================

  subscribe(handler: DaemonEventHandler): () => void {
    this.eventListeners.add(handler);
    return () => this.eventListeners.delete(handler);
  }

  subscribeRawMessages(handler: (message: SessionOutboundMessage) => void): () => void {
    this.rawMessageListeners.add(handler);
    return () => {
      this.rawMessageListeners.delete(handler);
    };
  }

  on<TType extends SessionOutboundMessage["type"]>(
    type: TType,
    handler: (message: Extract<SessionOutboundMessage, { type: TType }>) => void,
  ): () => void;
  on(handler: DaemonEventHandler): () => void;
  on(
    arg1: SessionOutboundMessage["type"] | DaemonEventHandler,
    arg2?: (message: SessionOutboundMessage) => void,
  ): () => void {
    if (typeof arg1 === "function") {
      return this.subscribe(arg1);
    }

    const type = arg1;
    const handler = arg2!;

    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, new Set());
    }
    this.messageHandlers.get(type)!.add(handler);

    return () => {
      const handlers = this.messageHandlers.get(type);
      if (!handlers) {
        return;
      }
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.messageHandlers.delete(type);
      }
    };
  }

  // ============================================================================
  // Core Send Helpers
  // ============================================================================

  /**
   * Send a session message. For fire-and-forget messages (heartbeats, etc.),
   * failures are suppressed if `suppressSendErrors` is configured.
   * For RPC methods that wait for responses, use `sendSessionMessageOrThrow` instead.
   */
  private sendSessionMessage(message: SessionInboundMessage): void {
    if (!this.transport || this.connectionState.status !== "connected") {
      if (this.config.suppressSendErrors) {
        return;
      }
      throw new Error(`Transport not connected (status: ${this.connectionState.status})`);
    }
    const payload = SessionInboundMessageSchema.parse(message);
    try {
      this.transport.send(JSON.stringify({ type: "session", message: payload }));
    } catch (error) {
      if (this.config.suppressSendErrors) {
        return;
      }
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  private sendBinaryFrame(frame: Uint8Array): void {
    if (!this.transport || this.connectionState.status !== "connected") {
      if (this.config.suppressSendErrors) {
        return;
      }
      throw new Error(`Transport not connected (status: ${this.connectionState.status})`);
    }
    try {
      this.transport.send(frame);
    } catch (error) {
      if (this.config.suppressSendErrors) {
        return;
      }
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  /**
   * Send a session message for RPC methods that create waiters.
   * If the connection is still being established ("connecting"), the message
   * is queued and will be sent once connected (or rejected after timeout).
   * This prevents waiters from hanging forever when called during connection.
   */
  private sendSessionMessageOrThrow(message: SessionInboundMessage): Promise<void> {
    const status = this.connectionState.status;

    // If connected, send immediately
    if (this.transport && status === "connected") {
      const payload = SessionInboundMessageSchema.parse(message);
      this.transport.send(JSON.stringify({ type: "session", message: payload }));
      return Promise.resolve();
    }

    // If connecting, queue the message to be sent once connected
    if (status === "connecting") {
      return new Promise((resolve, reject) => {
        const timeoutHandle = setTimeout(() => {
          // Remove from queue
          const idx = this.pendingSendQueue.findIndex((p) => p.resolve === resolve);
          if (idx !== -1) {
            this.pendingSendQueue.splice(idx, 1);
          }
          reject(new Error(`Timed out waiting for connection to send message`));
        }, DEFAULT_SEND_QUEUE_TIMEOUT_MS);

        this.pendingSendQueue.push({ message, resolve, reject, timeoutHandle });
      });
    }

    // Not connected and not connecting - fail immediately
    return Promise.reject(new Error(`Transport not connected (status: ${status})`));
  }

  /**
   * Flush pending send queue - called when connection is established.
   */
  private flushPendingSendQueue(): void {
    const queue = this.pendingSendQueue;
    this.pendingSendQueue = [];

    for (const pending of queue) {
      clearTimeout(pending.timeoutHandle);
      try {
        if (this.transport && this.connectionState.status === "connected") {
          const payload = SessionInboundMessageSchema.parse(pending.message);
          this.transport.send(JSON.stringify({ type: "session", message: payload }));
          pending.resolve();
        } else {
          pending.reject(new Error("Connection lost before message could be sent"));
        }
      } catch (error) {
        pending.reject(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  /**
   * Reject all pending sends - called when connection fails or is closed.
   */
  private rejectPendingSendQueue(error: Error): void {
    const queue = this.pendingSendQueue;
    this.pendingSendQueue = [];

    for (const pending of queue) {
      clearTimeout(pending.timeoutHandle);
      pending.reject(error);
    }
  }

  private async sendRequest<T>(params: {
    requestId: string;
    message: SessionInboundMessage;
    timeout: number;
    select: (msg: SessionOutboundMessage) => T | null;
    options?: { skipQueue?: boolean };
  }): Promise<T> {
    const { promise, cancel } = this.waitForWithCancel<RpcWaitResult<T>>(
      (msg) => {
        if (msg.type === "rpc_error" && msg.payload.requestId === params.requestId) {
          return {
            kind: "error",
            error: new DaemonRpcError({
              requestId: msg.payload.requestId,
              error: msg.payload.error,
              requestType: msg.payload.requestType,
              code: msg.payload.code,
            }),
          };
        }
        const value = params.select(msg);
        if (value === null) {
          return null;
        }
        return { kind: "ok", value };
      },
      params.timeout,
      params.options,
    );

    try {
      await this.sendSessionMessageOrThrow(params.message);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      cancel(err);
      void promise.catch(() => undefined);
      throw err;
    }

    const result = await promise;
    if (result.kind === "error") {
      throw result.error;
    }
    return result.value;
  }

  private async sendCorrelatedRequest<
    TResponseType extends CorrelatedResponseType,
    TResult = CorrelatedResponsePayload<TResponseType>,
  >(params: {
    requestId: string;
    message: SessionInboundMessage;
    timeout: number;
    responseType: TResponseType;
    options?: { skipQueue?: boolean };
    selectPayload?: (payload: CorrelatedResponsePayload<TResponseType>) => TResult | null;
  }): Promise<TResult> {
    return this.sendRequest({
      requestId: params.requestId,
      message: params.message,
      timeout: params.timeout,
      options: params.options,
      select: (msg) => {
        const correlated = msg as CorrelatedResponseMessage;
        if (correlated.type !== params.responseType) {
          return null;
        }
        const payload = correlated.payload as unknown as CorrelatedResponsePayload<TResponseType>;
        if (payload.requestId !== params.requestId) {
          return null;
        }
        if (!params.selectPayload) {
          return payload as TResult;
        }
        return params.selectPayload(payload);
      },
    });
  }

  private sendCorrelatedSessionRequest<
    TResponseType extends CorrelatedResponseType,
    TResult = CorrelatedResponsePayload<TResponseType>,
  >(params: {
    requestId?: string;
    message: { type: SessionInboundMessage["type"] } & Record<string, unknown>;
    responseType: TResponseType;
    timeout: number;
    selectPayload?: (payload: CorrelatedResponsePayload<TResponseType>) => TResult | null;
  }): Promise<TResult> {
    const resolvedRequestId = this.createRequestId(params.requestId);
    const message = SessionInboundMessageSchema.parse({
      ...params.message,
      requestId: resolvedRequestId,
    });
    return this.sendCorrelatedRequest({
      requestId: resolvedRequestId,
      message,
      responseType: params.responseType,
      timeout: params.timeout,
      options: { skipQueue: true },
      ...(params.selectPayload ? { selectPayload: params.selectPayload } : {}),
    });
  }

  private sendNamespacedCorrelatedSessionRequest<
    TResponseType extends CorrelatedResponseType,
    TResult = CorrelatedResponsePayload<TResponseType>,
  >(params: {
    requestId?: string;
    message: { type: Extract<SessionInboundMessage["type"], `${string}.request`> } & Record<
      string,
      unknown
    >;
    timeout: number;
    selectPayload?: (payload: CorrelatedResponsePayload<TResponseType>) => TResult | null;
  }): Promise<TResult> {
    const responseType = params.message.type.replace(/\.request$/, ".response") as TResponseType;
    return this.sendCorrelatedSessionRequest({
      ...params,
      responseType,
    });
  }

  private sendSessionMessageStrict(message: SessionInboundMessage): void {
    if (!this.transport || this.connectionState.status !== "connected") {
      throw new Error("Transport not connected");
    }
    const payload = SessionInboundMessageSchema.parse(message);
    try {
      this.transport.send(JSON.stringify({ type: "session", message: payload }));
    } catch (error) {
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  async clearAgentAttention(agentId: string | string[]): Promise<void> {
    const requestId = this.createRequestId();
    const message = SessionInboundMessageSchema.parse({
      type: "clear_agent_attention",
      agentId,
      requestId,
    });
    await this.sendRequest({
      requestId,
      message,
      timeout: 15000,
      options: { skipQueue: true },
      select: (msg) => {
        if (msg.type !== "clear_agent_attention_response") {
          return null;
        }
        if (msg.payload.requestId !== requestId) {
          return null;
        }
        return msg.payload;
      },
    });
  }

  sendHeartbeat(params: {
    deviceType: "web" | "mobile";
    focusedAgentId: string | null;
    lastActivityAt: string;
    appVisible: boolean;
    appVisibilityChangedAt?: string;
  }): void {
    this.sendSessionMessage({
      type: "client_heartbeat",
      deviceType: params.deviceType,
      focusedAgentId: params.focusedAgentId,
      lastActivityAt: params.lastActivityAt,
      appVisible: params.appVisible,
      appVisibilityChangedAt: params.appVisibilityChangedAt,
    });
  }

  registerPushToken(token: string): void {
    this.sendSessionMessage({
      type: "register_push_token",
      token,
    });
  }

  async ping(params?: { requestId?: string; timeoutMs?: number }): Promise<{
    requestId: string;
    clientSentAt: number;
    serverReceivedAt: number;
    serverSentAt: number;
    rttMs: number;
  }> {
    const requestId =
      params?.requestId ?? `ping-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const clientSentAt = Date.now();

    const payload = await this.sendRequest({
      requestId,
      message: { type: "ping", requestId, clientSentAt },
      timeout: params?.timeoutMs ?? 5000,
      select: (msg) => {
        if (msg.type !== "pong") return null;
        if (msg.payload.requestId !== requestId) return null;
        if (typeof msg.payload.serverReceivedAt !== "number") return null;
        if (typeof msg.payload.serverSentAt !== "number") return null;
        return msg.payload;
      },
    });

    return {
      requestId,
      clientSentAt,
      serverReceivedAt: payload.serverReceivedAt,
      serverSentAt: payload.serverSentAt,
      rttMs: Date.now() - clientSentAt,
    };
  }

  checkLiveness(params?: { timeoutMs?: number }): Promise<{ rttMs: number }> {
    if (this.connectionState.status !== "connected" || !this.transport) {
      return Promise.reject(
        new Error(`Transport not connected (status: ${this.connectionState.status})`),
      );
    }

    if (this.livenessProbe) {
      return this.livenessProbe.promise;
    }

    const startedAt = perfNow();
    const timeoutMs = Math.max(1, params?.timeoutMs ?? DEFAULT_LIVENESS_TIMEOUT_MS);
    let resolveProbe: ((value: { rttMs: number }) => void) | null = null;
    let rejectProbe: ((error: Error) => void) | null = null;
    const promise = new Promise<{ rttMs: number }>((resolve, reject) => {
      resolveProbe = resolve;
      rejectProbe = reject;
    });
    const probe: LivenessProbe = {
      promise,
      resolve: (value) => resolveProbe?.(value),
      reject: (error) => rejectProbe?.(error),
      timeoutHandle: setTimeout(() => {
        if (this.livenessProbe !== probe) {
          return;
        }
        this.livenessProbe = null;
        const error = new Error(`Liveness check timed out (${timeoutMs}ms)`);
        probe.reject(error);
        this.recordLivenessFailure(error);
      }, timeoutMs),
      startedAt,
    };
    this.livenessProbe = probe;

    try {
      this.transport.send(JSON.stringify({ type: "ping" }));
    } catch (error) {
      this.clearLivenessProbe();
      const err = error instanceof Error ? error : new Error(String(error));
      this.recordLivenessFailure(err);
      return Promise.reject(err);
    }

    return promise;
  }

  // ============================================================================
  // Agent RPCs (requestId-correlated)
  // ============================================================================

  async fetchAgents(options?: FetchAgentsOptions): Promise<FetchAgentsPayload> {
    const resolvedRequestId = this.createRequestId(options?.requestId);
    const message = SessionInboundMessageSchema.parse({
      type: "fetch_agents_request",
      requestId: resolvedRequestId,
      ...(options?.scope ? { scope: options.scope } : {}),
      ...(options?.filter ? { filter: options.filter } : {}),
      ...(options?.sort ? { sort: options.sort } : {}),
      ...(options?.page ? { page: options.page } : {}),
      ...(options?.subscribe ? { subscribe: options.subscribe } : {}),
    });
    return this.sendRequest({
      requestId: resolvedRequestId,
      message,
      timeout: 10000,
      options: { skipQueue: true },
      select: (msg) => {
        if (msg.type !== "fetch_agents_response") {
          return null;
        }
        if (msg.payload.requestId !== resolvedRequestId) {
          return null;
        }
        return msg.payload;
      },
    });
  }

  async fetchAgentHistory(options?: FetchAgentHistoryOptions): Promise<FetchAgentHistoryPayload> {
    const resolvedRequestId = this.createRequestId(options?.requestId);
    const message = SessionInboundMessageSchema.parse({
      type: "fetch_agent_history_request",
      requestId: resolvedRequestId,
      ...(options?.filter ? { filter: options.filter } : {}),
      ...(options?.sort ? { sort: options.sort } : {}),
      ...(options?.page ? { page: options.page } : {}),
    });
    return this.sendRequest({
      requestId: resolvedRequestId,
      message,
      timeout: 10000,
      options: { skipQueue: true },
      select: (msg) => {
        if (msg.type !== "fetch_agent_history_response") {
          return null;
        }
        if (msg.payload.requestId !== resolvedRequestId) {
          return null;
        }
        return msg.payload;
      },
    });
  }

  async fetchRecentProviderSessions(
    options?: FetchRecentProviderSessionsOptions,
  ): Promise<FetchRecentProviderSessionsPayload> {
    const resolvedRequestId = this.createRequestId(options?.requestId);
    const message = SessionInboundMessageSchema.parse({
      type: "fetch_recent_provider_sessions_request",
      requestId: resolvedRequestId,
      ...(options?.cwd ? { cwd: options.cwd } : {}),
      ...(options?.providers ? { providers: options.providers } : {}),
      ...(options?.since ? { since: options.since } : {}),
      ...(options?.limit ? { limit: options.limit } : {}),
    });
    return this.sendRequest({
      requestId: resolvedRequestId,
      message,
      timeout: 10000,
      options: { skipQueue: true },
      select: (msg) => {
        if (msg.type !== "fetch_recent_provider_sessions_response") {
          return null;
        }
        if (msg.payload.requestId !== resolvedRequestId) {
          return null;
        }
        return msg.payload;
      },
    });
  }

  async fetchUsageSummary(options?: FetchUsageSummaryOptions): Promise<UsageSummaryPayload> {
    return this.sendNamespacedCorrelatedSessionRequest<"usage.summary.get.response">({
      requestId: options?.requestId,
      message: {
        type: "usage.summary.get.request",
        ...(options?.rangeDays ? { rangeDays: options.rangeDays } : {}),
      },
      timeout: 10000,
    });
  }

  async exportUsage(options?: ExportUsageOptions): Promise<UsageExportPayload> {
    return this.sendNamespacedCorrelatedSessionRequest<"usage.export.response">({
      requestId: options?.requestId,
      message: {
        type: "usage.export.request",
        ...(options?.format ? { format: options.format } : {}),
      },
      timeout: 10000,
    });
  }

  async clearUsage(requestId?: string): Promise<UsageClearPayload> {
    return this.sendNamespacedCorrelatedSessionRequest<"usage.clear.response">({
      requestId,
      message: {
        type: "usage.clear.request",
      },
      timeout: 10000,
    });
  }

  async fetchWorkspaces(options?: FetchWorkspacesOptions): Promise<FetchWorkspacesPayload> {
    const resolvedRequestId = this.createRequestId(options?.requestId);
    const message = SessionInboundMessageSchema.parse({
      type: "fetch_workspaces_request",
      requestId: resolvedRequestId,
      ...(options?.filter ? { filter: options.filter } : {}),
      ...(options?.sort ? { sort: options.sort } : {}),
      ...(options?.page ? { page: options.page } : {}),
      ...(options?.subscribe ? { subscribe: options.subscribe } : {}),
    });
    return this.sendRequest({
      requestId: resolvedRequestId,
      message,
      timeout: 10000,
      options: { skipQueue: true },
      select: (msg) => {
        if (msg.type !== "fetch_workspaces_response") {
          return null;
        }
        if (msg.payload.requestId !== resolvedRequestId) {
          return null;
        }
        return msg.payload;
      },
    });
  }

  async openProject(cwd: string, requestId?: string): Promise<OpenProjectPayload> {
    return this.workspaceCommands.openProject(cwd, requestId);
  }

  async startWorkspaceScript(
    workspaceId: string,
    scriptName: string,
    requestId?: string,
  ): Promise<
    Extract<SessionOutboundMessage, { type: "start_workspace_script_response" }>["payload"]
  > {
    return this.workspaceCommands.startWorkspaceScript(workspaceId, scriptName, requestId);
  }

  async listAvailableEditors(requestId?: string): Promise<ListAvailableEditorsPayload> {
    return this.workspaceCommands.listAvailableEditors(requestId);
  }

  async openInEditor(
    path: string,
    editorId: EditorTargetId,
    requestId?: string,
  ): Promise<OpenInEditorPayload> {
    return this.workspaceCommands.openInEditor(path, editorId, requestId);
  }

  async archiveWorkspace(
    workspaceId: string,
    requestId?: string,
  ): Promise<ArchiveWorkspacePayload> {
    return this.workspaceCommands.archiveWorkspace(workspaceId, requestId);
  }

  async fetchWorkspaceSetupStatus(
    workspaceId: string,
    requestId?: string,
  ): Promise<WorkspaceSetupStatusPayload> {
    return this.workspaceCommands.fetchWorkspaceSetupStatus(workspaceId, requestId);
  }

  async fetchAgent(agentId: string, requestId?: string): Promise<FetchAgentResult | null> {
    const resolvedRequestId = this.createRequestId(requestId);
    const message = SessionInboundMessageSchema.parse({
      type: "fetch_agent_request",
      requestId: resolvedRequestId,
      agentId,
    });
    const payload = await this.sendRequest({
      requestId: resolvedRequestId,
      message,
      timeout: 10000,
      options: { skipQueue: true },
      select: (msg) => {
        if (msg.type !== "fetch_agent_response") {
          return null;
        }
        if (msg.payload.requestId !== resolvedRequestId) {
          return null;
        }
        return msg.payload;
      },
    });
    if (payload.error) {
      throw new Error(payload.error);
    }
    if (!payload.agent) {
      return null;
    }
    return { agent: payload.agent, project: payload.project ?? null };
  }

  // ============================================================================
  // Agent Lifecycle
  // ============================================================================

  async createAgent(options: CreateAgentRequestOptions): Promise<AgentSnapshotPayload> {
    const requestId = this.createRequestId(options.requestId);
    const config = resolveAgentConfig(options);

    const message = SessionInboundMessageSchema.parse({
      type: "create_agent_request",
      requestId,
      config,
      ...(options.env ? { env: options.env } : {}),
      ...(options.workspaceId !== undefined ? { workspaceId: options.workspaceId } : {}),
      ...(options.initialPrompt ? { initialPrompt: options.initialPrompt } : {}),
      ...(options.clientMessageId ? { clientMessageId: options.clientMessageId } : {}),
      ...(options.outputSchema ? { outputSchema: options.outputSchema } : {}),
      ...(options.images && options.images.length > 0 ? { images: options.images } : {}),
      ...(options.attachments && options.attachments.length > 0
        ? { attachments: options.attachments }
        : {}),
      ...(options.git ? { git: options.git } : {}),
      ...(options.worktree ? { worktree: options.worktree } : {}),
      ...(options.autoArchive !== undefined ? { autoArchive: options.autoArchive } : {}),
      ...(options.worktreeName ? { worktreeName: options.worktreeName } : {}),
      ...(options.labels && Object.keys(options.labels).length > 0
        ? { labels: options.labels }
        : {}),
    });

    const status = await this.sendRequest({
      requestId,
      message,
      timeout: 60000,
      options: { skipQueue: true },
      select: (msg) => {
        if (msg.type !== "status") {
          return null;
        }
        const created = AgentCreatedStatusPayloadSchema.safeParse(msg.payload);
        if (created.success && created.data.requestId === requestId) {
          return created.data;
        }
        const failed = AgentCreateFailedStatusPayloadSchema.safeParse(msg.payload);
        if (failed.success && failed.data.requestId === requestId) {
          return failed.data;
        }
        return null;
      },
    });
    if (status.status === "agent_create_failed") {
      throw new Error(status.error);
    }

    return status.agent;
  }

  async deleteAgent(agentId: string): Promise<void> {
    const requestId = this.createRequestId();
    const message = SessionInboundMessageSchema.parse({
      type: "delete_agent_request",
      agentId,
      requestId,
    });
    await this.sendRequest({
      requestId,
      message,
      timeout: 10000,
      options: { skipQueue: true },
      select: (msg) => {
        if (msg.type !== "agent_deleted") {
          return null;
        }
        if (msg.payload.requestId !== requestId) {
          return null;
        }
        return msg.payload;
      },
    });
  }

  async archiveAgent(agentId: string): Promise<{ archivedAt: string }> {
    const requestId = this.createRequestId();
    const message = SessionInboundMessageSchema.parse({
      type: "archive_agent_request",
      agentId,
      requestId,
    });
    const result = await this.sendRequest({
      requestId,
      message,
      timeout: 10000,
      options: { skipQueue: true },
      select: (msg) => {
        if (msg.type !== "agent_archived") {
          return null;
        }
        if (msg.payload.requestId !== requestId) {
          return null;
        }
        return msg.payload;
      },
    });
    return { archivedAt: result.archivedAt };
  }

  async updateAgent(
    agentId: string,
    updates: { name?: string; labels?: Record<string, string> },
  ): Promise<void> {
    const requestId = this.createRequestId();
    const message = SessionInboundMessageSchema.parse({
      type: "update_agent_request",
      agentId,
      ...(updates.name !== undefined ? { name: updates.name } : {}),
      ...(updates.labels && Object.keys(updates.labels).length > 0
        ? { labels: updates.labels }
        : {}),
      requestId,
    });
    const payload = await this.sendRequest({
      requestId,
      message,
      timeout: 10000,
      options: { skipQueue: true },
      select: (msg) => {
        if (msg.type !== "update_agent_response") {
          return null;
        }
        if (msg.payload.requestId !== requestId) {
          return null;
        }
        return msg.payload;
      },
    });
    if (!payload.accepted) {
      throw new Error(payload.error ?? "updateAgent rejected");
    }
  }

  async renameProject(
    projectId: string,
    customName: string | null,
    requestId?: string,
  ): Promise<{ customName: string | null }> {
    const payload = await this.sendCorrelatedSessionRequest({
      requestId,
      message: {
        type: "project.rename.request",
        projectId,
        customName,
      },
      responseType: "project.rename.response",
      timeout: 10000,
    });
    if (!payload.accepted) {
      throw new Error(payload.error ?? "renameProject rejected");
    }
    return { customName: payload.customName };
  }

  async resumeAgent(
    handle: AgentPersistenceHandle,
    overrides?: Partial<AgentSessionConfig>,
  ): Promise<AgentSnapshotPayload> {
    const requestId = this.createRequestId();
    const message = SessionInboundMessageSchema.parse({
      type: "resume_agent_request",
      requestId,
      handle,
      ...(overrides ? { overrides } : {}),
    });

    const status = await this.sendRequest({
      requestId,
      message,
      timeout: 15000,
      options: { skipQueue: true },
      select: (msg) => {
        if (msg.type !== "status") {
          return null;
        }
        const resumed = AgentResumedStatusPayloadSchema.safeParse(msg.payload);
        if (resumed.success && resumed.data.requestId === requestId) {
          return resumed.data;
        }
        return null;
      },
    });

    return status.agent;
  }

  async importAgent(input: ImportAgentInput): Promise<AgentSnapshotPayload> {
    const requestId = this.createRequestId();
    const message = SessionInboundMessageSchema.parse({
      type: "import_agent_request",
      requestId,
      ...("providerId" in input
        ? { providerId: input.providerId, providerHandleId: input.providerHandleId }
        : { provider: input.provider, sessionId: input.sessionId }),
      ...(input.cwd ? { cwd: input.cwd } : {}),
      ...(input.labels && Object.keys(input.labels).length > 0 ? { labels: input.labels } : {}),
    });

    const status = await this.sendRequest({
      requestId,
      message,
      timeout: 15000,
      options: { skipQueue: true },
      select: (msg) => {
        if (msg.type !== "status") {
          return null;
        }
        const resumed = AgentResumedStatusPayloadSchema.safeParse(msg.payload);
        if (resumed.success && resumed.data.requestId === requestId) {
          return resumed.data;
        }

        const failed = AgentCreateFailedStatusPayloadSchema.safeParse(msg.payload);
        if (failed.success && failed.data.requestId === requestId) {
          return failed.data;
        }

        return null;
      },
    });

    if (status.status === "agent_create_failed") {
      throw new Error(status.error);
    }

    return status.agent;
  }

  async refreshAgent(agentId: string, requestId?: string): Promise<AgentRefreshedStatusPayload> {
    const resolvedRequestId = this.createRequestId(requestId);
    const message = SessionInboundMessageSchema.parse({
      type: "refresh_agent_request",
      agentId,
      requestId: resolvedRequestId,
    });
    return this.sendRequest({
      requestId: resolvedRequestId,
      message,
      timeout: 15000,
      options: { skipQueue: true },
      select: (msg) => {
        if (msg.type !== "status") {
          return null;
        }
        const refreshed = AgentRefreshedStatusPayloadSchema.safeParse(msg.payload);
        if (refreshed.success && refreshed.data.requestId === resolvedRequestId) {
          return refreshed.data;
        }
        return null;
      },
    });
  }

  async fetchAgentTimeline(
    agentId: string,
    options: FetchAgentTimelineOptions = {},
  ): Promise<FetchAgentTimelinePayload> {
    const resolvedRequestId = this.createRequestId(options.requestId);
    const message = SessionInboundMessageSchema.parse({
      type: "fetch_agent_timeline_request",
      agentId,
      requestId: resolvedRequestId,
      ...(options.direction ? { direction: options.direction } : {}),
      ...(options.cursor ? { cursor: options.cursor } : {}),
      ...(typeof options.limit === "number" ? { limit: options.limit } : {}),
      ...(options.projection ? { projection: options.projection } : {}),
    });

    const payload = await this.sendRequest({
      requestId: resolvedRequestId,
      message,
      timeout: DEFAULT_FETCH_AGENT_TIMELINE_TIMEOUT_MS,
      options: { skipQueue: true },
      select: (msg) => {
        if (msg.type !== "fetch_agent_timeline_response") {
          return null;
        }
        if (msg.payload.requestId !== resolvedRequestId) {
          return null;
        }
        return msg.payload;
      },
    });

    if (payload.error) {
      throw new Error(payload.error);
    }

    return payload;
  }

  // ============================================================================
  // Agent Interaction
  // ============================================================================

  async sendAgentMessage(
    agentId: string,
    text: string,
    options?: SendMessageOptions,
  ): Promise<void> {
    const requestId = this.createRequestId();
    const messageId = options?.messageId ?? crypto.randomUUID();
    const message = SessionInboundMessageSchema.parse({
      type: "send_agent_message_request",
      requestId,
      agentId,
      text,
      ...(messageId ? { messageId } : {}),
      ...(options?.images ? { images: options.images } : {}),
      ...(options?.attachments ? { attachments: options.attachments } : {}),
    });
    const payload = await this.sendRequest({
      requestId,
      message,
      timeout: 15000,
      options: { skipQueue: true },
      select: (msg) => {
        if (msg.type !== "send_agent_message_response") {
          return null;
        }
        if (msg.payload.requestId !== requestId) {
          return null;
        }
        return msg.payload;
      },
    });
    if (!payload.accepted) {
      throw new Error(payload.error ?? "sendAgentMessage rejected");
    }
  }

  async sendMessage(agentId: string, text: string, options?: SendMessageOptions): Promise<void> {
    await this.sendAgentMessage(agentId, text, options);
  }

  /**
   * Sends a generative UI user-interaction callback to the server.
   * The server formats the action as system context and injects it into the
   * next turn's conversation.
   *
   * @param agentId Target agent session ID
   * @param instanceId Generative UI component instance ID
   * @param action Action name as defined in the component's actions
   * @param payload Action-specific payload
   * @param options Optional configuration (timeout etc.)
   * @throws {DaemonRpcError} If the server rejects the action or times out
   */
  async sendGenerativeUiAction(
    agentId: string,
    instanceId: string,
    action: string,
    payload: unknown,
    options?: { timeout?: number },
  ): Promise<void> {
    if (this.lastServerInfoMessage?.features?.generativeUi !== true) {
      throw new DaemonRpcError({
        requestId: "",
        error: "generative UI actions are not supported by this server",
        requestType: "generative_ui.action.request",
      });
    }
    const requestId = this.createRequestId();
    const message = SessionInboundMessageSchema.parse({
      type: "generative_ui.action.request",
      requestId,
      agentId,
      instanceId,
      action,
      payload,
      timestamp: Date.now(),
    });
    const result = await this.sendRequest({
      requestId,
      message,
      timeout: options?.timeout ?? 10000,
      options: { skipQueue: true },
      select: (msg) => {
        if (msg.type !== "generative_ui.action.response") return null;
        if (msg.payload.requestId !== requestId) return null;
        return msg.payload;
      },
    });
    if (!result.received) {
      throw new DaemonRpcError({
        requestId,
        error: result.error ?? "generative_ui.action rejected",
        requestType: "generative_ui.action.request",
      });
    }
  }

  async rewindAgent(
    agentId: string,
    messageId: string,
    mode: "conversation" | "files" | "both",
  ): Promise<AgentRewindResponseMessage["payload"]> {
    const requestId = this.createRequestId();
    const message = SessionInboundMessageSchema.parse({
      type: "agent.rewind.request",
      requestId,
      agentId,
      messageId,
      mode,
    });
    const payload = await this.sendRequest({
      requestId,
      message,
      timeout: 15000,
      options: { skipQueue: true },
      select: (msg) => {
        if (msg.type !== "agent.rewind.response") {
          return null;
        }
        if (msg.payload.requestId !== requestId) {
          return null;
        }
        return msg.payload;
      },
    });
    if (!payload.ok) {
      throw new Error(payload.error ?? "Agent rewind failed");
    }
    return payload;
  }

  async cancelAgent(agentId: string): Promise<void> {
    const requestId = this.createRequestId();
    const message = SessionInboundMessageSchema.parse({
      type: "cancel_agent_request",
      agentId,
      requestId,
    });
    await this.sendRequest({
      requestId,
      message,
      timeout: 15000,
      options: { skipQueue: true },
      select: (msg) => {
        if (msg.type !== "cancel_agent_response") {
          return null;
        }
        if (msg.payload.requestId !== requestId) {
          return null;
        }
        return msg.payload;
      },
    });
  }

  async setAgentMode(agentId: string, modeId: string): Promise<void> {
    const requestId = this.createRequestId();
    const message = SessionInboundMessageSchema.parse({
      type: "set_agent_mode_request",
      agentId,
      modeId,
      requestId,
    });
    const payload = await this.sendRequest({
      requestId,
      message,
      timeout: 15000,
      options: { skipQueue: true },
      select: (msg) => {
        if (msg.type !== "set_agent_mode_response") {
          return null;
        }
        if (msg.payload.requestId !== requestId) {
          return null;
        }
        return msg.payload;
      },
    });
    if (!payload.accepted) {
      throw new Error(payload.error ?? "setAgentMode rejected");
    }
  }

  async setAgentModel(
    agentId: string,
    modelId: string | null,
    runtimeProvider?: string | null,
  ): Promise<void> {
    const requestId = this.createRequestId();
    const message = SessionInboundMessageSchema.parse({
      type: "set_agent_model_request",
      agentId,
      modelId,
      ...(runtimeProvider ? { runtimeProvider } : {}),
      requestId,
    });
    const payload = await this.sendRequest({
      requestId,
      message,
      timeout: 15000,
      options: { skipQueue: true },
      select: (msg) => {
        if (msg.type !== "set_agent_model_response") {
          return null;
        }
        if (msg.payload.requestId !== requestId) {
          return null;
        }
        return msg.payload;
      },
    });
    if (!payload.accepted) {
      throw new Error(payload.error ?? "setAgentModel rejected");
    }
  }

  async setAgentFeature(agentId: string, featureId: string, value: unknown): Promise<void> {
    const requestId = this.createRequestId();
    const message = SessionInboundMessageSchema.parse({
      type: "set_agent_feature_request",
      agentId,
      featureId,
      value,
      requestId,
    });
    const payload = await this.sendRequest({
      requestId,
      message,
      timeout: 15000,
      options: { skipQueue: true },
      select: (msg) => {
        if (msg.type !== "set_agent_feature_response") {
          return null;
        }
        if (msg.payload.requestId !== requestId) {
          return null;
        }
        return msg.payload;
      },
    });
    if (!payload.accepted) {
      throw new Error(payload.error ?? "setAgentFeature rejected");
    }
  }

  async setAgentThinkingOption(agentId: string, thinkingOptionId: string | null): Promise<void> {
    const requestId = this.createRequestId();
    const message = SessionInboundMessageSchema.parse({
      type: "set_agent_thinking_request",
      agentId,
      thinkingOptionId,
      requestId,
    });
    const payload = await this.sendRequest({
      requestId,
      message,
      timeout: 15000,
      options: { skipQueue: true },
      select: (msg) => {
        if (msg.type !== "set_agent_thinking_response") {
          return null;
        }
        if (msg.payload.requestId !== requestId) {
          return null;
        }
        return msg.payload;
      },
    });
    if (!payload.accepted) {
      throw new Error(payload.error ?? "setAgentThinkingOption rejected");
    }
  }

  async restartServer(reason?: string, requestId?: string): Promise<RestartRequestedStatusPayload> {
    const resolvedRequestId = this.createRequestId(requestId);
    const message = SessionInboundMessageSchema.parse({
      type: "restart_server_request",
      ...(reason && reason.trim().length > 0 ? { reason } : {}),
      requestId: resolvedRequestId,
    });
    return this.sendRequest({
      requestId: resolvedRequestId,
      message,
      timeout: 10000,
      options: { skipQueue: true },
      select: (msg) => {
        if (msg.type !== "status") {
          return null;
        }
        const restarted = RestartRequestedStatusPayloadSchema.safeParse(msg.payload);
        if (!restarted.success) {
          return null;
        }
        if (restarted.data.requestId !== resolvedRequestId) {
          return null;
        }
        return restarted.data;
      },
    });
  }

  async shutdownServer(requestId?: string): Promise<ShutdownRequestedStatusPayload> {
    const resolvedRequestId = this.createRequestId(requestId);
    const message = SessionInboundMessageSchema.parse({
      type: "shutdown_server_request",
      requestId: resolvedRequestId,
    });
    return this.sendRequest({
      requestId: resolvedRequestId,
      message,
      timeout: 10000,
      options: { skipQueue: true },
      select: (msg) => {
        if (msg.type !== "status") {
          return null;
        }
        const shutdown = ShutdownRequestedStatusPayloadSchema.safeParse(msg.payload);
        if (!shutdown.success) {
          return null;
        }
        if (shutdown.data.requestId !== resolvedRequestId) {
          return null;
        }
        return shutdown.data;
      },
    });
  }

  // ============================================================================
  // Audio / Voice
  // ============================================================================

  async setVoiceMode(enabled: boolean, agentId?: string): Promise<SetVoiceModePayload> {
    const requestId = this.createRequestId();
    const message = SessionInboundMessageSchema.parse({
      type: "set_voice_mode",
      enabled,
      ...(agentId ? { agentId } : {}),
      requestId,
    });
    const response = await this.sendRequest({
      requestId,
      message,
      timeout: 10000,
      select: (msg) => {
        if (msg.type !== "set_voice_mode_response") {
          return null;
        }
        if (msg.payload.requestId !== requestId) {
          return null;
        }
        return msg.payload;
      },
    });
    if (!response.accepted) {
      const codeSuffix =
        typeof response.reasonCode === "string" && response.reasonCode.trim().length > 0
          ? ` (${response.reasonCode})`
          : "";
      throw new Error((response.error ?? "Failed to set voice mode") + codeSuffix);
    }
    return response;
  }

  async sendVoiceAudioChunk(audio: string, format: string, isLast = false): Promise<void> {
    this.sendSessionMessage({ type: "voice_audio_chunk", audio, format, isLast });
  }

  async startDictationStream(dictationId: string, format: string): Promise<void> {
    const ack = this.waitForWithCancel(
      (msg) => {
        if (msg.type !== "dictation_stream_ack") {
          return null;
        }
        if (msg.payload.dictationId !== dictationId) {
          return null;
        }
        if (msg.payload.ackSeq !== -1) {
          return null;
        }
        return msg.payload;
      },
      30000,
      { skipQueue: true },
    );
    const ackPromise = ack.promise.then(() => undefined);

    const streamError = this.waitForWithCancel(
      (msg) => {
        if (msg.type !== "dictation_stream_error") {
          return null;
        }
        if (msg.payload.dictationId !== dictationId) {
          return null;
        }
        return msg.payload;
      },
      30000,
      { skipQueue: true },
    );
    const errorPromise = streamError.promise.then((payload) => {
      throw new Error(payload.error);
    });

    const cleanupError = new Error("Cancelled dictation start waiter");
    try {
      this.sendSessionMessageStrict({ type: "dictation_stream_start", dictationId, format });
      await Promise.race([ackPromise, errorPromise]);
    } finally {
      ack.cancel(cleanupError);
      streamError.cancel(cleanupError);
      void ackPromise.catch(() => undefined);
      void errorPromise.catch(() => undefined);
    }
  }

  sendDictationStreamChunk(dictationId: string, seq: number, audio: string, format: string): void {
    this.sendSessionMessageStrict({
      type: "dictation_stream_chunk",
      dictationId,
      seq,
      audio,
      format,
    });
  }

  async finishDictationStream(
    dictationId: string,
    finalSeq: number,
  ): Promise<{ dictationId: string; text: string }> {
    const final = this.waitForWithCancel(
      (msg) => {
        if (msg.type !== "dictation_stream_final") {
          return null;
        }
        if (msg.payload.dictationId !== dictationId) {
          return null;
        }
        return msg.payload;
      },
      0,
      { skipQueue: true },
    );

    const streamError = this.waitForWithCancel(
      (msg) => {
        if (msg.type !== "dictation_stream_error") {
          return null;
        }
        if (msg.payload.dictationId !== dictationId) {
          return null;
        }
        return msg.payload;
      },
      0,
      { skipQueue: true },
    );

    const finishAccepted = this.waitForWithCancel<DictationFinishAcceptedPayload>(
      (msg) => {
        if (msg.type !== "dictation_stream_finish_accepted") {
          return null;
        }
        if (msg.payload.dictationId !== dictationId) {
          return null;
        }
        return msg.payload;
      },
      DEFAULT_DICTATION_FINISH_ACCEPT_TIMEOUT_MS,
      { skipQueue: true },
    );

    const finalPromise = final.promise;
    const errorPromise = streamError.promise.then((payload) => {
      throw new Error(payload.error);
    });
    const finishAcceptedPromise = finishAccepted.promise;

    const finalOutcomePromise = finalPromise.then((payload) => ({
      kind: "final" as const,
      payload,
    }));
    const errorOutcomePromise = errorPromise.then(
      () => ({
        kind: "error" as const,
        error: new Error("Unexpected dictation stream error state"),
      }),
      (error) => ({
        kind: "error" as const,
        error: error instanceof Error ? error : new Error(String(error)),
      }),
    );
    const finishAcceptedOutcomePromise = finishAcceptedPromise.then(
      (payload) => ({ kind: "accepted" as const, payload }),
      (error) => {
        if (isWaiterTimeoutError(error)) {
          return { kind: "accepted_timeout" as const };
        }
        return {
          kind: "accepted_error" as const,
          error: error instanceof Error ? error : new Error(String(error)),
        };
      },
    );

    const waitForFinalResult = async (
      timeoutMs: number,
    ): Promise<{ dictationId: string; text: string }> => {
      if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        const outcome = await Promise.race([finalOutcomePromise, errorOutcomePromise]);
        if (outcome.kind === "error") {
          throw outcome.error;
        }
        return outcome.payload;
      }

      let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
      const timeoutPromise = new Promise<{ kind: "timeout" }>((resolve) => {
        timeoutHandle = setTimeout(() => resolve({ kind: "timeout" }), timeoutMs);
      });

      const outcome = await Promise.race([
        finalOutcomePromise,
        errorOutcomePromise,
        timeoutPromise,
      ]);

      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }

      if (outcome.kind === "timeout") {
        throw new Error(`Timeout waiting for dictation finalization (${timeoutMs}ms)`);
      }
      if (outcome.kind === "error") {
        throw outcome.error;
      }
      return outcome.payload;
    };

    const cleanupError = new Error("Cancelled dictation finish waiter");
    try {
      this.sendSessionMessageStrict({ type: "dictation_stream_finish", dictationId, finalSeq });
      const firstOutcome = await Promise.race([
        finalOutcomePromise,
        errorOutcomePromise,
        finishAcceptedOutcomePromise,
      ]);

      if (firstOutcome.kind === "final") {
        return firstOutcome.payload;
      }
      if (firstOutcome.kind === "error") {
        throw firstOutcome.error;
      }

      if (firstOutcome.kind === "accepted") {
        return await waitForFinalResult(
          firstOutcome.payload.timeoutMs + DEFAULT_DICTATION_FINISH_TIMEOUT_GRACE_MS,
        );
      }

      return await waitForFinalResult(DEFAULT_DICTATION_FINISH_FALLBACK_TIMEOUT_MS);
    } finally {
      final.cancel(cleanupError);
      streamError.cancel(cleanupError);
      finishAccepted.cancel(cleanupError);
      void finalPromise.catch(() => undefined);
      void errorPromise.catch(() => undefined);
      void finishAcceptedPromise.catch(() => undefined);
    }
  }

  cancelDictationStream(dictationId: string): void {
    this.sendSessionMessageStrict({ type: "dictation_stream_cancel", dictationId });
  }

  async abortRequest(): Promise<void> {
    this.sendSessionMessage({ type: "abort_request" });
  }

  async audioPlayed(id: string): Promise<void> {
    this.sendSessionMessage({ type: "audio_played", id });
  }

  // ============================================================================
  // Git Operations
  // ============================================================================

  async getCheckoutStatus(
    cwd: string,
    options?: { requestId?: string },
  ): Promise<CheckoutStatusPayload> {
    return this.checkoutSubscriptions.getStatus(cwd, options);
  }

  async getCheckoutDiff(
    cwd: string,
    compare: { mode: "uncommitted" | "base"; baseRef?: string; ignoreWhitespace?: boolean },
    requestId?: string,
  ): Promise<CheckoutDiffPayload> {
    return this.checkoutSubscriptions.getDiff(cwd, compare, requestId);
  }

  async subscribeCheckoutDiff(
    cwd: string,
    compare: { mode: "uncommitted" | "base"; baseRef?: string; ignoreWhitespace?: boolean },
    options?: { subscriptionId?: string; requestId?: string },
  ): Promise<SubscribeCheckoutDiffPayload> {
    return this.checkoutSubscriptions.subscribe(cwd, compare, options);
  }

  unsubscribeCheckoutDiff(subscriptionId: string): void {
    this.checkoutSubscriptions.unsubscribe(subscriptionId);
  }

  async checkoutCommit(
    cwd: string,
    input: { message?: string; addAll?: boolean },
    requestId?: string,
  ): Promise<CheckoutCommitPayload> {
    return this.checkoutCommands.checkoutCommit(cwd, input, requestId);
  }

  async checkoutMerge(
    cwd: string,
    input: { baseRef?: string; strategy?: "merge" | "squash"; requireCleanTarget?: boolean },
    requestId?: string,
  ): Promise<CheckoutMergePayload> {
    return this.checkoutCommands.checkoutMerge(cwd, input, requestId);
  }

  async checkoutMergeFromBase(
    cwd: string,
    input: { baseRef?: string; requireCleanTarget?: boolean },
    requestId?: string,
  ): Promise<CheckoutMergeFromBasePayload> {
    return this.checkoutCommands.checkoutMergeFromBase(cwd, input, requestId);
  }

  async checkoutPull(cwd: string, requestId?: string): Promise<CheckoutPullPayload> {
    return this.checkoutCommands.checkoutPull(cwd, requestId);
  }

  async checkoutPush(cwd: string, requestId?: string): Promise<CheckoutPushPayload> {
    return this.checkoutCommands.checkoutPush(cwd, requestId);
  }

  async checkoutRefresh(cwd: string, requestId?: string): Promise<CheckoutRefreshPayload> {
    return this.checkoutCommands.checkoutRefresh(cwd, requestId);
  }

  async checkoutPrCreate(
    cwd: string,
    input: { title?: string; body?: string; baseRef?: string },
    requestId?: string,
  ): Promise<CheckoutPrCreatePayload> {
    return this.checkoutCommands.checkoutPrCreate(cwd, input, requestId);
  }

  async checkoutPrMerge(
    cwd: string,
    input: { method: CheckoutPrMergeMethod },
    requestId?: string,
  ): Promise<CheckoutPrMergePayload> {
    return this.checkoutCommands.checkoutPrMerge(cwd, input, requestId);
  }

  async checkoutGithubSetAutoMerge(
    cwd: string,
    input: { enabled: true; method: CheckoutPrMergeMethod } | { enabled: false },
    requestId?: string,
  ): Promise<CheckoutGithubSetAutoMergePayload> {
    return this.checkoutCommands.checkoutGithubSetAutoMerge(cwd, input, requestId);
  }

  async checkoutPrStatus(cwd: string, requestId?: string): Promise<CheckoutPrStatusPayload> {
    return this.checkoutCommands.checkoutPrStatus(cwd, requestId);
  }

  async pullRequestTimeline(
    input: { cwd: string; prNumber: number; repoOwner: string; repoName: string },
    requestId?: string,
  ): Promise<PullRequestTimelinePayload> {
    return this.checkoutCommands.pullRequestTimeline(input, requestId);
  }

  async checkoutSwitchBranch(
    cwd: string,
    branch: string,
    requestId?: string,
  ): Promise<CheckoutSwitchBranchPayload> {
    return this.checkoutCommands.checkoutSwitchBranch(cwd, branch, requestId);
  }

  async renameBranch(input: RenameBranchInput): Promise<RenameBranchResult> {
    return this.checkoutCommands.renameBranch(input);
  }

  async stashSave(
    cwd: string,
    options?: { branch?: string },
    requestId?: string,
  ): Promise<StashSavePayload> {
    return this.checkoutCommands.stashSave(cwd, options, requestId);
  }

  async stashPop(cwd: string, stashIndex: number, requestId?: string): Promise<StashPopPayload> {
    return this.checkoutCommands.stashPop(cwd, stashIndex, requestId);
  }

  async stashList(
    cwd: string,
    options?: { chisacodeOnly?: boolean },
    requestId?: string,
  ): Promise<StashListPayload> {
    return this.checkoutCommands.stashList(cwd, options, requestId);
  }

  async getChisaCodeWorktreeList(
    input: { cwd?: string; repoRoot?: string },
    requestId?: string,
  ): Promise<ChisaCodeWorktreeListPayload> {
    return this.checkoutCommands.getChisaCodeWorktreeList(input, requestId);
  }

  async archiveChisaCodeWorktree(
    input: { worktreePath?: string; repoRoot?: string; branchName?: string },
    requestId?: string,
  ): Promise<ChisaCodeWorktreeArchivePayload> {
    return this.checkoutCommands.archiveChisaCodeWorktree(input, requestId);
  }

  async createChisaCodeWorktree(
    input: CreateChisaCodeWorktreeInput,
    requestId?: string,
  ): Promise<CreateChisaCodeWorktreePayload> {
    return this.checkoutCommands.createChisaCodeWorktree(input, requestId);
  }

  async validateBranch(
    options: { cwd: string; branchName: string },
    requestId?: string,
  ): Promise<ValidateBranchPayload> {
    return this.checkoutCommands.validateBranch(options, requestId);
  }

  async getBranchSuggestions(
    options: { cwd: string; query?: string; limit?: number },
    requestId?: string,
  ): Promise<BranchSuggestionsPayload> {
    return this.checkoutCommands.getBranchSuggestions(options, requestId);
  }

  async searchGitHub(
    options: { cwd: string; query: string; limit?: number; kinds?: GitHubSearchRequest["kinds"] },
    requestId?: string,
  ): Promise<GitHubSearchPayload> {
    return this.checkoutCommands.searchGitHub(options, requestId);
  }

  async getDirectorySuggestions(
    options: {
      query: string;
      limit?: number;
      cwd?: string;
      includeFiles?: boolean;
      includeDirectories?: boolean;
      matchMode?: "fuzzy" | "suffix";
    },
    requestId?: string,
  ): Promise<DirectorySuggestionsPayload> {
    return this.checkoutCommands.getDirectorySuggestions(options, requestId);
  }
  // ============================================================================
  // File Explorer
  // ============================================================================

  private async requestFileExplorer(
    cwd: string,
    path: string,
    mode: "list" | "file",
    requestId?: string,
    acceptBinary = false,
  ): Promise<FileExplorerPayload> {
    return this.sendCorrelatedSessionRequest({
      requestId,
      message: {
        type: "file_explorer_request",
        cwd,
        path,
        mode,
        ...(acceptBinary ? { acceptBinary: true } : {}),
      },
      responseType: "file_explorer_response",
      timeout: 10000,
    });
  }

  async listDirectory(
    cwd: string,
    path: string,
    requestId?: string,
  ): Promise<FileExplorerDirectoryPayload> {
    return this.workspaceCommands.listDirectory(cwd, path, requestId);
  }

  async readFile(cwd: string, path: string, requestId?: string): Promise<FileReadResult> {
    const resolvedRequestId = this.createRequestId(requestId);
    this.binaryFileTransfers.startRead(resolvedRequestId, cwd, path);
    try {
      const payload = await this.requestFileExplorer(cwd, path, "file", resolvedRequestId, true);
      if (payload.error) {
        throw new Error(payload.error);
      }
      const binaryResult = this.binaryFileTransfers.takeCompletedRead(resolvedRequestId);
      if (binaryResult) {
        return binaryResult;
      }
      if (!payload.file) {
        throw new Error("File unavailable.");
      }
      return legacyExplorerFileToBytes(payload.file);
    } finally {
      this.binaryFileTransfers.cleanupRead(resolvedRequestId);
    }
  }

  async requestDownloadToken(
    cwd: string,
    path: string,
    requestId?: string,
  ): Promise<FileDownloadTokenPayload> {
    return this.workspaceCommands.requestDownloadToken(cwd, path, requestId);
  }

  async requestProjectIcon(
    cwd: string,
    requestId?: string,
  ): Promise<ProjectIconResponse["payload"]> {
    return this.workspaceCommands.requestProjectIcon(cwd, requestId);
  }

  // ============================================================================
  // Provider Models / Commands
  // ============================================================================

  async listProviderModels(
    provider: AgentProvider,
    options?: { cwd?: string; requestId?: string },
  ): Promise<ListProviderModelsPayload> {
    return this.providerCommands.listProviderModels(provider, options);
  }

  async listProviderModes(
    provider: AgentProvider,
    options?: { cwd?: string; requestId?: string },
  ): Promise<ListProviderModesPayload> {
    return this.providerCommands.listProviderModes(provider, options);
  }

  async listProviderFeatures(
    draftConfig: ListCommandsDraftConfig,
    options?: { requestId?: string },
  ): Promise<ListProviderFeaturesPayload> {
    return this.providerCommands.listProviderFeatures(draftConfig, options);
  }

  async listAvailableProviders(options?: {
    requestId?: string;
  }): Promise<ListAvailableProvidersPayload> {
    return this.providerCommands.listAvailableProviders(options);
  }

  async getProvidersSnapshot(options?: {
    cwd?: string;
    requestId?: string;
  }): Promise<GetProvidersSnapshotPayload> {
    return this.providerCommands.getProvidersSnapshot(options);
  }

  async getDaemonConfig(
    requestId?: string,
  ): Promise<{ requestId: string; config: MutableDaemonConfig }> {
    return this.configCommands.getDaemonConfig(requestId);
  }

  async getDaemonStatus(requestId?: string): Promise<DaemonStatusPayload> {
    return this.configCommands.getDaemonStatus(requestId);
  }

  async getDaemonPairingOffer(requestId?: string): Promise<DaemonPairingOfferPayload> {
    return this.configCommands.getDaemonPairingOffer(requestId);
  }

  async patchDaemonConfig(
    config: MutableDaemonConfigPatch,
    requestId?: string,
  ): Promise<{ requestId: string; config: MutableDaemonConfig }> {
    return this.configCommands.patchDaemonConfig(config, requestId);
  }

  async readProjectConfig(repoRoot: string, requestId?: string): Promise<ReadProjectConfigPayload> {
    return this.configCommands.readProjectConfig(repoRoot, requestId);
  }

  async writeProjectConfig(input: WriteProjectConfigInput): Promise<WriteProjectConfigPayload> {
    return this.configCommands.writeProjectConfig(input);
  }

  async refreshProvidersSnapshot(options?: {
    cwd?: string;
    providers?: AgentProvider[];
    requestId?: string;
  }): Promise<RefreshProvidersSnapshotPayload> {
    return this.providerCommands.refreshProvidersSnapshot(options);
  }

  async getProviderDiagnostic(
    provider: AgentProvider,
    options?: { requestId?: string },
  ): Promise<ProviderDiagnosticPayload> {
    return this.providerCommands.getProviderDiagnostic(provider, options);
  }

  async runProviderToolingAction(
    provider: AgentProvider,
    action: "install" | "update" | "reinstall",
    options?: { requestId?: string },
  ): Promise<ProviderToolingActionPayload> {
    return this.providerCommands.runProviderToolingAction(provider, action, options);
  }

  async listAgentPresets(options?: { requestId?: string }): Promise<AgentPresetsListPayload> {
    return this.providerCommands.listAgentPresets(options);
  }

  async runModelGatewayMoaTest(
    input: RunModelGatewayMoaTestInput,
  ): Promise<ModelGatewayMoaTestPayload> {
    return this.providerCommands.runModelGatewayMoaTest(input);
  }

  async listCommands(agentId: string, requestId?: string): Promise<ListCommandsPayload>;
  async listCommands(agentId: string, options?: ListCommandsOptions): Promise<ListCommandsPayload>;
  async listCommands(
    agentId: string,
    requestIdOrOptions?: string | ListCommandsOptions,
  ): Promise<ListCommandsPayload> {
    return this.agentExtensionCommands.listCommands(agentId, requestIdOrOptions);
  }

  async listAgentSkills(options?: { requestId?: string }): Promise<AgentSkillsListPayload> {
    return this.agentExtensionCommands.listAgentSkills(options);
  }

  async patchAgentSkillPolicy(input: {
    requestId?: string;
    scope: AgentSkillManagementScope;
    policy: {
      enabledSkillNames?: string[];
      disabledSkillNames?: string[];
    };
  }): Promise<AgentSkillsPolicyPatchPayload> {
    return this.agentExtensionCommands.patchAgentSkillPolicy(input);
  }

  async installAgentSkills(input: {
    requestId?: string;
    source: AgentSkillsInstallSource;
    replace?: boolean;
  }): Promise<AgentSkillsInstallPayload> {
    return this.agentExtensionCommands.installAgentSkills(input);
  }

  async uninstallAgentSkill(input: {
    requestId?: string;
    sourceId: string;
  }): Promise<AgentSkillsUninstallPayload> {
    return this.agentExtensionCommands.uninstallAgentSkill(input);
  }

  async listAgentMcpServers(options?: { requestId?: string }): Promise<AgentMcpServersListPayload> {
    return this.agentExtensionCommands.listAgentMcpServers(options);
  }

  async upsertAgentMcpServer(input: {
    requestId?: string;
    server: ManagedMcpServerConfig;
    originalName?: string;
  }): Promise<AgentMcpServersUpsertPayload> {
    return this.agentExtensionCommands.upsertAgentMcpServer(input);
  }

  async patchAgentMcpServerPolicy(input: {
    requestId?: string;
    scope: AgentMcpServerManagementScope;
    policy: {
      enabledServerNames?: string[];
      disabledServerNames?: string[];
    };
  }): Promise<AgentMcpServersPolicyPatchPayload> {
    return this.agentExtensionCommands.patchAgentMcpServerPolicy(input);
  }

  async deleteAgentMcpServer(input: {
    requestId?: string;
    name: string;
  }): Promise<AgentMcpServersDeletePayload> {
    return this.agentExtensionCommands.deleteAgentMcpServer(input);
  }

  // ============================================================================
  // Permissions
  // ============================================================================

  async respondToPermission(
    agentId: string,
    requestId: string,
    response: AgentPermissionResponse,
  ): Promise<void> {
    this.sendSessionMessage({
      type: "agent_permission_response",
      agentId,
      requestId,
      response,
    });
  }

  async respondToPermissionAndWait(
    agentId: string,
    requestId: string,
    response: AgentPermissionResponse,
    timeout = 15000,
  ): Promise<AgentPermissionResolvedPayload> {
    const message = SessionInboundMessageSchema.parse({
      type: "agent_permission_response",
      agentId,
      requestId,
      response,
    });
    return this.sendRequest({
      requestId,
      message,
      timeout,
      options: { skipQueue: true },
      select: (msg) => {
        if (msg.type !== "agent_permission_resolved") {
          return null;
        }
        if (msg.payload.requestId !== requestId) {
          return null;
        }
        if (msg.payload.agentId !== agentId) {
          return null;
        }
        return msg.payload;
      },
    });
  }

  // ============================================================================
  // Waiting / Streaming Helpers
  // ============================================================================

  async waitForAgentUpsert(
    agentId: string,
    predicate: (snapshot: AgentSnapshotPayload) => boolean,
    timeout = 60000,
  ): Promise<AgentSnapshotPayload> {
    const initialResult = await this.fetchAgent(agentId).catch(() => null);
    if (initialResult && predicate(initialResult.agent)) {
      return initialResult.agent;
    }

    const deadline = Date.now() + timeout;
    return await new Promise<AgentSnapshotPayload>((resolve, reject) => {
      let settled = false;
      let pollInFlight = false;
      let pollTimer: ReturnType<typeof setInterval> | null = null;
      let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
      let unsubscribe: (() => void) | null = null;

      const finish = (
        result: { kind: "ok"; snapshot: AgentSnapshotPayload } | { kind: "error"; error: Error },
      ) => {
        if (settled) {
          return;
        }
        settled = true;
        if (timeoutTimer) {
          clearTimeout(timeoutTimer);
          timeoutTimer = null;
        }
        if (pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
        if (unsubscribe) {
          unsubscribe();
          unsubscribe = null;
        }
        if (result.kind === "ok") {
          resolve(result.snapshot);
          return;
        }
        reject(result.error);
      };

      const maybeResolve = (snapshot: AgentSnapshotPayload | null) => {
        if (!snapshot) {
          return false;
        }
        if (!predicate(snapshot)) {
          return false;
        }
        finish({ kind: "ok", snapshot });
        return true;
      };

      const poll = async () => {
        if (settled || pollInFlight) {
          return;
        }
        pollInFlight = true;
        try {
          const result = await this.fetchAgent(agentId).catch(() => null);
          maybeResolve(result?.agent ?? null);
        } finally {
          pollInFlight = false;
        }
      };

      unsubscribe = this.on("agent_update", (message) => {
        if (settled) {
          return;
        }
        if (message.payload.kind !== "upsert") {
          return;
        }
        const snapshot = message.payload.agent;
        if (snapshot.id !== agentId) {
          return;
        }
        maybeResolve(snapshot);
      });

      const remaining = Math.max(1, deadline - Date.now());
      timeoutTimer = setTimeout(() => {
        finish({
          kind: "error",
          error: new Error(`Timed out waiting for agent ${agentId}`),
        });
      }, remaining);

      pollTimer = setInterval(() => {
        void poll();
      }, 250);
      void poll();
    });
  }

  async waitForFinish(agentId: string, timeout = 60000): Promise<WaitForFinishResult> {
    const requestId = this.createRequestId();
    const hasTimeout = Number.isFinite(timeout) && timeout > 0;
    const message = SessionInboundMessageSchema.parse({
      type: "wait_for_finish_request",
      requestId,
      agentId,
      ...(hasTimeout ? { timeoutMs: timeout } : {}),
    });
    const payload = await this.sendCorrelatedRequest({
      requestId,
      message,
      responseType: "wait_for_finish_response",
      timeout: hasTimeout ? timeout + 5000 : 0,
      options: { skipQueue: true },
    });
    return {
      status: payload.status,
      final: payload.final,
      error: payload.error,
      lastMessage: payload.lastMessage,
    };
  }

  // ============================================================================
  // Terminals
  // ============================================================================

  subscribeTerminals(input: { cwd: string }): void {
    this.terminalClient.subscribeDirectories(input);
  }

  unsubscribeTerminals(input: { cwd: string }): void {
    this.terminalClient.unsubscribeDirectories(input);
  }

  async listTerminals(cwd?: string, requestId?: string): Promise<ListTerminalsPayload> {
    return this.terminalClient.listTerminals(cwd, requestId);
  }

  async createTerminal(
    cwd: string,
    name?: string,
    requestId?: string,
    options?: { agentId?: string; command?: string; args?: string[] },
  ): Promise<CreateTerminalPayload> {
    return this.terminalClient.createTerminal(cwd, name, requestId, options);
  }

  async renameTerminal(input: RenameTerminalInput): Promise<RenameTerminalResult> {
    return this.terminalClient.renameTerminal(input);
  }

  async subscribeTerminal(
    terminalId: string,
    optionsOrRequestId?:
      | { restore?: SubscribeTerminalRequest["restore"]; requestId?: string }
      | string,
  ): Promise<SubscribeTerminalPayload> {
    return this.terminalClient.subscribeTerminal(terminalId, optionsOrRequestId);
  }

  unsubscribeTerminal(terminalId: string): void {
    this.terminalClient.unsubscribeTerminal(terminalId);
  }

  sendTerminalInput(terminalId: string, message: TerminalInput["message"]): void {
    this.terminalClient.sendInput(terminalId, message);
  }

  async killTerminal(terminalId: string, requestId?: string): Promise<KillTerminalPayload> {
    return this.terminalClient.killTerminal(terminalId, requestId);
  }

  async closeItems(
    input: { agentIds?: string[]; terminalIds?: string[] },
    requestId?: string,
  ): Promise<CloseItemsPayload> {
    const resolvedRequestId = this.createRequestId(requestId);
    const message = SessionInboundMessageSchema.parse({
      type: "close_items_request",
      agentIds: input.agentIds ?? [],
      terminalIds: input.terminalIds ?? [],
      requestId: resolvedRequestId,
    });
    return this.sendCorrelatedRequest({
      requestId: resolvedRequestId,
      message,
      responseType: "close_items_response",
      timeout: 10000,
      options: { skipQueue: true },
    });
  }

  async captureTerminal(
    terminalId: string,
    options?: { start?: number; end?: number; stripAnsi?: boolean },
    requestId?: string,
  ): Promise<CaptureTerminalPayload> {
    return this.terminalClient.captureTerminal(terminalId, options, requestId);
  }

  async createChatRoom(options: CreateChatRoomOptions): Promise<ChatCreatePayload> {
    return this.automationCommands.createChatRoom(options);
  }

  async listChatRooms(requestId?: string): Promise<ChatListPayload> {
    return this.automationCommands.listChatRooms(requestId);
  }

  async inspectChatRoom(options: InspectChatRoomOptions): Promise<ChatInspectPayload> {
    return this.automationCommands.inspectChatRoom(options);
  }

  async deleteChatRoom(options: DeleteChatRoomOptions): Promise<ChatDeletePayload> {
    return this.automationCommands.deleteChatRoom(options);
  }

  async postChatMessage(options: PostChatMessageOptions): Promise<ChatPostPayload> {
    return this.automationCommands.postChatMessage(options);
  }

  async readChatMessages(options: ReadChatMessagesOptions): Promise<ChatReadPayload> {
    return this.automationCommands.readChatMessages(options);
  }

  async waitForChatMessages(options: WaitForChatMessagesOptions): Promise<ChatWaitPayload> {
    return this.automationCommands.waitForChatMessages(options);
  }

  async scheduleCreate(options: CreateScheduleOptions): Promise<ScheduleCreatePayload> {
    return this.automationCommands.scheduleCreate(options);
  }

  async scheduleList(requestId?: string): Promise<ScheduleListPayload> {
    return this.automationCommands.scheduleList(requestId);
  }

  async scheduleInspect(options: InspectScheduleOptions): Promise<ScheduleInspectPayload> {
    return this.automationCommands.scheduleInspect(options);
  }

  async scheduleLogs(options: InspectScheduleOptions): Promise<ScheduleLogsPayload> {
    return this.automationCommands.scheduleLogs(options);
  }

  async schedulePause(options: InspectScheduleOptions): Promise<SchedulePausePayload> {
    return this.automationCommands.schedulePause(options);
  }

  async scheduleResume(options: InspectScheduleOptions): Promise<ScheduleResumePayload> {
    return this.automationCommands.scheduleResume(options);
  }

  async scheduleDelete(options: InspectScheduleOptions): Promise<ScheduleDeletePayload> {
    return this.automationCommands.scheduleDelete(options);
  }

  async scheduleRunOnce(options: InspectScheduleOptions): Promise<ScheduleRunOncePayload> {
    return this.automationCommands.scheduleRunOnce(options);
  }

  async scheduleUpdate(options: UpdateScheduleOptions): Promise<ScheduleUpdatePayload> {
    return this.automationCommands.scheduleUpdate(options);
  }

  async loopRun(options: RunLoopOptions): Promise<LoopRunPayload> {
    return this.automationCommands.loopRun(options);
  }

  async loopList(requestId?: string): Promise<LoopListPayload> {
    return this.automationCommands.loopList(requestId);
  }

  async loopInspect(options: string | InspectLoopOptions): Promise<LoopInspectPayload> {
    return this.automationCommands.loopInspect(options);
  }

  async loopLogs(options: string | LoopLogsOptions, afterSeq?: number): Promise<LoopLogsPayload> {
    return this.automationCommands.loopLogs(options, afterSeq);
  }

  async loopStop(options: string | StopLoopOptions): Promise<LoopStopPayload> {
    return this.automationCommands.loopStop(options);
  }

  onTerminalStreamEvent(handler: (event: TerminalStreamEvent) => void): () => void {
    return this.terminalClient.onStreamEvent(handler);
  }

  async waitForTerminalStreamEvent(
    predicate: (event: TerminalStreamEvent) => boolean,
    timeout = 5000,
  ): Promise<TerminalStreamEvent> {
    return this.terminalClient.waitForStreamEvent(predicate, timeout);
  }

  // ============================================================================
  // Internals
  // ============================================================================

  private createRequestId(requestId?: string): string {
    return requestId ?? crypto.randomUUID();
  }

  getLastServerInfoMessage(): ServerInfoStatusPayload | null {
    return this.lastServerInfoMessage;
  }

  private resolveTransportUrlForAttempt(): string {
    return this.config.url;
  }

  private sendHelloMessage(): void {
    if (!this.transport) {
      this.scheduleReconnect({
        reason: "Transport unavailable before hello",
        event: "HELLO_TRANSPORT_MISSING",
        reasonCode: "transport_error",
      });
      return;
    }

    try {
      this.transport.send(
        JSON.stringify({
          type: "hello",
          clientId: this.config.clientId,
          clientType: this.config.clientType ?? "cli",
          protocolVersion: 1,
          capabilities: {
            [CLIENT_CAPS.customModeIcons]: true,
            [CLIENT_CAPS.reasoningMergeEnum]: true,
            [CLIENT_CAPS.generativeUi]: true,
          },
          ...(this.config.appVersion ? { appVersion: this.config.appVersion } : {}),
        }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to send hello message";
      this.lastErrorValue = message;
      this.scheduleReconnect({
        reason: message,
        event: "HELLO_SEND_FAILED",
        reasonCode: "transport_error",
      });
    }
  }

  private disposeTransport(code = 1001, reason = "Reconnecting"): void {
    this.cleanupTransport();
    const transport = this.transport;
    this.transport = null;
    if (transport) {
      try {
        transport.close(code, reason);
      } catch {
        // no-op
      }
    }
  }

  private cleanupTransport(): void {
    this.resetConnectTimeout();
    if (this.pendingGenericTransportErrorTimeout) {
      clearTimeout(this.pendingGenericTransportErrorTimeout);
      this.pendingGenericTransportErrorTimeout = null;
    }
    for (const cleanup of this.transportCleanup) {
      try {
        cleanup();
      } catch {
        // no-op
      }
    }
    this.transportCleanup = [];
  }

  private resetConnectTimeout(): void {
    if (!this.connectTimeout) {
      return;
    }
    clearTimeout(this.connectTimeout);
    this.connectTimeout = null;
  }

  private handleTransportMessage(data: unknown, expectedTransport?: DaemonTransport): void {
    if (expectedTransport && this.transport !== expectedTransport) {
      return;
    }
    const rawData =
      data && typeof data === "object" && "data" in data ? (data as { data: unknown }).data : data;

    if (
      typeof Blob !== "undefined" &&
      rawData instanceof Blob &&
      typeof rawData.arrayBuffer === "function"
    ) {
      void rawData
        .arrayBuffer()
        .then((buffer) => {
          if (expectedTransport && this.transport !== expectedTransport) {
            return;
          }
          this.handleTransportMessage(buffer, expectedTransport);
          return;
        })
        .catch(() => {
          // Ignore failed blob decoding and allow reconnect logic to recover.
        });
      return;
    }

    const rawBytes = asUint8Array(rawData);
    if (rawBytes && this.tryHandleBinaryFrame(rawBytes)) {
      return;
    }
    const payload = decodeMessageData(rawData);
    if (!payload) {
      return;
    }
    this.handleJsonPayload(payload, rawBytes?.byteLength);
  }

  private handleJsonPayload(payload: string, rawBytesLength: number | undefined): void {
    const bytes = rawBytesLength ?? payload.length;
    const startMs = perfNow();
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(payload);
    } catch {
      return;
    }

    const parsed = WSOutboundMessageSchema.safeParse(parsedJson);
    if (!parsed.success) {
      const msgType =
        parsedJson != null &&
        typeof parsedJson === "object" &&
        "type" in parsedJson &&
        typeof parsedJson.type === "string"
          ? parsedJson.type
          : "unknown";
      this.logger.warn({ msgType, error: parsed.error.message }, "Message validation failed");
      return;
    }

    this.consecutiveLivenessFailures = 0;

    if (parsed.data.type === "pong") {
      this.resolveLivenessProbe();
      this.runtimeMetrics?.recordMessage("pong", bytes, perfNow() - startMs);
      return;
    }

    this.handleSessionMessage(parsed.data.message);
    const msgType = parsed.data.message.type;
    this.runtimeMetrics?.recordMessage(msgType, bytes, perfNow() - startMs);
    if (parsed.data.message.type === "agent_stream") {
      this.runtimeMetrics?.recordAgentStream(parsed.data.message.payload);
    }
  }

  private tryHandleBinaryFrame(rawBytes: Uint8Array): boolean {
    const fileFrame = decodeFileTransferFrame(rawBytes);
    if (fileFrame) {
      this.handleFileTransferFrame(fileFrame);
      this.runtimeMetrics?.recordBinaryFrame("other", rawBytes.byteLength, 0);
      return true;
    }

    const frame = decodeTerminalStreamFrame(rawBytes);
    if (!frame) {
      return false;
    }
    const binaryStartMs = perfNow();
    this.terminalClient.handleFrame(frame);
    let frameKind: "output" | "snapshot" | "other" = "other";
    if (frame.opcode === TerminalStreamOpcode.Output) {
      frameKind = "output";
    } else if (frame.opcode === TerminalStreamOpcode.Snapshot) {
      frameKind = "snapshot";
    } else if (frame.opcode === TerminalStreamOpcode.Restore) {
      frameKind = "output";
    }
    this.runtimeMetrics?.recordBinaryFrame(
      frameKind,
      rawBytes.byteLength,
      perfNow() - binaryStartMs,
    );
    return true;
  }

  private handleFileTransferFrame(frame: FileTransferFrame): void {
    const outcome = this.binaryFileTransfers.handleFrame(frame);
    if (!outcome) {
      return;
    }
    this.handleSessionMessage({
      type: "file_explorer_response",
      payload: {
        cwd: outcome.cwd,
        path: outcome.path,
        mode: "file",
        directory: null,
        file: null,
        error: outcome.error,
        requestId: outcome.requestId,
      },
    });
  }

  private updateConnectionState(
    next: ConnectionState,
    metadata?: { event: string; reason?: string; reasonCode?: string },
  ): void {
    const previous = this.connectionState;
    this.connectionState = next;
    const reasonFromNext =
      next.status === "disconnected" && typeof next.reason === "string" ? next.reason : null;
    const reason = metadata?.reason ?? reasonFromNext;
    const reasonCode = metadata?.reasonCode ?? toReasonCode(reason);
    this.logger.debug(
      {
        serverId: this.logServerId,
        clientIdHash: this.logClientIdHash,
        from: previous.status,
        to: next.status,
        event: metadata?.event ?? "STATE_UPDATE",
        connectionPath: this.logConnectionPath,
        generation: this.logGeneration,
        reasonCode,
        reason,
      },
      "DaemonClientTransition",
    );
    for (const listener of this.connectionListeners) {
      try {
        listener(next);
      } catch {
        // no-op
      }
    }
  }

  setReconnectEnabled(enabled: boolean): void {
    this.config = { ...this.config, reconnect: { ...this.config.reconnect, enabled } };
  }

  private scheduleReconnect(input?: {
    reason?: string;
    event?: string;
    reasonCode?: string;
  }): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    const wasDisposed = this.connectionState.status === "disposed";
    const reason = input?.reason;

    if (typeof reason === "string" && reason.trim().length > 0) {
      this.lastErrorValue = reason.trim();
    }

    // Clear all pending waiters and queued sends since the connection was lost
    // and responses from the previous connection will never arrive.
    this.clearWaiters(new Error(reason ?? "Connection lost"));
    this.rejectPendingSendQueue(new Error(reason ?? "Connection lost"));
    this.rejectLivenessProbe(new Error(reason ?? "Connection lost"));
    this.terminalClient.clearStreamSlots();
    this.binaryFileTransfers.clearActiveTransfers();
    this.lastServerInfoMessage = null;

    if (wasDisposed) {
      this.rejectConnect(new Error(reason ?? "Daemon client is disposed"));
      return;
    }
    this.emitDisconnectedStateForReconnect(reason, input);
    if (!this.shouldReconnect || this.config.reconnect?.enabled === false) {
      this.rejectConnect(new Error(reason ?? "Transport disconnected before connect"));
      return;
    }

    this.armReconnectTimer();
  }

  private emitDisconnectedStateForReconnect(
    reason: string | undefined,
    input: { reason?: string; event?: string; reasonCode?: string } | undefined,
  ): void {
    this.updateConnectionState(
      {
        status: "disconnected",
        ...(reason ? { reason } : {}),
      },
      {
        event: input?.event ?? "TRANSPORT_CLOSE",
        ...(reason ? { reason } : {}),
        ...(input?.reasonCode ? { reasonCode: input.reasonCode } : {}),
      },
    );
  }

  private armReconnectTimer(): void {
    const attempt = this.reconnectAttempt;
    const baseDelay = this.config.reconnect?.baseDelayMs ?? DEFAULT_RECONNECT_BASE_DELAY_MS;
    const maxDelay = this.config.reconnect?.maxDelayMs ?? DEFAULT_RECONNECT_MAX_DELAY_MS;
    const delay = Math.min(baseDelay * 2 ** attempt, maxDelay);
    this.reconnectAttempt = attempt + 1;
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      if (!this.shouldReconnect) {
        return;
      }
      this.attemptConnect();
    }, delay);
  }

  private resolveLivenessProbe(): void {
    const probe = this.livenessProbe;
    if (!probe) {
      return;
    }
    this.livenessProbe = null;
    clearTimeout(probe.timeoutHandle);
    probe.resolve({ rttMs: perfNow() - probe.startedAt });
  }

  private clearLivenessProbe(): void {
    const probe = this.livenessProbe;
    if (!probe) {
      return;
    }
    this.livenessProbe = null;
    clearTimeout(probe.timeoutHandle);
  }

  private rejectLivenessProbe(error: Error): void {
    const probe = this.livenessProbe;
    if (!probe) {
      return;
    }
    this.livenessProbe = null;
    clearTimeout(probe.timeoutHandle);
    probe.reject(error);
  }

  private recordLivenessFailure(error: Error): void {
    this.consecutiveLivenessFailures += 1;
    if (this.consecutiveLivenessFailures < LIVENESS_FAILURE_RECONNECT_THRESHOLD) {
      return;
    }
    this.consecutiveLivenessFailures = 0;
    this.lastErrorValue = error.message;
    this.disposeTransport(1001, "Liveness check timed out");
    this.scheduleReconnect({
      reason: error.message,
      event: "LIVENESS_TIMEOUT",
      reasonCode: "liveness_timeout",
    });
  }

  private handleSessionMessage(msg: SessionOutboundMessage): void {
    if (msg.type === "status") {
      const serverInfo = parseServerInfoStatusPayload(msg.payload);
      if (serverInfo) {
        this.lastServerInfoMessage = serverInfo;
        if (this.connectionState.status === "connecting") {
          this.resetConnectTimeout();
          this.reconnectAttempt = 0;
          this.updateConnectionState({ status: "connected" }, { event: "HELLO_SERVER_INFO" });
          this.checkoutSubscriptions.resubscribe();
          this.terminalClient.resubscribeDirectories();
          this.flushPendingSendQueue();
          this.resolveConnect();
        }
      }
    }

    if (msg.type === "terminal_stream_exit") {
      this.terminalClient.handleStreamExit(msg.payload.terminalId);
    }

    if (this.rawMessageListeners.size > 0) {
      for (const handler of this.rawMessageListeners) {
        try {
          handler(msg);
        } catch {
          // no-op
        }
      }
    }

    const handlers = this.messageHandlers.get(msg.type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(msg);
        } catch {
          // no-op
        }
      }
    }

    const event = this.toEvent(msg);
    if (event) {
      for (const handler of this.eventListeners) {
        handler(event);
      }
    }

    this.resolveWaiters(msg);
  }

  private resolveWaiters(msg: SessionOutboundMessage): void {
    for (const waiter of Array.from(this.waiters)) {
      const result = waiter.predicate(msg);
      if (result !== null) {
        this.waiters.delete(waiter);
        if (waiter.timeoutHandle) {
          clearTimeout(waiter.timeoutHandle);
        }
        waiter.resolve(result);
      }
    }
  }

  private clearWaiters(error: Error): void {
    for (const waiter of Array.from(this.waiters)) {
      if (waiter.timeoutHandle) {
        clearTimeout(waiter.timeoutHandle);
      }
      waiter.reject(error);
    }
    this.waiters.clear();
  }

  private toEvent(msg: SessionOutboundMessage): DaemonEvent | null {
    switch (msg.type) {
      case "agent_update":
        return {
          type: "agent_update",
          agentId: msg.payload.kind === "upsert" ? msg.payload.agent.id : msg.payload.agentId,
          payload: msg.payload,
        };
      case "workspace_update":
        return {
          type: "workspace_update",
          workspaceId: msg.payload.kind === "upsert" ? msg.payload.workspace.id : msg.payload.id,
          payload: msg.payload,
        };
      case "workspace_setup_progress":
        return {
          type: "workspace_setup_progress",
          workspaceId: msg.payload.workspaceId,
          payload: msg.payload,
        };
      case "agent_stream":
        return {
          type: "agent_stream",
          agentId: msg.payload.agentId,
          event: msg.payload.event,
          timestamp: msg.payload.timestamp,
          ...(typeof msg.payload.seq === "number" ? { seq: msg.payload.seq } : {}),
          ...(typeof msg.payload.epoch === "string" ? { epoch: msg.payload.epoch } : {}),
        };
      case "status":
        return { type: "status", payload: msg.payload };
      case "agent_deleted":
        return { type: "agent_deleted", agentId: msg.payload.agentId };
      case "agent_permission_request":
        return {
          type: "agent_permission_request",
          agentId: msg.payload.agentId,
          request: msg.payload.request,
        };
      case "agent_permission_resolved":
        return {
          type: "agent_permission_resolved",
          agentId: msg.payload.agentId,
          requestId: msg.payload.requestId,
          resolution: msg.payload.resolution,
        };
      case "providers_snapshot_update":
        return {
          type: "providers_snapshot_update",
          payload: msg.payload,
        };
      default:
        return null;
    }
  }

  private waitForWithCancel<T>(
    predicate: (msg: SessionOutboundMessage) => T | null,
    timeout = 30000,
    _options?: { skipQueue?: boolean },
  ): WaitHandle<T> {
    // Capture stack trace at call site, not inside setTimeout
    const timeoutError = new Error(`Timeout waiting for message (${timeout}ms)`);

    let waiter: Waiter<T> | null = null;
    let settled = false;
    let rejectFn: ((error: Error) => void) | null = null;

    const promise = new Promise<T>((resolve, reject) => {
      const wrappedResolve = (value: T) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      const wrappedReject = (error: Error) => {
        if (settled) return;
        settled = true;
        reject(error);
      };
      rejectFn = wrappedReject;

      const timeoutHandle =
        timeout > 0
          ? setTimeout(() => {
              if (waiter) {
                this.waiters.delete(waiter);
              }
              wrappedReject(timeoutError);
            }, timeout)
          : null;

      waiter = {
        predicate,
        resolve: wrappedResolve,
        reject: wrappedReject,
        timeoutHandle,
      };
      this.waiters.add(waiter);
    });

    const cancel = (error: Error) => {
      if (settled) {
        return;
      }

      if (waiter) {
        this.waiters.delete(waiter);
        if (waiter.timeoutHandle) {
          clearTimeout(waiter.timeoutHandle);
        }
      }

      if (rejectFn) {
        rejectFn(error);
        return;
      }

      // Extremely unlikely: cancel called before the Promise executor ran.
      queueMicrotask(() => {
        if (!settled && rejectFn) {
          rejectFn(error);
        }
      });
    };

    return { promise, cancel };
  }
}

function resolveAgentConfig(options: CreateAgentRequestOptions): AgentSessionConfig {
  const {
    config,
    provider,
    cwd,
    env: _env,
    workspaceId: _workspaceId,
    initialPrompt: _initialPrompt,
    images: _images,
    git: _git,
    worktreeName: _worktreeName,
    requestId: _requestId,
    labels: _labels,
    ...overrides
  } = options;

  const baseConfig: Partial<AgentSessionConfig> = {
    ...(provider ? { provider } : {}),
    ...(cwd ? { cwd } : {}),
    ...overrides,
  };

  const merged = config ? { ...baseConfig, ...config } : baseConfig;

  if (!merged.provider || !merged.cwd) {
    throw new Error("createAgent requires provider and cwd");
  }

  return {
    ...merged,
    provider: merged.provider,
    cwd: merged.cwd,
  };
}
