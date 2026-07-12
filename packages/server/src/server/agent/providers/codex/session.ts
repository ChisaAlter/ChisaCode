import {
  type AgentFeature,
  type AgentMode,
  type AgentPermissionRequest,
  type AgentPermissionResponse,
  type AgentPermissionResult,
  type AgentPromptContentBlock,
  type AgentPromptInput,
  type AgentRunOptions,
  type AgentRunResult,
  type AgentRuntimeInfo,
  type AgentSession,
  type AgentSessionConfig,
  type AgentSkill,
  type AgentSlashCommand,
  type AgentStreamEvent,
  type AgentTimelineItem,
  type ToolCallTimelineItem,
  type AgentUsage,
} from "../../agent-sdk-types.js";
import type { Logger } from "pino";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { renderPromptAttachmentAsText } from "../../prompt-attachments.js";
import { composeSystemPromptParts } from "../../system-prompt.js";
import { buildCodexFeatures, codexModelSupportsFastMode } from "../codex-feature-definitions.js";
import {
  CodexAppServerClient,
  parseCodexThreadForkResponse,
  parseCodexThreadRollbackResponse,
  type CodexThreadForkParams,
  type CodexThreadForkResponse,
  type CodexThreadRollbackParams,
  type CodexThreadRollbackResponse,
  type CodexAppServerTraceContext,
} from "./app-server-transport.js";
import { revertCodexConversation } from "./rewind.js";
import { CodexSessionEventBus } from "./session-event-bus.js";
import {
  buildCodexAppServerInitializeParams,
  buildRuntimeModelIdentityInstructions,
  type CodexMcpServerConfig,
  toCodexMcpConfig,
} from "./runtime-config.js";
import type { CodexClientLike } from "./client-runtime.js";
import {
  CODEX_APP_SERVER_CAPABILITIES,
  CODEX_PROVIDER,
  type CodexAppServerAgentDeps,
} from "./client.js";
import { CodexUserMessageTurnState } from "./user-message-turn-state.js";
import { CodexContextCompactionState } from "./context-compaction-state.js";
import { CodexDeltaNotificationHandler } from "./delta-notification-handler.js";
import {
  cleanupStaleCodexImageAttachments,
  writeCodexImageAttachment,
} from "./image-attachments.js";
import {
  loadCodexThreadHistoryTimeline,
  normalizeCodexThreadItemType,
  type PersistedTimelineEntry,
  threadItemToTimeline,
} from "./history.js";
import {
  applyAgentSkillPolicy,
  expandCodexCustomPrompt,
  listCodexCustomPrompts,
  listCodexSkillEntries,
  listCodexSkills,
  parseCodexFrontMatter,
  resolveCodexHomeDir,
  resolveSkillPolicy,
  toAgentSkill,
} from "./skills.js";
import type { ParsedCodexNotification } from "./notifications.js";
import { CodexNotificationRouter } from "./notification-router.js";
import { CodexNotificationStreamState } from "./notification-stream-state.js";
import { CodexToolNotificationHandler } from "./tool-notification-handler.js";
import { CodexPermissionController } from "./permission-controller.js";
import { mapCodexPlanToToolCall, planStepsToMarkdown } from "./permissions.js";
import { CodexSubAgentTracker } from "./sub-agent-tracker.js";
import { readCodexConfiguredDefaults, type CodexConfiguredDefaults } from "./models.js";
import {
  applyApprovalsReviewerParam,
  buildCodexTurnStartParams,
  CODEX_MODES,
  DEFAULT_CODEX_MODE_ID,
  MODE_PRESETS,
  normalizeCodexThinkingOptionId,
  shouldPromoteThreadResponseToAutoReview,
  validateCodexMode,
} from "./turn-config.js";
import { runProviderTurn } from "../provider-runner.js";

export { cleanupStaleCodexImageAttachments, threadItemToTimeline };
export { mapCodexPatchNotificationToToolCall } from "./notification-timeline.js";

export {
  buildCodexAppServerEnv,
  findCodexMicrosoftStoreBinary,
  findDefaultCodexBinary,
} from "./launch.js";

export {
  formatCodexQuestionPrompts,
  mapCodexPlanToToolCall,
  mapCodexQuestionRequestToToolCall,
  normalizeCodexQuestionPrompts,
  planStepsToMarkdown,
} from "./permissions.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

const TURN_START_TIMEOUT_MS = 90 * 1000;
const INTERRUPT_TIMEOUT_MS = 2_000;
const CODEX_TEXTUAL_TOOL_CALL_ERROR =
  "Codex returned a tool call transcript as plain text, so no tool was executed.";

type GoalSubcommand =
  | { kind: "set"; objective: string }
  | { kind: "pause" }
  | { kind: "resume" }
  | { kind: "clear" }
  | { kind: "usage" };

function parseGoalSubcommand(args: string | undefined): GoalSubcommand {
  const trimmed = (args ?? "").trim();
  if (!trimmed) return { kind: "usage" };
  const lower = trimmed.toLowerCase();
  if (lower === "pause") return { kind: "pause" };
  if (lower === "resume") return { kind: "resume" };
  if (lower === "clear") return { kind: "clear" };
  return { kind: "set", objective: trimmed };
}

function formatOutOfBandStatusMessage(text: string): string {
  return `${text.replace(/\n+$/u, "")}\n\n`;
}

interface CodexAppServerClientLike extends CodexClientLike {
  forkThread?(params: CodexThreadForkParams): Promise<CodexThreadForkResponse>;
  rollbackThread?(params: CodexThreadRollbackParams): Promise<CodexThreadRollbackResponse>;
}

function looksLikeTextualCodexToolCallTranscript(text: string): boolean {
  if (!text.includes("<tool_call>") || !text.includes("</tool_call>")) {
    return false;
  }
  if (!text.includes("<tool_result>") && !text.includes("</tool_result>")) {
    return false;
  }
  return /"name"\s*:\s*"(?:apply_patch|apply_diff|write_file|create_file|shell|exec|command|bash|Bash)"/.test(
    text,
  );
}

export { listCodexSkillEntries, listCodexSkills } from "./skills.js";

export { normalizeCodexOutputSchema } from "./turn-config.js";

function firstPositiveFiniteNumber(primary: unknown, secondary: unknown): number | undefined {
  if (typeof primary === "number" && Number.isFinite(primary) && primary > 0) {
    return primary;
  }
  if (typeof secondary === "number" && Number.isFinite(secondary) && secondary > 0) {
    return secondary;
  }
  return undefined;
}

function toObjectRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

export function toAgentUsage(tokenUsage: unknown): AgentUsage | undefined {
  const usage = toObjectRecord(tokenUsage);
  if (!usage) return undefined;
  const last = toObjectRecord(usage.last);
  const contextWindowMaxTokens = firstPositiveFiniteNumber(
    usage.model_context_window,
    usage.modelContextWindow,
  );
  const contextWindowUsedTokens = firstPositiveFiniteNumber(last?.total_tokens, last?.totalTokens);
  return {
    inputTokens: typeof last?.inputTokens === "number" ? last.inputTokens : undefined,
    cachedInputTokens:
      typeof last?.cachedInputTokens === "number" ? last.cachedInputTokens : undefined,
    outputTokens: typeof last?.outputTokens === "number" ? last.outputTokens : undefined,
    ...(contextWindowMaxTokens !== undefined ? { contextWindowMaxTokens } : {}),
    ...(contextWindowUsedTokens !== undefined ? { contextWindowUsedTokens } : {}),
  };
}

function readCodexThread(client: CodexAppServerClientLike, threadId: string): Promise<unknown> {
  return client.request("thread/read", {
    threadId,
    includeTurns: true,
  });
}

export async function forkCodexThread(
  client: CodexAppServerClientLike,
  params: CodexThreadForkParams,
): Promise<CodexThreadForkResponse> {
  if (client.forkThread) {
    return client.forkThread(params);
  }
  return parseCodexThreadForkResponse(await client.request("thread/fork", params));
}

