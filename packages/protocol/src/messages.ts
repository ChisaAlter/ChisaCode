import { z } from "zod/v3";
import { CLIENT_CAPS } from "./client-capabilities.js";
import { AGENT_LIFECYCLE_STATUSES } from "./agent-lifecycle.js";
import { MAX_EXPLICIT_AGENT_TITLE_CHARS } from "@chisacode/protocol/agent-title-limits";
import { AgentProviderSchema } from "@chisacode/protocol/provider-manifest";
import { AGENT_RELATION_KINDS, AGENT_RELATION_SOURCES } from "./agent-labels.js";
import { SyntheticModelConfigSchema } from "@chisacode/protocol/provider-config";
import { TOOL_CALL_ICON_NAMES } from "./agent-types.js";
import {
  ChatCreateRequestSchema,
  ChatListRequestSchema,
  ChatInspectRequestSchema,
  ChatDeleteRequestSchema,
  ChatPostRequestSchema,
  ChatReadRequestSchema,
  ChatWaitRequestSchema,
  ChatCreateResponseSchema,
  ChatListResponseSchema,
  ChatInspectResponseSchema,
  ChatDeleteResponseSchema,
  ChatPostResponseSchema,
  ChatReadResponseSchema,
  ChatWaitResponseSchema,
} from "./chat/rpc-schemas.js";
import {
  ScheduleCreateRequestSchema,
  ScheduleListRequestSchema,
  ScheduleInspectRequestSchema,
  ScheduleLogsRequestSchema,
  SchedulePauseRequestSchema,
  ScheduleResumeRequestSchema,
  ScheduleDeleteRequestSchema,
  ScheduleRunOnceRequestSchema,
  ScheduleUpdateRequestSchema,
  ScheduleCreateResponseSchema,
  ScheduleListResponseSchema,
  ScheduleInspectResponseSchema,
  ScheduleLogsResponseSchema,
  SchedulePauseResponseSchema,
  ScheduleResumeResponseSchema,
  ScheduleDeleteResponseSchema,
  ScheduleRunOnceResponseSchema,
  ScheduleUpdateResponseSchema,
} from "@chisacode/protocol/schedule/rpc-schemas";
import {
  LoopRunRequestSchema,
  LoopListRequestSchema,
  LoopInspectRequestSchema,
  LoopLogsRequestSchema,
  LoopStopRequestSchema,
  LoopRunResponseSchema,
  LoopListResponseSchema,
  LoopInspectResponseSchema,
  LoopLogsResponseSchema,
  LoopStopResponseSchema,
} from "@chisacode/protocol/loop/rpc-schemas";
import { AgentPresetSchema, AgentPresetsPayloadSchema } from "@chisacode/protocol/agent-presets";
import {
  GenerativeUiActionRequestSchema,
  GenerativeUiActionResponseSchema,
  LegacyGenerativeUiActionRequestSchema,
} from "@chisacode/protocol/generative-ui/rpc-schemas";
import {
  TerminalInboundMessageSchemas,
  TerminalOutboundMessageSchemas,
} from "./terminal/messages.js";
import {
  CheckoutInboundMessageSchemas,
  CheckoutOutboundMessageSchemas,
} from "./checkout/messages.js";
import { AgentAttachmentsSchema } from "./agent/attachments.js";
import {
  ProjectPlacementPayloadSchema,
  WorkspaceInboundMessageSchemas,
  WorkspaceOutboundMessageSchemas,
  WorktreeSetupDetailPayloadSchema,
} from "./workspace/messages.js";
import {
  AgentFeatureSchema,
  AgentModeSchema,
  ListCommandsDraftConfigSchema,
  ProviderInboundMessageSchemas,
  ProviderOutboundMessageSchemas,
} from "./provider/messages.js";
import {
  AgentExtensionInboundMessageSchemas,
  AgentExtensionOutboundMessageSchemas,
  McpServerConfigSchema,
} from "./agent/extensions.js";
import {
  DaemonInboundMessageSchemas,
  DaemonOutboundMessageSchemas,
  DaemonStatusPayloadSchemas,
} from "./daemon/messages.js";
import { UsageInboundMessageSchemas, UsageOutboundMessageSchemas } from "./usage/messages.js";
import {
  ServerVoiceCapabilitiesSchema,
  VoiceInboundMessageSchemas,
  VoiceOutboundMessageSchemas,
} from "./voice/messages.js";
export * from "./agent/attachments.js";
export * from "./agent/extensions.js";
export * from "./daemon/messages.js";
export * from "./provider/messages.js";
export * from "./terminal/messages.js";
export * from "./usage/messages.js";
export * from "./voice/messages.js";
export * from "./checkout/messages.js";
export * from "./workspace/messages.js";
import {
  ChisaCodeConfigRawSchema,
  ChisaCodeLifecycleCommandRawSchema,
  ChisaCodeMetadataGenerationEntrySchema,
  ChisaCodeMetadataGenerationSchema,
  ChisaCodeScriptEntryRawSchema,
  ChisaCodeWorktreeConfigRawSchema,
  type ChisaCodeConfigRaw,
  type ChisaCodeConfigRevision,
  type ChisaCodeMetadataGeneration,
  type ChisaCodeMetadataGenerationEntry,
  type ChisaCodeScriptEntryRaw,
  type ProjectConfigRpcError,
} from "@chisacode/protocol/chisacode-config-schema";
export {
  ChisaCodeConfigRawSchema,
  ChisaCodeLifecycleCommandRawSchema,
  ChisaCodeMetadataGenerationEntrySchema,
  ChisaCodeMetadataGenerationSchema,
  ChisaCodeScriptEntryRawSchema,
  ChisaCodeWorktreeConfigRawSchema,
  type ChisaCodeConfigRaw,
  type ChisaCodeConfigRevision,
  type ChisaCodeMetadataGeneration,
  type ChisaCodeMetadataGenerationEntry,
  type ChisaCodeScriptEntryRaw,
  type ProjectConfigRpcError,
};
import type {
  AgentCapabilityFlags,
  AgentPermissionRequest,
  AgentPermissionResponse,
  AgentPersistenceHandle,
  AgentRuntimeInfo,
  AgentTimelineItem,
  ToolCallDetail,
  ToolCallTimelineItem,
  AgentUsage,
} from "./agent-types.js";

export const AgentStatusSchema = z.enum(AGENT_LIFECYCLE_STATUSES);

const AgentCapabilityFlagsSchema: z.ZodType<AgentCapabilityFlags> = z.object({
  supportsStreaming: z.boolean(),
  supportsSessionPersistence: z.boolean(),
  supportsDynamicModes: z.boolean(),
  supportsMcpServers: z.boolean(),
  supportsReasoningStream: z.boolean(),
  supportsToolInvocations: z.boolean(),
  // COMPAT(rewind): added in v0.1.X, drop when floor >= v0.1.X.
  supportsRewindConversation: z.boolean().optional().default(false),
  // COMPAT(rewind): added in v0.1.X, drop when floor >= v0.1.X.
  supportsRewindFiles: z.boolean().optional().default(false),
  // COMPAT(rewind): added in v0.1.X, drop when floor >= v0.1.X.
  supportsRewindBoth: z.boolean().optional().default(false),
});

const AgentUsageSchema: z.ZodType<AgentUsage> = z.object({
  inputTokens: z.number().optional(),
  cachedInputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  totalCostUsd: z.number().optional(),
  contextWindowMaxTokens: z.number().optional(),
  contextWindowUsedTokens: z.number().optional(),
});

const AgentSessionConfigSchema = z.object({
  provider: AgentProviderSchema,
  runtimeProvider: AgentProviderSchema.optional(),
  cwd: z.string(),
  modeId: z.string().optional(),
  model: z.string().optional(),
  thinkingOptionId: z.string().optional(),
  featureValues: z.record(z.unknown()).optional(),
  title: z.string().trim().min(1).max(MAX_EXPLICIT_AGENT_TITLE_CHARS).optional().nullable(),
  approvalPolicy: z.string().optional(),
  sandboxMode: z.string().optional(),
  networkAccess: z.boolean().optional(),
  webSearch: z.boolean().optional(),
  extra: z
    .object({
      codex: z.record(z.unknown()).optional(),
      claude: z.record(z.unknown()).optional(),
    })
    .partial()
    .optional(),
  systemPrompt: z.string().optional(),
  mcpServers: z.record(McpServerConfigSchema).optional(),
});

const AgentPermissionUpdateSchema = z.record(z.unknown());
const AgentPermissionActionSchema = z.object({
  id: z.string(),
  label: z.string(),
  behavior: z.enum(["allow", "deny"]),
  variant: z.enum(["primary", "secondary", "danger"]).optional(),
  intent: z.enum(["implement", "implement_resume", "dismiss"]).optional(),
});

