import {
  type Event as OpenCodeEvent,
  type FilePartInput as OpenCodeFilePartInput,
  type OpencodeClient,
  type TextPartInput as OpenCodeTextPartInput,
} from "@opencode-ai/sdk/v2/client";
import type { Logger } from "pino";

import {
  type AgentFeature,
  type AgentMode,
  type AgentPermissionRequest,
  type AgentPermissionResponse,
  type AgentPersistenceHandle,
  type AgentPromptInput,
  type AgentRunOptions,
  type AgentRunResult,
  type AgentRuntimeInfo,
  type AgentSession,
  type AgentSlashCommand,
  type AgentStreamEvent,
  type AgentUsage,
} from "../../agent-sdk-types.js";
import {
  OPENCODE_AUTO_ACCEPT_FEATURE_ID,
  OPENCODE_BUILD_MODE_ID,
  OPENCODE_LEGACY_FULL_ACCESS_MODE_ID,
} from "./constants.js";
import { toDiagnosticErrorMessage } from "../diagnostic-utils.js";
import { runProviderTurn } from "../provider-runner.js";
import { renderPromptAttachmentAsText } from "../../prompt-attachments.js";
import { composeSystemPromptParts } from "../../system-prompt.js";
import { OpenCodeAbortCoordinator } from "./abort-coordinator.js";
import { OPENCODE_CAPABILITIES } from "./client.js";
import {
  applyRuntimeModelPrefix,
  buildOpenCodeModelContextWindowLookup,
  buildOpenCodeModelDefinition,
  buildOpenCodeModelLookupKey,
  extractOpenCodeModelContextWindow,
  isSelectableOpenCodeAgent,
  listOpenCodeCommandsFromSdk,
  mapOpenCodeAgentToMode,
  mergeOpenCodeModes,
  normalizeOpenCodeModeId,
  parseOpenCodeModelLookupKey,
  resolveOpenCodeRuntimeAgentId,
  resolveOpenCodeSelectedModelContextWindow,
  type OpenCodeAgentConfig,
} from "./catalog.js";
import { OpenCodeEventStreamController } from "./event-stream.js";
import { OpenCodePermissionController } from "./permission-controller.js";
import { OpenCodeSessionEventBus } from "./session-event-bus.js";
import { OpenCodeMcpController } from "./mcp-controller.js";
import {
  hasNormalizedOpenCodeUsage,
  maxFiniteNumber,
  mergeOpenCodeStepFinishUsage,
  resolveOpenCodeModelLookupKeyFromAssistantMessage,
  translateOpenCodeEvent,
  type OpenCodeMessageRole,
  type OpenCodeSubAgentActivityState,
  type OpenCodeToolPartEventPart,
} from "./event-translator.js";
import {
  buildOpenCodeAutoAcceptFeature,
  isOpenCodeAutoAcceptEnabled,
  isOpenCodeHeadersTimeoutFailure,
  isOpenCodeNotFoundError,
} from "./helpers.js";
import { revertOpenCodeConversationAndFiles } from "./rewind.js";
import { buildOpenCodeReplayTimelineEvents, filterOpenCodeRevertedMessages } from "./history.js";

export { collectOpenCodePersistedAgentsFromSdk } from "./history.js";

async function reconcileOpenCodeSessionClose(params: {
  client: Pick<OpencodeClient, "session">;
  sessionId: string;
  directory: string;
  logger: Logger;
}): Promise<void> {
  const { client, sessionId, directory, logger } = params;

  try {
    const response = await client.session.abort({
      sessionID: sessionId,
      directory,
    });
    if (response.error && !isOpenCodeNotFoundError(response.error)) {
      logger.warn(
        {
          sessionId,
          error: toDiagnosticErrorMessage(response.error),
        },
        "Failed to abort OpenCode session during close",
      );
    }
  } catch (error) {
    logger.warn(
      {
        sessionId,
        error: toDiagnosticErrorMessage(error),
      },
      "Failed to abort OpenCode session during close",
    );
  }

  try {
    const response = await client.session.update({
      sessionID: sessionId,
      directory,
      time: { archived: Date.now() },
    });
    if (response.error && !isOpenCodeNotFoundError(response.error)) {
      logger.warn(
        {
          sessionId,
          error: toDiagnosticErrorMessage(response.error),
        },
        "Failed to archive OpenCode session during close",
      );
    }
  } catch (error) {
    logger.warn(
      {
        sessionId,
        error: toDiagnosticErrorMessage(error),
      },
      "Failed to archive OpenCode session during close",
    );
  }
}

