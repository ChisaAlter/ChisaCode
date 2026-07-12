import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { promises } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  type AgentDefinition,
  type CanUseTool,
  type McpServerConfig as ClaudeSdkMcpServerConfig,
  type PermissionMode,
  type PermissionResult,
  type PermissionUpdate,
  type Query,
  type SDKMessage,
  type SDKPartialAssistantMessage,
  type SDKTaskProgressMessage,
  type SDKResultMessage,
  type SDKSystemMessage,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type { Logger } from "pino";
import {
  mapClaudeCompletedToolCall,
  mapClaudeFailedToolCall,
  mapClaudeRunningToolCall,
} from "./tool-call-mapper.js";
import {
  mapTaskNotificationSystemRecordToToolCall,
  mapTaskNotificationUserContentToToolCall,
} from "./task-notification-tool-call.js";
import { getClaudeModelsWithSettings, normalizeClaudeRuntimeModelId } from "./models.js";
import { ClaudeSidechainTracker } from "./sidechain-tracker.js";
import { runClaudeSdkQueryPump } from "./sdk-pump.js";
import {
  ClaudeMessageRouter,
  type ClaudeAutonomousTurnState,
  type ClaudeTurnState,
} from "./message-router.js";
import { ClaudeTimelineAssembler } from "./timeline-assembler.js";
import { ClaudeToolCallHandler, type ClaudeToolUseCacheEntry } from "./tool-call-handlers.js";
import { buildClaudeFeatures, claudeModelSupportsFastMode } from "./feature-definitions.js";
import {
  convertClaudeHistoryEntry,
  isClaudeTranscriptNoiseText,
  isSyntheticHistoryUserEntry,
  isSyntheticUserEntry,
  isToolResultUserEntry,
  readCompactionMetadata,
  type ClaudeHistoryEntry,
} from "./history-converter.js";
import {
  buildBinaryDiagnosticRows,
  formatDiagnosticStatus,
  formatProviderDiagnostic,
  formatProviderDiagnosticError,
  toDiagnosticErrorMessage,
} from "../diagnostic-utils.js";
import { appendOrReplaceGrowingAssistantMessage, runProviderTurn } from "../provider-runner.js";
import { renderPromptAttachmentAsText } from "../../prompt-attachments.js";
import { claudeQuery, type ClaudeOptions, type ClaudeQueryFactory } from "./query.js";
import { realClaudeRewindSdk, revertClaudeConversation, revertClaudeFiles } from "./rewind.js";
import { normalizeProviderReplayTimestamp } from "../../provider-history-timestamps.js";

import {
  getAgentStreamEventTurnId,
  type AgentPermissionAction,
  type AgentCapabilityFlags,
  type AgentClient,
  type AgentCreateSessionOptions,
  type AgentFeature,
  type AgentLaunchContext,
  type AgentMetadata,
  type AgentMode,
  type AgentModelDefinition,
  type AgentPermissionRequest,
  type AgentPermissionRequestKind,
  type AgentPermissionResponse,
  type AgentPermissionUpdate,
  type AgentPersistenceHandle,
  type AgentPromptInput,
  type AgentRunOptions,
  type AgentRunResult,
  type AgentSession,
  type AgentSessionConfig,
  type AgentSlashCommand,
  type AgentStreamEvent,
  type AgentTimelineItem,
  type AgentUsage,
  type AgentRuntimeInfo,
  type ListModelsOptions,
  type ListPersistedAgentsOptions,
  type McpServerConfig,
  type PersistedAgentDescriptor,
} from "../../agent-sdk-types.js";
import {
  checkProviderLaunchAvailable,
  createProviderEnv,
  createProviderEnvSpec,
  resolveProviderLaunch,
  type ProviderRuntimeSettings,
  type ResolvedProviderLaunch,
} from "../../provider-launch-config.js";
import { withTimeout } from "../../../../utils/promise-timeout.js";
import { execCommand } from "../../../../utils/spawn.js";
import { composeSystemPromptParts } from "../../system-prompt.js";

export { convertClaudeHistoryEntry, extractUserMessageText } from "./history-converter.js";
export { readEventIdentifiers } from "./message-router.js";

const fsPromises = promises;
const CLAUDE_SETTING_SOURCES: NonNullable<ClaudeOptions["settingSources"]> = [
  "user",
  "project",
  "local",
];
const CLAUDE_GATEWAY_SETTING_SOURCES: NonNullable<ClaudeOptions["settingSources"]> = [
  "project",
  "local",
];
const CLAUDE_MODEL_SELECTION_ENV_KEYS = [
  "ANTHROPIC_MODEL",
  "ANTHROPIC_SMALL_FAST_MODEL",
  "ANTHROPIC_DEFAULT_OPUS_MODEL",
  "ANTHROPIC_DEFAULT_SONNET_MODEL",
  "ANTHROPIC_DEFAULT_HAIKU_MODEL",
];

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export function normalizeClaudeAskUserQuestionUpdatedInput(
  updatedInput: AgentMetadata | undefined,
  fallbackInput: AgentMetadata | undefined,
): AgentMetadata {
  const fallback = isMetadata(fallbackInput) ? fallbackInput : {};
  const base = isMetadata(updatedInput) ? updatedInput : {};
  // ChisaCode's shared question UI serializes answers by question header, but Claude's
  // AskUserQuestion tool expects answer keys to match the full question text. Merge
  // the original request payload back in so provider callbacks that only return
  // `{ answers }` still satisfy Claude's full tool input schema.
  const merged = { ...fallback, ...base };
  const questions =
    (Array.isArray(base.questions) ? base.questions : null) ??
    (Array.isArray(fallback.questions) ? fallback.questions : null);
  const answers = isMetadata(base.answers) ? base.answers : null;

  if (!questions || !answers) {
    return merged;
  }

  const normalizedAnswers: Record<string, string> = {};
  for (const item of questions) {
    const question = isMetadata(item) ? item : null;
    if (!question) {
      continue;
    }

    const questionText = readNonEmptyString(question.question);
    if (!questionText) {
      continue;
    }

    const header = readNonEmptyString(question.header);
    const answer =
      readNonEmptyString(answers[questionText]) ??
      (header ? readNonEmptyString(answers[header]) : null);
    if (answer) {
      normalizedAnswers[questionText] = answer;
    }
  }

  if (Object.keys(normalizedAnswers).length === 0) {
    return merged;
  }

  return {
    ...merged,
    answers: normalizedAnswers,
  };
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toObjectRecord(value: unknown): Record<string, unknown> | undefined {
  return isObjectRecord(value) ? value : undefined;
}

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function isImageMimeType(
  value: string,
): value is "image/jpeg" | "image/png" | "image/gif" | "image/webp" {
  return (
    value === "image/jpeg" ||
    value === "image/png" ||
    value === "image/gif" ||
    value === "image/webp"
  );
}

interface AsyncMessageInput<T> {
  push: (item: T) => void;
  end: () => void;
  iterable: AsyncIterable<T>;
}

interface PersistedTimelineEntry {
  item: AgentTimelineItem;
  timestamp?: string;
}

interface ClaudeRewindTurnAnchor {
  userMessageId: string;
  assistantMessageId: string | null;
}

type ClaudeConversationRewindTarget =
  | { kind: "fresh-session" }
  | { kind: "fork"; messageId: string };

const CLAUDE_CAPABILITIES: AgentCapabilityFlags = {
  supportsStreaming: true,
  supportsSessionPersistence: true,
  supportsDynamicModes: true,
  supportsMcpServers: true,
  supportsReasoningStream: true,
  supportsToolInvocations: true,
  supportsRewindConversation: true,
  supportsRewindFiles: true,
  supportsRewindBoth: true,
};

const DEFAULT_MODES: AgentMode[] = [
  {
    id: "default",
    label: "Always Ask",
    description: "Prompts for permission the first time a tool is used",
  },
  {
    id: "auto",
    label: "Auto mode",
    description: "Uses a model classifier to review permission prompts automatically",
  },
  {
    id: "acceptEdits",
    label: "Accept File Edits",
    description: "Automatically approves edit-focused tools without prompting",
  },
  {
    id: "plan",
    label: "Plan Mode",
    description: "Analyze the codebase without executing tools or edits",
  },
  {
    id: "bypassPermissions",
    label: "Bypass",
    description: "Skip all permission prompts (use with caution)",
  },
];

const VALID_CLAUDE_MODES = new Set(DEFAULT_MODES.map((mode) => mode.id));

const REWIND_COMMAND_NAME = "rewind";
const REWIND_COMMAND: AgentSlashCommand = {
  name: REWIND_COMMAND_NAME,
  description: "Rewind tracked files to a previous user message",
  argumentHint: "[user_message_uuid]",
};
const INTERRUPT_TOOL_USE_PLACEHOLDER = "[Request interrupted by user for tool use]";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface SlashCommandInvocation {
  commandName: string;
  args?: string;
  rawInput: string;
}

type ClaudeAgentConfig = AgentSessionConfig & { provider: "claude" };

export interface ClaudeContentChunk {
  type: string;
  [key: string]: unknown;
}

interface ClaudeAgentClientOptions {
  defaults?: { agents?: Record<string, AgentDefinition> };
  logger: Logger;
  runtimeSettings?: ProviderRuntimeSettings;
  queryFactory?: ClaudeQueryFactory;
  resolveBinary?: () => Promise<string>;
}

interface ClaudeAgentSessionOptions {
  defaults?: { agents?: Record<string, AgentDefinition> };
  runtimeSettings?: ProviderRuntimeSettings;
  handle?: AgentPersistenceHandle;
  agentId?: string;
  launchEnv?: Record<string, string>;
  persistSession?: boolean;
  logger: Logger;
  queryFactory?: ClaudeQueryFactory;
  resolveBinary: () => Promise<string>;
}

type ClaudeThinkingEffort = "low" | "medium" | "high" | "xhigh" | "max";
type ClaudeThinkingOption = ClaudeThinkingEffort | "ultracode";

function resolvePathEnvKey(): "Path" | "PATH" | null {
  if (process.env["Path"] !== undefined) return "Path";
  if (process.env["PATH"] !== undefined) return "PATH";
  return null;
}

function errorToMessageString(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "";
}

function extractSessionIdRaw(msg: {
  session_id?: unknown;
  sessionId?: unknown;
  session?: { id?: unknown } | null;
}): string {
  if (typeof msg.session_id === "string") return msg.session_id;
  if (typeof msg.sessionId === "string") return msg.sessionId;
  if (typeof msg.session?.id === "string") return msg.session.id;
  return "";
}

function isClaudeThinkingEffort(value: string | null | undefined): value is ClaudeThinkingEffort {
  return (
    value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "xhigh" ||
    value === "max"
  );
}
function isClaudeThinkingOption(value: string | null | undefined): value is ClaudeThinkingOption {
  return value === "ultracode" || isClaudeThinkingEffort(value);
}

function sanitizeClaudeProjectPath(cwd: string): string {
  return cwd.replace(/[\\/._:]/g, "-");
}

function resolveClaudeConfigDir(env: NodeJS.ProcessEnv): string {
  return env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), ".claude");
}

interface ClaudeOptionsLogSummary {
  cwd: string | null;
  permissionMode: string | null;
  model: string | null;
  includePartialMessages: boolean;
  settingSources: string[];
  enableFileCheckpointing: boolean;
  hasResume: boolean;
  maxThinkingTokens: number | null;
  hasEnv: boolean;
  envKeyCount: number;
  hasMcpServers: boolean;
  mcpServerNames: string[];
  systemPromptMode: "none" | "string" | "preset" | "custom";
  systemPromptPreset: string | null;
  hasCanUseTool: boolean;
  hasSpawnOverride: boolean;
  hasStderrHandler: boolean;
  pathToClaudeCodeExecutable: string | null;
  persistSession: boolean | null;
  fastMode: boolean | null;
}

const MAX_RECENT_STDERR_CHARS = 4000;
const STDERR_FLUSH_WAIT_MS = 150;
const STDERR_FLUSH_POLL_INTERVAL_MS = 10;

function summarizeClaudeOptionsForLog(options: ClaudeOptions): ClaudeOptionsLogSummary {
  const systemPromptRaw = options.systemPrompt;
  const systemPromptSummary = (() => {
    if (!systemPromptRaw) {
      return { mode: "none" as const, preset: null };
    }
    if (typeof systemPromptRaw === "string") {
      return { mode: "string" as const, preset: null };
    }
    const prompt = toObjectRecord(systemPromptRaw);
    const promptType = typeof prompt?.type === "string" ? prompt.type : "custom";
    return {
      mode: promptType === "preset" ? ("preset" as const) : ("custom" as const),
      preset: typeof prompt?.preset === "string" && prompt.preset.length > 0 ? prompt.preset : null,
    };
  })();
  const mcpServerNames = options.mcpServers ? Object.keys(options.mcpServers).sort() : [];

  return {
    cwd: typeof options.cwd === "string" ? options.cwd : null,
    permissionMode: typeof options.permissionMode === "string" ? options.permissionMode : null,
    model: typeof options.model === "string" ? options.model : null,
    includePartialMessages: options.includePartialMessages === true,
    settingSources: Array.isArray(options.settingSources) ? options.settingSources : [],
    enableFileCheckpointing: options.enableFileCheckpointing === true,
    hasResume: typeof options.resume === "string" && options.resume.length > 0,
    maxThinkingTokens:
      typeof options.maxThinkingTokens === "number" ? options.maxThinkingTokens : null,
    hasEnv: !!options.env,
    envKeyCount: Object.keys(options.env ?? {}).length,
    hasMcpServers: mcpServerNames.length > 0,
    mcpServerNames,
    systemPromptMode: systemPromptSummary.mode,
    systemPromptPreset: systemPromptSummary.preset,
    hasCanUseTool: typeof options.canUseTool === "function",
    hasSpawnOverride: typeof options.spawnClaudeCodeProcess === "function",
    hasStderrHandler: typeof options.stderr === "function",
    pathToClaudeCodeExecutable:
      typeof options.pathToClaudeCodeExecutable === "string"
        ? options.pathToClaudeCodeExecutable
        : null,
    persistSession: typeof options.persistSession === "boolean" ? options.persistSession : null,
    fastMode: readClaudeFastModeSetting(options.settings),
  };
}

function readClaudeFastModeSetting(settings: ClaudeOptions["settings"]): boolean | null {
  if (!settings || typeof settings === "string") {
    return null;
  }
  return typeof settings.fastMode === "boolean" ? settings.fastMode : null;
}

function mergeClaudeSettings(
  settings: ClaudeOptions["settings"],
  updates: NonNullable<Exclude<ClaudeOptions["settings"], string>>,
): ClaudeOptions["settings"] {
  if (!settings || typeof settings === "string") {
    return settings ?? updates;
  }
  const merged = { ...settings, ...updates };
  if (settings.env || updates.env) {
    merged.env = {
      ...settings.env,
      ...updates.env,
    };
  }
  return merged;
}