export const AgentPermissionResponseSchema: z.ZodType<AgentPermissionResponse> = z.union([
  z.object({
    behavior: z.literal("allow"),
    selectedActionId: z.string().optional(),
    updatedInput: z.record(z.unknown()).optional(),
    updatedPermissions: z.array(AgentPermissionUpdateSchema).optional(),
  }),
  z.object({
    behavior: z.literal("deny"),
    selectedActionId: z.string().optional(),
    message: z.string().optional(),
    interrupt: z.boolean().optional(),
  }),
]);

export const AgentPermissionRequestPayloadSchema: z.ZodType<
  AgentPermissionRequest,
  z.ZodTypeDef,
  unknown
> = z.object({
  id: z.string(),
  provider: AgentProviderSchema,
  name: z.string(),
  kind: z.enum(["tool", "plan", "question", "mode", "other"]),
  title: z.string().optional(),
  description: z.string().optional(),
  input: z.record(z.unknown()).optional(),
  detail: z.lazy(() => ToolCallDetailPayloadSchema).optional(),
  suggestions: z.array(AgentPermissionUpdateSchema).optional(),
  actions: z.array(AgentPermissionActionSchema).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const UnknownValueSchema = z.union([
  z.null(),
  z.boolean(),
  z.number(),
  z.string(),
  z.array(z.unknown()),
  z.object({}).passthrough(),
]);

const NonNullUnknownSchema = z.union([
  z.boolean(),
  z.number(),
  z.string(),
  z.array(z.unknown()),
  z.object({}).passthrough(),
]);

const ToolCallDetailPayloadSchema: z.ZodType<ToolCallDetail, z.ZodTypeDef, unknown> =
  z.discriminatedUnion("type", [
    WorktreeSetupDetailPayloadSchema,
    z.object({
      type: z.literal("shell"),
      command: z.string(),
      cwd: z.string().optional(),
      output: z.string().optional(),
      exitCode: z.number().nullable().optional(),
    }),
    z.object({
      type: z.literal("read"),
      filePath: z.string(),
      content: z.string().optional(),
      offset: z.number().optional(),
      limit: z.number().optional(),
    }),
    z.object({
      type: z.literal("edit"),
      filePath: z.string(),
      oldString: z.string().optional(),
      newString: z.string().optional(),
      unifiedDiff: z.string().optional(),
    }),
    z.object({
      type: z.literal("write"),
      filePath: z.string(),
      content: z.string().optional(),
    }),
    z.object({
      type: z.literal("search"),
      query: z.string(),
      toolName: z.enum(["search", "grep", "glob", "web_search"]).optional(),
      content: z.string().optional(),
      filePaths: z.array(z.string()).optional(),
      webResults: z
        .array(
          z.object({
            title: z.string(),
            url: z.string(),
          }),
        )
        .optional(),
      annotations: z.array(z.string()).optional(),
      numFiles: z.number().optional(),
      numMatches: z.number().optional(),
      durationMs: z.number().optional(),
      durationSeconds: z.number().optional(),
      truncated: z.boolean().optional(),
      mode: z.enum(["content", "files_with_matches", "count"]).optional(),
    }),
    z.object({
      type: z.literal("fetch"),
      url: z.string(),
      prompt: z.string().optional(),
      result: z.string().optional(),
      code: z.number().optional(),
      codeText: z.string().optional(),
      bytes: z.number().optional(),
      durationMs: z.number().optional(),
    }),
    z.object({
      type: z.literal("sub_agent"),
      subAgentType: z.string().optional(),
      description: z.string().optional(),
      childSessionId: z.string().optional(),
      log: z.string(),
      // Compat cruft for clients <= 0.1.65-beta.3 that required this field. Producers still
      // emit `[]`; nothing reads it. Drop the field (and the `[]` emissions) once those
      // clients are no longer in the field.
      actions: z
        .array(
          z.object({
            index: z.number().int().positive(),
            toolName: z.string(),
            summary: z.string().optional(),
          }),
        )
        .optional(),
    }),
    z.object({
      type: z.literal("plain_text"),
      label: z.string().optional(),
      text: z.string().optional(),
      icon: z.enum(TOOL_CALL_ICON_NAMES).optional(),
    }),
    z.object({
      type: z.literal("plan"),
      text: z.string(),
    }),
    z.object({
      type: z.literal("unknown"),
      input: UnknownValueSchema,
      output: UnknownValueSchema,
    }),
  ]);

const ToolCallBasePayloadSchema = z
  .object({
    type: z.literal("tool_call"),
    callId: z.string(),
    name: z.string(),
    detail: ToolCallDetailPayloadSchema,
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const ToolCallRunningPayloadSchema = ToolCallBasePayloadSchema.extend({
  status: z.literal("running"),
  error: z.null(),
});

const ToolCallCompletedPayloadSchema = ToolCallBasePayloadSchema.extend({
  status: z.literal("completed"),
  error: z.null(),
});

const ToolCallFailedPayloadSchema = ToolCallBasePayloadSchema.extend({
  status: z.literal("failed"),
  error: NonNullUnknownSchema,
});

const ToolCallCanceledPayloadSchema = ToolCallBasePayloadSchema.extend({
  status: z.literal("canceled"),
  error: z.null(),
});

const ToolCallTimelineItemPayloadSchema: z.ZodType<ToolCallTimelineItem, z.ZodTypeDef, unknown> =
  z.union([
    ToolCallRunningPayloadSchema,
    ToolCallCompletedPayloadSchema,
    ToolCallFailedPayloadSchema,
    ToolCallCanceledPayloadSchema,
  ]);

export const GenerativeUiTimelineItemPayloadSchema = z.object({
  type: z.literal("generative_ui"),
  instanceId: z.string(),
  componentId: z.string(),
  props: z.record(z.string(), z.unknown()),
  title: z.string().optional(),
  source: z.enum(["tool_call", "fence"]),
  status: z.enum(["rendering", "interactive", "error"]),
});

export const AgentTimelineItemPayloadSchema: z.ZodType<AgentTimelineItem, z.ZodTypeDef, unknown> =
  z.union([
    z.object({
      type: z.literal("user_message"),
      text: z.string(),
      messageId: z.string().optional(),
    }),
    z.object({
      type: z.literal("assistant_message"),
      text: z.string(),
      messageId: z.string().optional(),
    }),
    z.object({
      type: z.literal("reasoning"),
      text: z.string(),
    }),
    ToolCallTimelineItemPayloadSchema,
    GenerativeUiTimelineItemPayloadSchema,
    z.object({
      type: z.literal("todo"),
      items: z.array(
        z.object({
          text: z.string(),
          completed: z.boolean(),
        }),
      ),
    }),
    z.object({
      type: z.literal("error"),
      message: z.string(),
    }),
    z.object({
      type: z.literal("compaction"),
      status: z.enum(["loading", "completed"]),
      trigger: z.enum(["auto", "manual"]).optional(),
      preTokens: z.number().optional(),
    }),
    z.object({
      type: z.literal("turn_changes"),
      changeSummary: z.string(),
      changedFiles: z.array(
        z.object({
          path: z.string(),
          additions: z.number().optional(),
          deletions: z.number().optional(),
        }),
      ),
      checkpointRef: z.string().optional(),
    }),
  ]);

export const AgentStreamEventPayloadSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("thread_started"),
    sessionId: z.string(),
    provider: AgentProviderSchema,
  }),
  z.object({
    type: z.literal("turn_started"),
    provider: AgentProviderSchema,
  }),
  z.object({
    type: z.literal("turn_completed"),
    provider: AgentProviderSchema,
    usage: AgentUsageSchema.optional(),
  }),
  z.object({
    type: z.literal("turn_failed"),
    provider: AgentProviderSchema,
    error: z.string(),
    code: z.string().optional(),
    diagnostic: z.string().optional(),
  }),
  z.object({
    type: z.literal("turn_canceled"),
    provider: AgentProviderSchema,
    reason: z.string(),
  }),
  z.object({
    type: z.literal("timeline"),
    provider: AgentProviderSchema,
    item: AgentTimelineItemPayloadSchema,
  }),
  z.object({
    type: z.literal("permission_requested"),
    provider: AgentProviderSchema,
    request: AgentPermissionRequestPayloadSchema,
  }),
  z.object({
    type: z.literal("permission_resolved"),
    provider: AgentProviderSchema,
    requestId: z.string(),
    resolution: AgentPermissionResponseSchema,
  }),
  z.object({
    type: z.literal("attention_required"),
    provider: AgentProviderSchema,
    reason: z.enum(["finished", "error", "permission"]),
    timestamp: z.string(),
    shouldNotify: z.boolean(),
    notification: z
      .object({
        title: z.string(),
        body: z.string(),
        data: z.object({
          serverId: z.string(),
          agentId: z.string(),
          reason: z.enum(["finished", "error", "permission"]),
        }),
      })
      .optional(),
  }),
  z.object({
    type: z.literal("generative_ui_update"),
    instanceId: z.string(),
    props: z.record(z.string(), z.unknown()),
    status: z.enum(["rendering", "interactive", "error"]).optional(),
    timestamp: z.string().optional(),
  }),
  z.object({
    type: z.literal("generative_ui_remove"),
    instanceId: z.string(),
    timestamp: z.string().optional(),
  }),
]);