function getOpenCodeAttachmentExtension(mimeType: string): string {
  switch (mimeType) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/svg+xml":
      return "svg";
    default:
      return "bin";
  }
}

function toOpenCodeDataUrl(mimeType: string, data: string): { mimeType: string; url: string } {
  const match = data.match(/^data:([^;,]+);base64,(.+)$/);
  if (match) {
    return {
      mimeType: match[1] ?? mimeType,
      url: data,
    };
  }
  return {
    mimeType,
    url: `data:${mimeType};base64,${data}`,
  };
}

function buildOpenCodePromptParts(
  prompt: AgentPromptInput,
): Array<OpenCodeTextPartInput | OpenCodeFilePartInput> {
  if (typeof prompt === "string") {
    return [{ type: "text", text: prompt }];
  }
  let attachmentOrdinal = 0;
  const output: Array<OpenCodeTextPartInput | OpenCodeFilePartInput> = [];
  for (const part of prompt) {
    if (part.type === "text") {
      output.push({ type: "text", text: part.text });
      continue;
    }
    if (part.type === "image") {
      attachmentOrdinal += 1;
      const normalized = toOpenCodeDataUrl(part.mimeType, part.data);
      output.push({
        type: "file",
        mime: normalized.mimeType,
        filename: `attachment-${attachmentOrdinal}.${getOpenCodeAttachmentExtension(
          normalized.mimeType,
        )}`,
        url: normalized.url,
      });
      continue;
    }
    output.push({ type: "text", text: renderPromptAttachmentAsText(part) });
  }
  return output;
}

function buildOpenCodeUserTimelineText(prompt: AgentPromptInput): string {
  if (typeof prompt === "string") {
    return prompt;
  }
  return prompt
    .map((part) => {
      if (part.type === "text") {
        return part.text;
      }
      if (part.type === "image") {
        return "[Image]";
      }
      return renderPromptAttachmentAsText(part);
    })
    .filter((text) => text.trim().length > 0)
    .join("\n");
}

export const __openCodeInternals = {
  buildOpenCodePromptParts,
  buildOpenCodeModelContextWindowLookup,
  buildOpenCodeModelDefinition,
  buildOpenCodeModelLookupKey,
  extractOpenCodeModelContextWindow,
  hasNormalizedOpenCodeUsage,
  mergeOpenCodeStepFinishUsage,
  parseOpenCodeModelLookupKey,
  reconcileOpenCodeSessionClose,
  resolveOpenCodeModelLookupKeyFromAssistantMessage,
  resolveOpenCodeSelectedModelContextWindow,
  isSelectableOpenCodeAgent,
  mapOpenCodeAgentToMode,
  get OpenCodeAgentSession() {
    return OpenCodeAgentSession;
  },
};

interface OpenCodeTraceData {
  turnId?: string;
  [key: string]: unknown;
}

type OpenCodeTraceMessage =
  | "provider.opencode.prompt_async.start"
  | "provider.opencode.prompt_async.response"
  | "provider.opencode.prompt_async.throw"
  | "provider.opencode.subscribe.start"
  | "provider.opencode.subscribe.ready"
  | "provider.opencode.stream.eof"
  | "provider.opencode.turn.fail_eof"
  | "provider.opencode.subscribe.error"
  | "provider.opencode.raw_event"
  | "provider.opencode.event.skip"
  | "provider.opencode.parsed_event"
  | "provider.opencode.parsed_event.skip_active"
  | "provider.opencode.event.terminal"
  | "provider.opencode.finish_foreground_turn"
  | "provider.opencode.event_emit";

export class OpenCodeAgentSession implements AgentSession {
  readonly provider = "opencode" as const;
  readonly capabilities = OPENCODE_CAPABILITIES;

