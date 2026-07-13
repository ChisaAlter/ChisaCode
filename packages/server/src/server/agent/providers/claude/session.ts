import { randomUUID } from "node:crypto";
import { promises } from "node:fs";
import {
  type CanUseTool,
  type PermissionMode,
  type Query,
  type SDKMessage,
  type SDKResultMessage,
  type SDKSystemMessage,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type { Logger } from "pino";
import { normalizeClaudeRuntimeModelId } from "./models.js";
import {
  CLAUDE_CAPABILITIES,
  type ClaudeAgentConfig,
  type ClaudeAgentSessionOptions,
} from "./client.js";
import { ClaudeSidechainTracker } from "./sidechain-tracker.js";
import {
  extractSessionIdRaw,
  isImageMimeType,
  type ClaudeContentChunk,
} from "./sdk-types-mapping.js";
import { runClaudeSdkQueryPump } from "./sdk-pump.js";
import {
  ClaudeMessageRouter,
  type ClaudeAutonomousTurnState,
  type ClaudeTurnState,
} from "./message-router.js";
import { ClaudeTimelineAssembler } from "./timeline-assembler.js";
import { ClaudePermissionController } from "./permission-controller.js";
import { ClaudeOptionsBuilder, summarizeClaudeOptionsForLog } from "./options-builder.js";
import { ClaudeMessageTranslator } from "./message-translator.js";
import {
  CLAUDE_INTERRUPT_TOOL_USE_PLACEHOLDER as INTERRUPT_TOOL_USE_PLACEHOLDER,
  ClaudeSessionHistory,
} from "./session-history.js";
import { ClaudeToolCallHandler, type ClaudeToolUseCacheEntry } from "./tool-call-handlers.js";
import { buildClaudeFeatures, claudeModelSupportsFastMode } from "./feature-definitions.js";
import {
  isClaudeTranscriptNoiseText,
  isSyntheticUserEntry,
  isToolResultUserEntry,
} from "./history-converter.js";
import { appendOrReplaceGrowingAssistantMessage, runProviderTurn } from "../provider-runner.js";
import { renderPromptAttachmentAsText } from "../../prompt-attachments.js";
import { claudeQuery, type ClaudeQueryFactory } from "./query.js";
import { realClaudeRewindSdk, revertClaudeConversation, revertClaudeFiles } from "./rewind.js";

import {
  getAgentStreamEventTurnId,
  type AgentFeature,
  type AgentMetadata,
  type AgentMode,
  type AgentPermissionRequest,
  type AgentPermissionResponse,
  type AgentPersistenceHandle,
  type AgentPromptInput,
  type AgentRunOptions,
  type AgentRunResult,
  type AgentSession,
  type AgentSlashCommand,
  type AgentStreamEvent,
  type AgentTimelineItem,
  type AgentUsage,
  type AgentRuntimeInfo,
} from "../../agent-sdk-types.js";
import type { ProviderRuntimeSettings } from "../../provider-launch-config.js";
import { withTimeout } from "../../../../utils/promise-timeout.js";

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toObjectRecord(value: unknown): Record<string, unknown> | undefined {
  return isObjectRecord(value) ? value : undefined;
}

interface AsyncMessageInput<T> {
  push: (item: T) => void;
  end: () => void;
  iterable: AsyncIterable<T>;
}

interface ClaudeRewindTurnAnchor {
  userMessageId: string;
  assistantMessageId: string | null;
}

type ClaudeConversationRewindTarget =
  | { kind: "fresh-session" }
  | { kind: "fork"; messageId: string };

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
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface SlashCommandInvocation {
  commandName: string;
  args?: string;
  rawInput: string;
}

type ClaudeThinkingEffort = "low" | "medium" | "high" | "xhigh" | "max";
type ClaudeThinkingOption = ClaudeThinkingEffort | "ultracode";

function errorToMessageString(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
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

const MAX_RECENT_STDERR_CHARS = 4000;
const STDERR_FLUSH_WAIT_MS = 150;
const STDERR_FLUSH_POLL_INTERVAL_MS = 10;

function readTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isPermissionMode(value: string | undefined): value is PermissionMode {
  return typeof value === "string" && VALID_CLAUDE_MODES.has(value);
}

export class ClaudeAgentSession implements AgentSession {
  readonly provider = "claude" as const;
  readonly capabilities = CLAUDE_CAPABILITIES;

  private readonly config: ClaudeAgentConfig;
  private readonly launchEnv?: Record<string, string>;
  private readonly agentId?: string;
  private readonly runtimeSettings?: ProviderRuntimeSettings;
  private readonly persistSession?: boolean;
  private readonly logger: Logger;
  private readonly queryFactory?: ClaudeQueryFactory;
  private readonly optionsBuilder: ClaudeOptionsBuilder;
  private query: Query | null = null;
  private input: AsyncMessageInput<SDKUserMessage> | null = null;
  private claudeSessionId: string | null;
  private persistence: AgentPersistenceHandle | null;
  private currentMode: PermissionMode;
  private planResumeMode: PermissionMode | null = null;
  private availableModes: AgentMode[] = DEFAULT_MODES;
  private readonly permissionController: ClaudePermissionController;
  private readonly subscribers = new Set<(event: AgentStreamEvent) => void>();
  private readonly timelineAssembler = new ClaudeTimelineAssembler({
    shouldSuppressAssistantText: (text) =>
      text === INTERRUPT_TOOL_USE_PLACEHOLDER || isClaudeTranscriptNoiseText(text),
  });
  private readonly messageRouter: ClaudeMessageRouter;
  private readonly toolCallHandler: ClaudeToolCallHandler;
  private readonly sidechainTracker: ClaudeSidechainTracker;
  private readonly historyController: ClaudeSessionHistory;
  private readonly messageTranslator: ClaudeMessageTranslator;
  private cachedRuntimeInfo: AgentRuntimeInfo | null = null;
  private lastOptionsModel: string | null = null;
  private lastRuntimeModel: string | null = null;
  private modelGatewayOverrideActive = false;
  private queryPumpPromise: Promise<void> | null = null;
  private queryRestartNeeded = false;
  private userMessageIds: string[] = [];
  private readonly rewindTurnAnchors: ClaudeRewindTurnAnchor[] = [];
  private pendingFreshSessionId: string | null = null;
  private recentStderr = "";
  private closed = false;

  constructor(config: ClaudeAgentConfig, options: ClaudeAgentSessionOptions) {
    this.config = config;
    this.launchEnv = options.launchEnv;
    this.agentId = options.agentId;
    this.runtimeSettings = options.runtimeSettings;
    this.persistSession = options.persistSession;
    this.logger = options.logger.child({ agentId: this.agentId });
    this.optionsBuilder = new ClaudeOptionsBuilder({
      config: this.config,
      launchEnv: this.launchEnv,
      defaults: options.defaults,
      runtimeSettings: this.runtimeSettings,
      persistSession: this.persistSession,
      logger: this.logger,
      resolveBinary: options.resolveBinary,
      getCurrentMode: () => this.currentMode,
      getClaudeSessionId: () => this.claudeSessionId,
      getPendingFreshSessionId: () => this.pendingFreshSessionId,
      canUseTool: async (toolName, input, requestOptions) =>
        this.handlePermissionRequest(toolName, input, requestOptions),
      captureStderr: (data) => this.captureStderr(data),
    });
    this.permissionController = new ClaudePermissionController({
      getPlanResumeMode: () => this.planResumeMode,
      getModeLabel: (modeId) => DEFAULT_MODES.find((mode) => mode.id === modeId)?.label ?? modeId,
      setMode: (modeId) => this.setMode(modeId),
      emitEvent: (event) => this.pushEvent(event),
      emitToolCall: (item) => this.pushToolCall(item),
    });
    this.toolCallHandler = new ClaudeToolCallHandler({
      getCwd: () => this.config.cwd,
      emitTimeline: (item) => this.enqueueTimeline(item),
      deleteSidechain: (toolUseId) => this.sidechainTracker.delete(toolUseId),
      clearSidechains: () => this.sidechainTracker.clear(),
    });
    this.sidechainTracker = new ClaudeSidechainTracker({
      getToolInput: (toolUseId) => this.toolCallHandler.getToolInput(toolUseId),
    });
    this.historyController = new ClaudeSessionHistory({
      getCwd: () => this.config.cwd,
      getSdkEnv: () => this.optionsBuilder.buildSdkEnv(this.config.extra?.claude),
      rememberUserMessageId: (messageId) => this.rememberUserMessageId(messageId),
      rememberRewindUserAnchor: (messageId) => this.rememberRewindUserAnchor(messageId),
      rememberRewindAssistantAnchor: (messageId) => this.rememberRewindAssistantAnchor(messageId),
      handleToolUseStart: (block, target) => this.toolCallHandler.handleToolUseStart(block, target),
      handleToolResult: (block, target) => this.toolCallHandler.handleToolResult(block, target),
      updatePartialEventState: (event) => this.toolCallHandler.updatePartialEventState(event),
    });
    this.messageTranslator = new ClaudeMessageTranslator({
      getSessionId: () => this.claudeSessionId,
      captureSessionIdFromMessage: (message) => this.captureSessionIdFromMessage(message),
      handleSystemInit: (message) => this.handleSystemMessage(message),
      handleSidechainMessage: (message, parentToolUseId) =>
        this.sidechainTracker.handleMessage(message, parentToolUseId),
      mapBlocksToTimeline: (content, mapOptions) =>
        this.historyController.mapBlocksToTimeline(content, mapOptions),
      mapPartialEvent: (event, mapOptions) =>
        this.historyController.mapPartialEvent(event, mapOptions),
      getToolName: (toolUseId) => this.toolCallHandler.getToolName(toolUseId),
      rememberUserMessageId: (messageId) => this.rememberUserMessageId(messageId),
      hasActiveTurnAssistantText: () => this.activeTurnHasAssistantText,
      buildTurnFailedEvent: (errorMessage) => this.buildTurnFailedEvent(errorMessage),
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
    const handle = options.handle;

    if (handle) {
      if (!handle.sessionId) {
        throw new Error("Cannot resume: persistence handle has no sessionId");
      }
      this.claudeSessionId = handle.sessionId;
      this.persistence = handle;
      this.historyController.load(handle.sessionId);
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
    yield* this.historyController.stream();
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
    this.optionsBuilder.assertAutoModeEligible(normalized);
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
    return this.permissionController.getPending();
  }

  async respondToPermission(requestId: string, response: AgentPermissionResponse): Promise<void> {
    await this.permissionController.respond(requestId, response);
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
      const historyPath = this.historyController.resolvePath(this.claudeSessionId);
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

    for (const messageId of this.historyController.getRewindCandidateUserMessageIds()) {
      pushUnique(messageId);
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
    this.historyController.clear();
    this.userMessageIds = [];
    this.messageTranslator.resetUserMessageState();
    this.rewindTurnAnchors.length = 0;
    this.historyController.load(sessionId);
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
    this.historyController.clear();
    this.userMessageIds = [];
    this.messageTranslator.resetUserMessageState();
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

    // Preserve claudeSessionId across query recreation so rebuilt options pass
    // resume: sessionId and the new query continues the existing conversation.
    this.persistence = null;

    const input = createAsyncMessageInput<SDKUserMessage>();
    const builtOptions = await this.optionsBuilder.build();
    const options = builtOptions.options;
    this.lastOptionsModel = builtOptions.requestedModel;
    this.modelGatewayOverrideActive = builtOptions.modelGatewayOverrideActive;
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
    const fastMode = this.optionsBuilder.resolveFastModeSetting();
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
    const staleResumeError = this.messageTranslator.readMissingResumedConversationError(message);
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
    this.historyController.clear();
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
    return this.messageTranslator.translate(message, options);
  }

  private emitSubmittedUserMessage(
    message: Extract<SDKMessage, { type: "user" }>,
    turnId: string,
  ): void {
    const events = this.messageTranslator.translateUserMessage(message);
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

  // Compatibility surface for focused usage translation regression tests.
  convertUsage(message: SDKResultMessage, modelUsage?: unknown): AgentUsage | undefined {
    return this.messageTranslator.convertUsage(message, modelUsage);
  }

  private handlePermissionRequest: CanUseTool = async (toolName, input, options) =>
    this.permissionController.handleRequest(toolName, input, options);

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

  private rejectAllPendingPermissions(error: Error): void {
    this.permissionController.rejectAll(error);
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