const AgentPersistenceHandleSchema: z.ZodType<AgentPersistenceHandle | null> = z
  .object({
    provider: AgentProviderSchema,
    sessionId: z.string(),
    nativeHandle: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .nullable();

const AgentRuntimeInfoSchema: z.ZodType<AgentRuntimeInfo> = z.object({
  provider: AgentProviderSchema,
  sessionId: z.string().nullable(),
  model: z.string().nullable().optional(),
  thinkingOptionId: z.string().nullable().optional(),
  modeId: z.string().nullable().optional(),
  extra: z.record(z.string(), z.unknown()).optional(),
});

export const AgentRelationSchema = z.object({
  kind: z.enum(AGENT_RELATION_KINDS),
  parentAgentId: z.string().optional(),
  taskId: z.string().optional(),
  source: z.enum(AGENT_RELATION_SOURCES).optional(),
});

export const AgentSnapshotPayloadSchema = z.object({
  id: z.string(),
  provider: AgentProviderSchema,
  cwd: z.string(),
  model: z.string().nullable(),
  features: z.array(AgentFeatureSchema).optional(),
  thinkingOptionId: z.string().nullable().optional(),
  effectiveThinkingOptionId: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastUserMessageAt: z.string().nullable(),
  status: AgentStatusSchema,
  capabilities: AgentCapabilityFlagsSchema,
  currentModeId: z.string().nullable(),
  availableModes: z.array(AgentModeSchema),
  pendingPermissions: z.array(AgentPermissionRequestPayloadSchema),
  persistence: AgentPersistenceHandleSchema.nullable(),
  runtimeInfo: AgentRuntimeInfoSchema.optional(),
  lastUsage: AgentUsageSchema.optional(),
  lastError: z.string().optional(),
  title: z.string().nullable(),
  labels: z.record(z.string(), z.string()).default({}),
  relation: AgentRelationSchema.optional(),
  requiresAttention: z.boolean().optional(),
  attentionReason: z.enum(["finished", "error", "permission"]).nullable().optional(),
  attentionTimestamp: z.string().nullable().optional(),
  archivedAt: z.string().nullable().optional(),
  providerUnavailable: z.boolean().optional(),
});

export type AgentSnapshotPayload = z.infer<typeof AgentSnapshotPayloadSchema>;

export const AgentListItemPayloadSchema = z.object({
  id: z.string(),
  shortId: z.string(),
  title: z.string().nullable(),
  provider: AgentProviderSchema,
  model: z.string().nullable(),
  thinkingOptionId: z.string().nullable().optional(),
  effectiveThinkingOptionId: z.string().nullable().optional(),
  status: AgentStatusSchema,
  cwd: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastUserMessageAt: z.string().nullable(),
  archivedAt: z.string().nullable().optional(),
  requiresAttention: z.boolean().optional(),
  attentionReason: z.enum(["finished", "error", "permission"]).nullable().optional(),
  attentionTimestamp: z.string().nullable().optional(),
  labels: z.record(z.string(), z.string()).default({}),
  providerUnavailable: z.boolean().optional(),
});

export type AgentListItemPayload = z.infer<typeof AgentListItemPayloadSchema>;
export const AgentPresetPayloadSchema = AgentPresetSchema;

export type AgentStreamEventPayload = z.infer<typeof AgentStreamEventPayloadSchema>;

// ============================================================================
// Session Inbound Messages (Session receives these)
// ============================================================================

export const AbortRequestMessageSchema = z.object({
  type: z.literal("abort_request"),
});

const AgentDirectoryFilterSchema = z.object({
  labels: z.record(z.string()).optional(),
  projectKeys: z.array(z.string()).optional(),
  statuses: z.array(AgentStatusSchema).optional(),
  includeArchived: z.boolean().optional(),
  requiresAttention: z.boolean().optional(),
  thinkingOptionId: z.string().nullable().optional(),
});

export const DeleteAgentRequestMessageSchema = z.object({
  type: z.literal("delete_agent_request"),
  agentId: z.string(),
  requestId: z.string(),
});

export const ArchiveAgentRequestMessageSchema = z.object({
  type: z.literal("archive_agent_request"),
  agentId: z.string(),
  requestId: z.string(),
});

export const CloseItemsRequestMessageSchema = z.object({
  type: z.literal("close_items_request"),
  agentIds: z.array(z.string()).default([]),
  terminalIds: z.array(z.string()).default([]),
  requestId: z.string(),
});

export const UpdateAgentRequestMessageSchema = z.object({
  type: z.literal("update_agent_request"),
  agentId: z.string(),
  name: z.string().optional(),
  labels: z.record(z.string()).optional(),
  requestId: z.string(),
});

export const ProjectRenameRequestSchema = z.object({
  type: z.literal("project.rename.request"),
  projectId: z.string(),
  // Null or empty string clears the override and reverts to the derived name.
  customName: z.string().nullable(),
  requestId: z.string(),
});

const ImageAttachmentSchema = z.object({
  data: z.string(), // base64 encoded image
  mimeType: z.string(), // e.g., "image/jpeg", "image/png"
});

export const SendAgentMessageSchema = z.object({
  type: z.literal("send_agent_message"),
  agentId: z.string(),
  text: z.string(),
  messageId: z.string().optional(), // Client-provided ID for deduplication
  images: z.array(ImageAttachmentSchema).optional(),
  attachments: AgentAttachmentsSchema,
});

// ============================================================================
// Agent RPCs (requestId-correlated)
// ============================================================================

export const FetchAgentsRequestMessageSchema = z.object({
  type: z.literal("fetch_agents_request"),
  requestId: z.string(),
  scope: z.enum(["active"]).optional(),
  filter: AgentDirectoryFilterSchema.optional(),
  sort: z
    .array(
      z.object({
        key: z.enum(["status_priority", "created_at", "updated_at", "title"]),
        direction: z.enum(["asc", "desc"]),
      }),
    )
    .optional(),
  page: z
    .object({
      limit: z.number().int().positive().max(200),
      cursor: z.string().min(1).optional(),
    })
    .optional(),
  subscribe: z
    .object({
      subscriptionId: z.string().optional(),
    })
    .optional(),
});

export const FetchAgentHistoryRequestMessageSchema = z.object({
  type: z.literal("fetch_agent_history_request"),
  requestId: z.string(),
  filter: AgentDirectoryFilterSchema.optional(),
  sort: z
    .array(
      z.object({
        key: z.enum(["status_priority", "created_at", "updated_at", "title"]),
        direction: z.enum(["asc", "desc"]),
      }),
    )
    .optional(),
  page: z
    .object({
      limit: z.number().int().positive().max(200),
      cursor: z.string().min(1).optional(),
    })
    .optional(),
});

export const FetchAgentRequestMessageSchema = z.object({
  type: z.literal("fetch_agent_request"),
  requestId: z.string(),
  /** Accepts full ID, unique prefix, or exact full title (server resolves). */
  agentId: z.string(),
});

export const SendAgentMessageRequestSchema = z.object({
  type: z.literal("send_agent_message_request"),
  requestId: z.string(),
  /** Accepts full ID, unique prefix, or exact full title (server resolves). */
  agentId: z.string(),
  text: z.string(),
  messageId: z.string().optional(), // Client-provided ID for deduplication
  images: z.array(ImageAttachmentSchema).optional(),
  attachments: AgentAttachmentsSchema,
});

export const WaitForFinishRequestSchema = z.object({
  type: z.literal("wait_for_finish_request"),
  requestId: z.string(),
  /** Accepts full ID, unique prefix, or exact full title (server resolves). */
  agentId: z.string(),
  timeoutMs: z.number().int().positive().optional(),
});

const GitSetupOptionsSchema = z.object({
  baseBranch: z.string().optional(),
  createNewBranch: z.boolean().optional(),
  newBranchName: z.string().optional(),
  createWorktree: z.boolean().optional(),
  worktreeSlug: z.string().optional(),
  refName: z.string().min(1).optional(),
  action: z.enum(["branch-off", "checkout"]).optional(),
  githubPrNumber: z.number().int().positive().optional(),
});

export type GitSetupOptions = z.infer<typeof GitSetupOptionsSchema>;

export const CreateAgentWorktreeTargetSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("branch-off"),
    newBranch: z.string().min(1),
    base: z.string().min(1).optional(),
  }),
  z.object({
    mode: z.literal("checkout-branch"),
    branch: z.string().min(1),
  }),
  z.object({
    mode: z.literal("checkout-pr"),
    prNumber: z.number().int().positive(),
  }),
]);