  private readonly config: OpenCodeAgentConfig;
  private readonly client: OpencodeClient;
  private readonly sessionId: string;
  private readonly logger: Logger;
  private readonly modelContextWindowsByModelKey: ReadonlyMap<string, number>;
  private currentMode: string = "default";
  private readonly permissionController: OpenCodePermissionController;
  private readonly abortCoordinator: OpenCodeAbortCoordinator;
  private accumulatedUsage: AgentUsage = {};
  private sessionTotalCostUsd: number | undefined;
  private readonly mcpController: OpenCodeMcpController;
  /** Tracks the role of each message by ID to distinguish user from assistant messages */
  private messageRoles = new Map<string, OpenCodeMessageRole>();
  private pendingUserMessageText: string | null = null;
  private emittedUserMessageIds = new Set<string>();
  /** Tracks streamed textual part IDs to suppress final full-text echoes from OpenCode. */
  private streamedPartKeys = new Set<string>();
  /** Tracks assistant messages already emitted from structured payloads. */
  private emittedStructuredMessageIds = new Set<string>();
  /** Tracks the type of each part by ID, learned from message.part.updated events. */
  private partTypes = new Map<string, string>();
  private availableModesCache: AgentMode[] | null = null;
  private readonly eventBus: OpenCodeSessionEventBus;
  private subAgentsByCallId = new Map<string, OpenCodeSubAgentActivityState>();
  private subAgentCallIdByChildSessionId = new Map<string, string>();
  private pendingChildToolPartsBySessionId = new Map<string, OpenCodeToolPartEventPart[]>();
  private selectedModelContextWindowMaxTokens: number | undefined;
  private releaseServer: (() => void) | null;
  private readonly eventStreamController: OpenCodeEventStreamController;
  private readonly persistSession: boolean;
  private deletedFromProvider = false;
  constructor(
    config: OpenCodeAgentConfig,
    client: OpencodeClient,
    sessionId: string,
    logger: Logger,
    modelContextWindowsByModelKey: ReadonlyMap<string, number> = new Map(),
    releaseServer?: () => void,
    persistSession = true,
    private readonly agentId?: string,
    private readonly modelPrefix?: string,
  ) {
    this.config = config;
    this.client = client;
    this.sessionId = sessionId;
    this.logger = logger.child({ agentId: this.agentId });
    this.abortCoordinator = new OpenCodeAbortCoordinator({
      client: this.client,
      sessionId: this.sessionId,
      getDirectory: () => this.config.cwd,
      logger: this.logger,
    });
    this.eventBus = new OpenCodeSessionEventBus({
      trace: (message, data) => this.traceOpenCode(message, data),
      onTurnFinished: () => {
        this.pendingUserMessageText = null;
        this.abortCoordinator.clearTurn();
      },
    });
    this.mcpController = new OpenCodeMcpController({
      client: this.client,
      getDirectory: () => this.config.cwd,
    });
    this.permissionController = new OpenCodePermissionController({
      client: this.client,
      getDirectory: () => this.config.cwd,
      logger: this.logger,
      autoAcceptEnabled: isOpenCodeAutoAcceptEnabled(config),
    });
    this.eventStreamController = new OpenCodeEventStreamController({
      client: this.client,
      sessionId: this.sessionId,
      getDirectory: () => this.config.cwd,
      getActiveTurnId: () => this.eventBus.getActiveTurnId(),
      translateEvent: (event) => this.translateEvent(event),
      trackToolCall: (item) => this.eventBus.trackToolCall(item),
      finishTurn: (event, turnId) => this.eventBus.finish(event, turnId),
      notify: (event, turnId) => this.eventBus.notify(event, turnId),
      trace: (message, data) => this.traceOpenCode(message, data),
      logger: this.logger,
    });
    this.modelContextWindowsByModelKey = modelContextWindowsByModelKey;
    this.currentMode = normalizeOpenCodeModeId(config.modeId);
    this.releaseServer = releaseServer ?? null;
    this.persistSession = persistSession;
    this.selectedModelContextWindowMaxTokens = this.resolveConfiguredModelContextWindowMaxTokens(
      config.model,
    );
    this.eventStreamController.start();
  }