export async function rollbackCodexThread(
  client: CodexAppServerClientLike,
  params: CodexThreadRollbackParams,
): Promise<CodexThreadRollbackResponse> {
  if (client.rollbackThread) {
    return client.rollbackThread(params);
  }
  return parseCodexThreadRollbackResponse(await client.request("thread/rollback", params));
}

interface CodexSkillPromptBlock {
  type: "skill";
  name: string;
  path: string;
}

type CodexPromptContentBlock = AgentPromptContentBlock | CodexSkillPromptBlock;
type CodexPromptInput = string | CodexPromptContentBlock[];
interface CodexTextElement {
  byteRange: {
    start: number;
    end: number;
  };
  placeholder: string | null;
}

type CodexAppServerUserInput =
  | {
      type: "text";
      text: string;
      text_elements: CodexTextElement[];
    }
  | {
      type: "localImage";
      path: string;
    }
  | CodexSkillPromptBlock;

export async function codexAppServerTurnInputFromPrompt(
  prompt: CodexPromptInput,
  logger: Logger,
): Promise<CodexAppServerUserInput[]> {
  if (typeof prompt === "string") {
    return [toCodexTextInput(prompt)];
  }

  const output: CodexAppServerUserInput[] = [];
  let previousTextBlock = false;
  for (const block of prompt) {
    if (block.type === "text") {
      output.push(toCodexTextInput(block.text));
      previousTextBlock = block.text.length > 0;
      continue;
    }
    if (block.type === "skill") {
      output.push(block);
      previousTextBlock = false;
      continue;
    }
    if (block.type === "image") {
      try {
        const filePath = await writeCodexImageAttachment(block.mimeType, block.data);
        output.push({ type: "localImage", path: filePath });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn({ message }, "Failed to write Codex image attachment");
        output.push({
          ...toCodexTextInput(`User attached image (failed to write temp file): ${message}`),
        });
      }
      previousTextBlock = false;
      continue;
    }
    const attachmentText = renderPromptAttachmentAsText(block);
    output.push(toCodexTextInput(previousTextBlock ? `\n\n${attachmentText}` : attachmentText));
    previousTextBlock = true;
  }
  return output;
}

function toCodexTextInput(text: string): Extract<CodexAppServerUserInput, { type: "text" }> {
  return {
    type: "text",
    text,
    text_elements: [],
  };
}

export class CodexAppServerAgentSession implements AgentSession {
  readonly provider = CODEX_PROVIDER;
  readonly capabilities = CODEX_APP_SERVER_CAPABILITIES;

  private readonly logger: Logger;
  private readonly config: AgentSessionConfig;
  private currentMode: string;
  private currentThreadId: string | null = null;
  private currentTurnId: string | null = null;
  private client: CodexAppServerClient | null = null;
  private readonly eventBus: CodexSessionEventBus;
  private nextTurnOrdinal = 0;
  private activeForegroundTurnId: string | null = null;
  private cachedRuntimeInfo: AgentRuntimeInfo | null = null;
  private serviceTier: "fast" | null = null;
  private planModeEnabled = false;
  private historyPending = false;
  private persistedHistory: PersistedTimelineEntry[] = [];
  private readonly permissionController: CodexPermissionController;
  private readonly notificationStream = new CodexNotificationStreamState();
  private readonly notificationRouter: CodexNotificationRouter;
  private readonly deltaNotificationHandler: CodexDeltaNotificationHandler;
  private readonly toolNotificationHandler: CodexToolNotificationHandler;
  private readonly subAgentTracker = new CodexSubAgentTracker();
  private warnedUnknownNotificationMethods = new Set<string>();
  private warnedInvalidNotificationPayloads = new Set<string>();
  private textualToolCallError: string | null = null;
  private latestUsage: AgentUsage | undefined;
  private latestPlanResult: { callId: string; text: string; turnId: string | null } | null = null;
  private readonly userMessageTurns = new CodexUserMessageTurnState();
  private readonly compactionState = new CodexContextCompactionState();
  private connected = false;
  private collaborationModes: Array<{
    name: string;
    mode?: string | null;
    model?: string | null;
    reasoning_effort?: string | null;
    developer_instructions?: string | null;
  }> = [];
  private resolvedCollaborationMode: {
    mode: string;
    settings: Record<string, unknown>;
    name: string;
  } | null = null;
  private cachedSkills: Array<{ name: string; description: string; path: string }> = [];

  constructor(
    config: AgentSessionConfig,
    private readonly resumeHandle: { sessionId: string; metadata?: Record<string, unknown> } | null,
    logger: Logger,
    private readonly spawnAppServer: () => Promise<ChildProcessWithoutNullStreams>,
    private readonly deps: CodexAppServerAgentDeps = {},
    private readonly ephemeral: boolean = false,
    private readonly goalsEnabled: boolean = false,
    private readonly autoReviewEnabled: boolean = false,
    private readonly agentId?: string,
  ) {
    this.logger = logger.child({
      module: "agent",
      provider: CODEX_PROVIDER,
      agentId: this.agentId,
    });
    this.eventBus = new CodexSessionEventBus(this.logger, {
      agentId: this.agentId,
      getSessionId: () => this.currentThreadId,
      getTurnId: () => this.activeForegroundTurnId,
    });
    this.deltaNotificationHandler = new CodexDeltaNotificationHandler({
      notificationStream: this.notificationStream,
      resolveSubAgentCallId: (threadId) => this.getSubAgentCallIdForThread(threadId),
      upsertSubAgentItem: (callId, itemId, item) =>
        this.subAgentTracker.upsertChildItem(callId, itemId, item),
      emitSubAgentActivity: (callId, status) => this.emitSubAgentActivityUpdate(callId, status),
      emit: (item) => this.eventBus.emit({ type: "timeline", provider: CODEX_PROVIDER, item }),
    });
    this.toolNotificationHandler = new CodexToolNotificationHandler({
      logger: this.logger,
      notificationStream: this.notificationStream,
      getCwd: () => this.config.cwd ?? null,
      emit: (item) => this.eventBus.emit({ type: "timeline", provider: CODEX_PROVIDER, item }),
    });
    this.permissionController = new CodexPermissionController({
      getCwd: () => this.config.cwd ?? null,
      emit: (event) => this.eventBus.emit(event),
      onPlanApproved: () => this.applyFeatureValue("plan_mode", false),
    });
    this.notificationRouter = new CodexNotificationRouter({
      onParsed: (method, params, parsed) => this.traceParsedNotification(method, params, parsed),
      onDelta: (parsed) => this.deltaNotificationHandler.handle(parsed),
      onThreadStarted: (parsed) => this.handleThreadStartedNotification(parsed),
      onTurnStarted: (parsed) => this.handleTurnStartedNotification(parsed),
      onTurnCompleted: (parsed) => this.handleTurnCompletedNotification(parsed),
      onPlanUpdated: (parsed) => this.handlePlanUpdatedNotification(parsed),
      onTokenUsageUpdated: (parsed) => this.handleTokenUsageUpdatedNotification(parsed),
      onContextCompacted: (parsed) => this.handleContextCompactedNotification(parsed),
      onThreadRolledBack: (parsed) => this.handleThreadRolledBackNotification(parsed),
      onExecCommandStarted: (parsed) =>
        this.toolNotificationHandler.handleExecCommandStarted(parsed),
      onExecCommandCompleted: (parsed) =>
        this.toolNotificationHandler.handleExecCommandCompleted(parsed),
      onTerminalInteraction: (parsed) =>
        this.toolNotificationHandler.handleTerminalInteraction(parsed),
      onPatchApplyStarted: (parsed) => this.toolNotificationHandler.handlePatchApplyStarted(parsed),
      onPatchApplyCompleted: (parsed) =>
        this.toolNotificationHandler.handlePatchApplyCompleted(parsed),
      onItemCompleted: (parsed) => this.handleItemCompletedNotification(parsed),
      onItemStarted: (parsed) => this.handleItemStartedNotification(parsed),
      onInvalidPayload: (parsed) =>
        this.warnInvalidNotificationPayload(parsed.method, parsed.params),
      onUnknownMethod: (parsed) => this.warnUnknownNotificationMethod(parsed.method, parsed.params),
    });
    const modeId = config.modeId ?? DEFAULT_CODEX_MODE_ID;
    validateCodexMode(modeId);
    this.currentMode = modeId;
    this.config = { ...config, modeId };
    this.config.thinkingOptionId = normalizeCodexThinkingOptionId(this.config.thinkingOptionId);
    if (this.config.featureValues?.fast_mode && codexModelSupportsFastMode(this.config.model)) {
      this.serviceTier = "fast";
    }
    if (this.config.featureValues?.plan_mode) {
      this.planModeEnabled = true;
    }

    if (this.resumeHandle?.sessionId) {
      this.currentThreadId = this.resumeHandle.sessionId;
      this.historyPending = true;
    }
  }