export type CreateAgentWorktreeTarget = z.infer<typeof CreateAgentWorktreeTargetSchema>;

export const CreateAgentRequestMessageSchema = z.object({
  type: z.literal("create_agent_request"),
  config: AgentSessionConfigSchema,
  env: z.record(z.string()).optional(),
  workspaceId: z.string().optional(),
  worktreeName: z.string().optional(),
  initialPrompt: z.string().optional(),
  clientMessageId: z.string().optional(),
  outputSchema: z.record(z.unknown()).optional(),
  images: z.array(ImageAttachmentSchema).optional(),
  attachments: AgentAttachmentsSchema,
  git: GitSetupOptionsSchema.optional(),
  worktree: CreateAgentWorktreeTargetSchema.optional(),
  autoArchive: z.boolean().optional(),
  labels: z.record(z.string()).default({}),
  relationKind: z.enum(AGENT_RELATION_KINDS).optional(),
  requestId: z.string(),
});

export const AgentPresetsListRequestMessageSchema = z.object({
  type: z.literal("agent.presets.list.request"),
  requestId: z.string(),
});

export const ModelGatewayMoaTestRequestMessageSchema = z.object({
  type: z.literal("model_gateway.moa.test.request"),
  requestId: z.string(),
  gatewayId: z.string().min(1),
  syntheticModel: SyntheticModelConfigSchema,
  prompt: z.string().min(1),
});

export const ResumeAgentRequestMessageSchema = z.object({
  type: z.literal("resume_agent_request"),
  handle: AgentPersistenceHandleSchema,
  overrides: AgentSessionConfigSchema.partial().optional(),
  requestId: z.string(),
});

export const ImportAgentRequestMessageSchema = z.object({
  type: z.literal("import_agent_request"),
  provider: AgentProviderSchema.optional(),
  providerId: z.string().optional(),
  sessionId: z.string().optional(),
  providerHandleId: z.string().optional(),
  cwd: z.string().optional(),
  labels: z.record(z.string()).optional(),
  requestId: z.string(),
});

export const RefreshAgentRequestMessageSchema = z.object({
  type: z.literal("refresh_agent_request"),
  agentId: z.string(),
  requestId: z.string(),
});

export const CancelAgentRequestMessageSchema = z.object({
  type: z.literal("cancel_agent_request"),
  agentId: z.string(),
  requestId: z.string().optional(),
});

export const AgentTimelineCursorSchema = z.object({
  epoch: z.string(),
  seq: z.number().int().nonnegative(),
});

export const FetchAgentTimelineRequestMessageSchema = z.object({
  type: z.literal("fetch_agent_timeline_request"),
  agentId: z.string(),
  requestId: z.string(),
  direction: z.enum(["tail", "before", "after"]).optional(),
  cursor: AgentTimelineCursorSchema.optional(),
  // 0 means "all matching rows for this query window".
  limit: z.number().int().nonnegative().optional(),
  // Default should be projected for app timeline loading.
  projection: z.enum(["projected", "canonical"]).optional(),
});

export const SetAgentModeRequestMessageSchema = z.object({
  type: z.literal("set_agent_mode_request"),
  agentId: z.string(),
  modeId: z.string(),
  requestId: z.string(),
});

const AgentActionResponsePayloadSchema = z.object({
  requestId: z.string(),
  agentId: z.string(),
  accepted: z.boolean(),
  error: z.string().nullable(),
});

export const SetAgentModeResponseMessageSchema = z.object({
  type: z.literal("set_agent_mode_response"),
  payload: AgentActionResponsePayloadSchema,
});

export const SetAgentModelRequestMessageSchema = z.object({
  type: z.literal("set_agent_model_request"),
  agentId: z.string(),
  modelId: z.string().nullable(),
  runtimeProvider: AgentProviderSchema.nullable().optional(),
  requestId: z.string(),
});

export const SetAgentModelResponseMessageSchema = z.object({
  type: z.literal("set_agent_model_response"),
  payload: AgentActionResponsePayloadSchema,
});

export const SetAgentThinkingRequestMessageSchema = z.object({
  type: z.literal("set_agent_thinking_request"),
  agentId: z.string(),
  thinkingOptionId: z.string().nullable(),
  requestId: z.string(),
});

export const SetAgentThinkingResponseMessageSchema = z.object({
  type: z.literal("set_agent_thinking_response"),
  payload: AgentActionResponsePayloadSchema,
});

export const SetAgentFeatureRequestMessageSchema = z.object({
  type: z.literal("set_agent_feature_request"),
  agentId: z.string(),
  featureId: z.string(),
  value: z.unknown(),
  requestId: z.string(),
});

export const SetAgentFeatureResponseMessageSchema = z.object({
  type: z.literal("set_agent_feature_response"),
  payload: AgentActionResponsePayloadSchema,
});

export const AgentRewindModeSchema = z.enum(["conversation", "files", "both"]);

export const AgentRewindRequestMessageSchema = z.object({
  type: z.literal("agent.rewind.request"),
  agentId: z.string(),
  messageId: z.string(),
  mode: AgentRewindModeSchema,
  requestId: z.string(),
});

export const AgentRewindResponseMessageSchema = z.object({
  type: z.literal("agent.rewind.response"),
  payload: z.object({
    requestId: z.string(),
    agentId: z.string(),
    ok: z.boolean(),
    error: z.string().nullable(),
  }),
});

export const UpdateAgentResponseMessageSchema = z.object({
  type: z.literal("update_agent_response"),
  payload: AgentActionResponsePayloadSchema,
});

export const ProjectRenameResponsePayloadSchema = z.object({
  requestId: z.string(),
  projectId: z.string(),
  accepted: z.boolean(),
  customName: z.string().nullable(),
  error: z.string().nullable(),
});

export const ProjectRenameResponseSchema = z.object({
  type: z.literal("project.rename.response"),
  payload: ProjectRenameResponsePayloadSchema,
});

export const AgentPermissionResponseMessageSchema = z.object({
  type: z.literal("agent_permission_response"),
  agentId: z.string(),
  requestId: z.string(),
  response: AgentPermissionResponseSchema,
});

export const ClearAgentAttentionMessageSchema = z.object({
  type: z.literal("clear_agent_attention"),
  agentId: z.union([z.string(), z.array(z.string())]),
  requestId: z.string().optional(),
});

export const ClientHeartbeatMessageSchema = z.object({
  type: z.literal("client_heartbeat"),
  deviceType: z.enum(["web", "mobile"]),
  focusedAgentId: z.string().nullable(),
  lastActivityAt: z.string(),
  appVisible: z.boolean(),
  appVisibilityChangedAt: z.string().optional(),
});

export const PingMessageSchema = z.object({
  type: z.literal("ping"),
  requestId: z.string(),
  clientSentAt: z.number().int().optional(),
});

export const ListCommandsRequestSchema = z.object({
  type: z.literal("list_commands_request"),
  agentId: z.string(),
  draftConfig: ListCommandsDraftConfigSchema.optional(),
  requestId: z.string(),
});

export const RegisterPushTokenMessageSchema = z.object({
  type: z.literal("register_push_token"),
  token: z.string(),
});

export const SessionInboundMessageSchema = z.discriminatedUnion("type", [
  ...VoiceInboundMessageSchemas,
  AbortRequestMessageSchema,
  FetchAgentsRequestMessageSchema,
  FetchAgentHistoryRequestMessageSchema,
  ...UsageInboundMessageSchemas,
  FetchAgentRequestMessageSchema,
  DeleteAgentRequestMessageSchema,
  ArchiveAgentRequestMessageSchema,
  CloseItemsRequestMessageSchema,
  UpdateAgentRequestMessageSchema,
  ProjectRenameRequestSchema,
  SendAgentMessageRequestSchema,
  WaitForFinishRequestSchema,
  ...DaemonInboundMessageSchemas,
  ...AgentExtensionInboundMessageSchemas,
  CreateAgentRequestMessageSchema,
  AgentPresetsListRequestMessageSchema,
  ModelGatewayMoaTestRequestMessageSchema,
  ResumeAgentRequestMessageSchema,
  ImportAgentRequestMessageSchema,
  RefreshAgentRequestMessageSchema,
  CancelAgentRequestMessageSchema,
  FetchAgentTimelineRequestMessageSchema,
  SetAgentModeRequestMessageSchema,
  SetAgentModelRequestMessageSchema,
  SetAgentThinkingRequestMessageSchema,
  SetAgentFeatureRequestMessageSchema,
  AgentRewindRequestMessageSchema,
  AgentPermissionResponseMessageSchema,
  ...CheckoutInboundMessageSchemas,
  ...WorkspaceInboundMessageSchemas,
  ...ProviderInboundMessageSchemas,
  ClearAgentAttentionMessageSchema,
  ClientHeartbeatMessageSchema,
  PingMessageSchema,
  ListCommandsRequestSchema,
  RegisterPushTokenMessageSchema,
  ...TerminalInboundMessageSchemas,
  ChatCreateRequestSchema,
  ChatListRequestSchema,
  ChatInspectRequestSchema,
  ChatDeleteRequestSchema,
  ChatPostRequestSchema,
  ChatReadRequestSchema,
  ChatWaitRequestSchema,
  ScheduleCreateRequestSchema,
  ScheduleListRequestSchema,
  ScheduleInspectRequestSchema,
  ScheduleLogsRequestSchema,
  SchedulePauseRequestSchema,
  ScheduleResumeRequestSchema,
  ScheduleDeleteRequestSchema,
  ScheduleRunOnceRequestSchema,
  ScheduleUpdateRequestSchema,
  LoopRunRequestSchema,
  LoopListRequestSchema,
  LoopInspectRequestSchema,
  LoopLogsRequestSchema,
  LoopStopRequestSchema,
  GenerativeUiActionRequestSchema,
  // COMPAT(generativeUiActionFlatRpc): added in v0.1.101; remove after 2027-01-11 once the client floor is >= v0.1.101.
  LegacyGenerativeUiActionRequestSchema,
]);