  get id(): string | null {
    return this.sessionId;
  }

  get features(): AgentFeature[] {
    return [buildOpenCodeAutoAcceptFeature(this.config)];
  }

  async getRuntimeInfo(): Promise<AgentRuntimeInfo> {
    return {
      provider: "opencode",
      sessionId: this.sessionId,
      model: this.config.model ?? null,
      modeId: this.currentMode,
    };
  }

  async setModel(modelId: string | null): Promise<void> {
    const normalizedModelId =
      typeof modelId === "string" && modelId.trim().length > 0 ? modelId : null;
    this.config.model = applyRuntimeModelPrefix(
      normalizedModelId ?? undefined,
      this.modelPrefix ?? null,
    );
    this.selectedModelContextWindowMaxTokens = this.resolveConfiguredModelContextWindowMaxTokens(
      this.config.model,
    );
  }

  async setThinkingOption(thinkingOptionId: string | null): Promise<void> {
    const normalizedThinkingOptionId =
      typeof thinkingOptionId === "string" && thinkingOptionId.trim().length > 0
        ? thinkingOptionId
        : null;
    this.config.thinkingOptionId = normalizedThinkingOptionId ?? undefined;
  }

  async run(prompt: AgentPromptInput, options?: AgentRunOptions): Promise<AgentRunResult> {
    return runProviderTurn({
      prompt,
      runOptions: options,
      startTurn: (p, o) => this.startTurn(p, o),
      subscribe: (callback) => this.subscribe(callback),
      getSessionId: () => this.sessionId,
    });
  }

  async interrupt(): Promise<void> {
    const turnId = this.eventBus.getActiveTurnId();
    await this.abortCoordinator.interruptCurrentTurn(turnId);
    if (turnId) {
      this.eventStreamController.suppressTerminalUntilUserMessage();
      this.eventBus.finish(
        { type: "turn_canceled", provider: "opencode", reason: "interrupted" },
        turnId,
      );
    }
  }

  async revertBoth(input: { messageId: string }): Promise<void> {
    await revertOpenCodeConversationAndFiles({
      client: this.client,
      sessionId: this.sessionId,
      cwd: this.config.cwd,
      messageId: input.messageId,
    });
  }