function readRuntimeSettingsEnv(
  runtimeSettings: ProviderRuntimeSettings | undefined,
): Record<string, string> | null {
  const entries = Object.entries(runtimeSettings?.env ?? {}).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  );
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

const CLAUDE_MODEL_GATEWAY_CARRIER_MODEL = "sonnet";

function buildModelGatewayOverrideBaseUrl(baseUrl: string, model: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    return null;
  }

  const normalizedPath = parsed.pathname.replace(/\/+$/u, "");
  const gatewayPathMatch = normalizedPath.match(/^(.*\/api\/model-gateways\/[^/]+)(?:\/v1)?$/u);
  if (!gatewayPathMatch?.[1]) {
    return null;
  }

  parsed.pathname = `${gatewayPathMatch[1]}/model-overrides/${encodeURIComponent(model)}`;
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/u, "");
}

function resolveClaudeModelGatewayOverride(input: {
  model: string | undefined;
  env: NodeJS.ProcessEnv;
}): { env: Record<string, string>; launchModel: string } | null {
  const selectedModel = input.model?.trim();
  const baseUrl = input.env["ANTHROPIC_BASE_URL"]?.trim();
  if (!selectedModel || !baseUrl) {
    return null;
  }

  const overrideBaseUrl = buildModelGatewayOverrideBaseUrl(baseUrl, selectedModel);
  if (!overrideBaseUrl) {
    return null;
  }

  const env: Record<string, string> = {
    ANTHROPIC_BASE_URL: overrideBaseUrl,
  };
  const token = input.env["ANTHROPIC_API_KEY"] ?? input.env["ANTHROPIC_AUTH_TOKEN"];
  if (token) {
    env.ANTHROPIC_API_KEY = token;
    env.ANTHROPIC_AUTH_TOKEN = token;
  }
  return { env, launchModel: CLAUDE_MODEL_GATEWAY_CARRIER_MODEL };
}

function removeClaudeModelSelectionEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const cleaned = { ...env };
  for (const key of CLAUDE_MODEL_SELECTION_ENV_KEYS) {
    delete cleaned[key];
  }
  return cleaned;
}

interface PendingPermission {
  request: AgentPermissionRequest;
  resolve: (result: PermissionResult) => void;
  reject: (error: Error) => void;
  cleanup?: () => void;
}

function isMetadata(value: unknown): value is AgentMetadata {
  return typeof value === "object" && value !== null;
}

function readTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isMcpServerConfig(value: unknown): value is McpServerConfig {
  if (!isMetadata(value)) {
    return false;
  }
  const type = value.type;
  if (type === "stdio") {
    return typeof value.command === "string";
  }
  if (type === "http" || type === "sse") {
    return typeof value.url === "string";
  }
  return false;
}

function isMcpServersRecord(value: unknown): value is Record<string, McpServerConfig> {
  if (!isMetadata(value)) {
    return false;
  }
  for (const config of Object.values(value)) {
    if (!isMcpServerConfig(config)) {
      return false;
    }
  }
  return true;
}

function isPermissionMode(value: string | undefined): value is PermissionMode {
  return typeof value === "string" && VALID_CLAUDE_MODES.has(value);
}

function isTruthyEnvValue(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return (
    normalized !== undefined &&
    normalized.length > 0 &&
    normalized !== "0" &&
    normalized !== "false" &&
    normalized !== "no" &&
    normalized !== "off"
  );
}

function detectIneligibleAutoModeTransport(env: NodeJS.ProcessEnv): "Bedrock" | "Vertex" | null {
  if (isTruthyEnvValue(env.CLAUDE_CODE_USE_BEDROCK)) {
    return "Bedrock";
  }
  if (isTruthyEnvValue(env.CLAUDE_CODE_USE_VERTEX)) {
    return "Vertex";
  }
  return null;
}

function assertClaudeAutoModeEligible(mode: PermissionMode, env: NodeJS.ProcessEnv): void {
  if (mode !== "auto") {
    return;
  }
  const transport = detectIneligibleAutoModeTransport(env);
  if (transport === null) {
    return;
  }
  throw new Error(
    `Claude Auto mode requires the Anthropic API and is not supported when Claude Code uses ${transport}. Select another permission mode or unset the ${transport === "Bedrock" ? "CLAUDE_CODE_USE_BEDROCK" : "CLAUDE_CODE_USE_VERTEX"} environment variable.`,
  );
}

function coerceSessionMetadata(metadata: AgentMetadata | undefined): Partial<AgentSessionConfig> {
  if (!isMetadata(metadata)) {
    return {};
  }

  const result: Partial<AgentSessionConfig> = {};
  if (metadata.provider === "claude" || metadata.provider === "codex") {
    result.provider = metadata.provider;
  }
  if (typeof metadata.cwd === "string") {
    result.cwd = metadata.cwd;
  }
  if (typeof metadata.modeId === "string") {
    result.modeId = metadata.modeId;
  }
  if (typeof metadata.model === "string") {
    result.model = metadata.model;
  }
  if (typeof metadata.title === "string" || metadata.title === null) {
    result.title = metadata.title;
  }
  if (typeof metadata.approvalPolicy === "string") {
    result.approvalPolicy = metadata.approvalPolicy;
  }
  if (typeof metadata.sandboxMode === "string") {
    result.sandboxMode = metadata.sandboxMode;
  }
  if (typeof metadata.networkAccess === "boolean") {
    result.networkAccess = metadata.networkAccess;
  }
  if (typeof metadata.webSearch === "boolean") {
    result.webSearch = metadata.webSearch;
  }
  if (isMetadata(metadata.extra)) {
    const extra: AgentSessionConfig["extra"] = {};
    if (isMetadata(metadata.extra.codex)) {
      extra.codex = metadata.extra.codex;
    }
    if (isClaudeExtra(metadata.extra.claude)) {
      extra.claude = metadata.extra.claude;
    }
    if (extra.codex || extra.claude) {
      result.extra = extra;
    }
  }
  if (typeof metadata.systemPrompt === "string") {
    result.systemPrompt = metadata.systemPrompt;
  }
  if (isMcpServersRecord(metadata.mcpServers)) {
    result.mcpServers = metadata.mcpServers;
  }

  return result;
}

function toClaudeSdkMcpConfig(config: McpServerConfig): ClaudeSdkMcpServerConfig {
  switch (config.type) {
    case "stdio":
      return {
        type: "stdio",
        command: config.command,
        args: config.args,
        env: config.env,
      };
    case "http":
      return {
        type: "http",
        url: config.url,
        headers: config.headers,
      };
    case "sse":
      return {
        type: "sse",
        url: config.url,
        headers: config.headers,
      };
  }
  throw new Error("Unhandled MCP server config type");
}

function isClaudeContentChunk(value: unknown): value is ClaudeContentChunk {
  return isMetadata(value) && typeof value.type === "string";
}

function isClaudeExtra(value: unknown): value is Partial<ClaudeOptions> {
  return isMetadata(value);
}

function isPermissionUpdate(value: AgentPermissionUpdate): value is PermissionUpdate {
  if (!isMetadata(value)) {
    return false;
  }
  const type = value.type;
  if (type !== "addRules" && type !== "replaceRules" && type !== "removeRules") {
    return false;
  }
  const rules = value.rules;
  const behavior = value.behavior;
  const destination = value.destination;
  return Array.isArray(rules) && typeof behavior === "string" && typeof destination === "string";
}

function resolvePermissionKind(
  toolName: string,
  input: Record<string, unknown>,
): AgentPermissionRequestKind {
  if (toolName === "ExitPlanMode") return "plan";
  if (toolName === "AskUserQuestion" && Array.isArray(input.questions)) {
    return "question";
  }
  return "tool";
}

function getClaudeModeLabel(modeId: PermissionMode): string {
  return DEFAULT_MODES.find((mode) => mode.id === modeId)?.label ?? modeId;
}

function buildClaudePlanPermissionActions(
  resumeMode: PermissionMode | null,
): AgentPermissionAction[] {
  const actions: AgentPermissionAction[] = [
    {
      id: "reject",
      label: "Reject",
      behavior: "deny",
      variant: "danger",
      intent: "dismiss",
    },
    {
      id: "implement",
      label: "Implement",
      behavior: "allow",
      variant: "primary",
      intent: "implement",
    },
  ];

  if (resumeMode === "bypassPermissions") {
    actions.push({
      id: "implement_resume",
      label: `Implement with ${getClaudeModeLabel(resumeMode)}`,
      behavior: "allow",
      variant: "secondary",
      intent: "implement_resume",
    });
  }

  return actions;
}

export class ClaudeAgentClient implements AgentClient {
  readonly provider = "claude" as const;
  readonly capabilities = CLAUDE_CAPABILITIES;

  private readonly defaults?: { agents?: Record<string, AgentDefinition> };
  private readonly logger: Logger;
  private readonly runtimeSettings?: ProviderRuntimeSettings;
  private readonly queryFactory?: ClaudeQueryFactory;
  private readonly resolveBinary: () => Promise<string>;

  constructor(options: ClaudeAgentClientOptions) {
    this.defaults = options.defaults;
    this.logger = options.logger.child({ module: "agent", provider: "claude" });
    this.runtimeSettings = options.runtimeSettings;
    this.queryFactory = options.queryFactory;
    this.resolveBinary = options.resolveBinary ?? (() => resolveClaudeBinary(this.runtimeSettings));
  }

  async createSession(
    config: AgentSessionConfig,
    launchContext?: AgentLaunchContext,
    options?: AgentCreateSessionOptions,
  ): Promise<AgentSession> {
    const claudeConfig = this.assertConfig(config);
    return new ClaudeAgentSession(claudeConfig, {
      defaults: this.defaults,
      runtimeSettings: this.runtimeSettings,
      agentId: launchContext?.agentId,
      launchEnv: launchContext?.env,
      persistSession: options?.persistSession,
      logger: this.logger,
      queryFactory: this.queryFactory,
      resolveBinary: this.resolveBinary,
    });
  }

  async resumeSession(
    handle: AgentPersistenceHandle,
    overrides?: Partial<AgentSessionConfig>,
    launchContext?: AgentLaunchContext,
  ): Promise<AgentSession> {
    const metadata = coerceSessionMetadata(handle.metadata);
    const merged: Partial<AgentSessionConfig> = { ...metadata, ...overrides };
    if (!merged.cwd) {
      throw new Error("Claude resume requires the original working directory in metadata");
    }
    const mergedConfig: AgentSessionConfig = {
      ...merged,
      provider: "claude",
      cwd: merged.cwd,
    };
    const claudeConfig = this.assertConfig(mergedConfig);
    return new ClaudeAgentSession(claudeConfig, {
      defaults: this.defaults,
      runtimeSettings: this.runtimeSettings,
      handle,
      agentId: launchContext?.agentId,
      launchEnv: launchContext?.env,
      logger: this.logger,
      queryFactory: this.queryFactory,
      resolveBinary: this.resolveBinary,
    });
  }

  async listModels(_options: ListModelsOptions): Promise<AgentModelDefinition[]> {
    // Claude exposes a global catalog here; cwd/force are intentionally irrelevant.
    return await getClaudeModelsWithSettings(this.logger);
  }

  async listFeatures(config: AgentSessionConfig): Promise<AgentFeature[]> {
    const claudeConfig = this.assertConfig(config);
    return buildClaudeFeatures({
      modelId: claudeConfig.model,
      fastModeEnabled: claudeConfig.featureValues?.fast_mode === true,
    });
  }

  async listPersistedAgents(
    options?: ListPersistedAgentsOptions,
  ): Promise<PersistedAgentDescriptor[]> {
    const env = createProviderEnv({ baseEnv: process.env, runtimeSettings: this.runtimeSettings });
    const configDir = resolveClaudeConfigDir(env);
    const projectsRoot = path.join(configDir, "projects");
    if (!(await pathExists(projectsRoot))) {
      return [];
    }
    const limit = options?.limit ?? 20;
    const candidates = await collectRecentClaudeSessions(projectsRoot, limit * 3);
    const parsed = await Promise.all(
      candidates.map((candidate) => parseClaudeSessionDescriptor(candidate.path, candidate.mtime)),
    );
    return parsed
      .filter((descriptor): descriptor is PersistedAgentDescriptor => descriptor !== null)
      .slice(0, limit);
  }

  async isAvailable(): Promise<boolean> {
    const launch = await resolveProviderLaunch({
      commandConfig: this.runtimeSettings?.command,
      defaultBinary: "claude",
    });
    const availability = await checkProviderLaunchAvailable(launch);
    return availability.available;
  }

  async getDiagnostic(): Promise<{ diagnostic: string }> {
    try {
      const launch = await resolveProviderLaunch({
        commandConfig: this.runtimeSettings?.command,
        defaultBinary: "claude",
      });
      const availability = await checkProviderLaunchAvailable(launch);
      const available = availability.available;
      const auth = available
        ? await resolveClaudeAuth(launch, availability, this.runtimeSettings)
        : null;
      let modelsValue = "Not checked";
      let status = formatDiagnosticStatus(available);

      if (available) {
        try {
          const models = await this.listModels({
            cwd: os.homedir(),
            force: false,
          });
          modelsValue = String(models.length);
        } catch (error) {
          modelsValue = `Error - ${toDiagnosticErrorMessage(error)}`;
          status = formatDiagnosticStatus(available, {
            source: "model fetch",
            cause: error,
          });
        }
      }

      return {
        diagnostic: formatProviderDiagnostic("Claude Code", [
          ...(await buildBinaryDiagnosticRows(launch, availability)),
          ...(auth ? [{ label: "Auth", value: auth }] : []),
          { label: "Models", value: modelsValue },
          { label: "Status", value: status },
        ]),
      };
    } catch (error) {
      return {
        diagnostic: formatProviderDiagnosticError("Claude Code", error),
      };
    }
  }

  private assertConfig(config: AgentSessionConfig): ClaudeAgentConfig {
    if (config.provider !== "claude") {
      throw new Error(`ClaudeAgentClient received config for provider '${config.provider}'`);
    }
    return { ...config, provider: "claude" } as ClaudeAgentConfig;
  }
}

async function resolveClaudeBinary(runtimeSettings?: ProviderRuntimeSettings): Promise<string> {
  const launch = await resolveProviderLaunch({
    commandConfig: runtimeSettings?.command,
    defaultBinary: "claude",
  });
  const availability = await checkProviderLaunchAvailable(launch);
  if (availability.available) {
    return availability.resolvedPath ?? launch.command;
  }
  throw new Error(
    "Claude binary not found. Install Claude Code (https://github.com/anthropics/claude-code) and ensure it is available in your shell PATH.",
  );
}