export type SessionInboundMessage = z.infer<typeof SessionInboundMessageSchema>;

// ============================================================================
// Session Outbound Messages (Session emits these)
// ============================================================================

export const ActivityLogPayloadSchema = z.object({
  id: z.string(),
  timestamp: z.coerce.date(),
  type: z.enum(["transcript", "assistant", "tool_call", "tool_result", "error", "system"]),
  content: z.string(),
  metadata: z.record(z.unknown()).optional(),
});

export const ActivityLogMessageSchema = z.object({
  type: z.literal("activity_log"),
  payload: ActivityLogPayloadSchema,
});

export const AssistantChunkMessageSchema = z.object({
  type: z.literal("assistant_chunk"),
  payload: z.object({
    chunk: z.string(),
  }),
});

export const ServerCapabilitiesSchema = z
  .object({
    voice: ServerVoiceCapabilitiesSchema.optional(),
  })
  .passthrough();

const ServerInfoHostnameSchema = z.unknown().transform((value): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
});

const ServerInfoVersionSchema = z.unknown().transform((value): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
});

const ServerCapabilitiesFromUnknownSchema = z
  .unknown()
  .optional()
  .transform((value): z.infer<typeof ServerCapabilitiesSchema> | undefined => {
    if (value === undefined) {
      return undefined;
    }
    const parsed = ServerCapabilitiesSchema.safeParse(value);
    if (!parsed.success) {
      return undefined;
    }
    return parsed.data;
  });

const SourceCodeOfferSchema = z.object({
  license: z.literal("AGPL-3.0-or-later"),
  repositoryUrl: z.string().url(),
  noticePath: z.string().min(1),
  originalProjectUrl: z.string().url(),
  offerPath: z.string().min(1),
  correspondingSourceRequired: z.boolean(),
});

export const ServerInfoStatusPayloadSchema = z
  .object({
    status: z.literal("server_info"),
    serverId: z.string().trim().min(1),
    hostname: ServerInfoHostnameSchema.optional(),
    version: ServerInfoVersionSchema.optional(),
    sourceCode: SourceCodeOfferSchema.optional(),
    capabilities: ServerCapabilitiesFromUnknownSchema,
    // COMPAT(providersSnapshot): added in v0.1.48, remove gating when all clients use snapshot
    features: z
      .object({
        providersSnapshot: z.boolean().optional(),
        checkoutGithubSetAutoMerge: z.boolean().optional(),
        // COMPAT(daemonStatusRpc): added in v0.1.76, remove gate after 2026-11-18.
        daemonStatusRpc: z.boolean().optional(),
        // COMPAT(terminalRestoreModes): added in v0.1.81, remove gate after 2026-11-23.
        "terminal-restore-modes": z.boolean().optional(),
        // COMPAT(rewind): added in v0.1.X, drop the gate when floor >= v0.1.X.
        rewind: z.boolean().optional(),
        // COMPAT(checkoutRefresh): added in v0.1.86, remove gate after 2026-11-29.
        checkoutRefresh: z.boolean().optional(),
        // COMPAT(agentSkillManagement): added in v0.1.X, remove gate when all clients support it.
        agentSkillManagement: z.boolean().optional(),
        // COMPAT(agentMcpServerManagement): added in v0.1.X, remove gate when all clients support it.
        agentMcpServerManagement: z.boolean().optional(),
        // COMPAT(providerUsageList): added in v0.1.98, drop the gate when daemon floor >= v0.1.98.
        providerUsageList: z.boolean().optional(),
        // COMPAT(daemonDiagnostics): added in v0.1.100, remove gate after 2026-12-25 once daemon floor >= v0.1.100.
        daemonDiagnostics: z.boolean().optional(),
        // COMPAT(generativeUiWireCapability): added in v0.1.101; remove the gate no earlier than 2027-01-11 when client/daemon floor >= v0.1.101.
        generativeUi: z.boolean().optional(),
      })
      .optional(),
  })
  .passthrough()
  .transform((payload) => ({
    ...payload,
    hostname: payload.hostname ?? null,
    version: payload.version ?? null,
  }));

export const StatusMessageSchema = z.object({
  type: z.literal("status"),
  payload: z
    .object({
      status: z.string(),
    })
    .passthrough(), // Allow additional fields
});

export const PongMessageSchema = z.object({
  type: z.literal("pong"),
  payload: z.object({
    requestId: z.string(),
    clientSentAt: z.number().int().optional(),
    serverReceivedAt: z.number().int(),
    serverSentAt: z.number().int(),
  }),
});

export const RpcErrorMessageSchema = z.object({
  type: z.literal("rpc_error"),
  payload: z.object({
    requestId: z.string(),
    requestType: z.string().optional(),
    error: z.string(),
    code: z.string().optional(),
  }),
});

const AgentStatusWithRequestSchema = z.object({
  agentId: z.string(),
  requestId: z.string(),
});

const AgentStatusWithTimelineSchema = AgentStatusWithRequestSchema.extend({
  timelineSize: z.number().optional(),
});

export const AgentCreatedStatusPayloadSchema = z
  .object({
    status: z.literal("agent_created"),
    agent: AgentSnapshotPayloadSchema,
  })
  .extend(AgentStatusWithRequestSchema.shape);

export const AgentCreateFailedStatusPayloadSchema = z.object({
  status: z.literal("agent_create_failed"),
  requestId: z.string(),
  error: z.string(),
  errorCode: z.string().optional(),
});

export const AgentResumedStatusPayloadSchema = z
  .object({
    status: z.literal("agent_resumed"),
    agent: AgentSnapshotPayloadSchema,
  })
  .extend(AgentStatusWithTimelineSchema.shape);

export const AgentRefreshedStatusPayloadSchema = z
  .object({
    status: z.literal("agent_refreshed"),
  })
  .extend(AgentStatusWithTimelineSchema.shape);

export const KnownStatusPayloadSchema = z.discriminatedUnion("status", [
  AgentCreatedStatusPayloadSchema,
  AgentCreateFailedStatusPayloadSchema,
  AgentResumedStatusPayloadSchema,
  AgentRefreshedStatusPayloadSchema,
  ...DaemonStatusPayloadSchemas,
]);

export type KnownStatusPayload = z.infer<typeof KnownStatusPayloadSchema>;

export const ArtifactMessageSchema = z.object({
  type: z.literal("artifact"),
  payload: z.object({
    type: z.enum(["markdown", "diff", "image", "code"]),
    id: z.string(),
    title: z.string(),
    content: z.string(),
    isBase64: z.boolean(),
  }),
});

export const AgentUpdateMessageSchema = z.object({
  type: z.literal("agent_update"),
  payload: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("upsert"),
      agent: AgentSnapshotPayloadSchema,
      project: ProjectPlacementPayloadSchema.nullable().optional(),
    }),
    z.object({
      kind: z.literal("remove"),
      agentId: z.string(),
    }),
  ]),
});

export const AgentStreamMessageSchema = z.object({
  type: z.literal("agent_stream"),
  payload: z.object({
    agentId: z.string(),
    event: AgentStreamEventPayloadSchema,
    timestamp: z.string(),
    // Present for timeline events. Maps 1:1 to canonical in-memory timeline rows.
    seq: z.number().int().nonnegative().optional(),
    epoch: z.string().optional(),
  }),
});

export const AgentStatusMessageSchema = z.object({
  type: z.literal("agent_status"),
  payload: z.object({
    agentId: z.string(),
    status: z.string(),
    info: AgentSnapshotPayloadSchema,
  }),
});