  async startTurn(
    prompt: AgentPromptInput,
    options?: AgentRunOptions,
  ): Promise<{ turnId: string }> {
    if (this.eventBus.getActiveTurnId()) {
      throw new Error("A foreground turn is already active");
    }
    await this.abortCoordinator.awaitPendingBeforeStart();

    this.eventBus.prepareTurn();
    this.subAgentsByCallId.clear();
    this.subAgentCallIdByChildSessionId.clear();
    this.pendingChildToolPartsBySessionId.clear();
    const turnAbortController = this.abortCoordinator.beginTurn();
    await this.mcpController.ensureConfigured(this.config.mcpServers);
    const contextWindowMaxTokens = this.resolveSelectedModelContextWindowMaxTokens();
    this.accumulatedUsage = contextWindowMaxTokens !== undefined ? { contextWindowMaxTokens } : {};

    const parts = buildOpenCodePromptParts(prompt);
    this.pendingUserMessageText = buildOpenCodeUserTimelineText(prompt);
    const model = this.parseModel(this.config.model);
    const thinkingOptionId = this.config.thinkingOptionId;
    const effectiveVariant = thinkingOptionId ?? undefined;
    const effectiveMode = resolveOpenCodeRuntimeAgentId(this.currentMode);

    try {
      await this.eventStreamController.ensureReady();
    } catch (error) {
      this.abortCoordinator.clearTurn(turnAbortController);
      throw error;
    }

    const turnId = this.eventBus.beginTurn();

    const slashCommand = await this.resolveSlashCommandInvocation(prompt);
    if (slashCommand) {
      if (slashCommand.commandName === "compact" || slashCommand.commandName === "summarize") {
        void this.client.session
          .summarize({
            sessionID: this.sessionId,
            directory: this.config.cwd,
            ...(model ? { providerID: model.providerID, modelID: model.modelID } : {}),
          })
          .then((response) => {
            if (response.error) {
              this.eventBus.finish(
                {
                  type: "turn_failed",
                  provider: "opencode",
                  error: toDiagnosticErrorMessage(response.error),
                },
                turnId,
              );
            } else {
              this.eventBus.finish(
                { type: "turn_completed", provider: "opencode", usage: undefined },
                turnId,
              );
            }
            return;
          })
          .catch((error) => {
            this.eventBus.finish(
              {
                type: "turn_failed",
                provider: "opencode",
                error: toDiagnosticErrorMessage(error),
              },
              turnId,
            );
          });
        return { turnId };
      }

      // command() is only dispatch acknowledgement. OpenCode session events are
      // the source of truth for when the command turn becomes idle or fails.
      void this.client.session
        .command({
          sessionID: this.sessionId,
          directory: this.config.cwd,
          command: slashCommand.commandName,
          arguments: slashCommand.args ?? "",
          ...(this.config.model ? { model: this.config.model } : {}),
          ...(effectiveMode ? { agent: effectiveMode } : {}),
          ...(effectiveVariant ? { variant: effectiveVariant } : {}),
        })
        .then((response) => {
          if (response.error) {
            if (isOpenCodeHeadersTimeoutFailure(response.error)) {
              this.logger.warn(
                {
                  err: response.error,
                  commandName: slashCommand.commandName,
                  turnId,
                },
                "OpenCode slash command hit a header timeout; waiting for SSE terminal event",
              );
              return;
            }
            const errorMsg = toDiagnosticErrorMessage(response.error);
            this.eventBus.finish(
              { type: "turn_failed", provider: "opencode", error: errorMsg },
              turnId,
            );
          }
          return;
        })
        .catch((err) => {
          if (isOpenCodeHeadersTimeoutFailure(err)) {
            this.logger.warn(
              {
                err,
                commandName: slashCommand.commandName,
                turnId,
              },
              "OpenCode slash command hit a header timeout; waiting for SSE terminal event",
            );
            return;
          }
          this.eventBus.finish(
            { type: "turn_failed", provider: "opencode", error: toDiagnosticErrorMessage(err) },
            turnId,
          );
        });
    } else {
      // Wrap in an async IIFE so a synchronous throw from promptAsync (e.g.
      // SDK input validation) is caught alongside async rejections. A plain
      // `.then().catch()` chain would let a sync throw escape unhandled.
      void (async () => {
        this.traceOpenCode("provider.opencode.prompt_async.start", {
          turnId,
          sessionId: this.sessionId,
          model,
          effectiveMode,
          effectiveVariant,
          partTypes: parts.map((p) => p.type),
        });
        try {
          const systemPrompt = composeSystemPromptParts(
            this.config.systemPrompt,
            this.config.daemonAppendSystemPrompt,
          );
          const promptResponse = await this.client.session.promptAsync({
            sessionID: this.sessionId,
            directory: this.config.cwd,
            parts,
            ...(options?.outputSchema
              ? {
                  format: {
                    type: "json_schema" as const,
                    schema: options.outputSchema as Record<string, unknown>,
                  },
                }
              : {}),
            ...(systemPrompt ? { system: systemPrompt } : {}),
            ...(model ? { model } : {}),
            ...(effectiveMode ? { agent: effectiveMode } : {}),
            ...(effectiveVariant ? { variant: effectiveVariant } : {}),
          });
          this.traceOpenCode("provider.opencode.prompt_async.response", {
            turnId,
            hasError: promptResponse.error !== undefined,
            error: promptResponse.error,
            data: promptResponse.data,
          });
          if (promptResponse.error) {
            this.eventBus.finish(
              {
                type: "turn_failed",
                provider: "opencode",
                error: toDiagnosticErrorMessage(promptResponse.error),
              },
              turnId,
            );
          }
        } catch (error) {
          this.traceOpenCode("provider.opencode.prompt_async.throw", {
            turnId,
            error:
              error instanceof Error
                ? { name: error.name, message: error.message, stack: error.stack }
                : String(error),
          });
          this.eventBus.finish(
            {
              type: "turn_failed",
              provider: "opencode",
              error: toDiagnosticErrorMessage(error),
            },
            turnId,
          );
        }
      })();
    }

    return { turnId };
  }
  subscribe(callback: (event: AgentStreamEvent) => void): () => void {
    return this.eventBus.subscribe(callback);
  }