async function resolveClaudeAuth(
  launch: ResolvedProviderLaunch,
  availability: { resolvedPath: string | null },
  runtimeSettings?: ProviderRuntimeSettings,
): Promise<string | null> {
  const run = async (
    executable: string,
    args: string[],
  ): Promise<{ stdout: string; stderr: string }> => {
    try {
      return await execCommand(executable, args, {
        ...createProviderEnvSpec({ runtimeSettings }),
        timeout: 5_000,
      });
    } catch (error) {
      const err = toObjectRecord(error);
      const stdout = typeof err?.stdout === "string" ? err.stdout : "";
      const stderr = typeof err?.stderr === "string" ? err.stderr : "";
      const fallbackMessage = typeof err?.message === "string" ? err.message : "";
      return { stdout, stderr: stderr || fallbackMessage };
    }
  };

  try {
    const executable = availability.resolvedPath ?? launch.command;
    const result = await run(executable, [...launch.args, "auth", "status"]);

    const combined = [result.stdout, result.stderr]
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .join("\n");
    return combined || null;
  } catch {
    return null;
  }
}

function extractContextWindowSize(modelUsage: unknown): number | undefined {
  const usageRecord = toObjectRecord(modelUsage);
  if (!usageRecord) {
    return undefined;
  }

  let maxContextWindow: number | undefined;
  for (const value of Object.values(usageRecord)) {
    const valueRecord = toObjectRecord(value);
    if (!valueRecord) {
      continue;
    }
    const contextWindow = valueRecord.contextWindow;
    if (
      typeof contextWindow !== "number" ||
      !Number.isFinite(contextWindow) ||
      contextWindow <= 0
    ) {
      continue;
    }
    maxContextWindow = Math.max(maxContextWindow ?? 0, contextWindow);
  }

  return maxContextWindow;
}

function readUsageTotalTokens(usage: unknown): number | undefined {
  if (!usage || typeof usage !== "object") {
    return undefined;
  }
  const totalTokens = (usage as { total_tokens?: unknown }).total_tokens;
  if (typeof totalTokens !== "number" || !Number.isFinite(totalTokens) || totalTokens < 0) {
    return undefined;
  }
  return totalTokens;
}

function readContextWindowUsedTokensFromTaskProgress(
  message: SDKTaskProgressMessage,
): number | undefined {
  return readUsageTotalTokens(message.usage);
}

function readUsageFromTaskNotification(message: { usage?: unknown }): number | undefined {
  return readUsageTotalTokens(message.usage);
}

function readStreamRequestInputTokens(event: Record<string, unknown>): number | undefined {
  const messageUsage = toObjectRecord(toObjectRecord(event.message)?.usage);
  if (!messageUsage) {
    return undefined;
  }
  const usage = messageUsage;
  const inputTokens =
    typeof usage.input_tokens === "number" && Number.isFinite(usage.input_tokens)
      ? usage.input_tokens
      : undefined;
  const cacheCreationInputTokens =
    typeof usage.cache_creation_input_tokens === "number" &&
    Number.isFinite(usage.cache_creation_input_tokens)
      ? usage.cache_creation_input_tokens
      : 0;
  const cacheReadInputTokens =
    typeof usage.cache_read_input_tokens === "number" &&
    Number.isFinite(usage.cache_read_input_tokens)
      ? usage.cache_read_input_tokens
      : 0;
  if (typeof inputTokens !== "number" || inputTokens < 0) {
    return undefined;
  }
  return inputTokens + cacheCreationInputTokens + cacheReadInputTokens;
}

function readStreamRequestOutputTokens(event: Record<string, unknown>): number | undefined {
  const outputTokens = toObjectRecord(event.usage)?.output_tokens;
  if (typeof outputTokens !== "number" || !Number.isFinite(outputTokens) || outputTokens < 0) {
    return undefined;
  }
  return outputTokens;
}

class ClaudeAgentSession implements AgentSession {
  readonly provider = "claude" as const;
  readonly capabilities = CLAUDE_CAPABILITIES;

  private readonly config: ClaudeAgentConfig;
  private readonly launchEnv?: Record<string, string>;
  private readonly agentId?: string;
  private readonly defaults?: { agents?: Record<string, AgentDefinition> };
  private readonly runtimeSettings?: ProviderRuntimeSettings;
  private readonly persistSession?: boolean;
  private readonly logger: Logger;
  private readonly queryFactory?: ClaudeQueryFactory;
  private readonly resolveBinary: () => Promise<string>;
  private query: Query | null = null;
  private input: AsyncMessageInput<SDKUserMessage> | null = null;
  private claudeSessionId: string | null;
  private persistence: AgentPersistenceHandle | null;
  private currentMode: PermissionMode;
  private planResumeMode: PermissionMode | null = null;
  private availableModes: AgentMode[] = DEFAULT_MODES;
  private pendingPermissions = new Map<string, PendingPermission>();
  private readonly subscribers = new Set<(event: AgentStreamEvent) => void>();
  private readonly timelineAssembler = new ClaudeTimelineAssembler({
    shouldSuppressAssistantText: (text) =>
      text === INTERRUPT_TOOL_USE_PLACEHOLDER || isClaudeTranscriptNoiseText(text),
  });
  private readonly messageRouter: ClaudeMessageRouter;
  private readonly toolCallHandler: ClaudeToolCallHandler;
  private readonly sidechainTracker: ClaudeSidechainTracker;
  private persistedHistory: PersistedTimelineEntry[] = [];
  private historyPending = false;
  private cachedRuntimeInfo: AgentRuntimeInfo | null = null;
  private lastOptionsModel: string | null = null;
  private lastRuntimeModel: string | null = null;
  private modelGatewayOverrideActive = false;
  private compacting = false;
  private queryPumpPromise: Promise<void> | null = null;
  private queryRestartNeeded = false;
  private lastContextWindowUsedTokens: number | undefined;
  private lastContextWindowMaxTokens: number | undefined;
  private lastStreamRequestInputTokens: number | undefined;
  private lastStreamRequestOutputTokens: number | undefined;
  private userMessageIds: string[] = [];
  private readonly emittedUserMessageIds = new Set<string>();
  private readonly rewindTurnAnchors: ClaudeRewindTurnAnchor[] = [];
  private pendingFreshSessionId: string | null = null;
  private recentStderr = "";
  private closed = false;

  constructor(config: ClaudeAgentConfig, options: ClaudeAgentSessionOptions) {
    this.config = config;
    this.launchEnv = options.launchEnv;
    this.agentId = options.agentId;
    this.defaults = options.defaults;
    this.runtimeSettings = options.runtimeSettings;
    this.persistSession = options.persistSession;
    this.logger = options.logger.child({ agentId: this.agentId });
    this.toolCallHandler = new ClaudeToolCallHandler({
      getCwd: () => this.config.cwd,
      emitTimeline: (item) => this.enqueueTimeline(item),
      deleteSidechain: (toolUseId) => this.sidechainTracker.delete(toolUseId),
      clearSidechains: () => this.sidechainTracker.clear(),
    });
    this.sidechainTracker = new ClaudeSidechainTracker({
      getToolInput: (toolUseId) => this.toolCallHandler.getToolInput(toolUseId),
    });
    this.messageRouter = new ClaudeMessageRouter({
      logger: this.logger,
      getTraceContext: () => ({
        agentId: this.agentId,
        provider: "claude",
        sessionId: this.claudeSessionId,
      }),
      notifySubscribers: (event) => this.notifySubscribers(event),
      flushPendingToolCalls: () => this.flushPendingToolCalls(),
      buildTurnFailedEvent: (errorMessage) => this.buildTurnFailedEvent(errorMessage),
      rememberTranscriptProgress: (message, messageId) =>
        this.rememberTranscriptProgress(message, messageId),
      translateMessageToEvents: (message, routeOptions) =>
        this.translateMessageToEvents(message, routeOptions),
      assembleTimelineItems: (input) => this.timelineAssembler.consume(input),
    });
    this.queryFactory = options.queryFactory;
    this.resolveBinary = options.resolveBinary;
    const handle = options.handle;

    if (handle) {
      if (!handle.sessionId) {
        throw new Error("Cannot resume: persistence handle has no sessionId");
      }
      this.claudeSessionId = handle.sessionId;
      this.persistence = handle;
      this.loadPersistedHistory(handle.sessionId);
    } else {
      this.claudeSessionId = null;
      this.persistence = null;
    }

    // Validate mode if provided
    if (config.modeId && !VALID_CLAUDE_MODES.has(config.modeId)) {
      const validModesList = Array.from(VALID_CLAUDE_MODES).join(", ");
      throw new Error(
        `Invalid mode '${config.modeId}' for Claude provider. Valid modes: ${validModesList}`,
      );
    }

    this.currentMode = isPermissionMode(config.modeId) ? config.modeId : "default";
    if (this.currentMode !== "plan") {
      this.planResumeMode = this.currentMode;
    }
  }

  // Compatibility surface for focused tool-stream regression tests.
  get toolUseCache(): ReadonlyMap<string, { input?: AgentMetadata | null }> {
    return this.toolCallHandler.getToolUseCache();
  }

  get toolUseIndexToId(): ReadonlyMap<number, string> {
    return this.toolCallHandler.getToolUseIndexToId();
  }

  get toolUseInputBuffers(): ReadonlyMap<string, string> {
    return this.toolCallHandler.getToolUseInputBuffers();
  }

  buildToolOutput(
    block: ClaudeContentChunk,
    entry: ClaudeToolUseCacheEntry | undefined,
  ): AgentMetadata | undefined {
    return this.toolCallHandler.buildToolOutput(block, entry);
  }

  private get activeForegroundTurnId(): string | null {
    return this.messageRouter.getActiveForegroundTurnId();
  }

  private set activeForegroundTurnId(turnId: string | null) {
    this.messageRouter.setActiveForegroundTurnId(turnId);
  }

  private get autonomousTurn(): ClaudeAutonomousTurnState | null {
    return this.messageRouter.getAutonomousTurn();
  }

  private set autonomousTurn(turn: ClaudeAutonomousTurnState | null) {
    this.messageRouter.setAutonomousTurn(turn);
  }

  private get turnState(): ClaudeTurnState {
    return this.messageRouter.getTurnState();
  }

  private set turnState(turnState: ClaudeTurnState) {
    this.messageRouter.setTurnState(turnState);
  }

  // Compatibility surface for focused routing regression tests.
  get nextTurnOrdinal(): number {
    return this.messageRouter.getNextTurnOrdinal();
  }

  set nextTurnOrdinal(ordinal: number) {
    this.messageRouter.setNextTurnOrdinal(ordinal);
  }

  private get cancelCurrentTurn(): (() => void) | null {
    return this.messageRouter.getCancelCurrentTurn();
  }

  private set cancelCurrentTurn(cancel: (() => void) | null) {
    this.messageRouter.setCancelCurrentTurn(cancel);
  }

  private get pendingInterruptAbort(): boolean {
    return this.messageRouter.isPendingInterruptAbort();
  }

  private set pendingInterruptAbort(pending: boolean) {
    this.messageRouter.setPendingInterruptAbort(pending);
  }

  private get foregroundHasVisibleActivity(): boolean {
    return this.messageRouter.hasForegroundVisibleActivity();
  }

  private set foregroundHasVisibleActivity(visible: boolean) {
    this.messageRouter.setForegroundVisibleActivity(visible);
  }

  private get activeTurnHasAssistantText(): boolean {
    return this.messageRouter.hasActiveTurnAssistantText();
  }

  private set activeTurnHasAssistantText(hasText: boolean) {
    this.messageRouter.setActiveTurnAssistantText(hasText);
  }

  get id(): string | null {
    return this.claudeSessionId;
  }

  get features(): AgentFeature[] {
    return buildClaudeFeatures({
      modelId: this.config.model,
      fastModeEnabled: this.config.featureValues?.fast_mode === true,
    });
  }

  async getRuntimeInfo(): Promise<AgentRuntimeInfo> {
    if (this.cachedRuntimeInfo) {
      return { ...this.cachedRuntimeInfo };
    }
    const info: AgentRuntimeInfo = {
      provider: "claude",
      sessionId: this.claudeSessionId,
      model: this.lastOptionsModel,
      modeId: this.currentMode ?? null,
      ...(this.lastRuntimeModel
        ? {
            extra: {
              runtimeModel: this.lastRuntimeModel,
            },
          }
        : {}),
    };
    this.cachedRuntimeInfo = info;
    return { ...info };
  }

  async run(prompt: AgentPromptInput, options?: AgentRunOptions): Promise<AgentRunResult> {
    const result = await runProviderTurn({
      prompt,
      runOptions: options,
      startTurn: (p, o) => this.startTurn(p, o),
      subscribe: (callback) => this.subscribe(callback),
      getSessionId: () => this.claudeSessionId ?? "",
      reduceFinalText: appendOrReplaceGrowingAssistantMessage,
    });

    this.cachedRuntimeInfo = {
      provider: "claude",
      sessionId: this.claudeSessionId,
      model: this.lastOptionsModel,
      modeId: this.currentMode ?? null,
    };

    if (!this.claudeSessionId) {
      throw new Error("Session ID not set after run completed");
    }

    return result;
  }

  async startTurn(
    prompt: AgentPromptInput,
    _options?: AgentRunOptions,
  ): Promise<{ turnId: string }> {
    if (this.closed) {
      throw new Error("Claude session is closed");
    }
    if (this.activeForegroundTurnId) {
      throw new Error("A foreground turn is already active");
    }

    const slashCommand = this.resolveSlashCommandInvocation(prompt);
    if (slashCommand?.commandName === REWIND_COMMAND_NAME) {
      const turnId = this.createTurnId("foreground");
      this.activeForegroundTurnId = turnId;
      this.transitionTurnState("foreground", "rewind command");
      void this.executeRewindTurn(turnId, slashCommand);
      return { turnId };
    }

    if (this.autonomousTurn) {
      this.completeAutonomousTurn();
    }

    const sdkMessage = this.toSdkUserMessage(prompt);
    const sdkUserMessageId =
      typeof sdkMessage.uuid === "string" && sdkMessage.uuid.length > 0 ? sdkMessage.uuid : null;
    this.rememberRewindUserAnchor(sdkUserMessageId);
    const turnId = this.createTurnId("foreground");
    this.activeForegroundTurnId = turnId;
    this.foregroundHasVisibleActivity = false;
    this.activeTurnHasAssistantText = false;
    this.transitionTurnState("foreground", "foreground turn started");
    this.clearRecentStderr();

    let cancelIssued = false;
    const requestCancel = () => {
      if (cancelIssued) {
        return;
      }
      cancelIssued = true;
      if (this.cancelCurrentTurn === requestCancel) {
        this.cancelCurrentTurn = null;
      }
      this.rejectAllPendingPermissions(new Error("Permission request aborted"));
      this.finishForegroundTurn({
        type: "turn_canceled",
        provider: "claude",
        reason: "Interrupted",
      });
      void this.interruptActiveTurn().catch((error) => {
        this.logger.warn({ err: error }, "Failed to interrupt during cancel");
      });
    };
    this.cancelCurrentTurn = requestCancel;

    this.notifySubscribers({ type: "turn_started", provider: "claude" });

    try {
      await this.ensureQuery();
      if (!this.input) {
        throw new Error("Claude session input stream not initialized");
      }
      this.startQueryPump();
      this.input.push(sdkMessage);
      setTimeout(() => {
        if (this.activeForegroundTurnId === turnId) {
          this.emitSubmittedUserMessage(sdkMessage, turnId);
        }
      }, 0);
    } catch (error) {
      this.finishForegroundTurn(
        this.buildTurnFailedEvent(error instanceof Error ? error.message : "Claude stream failed"),
      );
    }

    return { turnId };
  }

