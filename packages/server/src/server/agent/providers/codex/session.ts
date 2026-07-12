import {
  type AgentFeature,
  type AgentMode,
  type AgentPermissionRequest,
  type AgentPermissionResponse,
  type AgentPermissionResult,
  type AgentPromptInput,
  type AgentRunOptions,
  type AgentRunResult,
  type AgentRuntimeInfo,
  type AgentSession,
  type AgentSessionConfig,
  type AgentSkill,
  type AgentSlashCommand,
  type AgentStreamEvent,
  type ToolCallTimelineItem,
} from "../../agent-sdk-types.js";
import type { Logger } from "pino";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
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
import { buildRuntimeModelIdentityInstructions } from "./runtime-config.js";
import type { CodexClientLike } from "./client-runtime.js";
import {
  CODEX_APP_SERVER_CAPABILITIES,
  CODEX_PROVIDER,
  type CodexAppServerAgentDeps,
} from "./client.js";
import { CodexUserMessageTurnState } from "./user-message-turn-state.js";
import { CodexContextCompactionState } from "./context-compaction-state.js";
import { CodexDeltaNotificationHandler } from "./delta-notification-handler.js";
import { CodexItemNotificationHandler } from "./item-notification-handler.js";
import {
  cleanupStaleCodexImageAttachments,
  writeCodexImageAttachment,
} from "./image-attachments.js";
import { threadItemToTimeline } from "./history.js";
import type { ParsedCodexNotification } from "./notifications.js";
import { CodexNotificationRouter } from "./notification-router.js";
import { CodexNotificationStreamState } from "./notification-stream-state.js";
import { CodexToolNotificationHandler } from "./tool-notification-handler.js";
import { CodexTurnNotificationHandler } from "./turn-notification-handler.js";
import { CodexThreadBootstrap } from "./thread-bootstrap.js";
import { CodexSessionMetadata } from "./session-metadata.js";
import { CodexSessionHistory } from "./session-history.js";
import { CodexSessionConnection } from "./session-connection.js";
import {
  CodexSessionCommandController,
  type CodexPromptInput,
  type CodexSkillPromptBlock,
} from "./session-commands.js";
import { CodexPermissionController } from "./permission-controller.js";
import { CodexSubAgentTracker } from "./sub-agent-tracker.js";
import {
  buildCodexTurnStartParams,
  CODEX_MODES,
  DEFAULT_CODEX_MODE_ID,
  normalizeCodexThinkingOptionId,
  validateCodexMode,
} from "./turn-config.js";
import { runProviderTurn } from "../provider-runner.js";

export { cleanupStaleCodexImageAttachments, threadItemToTimeline };
export { mapCodexPatchNotificationToToolCall } from "./notification-timeline.js";
export { toAgentUsage } from "./turn-notification-handler.js";

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

const TURN_START_TIMEOUT_MS = 90 * 1000;
const INTERRUPT_TIMEOUT_MS = 2_000;

interface CodexAppServerClientLike extends CodexClientLike {
  forkThread?(params: CodexThreadForkParams): Promise<CodexThreadForkResponse>;
  rollbackThread?(params: CodexThreadRollbackParams): Promise<CodexThreadRollbackResponse>;
}

export { listCodexSkillEntries, listCodexSkills } from "./skills.js";