  get id(): string | null {
    return this.currentThreadId;
  }

  get features(): AgentFeature[] {
    return buildCodexFeatures({
      modelId: this.config.model,
      fastModeEnabled: this.serviceTier === "fast",
      planModeEnabled: this.planModeEnabled,
      planModeAvailable: this.hasPlanCollaborationMode(),
    });
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    const child = await this.spawnAppServer();
    this.client = new CodexAppServerClient(child, this.logger, () => this.traceContext());
    this.client.setNotificationHandler((method, params) => this.handleNotification(method, params));
    this.registerRequestHandlers();

    await this.client.request("initialize", buildCodexAppServerInitializeParams());
    this.client.notify("initialized", {});

    await this.loadCollaborationModes();
    await this.loadSkills();

    if (this.currentThreadId) {
      await this.ensureThreadLoaded();
      await this.loadPersistedHistory();
    }

    this.connected = true;
  }

  private traceContext(): CodexAppServerTraceContext {
    return {
      agentId: this.agentId,
      sessionId: this.currentThreadId ?? undefined,
      turnId: this.activeForegroundTurnId ?? undefined,
    };
  }

  private async loadCollaborationModes(): Promise<void> {
    if (!this.client) return;
    try {
      const response = toObjectRecord(await this.client.request("collaborationMode/list", {}));
      const data = Array.isArray(response?.data) ? response.data : [];
      this.collaborationModes = data.map((entry) => {
        const record = toObjectRecord(entry);
        return {
          name: typeof record?.name === "string" ? record.name : "",
          mode: typeof record?.mode === "string" ? record.mode : null,
          model: typeof record?.model === "string" ? record.model : null,
          reasoning_effort:
            typeof record?.reasoning_effort === "string" ? record.reasoning_effort : null,
          developer_instructions:
            typeof record?.developer_instructions === "string"
              ? record.developer_instructions
              : null,
        };
      });
    } catch (error) {
      this.logger.trace(
        {
          agentId: this.agentId,
          provider: CODEX_PROVIDER,
          sessionId: this.currentThreadId,
          turnId: this.activeForegroundTurnId ?? undefined,
          error,
        },
        "provider.codex.metadata.collaboration_modes_failed",
      );
      this.collaborationModes = [];
    }
    this.refreshResolvedCollaborationMode();
  }

  private async loadSkills(): Promise<void> {
    if (!this.client) return;
    try {
      const response = toObjectRecord(
        await this.client.request("skills/list", {
          cwd: [this.config.cwd],
        }),
      );
      const entries = Array.isArray(response?.data) ? response.data : [];
      const skillsByName = new Map<string, { name: string; description: string; path: string }>();
      for (const entry of entries) {
        const entryRecord = toObjectRecord(entry);
        const list = Array.isArray(entryRecord?.skills) ? entryRecord.skills : [];
        for (const skill of list) {
          const skillRecord = toObjectRecord(skill);
          if (typeof skillRecord?.name !== "string" || typeof skillRecord?.path !== "string")
            continue;
          if (!skillsByName.has(skillRecord.name)) {
            skillsByName.set(skillRecord.name, {
              name: skillRecord.name,
              description: resolveSkillDescription(skillRecord),
              path: skillRecord.path,
            });
          }
        }
      }
      this.cachedSkills = Array.from(skillsByName.values());
    } catch (error) {
      this.logger.trace(
        {
          agentId: this.agentId,
          provider: CODEX_PROVIDER,
          sessionId: this.currentThreadId,
          turnId: this.activeForegroundTurnId ?? undefined,
          error,
        },
        "provider.codex.metadata.skills_failed",
      );
      this.cachedSkills = [];
    }
  }

  private enabledCachedSkills(): Array<{ name: string; description: string; path: string }> {
    return applyAgentSkillPolicy(this.cachedSkills, resolveSkillPolicy(this.config));
  }

  private findCollaborationMode(target: "code" | "plan"): {
    name: string;
    mode?: string | null;
    model?: string | null;
    reasoning_effort?: string | null;
    developer_instructions?: string | null;
  } | null {
    if (this.collaborationModes.length === 0) return null;
    const findByName = (predicate: (name: string) => boolean) =>
      this.collaborationModes.find((entry) => predicate(entry.name.toLowerCase()));

    if (target === "plan") {
      return findByName((name) => name.includes("plan") || name.includes("read")) ?? null;
    }

    return (
      findByName((name) => name.includes("auto") || name.includes("code")) ??
      this.collaborationModes.find((entry) => {
        const name = entry.name.toLowerCase();
        return !name.includes("plan") && !name.includes("read");
      }) ??
      this.collaborationModes[0] ??
      null
    );
  }

  private hasPlanCollaborationMode(): boolean {
    return this.findCollaborationMode("plan") !== null;
  }

  private resolveCollaborationMode(): {
    mode: string;
    settings: Record<string, unknown>;
    name: string;
  } | null {
    const match = this.findCollaborationMode(this.planModeEnabled ? "plan" : "code");
    if (!match) return null;

    const settings: Record<string, unknown> = {};
    if (match.model) settings.model = match.model;
    if (match.reasoning_effort) settings.reasoning_effort = match.reasoning_effort;
    const developerInstructions = composeSystemPromptParts(
      match.developer_instructions,
      this.config.systemPrompt,
      this.config.daemonAppendSystemPrompt,
      buildRuntimeModelIdentityInstructions(this.config, this.deps.customProvider),
    );
    if (developerInstructions) settings.developer_instructions = developerInstructions;
    if (this.config.model) settings.model = this.config.model;
    const thinkingOptionId = normalizeCodexThinkingOptionId(this.config.thinkingOptionId);
    if (thinkingOptionId) settings.reasoning_effort = thinkingOptionId;
    return { mode: match.mode ?? "code", settings, name: match.name };
  }

  private refreshResolvedCollaborationMode(): void {
    this.resolvedCollaborationMode = this.resolveCollaborationMode();
  }

  private applyFeatureValue(featureId: "fast_mode" | "plan_mode", value: boolean): void {
    this.config.featureValues = {
      ...this.config.featureValues,
      [featureId]: value,
    };

    if (featureId === "fast_mode") {
      this.serviceTier = value ? "fast" : null;
      this.cachedRuntimeInfo = null;
      return;
    }

    this.planModeEnabled = value;
    this.refreshResolvedCollaborationMode();
    this.cachedRuntimeInfo = null;
  }

  private rememberPlanResult(item: ToolCallTimelineItem): void {
    if (item.detail.type !== "plan") {
      return;
    }

    this.latestPlanResult = {
      callId: item.callId,
      text: item.detail.text,
      turnId: this.currentTurnId,
    };
  }

  private registerRequestHandlers(): void {
    if (!this.client) return;

    this.client.setRequestHandler("item/commandExecution/requestApproval", (params) =>
      this.handleCommandApprovalRequest(params),
    );
    this.client.setRequestHandler("item/fileChange/requestApproval", (params) =>
      this.handleFileChangeApprovalRequest(params),
    );
    this.client.setRequestHandler("item/tool/requestUserInput", (params) =>
      this.handleToolApprovalRequest(params),
    );
    // COMPAT(codex-tool-request-user-input): remove when supported Codex builds only emit item/tool/requestUserInput.
    this.client.setRequestHandler("tool/requestUserInput", (params) =>
      this.handleToolApprovalRequest(params),
    );
  }