  subscribe(callback: (event: AgentStreamEvent) => void): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  async interrupt(): Promise<void> {
    if (this.cancelCurrentTurn) {
      this.cancelCurrentTurn();
      return;
    }

    if (this.autonomousTurn) {
      this.flushPendingToolCalls();
      this.completeAutonomousTurn();
    }

    await this.interruptActiveTurn();
  }

  async *streamHistory(): AsyncGenerator<AgentStreamEvent> {
    if (!this.historyPending || this.persistedHistory.length === 0) {
      return;
    }
    const history = this.persistedHistory;
    this.persistedHistory = [];
    this.historyPending = false;
    for (const entry of history) {
      yield {
        type: "timeline",
        item: entry.item,
        provider: "claude",
        timestamp: entry.timestamp,
      };
    }
  }

  async getAvailableModes(): Promise<AgentMode[]> {
    return this.availableModes;
  }

  async getCurrentMode(): Promise<string | null> {
    return this.currentMode ?? null;
  }

  async setMode(modeId: string): Promise<void> {
    // Validate mode
    if (!VALID_CLAUDE_MODES.has(modeId)) {
      const validModesList = Array.from(VALID_CLAUDE_MODES).join(", ");
      throw new Error(
        `Invalid mode '${modeId}' for Claude provider. Valid modes: ${validModesList}`,
      );
    }

    const normalized = isPermissionMode(modeId) ? modeId : "default";
    assertClaudeAutoModeEligible(normalized, this.buildSdkEnv(this.config.extra?.claude));
    const previousMode = this.currentMode;
    const activeQuery = await this.ensureQuery();
    await activeQuery.setPermissionMode(normalized);
    if (normalized === "plan") {
      if (previousMode !== "plan") {
        this.planResumeMode = previousMode;
      }
    } else {
      this.planResumeMode = normalized;
    }
    this.currentMode = normalized;
  }

  async setModel(modelId: string | null): Promise<void> {
    const normalizedModelId =
      typeof modelId === "string" && modelId.trim().length > 0 ? modelId : null;
    const activeQuery = await this.ensureQuery();
    await activeQuery.setModel(normalizedModelId ?? undefined);
    this.config.model = normalizedModelId ?? undefined;
    if (!claudeModelSupportsFastMode(this.config.model) && this.config.featureValues?.fast_mode) {
      await this.applyFastModeFeature(false, activeQuery);
    }
    this.lastOptionsModel = normalizedModelId ?? this.lastOptionsModel;
    this.lastRuntimeModel = null;
    this.cachedRuntimeInfo = null;
    // Model change affects persistence metadata, so invalidate cached handle.
    this.persistence = null;
  }

  async setThinkingOption(thinkingOptionId: string | null): Promise<void> {
    const normalizedThinkingOptionId =
      typeof thinkingOptionId === "string" && thinkingOptionId.trim().length > 0
        ? thinkingOptionId
        : null;

    if (!normalizedThinkingOptionId || normalizedThinkingOptionId === "default") {
      this.config.thinkingOptionId = undefined;
    } else if (isClaudeThinkingOption(normalizedThinkingOptionId)) {
      this.config.thinkingOptionId = normalizedThinkingOptionId;
    } else {
      throw new Error(`Unknown thinking option: ${normalizedThinkingOptionId}`);
    }
    this.queryRestartNeeded = true;
  }

  async setFeature(featureId: string, value: unknown): Promise<void> {
    if (featureId !== "fast_mode") {
      throw new Error(`Unknown Claude feature: ${featureId}`);
    }

    const enabled = Boolean(value);
    if (enabled && !claudeModelSupportsFastMode(this.config.model)) {
      throw new Error(
        `Claude fast mode is not available for model '${this.config.model ?? "default"}'`,
      );
    }

    await this.applyFastModeFeature(enabled);
  }

  private async applyFastModeFeature(enabled: boolean, query?: Query): Promise<void> {
    this.config.featureValues = {
      ...this.config.featureValues,
      fast_mode: enabled,
    };
    const activeQuery = query ?? this.query;
    if (activeQuery) {
      await activeQuery.applyFlagSettings({ fastMode: enabled });
    }
    this.cachedRuntimeInfo = null;
  }

  getPendingPermissions(): AgentPermissionRequest[] {
    return Array.from(this.pendingPermissions.values()).map((entry) => entry.request);
  }

  async respondToPermission(requestId: string, response: AgentPermissionResponse): Promise<void> {
    const pending = this.pendingPermissions.get(requestId);
    if (!pending) {
      throw new Error(`No pending permission request with id '${requestId}'`);
    }
    this.pendingPermissions.delete(requestId);
    pending.cleanup?.();

    if (response.behavior === "allow") {
      if (pending.request.kind === "plan") {
        const selectedActionId = response.selectedActionId;
        const shouldResumePriorMode =
          selectedActionId === "implement_resume" && this.planResumeMode === "bypassPermissions";
        const targetMode: PermissionMode = shouldResumePriorMode
          ? "bypassPermissions"
          : "acceptEdits";
        await this.setMode(targetMode);
        this.pushToolCall(
          mapClaudeCompletedToolCall({
            name: "plan_approval",
            callId: pending.request.id,
            input: pending.request.input ?? null,
            output: {
              approved: true,
              actionId: selectedActionId ?? "implement",
            },
          }),
        );
      }
      const updatedInput =
        pending.request.kind === "question"
          ? normalizeClaudeAskUserQuestionUpdatedInput(
              response.updatedInput,
              pending.request.input ?? undefined,
            )
          : (response.updatedInput ?? pending.request.input ?? {});
      const result: PermissionResult = {
        behavior: "allow",
        updatedInput,
        updatedPermissions: this.normalizePermissionUpdates(response.updatedPermissions),
      };
      pending.resolve(result);
    } else {
      if (pending.request.kind === "tool") {
        this.pushToolCall(
          mapClaudeFailedToolCall({
            name: pending.request.name,
            callId:
              (typeof pending.request.metadata?.toolUseId === "string"
                ? pending.request.metadata.toolUseId
                : null) ?? pending.request.id,
            input: pending.request.input ?? null,
            output: null,
            error: { message: response.message ?? "Permission denied" },
          }),
        );
      }
      const result: PermissionResult = {
        behavior: "deny",
        message: response.message ?? "Permission request denied",
        interrupt: response.interrupt,
      };
      pending.resolve(result);
    }

    this.pushEvent({
      type: "permission_resolved",
      provider: "claude",
      requestId,
      resolution: response,
    });
  }

  describePersistence(): AgentPersistenceHandle | null {
    if (this.persistence) {
      return this.persistence;
    }
    if (!this.claudeSessionId) {
      return null;
    }
    this.persistence = {
      provider: "claude",
      sessionId: this.claudeSessionId,
      nativeHandle: this.claudeSessionId,
      metadata: { ...this.config },
    };
    return this.persistence;
  }

  async close(): Promise<void> {
    this.logger.trace(
      {
        agentId: this.agentId,
        provider: "claude",
        sessionId: this.claudeSessionId,
        turnId: this.activeForegroundTurnId ?? this.autonomousTurn?.id ?? undefined,
        turnState: this.turnState,
        hasQuery: Boolean(this.query),
        hasInput: Boolean(this.input),
        hasActiveForegroundTurnId: Boolean(this.activeForegroundTurnId),
      },
      "provider.claude.session_close.start",
    );
    this.closed = true;
    this.rejectAllPendingPermissions(new Error("Claude session closed"));
    this.cancelCurrentTurn?.();
    this.subscribers.clear();
    this.activeForegroundTurnId = null;
    this.autonomousTurn = null;
    this.cancelCurrentTurn = null;
    this.turnState = "idle";
    this.sidechainTracker.clear();
    this.input?.end();
    this.query?.close?.();
    await this.awaitWithTimeout(this.query?.interrupt?.(), "close query interrupt");
    await this.awaitWithTimeout(this.query?.return?.(), "close query return");
    this.query = null;
    this.input = null;
    if (this.persistSession === false && this.claudeSessionId) {
      // Claude Code currently ignores --no-session-persistence outside --print mode
      // (see `claude --help`), so the SDK's persistSession=false is silently dropped
      // in stream-json mode. Sweep the transcript ourselves so ephemeral runs
      // (metadata generator, branch-name generator) don't show up as resumable.
      const historyPath = this.resolveHistoryPath(this.claudeSessionId);
      if (historyPath) {
        try {
          await promises.rm(historyPath, { force: true });
        } catch (error) {
          this.logger.warn(
            { err: error, historyPath, claudeSessionId: this.claudeSessionId },
            "Failed to delete ephemeral Claude session transcript",
          );
        }
      }
    }
    this.logger.trace(
      {
        agentId: this.agentId,
        provider: "claude",
        sessionId: this.claudeSessionId,
        turnState: this.turnState,
      },
      "provider.claude.session_close.complete",
    );
  }

