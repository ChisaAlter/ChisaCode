import type {
  AssistantMessage as OpenCodeAssistantMessage,
  Event as OpenCodeEvent,
  Message as OpenCodeMessage,
  Part as OpenCodePart,
} from "@opencode-ai/sdk/v2/client";
import { buildToolCallDisplayModel } from "@chisacode/protocol/tool-call-display";

import type {
  AgentStreamEvent,
  AgentTimelineItem,
  AgentUsage,
  ToolCallDetail,
  ToolCallTimelineItem,
} from "../../agent-sdk-types.js";
import { buildOpenCodeModelLookupKey, readPositiveFiniteNumber } from "./catalog.js";
import { buildOpenCodePermissionActions, OpencodeToolPartToTimelineItemSchema } from "./helpers.js";
import { toDiagnosticErrorMessage } from "../diagnostic-utils.js";

export type OpenCodeMessageRole = "user" | "assistant";

function resolvePartDedupeKey(
  part: { id: string; messageID: string },
  partType: "text" | "reasoning",
): string | null {
  if (part.id.trim().length > 0) {
    return `${partType}:${part.id}`;
  }
  if (part.messageID.trim().length > 0) {
    return `${partType}:message:${part.messageID}`;
  }
  return null;
}

export function maxFiniteNumber(left: number | undefined, right: number): number {
  return left === undefined ? right : Math.max(left, right);
}

function assignUsageNumber(usage: AgentUsage, key: keyof AgentUsage, value: number | undefined) {
  if (value !== undefined) {
    usage[key] = value;
  }
}

export function resolveOpenCodeModelLookupKeyFromAssistantMessage(
  info: OpenCodeAssistantMessage,
): string | undefined {
  const providerId = info.providerID;
  const modelId = info.modelID;
  if (!providerId || !modelId) {
    return undefined;
  }

  return buildOpenCodeModelLookupKey(providerId, modelId);
}

export function mergeOpenCodeStepFinishUsage(
  usage: AgentUsage,
  part: {
    cost?: unknown;
    tokens?: {
      input?: unknown;
      output?: unknown;
      reasoning?: unknown;
      total?: unknown;
      cache?: {
        read?: unknown;
        write?: unknown;
      };
    };
  },
  options: { totalCostUsd?: number } = {},
): void {
  const inputTokens = readPositiveFiniteNumber(part.tokens?.input);
  const outputTokens = readPositiveFiniteNumber(part.tokens?.output);
  const reasoningTokens = readPositiveFiniteNumber(part.tokens?.reasoning);
  const cacheReadTokens = readPositiveFiniteNumber(part.tokens?.cache?.read);
  const cacheWriteTokens = readPositiveFiniteNumber(part.tokens?.cache?.write);
  const totalTokens =
    (inputTokens ?? 0) +
    (outputTokens ?? 0) +
    (reasoningTokens ?? 0) +
    (cacheReadTokens ?? 0) +
    (cacheWriteTokens ?? 0);
  const cost = readPositiveFiniteNumber(part.cost);

  assignUsageNumber(usage, "inputTokens", inputTokens);
  assignUsageNumber(usage, "cachedInputTokens", cacheReadTokens);
  assignUsageNumber(usage, "outputTokens", outputTokens);
  if (totalTokens > 0) {
    usage.contextWindowUsedTokens = totalTokens;
  }
  if (cost !== undefined) {
    usage.totalCostUsd = options.totalCostUsd ?? (usage.totalCostUsd ?? 0) + cost;
  }
}

export function hasNormalizedOpenCodeUsage(usage: AgentUsage): boolean {
  return [
    usage.inputTokens,
    usage.cachedInputTokens,
    usage.outputTokens,
    usage.totalCostUsd,
    usage.contextWindowMaxTokens,
    usage.contextWindowUsedTokens,
  ].some((value) => typeof value === "number" && Number.isFinite(value));
}

