/**
 * AgentLifecycleHandler — extracted from Session.
 *
 * Handles all agent-related RPC operations: create, delete, archive, cancel,
 * resume, import, rewind, fetch (list/detail/timeline/history), agent updates
 * subscription, permission responses, and usage statistics.
 *
 * This is the largest Session handler, owning nearly all agent lifecycle
 * state transitions and read/write dispatch paths.
 */

import { v4 as uuidv4 } from "uuid";
import { CLIENT_CAPS } from "@chisacode/protocol/client-capabilities";
import {
  type AgentSnapshotPayload,
  type CloseItemsRequest,
  type ProjectPlacementPayload,
  type SessionInboundMessage,
} from "../messages.js";
import {
  archiveAgentCommand,
  cancelAgentRunCommand,
  closeAgentCommand,
  setAgentModeCommand,
  updateAgentCommand,
} from "../agent/lifecycle-command.js";
import {
  buildStoredAgentPayload,
  resolveEffectiveThinkingOptionId,
  resolveStoredAgentPayloadUpdatedAt,
  toAgentPayload,
} from "../agent/agent-projections.js";
import {
  projectTimelineRows,
  selectTimelineWindowByProjectedLimit,
  type TimelineProjectionMode,
} from "../agent/timeline-projection.js";
import { respondToAgentPermission } from "../agent/permission-response.js";
import {
  listImportableProviderSessions,
  ImportSessionsRequestError,
} from "../agent/import-sessions.js";
import { importProviderSession, normalizeImportAgentRequest } from "../agent/import-sessions.js";
import {
  sendPromptToAgent,
  unarchiveAgentState,
  waitForAgentRunStartWithTimeout,
} from "../agent/agent-prompt.js";
import { ensureAgentLoaded } from "../agent/agent-loading.js";
import {
  buildConfigOverrides,
  extractTimestamps,
  isStoredAgentProviderAvailable,
  toAgentPersistenceHandle,
} from "../persistence-hooks.js";
import {
  normalizeWorkspaceId as normalizePersistedWorkspaceId,
  deriveProjectGroupingName,
} from "../workspace-registry-model.js";
import {
  FETCH_AGENTS_SORT_KEYS,
  LEGACY_PROVIDER_IDS,
  beginAgentDeleteIfSupported,
  clientSupportsAllProviders,
  errorToFriendlyMessage,
  resolveSubscriptionId,
  resolveWaitForFinishError,
  buildWorkspaceCheckout,
} from "../session-helpers.js";
import { getErrorMessage, getErrorMessageOr } from "@chisacode/protocol/error-utils";
import { CursorError } from "../pagination/cursor.js";
import { SortablePager, type SortSpec } from "../pagination/sortable-pager.js";
import type {
  AgentTimelineCursor,
  AgentTimelineFetchDirection,
  ManagedAgent,
} from "../agent/agent-manager.js";
import type {
  AgentPersistenceHandle,
  AgentPermissionResponse,
  AgentSessionConfig,
} from "../agent/agent-sdk-types.js";
import type { StoredAgentRecord } from "../agent/agent-storage.js";
import type { AgentLifecycleHandlerContext, DisposableHandler } from "./session-context.js";
import { resolveProjectDisplayName } from "../workspace-registry.js";
import type { PersistedProjectRecord } from "../workspace-registry.js";
import type { StructuredGenerationDaemonConfig } from "../agent/structured-generation-providers.js";
import { buildAgentPrompt, createAgentCommand } from "../agent/create-agent/create.js";
import type {
  CreateAgentWorkspace,
  CreateAgentSessionWorktreeResult,
} from "../agent/create-agent/create.js";
import { resolveCreateAgentTitles } from "../agent/create-agent-title.js";
import { toWorktreeWireError } from "../worktree-errors.js";
import type { FirstAgentContext } from "../messages.js";
import type { CreateChisaCodeWorktreeWorkflowResult } from "../worktree-session.js";
import { buildUsageSummary, exportUsageEvents, pruneUsageEvents } from "../usage/usage-store.js";

// --- Local types mirroring session.ts private types ---

type FetchAgentsRequestMessage = Extract<SessionInboundMessage, { type: "fetch_agents_request" }>;
type FetchAgentHistoryRequestMessage = Extract<
  SessionInboundMessage,
  { type: "fetch_agent_history_request" }
>;
type AgentDirectoryRequestMessage = FetchAgentsRequestMessage | FetchAgentHistoryRequestMessage;
type FetchAgentsRequestFilter = NonNullable<FetchAgentsRequestMessage["filter"]>;
type FetchAgentsRequestSort = NonNullable<FetchAgentsRequestMessage["sort"]>[number];
type FetchAgentsResponsePayload = Extract<
  import("../messages.js").SessionOutboundMessage,
  { type: "fetch_agents_response" }