  async listCommands(): Promise<AgentSlashCommand[]> {
    const q = await this.ensureQuery();
    const commands = await q.supportedCommands();
    const commandMap = new Map<string, AgentSlashCommand>();
    for (const cmd of commands) {
      if (!commandMap.has(cmd.name)) {
        commandMap.set(cmd.name, {
          name: cmd.name,
          description: cmd.description,
          argumentHint: cmd.argumentHint,
        });
      }
    }
    if (!commandMap.has(REWIND_COMMAND_NAME)) {
      commandMap.set(REWIND_COMMAND_NAME, REWIND_COMMAND);
    }
    return Array.from(commandMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  async revertConversation(input: { messageId: string }): Promise<void> {
    const target = this.resolveConversationRewindTarget(input.messageId);
    if (target.kind === "fresh-session") {
      this.startFreshConversationSession();
      return;
    }
    await revertClaudeConversation({
      sdk: realClaudeRewindSdk,
      sessionId: this.claudeSessionId,
      messageId: target.messageId,
      resolveMessageId: (messageId) => this.resolveClaudeMessageId(messageId),
      setSessionId: (sessionId) => {
        this.rebindConversationSession(sessionId);
      },
    });
  }

  async revertFiles(input: { messageId: string }): Promise<void> {
    const messageId = await this.resolveClaudeMessageId(input.messageId);
    await revertClaudeFiles({
      query: await this.ensureQuery(),
      messageId,
    });
  }

  async revertBoth(input: { messageId: string }): Promise<void> {
    await this.revertFiles(input);
    await this.revertConversation(input);
  }

  private resolveSlashCommandInvocation(prompt: AgentPromptInput): SlashCommandInvocation | null {
    if (typeof prompt !== "string") {
      return null;
    }
    const parsed = this.parseSlashCommandInput(prompt);
    if (!parsed) {
      return null;
    }
    return parsed.commandName === REWIND_COMMAND_NAME ? parsed : null;
  }

  private parseSlashCommandInput(text: string): SlashCommandInvocation | null {
    const trimmed = text.trim();
    if (!trimmed.startsWith("/") || trimmed.length <= 1) {
      return null;
    }
    const withoutPrefix = trimmed.slice(1);
    const firstWhitespaceIdx = withoutPrefix.search(/\s/);
    const commandName =
      firstWhitespaceIdx === -1 ? withoutPrefix : withoutPrefix.slice(0, firstWhitespaceIdx);
    if (!commandName || commandName.includes("/")) {
      return null;
    }
    const rawArgs =
      firstWhitespaceIdx === -1 ? "" : withoutPrefix.slice(firstWhitespaceIdx + 1).trim();
    return rawArgs.length > 0
      ? { commandName, args: rawArgs, rawInput: trimmed }
      : { commandName, rawInput: trimmed };
  }

  private buildRewindSuccessMessage(
    targetUserMessageId: string,
    rewindResult: {
      filesChanged?: string[];
      insertions?: number;
      deletions?: number;
    },
  ): string {
    const fileCount = Array.isArray(rewindResult.filesChanged)
      ? rewindResult.filesChanged.length
      : undefined;
    const stats: string[] = [];
    if (typeof fileCount === "number") {
      stats.push(`${fileCount} file${fileCount === 1 ? "" : "s"}`);
    }
    if (typeof rewindResult.insertions === "number") {
      stats.push(`${rewindResult.insertions} insertions`);
    }
    if (typeof rewindResult.deletions === "number") {
      stats.push(`${rewindResult.deletions} deletions`);
    }
    if (stats.length > 0) {
      return `Rewound tracked files to message ${targetUserMessageId} (${stats.join(", ")}).`;
    }
    return `Rewound tracked files to message ${targetUserMessageId}.`;
  }

  private async attemptRewind(args: string | undefined): Promise<{
    messageId: string | null;
    result?: {
      filesChanged?: string[];
      insertions?: number;
      deletions?: number;
    };
    error?: string;
  }> {
    if (typeof args === "string" && args.trim().length > 0) {
      const candidate = args.trim().split(/\s+/)[0] ?? "";
      if (!UUID_PATTERN.test(candidate)) {
        return {
          messageId: null,
          error: "Invalid message UUID. Usage: /rewind <user_message_uuid> or /rewind",
        };
      }
      const rewindResult = await this.rewindFilesOnce(candidate);
      if (rewindResult.canRewind) {
        return { messageId: candidate, result: rewindResult };
      }
      return {
        messageId: null,
        error: rewindResult.error ?? `No file checkpoint found for message ${candidate}.`,
      };
    }

    const candidates = this.getRewindCandidateUserMessageIds();
    if (candidates.length === 0) {
      return {
        messageId: null,
        error: "No prior user message available to rewind. Use /rewind <user_message_uuid>.",
      };
    }

    let lastError: string | undefined;
    for (const candidate of candidates) {
      try {
        const rewindResult = await this.rewindFilesOnce(candidate);
        if (rewindResult.canRewind) {
          return { messageId: candidate, result: rewindResult };
        }
        if (rewindResult.error) {
          lastError = rewindResult.error;
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : "Failed to rewind tracked files.";
      }
    }

    return {
      messageId: null,
      error: lastError ?? "No rewind checkpoints are currently available for this session.",
    };
  }

  private async rewindFilesOnce(messageId: string): Promise<{
    canRewind: boolean;
    error?: string;
    filesChanged?: string[];
    insertions?: number;
    deletions?: number;
  }> {
    try {
      const activeQuery = await this.ensureFreshQuery();
      return await activeQuery.rewindFiles(messageId, { dryRun: false });
    } catch (error) {
      // The Claude SDK transport can close after a rewind call.
      // If that happens, mark the query stale so a follow-up attempt uses a fresh query.
      this.queryRestartNeeded = true;
      throw error;
    }
  }

  private async ensureFreshQuery(): Promise<Query> {
    if (this.query) {
      this.queryRestartNeeded = true;
    }
    return this.ensureQuery();
  }

  private getRewindCandidateUserMessageIds(): string[] {
    const candidates: string[] = [];
    const pushUnique = (value: string | null | undefined) => {
      if (typeof value === "string" && value.length > 0 && !candidates.includes(value)) {
        candidates.push(value);
      }
    };

    for (let idx = this.persistedHistory.length - 1; idx >= 0; idx -= 1) {
      const entry = this.persistedHistory[idx];
      if (entry?.item.type === "user_message") {
        pushUnique(entry.item.messageId);
      }
    }
    for (let idx = this.userMessageIds.length - 1; idx >= 0; idx -= 1) {
      pushUnique(this.userMessageIds[idx]);
    }

    return candidates;
  }

  private rebindConversationSession(sessionId: string): void {
    const oldSessionId = this.claudeSessionId;
    this.claudeSessionId = sessionId;
    this.pendingFreshSessionId = null;
    this.persistence = null;
    this.cachedRuntimeInfo = null;
    this.queryRestartNeeded = true;
    this.persistedHistory = [];
    this.historyPending = false;
    this.userMessageIds = [];
    this.emittedUserMessageIds.clear();
    this.rewindTurnAnchors.length = 0;
    this.loadPersistedHistory(sessionId);
    if (oldSessionId && oldSessionId !== sessionId) {
      this.dispatchEvents([
        {
          type: "timeline",
          provider: "claude",
          item: this.createClaudeSessionChangedNotice(oldSessionId, sessionId),
        },
        {
          type: "thread_started",
          provider: "claude",
          sessionId,
        },
      ]);
    }
  }

  private startFreshConversationSession(): void {
    const sessionId = randomUUID();
    this.claudeSessionId = sessionId;
    this.pendingFreshSessionId = sessionId;
    this.persistence = null;
    this.cachedRuntimeInfo = null;
    this.queryRestartNeeded = true;
    this.persistedHistory = [];
    this.historyPending = false;
    this.userMessageIds = [];
    this.emittedUserMessageIds.clear();
    this.rewindTurnAnchors.length = 0;
  }

  private rememberUserMessageId(messageId: string | null | undefined): void {
    if (typeof messageId !== "string" || messageId.length === 0) {
      return;
    }
    const last = this.userMessageIds[this.userMessageIds.length - 1];
    if (last === messageId) {
      return;
    }
    this.userMessageIds.push(messageId);
  }

  private rememberEmittedUserMessageId(messageId: string | null | undefined): void {
    if (typeof messageId !== "string" || messageId.length === 0) {
      return;
    }
    this.emittedUserMessageIds.add(messageId);
  }

  private rememberRewindUserAnchor(userMessageId: string | null | undefined): void {
    if (typeof userMessageId !== "string" || userMessageId.length === 0) {
      return;
    }
    if (this.rewindTurnAnchors.some((anchor) => anchor.userMessageId === userMessageId)) {
      return;
    }
    this.rewindTurnAnchors.push({
      userMessageId,
      assistantMessageId: null,
    });
  }

  private rememberRewindAssistantAnchor(assistantMessageId: string | null | undefined): void {
    if (typeof assistantMessageId !== "string" || assistantMessageId.length === 0) {
      return;
    }
    for (let index = this.rewindTurnAnchors.length - 1; index >= 0; index -= 1) {
      const anchor = this.rewindTurnAnchors[index];
      if (!anchor) {
        continue;
      }
      anchor.assistantMessageId = assistantMessageId;
      return;
    }
  }

  private rememberTranscriptProgress(message: SDKMessage, messageId: string | null): void {
    if (!messageId) {
      return;
    }
    if (
      message.type === "user" &&
      !isSyntheticUserEntry(message) &&
      !isToolResultUserEntry(message)
    ) {
      this.rememberRewindUserAnchor(messageId);
      return;
    }
    if (message.type === "assistant") {
      this.rememberRewindAssistantAnchor(messageId);
      return;
    }
    if (message.type === "stream_event") {
      const event = toObjectRecord(message.event) ?? {};
      const eventType = readTrimmedString(event.type);
      if (eventType === "message_start") {
        this.rememberRewindAssistantAnchor(messageId);
      }
      return;
    }
  }

  private resolveClaudeMessageId(messageId: string): string {
    return messageId;
  }

  private resolveConversationRewindTarget(messageId: string): ClaudeConversationRewindTarget {
    const targetUserMessageId = this.resolveClaudeMessageId(messageId);
    const index = this.rewindTurnAnchors.findIndex(
      (anchor) => anchor.userMessageId === targetUserMessageId,
    );
    if (index < 0) {
      throw new Error(`Claude rewind target ${messageId} is not in the tracked conversation`);
    }

    if (index === 0) {
      return { kind: "fresh-session" };
    }

    const previousTurn = this.rewindTurnAnchors[index - 1];
    if (!previousTurn?.assistantMessageId) {
      throw new Error(
        `Claude rewind cannot preserve turn ${index} because its assistant response id was not observed`,
      );
    }
    return { kind: "fork", messageId: previousTurn.assistantMessageId };
  }

  private async ensureQuery(): Promise<Query> {
    if (this.query && !this.queryRestartNeeded) {
      return this.query;
    }

    if (this.queryRestartNeeded && this.query) {
      const oldQuery = this.query;
      const oldInput = this.input;
      // Null out query/input BEFORE awaiting the old iterator's return so the
      // old pump sees this.query !== activeQuery and skips failActiveTurns.
      this.query = null;
      this.input = null;
      this.queryPumpPromise = null;
      this.queryRestartNeeded = false;
      oldInput?.end();
      oldQuery.close?.();
      try {
        await oldQuery.return?.();
      } catch {
        /* ignore */
      }
    }

    // Preserve claudeSessionId across query recreation so buildOptions() passes
    // resume: sessionId and the new query continues the existing conversation.
    this.persistence = null;

    const input = createAsyncMessageInput<SDKUserMessage>();
    const options = await this.buildOptions();
    this.logger.debug({ options: summarizeClaudeOptionsForLog(options) }, "claude query");
    this.input = input;
    this.query = claudeQuery(
      { prompt: input.iterable, options },
      {
        runtimeSettings: this.runtimeSettings,
        launchEnv: this.launchEnv,
        queryFactory: this.queryFactory,
      },
    );
    const fastMode = this.resolveFastModeSetting();
    if (fastMode !== null) {
      await this.query.applyFlagSettings({ fastMode });
    }
    // Do not kick off background control-plane queries here. Methods like
    // supportedCommands()/setPermissionMode() may execute immediately after
    // ensureQuery() (for listCommands()/setMode()), and sharing the same query
    // control plane can cause those calls to wait behind supportedModels().
    return this.query;
  }

  private async awaitWithTimeout(
    promise: Promise<unknown> | undefined,
    label: string,
  ): Promise<void> {
    if (!promise) {
      this.logger.trace(
        {
          agentId: this.agentId,
          provider: "claude",
          sessionId: this.claudeSessionId,
          turnId: this.activeForegroundTurnId ?? this.autonomousTurn?.id ?? undefined,
          label,
        },
        "provider.claude.query_operation.skip",
      );
      return;
    }
    const startedAt = Date.now();
    this.logger.trace(
      {
        agentId: this.agentId,
        provider: "claude",
        sessionId: this.claudeSessionId,
        turnId: this.activeForegroundTurnId ?? this.autonomousTurn?.id ?? undefined,
        label,
      },
      "provider.claude.query_operation.start",
    );
    try {
      await withTimeout(promise, 3_000, "timeout");
      this.logger.trace(
        {
          agentId: this.agentId,
          provider: "claude",
          sessionId: this.claudeSessionId,
          turnId: this.activeForegroundTurnId ?? this.autonomousTurn?.id ?? undefined,
          label,
          durationMs: Date.now() - startedAt,
        },
        "provider.claude.query_operation.settled",
      );
    } catch (error) {
      this.logger.warn({ err: error, label }, "Claude query operation did not settle cleanly");
    }
  }

  private resolveThinkingConfig(): {
    thinking: ClaudeOptions["thinking"];
    effort: ClaudeOptions["effort"];
    ultracode: boolean;
  } {
    const thinkingOptionId = isClaudeThinkingOption(this.config.thinkingOptionId)
      ? this.config.thinkingOptionId
      : undefined;
    if (thinkingOptionId === "ultracode") {
      return { thinking: { type: "adaptive" }, effort: "xhigh", ultracode: true };
    }
    if (thinkingOptionId) {
      return { thinking: { type: "adaptive" }, effort: thinkingOptionId, ultracode: false };
    }
    return { thinking: undefined, effort: undefined, ultracode: false };
  }

  private buildAppendedSystemPrompt(): string {
    return (
      composeSystemPromptParts(this.config.systemPrompt, this.config.daemonAppendSystemPrompt) ?? ""
    );
  }

  private buildSdkEnv(extraClaudeOptions: Partial<ClaudeOptions> | undefined): NodeJS.ProcessEnv {
    return createProviderEnv({
      baseEnv: process.env,
      runtimeSettings: this.runtimeSettings,
      overlays: [
        extraClaudeOptions?.env,
        {
          // Increase MCP timeouts for long-running tool calls (10 minutes)
          MCP_TIMEOUT: "600000",
          MCP_TOOL_TIMEOUT: "600000",
        },
        this.launchEnv,
      ],
    });
  }

  private async buildOptions(): Promise<ClaudeOptions> {
    const { thinking, effort, ultracode } = this.resolveThinkingConfig();
    const appendedSystemPrompt = this.buildAppendedSystemPrompt();
    const extraClaudeOptions = this.config.extra?.claude;
    const { sdkEnv, flagSettingsOptions, launchModel, modelGatewayOverrideActive } =
      this.buildSdkLaunchOptions(extraClaudeOptions, { ultracode });
    this.modelGatewayOverrideActive = modelGatewayOverrideActive;
    assertClaudeAutoModeEligible(this.currentMode, sdkEnv);

    const claudeBinary = await this.resolveBinary();
    this.logger.debug(
      {
        claudeBinary,
        pathEnvKey: resolvePathEnvKey(),
        pathIncludesClaudeLocalBin: (process.env["Path"] ?? process.env["PATH"] ?? "")
          .toLowerCase()
          .includes("\\.local\\bin"),
      },
      "Resolved Claude executable",
    );
    const sessionBinding: Pick<ClaudeOptions, "resume" | "sessionId"> = {};
    if (this.pendingFreshSessionId) {
      sessionBinding.sessionId = this.pendingFreshSessionId;
    } else if (this.claudeSessionId) {
      sessionBinding.resume = this.claudeSessionId;
    }

    const base: ClaudeOptions = {
      cwd: this.config.cwd,
      includePartialMessages: true,
      permissionMode: this.currentMode,
      // Dynamic mode switching can recreate the underlying Claude query. Keep the
      // bypass launch capability available so later setPermissionMode("bypassPermissions")
      // calls do not fail after a model/thinking/rewind-driven restart.
      allowDangerouslySkipPermissions: true,
      agents: this.defaults?.agents,
      canUseTool: this.handlePermissionRequest,
      pathToClaudeCodeExecutable: claudeBinary,
      // Use Claude Code preset system prompt and load CLAUDE.md files
      // Append provider-agnostic system prompts for agents.
      systemPrompt: {
        type: "preset",
        preset: "claude_code",
        append: appendedSystemPrompt,
      },
      settingSources: CLAUDE_SETTING_SOURCES,
      stderr: (data: string) => {
        this.captureStderr(data);
        this.logger.error({ stderr: data.trim() }, "Claude Agent SDK stderr");
      },
      // Required for provider-level /rewind support.
      enableFileCheckpointing: true,
      // If we have a session ID from a previous query (e.g., after interrupt),
      // resume that session to continue the conversation history.
      ...sessionBinding,
      ...(thinking ? { thinking } : {}),
      ...(effort ? { effort } : {}),
      ...extraClaudeOptions,
      ...flagSettingsOptions,
      ...(this.persistSession === undefined ? {} : { persistSession: this.persistSession }),
      env: sdkEnv,
    };

    return this.applyPostOptions(base, launchModel, modelGatewayOverrideActive);
  }

  private applyPostOptions(
    base: ClaudeOptions,
    launchModel: string | undefined,
    modelGatewayOverrideActive: boolean,
  ): ClaudeOptions {
    if (this.config.mcpServers) {
      base.mcpServers = this.normalizeMcpServers(this.config.mcpServers);
    }

    if (launchModel) {
      base.model = launchModel;
    }
    this.lastOptionsModel = modelGatewayOverrideActive
      ? (this.config.model ?? null)
      : (base.model ?? null);
    if (this.claudeSessionId && !this.pendingFreshSessionId) {
      base.resume = this.claudeSessionId;
    }
    if (this.runtimeSettings?.disallowedTools?.length) {
      base.disallowedTools = [
        ...(base.disallowedTools ?? []),
        ...this.runtimeSettings.disallowedTools,
      ];
    }
    return base;
  }

  private buildSdkLaunchOptions(
    extraClaudeOptions: Partial<ClaudeOptions> | undefined,
    extra?: { ultracode?: boolean },
  ): {
    sdkEnv: NodeJS.ProcessEnv;
    flagSettingsOptions: Partial<Pick<ClaudeOptions, "settings" | "settingSources">>;
    launchModel: string | undefined;
    modelGatewayOverrideActive: boolean;
  } {
    const baseEnv = this.buildSdkEnv(extraClaudeOptions);
    const modelGatewayOverride = resolveClaudeModelGatewayOverride({
      model: this.config.model,
      env: baseEnv,
    });
    const sdkEnv = modelGatewayOverride
      ? removeClaudeModelSelectionEnv({ ...baseEnv, ...modelGatewayOverride.env })
      : baseEnv;
    const flagSettingsOptions: Partial<Pick<ClaudeOptions, "settings" | "settingSources">> =
      this.buildFlagSettingsOptions(extraClaudeOptions, modelGatewayOverride?.env, extra);
    if (modelGatewayOverride) {
      flagSettingsOptions.settingSources = CLAUDE_GATEWAY_SETTING_SOURCES;
    }
    return {
      sdkEnv,
      flagSettingsOptions,
      launchModel: modelGatewayOverride?.launchModel ?? this.config.model,
      modelGatewayOverrideActive: Boolean(modelGatewayOverride),
    };
  }

  private buildFlagSettingsOptions(
    extraClaudeOptions: Partial<ClaudeOptions> | undefined,
    envOverride?: Record<string, string>,
    extra?: { ultracode?: boolean },
  ): Pick<ClaudeOptions, "settings"> | Record<string, never> {
    const runtimeEnv = readRuntimeSettingsEnv(this.runtimeSettings);
    const fastMode = this.resolveFastModeSetting();
    const env = runtimeEnv || envOverride ? { ...runtimeEnv, ...envOverride } : null;
    if (!env && fastMode === null && !extra?.ultracode) {
      return {};
    }
    const updates: NonNullable<Exclude<ClaudeOptions["settings"], string>> = {
      ...(env ? { env } : {}),
      ...(fastMode === null ? {} : { fastMode }),
      ...(extra?.ultracode ? { ultracode: true } : {}),
    };
    return { settings: mergeClaudeSettings(extraClaudeOptions?.settings, updates) };
  }

  private resolveFastModeSetting(): boolean | null {
    if (!claudeModelSupportsFastMode(this.config.model)) {
      return null;
    }
    return this.config.featureValues?.fast_mode === true;
  }

  private normalizeMcpServers(
    servers: Record<string, McpServerConfig>,
  ): Record<string, ClaudeSdkMcpServerConfig> {
    const result: Record<string, ClaudeSdkMcpServerConfig> = {};
    for (const [name, config] of Object.entries(servers)) {
      result[name] = toClaudeSdkMcpConfig(config);
    }
    return result;
  }

  private toSdkUserMessage(prompt: AgentPromptInput): SDKUserMessage {
    const content: Array<
      | { type: "text"; text: string }
      | {
          type: "image";
          source: {
            type: "base64";
            media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
            data: string;
          };
        }
    > = [];
    if (Array.isArray(prompt)) {
      for (const chunk of prompt) {
        if (chunk.type === "text") {
          content.push({ type: "text", text: chunk.text });
        } else if (chunk.type === "image") {
          if (isImageMimeType(chunk.mimeType)) {
            content.push({
              type: "image",
              source: {
                type: "base64",
                media_type: chunk.mimeType,
                data: chunk.data,
              },
            });
          }
        } else {
          content.push({ type: "text", text: renderPromptAttachmentAsText(chunk) });
        }
      }
    } else {
      content.push({ type: "text", text: prompt });
    }

    const messageId = randomUUID();
    this.rememberUserMessageId(messageId);

    return {
      type: "user",
      message: {
        role: "user",
        content,
      },
      parent_tool_use_id: null,
      uuid: messageId,
      session_id: this.claudeSessionId ?? "",
    };
  }

  private transitionTurnState(next: ClaudeTurnState, reason: string): void {
    this.messageRouter.transitionTurnState(next, reason);
  }

  private syncTurnState(reason: string): void {
    this.messageRouter.syncTurnState(reason);
  }

  private buildTurnFailedEvent(
    errorMessage: string,
  ): Extract<AgentStreamEvent, { type: "turn_failed" }> {
    const normalized = errorMessage.trim() || "Claude run failed";
    const exitCodeMatch = normalized.match(/\bcode\s+(\d+)\b/i);
    const code = exitCodeMatch ? exitCodeMatch[1] : undefined;
    const diagnostic = this.getRecentStderrDiagnostic();
    return {
      type: "turn_failed",
      provider: "claude",
      error: normalized,
      ...(code ? { code } : {}),
      ...(diagnostic ? { diagnostic } : {}),
    };
  }

  private captureStderr(data: string): void {
    const text = data.trim();
    if (!text) {
      return;
    }
    const combined = this.recentStderr ? `${this.recentStderr}\n${text}` : text;
    this.recentStderr = combined.slice(-MAX_RECENT_STDERR_CHARS);
  }

  private clearRecentStderr(): void {
    this.recentStderr = "";
  }

  private getRecentStderrDiagnostic(): string | undefined {
    return this.recentStderr.trim() || undefined;
  }

  private async awaitRecentStderrAfterProcessExit(error: unknown): Promise<void> {
    if (this.getRecentStderrDiagnostic()) {
      return;
    }
    const message = errorToMessageString(error);
    if (
      !/\bprocess exited with code\b/i.test(message) &&
      !/\bterminated by signal\b/i.test(message)
    ) {
      return;
    }

    const startedAt = Date.now();
    while (!this.closed && !this.getRecentStderrDiagnostic()) {
      if (Date.now() - startedAt >= STDERR_FLUSH_WAIT_MS) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, STDERR_FLUSH_POLL_INTERVAL_MS));
    }
  }

  private createTurnId(owner: "foreground" | "autonomous"): string {
    return this.messageRouter.createTurnId(owner);
  }

  private async executeRewindTurn(
    _turnId: string,
    invocation: SlashCommandInvocation,
  ): Promise<void> {
    this.notifySubscribers({ type: "turn_started", provider: "claude" });
    try {
      const rewindAttempt = await this.attemptRewind(invocation.args);
      if (!rewindAttempt.messageId || !rewindAttempt.result) {
        this.finishForegroundTurn({
          type: "turn_failed",
          provider: "claude",
          error:
            rewindAttempt.error ??
            "No prior user message available to rewind. Use /rewind <user_message_uuid>.",
        });
        return;
      }
      this.notifySubscribers({
        type: "timeline",
        provider: "claude",
        item: {
          type: "assistant_message",
          text: this.buildRewindSuccessMessage(rewindAttempt.messageId, rewindAttempt.result),
        },
      });
      this.finishForegroundTurn({ type: "turn_completed", provider: "claude" });
    } catch (error) {
      this.finishForegroundTurn({
        type: "turn_failed",
        provider: "claude",
        error: error instanceof Error ? error.message : "Failed to rewind tracked files",
      });
    }
  }

  private finishForegroundTurn(
    event: Extract<AgentStreamEvent, { type: "turn_completed" | "turn_failed" | "turn_canceled" }>,
  ): void {
    this.messageRouter.finishForegroundTurn(event);
  }

  private dispatchEvents(events: AgentStreamEvent[]): void {
    this.messageRouter.dispatchEvents(events);
  }

  private completeAutonomousTurn(): void {
    this.messageRouter.completeAutonomousTurn();
  }

  private failActiveTurns(errorMessage: string): void {
    this.messageRouter.failActiveTurns(errorMessage);
  }

  private startQueryPump(): void {
    if (this.closed || this.queryPumpPromise) {
      return;
    }

    const pump = runClaudeSdkQueryPump({
      logger: this.logger,
      getTraceContext: () => ({
        agentId: this.agentId,
        provider: "claude",
        sessionId: this.claudeSessionId,
        turnId: this.activeForegroundTurnId ?? this.autonomousTurn?.id ?? undefined,
      }),
      isClosed: () => this.closed,
      ensureQuery: () => this.ensureQuery(),
      isCurrentQuery: (query) => this.query === query,
      handleMissingResumedConversation: (message, query) =>
        this.handleMissingResumedConversation(message, query),
      routeMessage: (message) => this.routeSdkMessageFromPump(message),
      failActiveTurns: (errorMessage) => this.failActiveTurns(errorMessage),
      awaitRecentStderrAfterProcessExit: (error) => this.awaitRecentStderrAfterProcessExit(error),
      clearQueryIfCurrent: (query) => {
        if (this.query === query) {
          this.query = null;
          this.input = null;
        }
      },
    }).catch((error) => {
      this.logger.trace(
        {
          agentId: this.agentId,
          provider: "claude",
          sessionId: this.claudeSessionId,
          turnId: this.activeForegroundTurnId ?? this.autonomousTurn?.id ?? undefined,
          err: error,
        },
        "provider.claude.query_pump.exit_unexpected",
      );
    });

    this.queryPumpPromise = pump;
    void pump.finally(() => {
      if (this.queryPumpPromise === pump) {
        this.queryPumpPromise = null;
      }
    });
  }

  private routeSdkMessageFromPump(message: SDKMessage): void {
    this.messageRouter.routeMessage(message);
  }

  private async handleMissingResumedConversation(
    message: SDKMessage,
    activeQuery: Query,
  ): Promise<boolean> {
    const staleResumeError = this.readMissingResumedConversationError(message);
    if (!staleResumeError) {
      return false;
    }

    this.logger.warn(
      {
        error: staleResumeError,
      },
      "Claude resumed session no longer exists; invalidating persisted session",
    );

    this.failActiveTurns(staleResumeError);
    this.input?.end();
    await this.awaitWithTimeout(
      activeQuery.return?.(),
      "query pump return on missing resumed conversation",
    );
    if (this.query === activeQuery) {
      this.query = null;
      this.input = null;
    }
    this.persistence = null;
    this.persistedHistory = [];
    this.historyPending = false;
    this.cachedRuntimeInfo = null;
    this.queryRestartNeeded = false;
    this.autonomousTurn = null;
    this.activeForegroundTurnId = null;
    this.syncTurnState("missing resumed conversation");
    return true;
  }

  private async interruptActiveTurn(): Promise<void> {
    const queryToInterrupt = this.query;
    if (!queryToInterrupt || typeof queryToInterrupt.interrupt !== "function") {
      this.logger.trace(
        {
          agentId: this.agentId,
          provider: "claude",
          sessionId: this.claudeSessionId,
          turnId: this.activeForegroundTurnId ?? this.autonomousTurn?.id ?? undefined,
        },
        "provider.claude.interrupt.no_query",
      );
      return;
    }
    this.pendingInterruptAbort = true;
    try {
      await this.awaitWithTimeout(
        queryToInterrupt.interrupt(),
        "interruptActiveTurn query.interrupt()",
      );
    } catch (error) {
      this.logger.warn({ err: error }, "Failed to interrupt active turn");
    }
  }

  private translateMessageToEvents(
    message: SDKMessage,
    options?: {
      suppressAssistantText?: boolean;
      suppressReasoning?: boolean;
    },
  ): AgentStreamEvent[] {
    const parentToolUseId =
      "parent_tool_use_id" in message
        ? (message as { parent_tool_use_id: string | null }).parent_tool_use_id
        : null;
    if (parentToolUseId) {
      return this.sidechainTracker.handleMessage(message, parentToolUseId);
    }

    const events: AgentStreamEvent[] = [];
    if (message.type !== "system") {
      const sessionCapture = this.captureSessionIdFromMessage(message);
      if (sessionCapture.notice) {
        events.push({
          type: "timeline",
          provider: "claude",
          item: sessionCapture.notice,
        });
      }
      if (sessionCapture.threadStartedSessionId) {
        events.push({
          type: "thread_started",
          provider: "claude",
          sessionId: sessionCapture.threadStartedSessionId,
        });
      }
    }

    switch (message.type) {
      case "system":
        this.appendSystemMessageEvents(message, events);
        break;
      case "user":
        this.appendUserMessageEvents(message, events);
        break;
      case "assistant": {
        const timelineItems = this.mapBlocksToTimeline(message.message.content, {
          suppressAssistantText: options?.suppressAssistantText ?? false,
          suppressReasoning: options?.suppressReasoning ?? false,
        });
        for (const item of timelineItems) {
          events.push({ type: "timeline", item, provider: "claude" });
        }
        break;
      }
      case "stream_event":
        this.appendStreamEventEvents(message, events, options);
        break;
      case "result":
        this.appendResultEvents(message, events);
        break;
      default:
        break;
    }

    return events;
  }

  private emitSubmittedUserMessage(
    message: Extract<SDKMessage, { type: "user" }>,
    turnId: string,
  ): void {
    const events: AgentStreamEvent[] = [];
    this.appendUserMessageEvents(message, events);
    if (events.length === 0) {
      return;
    }
    this.foregroundHasVisibleActivity = true;
    for (const event of events) {
      if (event.type === "timeline") {
        this.notifySubscribers({ ...event, turnId });
      } else {
        this.notifySubscribers(event);
      }
    }
  }

  private appendSystemMessageEvents(
    message: Extract<SDKMessage, { type: "system" }>,
    events: AgentStreamEvent[],
  ): void {
    if (message.subtype === "init") {
      const sessionUpdate = this.handleSystemMessage(message);
      if (sessionUpdate.notice) {
        events.push({
          type: "timeline",
          provider: "claude",
          item: sessionUpdate.notice,
        });
      }
      if (sessionUpdate.threadStartedSessionId) {
        events.push({
          type: "thread_started",
          provider: "claude",
          sessionId: sessionUpdate.threadStartedSessionId,
        });
      }
      return;
    }
    if (message.subtype === "status") {
      const status = toObjectRecord(message)?.status;
      if (status === "compacting") {
        this.compacting = true;
        events.push({
          type: "timeline",
          item: { type: "compaction", status: "loading" },
          provider: "claude",
        });
      }
      return;
    }
    if (message.subtype === "compact_boundary") {
      const compactMetadata = readCompactionMetadata(message);
      events.push({
        type: "timeline",
        item: {
          type: "compaction",
          status: "completed",
          trigger: compactMetadata?.trigger === "manual" ? "manual" : "auto",
          preTokens: compactMetadata?.preTokens,
        },
        provider: "claude",
      });
      return;
    }
    if (message.subtype === "task_notification") {
      this.appendTaskNotificationEvents(message, events);
      return;
    }
    if (message.subtype === "task_progress") {
      this.lastContextWindowUsedTokens =
        readContextWindowUsedTokensFromTaskProgress(message) ?? this.lastContextWindowUsedTokens;
      if (typeof this.lastContextWindowUsedTokens === "number") {
        events.push(this.createUsageUpdatedEvent(this.lastContextWindowUsedTokens));
      }
    }
  }

  private appendTaskNotificationEvents(
    message: Extract<SDKMessage, { type: "system"; subtype: "task_notification" }>,
    events: AgentStreamEvent[],
  ): void {
    // TODO: subagent timelines are best-effort. Subagent task_notifications
    // arrive without parent_tool_use_id but with tool_use_id pointing at the
    // parent's Task call, so they slip past the sidechain router and pollute
    // the parent timeline. Drop them here; eventually thread them into the
    // parent Task tool call's sub_agent log instead.
    const taskUseId = message.tool_use_id;
    const cachedToolName = taskUseId ? this.toolCallHandler.getToolName(taskUseId) : null;
    if (cachedToolName === "Task") {
      return;
    }
    const taskNotificationItem = mapTaskNotificationSystemRecordToToolCall(message);
    if (taskNotificationItem) {
      events.push({
        type: "timeline",
        item: taskNotificationItem,
        provider: "claude",
      });
    }
    const usage = readUsageFromTaskNotification(message);
    if (typeof usage === "number") {
      this.lastContextWindowUsedTokens = usage;
      events.push(this.createUsageUpdatedEvent(usage));
    }
  }

  private appendUserMessageEvents(
    message: Extract<SDKMessage, { type: "user" }>,
    events: AgentStreamEvent[],
  ): void {
    if (isSyntheticUserEntry(message)) {
      return;
    }
    if (this.compacting) {
      this.compacting = false;
      return;
    }
    const messageId =
      typeof message.uuid === "string" && message.uuid.length > 0 ? message.uuid : undefined;
    if (messageId && this.emittedUserMessageIds.has(messageId)) {
      return;
    }
    this.rememberUserMessageId(messageId);
    this.rememberEmittedUserMessageId(messageId);
    const content = message.message?.content;
    const taskNotificationItem = mapTaskNotificationUserContentToToolCall({
      content,
      messageId,
    });
    if (taskNotificationItem) {
      events.push({
        type: "timeline",
        item: taskNotificationItem,
        provider: "claude",
      });
      return;
    }
    if (typeof content === "string" && content.length > 0) {
      if (!isClaudeTranscriptNoiseText(content)) {
        events.push({
          type: "timeline",
          item: {
            type: "user_message",
            text: content,
            ...(messageId ? { messageId } : {}),
          },
          provider: "claude",
        });
      }
      return;
    }
    if (Array.isArray(content)) {
      this.appendUserContentArrayEvents(content, messageId, events);
    }
  }

  private appendUserContentArrayEvents(
    content: ReadonlyArray<unknown>,
    messageId: string | undefined,
    events: AgentStreamEvent[],
  ): void {
    const timelineItems = this.mapBlocksToTimeline(content, {
      textMessageType: "user_message",
    });
    for (const item of timelineItems) {
      if (item.type === "user_message" && messageId && !item.messageId) {
        events.push({
          type: "timeline",
          item: { ...item, messageId },
          provider: "claude",
        });
        continue;
      }
      events.push({ type: "timeline", item, provider: "claude" });
    }
  }

  private appendStreamEventEvents(
    message: Extract<SDKMessage, { type: "stream_event" }>,
    events: AgentStreamEvent[],
    options: { suppressAssistantText?: boolean; suppressReasoning?: boolean } | undefined,
  ): void {
    const usageUpdatedEvent = this.trackStreamEventUsage(message.event);
    if (usageUpdatedEvent) {
      events.push(usageUpdatedEvent);
    }
    const timelineItems = this.mapPartialEvent(message.event, {
      suppressAssistantText: options?.suppressAssistantText ?? false,
      suppressReasoning: options?.suppressReasoning ?? false,
    });
    for (const item of timelineItems) {
      events.push({ type: "timeline", item, provider: "claude" });
    }
  }

  private appendResultEvents(
    message: Extract<SDKMessage, { type: "result" }>,
    events: AgentStreamEvent[],
  ): void {
    const usage = this.convertUsage(message, message.modelUsage);
    if (message.subtype === "success") {
      // Built-in slash commands (e.g. /voice, /usage, "Unknown command: …")
      // run client-side in the Claude CLI with no model turn — output_tokens
      // is 0 and the user-visible text is carried in `result`. Surface it only
      // when the turn has not already emitted assistant text so zero-token
      // accounting from provider gateways does not duplicate streamed output.
      const resultText = typeof message.result === "string" ? message.result.trim() : "";
      const outputTokens = message.usage?.output_tokens;
      if (resultText.length > 0 && outputTokens === 0 && !this.activeTurnHasAssistantText) {
        events.push({
          type: "timeline",
          provider: "claude",
          item: {
            type: "assistant_message",
            text: resultText,
            messageId: message.uuid,
          },
        });
      }
      events.push({ type: "turn_completed", provider: "claude", usage });
      return;
    }
    const errorMessage =
      "errors" in message && Array.isArray(message.errors) && message.errors.length > 0
        ? message.errors.join("\n")
        : "Claude run failed";
    events.push(this.buildTurnFailedEvent(errorMessage));
  }

  private createClaudeSessionChangedNotice(
    oldSessionId: string,
    newSessionId: string,
  ): AgentTimelineItem {
    return {
      type: "assistant_message",
      text: `Claude switched to a new session: ${oldSessionId} -> ${newSessionId}`,
    };
  }

  private captureSessionIdFromMessage(message: SDKMessage): {
    threadStartedSessionId: string | null;
    notice: AgentTimelineItem | null;
  } {
    const msgRecord = toObjectRecord(message) ?? {};
    const sessionId = extractSessionIdRaw({
      session_id: msgRecord.session_id,
      sessionId: msgRecord.sessionId,
      session: isObjectRecord(msgRecord.session) ? { id: msgRecord.session.id } : null,
    }).trim();
    if (!sessionId) {
      return { threadStartedSessionId: null, notice: null };
    }
    if (this.claudeSessionId === null) {
      this.claudeSessionId = sessionId;
      this.pendingFreshSessionId = null;
      this.persistence = null;
      return { threadStartedSessionId: sessionId, notice: null };
    }
    if (this.claudeSessionId === sessionId) {
      this.pendingFreshSessionId = null;
      return { threadStartedSessionId: null, notice: null };
    }
    const oldSessionId = this.claudeSessionId;
    // Session ID changed mid-stream (e.g. a hook caused Claude to restart
    // with a new session). Accept the new ID and continue — the turn should
    // not be failed just because the underlying subprocess cycled.
    this.logger.warn(
      { existingSessionId: this.claudeSessionId, newSessionId: sessionId },
      "Claude session ID changed in message; accepting new session",
    );
    this.claudeSessionId = sessionId;
    this.pendingFreshSessionId = null;
    this.persistence = null;
    return {
      threadStartedSessionId: sessionId,
      notice: this.createClaudeSessionChangedNotice(oldSessionId, sessionId),
    };
  }

  private handleSystemMessage(message: SDKSystemMessage): {
    threadStartedSessionId: string | null;
    notice: AgentTimelineItem | null;
  } {
    if (message.subtype !== "init") {
      return { threadStartedSessionId: null, notice: null };
    }

    const msgRecord = toObjectRecord(message) ?? {};
    const newSessionId = extractSessionIdRaw({
      session_id: msgRecord.session_id,
      sessionId: msgRecord.sessionId,
      session: isObjectRecord(msgRecord.session) ? { id: msgRecord.session.id } : null,
    }).trim();
    if (!newSessionId) {
      return { threadStartedSessionId: null, notice: null };
    }
    const existingSessionId = this.claudeSessionId;
    let threadStartedSessionId: string | null = null;
    let notice: AgentTimelineItem | null = null;

    if (existingSessionId === null) {
      this.claudeSessionId = newSessionId;
      this.pendingFreshSessionId = null;
      threadStartedSessionId = newSessionId;
      this.logger.debug({ sessionId: newSessionId }, "Claude session ID set for the first time");
    } else if (existingSessionId === newSessionId) {
      this.pendingFreshSessionId = null;
      this.logger.debug({ sessionId: newSessionId }, "Claude session ID unchanged (same value)");
    } else {
      // Session ID changed in an init message (e.g. a hook restarted Claude
      // with a new session mid-turn). Accept the new ID and continue.
      this.logger.warn(
        { existingSessionId, newSessionId },
        "Claude session ID changed in init message; accepting new session",
      );
      this.claudeSessionId = newSessionId;
      this.pendingFreshSessionId = null;
      threadStartedSessionId = newSessionId;
      notice = this.createClaudeSessionChangedNotice(existingSessionId, newSessionId);
    }
    this.availableModes = DEFAULT_MODES;
    this.currentMode = message.permissionMode;
    if (this.currentMode !== "plan") {
      this.planResumeMode = this.currentMode;
    }
    this.persistence = null;
    if (message.model) {
      const normalizedRuntimeModel = normalizeClaudeRuntimeModelId(message.model);
      this.logger.debug(
        { runtimeModel: message.model, normalizedRuntimeModel },
        "Captured runtime model from SDK init",
      );
      if (this.modelGatewayOverrideActive) {
        this.lastOptionsModel =
          this.config.model ?? normalizedRuntimeModel ?? this.lastOptionsModel;
      } else if (normalizedRuntimeModel) {
        this.lastOptionsModel = normalizedRuntimeModel;
      } else if (!this.lastOptionsModel) {
        this.lastOptionsModel = this.config.model ?? null;
      }
      this.lastRuntimeModel = message.model;
      this.cachedRuntimeInfo = null;
    }
    return { threadStartedSessionId, notice };
  }

  private readMissingResumedConversationError(message: SDKMessage): string | null {
    if (message.type !== "result" || message.subtype !== "error_during_execution") {
      return null;
    }
    if (!this.claudeSessionId) {
      return null;
    }
    const errors = "errors" in message && Array.isArray(message.errors) ? message.errors : [];
    for (const entry of errors) {
      if (typeof entry !== "string") {
        continue;
      }
      const match = entry.match(/^No conversation found with session ID:\s*(.+)$/);
      if (!match) {
        continue;
      }
      if (match[1]?.trim() === this.claudeSessionId) {
        return entry.trim();
      }
    }
    return null;
  }

  private convertUsage(message: SDKResultMessage, modelUsage?: unknown): AgentUsage | undefined {
    if (!message.usage) {
      return undefined;
    }
    const usage: AgentUsage = {
      inputTokens: message.usage.input_tokens,
      cachedInputTokens: message.usage.cache_read_input_tokens,
      outputTokens: message.usage.output_tokens,
      totalCostUsd: message.total_cost_usd,
    };
    const contextWindowMaxTokens = extractContextWindowSize(modelUsage ?? message.modelUsage);
    if (contextWindowMaxTokens !== undefined) {
      this.lastContextWindowMaxTokens = contextWindowMaxTokens;
      usage.contextWindowMaxTokens = contextWindowMaxTokens;
    } else if (this.lastContextWindowMaxTokens !== undefined) {
      usage.contextWindowMaxTokens = this.lastContextWindowMaxTokens;
    }
    if (typeof this.lastContextWindowUsedTokens === "number") {
      // task_progress.total_tokens is the accurate context window fill level.
      // Prefer it over result.usage which contains accumulated session totals.
      usage.contextWindowUsedTokens = this.lastContextWindowUsedTokens;
    } else if (
      typeof this.lastStreamRequestInputTokens === "number" &&
      typeof this.lastStreamRequestOutputTokens === "number"
    ) {
      usage.contextWindowUsedTokens =
        this.lastStreamRequestInputTokens + this.lastStreamRequestOutputTokens;
    } else if (message.usage) {
      // Fallback: derive from result.usage when no task_progress has been
      // received yet. These values are accumulated across all API calls, but
      // for the first turn they equal the per-call values so the estimate is
      // reasonable. Once a task_progress arrives it takes over permanently.
      const usageWithCacheCreation = message.usage as typeof message.usage & {
        cache_creation_input_tokens?: number;
      };
      const derived =
        (message.usage.input_tokens ?? 0) +
        (usageWithCacheCreation.cache_creation_input_tokens ?? 0) +
        (message.usage.cache_read_input_tokens ?? 0) +
        (message.usage.output_tokens ?? 0);
      if (Number.isFinite(derived) && derived > 0) {
        usage.contextWindowUsedTokens = derived;
      }
    }
    return usage;
  }

  private createUsageUpdatedEvent(contextWindowUsedTokens: number): AgentStreamEvent {
    const usage: AgentUsage = {
      contextWindowUsedTokens,
    };
    if (this.lastContextWindowMaxTokens !== undefined) {
      usage.contextWindowMaxTokens = this.lastContextWindowMaxTokens;
    }
    return {
      type: "usage_updated",
      provider: "claude",
      usage,
    };
  }

  private trackStreamEventUsage(event: unknown): AgentStreamEvent | null {
    const streamEvent = toObjectRecord(event);
    if (!streamEvent) {
      return null;
    }
    const eventType = readTrimmedString(streamEvent.type);
    if (eventType === "message_start") {
      const inputTokens = readStreamRequestInputTokens(streamEvent);
      if (typeof inputTokens !== "number") {
        return null;
      }
      this.lastStreamRequestInputTokens = inputTokens;
      this.lastStreamRequestOutputTokens = 0;
    } else if (eventType === "message_delta") {
      const outputTokens = readStreamRequestOutputTokens(streamEvent);
      if (typeof outputTokens !== "number") {
        return null;
      }
      this.lastStreamRequestOutputTokens = outputTokens;
    } else {
      return null;
    }

    if (
      typeof this.lastStreamRequestInputTokens !== "number" ||
      typeof this.lastStreamRequestOutputTokens !== "number"
    ) {
      return null;
    }
    return this.createUsageUpdatedEvent(
      this.lastStreamRequestInputTokens + this.lastStreamRequestOutputTokens,
    );
  }

  private handlePermissionRequest: CanUseTool = async (
    toolName,
    input,
    options,
  ): Promise<PermissionResult> => {
    const requestId = `permission-${randomUUID()}`;
    const kind = resolvePermissionKind(toolName, input);
    const metadata: AgentMetadata = {};
    if (options.toolUseID) {
      metadata.toolUseId = options.toolUseID;
    }
    if (toolName === "ExitPlanMode" && typeof input.plan === "string") {
      metadata.planText = input.plan;
    }
    const toolDetail =
      kind === "tool"
        ? mapClaudeRunningToolCall({
            name: toolName,
            callId: options.toolUseID ?? requestId,
            input,
            output: null,
          })?.detail
        : undefined;

    const request: AgentPermissionRequest = {
      id: requestId,
      provider: "claude",
      name: toolName,
      kind,
      input,
      detail: toolDetail,
      suggestions: options.suggestions?.map((suggestion) => ({
        ...suggestion,
      })),
      actions: kind === "plan" ? buildClaudePlanPermissionActions(this.planResumeMode) : undefined,
      metadata: Object.keys(metadata).length ? metadata : undefined,
    };

    this.pushEvent({
      type: "permission_requested",
      provider: "claude",
      request,
    });

    return await new Promise<PermissionResult>((resolve, reject) => {
      const cleanupFns: Array<() => void> = [];
      const cleanup = () => {
        while (cleanupFns.length) {
          const fn = cleanupFns.pop();
          try {
            fn?.();
          } catch {
            // ignore cleanup errors
          }
        }
      };

      const abortHandler = () => {
        this.pendingPermissions.delete(requestId);
        cleanup();
        reject(new Error("Permission request aborted"));
      };

      if (options?.signal) {
        if (options.signal.aborted) {
          abortHandler();
          return;
        }
        options.signal.addEventListener("abort", abortHandler, { once: true });
        cleanupFns.push(() => options.signal?.removeEventListener("abort", abortHandler));
      }

      this.pendingPermissions.set(requestId, {
        request,
        resolve,
        reject,
        cleanup,
      });
    });
  };

  private enqueueTimeline(item: AgentTimelineItem) {
    this.pushEvent({ type: "timeline", item, provider: "claude" });
  }

  private flushPendingToolCalls(): void {
    this.toolCallHandler.flushPendingToolCalls();
  }

  private pushToolCall(
    item: Extract<AgentTimelineItem, { type: "tool_call" }> | null,
    target?: AgentTimelineItem[],
  ) {
    if (!item) {
      return;
    }
    if (target) {
      target.push(item);
      return;
    }
    this.enqueueTimeline(item);
  }

  private pushEvent(event: AgentStreamEvent) {
    this.notifySubscribers(event);
  }

  private notifySubscribers(event: AgentStreamEvent): void {
    const turnId = this.activeForegroundTurnId ?? this.autonomousTurn?.id;
    const tagged = turnId ? { ...event, turnId } : event;
    this.logger.trace(
      {
        agentId: this.agentId,
        provider: "claude",
        sessionId: this.claudeSessionId,
        turnId: getAgentStreamEventTurnId(tagged),
        event: tagged,
      },
      "provider.claude.event_emit",
    );
    for (const callback of this.subscribers) {
      try {
        callback(tagged);
      } catch (error) {
        this.logger.warn({ err: error }, "Subscriber callback threw");
      }
    }
  }

  private normalizePermissionUpdates(
    updates?: AgentPermissionUpdate[],
  ): PermissionUpdate[] | undefined {
    if (!updates || updates.length === 0) {
      return undefined;
    }
    const normalized = updates.filter(isPermissionUpdate);
    return normalized.length > 0 ? normalized : undefined;
  }

  private rejectAllPendingPermissions(error: Error) {
    for (const [id, pending] of this.pendingPermissions) {
      pending.cleanup?.();
      pending.reject(error);
      this.pendingPermissions.delete(id);
    }
  }

  private loadPersistedHistory(sessionId: string): void {
    try {
      const historyPath = this.resolveHistoryPath(sessionId);
      if (!historyPath || !fs.existsSync(historyPath)) {
        return;
      }
      this.ingestPersistedHistory(fs.readFileSync(historyPath, "utf8"));
    } catch {
      // ignore history load failures
    }
  }

  private ingestPersistedHistory(content: string): void {
    if (!content) {
      return;
    }

    const timeline: PersistedTimelineEntry[] = [];
    for (const line of content.split(/\r?\n/)) {
      this.ingestPersistedHistoryLine(line, timeline);
    }

    if (timeline.length > 0) {
      this.persistedHistory = [...this.persistedHistory, ...timeline];
      this.historyPending = true;
    }
  }

  private ingestPersistedHistoryLine(line: string, timeline: PersistedTimelineEntry[]): void {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    let entry: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      const record = toObjectRecord(parsed);
      if (!record) {
        return;
      }
      entry = record;
    } catch {
      return;
    }

    if (entry.isSidechain) {
      return;
    }

    const historyTimestamp = normalizeProviderReplayTimestamp(entry.timestamp);
    const items = this.convertHistoryEntry(entry);
    const isVisibleUserEntry =
      entry.type === "user" &&
      typeof entry.uuid === "string" &&
      !isSyntheticHistoryUserEntry(entry) &&
      !isToolResultUserEntry(entry);
    if (isVisibleUserEntry && typeof entry.uuid === "string") {
      this.rememberUserMessageId(entry.uuid);
      this.rememberRewindUserAnchor(entry.uuid);
    }
    if (entry.type === "assistant" && typeof entry.uuid === "string") {
      this.rememberRewindAssistantAnchor(entry.uuid);
    }

    if (items.length > 0) {
      timeline.push(
        ...items.map((item) => ({
          item,
          timestamp: historyTimestamp ?? undefined,
        })),
      );
    }
  }