  private traceOpenCode(msg: OpenCodeTraceMessage, data: OpenCodeTraceData = {}): void {
    this.logger.trace(
      {
        agentId: this.agentId,
        provider: "opencode",
        sessionId: this.sessionId,
        turnId: data.turnId ?? this.eventBus.getActiveTurnId() ?? undefined,
        ...data,
      },
      msg,
    );
  }

  async *streamHistory(): AsyncGenerator<AgentStreamEvent> {
    const sessionResponse = await this.client.session.get({
      sessionID: this.sessionId,
      directory: this.config.cwd,
    });
    const response = await this.client.session.messages({
      sessionID: this.sessionId,
      directory: this.config.cwd,
    });

    if (response.error || !response.data) {
      return;
    }

    const messages = filterOpenCodeRevertedMessages(
      response.data,
      sessionResponse.error ? null : sessionResponse.data?.revert,
    );
    for (const message of messages) {
      for (const event of buildOpenCodeReplayTimelineEvents(message)) {
        yield event;
      }
    }
  }

  async getAvailableModes(): Promise<AgentMode[]> {
    if (this.availableModesCache) {
      return this.availableModesCache;
    }

    const response = await this.client.app.agents({
      directory: this.config.cwd,
    });
    const agents = response.error || !response.data ? [] : response.data;

    const discoveredModes = agents.filter(isSelectableOpenCodeAgent).map(mapOpenCodeAgentToMode);

    this.availableModesCache = mergeOpenCodeModes(discoveredModes);
    return this.availableModesCache;
  }

  async getCurrentMode(): Promise<string | null> {
    return this.currentMode;
  }

  async listCommands(): Promise<AgentSlashCommand[]> {
    return await listOpenCodeCommandsFromSdk(this.client, this.config.cwd);
  }

  async setMode(modeId: string): Promise<void> {
    const normalizedModeId = normalizeOpenCodeModeId(modeId);
    if (normalizedModeId === OPENCODE_LEGACY_FULL_ACCESS_MODE_ID) {
      this.currentMode = OPENCODE_BUILD_MODE_ID;
      await this.setFeature(OPENCODE_AUTO_ACCEPT_FEATURE_ID, true);
      return;
    }

    this.currentMode = normalizedModeId;
    this.config.modeId = normalizedModeId;
  }

  async setFeature(featureId: string, value: unknown): Promise<void> {
    if (featureId !== OPENCODE_AUTO_ACCEPT_FEATURE_ID) {
      throw new Error(`Unsupported OpenCode feature '${featureId}'`);
    }

    const enabled = value === true;
    this.permissionController.setAutoAcceptEnabled(enabled);
    this.config.featureValues = {
      ...this.config.featureValues,
      [OPENCODE_AUTO_ACCEPT_FEATURE_ID]: enabled,
    };
  }

  getPendingPermissions(): AgentPermissionRequest[] {
    return this.permissionController.getPending();
  }

  async respondToPermission(requestId: string, response: AgentPermissionResponse): Promise<void> {
    await this.permissionController.respond(requestId, response);
  }

  describePersistence(): AgentPersistenceHandle | null {
    return {
      provider: "opencode",
      sessionId: this.sessionId,
      nativeHandle: this.sessionId,
      metadata: {
        cwd: this.config.cwd,
        ...(this.config.modeId ? { modeId: this.config.modeId } : {}),
        ...(this.config.model ? { model: this.config.model } : {}),
      },
    };
  }