  private async loadPersistedHistory(): Promise<void> {
    if (!this.client || !this.currentThreadId) return;
    const client = this.client;
    const threadId = this.currentThreadId;

    const timeline = await loadCodexThreadHistoryTimeline({
      threadId,
      cwd: this.config.cwd ?? null,
      requestThread: (threadIdToRead) => {
        return readCodexThread(client, threadIdToRead);
      },
    });
    this.userMessageTurns.reset();
    for (const entry of timeline) {
      if (entry.item.type === "user_message") {
        this.userMessageTurns.remember(entry.item.messageId);
      }
    }
    if (timeline.length > 0) {
      this.persistedHistory = timeline;
      this.historyPending = true;
    }
  }

  private async ensureThreadLoaded(): Promise<void> {
    if (!this.client || !this.currentThreadId) return;
    try {
      const loaded = toObjectRecord(await this.client.request("thread/loaded/list", {}));
      const ids = Array.isArray(loaded?.data) ? loaded.data : [];
      if (ids.includes(this.currentThreadId)) {
        return;
      }
      const params: Record<string, unknown> = { threadId: this.currentThreadId };
      const developerInstructions = composeSystemPromptParts(
        this.config.systemPrompt,
        this.config.daemonAppendSystemPrompt,
        buildRuntimeModelIdentityInstructions(this.config, this.deps.customProvider),
      );
      if (developerInstructions) {
        params.developerInstructions = developerInstructions;
      }
      const codexConfig = this.buildCodexInnerConfig();
      if (codexConfig) {
        params.config = codexConfig;
      }
      await this.client.request("thread/resume", params);
    } catch (error) {
      const threadId = this.currentThreadId;
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn({ error, threadId }, "Failed to resume persisted Codex thread");
      throw new Error(`Failed to resume Codex thread ${threadId}: ${message}`, { cause: error });
    }
  }

  private parseSlashCommandInput(text: string): { commandName: string; args?: string } | null {
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
    return rawArgs.length > 0 ? { commandName, args: rawArgs } : { commandName };
  }

  private async resolveSlashCommandInvocation(
    prompt: AgentPromptInput,
  ): Promise<{ commandName: string; args?: string } | null> {
    if (typeof prompt !== "string") {
      return null;
    }
    const parsed = this.parseSlashCommandInput(prompt);
    if (!parsed) {
      return null;
    }
    try {
      const commands = await this.listCommands();
      return commands.some((command) => command.name === parsed.commandName) ? parsed : null;
    } catch (error) {
      this.logger.warn(
        { err: error, commandName: parsed.commandName },
        "Failed to resolve slash command; falling back to plain prompt input",
      );
      return null;
    }
  }

  private async buildCommandPromptInput(
    commandName: string,
    args?: string,
  ): Promise<CodexPromptInput> {
    if (commandName.startsWith("prompts:")) {
      const promptName = commandName.slice("prompts:".length);
      const codexHome = resolveCodexHomeDir();
      const promptPath = path.join(codexHome, "prompts", `${promptName}.md`);
      const raw = await fs.readFile(promptPath, "utf8");
      const parsed = parseCodexFrontMatter(raw);
      return expandCodexCustomPrompt(parsed.body, args);
    }

    if (!this.connected) {
      await this.connect();
    } else {
      await this.loadSkills();
    }
    const skill = this.enabledCachedSkills().find((entry) => entry.name === commandName);
    if (skill) {
      const trimmedArgs = args?.trim() ?? "";
      const text = trimmedArgs ? `$${skill.name} ${trimmedArgs}` : `$${skill.name}`;
      const input: CodexPromptContentBlock[] = [
        { type: "skill", name: skill.name, path: skill.path },
        { type: "text", text },
      ];
      return input;
    }

    return args ? `$${commandName} ${args}` : `$${commandName}`;
  }

  private async buildTurnStartParams(prompt: CodexPromptInput, options?: AgentRunOptions) {
    const userInput = await this.buildUserInput(prompt);
    const developerInstructions = composeSystemPromptParts(
      this.config.systemPrompt,
      this.config.daemonAppendSystemPrompt,
      buildRuntimeModelIdentityInstructions(this.config, this.deps.customProvider),
    );
    return buildCodexTurnStartParams({
      threadId: this.currentThreadId,
      userInput,
      modeId: this.currentMode,
      config: this.config,
      serviceTier: this.serviceTier,
      collaborationMode: this.resolvedCollaborationMode,
      outputSchema: options?.outputSchema,
      developerInstructions,
      codexConfig: this.buildCodexInnerConfig(),
    });
  }

  private logTurnStartSummary({
    turnId,
    thinkingOptionId,
    approvalPolicy,
    sandboxPolicyType,
    hasOutputSchema,
    hasDeveloperInstructions,
    hasCodexConfig,
  }: {
    turnId: string;
    thinkingOptionId?: string;
    approvalPolicy: string;
    sandboxPolicyType: string;
    hasOutputSchema: boolean;
    hasDeveloperInstructions: boolean;
    hasCodexConfig: boolean;
  }): void {
    this.logger.info(
      {
        turnId,
        threadId: this.currentThreadId,
        model: this.config.model ?? null,
        modeId: this.currentMode ?? null,
        effort: thinkingOptionId ?? null,
        serviceTier: this.serviceTier,
        cwd: this.config.cwd ?? null,
        approvalPolicy,
        sandboxPolicyType,
        hasCollaborationMode: Boolean(this.resolvedCollaborationMode),
        hasOutputSchema,
        hasDeveloperInstructions,
        hasCodexConfig,
      },
      "Starting Codex app-server turn",
    );
  }

  async run(prompt: AgentPromptInput, options?: AgentRunOptions): Promise<AgentRunResult> {
    return runProviderTurn({
      prompt,
      runOptions: options,
      startTurn: (p, o) => this.startTurn(p, o),
      subscribe: (callback) => this.subscribe(callback),
      getSessionId: async () => (await this.getRuntimeInfo()).sessionId ?? "",
      reduceFinalText: ({ current, item }) => {
        if (item.type === "assistant_message") {
          return item.text;
        }
        if (item.type === "tool_call" && item.detail.type === "plan") {
          return item.detail.text;
        }
        return current;
      },
    });
  }

  async startTurn(
    prompt: AgentPromptInput,
    options?: AgentRunOptions,
  ): Promise<{ turnId: string }> {
    if (this.activeForegroundTurnId) {
      throw new Error("A foreground turn is already active");
    }

    await this.connect();
    if (!this.client) {
      throw new Error("Codex client not initialized");
    }

    const slashCommand = await this.resolveSlashCommandInvocation(prompt);
    const effectivePrompt = slashCommand
      ? await this.buildCommandPromptInput(slashCommand.commandName, slashCommand.args)
      : prompt;

    if (this.currentThreadId) {
      await this.ensureThreadLoaded();
    } else {
      await this.ensureThread();
    }

    const turnStart = await this.buildTurnStartParams(effectivePrompt, options);

    const turnId = this.createTurnId();
    this.activeForegroundTurnId = turnId;

    try {
      this.logTurnStartSummary({
        turnId,
        thinkingOptionId: turnStart.thinkingOptionId,
        approvalPolicy: turnStart.approvalPolicy,
        sandboxPolicyType: turnStart.sandboxPolicyType,
        hasOutputSchema: turnStart.hasOutputSchema,
        hasDeveloperInstructions: turnStart.hasDeveloperInstructions,
        hasCodexConfig: turnStart.hasCodexConfig,
      });
      await this.client.request("turn/start", turnStart.params, TURN_START_TIMEOUT_MS);
    } catch (error) {
      this.activeForegroundTurnId = null;
      throw error;
    }

    return { turnId };
  }