  private resolveHistoryPath(sessionId: string): string | null {
    const cwd = this.config.cwd;
    if (!cwd) return null;
    const configDir = resolveClaudeConfigDir(this.buildSdkEnv(this.config.extra?.claude));
    const candidates = [cwd];
    try {
      const realCwd = fs.realpathSync(cwd);
      if (realCwd !== cwd) {
        candidates.push(realCwd);
      }
    } catch {
      // Fall back to the configured cwd when the path has already disappeared.
    }
    for (const candidate of candidates) {
      const sanitized = sanitizeClaudeProjectPath(candidate);
      const historyPath = path.join(configDir, "projects", sanitized, `${sessionId}.jsonl`);
      if (fs.existsSync(historyPath)) {
        return historyPath;
      }
    }
    const sanitized = sanitizeClaudeProjectPath(cwd);
    return path.join(configDir, "projects", sanitized, `${sessionId}.jsonl`);
  }

  private convertHistoryEntry(entry: ClaudeHistoryEntry): AgentTimelineItem[] {
    return convertClaudeHistoryEntry(entry, (content) => this.mapBlocksToTimeline(content));
  }

  // Maps Claude content blocks into AgentTimelineItems.
  //
  // textMessageType controls what type text blocks emit:
  //   - "assistant_message" (default): one item per text block (streaming granularity)
  //   - "user_message": coalesces all text blocks into a single user_message
  //     (matches extractUserMessageText semantics: trim each block, join with "\n\n")
  //
  // suppressAssistantText only applies when textMessageType is "assistant_message" — user text
  // must never be suppressed since the TimelineAssembler only handles assistant text.
  //
  // NOTE: convertClaudeHistoryEntry uses extractUserMessageText directly instead of this function
  // for user entries. Both paths must produce equivalent user_message items.
  private mapBlocksToTimeline(
    content: string | ReadonlyArray<unknown>,
    options?: {
      textMessageType?: "assistant_message" | "user_message";
      suppressAssistantText?: boolean;
      suppressReasoning?: boolean;
    },
  ): AgentTimelineItem[] {
    const textMessageType = options?.textMessageType ?? "assistant_message";
    const suppressText =
      textMessageType === "assistant_message" && (options?.suppressAssistantText ?? false);
    const suppressReasoning = options?.suppressReasoning ?? false;

    if (typeof content === "string") {
      if (
        !content ||
        content === INTERRUPT_TOOL_USE_PLACEHOLDER ||
        isClaudeTranscriptNoiseText(content)
      ) {
        return [];
      }
      if (suppressText) {
        return [];
      }
      return [{ type: textMessageType, text: content }];
    }

    const items: AgentTimelineItem[] = [];
    // User SDK entries can arrive as multiple text blocks, but ChisaCode treats them as one message.
    const userTextParts: string[] = [];
    for (const block of content) {
      if (!isClaudeContentChunk(block)) {
        continue;
      }
      this.mapBlockToTimeline(block, {
        items,
        userTextParts,
        textMessageType,
        suppressText,
        suppressReasoning,
      });
    }

    if (textMessageType === "user_message" && userTextParts.length > 0) {
      items.unshift({
        type: "user_message",
        text: userTextParts.join("\n\n"),
      });
    }

    return items;
  }