  async close(): Promise<void> {
    try {
      // Flip closed before clearing subscribers so any event the SDK delivers
      // after the abort (between here and subscribers.clear) is swallowed by
      // notifySubscribers instead of bubbling through provider-runner as an
      // unhandled rejection in whichever test the daemon hops to next.
      this.eventBus.close();
      this.abortCoordinator.close();
      this.eventStreamController.close();
      await reconcileOpenCodeSessionClose({
        client: this.client,
        sessionId: this.sessionId,
        directory: this.config.cwd,
        logger: this.logger,
      });
      await this.deleteProviderSessionIfEphemeral();
    } finally {
      this.releaseServer?.();
      this.releaseServer = null;
    }
  }

  private async deleteProviderSessionIfEphemeral(): Promise<void> {
    if (this.persistSession || this.deletedFromProvider) {
      return;
    }
    this.deletedFromProvider = true;
    try {
      const response = await this.client.session.delete({
        sessionID: this.sessionId,
        directory: this.config.cwd,
      });
      if (response.error) {
        throw new Error(`OpenCode session.delete failed: ${JSON.stringify(response.error)}`);
      }
    } catch (error) {
      this.logger.debug(
        { err: error, sessionId: this.sessionId },
        "Failed to delete non-persistent OpenCode session",
      );
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

  private parseModel(model?: string): { providerID: string; modelID: string } | undefined {
    if (!model) {
      return undefined;
    }
    const parts = model.split("/");
    if (parts.length >= 2) {
      return { providerID: parts[0], modelID: parts.slice(1).join("/") };
    }
    return { providerID: this.modelPrefix ?? "opencode", modelID: model };
  }

  private async translateEvent(event: OpenCodeEvent): Promise<AgentStreamEvent[]> {
    const translated = translateOpenCodeEvent(event, {
      sessionId: this.sessionId,
      cwd: this.config.cwd,
      messageRoles: this.messageRoles,
      pendingUserMessageText: this.pendingUserMessageText,
      emittedUserMessageIds: this.emittedUserMessageIds,
      accumulatedUsage: this.accumulatedUsage,
      sessionTotalCostUsd: this.sessionTotalCostUsd,
      streamedPartKeys: this.streamedPartKeys,
      emittedStructuredMessageIds: this.emittedStructuredMessageIds,
      partTypes: this.partTypes,
      subAgentsByCallId: this.subAgentsByCallId,
      subAgentCallIdByChildSessionId: this.subAgentCallIdByChildSessionId,
      pendingChildToolPartsBySessionId: this.pendingChildToolPartsBySessionId,
      modelContextWindowsByModelKey: this.modelContextWindowsByModelKey,
      onAssistantModelContextWindowResolved: (contextWindowMaxTokens) => {
        this.accumulatedUsage.contextWindowMaxTokens = contextWindowMaxTokens;
        if (!this.config.model) {
          this.selectedModelContextWindowMaxTokens = contextWindowMaxTokens;
        }
      },
    });

    const events: AgentStreamEvent[] = [];
    if (typeof this.accumulatedUsage.totalCostUsd === "number") {
      this.sessionTotalCostUsd = maxFiniteNumber(
        this.sessionTotalCostUsd,
        this.accumulatedUsage.totalCostUsd,
      );
    }

    for (const translatedEvent of translated) {
      if (translatedEvent.type === "permission_requested") {
        const shouldSurface = await this.permissionController.register(translatedEvent.request);
        if (!shouldSurface) {
          continue;
        }
      }
      if (translatedEvent.type === "turn_completed") {
        if (hasNormalizedOpenCodeUsage(this.accumulatedUsage)) {
          translatedEvent.usage = this.accumulatedUsage;
        }
        const contextWindowMaxTokens = this.resolveSelectedModelContextWindowMaxTokens();
        this.accumulatedUsage =
          contextWindowMaxTokens !== undefined ? { contextWindowMaxTokens } : {};
      }
      events.push(translatedEvent);
    }

    return events;
  }

  private resolveSelectedModelContextWindowMaxTokens(): number | undefined {
    return this.selectedModelContextWindowMaxTokens;
  }

  private resolveConfiguredModelContextWindowMaxTokens(
    modelId: string | undefined,
  ): number | undefined {
    const modelLookupKey = parseOpenCodeModelLookupKey(modelId);
    if (!modelLookupKey) {
      return undefined;
    }
    return this.modelContextWindowsByModelKey.get(modelLookupKey);
  }
}