export const AgentListMessageSchema = z.object({
  type: z.literal("agent_list"),
  payload: z.object({
    agents: z.array(AgentSnapshotPayloadSchema),
  }),
});

const AgentDirectoryResponseEntrySchema = z.object({
  agent: AgentSnapshotPayloadSchema,
  project: ProjectPlacementPayloadSchema,
});

const AgentDirectoryPageInfoSchema = z.object({
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
  hasMore: z.boolean(),
});

export const FetchAgentsResponseMessageSchema = z.object({
  type: z.literal("fetch_agents_response"),
  payload: z.object({
    requestId: z.string(),
    subscriptionId: z.string().nullable().optional(),
    entries: z.array(AgentDirectoryResponseEntrySchema),
    pageInfo: AgentDirectoryPageInfoSchema,
  }),
});

export const FetchAgentHistoryResponseMessageSchema = z.object({
  type: z.literal("fetch_agent_history_response"),
  payload: z.object({
    requestId: z.string(),
    entries: z.array(AgentDirectoryResponseEntrySchema),
    pageInfo: AgentDirectoryPageInfoSchema,
  }),
});

export const FetchAgentResponseMessageSchema = z.object({
  type: z.literal("fetch_agent_response"),
  payload: z.object({
    requestId: z.string(),
    agent: AgentSnapshotPayloadSchema.nullable(),
    project: ProjectPlacementPayloadSchema.nullable().optional(),
    error: z.string().nullable(),
  }),
});

const AgentTimelineSeqRangeSchema = z.object({
  startSeq: z.number().int().nonnegative(),
  endSeq: z.number().int().nonnegative(),
});

export const AgentTimelineEntryPayloadSchema = z.object({
  provider: AgentProviderSchema,
  item: AgentTimelineItemPayloadSchema,
  timestamp: z.string(),
  seqStart: z.number().int().nonnegative(),
  seqEnd: z.number().int().nonnegative(),
  sourceSeqRanges: z.array(AgentTimelineSeqRangeSchema),
  collapsed: z.array(z.enum(["assistant_merge", "reasoning_merge", "tool_lifecycle"])),
});

export const FetchAgentTimelineResponseMessageSchema = z.object({
  type: z.literal("fetch_agent_timeline_response"),
  payload: z.object({
    requestId: z.string(),
    agentId: z.string(),
    agent: AgentSnapshotPayloadSchema.nullable(),
    direction: z.enum(["tail", "before", "after"]),
    projection: z.enum(["projected", "canonical"]),
    epoch: z.string(),
    reset: z.boolean(),
    staleCursor: z.boolean(),
    gap: z.boolean(),
    window: z.object({
      minSeq: z.number().int().nonnegative(),
      maxSeq: z.number().int().nonnegative(),
      nextSeq: z.number().int().nonnegative(),
    }),
    startCursor: AgentTimelineCursorSchema.nullable(),
    endCursor: AgentTimelineCursorSchema.nullable(),
    hasOlder: z.boolean(),
    hasNewer: z.boolean(),
    entries: z.array(AgentTimelineEntryPayloadSchema),
    error: z.string().nullable(),
  }),
});

export const CancelAgentResponseMessageSchema = z.object({
  type: z.literal("cancel_agent_response"),
  payload: z.object({
    requestId: z.string(),
    agentId: z.string(),
    agent: AgentSnapshotPayloadSchema.nullable(),
  }),
});

export const ClearAgentAttentionResponseMessageSchema = z.object({
  type: z.literal("clear_agent_attention_response"),
  payload: z.object({
    requestId: z.string(),
    agentId: z.string().or(z.array(z.string())),
    agents: z.array(AgentSnapshotPayloadSchema),
  }),
});

export const SendAgentMessageResponseMessageSchema = z.object({
  type: z.literal("send_agent_message_response"),
  payload: z.object({
    requestId: z.string(),
    agentId: z.string(),
    accepted: z.boolean(),
    error: z.string().nullable(),
  }),
});

export const WaitForFinishResponseMessageSchema = z.object({
  type: z.literal("wait_for_finish_response"),
  payload: z.object({
    requestId: z.string(),
    status: z.enum(["idle", "error", "permission", "timeout"]),
    final: AgentSnapshotPayloadSchema.nullable(),
    error: z.string().nullable(),
    lastMessage: z.string().nullable(),
  }),
});

export const AgentPermissionRequestMessageSchema = z.object({
  type: z.literal("agent_permission_request"),
  payload: z.object({
    agentId: z.string(),
    request: AgentPermissionRequestPayloadSchema,
  }),
});

export const AgentPermissionResolvedMessageSchema = z.object({
  type: z.literal("agent_permission_resolved"),
  payload: z.object({
    agentId: z.string(),
    requestId: z.string(),
    resolution: AgentPermissionResponseSchema,
  }),
});

export const AgentDeletedMessageSchema = z.object({
  type: z.literal("agent_deleted"),
  payload: z.object({
    agentId: z.string(),
    requestId: z.string(),
  }),
});

export const AgentArchivedMessageSchema = z.object({
  type: z.literal("agent_archived"),
  payload: z.object({
    agentId: z.string(),
    archivedAt: z.string(),
    requestId: z.string(),
  }),
});

const CloseItemsAgentResultSchema = z.object({
  agentId: z.string(),
  archivedAt: z.string(),
});

const CloseItemsTerminalResultSchema = z.object({
  terminalId: z.string(),
  success: z.boolean(),
});

export const CloseItemsResponseSchema = z.object({
  type: z.literal("close_items_response"),
  payload: z.object({
    agents: z.array(CloseItemsAgentResultSchema),
    terminals: z.array(CloseItemsTerminalResultSchema),
    requestId: z.string(),
  }),
});

export const AgentPresetsListResponseMessageSchema = z.object({
  type: z.literal("agent.presets.list.response"),
  payload: AgentPresetsPayloadSchema.extend({
    requestId: z.string(),
  }),
});

const ModelGatewayMoaNodeTraceSchema = z.object({
  id: z.string().nullable(),
  model: z.string(),
  status: z.enum(["success", "error"]),
  output: z.string().nullable(),
  error: z.string().nullable(),
  durationMs: z.number(),
});

const ModelGatewayMoaLayerTraceSchema = z.object({
  id: z.string(),
  label: z.string().nullable(),
  nodes: z.array(ModelGatewayMoaNodeTraceSchema),
});

const ModelGatewayMoaAggregatorTraceSchema = z.object({
  model: z.string(),
  status: z.enum(["success", "error"]),
  output: z.string().nullable(),
  error: z.string().nullable(),
  durationMs: z.number(),
});

const ModelGatewayMoaTestResultSchema = z.object({
  finalText: z.string(),
  durationMs: z.number(),
  layers: z.array(ModelGatewayMoaLayerTraceSchema),
  aggregator: ModelGatewayMoaAggregatorTraceSchema,
});

export const ModelGatewayMoaTestResponseMessageSchema = z.object({
  type: z.literal("model_gateway.moa.test.response"),
  payload: z.object({
    requestId: z.string(),
    gatewayId: z.string(),
    result: ModelGatewayMoaTestResultSchema.nullable(),
    error: z.string().nullable(),
  }),
});

const AgentSlashCommandSchema = z.object({
  name: z.string(),
  description: z.string(),
  argumentHint: z.string(),
});

export const ListCommandsResponseSchema = z.object({
  type: z.literal("list_commands_response"),
  payload: z.object({
    agentId: z.string(),
    commands: z.array(AgentSlashCommandSchema),
    error: z.string().nullable(),
    requestId: z.string(),
  }),
});