  private appendTextBlockToTimeline(
    block: ClaudeContentChunk,
    context: {
      items: AgentTimelineItem[];
      userTextParts: string[];
      textMessageType: "assistant_message" | "user_message";
      suppressText: boolean;
    },
  ): void {
    const { items, userTextParts, textMessageType, suppressText } = context;
    const text = typeof block.text === "string" ? block.text : "";
    if (!text || text === INTERRUPT_TOOL_USE_PLACEHOLDER || isClaudeTranscriptNoiseText(text)) {
      return;
    }
    if (textMessageType === "user_message") {
      const trimmed = text.trim();
      if (trimmed) {
        userTextParts.push(trimmed);
      }
      return;
    }
    if (!suppressText) {
      items.push({ type: "assistant_message", text });
    }
  }

  private mapBlockToTimeline(
    block: ClaudeContentChunk,
    context: {
      items: AgentTimelineItem[];
      userTextParts: string[];
      textMessageType: "assistant_message" | "user_message";
      suppressText: boolean;
      suppressReasoning: boolean;
    },
  ): void {
    switch (block.type) {
      case "text":
      case "text_delta":
        this.appendTextBlockToTimeline(block, context);
        break;
      case "thinking":
      case "thinking_delta":
        if (typeof block.thinking === "string" && block.thinking && !context.suppressReasoning) {
          context.items.push({ type: "reasoning", text: block.thinking });
        }
        break;
      case "tool_use":
      case "server_tool_use":
      case "mcp_tool_use":
        this.toolCallHandler.handleToolUseStart(block, context.items);
        break;
      case "tool_result":
      case "mcp_tool_result":
      case "web_fetch_tool_result":
      case "web_search_tool_result":
      case "code_execution_tool_result":
      case "bash_code_execution_tool_result":
      case "text_editor_code_execution_tool_result":
        this.toolCallHandler.handleToolResult(block, context.items);
        break;
      default:
        break;
    }
  }