export interface OpenCodeEventTranslationState {
  sessionId: string;
  cwd?: string;
  messageRoles: Map<string, OpenCodeMessageRole>;
  pendingUserMessageText?: string | null;
  emittedUserMessageIds?: Set<string>;
  accumulatedUsage: AgentUsage;
  sessionTotalCostUsd?: number;
  streamedPartKeys: Set<string>;
  emittedStructuredMessageIds: Set<string>;
  /** Tracks the type of each part by ID, learned from message.part.updated events. */
  partTypes: Map<string, string>;
  subAgentsByCallId?: Map<string, OpenCodeSubAgentActivityState>;
  subAgentCallIdByChildSessionId?: Map<string, string>;
  pendingChildToolPartsBySessionId?: Map<string, OpenCodeToolPartEventPart[]>;
  modelContextWindowsByModelKey?: ReadonlyMap<string, number>;
  onAssistantModelContextWindowResolved?: (contextWindowMaxTokens: number) => void;
}

export type OpenCodeToolPartEventPart = Extract<
  Extract<OpenCodeEvent, { type: "message.part.updated" }>["properties"]["part"],
  { type: "tool" }
>;

interface OpenCodeSubAgentActionEntry {
  index: number;
  key: string;
  toolName: string;
  summary?: string;
}

export interface OpenCodeSubAgentActivityState {
  toolCall: ToolCallTimelineItem;
  actions: OpenCodeSubAgentActionEntry[];
  actionIndexByKey: Map<string, number>;
  nextActionIndex: number;
  childSessionId?: string;
}

const MAX_OPENCODE_SUB_AGENT_ACTIONS = 200;
const MAX_OPENCODE_PENDING_CHILD_TOOL_PARTS = 200;
export function stringifyStructuredAssistantMessage(value: unknown): string | null {
  if (value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

export function readOpenCodeRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function isOpenCodeTodoWriteToolPart(
  part: OpenCodeToolPartEventPart | OpenCodePart,
): boolean {
  return part.type === "tool" && part.tool.trim().toLowerCase() === "todowrite";
}

function readOpenCodeTodoItems(
  value: unknown,
): Array<{ content?: string | null; status?: string | null }> | null {
  if (typeof value === "string") {
    try {
      return readOpenCodeTodoItems(JSON.parse(value));
    } catch {
      return null;
    }
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry) => {
      const record = readOpenCodeRecord(entry);
      if (!record) {
        return [];
      }
      const content = readNonEmptyString(record.content);
      if (!content) {
        return [];
      }
      return [
        {
          content,
          status: readNonEmptyString(record.status),
        },
      ];
    });
  }
  const record = readOpenCodeRecord(value);
  if (!record) {
    return null;
  }
  return readOpenCodeTodoItems(record.todos);
}

export function readOpenCodeTodoItemsFromToolPart(
  part: Extract<OpenCodePart, { type: "tool" }>,
): Array<{ content?: string | null; status?: string | null }> | null {
  const state = readOpenCodeRecord(part.state);
  return (
    readOpenCodeTodoItems(state?.input) ??
    readOpenCodeTodoItems(state?.output) ??
    readOpenCodeTodoItems(state?.metadata)
  );
}

export function mapOpenCodeTodosToTimelineItems(
  todos: Array<{ content?: string | null; status?: string | null }>,
): Extract<AgentTimelineItem, { type: "todo" }> {
  return {
    type: "todo",
    items: todos.flatMap((todo) => {
      const text = readNonEmptyString(todo.content);
      if (!text) {
        return [];
      }

      return [
        {
          text,
          completed: todo.status === "completed",
        },
      ];
    }),
  };
}

function createCompactionTimelineItem(
  status: Extract<AgentTimelineItem, { type: "compaction" }>["status"],
  trigger?: Extract<AgentTimelineItem, { type: "compaction" }>["trigger"],
): Extract<AgentTimelineItem, { type: "compaction" }> {
  return {
    type: "compaction",
    status,
    ...(trigger ? { trigger } : {}),
  };
}

const PERMISSION_COMMAND_KEYS = ["command", "cmd", "shellCommand"] as const;
const PERMISSION_CWD_KEYS = ["cwd", "directory", "path", "workdir"] as const;
const PERMISSION_REASON_KEYS = ["reason", "purpose", "description", "message"] as const;
const PERMISSION_TITLE_BY_NAME: Record<string, string> = {
  external_directory: "Access external directory",
  bash: "Run shell command",
  read: "Read files",
  read_file: "Read files",
  write: "Write files",
  write_file: "Write files",
  create_file: "Write files",
  edit: "Edit files",
  apply_patch: "Edit files",
  apply_diff: "Edit files",
};