type SessionOutboundMessageSchemaOptions = [
  typeof ActivityLogMessageSchema,
  typeof AssistantChunkMessageSchema,
  ...typeof VoiceOutboundMessageSchemas,
  typeof StatusMessageSchema,
  typeof PongMessageSchema,
  typeof RpcErrorMessageSchema,
  typeof ArtifactMessageSchema,
  typeof AgentUpdateMessageSchema,
  ...typeof WorkspaceOutboundMessageSchemas,
  ...typeof ProviderOutboundMessageSchemas,
  typeof AgentStreamMessageSchema,
  typeof AgentStatusMessageSchema,
  typeof FetchAgentsResponseMessageSchema,
  typeof FetchAgentHistoryResponseMessageSchema,
  ...typeof UsageOutboundMessageSchemas,
  typeof FetchAgentResponseMessageSchema,
  typeof FetchAgentTimelineResponseMessageSchema,
  typeof CancelAgentResponseMessageSchema,
  typeof ClearAgentAttentionResponseMessageSchema,
  typeof SendAgentMessageResponseMessageSchema,
  ...typeof DaemonOutboundMessageSchemas,
  typeof SetAgentModeResponseMessageSchema,
  typeof SetAgentModelResponseMessageSchema,
  typeof SetAgentThinkingResponseMessageSchema,
  typeof SetAgentFeatureResponseMessageSchema,
  typeof AgentRewindResponseMessageSchema,
  typeof UpdateAgentResponseMessageSchema,
  typeof ProjectRenameResponseSchema,
  typeof WaitForFinishResponseMessageSchema,
  typeof AgentPermissionRequestMessageSchema,
  typeof AgentPermissionResolvedMessageSchema,
  typeof AgentDeletedMessageSchema,
  typeof AgentArchivedMessageSchema,
  typeof CloseItemsResponseSchema,
  ...typeof CheckoutOutboundMessageSchemas,
  typeof AgentPresetsListResponseMessageSchema,
  typeof ModelGatewayMoaTestResponseMessageSchema,
  typeof ListCommandsResponseSchema,
  ...typeof AgentExtensionOutboundMessageSchemas,
  ...typeof TerminalOutboundMessageSchemas,
  typeof ChatCreateResponseSchema,
  typeof ChatListResponseSchema,
  typeof ChatInspectResponseSchema,
  typeof ChatDeleteResponseSchema,
  typeof ChatPostResponseSchema,
  typeof ChatReadResponseSchema,
  typeof ChatWaitResponseSchema,
  typeof ScheduleCreateResponseSchema,
  typeof ScheduleListResponseSchema,
  typeof ScheduleInspectResponseSchema,
  typeof ScheduleLogsResponseSchema,
  typeof SchedulePauseResponseSchema,
  typeof ScheduleResumeResponseSchema,
  typeof ScheduleDeleteResponseSchema,
  typeof ScheduleRunOnceResponseSchema,
  typeof ScheduleUpdateResponseSchema,
  typeof LoopRunResponseSchema,
  typeof LoopListResponseSchema,
  typeof LoopInspectResponseSchema,
  typeof LoopLogsResponseSchema,
  typeof LoopStopResponseSchema,
  typeof GenerativeUiActionResponseSchema,
];

export const SessionOutboundMessageSchema: z.ZodDiscriminatedUnion<
  "type",
  SessionOutboundMessageSchemaOptions
> = z.discriminatedUnion("type", [
  ActivityLogMessageSchema,
  AssistantChunkMessageSchema,
  ...VoiceOutboundMessageSchemas,
  StatusMessageSchema,
  PongMessageSchema,
  RpcErrorMessageSchema,
  ArtifactMessageSchema,
  AgentUpdateMessageSchema,
  ...WorkspaceOutboundMessageSchemas,
  ...ProviderOutboundMessageSchemas,
  AgentStreamMessageSchema,
  AgentStatusMessageSchema,
  FetchAgentsResponseMessageSchema,
  FetchAgentHistoryResponseMessageSchema,
  ...UsageOutboundMessageSchemas,
  FetchAgentResponseMessageSchema,
  FetchAgentTimelineResponseMessageSchema,
  CancelAgentResponseMessageSchema,
  ClearAgentAttentionResponseMessageSchema,
  SendAgentMessageResponseMessageSchema,
  ...DaemonOutboundMessageSchemas,
  SetAgentModeResponseMessageSchema,
  SetAgentModelResponseMessageSchema,
  SetAgentThinkingResponseMessageSchema,
  SetAgentFeatureResponseMessageSchema,
  AgentRewindResponseMessageSchema,
  UpdateAgentResponseMessageSchema,
  ProjectRenameResponseSchema,
  WaitForFinishResponseMessageSchema,
  AgentPermissionRequestMessageSchema,
  AgentPermissionResolvedMessageSchema,
  AgentDeletedMessageSchema,
  AgentArchivedMessageSchema,
  CloseItemsResponseSchema,
  ...CheckoutOutboundMessageSchemas,
  AgentPresetsListResponseMessageSchema,
  ModelGatewayMoaTestResponseMessageSchema,
  ListCommandsResponseSchema,
  ...AgentExtensionOutboundMessageSchemas,
  ...TerminalOutboundMessageSchemas,
  ChatCreateResponseSchema,
  ChatListResponseSchema,
  ChatInspectResponseSchema,
  ChatDeleteResponseSchema,
  ChatPostResponseSchema,
  ChatReadResponseSchema,
  ChatWaitResponseSchema,
  ScheduleCreateResponseSchema,
  ScheduleListResponseSchema,
  ScheduleInspectResponseSchema,
  ScheduleLogsResponseSchema,
  SchedulePauseResponseSchema,
  ScheduleResumeResponseSchema,
  ScheduleDeleteResponseSchema,
  ScheduleRunOnceResponseSchema,
  ScheduleUpdateResponseSchema,
  LoopRunResponseSchema,
  LoopListResponseSchema,
  LoopInspectResponseSchema,
  LoopLogsResponseSchema,
  LoopStopResponseSchema,
  GenerativeUiActionResponseSchema,
]);

export type SessionOutboundMessage = z.infer<typeof SessionOutboundMessageSchema>;

// Type exports for individual message types
export type ActivityLogMessage = z.infer<typeof ActivityLogMessageSchema>;
export type AssistantChunkMessage = z.infer<typeof AssistantChunkMessageSchema>;
export type StatusMessage = z.infer<typeof StatusMessageSchema>;
export type ServerCapabilities = z.infer<typeof ServerCapabilitiesSchema>;
export type ServerInfoStatusPayload = z.infer<typeof ServerInfoStatusPayloadSchema>;
export type RpcErrorMessage = z.infer<typeof RpcErrorMessageSchema>;
export type ArtifactMessage = z.infer<typeof ArtifactMessageSchema>;
export type AgentUpdateMessage = z.infer<typeof AgentUpdateMessageSchema>;
export type AgentStreamMessage = z.infer<typeof AgentStreamMessageSchema>;
export type AgentStatusMessage = z.infer<typeof AgentStatusMessageSchema>;
export type FetchAgentsResponseMessage = z.infer<typeof FetchAgentsResponseMessageSchema>;
export type FetchAgentHistoryResponseMessage = z.infer<
  typeof FetchAgentHistoryResponseMessageSchema
>;
export type FetchAgentResponseMessage = z.infer<typeof FetchAgentResponseMessageSchema>;
export type FetchAgentTimelineResponseMessage = z.infer<
  typeof FetchAgentTimelineResponseMessageSchema
>;
export type CancelAgentResponseMessage = z.infer<typeof CancelAgentResponseMessageSchema>;
export type SendAgentMessageResponseMessage = z.infer<typeof SendAgentMessageResponseMessageSchema>;
export type SetAgentModeResponseMessage = z.infer<typeof SetAgentModeResponseMessageSchema>;
export type SetAgentModelResponseMessage = z.infer<typeof SetAgentModelResponseMessageSchema>;
export type SetAgentThinkingResponseMessage = z.infer<typeof SetAgentThinkingResponseMessageSchema>;
export type SetAgentFeatureResponseMessage = z.infer<typeof SetAgentFeatureResponseMessageSchema>;
export type AgentRewindResponseMessage = z.infer<typeof AgentRewindResponseMessageSchema>;
export type UpdateAgentResponseMessage = z.infer<typeof UpdateAgentResponseMessageSchema>;
export type ProjectRenameResponse = z.infer<typeof ProjectRenameResponseSchema>;
export type ProjectRenameResponsePayload = z.infer<typeof ProjectRenameResponsePayloadSchema>;
export type WaitForFinishResponseMessage = z.infer<typeof WaitForFinishResponseMessageSchema>;
export type AgentPermissionRequestMessage = z.infer<typeof AgentPermissionRequestMessageSchema>;
export type AgentPermissionResolvedMessage = z.infer<typeof AgentPermissionResolvedMessageSchema>;
export type AgentDeletedMessage = z.infer<typeof AgentDeletedMessageSchema>;
export type AgentPresetsListResponseMessage = z.infer<typeof AgentPresetsListResponseMessageSchema>;
export type ModelGatewayMoaTestResponseMessage = z.infer<
  typeof ModelGatewayMoaTestResponseMessageSchema