  subscribe(callback: (event: AgentStreamEvent) => void): () => void {
    return this.eventBus.subscribe(callback);
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
        provider: CODEX_PROVIDER,
        item: entry.item,
        timestamp: entry.timestamp,
      };
    }
  }

  async getRuntimeInfo(): Promise<AgentRuntimeInfo> {
    if (this.cachedRuntimeInfo) return { ...this.cachedRuntimeInfo };
    if (!this.connected) {
      await this.connect();
    }
    if (!this.currentThreadId) {
      await this.ensureThread();
    }
    const info: AgentRuntimeInfo = {
      provider: CODEX_PROVIDER,
      sessionId: this.currentThreadId,
      model: this.config.model ?? null,
      thinkingOptionId: normalizeCodexThinkingOptionId(this.config.thinkingOptionId) ?? null,
      modeId: this.currentMode ?? null,
      extra: this.resolvedCollaborationMode
        ? { collaborationMode: this.resolvedCollaborationMode.name }
        : undefined,
    };
    this.cachedRuntimeInfo = info;
    return { ...info };
  }

  async getAvailableModes(): Promise<AgentMode[]> {
    if (this.autoReviewEnabled) {
      return CODEX_MODES;
    }
    return CODEX_MODES.filter((mode) => mode.id !== "auto-review");
  }

  async getCurrentMode(): Promise<string | null> {
    return this.currentMode ?? null;
  }

  async setMode(modeId: string): Promise<void> {
    validateCodexMode(modeId);
    this.currentMode = modeId;
    this.cachedRuntimeInfo = null;
  }

  async setModel(modelId: string | null): Promise<void> {
    this.config.model = modelId ?? undefined;
    if (!codexModelSupportsFastMode(this.config.model)) {
      this.serviceTier = null;
    }
    this.refreshResolvedCollaborationMode();
    this.cachedRuntimeInfo = null;
  }

  async setThinkingOption(thinkingOptionId: string | null): Promise<void> {
    this.config.thinkingOptionId = normalizeCodexThinkingOptionId(thinkingOptionId);
    this.refreshResolvedCollaborationMode();
    this.cachedRuntimeInfo = null;
  }

  async setFeature(featureId: string, value: unknown): Promise<void> {
    if (featureId === "fast_mode") {
      if (Boolean(value) && !codexModelSupportsFastMode(this.config.model)) {
        throw new Error(
          `Codex fast mode is not available for model '${this.config.model ?? "default"}'`,
        );
      }
      this.applyFeatureValue("fast_mode", Boolean(value));
      return;
    }
    if (featureId === "plan_mode") {
      this.applyFeatureValue("plan_mode", Boolean(value));
      return;
    }
    throw new Error(`Unknown Codex feature: ${featureId}`);
  }

  getPendingPermissions(): AgentPermissionRequest[] {
    return this.permissionController.getPendingPermissions();
  }

  async respondToPermission(
    requestId: string,
    response: AgentPermissionResponse,
  ): Promise<AgentPermissionResult | void> {
    return this.permissionController.respondToPermission(requestId, response);
  }

  describePersistence(): {
    provider: typeof CODEX_PROVIDER;
    sessionId: string;
    nativeHandle: string;
    metadata: Record<string, unknown>;
  } | null {
    if (!this.currentThreadId) return null;
    const thinkingOptionId = normalizeCodexThinkingOptionId(this.config.thinkingOptionId) ?? null;
    return {
      provider: CODEX_PROVIDER,
      sessionId: this.currentThreadId,
      nativeHandle: this.currentThreadId,
      metadata: {
        provider: CODEX_PROVIDER,
        cwd: this.config.cwd,
        title: this.config.title ?? null,
        threadId: this.currentThreadId,
        modeId: this.currentMode,
        model: this.config.model ?? null,
        thinkingOptionId,
        extra: this.config.extra,
        systemPrompt: this.config.systemPrompt,
        mcpServers: this.config.mcpServers,
      },
    };
  }

  async revertConversation(input: { messageId: string }): Promise<void> {
    await this.connect();
    if (!this.client) {
      throw new Error("Codex client is not initialized");
    }
    if (this.currentThreadId) {
      await this.ensureThreadLoaded();
    } else {
      await this.ensureThread();
    }

    await revertCodexConversation({
      client: this.client,
      threadId: this.currentThreadId,
      messageId: input.messageId,
      cwd: this.config.cwd ?? null,
      model: this.config.model ?? null,
      serviceTier: this.serviceTier,
      userMessageTurns: this.userMessageTurns,
      setThreadId: async (threadId) => {
        this.currentThreadId = threadId;
        this.cachedRuntimeInfo = null;
        this.persistedHistory = [];
        this.historyPending = false;
        await this.loadPersistedHistory();
      },
    });
  }

  async interrupt(): Promise<void> {
    if (!this.client || !this.currentThreadId || !this.currentTurnId) return;
    try {
      await this.client.request(
        "turn/interrupt",
        {
          threadId: this.currentThreadId,
          turnId: this.currentTurnId,
        },
        INTERRUPT_TIMEOUT_MS,
      );
    } catch (error) {
      this.logger.warn({ error }, "Failed to interrupt Codex turn");
    }
  }

  async close(): Promise<void> {
    this.permissionController.cancelAll();
    this.eventBus.clear();
    this.activeForegroundTurnId = null;
    if (this.client) {
      await this.client.dispose();
    }
    this.client = null;
    this.connected = false;
    this.currentThreadId = null;
    this.currentTurnId = null;
    // Best-effort: clean up image attachments older than the TTL so temp files
    // do not accumulate across long-lived daemon sessions.
    void cleanupStaleCodexImageAttachments();
  }

  async listCommands(): Promise<AgentSlashCommand[]> {
    const prompts = await listCodexCustomPrompts();
    if (!this.connected) {
      await this.connect();
    } else {
      await this.loadSkills();
    }
    const appServerSkills = this.enabledCachedSkills().map((skill) => ({
      name: skill.name,
      description: skill.description,
      argumentHint: "",
    }));
    const fallbackSkills =
      appServerSkills.length === 0
        ? await listCodexSkills(
            this.config.cwd,
            this.deps.workspaceGitService,
            resolveSkillPolicy(this.config),
          )
        : [];
    const builtin: AgentSlashCommand[] = [
      {
        name: "compact",
        description: "Summarize conversation to prevent hitting the context limit",
        argumentHint: "",
      },
    ];
    if (this.goalsEnabled) {
      builtin.push({
        name: "goal",
        description: "Set, pause, resume, or clear the agent's goal",
        argumentHint: "[<objective>|pause|resume|clear]",
      });
    }
    return [...builtin, ...appServerSkills, ...fallbackSkills, ...prompts].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }

  async listSkills(): Promise<AgentSkill[]> {
    if (!this.connected) {
      await this.connect();
    } else {
      await this.loadSkills();
    }
    if (this.cachedSkills.length > 0) {
      return this.cachedSkills.map(toAgentSkill);
    }
    return (await listCodexSkillEntries(this.config.cwd, this.deps.workspaceGitService)).map(
      toAgentSkill,
    );
  }

  tryHandleOutOfBand(
    prompt: AgentPromptInput,
  ): { run(ctx: { emit: (event: AgentStreamEvent) => void }): Promise<void> } | null {
    if (typeof prompt !== "string") return null;
    const parsed = this.parseSlashCommandInput(prompt);
    if (!parsed) return null;

    if (parsed.commandName === "compact") {
      return {
        run: async ({ emit }) => {
          const error = await this.executeCompactCommand();
          if (error) {
            emit({
              type: "timeline",
              provider: CODEX_PROVIDER,
              item: { type: "assistant_message", text: formatOutOfBandStatusMessage(error) },
            });
          }
        },
      };
    }

    if (!this.goalsEnabled || parsed.commandName !== "goal") return null;

    const subcommand = parseGoalSubcommand(parsed.args);
    return {
      run: async ({ emit }) => {
        const text = formatOutOfBandStatusMessage(await this.executeGoalSubcommand(subcommand));
        emit({
          type: "timeline",
          provider: CODEX_PROVIDER,
          item: { type: "assistant_message", text },
        });
      },
    };
  }

  private async executeCompactCommand(): Promise<string | null> {
    try {
      await this.connect();
      if (this.currentThreadId) {
        await this.ensureThreadLoaded();
      } else {
        await this.ensureThread();
      }
      if (!this.client || !this.currentThreadId) {
        throw new Error("Codex thread is not available");
      }
      this.compactionState.beginManualCompaction();
      try {
        await this.client.request("thread/compact/start", {
          threadId: this.currentThreadId,
        });
      } catch (error) {
        this.compactionState.cancelManualCompactionStart();
        throw error;
      }
      return null;
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      return `Failed to compact context: ${message}`;
    }
  }

  private async executeGoalSubcommand(subcommand: GoalSubcommand): Promise<string> {
    if (subcommand.kind === "usage") {
      return "Usage: /goal <objective>|pause|resume|clear";
    }
    try {
      await this.connect();
      if (this.currentThreadId) {
        await this.ensureThreadLoaded();
      } else {
        await this.ensureThread();
      }
      if (!this.client || !this.currentThreadId) {
        throw new Error("Codex thread is not available");
      }
      switch (subcommand.kind) {
        case "set": {
          await this.client.request("thread/goal/set", {
            threadId: this.currentThreadId,
            objective: subcommand.objective,
            status: "active",
          });
          return `Goal set: ${subcommand.objective}`;
        }
        case "pause": {
          await this.client.request("thread/goal/set", {
            threadId: this.currentThreadId,
            status: "paused",
          });
          return "Goal paused.";
        }
        case "resume": {
          await this.client.request("thread/goal/set", {
            threadId: this.currentThreadId,
            status: "active",
          });
          return "Goal resumed.";
        }
        case "clear": {
          await this.client.request("thread/goal/clear", {
            threadId: this.currentThreadId,
          });
          return "Goal cleared.";
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      return `Failed to update goal: ${message}`;
    }
  }

  private async resolveModelAndThinking(): Promise<{
    model: string;
    thinkingOptionId: string | undefined;
  }> {
    if (!this.client) {
      throw new Error("Codex client is not initialized");
    }
    let configuredDefaults: CodexConfiguredDefaults = {};
    let model = this.config.model;
    let thinkingOptionId = normalizeCodexThinkingOptionId(this.config.thinkingOptionId);
    if (!model || !thinkingOptionId) {
      configuredDefaults = await readCodexConfiguredDefaults(this.client, this.logger);
    }
    if (!model) {
      model = configuredDefaults.model;
    }
    if (!thinkingOptionId) {
      thinkingOptionId = configuredDefaults.thinkingOptionId;
    }

    if (!model || !thinkingOptionId) {
      const modelResponse = toObjectRecord(await this.client.request("model/list", {}));
      const modelData = Array.isArray(modelResponse?.data) ? modelResponse.data : [];
      const models = modelData
        .map((m) => {
          const record = toObjectRecord(m);
          return {
            id: typeof record?.id === "string" ? record.id : "",
            isDefault: !!record?.isDefault,
            defaultReasoningEffort:
              typeof record?.defaultReasoningEffort === "string"
                ? record.defaultReasoningEffort
                : undefined,
          };
        })
        .filter((m) => m.id);
      const defaultModel = models.find((m) => m.isDefault) ?? models[0];
      if (!defaultModel) {
        throw new Error("No models available from Codex app-server");
      }
      const selectedModel =
        (model ? models.find((candidate) => candidate.id === model) : undefined) ?? defaultModel;
      if (!model) {
        model = selectedModel.id;
      }
      if (!thinkingOptionId) {
        thinkingOptionId = normalizeCodexThinkingOptionId(selectedModel.defaultReasoningEffort);
      }
    }

    if (!model) {
      throw new Error("Unable to resolve Codex model");
    }
    return { model, thinkingOptionId };
  }

  private async ensureThread(): Promise<void> {
    if (!this.client) return;
    if (this.currentThreadId) return;

    const { model, thinkingOptionId } = await this.resolveModelAndThinking();
    this.config.model = model;
    this.config.thinkingOptionId = thinkingOptionId;

    const preset = MODE_PRESETS[this.currentMode] ?? MODE_PRESETS[DEFAULT_CODEX_MODE_ID];
    const approvalPolicy = this.config.approvalPolicy ?? preset.approvalPolicy;
    const sandbox = this.config.sandboxMode ?? preset.sandbox;
    const innerConfig = this.buildCodexInnerConfig();
    const developerInstructions = composeSystemPromptParts(
      this.config.systemPrompt,
      this.config.daemonAppendSystemPrompt,
      buildRuntimeModelIdentityInstructions(this.config, this.deps.customProvider),
    );
    const params: Record<string, unknown> = {
      model,
      cwd: this.config.cwd ?? null,
      approvalPolicy,
      sandbox,
      ...(developerInstructions ? { developerInstructions } : {}),
      ...(innerConfig ? { config: innerConfig } : {}),
      ...(this.ephemeral ? { ephemeral: true } : {}),
    };
    applyApprovalsReviewerParam(params, preset);
    const rawResponse = await this.client.request("thread/start", params);
    const response = toObjectRecord(rawResponse);
    const threadRecord = toObjectRecord(response?.thread);
    const threadId = typeof threadRecord?.id === "string" ? threadRecord.id : undefined;
    if (!threadId) {
      throw new Error("Codex app-server did not return thread id");
    }
    const responseApprovalsReviewer =
      typeof response?.approvalsReviewer === "string" ? response.approvalsReviewer : undefined;
    if (
      shouldPromoteThreadResponseToAutoReview({
        approvalsReviewer: responseApprovalsReviewer,
        approvalPolicy,
        sandbox,
      })
    ) {
      this.currentMode = "auto-review";
      this.cachedRuntimeInfo = null;
    }
    this.currentThreadId = threadId;
  }

  private buildCodexInnerConfig(): Record<string, unknown> | null {
    const innerConfig: Record<string, unknown> = {};
    if (this.config.mcpServers) {
      const mcpServers: Record<string, CodexMcpServerConfig> = {};
      for (const [name, serverConfig] of Object.entries(this.config.mcpServers)) {
        mcpServers[name] = toCodexMcpConfig(serverConfig);
      }
      innerConfig.mcp_servers = mcpServers;
    }
    if (this.config.extra?.codex) {
      Object.assign(innerConfig, this.config.extra.codex);
    }
    if (this.deps.customCodexConfig) {
      Object.assign(innerConfig, this.deps.customCodexConfig);
    }
    return Object.keys(innerConfig).length > 0 ? innerConfig : null;
  }

  private async buildUserInput(prompt: CodexPromptInput): Promise<CodexAppServerUserInput[]> {
    if (typeof prompt === "string") {
      return [toCodexTextInput(prompt)];
    }
    return await codexAppServerTurnInputFromPrompt(prompt, this.logger);
  }

  private createTurnId(): string {
    return `codex-turn-${this.nextTurnOrdinal++}`;
  }

  private handleNotification(method: string, params: unknown): void {
    this.notificationRouter.route(method, params);
  }

  private traceParsedNotification(
    method: string,
    params: unknown,
    parsed: ParsedCodexNotification,
  ): void {
    this.logger.trace(
      {
        agentId: this.agentId,
        provider: CODEX_PROVIDER,
        sessionId: this.currentThreadId,
        turnId: this.activeForegroundTurnId ?? undefined,
        method,
        params,
        parsed,
      },
      "provider.codex.parsed_event",
    );
  }

  private getSubAgentCallIdForThread(threadId: string | null | undefined): string | null {
    if (!threadId || threadId === this.currentThreadId) {
      return null;
    }
    return this.subAgentTracker.getCallIdForThread(threadId);
  }

  private emitSubAgentActivityUpdate(
    callId: string,
    status?: ToolCallTimelineItem["status"],
  ): void {
    const item = this.subAgentTracker.buildActivityUpdate(callId, status);
    if (item) {
      this.eventBus.emit({ type: "timeline", provider: CODEX_PROVIDER, item });
    }
  }

  private handleSubAgentChildItemCompleted(
    callId: string,
    itemId: string | undefined,
    timelineItem: AgentTimelineItem,
  ): void {
    this.applyBufferedDeltaTextToTimelineItem(timelineItem, itemId);
    if (itemId) {
      this.subAgentTracker.upsertChildItem(callId, itemId, timelineItem);
      this.notificationStream.clearItem(itemId);
    }
    this.emitSubAgentActivityUpdate(callId, "running");
  }

  private shouldSkipCompletedThreadItem(
    timelineItem: AgentTimelineItem,
    normalizedItemType: string | undefined,
    itemId: string | undefined,
  ): boolean {
    // For commandExecution items, codex/event/exec_command_* is authoritative.
    if (timelineItem.type === "tool_call" && normalizedItemType === "commandExecution") {
      const callId = timelineItem.callId || itemId;
      return Boolean(callId && this.notificationStream.hasExecCommandCompleted(callId));
    }
    return Boolean(itemId && this.notificationStream.hasItemCompleted(itemId));
  }

  private handleThreadStartedNotification(
    parsed: Extract<ParsedCodexNotification, { kind: "thread_started" }>,
  ): void {
    this.currentThreadId = parsed.threadId;
    this.eventBus.emit({
      type: "thread_started",
      provider: CODEX_PROVIDER,
      sessionId: parsed.threadId,
    });
  }

  private handleTurnStartedNotification(
    parsed: Extract<ParsedCodexNotification, { kind: "turn_started" }>,
  ): void {
    const subAgentCallId = this.getSubAgentCallIdForThread(parsed.threadId);
    if (subAgentCallId) {
      this.emitSubAgentActivityUpdate(subAgentCallId, "running");
      return;
    }
    this.currentTurnId = parsed.turnId;
    this.resetTurnTrackingState();
    this.eventBus.emit({ type: "turn_started", provider: CODEX_PROVIDER });
  }

  private handleTurnCompletedNotification(
    parsed: Extract<ParsedCodexNotification, { kind: "turn_completed" }>,
  ): void {
    const subAgentCallId = this.getSubAgentCallIdForThread(parsed.threadId);
    if (subAgentCallId) {
      let status: ToolCallTimelineItem["status"] = "completed";
      if (parsed.status === "failed") {
        status = "failed";
      } else if (parsed.status === "interrupted") {
        status = "canceled";
      }
      this.emitSubAgentActivityUpdate(subAgentCallId, status);
      return;
    }
    if (this.textualToolCallError) {
      this.eventBus.emit({
        type: "turn_failed",
        provider: CODEX_PROVIDER,
        error: this.textualToolCallError,
      });
    } else if (parsed.status === "failed") {
      this.eventBus.emit({
        type: "turn_failed",
        provider: CODEX_PROVIDER,
        error: parsed.errorMessage ?? "Codex turn failed",
      });
    } else if (parsed.status === "interrupted") {
      this.eventBus.emit({
        type: "turn_canceled",
        provider: CODEX_PROVIDER,
        reason: "interrupted",
      });
    } else {
      if (this.planModeEnabled && this.latestPlanResult?.text) {
        this.permissionController.requestPlanApproval(this.latestPlanResult.text);
      }
      this.eventBus.emit({
        type: "turn_completed",
        provider: CODEX_PROVIDER,
        usage: this.latestUsage,
      });
    }
    this.activeForegroundTurnId = null;
    this.resetTurnTrackingState();
  }

  private resetTurnTrackingState(): void {
    this.latestPlanResult = null;
    this.textualToolCallError = null;
    this.notificationStream.resetTurn();
    this.deltaNotificationHandler.resetTurn();
    this.compactionState.resetTurnPairing();
  }

  private rememberTextualToolCallFailure(text: string): void {
    if (this.textualToolCallError || !looksLikeTextualCodexToolCallTranscript(text)) {
      return;
    }
    this.textualToolCallError = CODEX_TEXTUAL_TOOL_CALL_ERROR;
    this.logger.warn(
      {
        agentId: this.agentId,
        provider: CODEX_PROVIDER,
        sessionId: this.currentThreadId,
        turnId: this.activeForegroundTurnId ?? undefined,
      },
      "provider.codex.textual_tool_call_detected",
    );
  }

  private handlePlanUpdatedNotification(
    parsed: Extract<ParsedCodexNotification, { kind: "plan_updated" }>,
  ): void {
    const timelineItem = mapCodexPlanToToolCall({
      callId: `plan:${this.currentTurnId ?? this.currentThreadId ?? "current"}`,
      text: planStepsToMarkdown(
        parsed.plan.map((entry) => ({
          step: entry.step ?? "",
          status: entry.status ?? "pending",
        })),
      ),
    });
    if (timelineItem) {
      this.rememberPlanResult(timelineItem);
      // In plan mode, the same plan is rendered through the synthetic approval
      // permission. Keep the remembered text for that card, but do not also
      // emit a static timeline plan panel.
      if (this.planModeEnabled) {
        return;
      }
      this.eventBus.emit({ type: "timeline", provider: CODEX_PROVIDER, item: timelineItem });
    }
  }

  private handleTokenUsageUpdatedNotification(
    parsed: Extract<ParsedCodexNotification, { kind: "token_usage_updated" }>,
  ): void {
    this.latestUsage = toAgentUsage(parsed.tokenUsage);
    if (this.latestUsage) {
      this.eventBus.emit({
        type: "usage_updated",
        provider: CODEX_PROVIDER,
        usage: this.latestUsage,
      });
    }
  }

  private isUserMessageItem(item: { type?: string; [key: string]: unknown }): boolean {
    return (
      normalizeCodexThreadItemType(typeof item.type === "string" ? item.type : undefined) ===
      "userMessage"
    );
  }

  private handleThreadRolledBackNotification(
    parsed: Extract<ParsedCodexNotification, { kind: "thread_rolled_back" }>,
  ): void {
    this.userMessageTurns.truncate(parsed.numTurns);
  }

  private handleContextCompactedNotification(
    parsed: Extract<ParsedCodexNotification, { kind: "context_compacted" }>,
  ): void {
    if (parsed.threadId !== this.currentThreadId) {
      return;
    }
    if (!this.compactionState.shouldEmitNotificationCompletion()) {
      return;
    }
    this.eventBus.emit({
      type: "timeline",
      provider: CODEX_PROVIDER,
      item: this.compactionState.createTimelineItem("completed"),
      ...(parsed.turnId ? { turnId: parsed.turnId } : {}),
    });
  }

  private handleItemCompletedNotification(
    parsed: Extract<ParsedCodexNotification, { kind: "item_completed" }>,
  ): void {
    // Codex emits mirrored lifecycle notifications via both `codex/event/item_*`
    // and canonical `item/*`. We render only the canonical channel to avoid
    // duplicated assistant/reasoning rows.
    if (parsed.source === "codex_event") {
      return;
    }
    if (this.isUserMessageItem(parsed.item)) {
      this.handleUserMessageItem(parsed);
      return;
    }
    if (this.compactionState.isCompactionItem(parsed.item)) {
      if (!this.compactionState.shouldEmitItemCompletion()) {
        return;
      }
      this.eventBus.emit({
        type: "timeline",
        provider: CODEX_PROVIDER,
        item: this.compactionState.createTimelineItem("completed", parsed.item.id),
      });
      return;
    }
    const timelineItem = threadItemToTimeline(parsed.item, {
      includeUserMessage: false,
      cwd: this.config.cwd ?? null,
    });
    if (!timelineItem) {
      return;
    }
    const childSubAgentCallId = this.getSubAgentCallIdForThread(parsed.threadId);
    if (childSubAgentCallId) {
      this.handleSubAgentChildItemCompleted(childSubAgentCallId, parsed.item.id, timelineItem);
      return;
    }
    const normalizedItemType = normalizeCodexThreadItemType(
      typeof parsed.item.type === "string" ? parsed.item.type : undefined,
    );
    const itemId = parsed.item.id;
    if (this.shouldSkipCompletedThreadItem(timelineItem, normalizedItemType, itemId)) {
      return;
    }
    if (this.consumeStreamedTextCompletion(timelineItem, itemId)) {
      if (timelineItem.type === "assistant_message") {
        this.deltaNotificationHandler.markAssistantMessageBoundary();
      }
      if (itemId) {
        this.notificationStream.markItemCompleted(itemId);
        this.notificationStream.clearItemStarted(itemId);
      }
      return;
    }
    this.applyBufferedDeltaTextToTimelineItem(timelineItem, itemId);
    if (timelineItem.type === "tool_call") {
      this.subAgentTracker.registerToolCall(timelineItem, parsed.item);
      if (timelineItem.detail.type === "plan") {
        this.rememberPlanResult(timelineItem);
        // Codex can surface plans both as turn/plan updates and as completed
        // thread items. In plan mode, approval owns the visible plan card.
        if (this.planModeEnabled) {
          return;
        }
      }
      this.toolNotificationHandler.warnOnIncompleteEditToolCall(
        timelineItem,
        "item_completed",
        parsed.item,
      );
    }
    this.eventBus.emit({ type: "timeline", provider: CODEX_PROVIDER, item: timelineItem });
    if (timelineItem.type === "assistant_message") {
      this.deltaNotificationHandler.markAssistantMessageBoundary();
    }
    if (itemId) {
      this.notificationStream.markItemCompleted(itemId);
      this.notificationStream.clearItemStarted(itemId);
      this.notificationStream.clearCommandOutput(itemId);
      this.notificationStream.clearFileChangeOutput(itemId);
    }
  }

  private consumeStreamedTextCompletion(
    timelineItem: AgentTimelineItem,
    itemId: string | null | undefined,
  ): boolean {
    if (!itemId) {
      return false;
    }
    if (timelineItem.type === "assistant_message") {
      const streamedText = this.notificationStream.consumeAssistantText(itemId);
      if (streamedText !== null) {
        this.rememberTextualToolCallFailure(timelineItem.text);
        this.emitMissingFinalTextSuffix(timelineItem, streamedText);
        return true;
      }
    }
    if (timelineItem.type === "reasoning") {
      const streamedText = this.notificationStream.consumeReasoningText(itemId);
      if (streamedText !== null) {
        this.emitMissingFinalTextSuffix(timelineItem, streamedText);
        return true;
      }
    }
    return false;
  }

  private emitMissingFinalTextSuffix(
    timelineItem: Extract<AgentTimelineItem, { type: "assistant_message" | "reasoning" }>,
    streamedText: string,
  ): void {
    if (!timelineItem.text.startsWith(streamedText)) {
      this.eventBus.emit({ type: "timeline", provider: CODEX_PROVIDER, item: timelineItem });
      return;
    }
    const suffix = timelineItem.text.slice(streamedText.length);
    if (!suffix) {
      return;
    }
    this.eventBus.emit({
      type: "timeline",
      provider: CODEX_PROVIDER,
      item:
        timelineItem.type === "assistant_message"
          ? {
              type: timelineItem.type,
              text: suffix,
              ...(timelineItem.messageId ? { messageId: timelineItem.messageId } : {}),
            }
          : { type: timelineItem.type, text: suffix },
    });
  }

  private applyBufferedDeltaTextToTimelineItem(
    timelineItem: AgentTimelineItem,
    itemId: string | null | undefined,
  ): void {
    if (!itemId) {
      return;
    }
    if (timelineItem.type === "assistant_message") {
      const buffered = this.notificationStream.peekAssistantText(itemId);
      if (buffered && buffered.length > 0) {
        timelineItem.text = buffered;
      }
      this.rememberTextualToolCallFailure(timelineItem.text);
      return;
    }
    if (timelineItem.type === "reasoning") {
      const buffered = this.notificationStream.peekReasoningText(itemId);
      if (buffered && buffered.length > 0) {
        timelineItem.text = buffered;
      }
    }
  }

  private handleItemStartedNotification(
    parsed: Extract<ParsedCodexNotification, { kind: "item_started" }>,
  ): void {
    if (parsed.source === "codex_event") {
      return;
    }
    if (this.isUserMessageItem(parsed.item)) {
      this.handleUserMessageItem(parsed);
      return;
    }
    if (this.compactionState.isCompactionItem(parsed.item)) {
      this.eventBus.emit({
        type: "timeline",
        provider: CODEX_PROVIDER,
        item: this.compactionState.createTimelineItem("loading", parsed.item.id),
      });
      return;
    }
    const timelineItem = threadItemToTimeline(parsed.item, {
      includeUserMessage: false,
      cwd: this.config.cwd ?? null,
    });
    if (!timelineItem || timelineItem.type !== "tool_call") {
      return;
    }
    const childSubAgentCallId = this.getSubAgentCallIdForThread(parsed.threadId);
    if (childSubAgentCallId) {
      if (parsed.item.id) {
        this.subAgentTracker.upsertChildItem(childSubAgentCallId, parsed.item.id, timelineItem);
      }
      this.emitSubAgentActivityUpdate(childSubAgentCallId, "running");
      return;
    }
    const normalizedItemType = normalizeCodexThreadItemType(
      typeof parsed.item.type === "string" ? parsed.item.type : undefined,
    );
    const itemId = parsed.item.id;
    if (normalizedItemType === "commandExecution") {
      const callId = timelineItem.callId || itemId;
      if (callId && this.notificationStream.hasExecCommandStarted(callId)) {
        return;
      }
    }
    if (itemId && this.notificationStream.hasItemStarted(itemId)) {
      return;
    }
    this.toolNotificationHandler.warnOnIncompleteEditToolCall(
      timelineItem,
      "item_started",
      parsed.item,
    );
    this.subAgentTracker.registerToolCall(timelineItem, parsed.item);
    this.eventBus.emit({ type: "timeline", provider: CODEX_PROVIDER, item: timelineItem });
    if (itemId) {
      this.notificationStream.markItemStarted(itemId);
      this.notificationStream.clearCommandOutput(itemId);
      this.notificationStream.clearFileChangeOutput(itemId);
    }
  }

  private handleUserMessageItem(
    parsed: Extract<ParsedCodexNotification, { kind: "item_started" | "item_completed" }>,
  ): void {
    const itemId = parsed.item.id;
    const timelineItem = threadItemToTimeline(parsed.item, {
      includeUserMessage: true,
      cwd: this.config.cwd ?? null,
    });
    if (!timelineItem || timelineItem.type !== "user_message") {
      return;
    }
    const childSubAgentCallId = this.getSubAgentCallIdForThread(parsed.threadId);
    if (childSubAgentCallId) {
      if (itemId) {
        this.subAgentTracker.upsertChildItem(childSubAgentCallId, itemId, timelineItem);
      }
      this.emitSubAgentActivityUpdate(childSubAgentCallId, "running");
      return;
    }
    if (!this.userMessageTurns.remember(timelineItem.messageId)) {
      return;
    }
    this.eventBus.emit({ type: "timeline", provider: CODEX_PROVIDER, item: timelineItem });
  }

  private warnUnknownNotificationMethod(method: string, params: unknown): void {
    if (this.warnedUnknownNotificationMethods.has(method)) {
      return;
    }
    this.warnedUnknownNotificationMethods.add(method);
    this.logger.trace(
      {
        agentId: this.agentId,
        provider: CODEX_PROVIDER,
        sessionId: this.currentThreadId,
        turnId: this.activeForegroundTurnId ?? undefined,
        method,
        params,
      },
      "provider.codex.event_unhandled",
    );
  }

  private warnInvalidNotificationPayload(method: string, params: unknown): void {
    const key = method;
    if (this.warnedInvalidNotificationPayloads.has(key)) {
      return;
    }
    this.warnedInvalidNotificationPayloads.add(key);
    this.logger.warn({ method, params }, "Invalid Codex app-server notification payload");
  }

  private handleCommandApprovalRequest(params: unknown): Promise<unknown> {
    return this.permissionController.handleCommandApprovalRequest(params);
  }

  private handleFileChangeApprovalRequest(params: unknown): Promise<unknown> {
    return this.permissionController.handleFileChangeApprovalRequest(params);
  }

  private handleToolApprovalRequest(params: unknown): Promise<unknown> {
    return this.permissionController.handleToolApprovalRequest(params);
  }
}

function resolveSkillDescription(skill: Record<string, unknown>): string {
  if (typeof skill.description === "string") {
    return skill.description;
  }
  if (typeof skill.shortDescription === "string") {
    return skill.shortDescription;
  }
  return "Skill";
}