function toHumanReadablePermissionTitle(permission: string): string {
  const mapped = PERMISSION_TITLE_BY_NAME[permission];
  if (mapped) {
    return mapped;
  }

  const normalized = permission
    .split(/[\s_-]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
  return normalized.length > 0 ? normalized : "Permission request";
}

function readFirstStringFromRecord(
  record: Record<string, unknown> | null,
  keys: readonly string[],
): string | null {
  if (!record) {
    return null;
  }
  for (const key of keys) {
    const value = readNonEmptyString(record[key]);
    if (value) {
      return value;
    }
  }
  return null;
}

function readPermissionField(
  metadata: Record<string, unknown> | null,
  keys: readonly string[],
): string | null {
  const direct = readFirstStringFromRecord(metadata, keys);
  if (direct) {
    return direct;
  }

  const nestedInput = readOpenCodeRecord(metadata?.input);
  return readFirstStringFromRecord(nestedInput, keys);
}

function buildOpenCodePermissionInput(params: {
  patterns: string[];
  metadata: Record<string, unknown> | null;
  tool: Record<string, unknown> | null;
  command: string | null;
}): Record<string, unknown> {
  return {
    ...(params.patterns.length > 0 ? { patterns: params.patterns } : {}),
    ...(params.metadata ? { metadata: params.metadata } : {}),
    ...(params.tool ? { tool: params.tool } : {}),
    ...(params.command ? { command: params.command } : {}),
  };
}

function buildOpenCodePermissionDetail(params: {
  permission: string;
  input: Record<string, unknown>;
  command: string | null;
  cwd: string | null;
}): ToolCallDetail {
  if (params.command) {
    return {
      type: "shell",
      command: params.command,
      ...(params.cwd ? { cwd: params.cwd } : {}),
    };
  }

  return {
    type: "unknown",
    input: {
      permission: params.permission,
      ...params.input,
    },
    output: null,
  };
}

function buildOpenCodePermissionDescription(params: {
  reason: string | null;
  patterns: string[];
}): string | undefined {
  const parts: string[] = [];
  if (params.reason) {
    parts.push(params.reason);
  }
  if (params.patterns.length > 0) {
    parts.push(`Scope: ${params.patterns.join(", ")}`);
  }
  return parts.length > 0 ? parts.join(" - ") : undefined;
}

export function translateOpenCodeEvent(
  event: OpenCodeEvent,
  state: OpenCodeEventTranslationState,
): AgentStreamEvent[] {
  const events: AgentStreamEvent[] = [];

  switch (event.type) {
    case "session.created":
    case "session.updated":
      appendOpenCodeSessionCreatedOrUpdated(event, state, events);
      break;
    case "message.updated":
      appendOpenCodeMessageUpdated(event, state, events);
      break;
    case "message.part.updated":
      appendOpenCodeMessagePartUpdated(event, state, events);
      break;
    case "message.part.delta":
      appendOpenCodeMessagePartDelta(event, state, events);
      break;
    case "permission.asked":
      appendOpenCodePermissionAsked(event, state, events);
      break;
    case "question.asked":
      appendOpenCodeQuestionAsked(event, state, events);
      break;
    case "todo.updated":
      if (event.properties.sessionID === state.sessionId) {
        events.push({
          type: "timeline",
          provider: "opencode",
          item: mapOpenCodeTodosToTimelineItems(event.properties.todos),
        });
      }
      break;
    case "session.compacted":
      if (event.properties.sessionID === state.sessionId) {
        events.push({
          type: "timeline",
          provider: "opencode",
          item: createCompactionTimelineItem("completed"),
        });
      }
      break;
    case "session.idle":
      if (event.properties.sessionID === state.sessionId) {
        resetOpenCodeTurnTrackingState(state);
        events.push({ type: "turn_completed", provider: "opencode", usage: undefined });
      }
      break;
    case "session.error":
      appendOpenCodeSessionError(event, state, events);
      break;
    case "session.status":
      appendOpenCodeSessionStatus(event, state, events);
      break;
  }

  return events;
}

function resetOpenCodeTurnTrackingState(state: OpenCodeEventTranslationState): void {
  state.streamedPartKeys.clear();
  state.partTypes.clear();
}

function getOpenCodeSubAgentMaps(state: OpenCodeEventTranslationState): {
  byCallId: Map<string, OpenCodeSubAgentActivityState>;
  callIdByChildSessionId: Map<string, string>;
  pendingChildToolPartsBySessionId: Map<string, OpenCodeToolPartEventPart[]>;
} {
  state.subAgentsByCallId ??= new Map();
  state.subAgentCallIdByChildSessionId ??= new Map();
  state.pendingChildToolPartsBySessionId ??= new Map();
  return {
    byCallId: state.subAgentsByCallId,
    callIdByChildSessionId: state.subAgentCallIdByChildSessionId,
    pendingChildToolPartsBySessionId: state.pendingChildToolPartsBySessionId,
  };
}

function isOpenCodeSessionTrackedByParent(
  sessionId: string,
  state: OpenCodeEventTranslationState,
): boolean {
  return (
    sessionId === state.sessionId || state.subAgentCallIdByChildSessionId?.has(sessionId) === true
  );
}

function getOpenCodeSubAgentState(
  callId: string,
  state: OpenCodeEventTranslationState,
  toolCall: ToolCallTimelineItem,
): OpenCodeSubAgentActivityState {
  const maps = getOpenCodeSubAgentMaps(state);
  const existing = maps.byCallId.get(callId);
  if (existing) {
    existing.toolCall = toolCall;
    return existing;
  }

  const created: OpenCodeSubAgentActivityState = {
    toolCall,
    actions: [],
    actionIndexByKey: new Map(),
    nextActionIndex: 1,
  };
  maps.byCallId.set(callId, created);
  return created;
}

function linkOpenCodeSubAgentChildSession(
  activity: OpenCodeSubAgentActivityState,
  childSessionId: string,
  state: OpenCodeEventTranslationState,
): void {
  activity.childSessionId = childSessionId;
  const maps = getOpenCodeSubAgentMaps(state);
  maps.callIdByChildSessionId.set(childSessionId, activity.toolCall.callId);
}

function buildOpenCodeSubAgentLog(
  detail: Extract<ToolCallDetail, { type: "sub_agent" }>,
  activity: OpenCodeSubAgentActivityState,
): string {
  const actionLog = activity.actions
    .map((action) =>
      action.summary ? `[${action.toolName}] ${action.summary}` : `[${action.toolName}]`,
    )
    .join("\n");
  const parts = [actionLog, detail.log].filter((part) => part.trim().length > 0);
  return parts.join("\n\n");
}

function buildOpenCodeSubAgentTimelineItem(
  activity: OpenCodeSubAgentActivityState,
): ToolCallTimelineItem {
  const toolCall = activity.toolCall;
  if (toolCall.detail.type !== "sub_agent") {
    return toolCall;
  }
  const childSessionId = activity.childSessionId ?? toolCall.detail.childSessionId;
  return {
    ...toolCall,
    detail: {
      ...toolCall.detail,
      ...(childSessionId ? { childSessionId } : {}),
      log: buildOpenCodeSubAgentLog(toolCall.detail, activity),
    },
  };
}

function registerOpenCodeSubAgentToolCall(
  item: ToolCallTimelineItem,
  state: OpenCodeEventTranslationState,
): ToolCallTimelineItem {
  if (item.detail.type !== "sub_agent") {
    return item;
  }
  const activity = getOpenCodeSubAgentState(item.callId, state, item);
  if (item.detail.childSessionId) {
    linkOpenCodeSubAgentChildSession(activity, item.detail.childSessionId, state);
  }
  return buildOpenCodeSubAgentTimelineItem(activity);
}

function bufferOpenCodeSubAgentChildToolPart(
  part: OpenCodeToolPartEventPart,
  state: OpenCodeEventTranslationState,
): void {
  const maps = getOpenCodeSubAgentMaps(state);
  if (maps.byCallId.size === 0) {
    return;
  }
  const totalPending = [...maps.pendingChildToolPartsBySessionId.values()].reduce(
    (total, parts) => total + parts.length,
    0,
  );
  if (totalPending >= MAX_OPENCODE_PENDING_CHILD_TOOL_PARTS) {
    return;
  }
  const pending = maps.pendingChildToolPartsBySessionId.get(part.sessionID) ?? [];
  pending.push(part);
  maps.pendingChildToolPartsBySessionId.set(part.sessionID, pending);
}

function flushOpenCodeSubAgentChildToolParts(
  childSessionId: string,
  state: OpenCodeEventTranslationState,
  events: AgentStreamEvent[],
): void {
  const maps = getOpenCodeSubAgentMaps(state);
  const pending = maps.pendingChildToolPartsBySessionId.get(childSessionId);
  if (!pending || pending.length === 0) {
    return;
  }
  maps.pendingChildToolPartsBySessionId.delete(childSessionId);
  for (const part of pending) {
    appendOpenCodeSubAgentChildToolPart(part, state, events);
  }
}

function findOnlyOpenCodeSubAgentWaitingForChild(
  state: OpenCodeEventTranslationState,
): OpenCodeSubAgentActivityState | null {
  const maps = getOpenCodeSubAgentMaps(state);
  const candidates = [...maps.byCallId.values()].filter(
    (activity) =>
      activity.toolCall.status === "running" &&
      activity.toolCall.detail.type === "sub_agent" &&
      !activity.childSessionId,
  );
  return candidates.length === 1 ? (candidates[0] ?? null) : null;
}

function summarizeOpenCodeSubAgentAction(
  item: ToolCallTimelineItem,
  cwd: string | undefined,
): string | undefined {
  const display = buildToolCallDisplayModel({
    name: item.name,
    status: item.status,
    error: item.error,
    metadata: item.metadata,
    detail: item.detail,
    cwd,
  });
  return display.summary ?? display.errorText;
}

function appendOpenCodeSubAgentAction(
  activity: OpenCodeSubAgentActivityState,
  item: ToolCallTimelineItem,
  cwd: string | undefined,
): boolean {
  const key = item.callId || `${item.name}:${activity.actions.length}`;
  const existingIndex = activity.actionIndexByKey.get(key);
  const summary = summarizeOpenCodeSubAgentAction(item, cwd);

  if (existingIndex !== undefined) {
    const action = activity.actions[existingIndex];
    if (!action) {
      return false;
    }
    const changed = action.toolName !== item.name || action.summary !== summary;
    action.toolName = item.name;
    if (summary) {
      action.summary = summary;
    } else {
      delete action.summary;
    }
    return changed;
  }

  if (activity.actions.length >= MAX_OPENCODE_SUB_AGENT_ACTIONS) {
    return false;
  }

  activity.actionIndexByKey.set(key, activity.actions.length);
  activity.actions.push({
    index: activity.nextActionIndex,
    key,
    toolName: item.name,
    ...(summary ? { summary } : {}),
  });
  activity.nextActionIndex += 1;
  return true;
}

function appendOpenCodeToolCallTimelineItem(
  item: ToolCallTimelineItem,
  state: OpenCodeEventTranslationState,
  events: AgentStreamEvent[],
): void {
  const timelineItem = registerOpenCodeSubAgentToolCall(item, state);
  events.push({
    type: "timeline",
    provider: "opencode",
    item: timelineItem,
  });
  if (timelineItem.detail.type === "sub_agent" && timelineItem.detail.childSessionId) {
    flushOpenCodeSubAgentChildToolParts(timelineItem.detail.childSessionId, state, events);
  }
}

function appendOpenCodeSubAgentChildSessionLinked(
  childSessionId: string,
  state: OpenCodeEventTranslationState,
  events: AgentStreamEvent[],
): void {
  const activity = findOnlyOpenCodeSubAgentWaitingForChild(state);
  if (!activity) {
    return;
  }
  linkOpenCodeSubAgentChildSession(activity, childSessionId, state);
  events.push({
    type: "timeline",
    provider: "opencode",
    item: buildOpenCodeSubAgentTimelineItem(activity),
  });
  flushOpenCodeSubAgentChildToolParts(childSessionId, state, events);
}

function appendOpenCodeSubAgentChildToolPart(
  part: OpenCodeToolPartEventPart,
  state: OpenCodeEventTranslationState,
  events: AgentStreamEvent[],
): void {
  const maps = getOpenCodeSubAgentMaps(state);
  const parentCallId = maps.callIdByChildSessionId.get(part.sessionID);
  if (!parentCallId) {
    bufferOpenCodeSubAgentChildToolPart(part, state);
    return;
  }
  const activity = maps.byCallId.get(parentCallId);
  if (!activity) {
    return;
  }
  const parsedToolPart = OpencodeToolPartToTimelineItemSchema.safeParse(part);
  if (!parsedToolPart.success || !parsedToolPart.data) {
    return;
  }
  if (!appendOpenCodeSubAgentAction(activity, parsedToolPart.data, state.cwd)) {
    return;
  }
  events.push({
    type: "timeline",
    provider: "opencode",
    item: buildOpenCodeSubAgentTimelineItem(activity),
  });
}

function appendOpenCodeSessionCreatedOrUpdated(
  event: Extract<OpenCodeEvent, { type: "session.created" | "session.updated" }>,
  state: OpenCodeEventTranslationState,
  events: AgentStreamEvent[],
): void {
  const info = readOpenCodeRecord(event.properties.info);
  if (event.properties.info.id === state.sessionId) {
    const sessionCost = readPositiveFiniteNumber(info?.cost);
    if (sessionCost !== undefined) {
      state.sessionTotalCostUsd = maxFiniteNumber(state.sessionTotalCostUsd, sessionCost);
      state.accumulatedUsage.totalCostUsd = state.sessionTotalCostUsd;
    }
    events.push({
      type: "thread_started",
      sessionId: state.sessionId,
      provider: "opencode",
    });
    return;
  }

  const parentSessionId = readNonEmptyString(info?.parentID) ?? readNonEmptyString(info?.parentId);
  if (parentSessionId === state.sessionId) {
    appendOpenCodeSubAgentChildSessionLinked(event.properties.info.id, state, events);
  }
}

function appendOpenCodeMessageUpdated(
  event: Extract<OpenCodeEvent, { type: "message.updated" }>,
  state: OpenCodeEventTranslationState,
  events: AgentStreamEvent[],
): void {
  const info = event.properties.info;
  if (info.sessionID !== state.sessionId) {
    return;
  }
  state.messageRoles.set(info.id, info.role);
  if (info.role === "user") {
    appendOpenCodeUserMessageUpdated(info, state, events);
    return;
  }
  if (info.role !== "assistant") {
    return;
  }
  const modelLookupKey = resolveOpenCodeModelLookupKeyFromAssistantMessage(info);
  if (modelLookupKey) {
    const contextWindowMaxTokens = state.modelContextWindowsByModelKey?.get(modelLookupKey);
    if (contextWindowMaxTokens !== undefined) {
      state.onAssistantModelContextWindowResolved?.(contextWindowMaxTokens);
    }
  }
  if (state.emittedStructuredMessageIds.has(info.id) || info.time?.completed === undefined) {
    return;
  }
  const text = stringifyStructuredAssistantMessage(info.structured);
  if (!text) {
    return;
  }
  state.emittedStructuredMessageIds.add(info.id);
  events.push({
    type: "timeline",
    provider: "opencode",
    item: { type: "assistant_message", text },
  });
}

function appendOpenCodeUserMessageUpdated(
  info: Extract<OpenCodeMessage, { role: "user" }>,
  state: OpenCodeEventTranslationState,
  events: AgentStreamEvent[],
): void {
  const text = state.pendingUserMessageText;
  if (!text || text.trim().length === 0 || state.emittedUserMessageIds?.has(info.id)) {
    return;
  }
  state.emittedUserMessageIds?.add(info.id);
  events.push({
    type: "timeline",
    provider: "opencode",
    item: { type: "user_message", text, messageId: info.id },
  });
}

function appendOpenCodeMessagePartUpdated(
  event: Extract<OpenCodeEvent, { type: "message.part.updated" }>,
  state: OpenCodeEventTranslationState,
  events: AgentStreamEvent[],
): void {
  const part = event.properties.part;
  if (part.type === "tool" && isOpenCodeTodoWriteToolPart(part)) {
    return;
  }
  if (part.sessionID !== state.sessionId) {
    if (part.type === "tool") {
      appendOpenCodeSubAgentChildToolPart(part, state, events);
    }
    return;
  }
  const messageRole = state.messageRoles.get(part.messageID);
  state.partTypes.set(part.id, part.type);

  if (part.type === "text") {
    appendOpenCodeTextPart(part, messageRole, state, events);
    return;
  }
  if (part.type === "reasoning") {
    appendOpenCodeReasoningPart(part, state, events);
    return;
  }
  if (part.type === "tool") {
    const parsedToolPart = OpencodeToolPartToTimelineItemSchema.safeParse(part);
    if (parsedToolPart.success && parsedToolPart.data) {
      appendOpenCodeToolCallTimelineItem(parsedToolPart.data, state, events);
    }
    return;
  }
  if (part.type === "compaction") {
    events.push({
      type: "timeline",
      provider: "opencode",
      item: createCompactionTimelineItem("loading", part.auto ? "auto" : "manual"),
    });
    return;
  }
  if (part.type === "step-finish") {
    const stepCost = readPositiveFiniteNumber(part.cost);
    if (stepCost !== undefined) {
      state.sessionTotalCostUsd = (state.sessionTotalCostUsd ?? 0) + stepCost;
    }
    mergeOpenCodeStepFinishUsage(state.accumulatedUsage, part, {
      totalCostUsd: state.sessionTotalCostUsd,
    });
    if (hasNormalizedOpenCodeUsage(state.accumulatedUsage)) {
      events.push({
        type: "usage_updated",
        provider: "opencode",
        usage: { ...state.accumulatedUsage },
      });
    }
  }
}

function appendOpenCodeTextPart(
  part: Extract<
    Extract<OpenCodeEvent, { type: "message.part.updated" }>["properties"]["part"],
    { type: "text" }
  >,
  messageRole: OpenCodeMessageRole | undefined,
  state: OpenCodeEventTranslationState,
  events: AgentStreamEvent[],
): void {
  if (messageRole === "user") {
    return;
  }
  if (!part.time?.end) {
    return;
  }
  const partKey = resolvePartDedupeKey(part, "text");
  if (partKey && state.streamedPartKeys.delete(partKey)) {
    return;
  }
  if (part.text) {
    events.push({
      type: "timeline",
      provider: "opencode",
      item: { type: "assistant_message", text: part.text },
    });
  }
}

function appendOpenCodeReasoningPart(
  part: Extract<
    Extract<OpenCodeEvent, { type: "message.part.updated" }>["properties"]["part"],
    { type: "reasoning" }
  >,
  state: OpenCodeEventTranslationState,
  events: AgentStreamEvent[],
): void {
  if (!part.time.end) {
    return;
  }
  const partKey = resolvePartDedupeKey(part, "reasoning");
  if (partKey && state.streamedPartKeys.delete(partKey)) {
    return;
  }
  if (part.text) {
    events.push({
      type: "timeline",
      provider: "opencode",
      item: { type: "reasoning", text: part.text },
    });
  }
}

function appendOpenCodeMessagePartDelta(
  event: Extract<OpenCodeEvent, { type: "message.part.delta" }>,
  state: OpenCodeEventTranslationState,
  events: AgentStreamEvent[],
): void {
  const { sessionID, messageID, partID, field, delta } = event.properties;
  if (sessionID !== state.sessionId) {
    return;
  }
  if (!delta || !field) {
    return;
  }
  const messageRole = messageID ? state.messageRoles.get(messageID) : undefined;
  const knownPartType = partID ? state.partTypes.get(partID) : undefined;
  const isReasoning = knownPartType === "reasoning" || field === "reasoning";

  if (isReasoning) {
    if (partID) {
      state.streamedPartKeys.add(`reasoning:${partID}`);
    }
    events.push({
      type: "timeline",
      provider: "opencode",
      item: { type: "reasoning", text: delta },
    });
    return;
  }
  if (field !== "text") {
    return;
  }
  if (messageRole === "user") {
    return;
  }
  if (partID) {
    state.streamedPartKeys.add(`text:${partID}`);
  }
  events.push({
    type: "timeline",
    provider: "opencode",
    item: { type: "assistant_message", text: delta },
  });
}

function appendOpenCodePermissionAsked(
  event: Extract<OpenCodeEvent, { type: "permission.asked" }>,
  state: OpenCodeEventTranslationState,
  events: AgentStreamEvent[],
): void {
  if (!isOpenCodeSessionTrackedByParent(event.properties.sessionID, state)) {
    return;
  }
  const metadata = readOpenCodeRecord(event.properties.metadata);
  const tool = readOpenCodeRecord(event.properties.tool);
  const patterns = Array.isArray(event.properties.patterns)
    ? event.properties.patterns.filter((value): value is string => typeof value === "string")
    : [];
  const command = readPermissionField(metadata, PERMISSION_COMMAND_KEYS);
  const cwd = readPermissionField(metadata, PERMISSION_CWD_KEYS);
  const reason = readPermissionField(metadata, PERMISSION_REASON_KEYS);
  const input = buildOpenCodePermissionInput({ patterns, metadata, tool, command });
  const detail = buildOpenCodePermissionDetail({
    permission: event.properties.permission,
    input,
    command,
    cwd,
  });
  const description = buildOpenCodePermissionDescription({ reason, patterns });

  events.push({
    type: "permission_requested",
    provider: "opencode",
    request: {
      id: event.properties.id,
      provider: "opencode",
      name: event.properties.permission,
      kind: "tool",
      title: toHumanReadablePermissionTitle(event.properties.permission),
      ...(description ? { description } : {}),
      input,
      detail,
      actions: buildOpenCodePermissionActions(),
    },
  });
}

function appendOpenCodeQuestionAsked(
  event: Extract<OpenCodeEvent, { type: "question.asked" }>,
  state: OpenCodeEventTranslationState,
  events: AgentStreamEvent[],
): void {
  if (event.properties.sessionID !== state.sessionId) {
    return;
  }
  const questions = event.properties.questions.flatMap((q) => {
    if (!q.question || !q.header) {
      return [];
    }
    const options =
      q.options?.map((o) => ({
        label: o.label,
        ...(o.description ? { description: o.description } : {}),
      })) ?? [];
    return [
      {
        question: q.question,
        header: q.header,
        options,
        ...(q.multiple === true ? { multiSelect: true } : {}),
      },
    ];
  });

  if (questions.length === 0) {
    return;
  }

  events.push({
    type: "permission_requested",
    provider: "opencode",
    request: {
      id: event.properties.id,
      provider: "opencode",
      name: "question",
      kind: "question",
      title: "Question",
      input: { questions },
      metadata: {
        source: "opencode_question",
        ...event.properties.tool,
      },
    },
  });
}

function appendOpenCodeSessionError(
  event: Extract<OpenCodeEvent, { type: "session.error" }>,
  state: OpenCodeEventTranslationState,
  events: AgentStreamEvent[],
): void {
  if (event.properties.sessionID !== state.sessionId) {
    return;
  }
  resetOpenCodeTurnTrackingState(state);
  const error = event.properties.error;
  if (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "MessageAbortedError"
  ) {
    events.push({
      type: "turn_canceled",
      provider: "opencode",
      reason: "interrupted",
    });
  } else {
    events.push({
      type: "turn_failed",
      provider: "opencode",
      error: toDiagnosticErrorMessage(error),
    });
  }
}

function appendOpenCodeSessionStatus(
  event: Extract<OpenCodeEvent, { type: "session.status" }>,
  state: OpenCodeEventTranslationState,
  events: AgentStreamEvent[],
): void {
  if (event.properties.sessionID !== state.sessionId) {
    return;
  }
  const { status } = event.properties;
  if (status.type === "idle") {
    resetOpenCodeTurnTrackingState(state);
    events.push({ type: "turn_completed", provider: "opencode", usage: undefined });
    return;
  }
  if (status.type === "retry") {
    // Mirror what opencode's TUI shows: retry attempts are visible activity, not
    // terminal. opencode itself never gives up — it backs off and tries again
    // forever. If we silently swallow these the user sees a spinner with no
    // explanation. Forwarding as a timeline error item is a no-op for old
    // clients (the schema already supports it).
    const message = typeof status.message === "string" ? status.message.trim() : "";
    const text = message
      ? `Provider retry (attempt ${status.attempt}): ${message}`
      : `Provider retry (attempt ${status.attempt})`;
    events.push({
      type: "timeline",
      provider: "opencode",
      item: { type: "error", message: text },
    });
    return;
  }
  // "busy" is transient — no terminal event, no surfaced activity.
}