export { normalizeCodexOutputSchema } from "./turn-config.js";

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
  private readonly connection: CodexSessionConnection;
  private readonly eventBus: CodexSessionEventBus;
  private nextTurnOrdinal = 0;
  private activeForegroundTurnId: string | null = null;
  private cachedRuntimeInfo: AgentRuntimeInfo | null = null;
  private serviceTier: "fast" | null = null;
  private planModeEnabled = false;
  private readonly permissionController: CodexPermissionController;
  private readonly notificationStream = new CodexNotificationStreamState();
  private readonly notificationRouter: CodexNotificationRouter;
  private readonly deltaNotificationHandler: CodexDeltaNotificationHandler;
  private readonly itemNotificationHandler: CodexItemNotificationHandler;
  private readonly toolNotificationHandler: CodexToolNotificationHandler;
  private readonly turnNotificationHandler: CodexTurnNotificationHandler;
  private readonly threadBootstrap: CodexThreadBootstrap;
  private readonly sessionMetadata: CodexSessionMetadata;
  private readonly sessionHistory: CodexSessionHistory;
  private readonly commandController: CodexSessionCommandController;
  private readonly subAgentTracker = new CodexSubAgentTracker();
  private warnedUnknownNotificationMethods = new Set<string>();
  private warnedInvalidNotificationPayloads = new Set<string>();
  private readonly userMessageTurns = new CodexUserMessageTurnState();
  private readonly compactionState = new CodexContextCompactionState();
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
    this.connection = new CodexSessionConnection({
      logger: this.logger,
      spawnAppServer: this.spawnAppServer,
      getTraceContext: () => this.traceContext(),
      onNotification: (method, params) => this.handleNotification(method, params),
      registerRequestHandlers: (client) => this.registerRequestHandlers(client),
      onInitialized: async () => {
        await this.sessionMetadata.loadAll(this.planModeEnabled);
        if (this.currentThreadId) {
          await this.ensureThreadLoaded();
          await this.loadPersistedHistory();
        }
      },
    });
    this.threadBootstrap = new CodexThreadBootstrap({
      logger: this.logger,
      getClient: () => this.client,
      getConfig: () => this.config,
      getThreadId: () => this.currentThreadId,
      setThreadId: (threadId) => {
        this.currentThreadId = threadId;
      },
      getMode: () => this.currentMode,
      setMode: (modeId) => {
        this.currentMode = modeId;
      },
      invalidateRuntimeInfo: () => {
        this.cachedRuntimeInfo = null;
      },
      customProvider: this.deps.customProvider,
      customCodexConfig: this.deps.customCodexConfig,
      ephemeral: this.ephemeral,
    });
    this.sessionHistory = new CodexSessionHistory({
      getClient: () => this.client,
      getThreadId: () => this.currentThreadId,
      getCwd: () => this.config.cwd ?? null,
      userMessageTurns: this.userMessageTurns,
    });
    this.sessionMetadata = new CodexSessionMetadata({
      logger: this.logger,
      getClient: () => this.client,
      getConfig: () => this.config,
      getTraceContext: () => this.traceContext(),
      customProvider: this.deps.customProvider,
    });
    this.commandController = new CodexSessionCommandController({
      logger: this.logger,
      getConfig: () => this.config,
      getClient: () => this.client,
      isConnected: () => this.connected,
      connect: () => this.connect(),
      metadata: this.sessionMetadata,
      workspaceGitService: this.deps.workspaceGitService,
      goalsEnabled: this.goalsEnabled,
      getThreadId: () => this.currentThreadId,
      ensureThreadLoaded: () => this.ensureThreadLoaded(),
      ensureThread: () => this.ensureThread(),
      beginManualCompaction: () => this.compactionState.beginManualCompaction(),
      cancelManualCompactionStart: () => this.compactionState.cancelManualCompactionStart(),
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
    this.turnNotificationHandler = new CodexTurnNotificationHandler({
      logger: this.logger,
      getAgentId: () => this.agentId,
      getThreadId: () => this.currentThreadId,
      setThreadId: (threadId) => {
        this.currentThreadId = threadId;
      },
      getTurnId: () => this.currentTurnId,
      getActiveForegroundTurnId: () => this.activeForegroundTurnId,
      setTurnId: (turnId) => {
        this.currentTurnId = turnId;
      },
      clearActiveForegroundTurn: () => {
        this.activeForegroundTurnId = null;
      },
      isPlanModeEnabled: () => this.planModeEnabled,
      requestPlanApproval: (plan) => this.permissionController.requestPlanApproval(plan),
      resolveSubAgentCallId: (threadId) => this.getSubAgentCallIdForThread(threadId),
      emitSubAgentActivity: (callId, status) => this.emitSubAgentActivityUpdate(callId, status),
      resetExternalTurnState: () => {
        this.notificationStream.resetTurn();
        this.deltaNotificationHandler.resetTurn();
        this.compactionState.resetTurnPairing();
      },
      userMessageTurns: this.userMessageTurns,
      compactionState: this.compactionState,
      emit: (event) => this.eventBus.emit(event),
    });
    this.itemNotificationHandler = new CodexItemNotificationHandler({
      notificationStream: this.notificationStream,
      compactionState: this.compactionState,
      subAgentTracker: this.subAgentTracker,
      userMessageTurns: this.userMessageTurns,
      getCwd: () => this.config.cwd ?? null,
      resolveSubAgentCallId: (threadId) => this.getSubAgentCallIdForThread(threadId),
      emitSubAgentActivity: (callId, status) => this.emitSubAgentActivityUpdate(callId, status),
      rememberTextualToolCallFailure: (text) =>
        this.turnNotificationHandler.rememberTextualToolCallFailure(text),
      rememberPlanResult: (item) => this.turnNotificationHandler.rememberPlanResult(item),
      isPlanModeEnabled: () => this.planModeEnabled,
      markAssistantMessageBoundary: () =>
        this.deltaNotificationHandler.markAssistantMessageBoundary(),
      warnOnIncompleteEdit: (item, source, payload) =>
        this.toolNotificationHandler.warnOnIncompleteEditToolCall(item, source, payload),
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
      onThreadStarted: (parsed) => this.turnNotificationHandler.handleThreadStarted(parsed),
      onTurnStarted: (parsed) => this.turnNotificationHandler.handleTurnStarted(parsed),
      onTurnCompleted: (parsed) => this.turnNotificationHandler.handleTurnCompleted(parsed),
      onPlanUpdated: (parsed) => this.turnNotificationHandler.handlePlanUpdated(parsed),
      onTokenUsageUpdated: (parsed) => this.turnNotificationHandler.handleTokenUsageUpdated(parsed),
      onContextCompacted: (parsed) => this.turnNotificationHandler.handleContextCompacted(parsed),
      onThreadRolledBack: (parsed) => this.turnNotificationHandler.handleThreadRolledBack(parsed),
      onExecCommandStarted: (parsed) =>
        this.toolNotificationHandler.handleExecCommandStarted(parsed),
      onExecCommandCompleted: (parsed) =>
        this.toolNotificationHandler.handleExecCommandCompleted(parsed),
      onTerminalInteraction: (parsed) =>
        this.toolNotificationHandler.handleTerminalInteraction(parsed),
      onPatchApplyStarted: (parsed) => this.toolNotificationHandler.handlePatchApplyStarted(parsed),
      onPatchApplyCompleted: (parsed) =>
        this.toolNotificationHandler.handlePatchApplyCompleted(parsed),
      onItemCompleted: (parsed) => this.itemNotificationHandler.handleCompleted(parsed),
      onItemStarted: (parsed) => this.itemNotificationHandler.handleStarted(parsed),
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
      this.sessionHistory.markPending();
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
      planModeAvailable: this.sessionMetadata.hasPlanCollaborationMode(),
    });
  }

  private get client(): CodexAppServerClient | null {
    return this.connection.getClient();
  }

  private set client(client: CodexAppServerClient | null) {
    this.connection.setClient(client);
  }

  private get connected(): boolean {
    return this.connection.isConnected();
  }

  private set connected(connected: boolean) {
    this.connection.setConnected(connected);
  }

  async connect(): Promise<void> {
    await this.connection.connect();
  }

  private traceContext(): CodexAppServerTraceContext {
    return {
      agentId: this.agentId,
      sessionId: this.currentThreadId ?? undefined,
      turnId: this.activeForegroundTurnId ?? undefined,
    };
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
    this.sessionMetadata.refreshResolvedCollaborationMode(this.planModeEnabled);
    this.cachedRuntimeInfo = null;
  }

  private registerRequestHandlers(client: CodexAppServerClient): void {
    client.setRequestHandler("item/commandExecution/requestApproval", (params) =>
      this.handleCommandApprovalRequest(params),
    );
    client.setRequestHandler("item/fileChange/requestApproval", (params) =>
      this.handleFileChangeApprovalRequest(params),
    );
    client.setRequestHandler("item/tool/requestUserInput", (params) =>
      this.handleToolApprovalRequest(params),
    );
    // COMPAT(codex-tool-request-user-input): remove when supported Codex builds only emit item/tool/requestUserInput.
    client.setRequestHandler("tool/requestUserInput", (params) =>
      this.handleToolApprovalRequest(params),
    );
  }

  private loadPersistedHistory(): Promise<void> {
    return this.sessionHistory.load();
  }

  private ensureThreadLoaded(): Promise<void> {
    return this.threadBootstrap.ensureThreadLoaded();
  }

  private ensureThread(): Promise<void> {
    return this.threadBootstrap.ensureThread();
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
      collaborationMode: this.sessionMetadata.getResolvedCollaborationMode(),
      outputSchema: options?.outputSchema,
      developerInstructions,
      codexConfig: this.threadBootstrap.buildInnerConfig(),
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
        hasCollaborationMode: Boolean(this.sessionMetadata.getResolvedCollaborationMode()),
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

    const effectivePrompt = await this.commandController.resolvePrompt(prompt);

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
    for (const entry of this.sessionHistory.drain()) {
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
    const collaborationMode = this.sessionMetadata.getResolvedCollaborationMode();
    const info: AgentRuntimeInfo = {
      provider: CODEX_PROVIDER,
      sessionId: this.currentThreadId,
      model: this.config.model ?? null,
      thinkingOptionId: normalizeCodexThinkingOptionId(this.config.thinkingOptionId) ?? null,
      modeId: this.currentMode ?? null,
      extra: collaborationMode ? { collaborationMode: collaborationMode.name } : undefined,
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
    this.sessionMetadata.refreshResolvedCollaborationMode(this.planModeEnabled);
    this.cachedRuntimeInfo = null;
  }

  async setThinkingOption(thinkingOptionId: string | null): Promise<void> {
    this.config.thinkingOptionId = normalizeCodexThinkingOptionId(thinkingOptionId);
    this.sessionMetadata.refreshResolvedCollaborationMode(this.planModeEnabled);
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
        this.sessionHistory.reset();
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
    await this.connection.close();
    this.currentThreadId = null;
    this.currentTurnId = null;
    // Best-effort: clean up image attachments older than the TTL so temp files
    // do not accumulate across long-lived daemon sessions.
    void cleanupStaleCodexImageAttachments();
  }

  async listCommands(): Promise<AgentSlashCommand[]> {
    return this.commandController.listCommands();
  }

  async listSkills(): Promise<AgentSkill[]> {
    return this.commandController.listSkills();
  }

  tryHandleOutOfBand(
    prompt: AgentPromptInput,
  ): { run(ctx: { emit: (event: AgentStreamEvent) => void }): Promise<void> } | null {
    return this.commandController.tryHandleOutOfBand(prompt);
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