>["payload"];
type FetchAgentsResponseEntry = FetchAgentsResponsePayload["entries"][number];
type FetchAgentsResponsePageInfo = FetchAgentsResponsePayload["pageInfo"];
type AgentUpdatePayload = Extract<
  import("../messages.js").SessionOutboundMessage,
  { type: "agent_update" }
>["payload"];
type AgentUpdatesFilter = FetchAgentsRequestFilter;
interface AgentUpdatesSubscriptionState {
  subscriptionId: string;
  filter?: AgentUpdatesFilter;
  isBootstrapping: boolean;
  pendingUpdatesByAgentId: Map<string, AgentUpdatePayload>;
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

export class AgentLifecycleHandler implements DisposableHandler {
  private readonly context: AgentLifecycleHandlerContext;

  private get agentUpdatesSubscription(): AgentUpdatesSubscriptionState | null {
    return this.context.getAgentUpdatesSubscription() as AgentUpdatesSubscriptionState | null;
  }

  private set agentUpdatesSubscription(value: AgentUpdatesSubscriptionState | null) {
    this.context.setAgentUpdatesSubscription(value);
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
          return (() => {
            const { getAgentStatusPriority } = require("@chisacode/protocol/agent-state-bucket");
            return getAgentStatusPriority({
              status: agent.status,
              pendingPermissionCount: agent.pendingPermissions?.length ?? 0,
              requiresAttention: agent.requiresAttention,
              attentionReason: agent.attentionReason ?? null,
            });
          })();
        case "created_at":
          return Date.parse(agent.createdAt);
        case "updated_at":
          return Date.parse(agent.updatedAt);
        case "title":
          return agent.title?.toLocaleLowerCase() ?? "";
      }
    },
  });

  constructor(context: AgentLifecycleHandlerContext) {
    this.context = context;
  }

  dispose(): void {
    this.agentUpdatesSubscription = null;
  }

  /** Dispatch an inbound message to the appropriate handler. Returns undefined for unhandled messages. */
  dispatch(msg: SessionInboundMessage): Promise<void> | undefined {
    return this.dispatchReadOps(msg) ?? this.dispatchWriteOps(msg) ?? undefined;
  }

  private dispatchReadOps(msg: SessionInboundMessage): Promise<void> | undefined {
    switch (msg.type) {
      case "fetch_agents_request":
        return this.handleFetchAgents(msg);
      case "fetch_agent_request":
        return this.handleFetchAgent(msg.agentId, msg.requestId);
      case "fetch_agent_history_request":
        return this.handleFetchAgentHistory(msg);
      case "fetch_recent_provider_sessions_request":
        return this.handleFetchRecentProviderSessions(msg);
      case "fetch_agent_timeline_request":
        return this.handleFetchAgentTimelineRequest(msg);
      case "wait_for_finish_request":
        return this.handleWaitForFinish(msg.agentId, msg.requestId, msg.timeoutMs);
      case "agent_permission_response":
        return this.handleAgentPermissionResponse(msg.agentId, msg.requestId, msg.response);
      case "clear_agent_attention":
        return this.handleClearAgentAttention(msg.agentId, msg.requestId);
      case "update_agent_request":
        return this.handleUpdateAgentRequest(msg.agentId, msg.name, msg.labels, msg.requestId);
      case "send_agent_message_request":
        return this.handleSendAgentMessageRequest(msg);
      default:
        return undefined;
    }
  }

  private dispatchWriteOps(msg: SessionInboundMessage): Promise<void> | undefined {
    switch (msg.type) {
      case "create_agent_request":
        return this.handleCreateAgentRequest(msg);
      case "delete_agent_request":
        return this.handleDeleteAgentRequest(msg.agentId, msg.requestId);
      case "archive_agent_request":
        return this.handleArchiveAgentRequest(msg.agentId, msg.requestId);
      case "close_items_request":
        return this.handleCloseItemsRequest(msg);
      case "cancel_agent_request":
        return this.handleCancelAgentRequest(msg.agentId, msg.requestId);
      case "resume_agent_request":
        return this.handleResumeAgentRequest(msg);
      case "import_agent_request":
        return this.handleImportAgentRequest(msg);
      case "refresh_agent_request":
        return this.handleRefreshAgentRequest(msg);
      case "agent.rewind.request":
        return this.handleAgentRewindRequest(msg);
      case "usage.summary.get.request":
        return this.handleUsageSummaryGet(msg);
      case "usage.export.request":
        return this.handleUsageExport(msg);
      case "usage.clear.request":
        return this.handleUsageClear(msg);
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
      default:
        return undefined;
    }
  }

  // --- Sub-step 2: Handler methods ---

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

      this.context.emit({
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
      this.context.sessionLogger.error({ err: error }, "Failed to handle fetch_agents_request");
      this.context.emit({
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
      this.context.emit({
        type: "fetch_agent_history_response",
        payload: {
          requestId: request.requestId,
          ...payload,
        },
      });
    } catch (error) {
      const code = error instanceof SessionRequestError ? error.code : "fetch_agent_history_failed";
      const message = error instanceof Error ? error.message : "Failed to fetch agent history";
      this.context.sessionLogger.error(
        { err: error },
        "Failed to handle fetch_agent_history_request",
      );
      this.context.emit({
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
        agentManager: this.context.agentManager,
        agentStorage: this.context.agentStorage,
        providerSnapshotManager: this.context.providerSnapshotManager,
      });
      this.context.emit({
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
      this.context.sessionLogger.error(
        { err: error },
        "Failed to handle fetch_recent_provider_sessions_request",
      );
      this.context.emit({
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

  private async handleFetchAgent(agentIdOrIdentifier: string, requestId: string): Promise<void> {
    const resolved = await this.context.resolveAgentIdentifier(agentIdOrIdentifier);
    if (!resolved.ok) {
      this.context.emit({
        type: "fetch_agent_response",
        payload: { requestId, agent: null, project: null, error: resolved.error },
      });
      return;
    }

    const agent = await this.getAgentPayloadById(resolved.agentId);
    if (!agent) {
      this.context.emit({
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

    const project = (await this.context.buildProjectPlacementForCwd(
      agent.cwd,
    )) as ProjectPlacementPayload | null;
    this.context.emit({
      type: "fetch_agent_response",
      payload: { requestId, agent, project, error: null },
    });
  }

  private loadProjectedTimelineWindow(params: {
    agentId: string;
    direction: AgentTimelineFetchDirection;
    cursor: AgentTimelineCursor | undefined;
    requestedLimit: number;
    timeline: ReturnType<
      typeof import("../agent/agent-manager.js").AgentManager.prototype.fetchTimeline
    >;
  }): {
    timeline: ReturnType<
      typeof import("../agent/agent-manager.js").AgentManager.prototype.fetchTimeline
    >;
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
      timeline = this.context.agentManager.fetchTimeline(agentId, {
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
        agentManager: this.context.agentManager,
        agentStorage: this.context.agentStorage,
        logger: this.context.sessionLogger,
      });
      const agentPayload = await this.buildAgentPayload(snapshot);

      let timeline = this.context.agentManager.fetchTimeline(msg.agentId, {
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

      this.context.emit({
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
            collapsed: this.context.supports(CLIENT_CAPS.reasoningMergeEnum)
              ? entry.collapsed
              : entry.collapsed.filter((value) => value !== "reasoning_merge"),
          })),
          error: null,
        },
      });
    } catch (error) {
      this.context.sessionLogger.error(
        { err: error, agentId: msg.agentId },
        "Failed to handle fetch_agent_timeline_request",
      );
      this.context.emit({
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
    const resolved = await this.context.resolveAgentIdentifier(msg.agentId);
    if (!resolved.ok) {
      this.context.emit({
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

    const agentId = resolved.agentId;
    try {
      const prompt = buildAgentPrompt(msg.text, msg.images, msg.attachments);
      this.context.sessionLogger.trace(
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
          agentManager: this.context.agentManager,
          agentStorage: this.context.agentStorage,
          agentId,
          prompt,
          messageId: msg.messageId,
          logger: this.context.sessionLogger,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.handleAgentRunError(agentId, error, "Failed to send agent message");
        this.context.emit({
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
        this.context.emit({
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
        await waitForAgentRunStartWithTimeout(this.context.agentManager, agentId);
      } catch (error) {
        this.context.emit({
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

      this.context.emit({
        type: "send_agent_message_response",
        payload: {
          requestId: msg.requestId,
          agentId,
          accepted: true,
          error: null,
        },
      });
    } catch (error) {
      this.context.emit({
        type: "send_agent_message_response",
        payload: {
          requestId: msg.requestId,
          agentId,
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
    const resolved = await this.context.resolveAgentIdentifier(agentIdOrIdentifier);
    if (!resolved.ok) {
      this.context.emit({
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
    const live = this.context.agentManager.getAgent(agentId);
    if (!live) {
      const record = await this.context.agentStorage.get(agentId);
      if (!record || record.internal) {
        this.context.emit({
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
      this.context.emit({
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
      let result = await this.context.agentManager.waitForAgentEvent(agentId, {
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

      this.context.emit({
        type: "wait_for_finish_response",
        payload: { requestId, status, final, error, lastMessage: result.lastMessage },
      });
    } catch (error) {
      const isAbort =
        error instanceof Error &&
        (error.name === "AbortError" || error.message.toLowerCase().includes("aborted"));
      if (!isAbort) {
        const message = errorToFriendlyMessage(error);
        this.context.sessionLogger.error({ err: error, agentId }, "wait_for_finish_request failed");
        const final = await this.getAgentPayloadById(agentId);
        this.context.emit({
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
      this.context.emit({
        type: "wait_for_finish_response",
        payload: { requestId, status: "timeout", final, error: null, lastMessage: null },
      });
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  private async handleUpdateAgentRequest(
    agentId: string,
    name: string | undefined,
    labels: Record<string, string> | undefined,
    requestId: string,
  ): Promise<void> {
    this.context.sessionLogger.info(
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
        { agentManager: this.context.agentManager },
        { agentId, name, labels },
      );

      if (!result.accepted) {
        this.context.emit({
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

      this.context.emit({
        type: "update_agent_response",
        payload: { requestId, agentId, accepted: true, error: null },
      });
    } catch (error) {
      this.context.sessionLogger.error(
        { err: error, agentId, requestId },
        "session: update_agent_request error",
      );
      this.context.emit({
        type: "activity_log",
        payload: {
          id: uuidv4(),
          timestamp: new Date(),
          type: "error",
          content: `Failed to update agent: ${getErrorMessage(error)}`,
        },
      });
      this.context.emit({
        type: "update_agent_response",
        payload: {
          requestId,
          agentId,
          accepted: false,
          error: getErrorMessage(error) || "Failed to update agent",
        },
      });
    }
  }

  private async handleClearAgentAttention(
    agentId: string | string[],
    requestId?: string,
  ): Promise<void> {
    const agentIds = Array.isArray(agentId) ? agentId : [agentId];

    try {
      await Promise.all(agentIds.map((id) => this.context.agentManager.clearAgentAttention(id)));
      if (requestId) {
        const agents = (
          await Promise.all(
            agentIds.map(async (id) => {
              const agent = this.context.agentManager.getAgent(id);
              return agent ? this.buildAgentPayload(agent) : null;
            }),
          )
        ).filter((payload): payload is NonNullable<typeof payload> => payload !== null);
        this.context.emit({
          type: "clear_agent_attention_response",
          payload: {
            requestId,
            agentId,
            agents,
          },
        });
      }
    } catch (error) {
      this.context.sessionLogger.error({ err: error, agentIds }, "Failed to clear agent attention");
      // Don't throw - this is not critical
    }
  }

  private async handleAgentPermissionResponse(
    agentId: string,
    requestId: string,
    response: AgentPermissionResponse,
  ): Promise<void> {
    try {
      await respondToAgentPermission({
        agentManager: this.context.agentManager,
        agentId,
        requestId,
        response,
        logger: this.context.sessionLogger,
      });
    } catch (error) {
      this.context.sessionLogger.error(
        { err: error, agentId, requestId },
        "Failed to respond to permission",
      );
      this.context.emit({
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

  /** Log and emit an error notification for an agent run failure. Called by Session on agent run errors. */
  handleAgentRunError(agentId: string, error: unknown, context: string): void {
    const message = errorToFriendlyMessage(error);
    this.context.sessionLogger.error(
      { err: error, agentId, context },
      `${context} for agent ${agentId}`,
    );
    this.context.emit({
      type: "activity_log",
      payload: {
        id: uuidv4(),
        timestamp: new Date(),
        type: "error",
        content: `${context}: ${message}`,
      },
    });
  }

  // --- State machine helpers ---

  private getAgentUpdateTargetId(update: AgentUpdatePayload): string {
    return update.kind === "remove" ? update.agentId : update.agent.id;
  }

  /** Emit an agent update to active subscription (or buffer during bootstrapping). */
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

    this.context.emit({
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

      this.context.emit({
        type: "agent_update",
        payload,
      });
    }
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

  // --- Payload helpers ---

  private async buildAgentPayload(agent: ManagedAgent): Promise<AgentSnapshotPayload> {
    const storedRecord = await this.context.agentStorage.get(agent.id);
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
    registeredProviderIds = this.context.providerSnapshotManager.listRegisteredProviderIds(),
  ): AgentSnapshotPayload {
    return buildStoredAgentPayload(record, registeredProviderIds);
  }

  private isProviderVisibleToClient(provider: string): boolean {
    if (clientSupportsAllProviders(this.context.appVersion)) {
      return true;
    }
    return LEGACY_PROVIDER_IDS.has(provider);
  }

  // --- Internal helpers (moved from Session) ---

  private async getAgentPayloadById(agentId: string): Promise<AgentSnapshotPayload | null> {
    return this.context.getAgentPayloadById(agentId) as Promise<AgentSnapshotPayload | null>;
  }

  private async listAgentPayloads(filter?: {
    labels?: Record<string, string>;
    includeUnavailablePersisted?: boolean;
  }): Promise<AgentSnapshotPayload[]> {
    return this.context.listAgentPayloads(filter) as Promise<AgentSnapshotPayload[]>;
  }

  private async buildActiveProjectPlacementsByWorkspaceCwd(): Promise<
    Map<string, ProjectPlacementPayload>
  > {
    const [persistedWorkspaces, persistedProjects] = await Promise.all([
      this.context.workspaceRegistry.list(),
      this.context.projectRegistry.list(),
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

  private async buildProjectPlacementForWorkspace(
    workspace: import("../workspace-registry.js").PersistedWorkspaceRecord,
    projectRecord?: PersistedProjectRecord | null,
  ): Promise<ProjectPlacementPayload> {
    const project = projectRecord ?? (await this.context.projectRegistry.get(workspace.projectId));
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

  /**
   * Fetch agents (live and/or persisted), paginate, and return matching entries
   * with their project placements. Used by both handleFetchAgents and
   * handleFetchAgentHistory.
   */
  async listFetchAgentsEntries(request: AgentDirectoryRequestMessage): Promise<{
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
      const placementPromise = this.context.buildProjectPlacementForCwd(
        cwd,
      ) as Promise<ProjectPlacementPayload | null>;
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

  // --- Sub-step 3: Agent lifecycle write operations ---

  private readStructuredGenerationDaemonConfig(): StructuredGenerationDaemonConfig {
    return {
      metadataGeneration: this.context.daemonConfigStore.get().metadataGeneration,
    };
  }

  private async registerWorkspaceForImportedAgent(cwd: string): Promise<void> {
    try {
      const workspace = await this.context.findOrCreateWorkspaceForDirectory(cwd);
      await this.context.syncWorkspaceGitObserverForWorkspace(workspace);
      await this.context.describeWorkspaceRecord(workspace);
      await this.context.emitWorkspaceUpdateForCwd(workspace.cwd);
    } catch (error) {
      this.context.sessionLogger.warn(
        { err: error, cwd },
        "Failed to register workspace for imported agent",
      );
    }
  }

  private async buildProjectPlacementForCwd(
    cwd: string,
    _options?: { refreshGit?: boolean; fallback?: boolean },
  ): Promise<ProjectPlacementPayload | null> {
    const placement = (await this.context.buildProjectPlacementForCwd(
      cwd,
    )) as ProjectPlacementPayload | null;
    if (!placement && _options?.fallback) {
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
    return placement;
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

      await this.context.emitWorkspaceUpdateForCwd(payload.cwd);
    } catch (error) {
      this.context.sessionLogger.error({ err: error }, "Failed to emit agent update");
    }
  }

  // --- Sub-step 4: create_agent ---

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
    this.context.sessionLogger.info(
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
      const createdWorktree =
        await this.context.createAgentLifecycleDispatch.createWorktreeForRequest({
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
          agentManager: this.context.agentManager,
          agentStorage: this.context.agentStorage,
          logger: this.context.sessionLogger,
          chisacodeHome: this.context.chisacodeHome,
          workspaceGitService: this.context.workspaceGitService,
          providerSnapshotManager: this.context.providerSnapshotManager,
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
            this.context.buildAgentSessionConfig(
              sessionConfig,
              gitOptions,
              legacyWorktreeName,
              ctx,
            ) as Promise<CreateAgentSessionWorktreeResult>,
          resolveWorkspace: ({ cwd, workspaceId }) =>
            this.context.resolveCreateAgentWorkspace(
              cwd,
              workspaceId,
            ) as Promise<CreateAgentWorkspace>,
        },
      );
      createdAgentId = snapshot.id;
      await this.forwardAgentUpdate(snapshot);
      this.context.createAgentLifecycleDispatch.registerAutoArchiveIfRequested({
        autoArchive,
        agentId: snapshot.id,
        createdWorktree,
      });

      if (requestId) {
        const agentPayload = await this.buildAgentPayload(liveSnapshot);
        this.context.emit({
          type: "status",
          payload: {
            status: "agent_created",
            agentId: liveSnapshot.id,
            requestId,
            agent: agentPayload,
          },
        });
      }

      this.context.sessionLogger.info(
        { agentId: snapshot.id, provider: snapshot.provider },
        `Created agent ${snapshot.id} (${snapshot.provider})`,
      );
    } catch (error) {
      await this.context.createAgentLifecycleDispatch.cleanupCreatedWorktreeAfterFailedAgentCreate({
        createdWorktree: createdWorktreeForCleanup,
        createdAgentId,
      });
      const wireError = toWorktreeWireError(error);
      this.context.sessionLogger.error({ err: error }, "Failed to create agent");
      if (requestId) {
        this.context.emit({
          type: "status",
          payload: {
            status: "agent_create_failed",
            requestId,
            error: wireError.message,
            errorCode: wireError.code,
          },
        });
      }
      this.context.emit({
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

  private async handleDeleteAgentRequest(agentId: string, requestId: string): Promise<void> {
    this.context.sessionLogger.info({ agentId }, `Deleting agent ${agentId} from registry`);

    const knownCwd =
      this.context.agentManager.getAgent(agentId)?.cwd ??
      (await this.context.agentStorage.get(agentId))?.cwd ??
      null;

    // File-backed storage still needs an early delete fence before closeAgent().
    beginAgentDeleteIfSupported(this.context.agentStorage, agentId);

    try {
      await closeAgentCommand({ agentManager: this.context.agentManager }, agentId);
    } catch (error) {
      this.context.sessionLogger.warn(
        { err: error, agentId },
        `Failed to close agent ${agentId} during delete`,
      );
    }

    // Drain queued persistence from the just-closed agent before removing its
    // durable snapshot, otherwise an in-flight background write can recreate it.
    await this.context.agentManager.flush();

    try {
      await this.context.agentStorage.remove(agentId);
      await this.context.agentManager.deleteCommittedTimeline(agentId);
    } catch (error) {
      this.context.sessionLogger.error(
        { err: error, agentId },
        `Failed to fully delete agent ${agentId}`,
      );
    }

    this.context.emit({
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
      await this.context.emitWorkspaceUpdateForCwd(knownCwd);
    }
  }

  private async handleArchiveAgentRequest(agentId: string, requestId: string): Promise<void> {
    this.context.sessionLogger.info({ agentId }, `Archiving agent ${agentId}`);

    const { archivedAt } = await this.archiveAgentForClose(agentId);

    this.context.emit({
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
        agentManager: this.context.agentManager,
        agentStorage: this.context.agentStorage,
        logger: this.context.sessionLogger,
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
      await this.context.emitWorkspaceUpdateForCwd(payload.cwd);
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
        this.context.sessionLogger.warn(
          { err: result.reason, agentId: msg.agentIds[i], requestId: msg.requestId },
          "Failed to archive agent during close_items batch",
        );
      }
    }

    const terminals = [];
    for (const terminalId of msg.terminalIds) {
      try {
        terminals.push(this.context.terminalController.killTerminalForClose(terminalId));
      } catch (error) {
        this.context.sessionLogger.warn(
          { err: error, terminalId, requestId: msg.requestId },
          "Failed to kill terminal during close_items batch",
        );
        terminals.push({
          terminalId,
          success: false,
        });
      }
    }

    this.context.emit({
      type: "close_items_response",
      payload: {
        agents,
        terminals,
        requestId: msg.requestId,
      },
    });
  }

  private async unarchiveAgentByHandle(handle: AgentPersistenceHandle): Promise<void> {
    const records = await this.context.agentStorage.list();
    const matched = records.find(
      (record) =>
        record.persistence?.provider === handle.provider &&
        record.persistence?.sessionId === handle.sessionId,
    );
    if (!matched) {
      return;
    }
    await unarchiveAgentState(this.context.agentStorage, this.context.agentManager, matched.id);
  }

  private async handleResumeAgentRequest(
    msg: Extract<SessionInboundMessage, { type: "resume_agent_request" }>,
  ): Promise<void> {
    const { handle, overrides, requestId } = msg;
    if (!handle) {
      this.context.sessionLogger.warn("Resume request missing persistence handle");
      if (requestId) {
        this.context.emit({
          type: "rpc_error",
          payload: {
            requestId,
            requestType: msg.type,
            error: "Unable to resume agent: missing persistence handle",
            code: "agent_resume_failed",
          },
        });
      }
      this.context.emit({
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
    this.context.sessionLogger.info(
      { sessionId: handle.sessionId, provider: handle.provider },
      `Resuming agent ${handle.sessionId} (${handle.provider})`,
    );
    try {
      await this.unarchiveAgentByHandle(handle);
      const snapshot = await this.context.agentManager.resumeAgentFromPersistence(
        handle,
        overrides,
      );
      await unarchiveAgentState(this.context.agentStorage, this.context.agentManager, snapshot.id);
      await this.context.agentManager.hydrateTimelineFromProvider(snapshot.id);
      await this.forwardAgentUpdate(snapshot);
      const timelineSize = this.context.agentManager.getTimeline(snapshot.id).length;
      if (requestId) {
        const agentPayload = await this.buildAgentPayload(snapshot);
        this.context.emit({
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
      this.context.sessionLogger.error({ err: error }, "Failed to resume agent");
      if (requestId) {
        this.context.emit({
          type: "rpc_error",
          payload: {
            requestId,
            requestType: msg.type,
            error: message,
            code: "agent_resume_failed",
          },
        });
      }
      this.context.emit({
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
      this.context.emit({
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
    this.context.sessionLogger.info(
      { providerHandleId, provider },
      `Importing agent ${providerHandleId} (${provider})`,
    );

    try {
      const { snapshot, timelineSize } = await importProviderSession({
        request: normalized,
        agentManager: this.context.agentManager,
        agentStorage: this.context.agentStorage,
        workspaceGitService: this.context.workspaceGitService,
        providerSnapshotManager: this.context.providerSnapshotManager,
        daemonConfig: this.readStructuredGenerationDaemonConfig(),
        chisacodeHome: this.context.chisacodeHome,
        logger: this.context.sessionLogger,
      });
      await this.registerWorkspaceForImportedAgent(snapshot.cwd);
      await this.forwardAgentUpdate(snapshot);
      const agentPayload = await this.buildAgentPayload(snapshot);
      this.context.emit({
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
      this.context.sessionLogger.error({ err: error }, "Failed to import agent");
      this.context.emit({
        type: "status",
        payload: {
          status: "agent_create_failed",
          requestId,
          error: message,
        },
      });
      this.context.emit({
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
    this.context.sessionLogger.info({ agentId }, `Refreshing agent ${agentId} from persistence`);

    try {
      await unarchiveAgentState(this.context.agentStorage, this.context.agentManager, agentId);
      let snapshot: ManagedAgent;
      const existing = this.context.agentManager.getAgent(agentId);
      if (existing) {
        await this.interruptAgentIfRunning(agentId);
        snapshot = await this.context.agentManager.reloadAgentSession(agentId, undefined, {
          rehydrateFromDisk: true,
        });
      } else {
        const record = await this.context.agentStorage.get(agentId);
        if (!record) {
          throw new Error(`Agent not found: ${agentId}`);
        }
        const registeredProviderIds =
          this.context.providerSnapshotManager.listRegisteredProviderIds();
        if (!isStoredAgentProviderAvailable(record, registeredProviderIds)) {
          throw new Error(`Agent ${agentId} references unavailable provider '${record.provider}'`);
        }
        const handle = toAgentPersistenceHandle(registeredProviderIds, record.persistence);
        if (!handle) {
          throw new Error(`Agent ${agentId} cannot be refreshed because it lacks persistence`);
        }
        snapshot = await this.context.agentManager.resumeAgentFromPersistence(
          handle,
          buildConfigOverrides(record),
          agentId,
          extractTimestamps(record),
        );
      }
      await this.context.agentManager.hydrateTimelineFromProvider(agentId);
      await this.forwardAgentUpdate(snapshot);
      const timelineSize = this.context.agentManager.getTimeline(agentId).length;
      if (requestId) {
        this.context.emit({
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
      this.context.sessionLogger.error(
        { err: error, agentId },
        `Failed to refresh agent ${agentId}`,
      );
      if (requestId) {
        this.context.emit({
          type: "rpc_error",
          payload: {
            requestId,
            requestType: msg.type,
            error: message,
            code: "agent_refresh_failed",
          },
        });
      }
      this.context.emit({
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
    this.context.sessionLogger.info({ agentId }, `Cancel request received for agent ${agentId}`);

    try {
      await cancelAgentRunCommand(
        { agentManager: this.context.agentManager, logger: this.context.sessionLogger },
        agentId,
      );
      if (requestId) {
        const agent = this.context.agentManager.getAgent(agentId);
        const payload = agent ? await this.buildAgentPayload(agent) : null;
        this.context.emit({
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
      await this.context.agentManager.rewind(msg.agentId, msg.messageId, msg.mode);
      this.context.emit({
        type: "agent.rewind.response",
        payload: {
          requestId: msg.requestId,
          agentId: msg.agentId,
          ok: true,
          error: null,
        },
      });
    } catch (error) {
      this.context.emit({
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

  private async interruptAgentIfRunning(agentId: string): Promise<void> {
    const snapshot = this.context.agentManager.getAgent(agentId);
    if (!snapshot) {
      this.context.sessionLogger.trace({ agentId }, "agent.session.interrupt.not_found");
      throw new Error(`Agent ${agentId} not found`);
    }

    const hasInFlightRun = this.context.agentManager.hasInFlightRun(agentId);
    if (!hasInFlightRun) {
      this.context.sessionLogger.trace(
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

    this.context.sessionLogger.debug(
      { agentId, lifecycle: snapshot.lifecycle, hasInFlightRun },
      "interruptAgentIfRunning: interrupting",
    );

    const t0 = Date.now();
    const cancelled = await this.context.agentManager.cancelAgentRun(agentId);
    this.context.sessionLogger.debug(
      { agentId, cancelled, durationMs: Date.now() - t0 },
      "interruptAgentIfRunning: cancelAgentRun completed",
    );
    if (!cancelled) {
      this.context.sessionLogger.warn(
        { agentId },
        "interruptAgentIfRunning: reported running but no active run was cancelled",
      );
    }
  }

  // @ts-ignore TS6133 — will be used in Sub-step 4 (create_agent)
  private hasActiveAgentRun(agentId: string | null): boolean {
    if (!agentId) {
      return false;
    }
    return this.context.agentManager.hasInFlightRun(agentId);
  }

  // --- Sub-step 5: Agent Config handlers ---

  private async handleSetAgentModeRequest(
    agentId: string,
    modeId: string,
    requestId: string,
  ): Promise<void> {
    this.context.sessionLogger.info(
      { agentId, modeId, requestId },
      "session: set_agent_mode_request",
    );

    try {
      await setAgentModeCommand({ agentManager: this.context.agentManager }, { agentId, modeId });
      this.context.sessionLogger.info(
        { agentId, modeId, requestId },
        "session: set_agent_mode_request success",
      );
      this.context.emit({
        type: "set_agent_mode_response",
        payload: { requestId, agentId, accepted: true, error: null },
      });
    } catch (error) {
      this.context.sessionLogger.error(
        { err: error, agentId, modeId, requestId },
        "session: set_agent_mode_request error",
      );
      this.context.emit({
        type: "activity_log",
        payload: {
          id: uuidv4(),
          timestamp: new Date(),
          type: "error",
          content: `Failed to set agent mode: ${getErrorMessage(error)}`,
        },
      });
      this.context.emit({
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
    this.context.sessionLogger.info(
      { agentId, modelId, runtimeProvider, requestId },
      "session: set_agent_model_request",
    );

    try {
      await this.context.agentManager.setAgentModel(agentId, modelId, { runtimeProvider });
      this.context.sessionLogger.info(
        { agentId, modelId, runtimeProvider, requestId },
        "session: set_agent_model_request success",
      );
      this.context.emit({
        type: "set_agent_model_response",
        payload: { requestId, agentId, accepted: true, error: null },
      });
    } catch (error) {
      this.context.sessionLogger.error(
        { err: error, agentId, modelId, runtimeProvider, requestId },
        "session: set_agent_model_request error",
      );
      this.context.emit({
        type: "activity_log",
        payload: {
          id: uuidv4(),
          timestamp: new Date(),
          type: "error",
          content: `Failed to set agent model: ${getErrorMessage(error)}`,
        },
      });
      this.context.emit({
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
    this.context.sessionLogger.info(
      { agentId, featureId, value, requestId },
      "session: set_agent_feature_request",
    );

    try {
      await this.context.agentManager.setAgentFeature(agentId, featureId, value);
      this.context.sessionLogger.info(
        { agentId, featureId, value, requestId },
        "session: set_agent_feature_request success",
      );
      this.context.emit({
        type: "set_agent_feature_response",
        payload: { requestId, agentId, accepted: true, error: null },
      });
    } catch (error) {
      this.context.sessionLogger.error(
        { err: error, agentId, featureId, value, requestId },
        "session: set_agent_feature_request error",
      );
      this.context.emit({
        type: "activity_log",
        payload: {
          id: uuidv4(),
          timestamp: new Date(),
          type: "error",
          content: `Failed to set agent feature: ${getErrorMessage(error)}`,
        },
      });
      this.context.emit({
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
    this.context.sessionLogger.info(
      { agentId, thinkingOptionId, requestId },
      "session: set_agent_thinking_request",
    );

    try {
      await this.context.agentManager.setAgentThinkingOption(agentId, thinkingOptionId);
      this.context.sessionLogger.info(
        { agentId, thinkingOptionId, requestId },
        "session: set_agent_thinking_request success",
      );
      this.context.emit({
        type: "set_agent_thinking_response",
        payload: { requestId, agentId, accepted: true, error: null },
      });
    } catch (error) {
      this.context.sessionLogger.error(
        { err: error, agentId, thinkingOptionId, requestId },
        "session: set_agent_thinking_request error",
      );
      this.context.emit({
        type: "activity_log",
        payload: {
          id: uuidv4(),
          timestamp: new Date(),
          type: "error",
          content: `Failed to set agent thinking option: ${getErrorMessage(error)}`,
        },
      });
      this.context.emit({
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

  // --- Sub-step 5: Usage handlers ---

  private async listRetainedUsageEvents() {
    if (!this.context.usageStore) {
      return [];
    }
    const records = await this.context.usageStore.list();
    const retained = pruneUsageEvents({ events: records });
    if (retained.length !== records.length) {
      await this.context.usageStore.replace(retained);
    }
    return retained;
  }

  private async handleUsageSummaryGet(
    request: Extract<SessionInboundMessage, { type: "usage.summary.get.request" }>,
  ): Promise<void> {
    try {
      const records = await this.listRetainedUsageEvents();
      this.context.emit({
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
      this.context.sessionLogger.error(
        { err: error },
        "Failed to handle usage.summary.get.request",
      );
      this.context.emit({
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
      this.context.emit({
        type: "usage.export.response",
        payload: {
          requestId: request.requestId,
          format: request.format,
          filename: `chisacode-usage.${request.format}`,
          content: exportUsageEvents(records, request.format),
        },
      });
    } catch (error) {
      this.context.sessionLogger.error({ err: error }, "Failed to handle usage.export.request");
      this.context.emit({
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
      await this.context.usageStore?.clear();
      this.context.emit({
        type: "usage.clear.response",
        payload: {
          requestId: request.requestId,
          cleared: true,
        },
      });
    } catch (error) {
      this.context.sessionLogger.error({ err: error }, "Failed to handle usage.clear.request");
      this.context.emit({
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
}