  private mapPartialEvent(
    event: SDKPartialAssistantMessage["event"],
    options?: {
      suppressAssistantText?: boolean;
      suppressReasoning?: boolean;
    },
  ): AgentTimelineItem[] {
    if (this.toolCallHandler.updatePartialEventState(event)) {
      return [];
    }

    switch (event.type) {
      case "content_block_start":
        return isClaudeContentChunk(event.content_block)
          ? this.mapBlocksToTimeline([event.content_block], {
              suppressAssistantText: options?.suppressAssistantText,
              suppressReasoning: options?.suppressReasoning,
            })
          : [];
      case "content_block_delta":
        return isClaudeContentChunk(event.delta)
          ? this.mapBlocksToTimeline([event.delta], {
              suppressAssistantText: options?.suppressAssistantText,
              suppressReasoning: options?.suppressReasoning,
            })
          : [];
      default:
        return [];
    }
  }
}

function createAsyncMessageInput<T>(): AsyncMessageInput<T> {
  const queue: T[] = [];
  const resolvers: Array<(value: IteratorResult<T, void>) => void> = [];
  let closed = false;

  return {
    push(item: T) {
      if (closed) {
        return;
      }
      const resolve = resolvers.shift();
      if (resolve) {
        resolve({ value: item, done: false });
        return;
      }
      queue.push(item);
    },
    end() {
      closed = true;
      while (resolvers.length > 0) {
        const resolve = resolvers.shift();
        resolve?.({ value: undefined, done: true });
      }
    },
    iterable: {
      [Symbol.asyncIterator](): AsyncIterator<T, void> {
        return {
          next: (): Promise<IteratorResult<T, void>> => {
            if (queue.length > 0) {
              const value = queue.shift();
              if (value !== undefined) {
                return Promise.resolve({ value, done: false });
              }
            }
            if (closed) {
              return Promise.resolve({ value: undefined, done: true });
            }
            return new Promise<IteratorResult<T, void>>((resolve) => {
              resolvers.push(resolve);
            });
          },
        };
      },
    },
  };
}

interface ClaudeSessionCandidate {
  path: string;
  mtime: Date;
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fsPromises.access(target);
    return true;
  } catch {
    return false;
  }
}

async function collectRecentClaudeSessions(
  root: string,
  limit: number,
): Promise<ClaudeSessionCandidate[]> {
  let projectDirs: string[];
  try {
    projectDirs = await fsPromises.readdir(root);
  } catch {
    return [];
  }
  const projectFileLists = await Promise.all(
    projectDirs.map(async (dirName) => {
      const projectPath = path.join(root, dirName);
      try {
        const stats = await fsPromises.stat(projectPath);
        if (!stats.isDirectory()) return { projectPath, files: [] as string[] };
        const files = await fsPromises.readdir(projectPath);
        return { projectPath, files };
      } catch {
        return { projectPath, files: [] as string[] };
      }
    }),
  );
  const fileEntries = projectFileLists.flatMap(({ projectPath, files }) =>
    files.filter((f) => f.endsWith(".jsonl")).map((f) => path.join(projectPath, f)),
  );
  const statResults = await Promise.all(
    fileEntries.map(async (fullPath) => {
      try {
        const fileStats = await fsPromises.stat(fullPath);
        return { path: fullPath, mtime: fileStats.mtime };
      } catch {
        return null;
      }
    }),
  );
  const candidates: ClaudeSessionCandidate[] = statResults.filter(
    (entry): entry is ClaudeSessionCandidate => entry !== null,
  );
  return candidates.sort((a, b) => b.mtime.getTime() - a.mtime.getTime()).slice(0, limit);
}

interface ClaudeSessionDescriptorAccumulator {
  sessionId: string | null;
  cwd: string | null;
  title: string | null;
  timeline: AgentTimelineItem[];
}

function isFinishedAccumulator(acc: ClaudeSessionDescriptorAccumulator): boolean {
  return Boolean(acc.sessionId && acc.cwd && acc.title);
}

function applyClaudeSessionEntryToAccumulator(
  entryRaw: unknown,
  acc: ClaudeSessionDescriptorAccumulator,
): void {
  const entry = toObjectRecord(entryRaw);
  if (!entry) {
    return;
  }
  if (entry.isSidechain) {
    return;
  }
  if (entry.type === "user" && isSyntheticUserEntry(entry)) {
    return;
  }
  if (!acc.sessionId && typeof entry.sessionId === "string") {
    acc.sessionId = entry.sessionId;
  }
  if (!acc.cwd && typeof entry.cwd === "string") {
    acc.cwd = entry.cwd;
  }
  if (entry.type === "user" && entry.message) {
    const text = extractClaudeUserText(entry.message);
    if (text) {
      if (!acc.title) {
        acc.title = text;
      }
      acc.timeline.push({ type: "user_message", text });
    }
    return;
  }
  if (entry.type === "assistant" && entry.message) {
    const text = extractClaudeUserText(entry.message);
    if (text) {
      acc.timeline.push({ type: "assistant_message", text });
    }
  }
}

async function parseClaudeSessionDescriptor(
  filePath: string,
  mtime: Date,
): Promise<PersistedAgentDescriptor | null> {
  let content: string;
  try {
    content = await fsPromises.readFile(filePath, "utf8");
  } catch {
    return null;
  }

  const acc: ClaudeSessionDescriptorAccumulator = {
    sessionId: null,
    cwd: null,
    title: null,
    timeline: [],
  };

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    let entry: unknown;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    applyClaudeSessionEntryToAccumulator(entry, acc);
    if (isFinishedAccumulator(acc)) {
      break;
    }
  }

  const { sessionId, cwd, title, timeline } = acc;

  if (!sessionId || !cwd) {
    return null;
  }

  const persistence: AgentPersistenceHandle = {
    provider: "claude",
    sessionId,
    nativeHandle: sessionId,
    metadata: {
      provider: "claude",
      cwd,
    },
  };

  return {
    provider: "claude",
    sessionId,
    cwd,
    title: (title ?? "").trim() || `Claude session ${sessionId.slice(0, 8)}`,
    lastActivityAt: mtime,
    persistence,
    timeline,
  };
}

function extractClaudeUserText(messageRaw: unknown): string | null {
  const message = toObjectRecord(messageRaw);
  if (!message) {
    return null;
  }
  if (typeof message.content === "string") {
    const normalized = message.content.trim();
    return normalized && !isClaudeTranscriptNoiseText(normalized) ? normalized : null;
  }
  if (typeof message.text === "string") {
    const normalized = message.text.trim();
    return normalized && !isClaudeTranscriptNoiseText(normalized) ? normalized : null;
  }
  if (isUnknownArray(message.content)) {
    for (const block of message.content) {
      const blockRecord = toObjectRecord(block);
      if (blockRecord && typeof blockRecord.text === "string") {
        const normalized = blockRecord.text.trim();
        if (normalized && !isClaudeTranscriptNoiseText(normalized)) {
          return normalized;
        }
      }
    }
  }
  return null;
}