>;
export type ChatCreateResponse = z.infer<typeof ChatCreateResponseSchema>;
export type ChatListResponse = z.infer<typeof ChatListResponseSchema>;
export type ChatInspectResponse = z.infer<typeof ChatInspectResponseSchema>;
export type ChatDeleteResponse = z.infer<typeof ChatDeleteResponseSchema>;
export type ChatPostResponse = z.infer<typeof ChatPostResponseSchema>;
export type ChatReadResponse = z.infer<typeof ChatReadResponseSchema>;
export type ChatWaitResponse = z.infer<typeof ChatWaitResponseSchema>;
export type ScheduleCreateResponse = z.infer<typeof ScheduleCreateResponseSchema>;
export type ScheduleListResponse = z.infer<typeof ScheduleListResponseSchema>;
export type ScheduleInspectResponse = z.infer<typeof ScheduleInspectResponseSchema>;
export type ScheduleLogsResponse = z.infer<typeof ScheduleLogsResponseSchema>;
export type SchedulePauseResponse = z.infer<typeof SchedulePauseResponseSchema>;
export type ScheduleResumeResponse = z.infer<typeof ScheduleResumeResponseSchema>;
export type ScheduleDeleteResponse = z.infer<typeof ScheduleDeleteResponseSchema>;
export type ScheduleRunOnceResponse = z.infer<typeof ScheduleRunOnceResponseSchema>;
export type ScheduleUpdateResponse = z.infer<typeof ScheduleUpdateResponseSchema>;
export type LoopRunResponse = z.infer<typeof LoopRunResponseSchema>;
export type LoopListResponse = z.infer<typeof LoopListResponseSchema>;
export type LoopInspectResponse = z.infer<typeof LoopInspectResponseSchema>;
export type LoopLogsResponse = z.infer<typeof LoopLogsResponseSchema>;
export type LoopStopResponse = z.infer<typeof LoopStopResponseSchema>;

// Type exports for payload types
export type ActivityLogPayload = z.infer<typeof ActivityLogPayloadSchema>;

// Type exports for inbound message types
export type FetchAgentsRequestMessage = z.infer<typeof FetchAgentsRequestMessageSchema>;
export type FetchAgentHistoryRequestMessage = z.infer<typeof FetchAgentHistoryRequestMessageSchema>;
export type FetchAgentRequestMessage = z.infer<typeof FetchAgentRequestMessageSchema>;
export type SendAgentMessageRequest = z.infer<typeof SendAgentMessageRequestSchema>;
export type WaitForFinishRequest = z.infer<typeof WaitForFinishRequestSchema>;
export type CreateAgentRequestMessage = z.infer<typeof CreateAgentRequestMessageSchema>;
export type AgentPresetsListRequestMessage = z.infer<typeof AgentPresetsListRequestMessageSchema>;
export type ModelGatewayMoaTestRequestMessage = z.infer<
  typeof ModelGatewayMoaTestRequestMessageSchema
>;
export type ChatCreateRequest = z.infer<typeof ChatCreateRequestSchema>;
export type ChatListRequest = z.infer<typeof ChatListRequestSchema>;
export type ChatInspectRequest = z.infer<typeof ChatInspectRequestSchema>;
export type ChatDeleteRequest = z.infer<typeof ChatDeleteRequestSchema>;
export type ChatPostRequest = z.infer<typeof ChatPostRequestSchema>;
export type ChatReadRequest = z.infer<typeof ChatReadRequestSchema>;
export type ChatWaitRequest = z.infer<typeof ChatWaitRequestSchema>;
export type ScheduleCreateRequest = z.infer<typeof ScheduleCreateRequestSchema>;
export type ScheduleListRequest = z.infer<typeof ScheduleListRequestSchema>;
export type ScheduleInspectRequest = z.infer<typeof ScheduleInspectRequestSchema>;
export type ScheduleLogsRequest = z.infer<typeof ScheduleLogsRequestSchema>;
export type SchedulePauseRequest = z.infer<typeof SchedulePauseRequestSchema>;
export type ScheduleResumeRequest = z.infer<typeof ScheduleResumeRequestSchema>;
export type ScheduleDeleteRequest = z.infer<typeof ScheduleDeleteRequestSchema>;
export type ScheduleRunOnceRequest = z.infer<typeof ScheduleRunOnceRequestSchema>;
export type ScheduleUpdateRequest = z.infer<typeof ScheduleUpdateRequestSchema>;
export type LoopRunRequest = z.infer<typeof LoopRunRequestSchema>;
export type LoopListRequest = z.infer<typeof LoopListRequestSchema>;
export type LoopInspectRequest = z.infer<typeof LoopInspectRequestSchema>;
export type LoopLogsRequest = z.infer<typeof LoopLogsRequestSchema>;
export type LoopStopRequest = z.infer<typeof LoopStopRequestSchema>;
export type ResumeAgentRequestMessage = z.infer<typeof ResumeAgentRequestMessageSchema>;
export type DeleteAgentRequestMessage = z.infer<typeof DeleteAgentRequestMessageSchema>;
export type UpdateAgentRequestMessage = z.infer<typeof UpdateAgentRequestMessageSchema>;
export type ProjectRenameRequest = z.infer<typeof ProjectRenameRequestSchema>;
export type SetAgentModeRequestMessage = z.infer<typeof SetAgentModeRequestMessageSchema>;
export type SetAgentModelRequestMessage = z.infer<typeof SetAgentModelRequestMessageSchema>;
export type SetAgentThinkingRequestMessage = z.infer<typeof SetAgentThinkingRequestMessageSchema>;
export type SetAgentFeatureRequestMessage = z.infer<typeof SetAgentFeatureRequestMessageSchema>;
export type AgentPermissionResponseMessage = z.infer<typeof AgentPermissionResponseMessageSchema>;
export type ClearAgentAttentionMessage = z.infer<typeof ClearAgentAttentionMessageSchema>;
export type ClearAgentAttentionResponseMessage = z.infer<
  typeof ClearAgentAttentionResponseMessageSchema
>;
export type ClientHeartbeatMessage = z.infer<typeof ClientHeartbeatMessageSchema>;
export type ListCommandsRequest = z.infer<typeof ListCommandsRequestSchema>;
export type ListCommandsResponse = z.infer<typeof ListCommandsResponseSchema>;
export type RegisterPushTokenMessage = z.infer<typeof RegisterPushTokenMessageSchema>;

// Cross-domain terminal-related message types retained in this module.
export type CloseItemsRequest = z.infer<typeof CloseItemsRequestMessageSchema>;
export type CloseItemsResponse = z.infer<typeof CloseItemsResponseSchema>;

// ============================================================================
// WebSocket Level Messages (wraps session messages)
// ============================================================================

// WebSocket-only messages (not session messages)
export const WSPingMessageSchema = z.object({
  type: z.literal("ping"),
});

export const WSPongMessageSchema = z.object({
  type: z.literal("pong"),
});

export const WSHelloMessageSchema = z.object({
  type: z.literal("hello"),
  clientId: z.string().min(1),
  clientType: z.enum(["mobile", "browser", "cli", "mcp"]),
  protocolVersion: z.number().int(),
  appVersion: z.string().optional(),
  capabilities: z
    .object({
      voice: z.boolean().optional(),
      pushNotifications: z.boolean().optional(),
      [CLIENT_CAPS.reasoningMergeEnum]: z.boolean().optional(),
      [CLIENT_CAPS.customModeIcons]: z.boolean().optional(),
      [CLIENT_CAPS.generativeUi]: z.boolean().optional(),
    })
    .passthrough()
    .optional(),
});

export const WSRecordingStateMessageSchema = z.object({
  type: z.literal("recording_state"),
  isRecording: z.boolean(),
});

// Wrapped session message
export const WSSessionInboundSchema: z.ZodObject<{
  type: z.ZodLiteral<"session">;
  message: typeof SessionInboundMessageSchema;
}> = z.object({
  type: z.literal("session"),
  message: SessionInboundMessageSchema,
});

export const WSSessionOutboundSchema: z.ZodObject<{
  type: z.ZodLiteral<"session">;
  message: typeof SessionOutboundMessageSchema;
}> = z.object({
  type: z.literal("session"),
  message: SessionOutboundMessageSchema,
});

// Complete WebSocket message schemas
export const WSInboundMessageSchema = z.discriminatedUnion("type", [
  WSPingMessageSchema,
  WSHelloMessageSchema,
  WSRecordingStateMessageSchema,
  WSSessionInboundSchema,
]);

export const WSOutboundMessageSchema = z.discriminatedUnion("type", [
  WSPongMessageSchema,
  WSSessionOutboundSchema,
]);

export type WSInboundMessage = z.infer<typeof WSInboundMessageSchema>;
export type WSOutboundMessage = z.infer<typeof WSOutboundMessageSchema>;
export type WSHelloMessage = z.infer<typeof WSHelloMessageSchema>;

// ============================================================================
// Helper functions for message conversion
// ============================================================================

/**
 * Extract session message from WebSocket message
 * Returns null if message should be handled at WS level only
 */
export function extractSessionMessage(wsMsg: WSInboundMessage): SessionInboundMessage | null {
  if (wsMsg.type === "session") {
    return wsMsg.message;
  }
  // Ping and recording_state are WS-level only
  return null;
}

/**
 * Wrap session message in WebSocket envelope
 */
export function wrapSessionMessage(sessionMsg: SessionOutboundMessage): WSOutboundMessage {
  return {
    type: "session",
    message: sessionMsg,
  };
}

export function parseServerInfoStatusPayload(payload: unknown): ServerInfoStatusPayload | null {
  const parsed = ServerInfoStatusPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return null;
  }
  return parsed.data;
}
