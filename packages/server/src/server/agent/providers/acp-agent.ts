import { type ChildProcess, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  ClientSideConnection,
  type AgentCapabilities as ACPAgentCapabilities,
  type Error as ACPError,
  type Client as ACPClient,
  type ConfigOptionUpdate,
  type ContentBlock,
  type CreateTerminalRequest,
  type CurrentModeUpdate,
  type EnvVariable,
  type KillTerminalRequest,
  type ListSessionsResponse,
  type LoadSessionResponse,
  type McpServer,
  type NewSessionResponse,
  type PermissionOption,
  type PromptResponse,
  type ReadTextFileRequest,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type ResumeSessionResponse,
  type SessionConfigOption,
  type SessionInfoUpdate,
  type SessionNotification,
  type SessionUpdate,
  type TerminalOutputRequest,
  type TerminalOutputResponse,
  type ToolCall,
  type ToolCallUpdate,
  type Usage,
  type UsageUpdate,
  type WaitForTerminalExitRequest,
  type WriteTextFileRequest,
} from "@agentclientprotocol/sdk";
import type { Logger } from "pino";

import {
  getAgentStreamEventTurnId,
  type AgentCapabilityFlags,
  type AgentClient,
  type AgentLaunchContext,
  type AgentMetadata,
  type AgentMode,
  type AgentModelDefinition,
  type AgentPermissionRequest,
  type AgentPermissionResponse,
  type AgentPersistenceHandle,
  type AgentPromptContentBlock,
  type AgentPromptInput,
  type AgentRunOptions,
  type AgentRunResult,
  type AgentRuntimeInfo,
  type AgentSession,
  type AgentSessionConfig,
  type AgentSlashCommand,
  type AgentStreamEvent,
  type AgentTimelineItem,
  type AgentUsage,
  type ListModesOptions,
  type ListModelsOptions,
  type ListPersistedAgentsOptions,
  type McpServerConfig,
  type PersistedAgentDescriptor,
} from "../agent-sdk-types.js";
import { createProviderEnvSpec, type ProviderRuntimeSettings } from "../provider-launch-config.js";
import { renderPromptAttachmentAsText } from "../prompt-attachments.js";
import { appendOrReplaceGrowingAssistantMessage, runProviderTurn } from "./provider-runner.js";
import { platformShell, spawnProcess } from "../../../utils/spawn.js";
import {
  contentBlockToText,
  mapACPPermissionRequest,
  mapACPPlanToTimeline,
  mapACPToolSnapshotToTimeline,
  mergeACPToolSnapshot,
  selectACPPermissionOption,
  type ACPToolSnapshot,
} from "./acp/tool-call-mapper.js";
import {
  deriveCurrentConfigValue,
  deriveModelDefinitionsFromACP,
  deriveModesFromACP,
  findSelectConfigOption,
  flattenSelectOptions,
  resolveACPModeSelection,
  resolveACPModelSelection,
  type ACPBeforeModeWriteResult,
  type ACPModeSelection,
  type ACPModelSelection,
  type ACPProviderModeWriterContext,
  type ACPProviderModeWriteResult,
  type AvailableACPModel,
} from "./acp/session-config.js";
import {
  ACP_PROBE_ENV,
  resolveACPLaunchCommand,
  spawnInitializedACPProcess,
  terminateACPChildProcess,
  type SpawnedACPProcess,
} from "./acp/process-runtime.js";
export type { ACPToolSnapshot } from "./acp/tool-call-mapper.js";
export { createLoggedNdJsonStream } from "./acp/ndjson-stream.js";
export type { SpawnedACPProcess } from "./acp/process-runtime.js";
export {
  deriveModelDefinitionsFromACP,
  deriveModesFromACP,
  resolveACPModeSelection,
  resolveACPModelSelection,
  type ACPBeforeModeWriteResult,
  type ACPProviderModeWriterContext,
  type ACPProviderModeWriteResult,
} from "./acp/session-config.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function isACPError(value: unknown): value is ACPError {
  return isRecord(value) && typeof value.message === "string" && typeof value.code === "number";
}

function summarizeACPRequestError(error: unknown): {
  message: string;
  code?: string;
  diagnostic?: string;
} {
  // Promise rejections are untyped, but the ACP SDK rejects JSON-RPC failures as response.error.
  if (isACPError(error)) {
    const code = String(error.code);
    const data = error.data === undefined ? "" : ` | data=${JSON.stringify(error.data)}`;
    return {
      message: error.message,
      code,
      diagnostic: `${error.message} | code=${code}${data}`,
    };
  }

  if (error instanceof Error) {
    return { message: error.message };
  }

  return { message: String(error) };
}

function resolveTerminalCommand(
  command: string,
  args?: string[],
): { command: string; args: string[] } {
  if (args && args.length > 0) {
    return { command, args };
  }

  if (!/\s/.test(command.trim())) {
    return { command, args: [] };
  }

  const shell = platformShell();
  return { command: shell.command, args: [...shell.flag, command] };
}

/**
 * Resolves `target` against `base` and returns the resolved path only if it
 * stays inside `base`. This is an INTENT constraint (keeps ACP fs/terminal
 * requests inside the project directory so agent typos don't write outside
 * the workspace), NOT a security boundary — the ACP agent runs as the same
 * OS user with the same privileges as the daemon and could spawn its own
 * processes to escape this check.
 *
 * @throws Error if the resolved path escapes `base`
 */
function resolvePathInsideBase(target: string, base: string): string {
  const resolvedTarget = path.resolve(target);
  const resolvedBase = path.resolve(base);
  const relative = path.relative(resolvedBase, resolvedTarget);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path "${target}" escapes the project directory "${base}"`);
  }
  return resolvedTarget;
}

const DEFAULT_ACP_CAPABILITIES: AgentCapabilityFlags = {
  supportsStreaming: true,
  supportsSessionPersistence: true,
  supportsDynamicModes: true,
  supportsMcpServers: true,
  supportsReasoningStream: true,
  supportsToolInvocations: true,
  supportsRewindConversation: false,
  supportsRewindFiles: false,
  supportsRewindBoth: false,
};

interface ACPAgentClientOptions {
  provider: string;
  logger: Logger;
  runtimeSettings?: ProviderRuntimeSettings;
  defaultCommand: [string, ...string[]];
  defaultModes?: AgentMode[];
  modelTransformer?: (models: AgentModelDefinition[]) => AgentModelDefinition[];
  sessionResponseTransformer?: (response: SessionStateResponse) => SessionStateResponse;
  configOptionsTransformer?: (configOptions: SessionConfigOption[]) => SessionConfigOption[];
  modeIdTransformer?: (modeId: string) => string | null;
  toolSnapshotTransformer?: (snapshot: ACPToolSnapshot) => ACPToolSnapshot;
  providerModeWriter?: (
    context: ACPProviderModeWriterContext,
  ) => Promise<ACPProviderModeWriteResult>;
  beforeModeWriter?: (context: ACPProviderModeWriterContext) => Promise<ACPBeforeModeWriteResult>;
  thinkingOptionWriter?: (
    connection: ClientSideConnection,
    sessionId: string,
    thinkingOptionId: string,
  ) => Promise<void>;
  capabilities?: AgentCapabilityFlags;
  waitForInitialCommands?: boolean;
  initialCommandsWaitTimeoutMs?: number;
}

interface ACPAgentSessionOptions {
  provider: string;
  logger: Logger;
  runtimeSettings?: ProviderRuntimeSettings;
  defaultCommand: [string, ...string[]];
  defaultModes: AgentMode[];
  modelTransformer?: (models: AgentModelDefinition[]) => AgentModelDefinition[];
  sessionResponseTransformer?: (response: SessionStateResponse) => SessionStateResponse;
  configOptionsTransformer?: (configOptions: SessionConfigOption[]) => SessionConfigOption[];
  modeIdTransformer?: (modeId: string) => string | null;
  toolSnapshotTransformer?: (snapshot: ACPToolSnapshot) => ACPToolSnapshot;
  providerModeWriter?: (
    context: ACPProviderModeWriterContext,
  ) => Promise<ACPProviderModeWriteResult>;
  beforeModeWriter?: (context: ACPProviderModeWriterContext) => Promise<ACPBeforeModeWriteResult>;
  thinkingOptionWriter?: (
    connection: ClientSideConnection,
    sessionId: string,
    thinkingOptionId: string,
  ) => Promise<void>;
  capabilities: AgentCapabilityFlags;
  handle?: AgentPersistenceHandle;
  agentId?: string;
  launchEnv?: Record<string, string>;
  waitForInitialCommands?: boolean;
  initialCommandsWaitTimeoutMs?: number;
}

interface PendingPermission {
  request: AgentPermissionRequest;
  options: PermissionOption[];
  resolve: (response: RequestPermissionResponse) => void;
  reject: (error: Error) => void;
  turnId: string | null;
}

interface MessageAssemblyState {
  text: string;
}

export type SessionStateResponse = NewSessionResponse | LoadSessionResponse | ResumeSessionResponse;

interface TerminalExit {
  exitCode?: number | null;
  signal?: string | null;
}

interface TerminalEntry {
  id: string;
  child: ChildProcess;
  output: string;
  truncated: boolean;
  outputByteLimit: number | null;
  exit: TerminalExit | null;
  waitForExit: Promise<TerminalExit>;
  resolveExit: (exit: TerminalExit) => void;
  rejectExit: (error: Error) => void;
}

export function mapACPUsage(usage: Usage | null | undefined): AgentUsage | undefined {
  if (!usage) {
    return undefined;
  }

  return {
    inputTokens: usage.inputTokens ?? undefined,
    outputTokens: usage.outputTokens ?? undefined,
    cachedInputTokens: usage.cachedReadTokens ?? undefined,
  };
}

export class ACPAgentClient implements AgentClient {
  readonly provider: string;
  readonly capabilities: AgentCapabilityFlags;

  protected readonly logger: Logger;
  protected readonly runtimeSettings?: ProviderRuntimeSettings;
  protected readonly defaultCommand: [string, ...string[]];
  protected readonly defaultModes: AgentMode[];
  private readonly modelTransformer?: (models: AgentModelDefinition[]) => AgentModelDefinition[];
  private readonly sessionResponseTransformer?: (
    response: SessionStateResponse,
  ) => SessionStateResponse;
  private readonly configOptionsTransformer?: (
    configOptions: SessionConfigOption[],
  ) => SessionConfigOption[];
  private readonly modeIdTransformer?: (modeId: string) => string | null;
  private readonly toolSnapshotTransformer?: (snapshot: ACPToolSnapshot) => ACPToolSnapshot;
  private readonly providerModeWriter?: (
    context: ACPProviderModeWriterContext,
  ) => Promise<ACPProviderModeWriteResult>;
  private readonly beforeModeWriter?: (
    context: ACPProviderModeWriterContext,
  ) => Promise<ACPBeforeModeWriteResult>;
  private readonly thinkingOptionWriter?: (
    connection: ClientSideConnection,
    sessionId: string,
    thinkingOptionId: string,
  ) => Promise<void>;
  private readonly waitForInitialCommands: boolean;
  private readonly initialCommandsWaitTimeoutMs: number;

  constructor(options: ACPAgentClientOptions) {
    this.provider = options.provider;
    this.capabilities = options.capabilities ?? DEFAULT_ACP_CAPABILITIES;
    this.logger = options.logger.child({
      module: "agent",
      provider: options.provider,
    });
    this.runtimeSettings = options.runtimeSettings;
    this.defaultCommand = options.defaultCommand;
    this.defaultModes = options.defaultModes ?? [];
    this.modelTransformer = options.modelTransformer;
    this.sessionResponseTransformer = options.sessionResponseTransformer;
    this.configOptionsTransformer = options.configOptionsTransformer;
    this.modeIdTransformer = options.modeIdTransformer;
    this.toolSnapshotTransformer = options.toolSnapshotTransformer;
    this.providerModeWriter = options.providerModeWriter;
    this.beforeModeWriter = options.beforeModeWriter;
    this.thinkingOptionWriter = options.thinkingOptionWriter;
    this.waitForInitialCommands = options.waitForInitialCommands ?? false;
    this.initialCommandsWaitTimeoutMs = options.initialCommandsWaitTimeoutMs ?? 1500;
  }

  async createSession(
    config: AgentSessionConfig,
    launchContext?: AgentLaunchContext,
  ): Promise<AgentSession> {
    this.assertProvider(config);
    const session = new ACPAgentSession(
      { ...config, provider: this.provider },
      {
        provider: this.provider,
        logger: this.logger,
        runtimeSettings: this.runtimeSettings,
        defaultCommand: this.defaultCommand,
        defaultModes: this.defaultModes,
        modelTransformer: this.modelTransformer,
        sessionResponseTransformer: this.sessionResponseTransformer,
        configOptionsTransformer: this.configOptionsTransformer,
        modeIdTransformer: this.modeIdTransformer,
        toolSnapshotTransformer: this.toolSnapshotTransformer,
        providerModeWriter: this.providerModeWriter,
        beforeModeWriter: this.beforeModeWriter,
        thinkingOptionWriter: this.thinkingOptionWriter,
        capabilities: this.capabilities,
        agentId: launchContext?.agentId,
        launchEnv: launchContext?.env,
        waitForInitialCommands: this.waitForInitialCommands,
        initialCommandsWaitTimeoutMs: this.initialCommandsWaitTimeoutMs,
      },
    );
    await session.initializeNewSession();
    return session;
  }

  async resumeSession(
    handle: AgentPersistenceHandle,
    overrides?: Partial<AgentSessionConfig>,
    launchContext?: AgentLaunchContext,
  ): Promise<AgentSession> {
    if (handle.provider !== this.provider) {
      throw new Error(`Cannot resume ${handle.provider} handle with ${this.provider} provider`);
    }

    const storedConfig = coerceSessionConfigMetadata(handle.metadata);
    const cwd = overrides?.cwd ?? storedConfig.cwd;
    if (!cwd) {
      throw new Error(`${this.provider} resume requires the original working directory`);
    }

    const mergedConfig: AgentSessionConfig = {
      ...storedConfig,
      ...overrides,
      provider: this.provider,
      cwd,
    };
    const session = new ACPAgentSession(mergedConfig, {
      provider: this.provider,
      logger: this.logger,
      runtimeSettings: this.runtimeSettings,
      defaultCommand: this.defaultCommand,
      defaultModes: this.defaultModes,
      modelTransformer: this.modelTransformer,
      sessionResponseTransformer: this.sessionResponseTransformer,
      configOptionsTransformer: this.configOptionsTransformer,
      modeIdTransformer: this.modeIdTransformer,
      toolSnapshotTransformer: this.toolSnapshotTransformer,
      providerModeWriter: this.providerModeWriter,
      beforeModeWriter: this.beforeModeWriter,
      thinkingOptionWriter: this.thinkingOptionWriter,
      capabilities: this.capabilities,
      handle,
      agentId: launchContext?.agentId,
      launchEnv: launchContext?.env,
      waitForInitialCommands: this.waitForInitialCommands,
      initialCommandsWaitTimeoutMs: this.initialCommandsWaitTimeoutMs,
    });
    await session.initializeResumedSession();
    return session;
  }

  async listModels(options: ListModelsOptions): Promise<AgentModelDefinition[]> {
    const { cwd } = options;
    const probe = await this.spawnProcess(ACP_PROBE_ENV);
    try {
      const response = await probe.connection.newSession({
        cwd,
        mcpServers: [],
      });
      const transformed = this.transformSessionResponse(response);
      const models = deriveModelDefinitionsFromACP(
        this.provider,
        transformed.models,
        transformed.configOptions,
      );
      return this.modelTransformer ? this.modelTransformer(models) : models;
    } finally {
      await this.closeProbe(probe);
    }
  }

  async listModes(options: ListModesOptions): Promise<AgentMode[]> {
    const { cwd } = options;
    const probe = await this.spawnProcess(ACP_PROBE_ENV);
    try {
      const response = await probe.connection.newSession({
        cwd,
        mcpServers: [],
      });
      const transformed = this.transformSessionResponse(response);
      const modeInfo = deriveModesFromACP(
        this.defaultModes,
        transformed.modes,
        transformed.configOptions,
      );
      return modeInfo.modes;
    } finally {
      await this.closeProbe(probe);
    }
  }

  async listPersistedAgents(
    options?: ListPersistedAgentsOptions,
  ): Promise<PersistedAgentDescriptor[]> {
    const probe = await this.spawnProcess(ACP_PROBE_ENV);
    try {
      if (!probe.initialize.agentCapabilities?.sessionCapabilities?.list) {
        return [];
      }

      const sessions: PersistedAgentDescriptor[] = [];
      let cursor: string | null | undefined;
      for (;;) {
        const page: ListSessionsResponse = await probe.connection.listSessions(
          cursor ? { cursor } : {},
        );
        for (const session of page.sessions) {
          sessions.push({
            provider: this.provider,
            sessionId: session.sessionId,
            cwd: session.cwd,
            title: session.title ?? null,
            lastActivityAt: session.updatedAt ? new Date(session.updatedAt) : new Date(0),
            persistence: {
              provider: this.provider,
              sessionId: session.sessionId,
              nativeHandle: session.sessionId,
              metadata: {
                provider: this.provider,
                cwd: session.cwd,
                title: session.title ?? null,
              },
            },
            timeline: [],
          });
        }
        cursor = page.nextCursor ?? null;
        if (!cursor) break;
        if (options?.limit && sessions.length >= options.limit) break;
      }

      return typeof options?.limit === "number" ? sessions.slice(0, options.limit) : sessions;
    } finally {
      await this.closeProbe(probe);
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.resolveLaunchCommand();
      return true;
    } catch {
      return false;
    }
  }

  protected async spawnProcess(
    launchEnv?: Record<string, string>,
    options?: { initializeTimeoutMs?: number },
  ): Promise<SpawnedACPProcess> {
    return spawnInitializedACPProcess({
      launch: await this.resolveLaunchCommand(),
      cwd: process.cwd(),
      runtimeSettings: this.runtimeSettings,
      launchEnv,
      logger: this.logger,
      provider: this.provider,
      clientFactory: () => this.buildProbeClient(),
      initializeTimeoutMs: options?.initializeTimeoutMs,
    });
  }

  protected buildProbeClient(): ACPClient {
    return {
      async requestPermission(): Promise<RequestPermissionResponse> {
        return { outcome: { outcome: "cancelled" } };
      },
      async sessionUpdate(): Promise<void> {},
      // Probe path: agents do not issue fs requests during model/mode probing,
      // so these are protocol placeholders. The cwd-bounded
      // resolvePathInsideBase guard is applied on the live session path
      // (ACPAgentSession.readTextFile/writeTextFile/createTerminal) where real
      // agent requests arrive.
      async readTextFile(params: ReadTextFileRequest) {
        const content = await fs.readFile(params.path, "utf8");
        return { content };
      },
      async writeTextFile(params: WriteTextFileRequest) {
        await fs.mkdir(path.dirname(params.path), { recursive: true });
        await fs.writeFile(params.path, params.content, "utf8");
        return {};
      },
      async createTerminal() {
        throw new Error("ACP model probe does not support terminal execution");
      },
    };
  }

  protected async closeProbe(probe: SpawnedACPProcess): Promise<void> {
    try {
      if (probe.initialize.agentCapabilities?.sessionCapabilities?.close) {
        // No active session to close here; ignore capability.
      }
    } finally {
      await terminateACPChildProcess(probe.child, 2_000);
    }
  }

  protected async resolveLaunchCommand(): Promise<{ command: string; args: string[] }> {
    return resolveACPLaunchCommand({
      provider: this.provider,
      runtimeSettings: this.runtimeSettings,
      defaultCommand: this.defaultCommand,
    });
  }

  private assertProvider(config: AgentSessionConfig): void {
    if (config.provider !== this.provider) {
      throw new Error(`Expected ${this.provider} config, received ${config.provider}`);
    }
  }

  protected transformSessionResponse(response: SessionStateResponse): SessionStateResponse {
    const transformed = this.sessionResponseTransformer
      ? this.sessionResponseTransformer(response)
      : response;
    if (!this.configOptionsTransformer || !transformed.configOptions) {
      return transformed;
    }
    return {
      ...transformed,
      configOptions: this.configOptionsTransformer(transformed.configOptions),
    };
  }
}

export class ACPAgentSession implements AgentSession, ACPClient {
  readonly provider: string;
  readonly capabilities: AgentCapabilityFlags;

  private readonly logger: Logger;
  private readonly runtimeSettings?: ProviderRuntimeSettings;
  private readonly defaultCommand: [string, ...string[]];
  private readonly defaultModes: AgentMode[];
  protected readonly modelTransformer?: (models: AgentModelDefinition[]) => AgentModelDefinition[];
  private readonly sessionResponseTransformer?: (
    response: SessionStateResponse,
  ) => SessionStateResponse;
  private readonly configOptionsTransformer?: (
    configOptions: SessionConfigOption[],
  ) => SessionConfigOption[];
  private readonly modeIdTransformer?: (modeId: string) => string | null;
  private readonly toolSnapshotTransformer?: (snapshot: ACPToolSnapshot) => ACPToolSnapshot;
  private readonly providerModeWriter?: (
    context: ACPProviderModeWriterContext,
  ) => Promise<ACPProviderModeWriteResult>;
  private readonly beforeModeWriter?: (
    context: ACPProviderModeWriterContext,
  ) => Promise<ACPBeforeModeWriteResult>;
  private readonly thinkingOptionWriter?: (
    connection: ClientSideConnection,
    sessionId: string,
    thinkingOptionId: string,
  ) => Promise<void>;
  private readonly agentId?: string;
  private readonly launchEnv?: Record<string, string>;
  private readonly subscribers = new Set<(event: AgentStreamEvent) => void>();
  private readonly pendingPermissions = new Map<string, PendingPermission>();
  private readonly messageAssemblies = new Map<string, MessageAssemblyState>();
  private readonly toolCalls = new Map<string, ACPToolSnapshot>();
  private readonly terminalEntries = new Map<string, TerminalEntry>();
  private readonly persistedHistory: AgentTimelineItem[] = [];
  private readonly initialHandle?: AgentPersistenceHandle;

  private readonly config: AgentSessionConfig;
  private child: ChildProcessWithoutNullStreams | null = null;
  private connection: ClientSideConnection | null = null;
  private agentCapabilities: ACPAgentCapabilities | null = null;
  private sessionId: string | null = null;
  private currentMode: string | null = null;
  private availableModes: AgentMode[];
  private currentModel: string | null = null;
  private availableModels: AvailableACPModel[] | null = null;
  private thinkingOptionId: string | null = null;
  private currentTitle: string | null = null;
  private lastActivityAt: string | null = null;
  private configOptions: SessionConfigOption[] = [];
  private cachedCommands: AgentSlashCommand[] = [];
  private commandsReadyDeferred: { promise: Promise<void>; resolve: () => void } | null = null;
  private commandsReadySettled = false;
  private waitForInitialCommands: boolean;
  private initialCommandsWaitTimeoutMs: number;
  private currentTurnUsage: AgentUsage | undefined;
  private activeForegroundTurnId: string | null = null;
  private closed = false;
  private historyPending = false;
  private replayingHistory = false;
  private suppressUserEchoMessageId: string | null = null;
  private suppressUserEchoText: string | null = null;
  private bootstrapThreadEventPending = false;

  constructor(config: AgentSessionConfig, options: ACPAgentSessionOptions) {
    this.provider = options.provider;
    this.capabilities = options.capabilities;
    this.logger = options.logger.child({ module: "agent", provider: options.provider });
    this.runtimeSettings = options.runtimeSettings;
    this.defaultCommand = options.defaultCommand;
    this.defaultModes = options.defaultModes;
    this.modelTransformer = options.modelTransformer;
    this.sessionResponseTransformer = options.sessionResponseTransformer;
    this.configOptionsTransformer = options.configOptionsTransformer;
    this.modeIdTransformer = options.modeIdTransformer;
    this.toolSnapshotTransformer = options.toolSnapshotTransformer;
    this.providerModeWriter = options.providerModeWriter;
    this.beforeModeWriter = options.beforeModeWriter;
    this.thinkingOptionWriter = options.thinkingOptionWriter;
    this.availableModes = options.defaultModes;
    this.agentId = options.agentId;
    this.launchEnv = options.launchEnv;
    this.initialHandle = options.handle;
    this.config = { ...config, provider: options.provider };
    this.currentMode = config.modeId ?? null;
    this.currentModel = config.model ?? null;
    this.thinkingOptionId = config.thinkingOptionId ?? null;
    this.currentTitle = config.title ?? null;
    this.waitForInitialCommands = options.waitForInitialCommands ?? false;
    this.initialCommandsWaitTimeoutMs = options.initialCommandsWaitTimeoutMs ?? 1500;
  }

  get id(): string | null {
    return this.sessionId;
  }

  async initializeNewSession(): Promise<void> {
    const spawned = await this.spawnProcess();
    this.child = spawned.child;
    this.connection = spawned.connection;
    this.agentCapabilities = spawned.initialize.agentCapabilities ?? null;

    const response = await this.connection.newSession({
      cwd: this.config.cwd,
      mcpServers: normalizeMcpServers(this.config.mcpServers),
    });
    this.sessionId = response.sessionId;
    this.bootstrapThreadEventPending = true;
    this.applySessionState(response);
    await this.applyConfiguredOverrides();
  }

  async initializeResumedSession(): Promise<void> {
    const handle = this.initialHandle;
    if (!handle) {
      throw new Error("Resume requested without persistence handle");
    }

    const spawned = await this.spawnProcess();
    this.child = spawned.child;
    this.connection = spawned.connection;
    this.agentCapabilities = spawned.initialize.agentCapabilities ?? null;
    this.sessionId = handle.sessionId;
    this.bootstrapThreadEventPending = true;

    const sessionCapabilities = this.agentCapabilities?.sessionCapabilities;
    if (this.agentCapabilities?.loadSession) {
      this.replayingHistory = true;
      const response = await this.connection.loadSession({
        sessionId: handle.sessionId,
        cwd: this.config.cwd,
        mcpServers: normalizeMcpServers(this.config.mcpServers),
      });
      this.replayingHistory = false;
      this.historyPending = this.persistedHistory.length > 0;
      this.applySessionState(response);
    } else if (sessionCapabilities?.resume) {
      const response = await this.connection.unstable_resumeSession({
        sessionId: handle.sessionId,
        cwd: this.config.cwd,
        mcpServers: normalizeMcpServers(this.config.mcpServers),
      });
      this.applySessionState(response);
    } else {
      throw new Error(`${this.provider} does not support ACP session resume`);
    }

    await this.applyConfiguredOverrides();
  }

  async run(prompt: AgentPromptInput, options?: AgentRunOptions): Promise<AgentRunResult> {
    const result = await runProviderTurn({
      prompt,
      runOptions: options,
      startTurn: (p, o) => this.startTurn(p, o),
      subscribe: (callback) => this.subscribe(callback),
      getSessionId: () => this.sessionId ?? "",
      reduceFinalText: appendOrReplaceGrowingAssistantMessage,
    });

    if (!this.sessionId) {
      throw new Error("ACP session did not expose a session id");
    }

    return result;
  }

  async startTurn(
    prompt: AgentPromptInput,
    _options?: AgentRunOptions,
  ): Promise<{ turnId: string }> {
    if (this.closed) {
      throw new Error(`${this.provider} session is closed`);
    }
    if (!this.connection || !this.sessionId) {
      throw new Error(`${this.provider} session is not initialized`);
    }
    if (this.activeForegroundTurnId) {
      throw new Error("A foreground turn is already active");
    }

    const turnId = randomUUID();
    const messageId = randomUUID();
    this.activeForegroundTurnId = turnId;
    this.suppressUserEchoMessageId = messageId;
    this.suppressUserEchoText = extractPromptText(prompt);
    this.emitBootstrapThreadEvent();
    this.pushEvent({ type: "turn_started", provider: this.provider, turnId });

    void this.connection
      .prompt({
        sessionId: this.sessionId,
        messageId,
        prompt: toACPContentBlocks(prompt),
      })
      .then((response) => {
        this.handlePromptResponse(response, turnId);
        return;
      })
      .catch((error) => {
        const summary = summarizeACPRequestError(error);
        this.finishTurn({
          type: "turn_failed",
          provider: this.provider,
          error: summary.message,
          code: summary.code,
          diagnostic: this.collectDiagnostic(summary.diagnostic ?? summary.message),
          turnId,
        });
      });

    return { turnId };
  }

  subscribe(callback: (event: AgentStreamEvent) => void): () => void {
    this.subscribers.add(callback);
    if (this.sessionId) {
      callback({
        type: "thread_started",
        provider: this.provider,
        sessionId: this.sessionId,
      });
    }
    return () => {
      this.subscribers.delete(callback);
    };
  }

  async *streamHistory(): AsyncGenerator<AgentStreamEvent> {
    if (!this.historyPending || this.persistedHistory.length === 0) {
      return;
    }
    const history = [...this.persistedHistory];
    this.persistedHistory.length = 0;
    this.historyPending = false;
    for (const item of history) {
      yield { type: "timeline", provider: this.provider, item };
    }
  }

  async getRuntimeInfo(): Promise<AgentRuntimeInfo> {
    return this.runtimeInfo();
  }

  async getAvailableModes(): Promise<AgentMode[]> {
    return [...this.availableModes];
  }

  async getCurrentMode(): Promise<string | null> {
    return this.currentMode;
  }

  private ensureCommandsReadyDeferred(): void {
    if (this.commandsReadyDeferred || this.commandsReadySettled || this.cachedCommands.length > 0) {
      return;
    }

    let resolve!: () => void;
    const promise = new Promise<void>((r) => {
      resolve = r;
    });
    this.commandsReadyDeferred = { promise, resolve };
  }

  private settleCommandsReady(): void {
    if (this.commandsReadySettled) {
      return;
    }
    this.commandsReadySettled = true;
    this.commandsReadyDeferred?.resolve();
    this.commandsReadyDeferred = null;
  }

  private async waitForCommandsReady(): Promise<void> {
    const deferred = this.commandsReadyDeferred;
    if (!deferred) {
      return;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      await Promise.race([
        deferred.promise,
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, this.initialCommandsWaitTimeoutMs);
        }),
      ]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  async listCommands(): Promise<AgentSlashCommand[]> {
    if (this.cachedCommands.length > 0) {
      return this.cachedCommands;
    }
    if (!this.waitForInitialCommands || this.closed) {
      return this.cachedCommands;
    }

    this.ensureCommandsReadyDeferred();
    await this.waitForCommandsReady();
    this.settleCommandsReady();
    return this.cachedCommands;
  }

  async setMode(modeId: string): Promise<void> {
    if (!this.connection || !this.sessionId) {
      throw new Error("ACP session not initialized");
    }

    const selection = resolveACPModeSelection({
      modeId,
      availableModes: this.availableModes,
      configOptions: this.configOptions,
    });
    await this.setModeWithSelection({ modeId, selection });
  }

  // Mode/model selection updates stay after ACP RPC success; this intentionally diverges from Zed's optimistic rollback path (acp.rs:3080-3104).
  private async setModeWithSelection({
    modeId,
    selection,
  }: {
    modeId: string;
    selection: ACPModeSelection;
  }): Promise<void> {
    if (!this.connection || !this.sessionId) {
      throw new Error("ACP session not initialized");
    }

    const context = this.createProviderModeWriterContext(modeId, selection);
    const providerResult = this.providerModeWriter
      ? await this.providerModeWriter(context)
      : { handled: false };
    if (providerResult.handled) {
      this.currentMode = providerResult.currentModeId ?? modeId;
      if (providerResult.configOptions) {
        this.configOptions = this.transformConfigOptions(providerResult.configOptions);
      }
      this.availableModes = deriveModesFromACP(this.defaultModes, null, this.configOptions).modes;
      this.pushEvent({
        type: "mode_changed",
        provider: this.provider,
        currentModeId: this.currentMode,
        availableModes: [...this.availableModes],
      });
      return;
    }

    if (selection.hasAvailableModes) {
      if (!selection.availableMode) {
        this.warnInvalidSelection(
          modeId,
          `is not valid ${this.provider} mode. Available options: ${this.availableModes
            .map((mode) => mode.id)
            .join(", ")}`,
        );
        return;
      }
    } else {
      const modeOption = selection.configOption;
      if (!modeOption) {
        throw new Error(`${this.provider} does not expose ACP mode switching`);
      }
      if (!selection.configChoice) {
        this.warnInvalidSelection(
          modeId,
          `is not valid ${this.provider} mode config option. Available options: ${flattenSelectOptions(
            modeOption.options,
          )
            .map((option) => option.value)
            .join(", ")}`,
        );
        return;
      }
    }

    if (this.beforeModeWriter) {
      const beforeResult = await this.beforeModeWriter(context);
      if (beforeResult?.configOptions) {
        this.configOptions = this.transformConfigOptions(beforeResult.configOptions);
      }
    }

    if (selection.hasAvailableModes) {
      await this.connection.setSessionMode({ sessionId: this.sessionId, modeId });
      this.currentMode = modeId;
      this.pushEvent({
        type: "mode_changed",
        provider: this.provider,
        currentModeId: this.currentMode,
        availableModes: [...this.availableModes],
      });
      return;
    }

    const modeOption = selection.configOption;
    if (!modeOption) {
      throw new Error(`${this.provider} does not expose ACP mode switching`);
    }

    const response = await this.connection.setSessionConfigOption({
      sessionId: this.sessionId,
      configId: modeOption.id,
      value: modeId,
    });
    this.currentMode = this.applyConfigOptionResponse({
      response,
      configId: modeOption.id,
      category: "mode",
      requestedValue: modeId,
      label: "mode",
    });
    this.availableModes = deriveModesFromACP(this.defaultModes, null, this.configOptions).modes;
    this.pushEvent({
      type: "mode_changed",
      provider: this.provider,
      currentModeId: this.currentMode,
      availableModes: [...this.availableModes],
    });
  }

  private createProviderModeWriterContext(
    requestedModeId: string,
    selection: ACPModeSelection,
  ): ACPProviderModeWriterContext {
    if (!this.connection || !this.sessionId) {
      throw new Error("ACP session not initialized");
    }
    return {
      connection: this.connection,
      sessionId: this.sessionId,
      requestedModeId,
      currentModeId: this.currentMode,
      selection,
      configOptions: this.configOptions,
      logger: this.logger,
    };
  }

  async setModel(modelId: string | null): Promise<void> {
    if (!this.connection || !this.sessionId) {
      throw new Error("ACP session not initialized");
    }
    if (!modelId) {
      this.currentModel = null;
      return;
    }

    const selection = resolveACPModelSelection({
      modelId,
      availableModels: this.availableModels,
      configOptions: this.configOptions,
    });
    await this.setModelWithSelection({ modelId, selection });
  }

  private async setModelWithSelection({
    modelId,
    selection,
  }: {
    modelId: string;
    selection: ACPModelSelection;
  }): Promise<void> {
    if (!this.connection || !this.sessionId) {
      throw new Error("ACP session not initialized");
    }

    if (selection.hasAvailableModels) {
      if (!selection.availableModel) {
        this.warnInvalidSelection(
          modelId,
          `is not a valid ${this.provider} model. Available options: ${this.availableModels
            ?.map((model) => model.modelId)
            .join(", ")}`,
        );
        return;
      }

      if (typeof this.connection.unstable_setSessionModel !== "function") {
        throw new Error(this.modelSelectionUnavailableMessage());
      }

      try {
        await this.connection.unstable_setSessionModel({
          sessionId: this.sessionId,
          modelId,
        });
        this.currentModel = modelId;
        this.pushEvent({
          type: "model_changed",
          provider: this.provider,
          runtimeInfo: this.runtimeInfo(),
        });
        return;
      } catch {
        // Fall through to config option path.
      }
    }

    const modelOption = selection.configOption;
    if (!modelOption) {
      throw new Error(this.modelSelectionUnavailableMessage());
    }
    if (!selection.configChoice) {
      this.warnInvalidSelection(
        modelId,
        `is not a valid ${this.provider} model config option. Available options: ${flattenSelectOptions(
          modelOption.options,
        )
          .map((option) => option.value)
          .join(", ")}`,
      );
      return;
    }

    const response = await this.connection.setSessionConfigOption({
      sessionId: this.sessionId,
      configId: modelOption.id,
      value: modelId,
    });
    this.currentModel = this.applyConfigOptionResponse({
      response,
      configId: modelOption.id,
      category: "model",
      requestedValue: modelId,
      label: "model",
    });
    this.pushEvent({
      type: "model_changed",
      provider: this.provider,
      runtimeInfo: this.runtimeInfo(),
    });
  }

  async setThinkingOption(thinkingOptionId: string | null): Promise<void> {
    if (!this.connection || !this.sessionId) {
      throw new Error("ACP session not initialized");
    }
    if (!thinkingOptionId) {
      this.thinkingOptionId = null;
      return;
    }

    if (this.thinkingOptionWriter) {
      await this.thinkingOptionWriter(this.connection, this.sessionId, thinkingOptionId);
      this.thinkingOptionId = thinkingOptionId;
      this.pushEvent({
        type: "thinking_option_changed",
        provider: this.provider,
        thinkingOptionId: this.thinkingOptionId,
      });
      return;
    }

    const option = findSelectConfigOption({
      configOptions: this.configOptions,
      category: "thought_level",
    });
    if (!option) {
      throw new Error(`${this.provider} does not expose ACP thought-level selection`);
    }
    const response = await this.connection.setSessionConfigOption({
      sessionId: this.sessionId,
      configId: option.id,
      value: thinkingOptionId,
    });
    this.thinkingOptionId = this.applyConfigOptionResponse({
      response,
      configId: option.id,
      category: "thought_level",
      requestedValue: thinkingOptionId,
      label: "thought-level",
    });
    this.pushEvent({
      type: "thinking_option_changed",
      provider: this.provider,
      thinkingOptionId: this.thinkingOptionId,
    });
  }

  private applyConfigOptionResponse({
    response,
    configId,
    category,
    requestedValue,
    label,
  }: {
    response: { configOptions: SessionConfigOption[] };
    configId: string;
    category: string;
    requestedValue: string;
    label: string;
  }): string {
    this.configOptions = this.transformConfigOptions(response.configOptions);
    const responseOption = findSelectConfigOption({
      configOptions: this.configOptions,
      category,
      id: configId,
    });
    if (responseOption?.currentValue != null) {
      return responseOption.currentValue;
    }
    this.logger.warn(
      { configId, value: requestedValue },
      `ACP setSessionConfigOption response did not include the requested ${label} option currentValue; using requested value`,
    );
    return requestedValue;
  }

  getPendingPermissions(): AgentPermissionRequest[] {
    return Array.from(this.pendingPermissions.values(), (entry) => entry.request);
  }

  async respondToPermission(requestId: string, response: AgentPermissionResponse): Promise<void> {
    const pending = this.pendingPermissions.get(requestId);
    if (!pending) {
      throw new Error(`No pending permission request with id '${requestId}'`);
    }

    this.pendingPermissions.delete(requestId);
    const selectedOption = selectACPPermissionOption(pending.options, response);
    pending.resolve(
      selectedOption
        ? {
            outcome: {
              outcome: "selected",
              optionId: selectedOption.optionId,
            },
          }
        : { outcome: { outcome: "cancelled" } },
    );

    this.pushEvent({
      type: "permission_resolved",
      provider: this.provider,
      requestId,
      resolution: response,
      turnId: pending.turnId ?? undefined,
    });

    if (response.behavior === "deny" && response.interrupt && this.connection && this.sessionId) {
      await this.connection.cancel({ sessionId: this.sessionId });
    }
  }

  describePersistence(): AgentPersistenceHandle | null {
    if (!this.sessionId) {
      return null;
    }
    return {
      provider: this.provider,
      sessionId: this.sessionId,
      nativeHandle: this.sessionId,
      metadata: {
        ...this.config,
        title: this.currentTitle,
      },
    };
  }

  async interrupt(): Promise<void> {
    if (!this.connection || !this.sessionId) {
      return;
    }

    for (const pending of this.pendingPermissions.values()) {
      pending.resolve({ outcome: { outcome: "cancelled" } });
    }
    this.pendingPermissions.clear();

    if (this.activeForegroundTurnId) {
      await this.connection.cancel({ sessionId: this.sessionId });
    }
  }

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;

    this.settleCommandsReady();

    for (const pending of this.pendingPermissions.values()) {
      pending.resolve({ outcome: { outcome: "cancelled" } });
    }
    this.pendingPermissions.clear();

    if (this.connection && this.sessionId) {
      try {
        if (this.activeForegroundTurnId) {
          await this.connection.cancel({ sessionId: this.sessionId });
        }
      } catch (error) {
        this.logger.debug(
          { err: error, sessionId: this.sessionId },
          "Failed to cancel ACP session during close",
        );
      }

      try {
        if (this.agentCapabilities?.sessionCapabilities?.close) {
          await this.connection.unstable_closeSession({ sessionId: this.sessionId });
        }
      } catch (error) {
        this.logger.debug({ err: error }, "ACP closeSession failed during shutdown");
      }
    }

    for (const terminal of this.terminalEntries.values()) {
      terminal.child.kill("SIGTERM");
    }
    this.terminalEntries.clear();

    if (this.child) {
      await terminateACPChildProcess(this.child, 2_000);
    }

    this.subscribers.clear();
    this.connection = null;
    this.child = null;
    this.activeForegroundTurnId = null;
  }

  async requestPermission(params: RequestPermissionRequest): Promise<RequestPermissionResponse> {
    // Match Zed acp.rs:3189-3220: generic ACP permission requests stay pure pass-through.
    const requestId = randomUUID();
    let toolSnapshot =
      this.toolCalls.get(params.toolCall.toolCallId) ??
      mergeACPToolSnapshot(params.toolCall.toolCallId, params.toolCall);
    if (this.toolSnapshotTransformer) {
      toolSnapshot = this.toolSnapshotTransformer(toolSnapshot);
    }
    const request = mapACPPermissionRequest(this.provider, requestId, params, toolSnapshot);

    const promise = new Promise<RequestPermissionResponse>((resolve, reject) => {
      this.pendingPermissions.set(requestId, {
        request,
        options: params.options,
        resolve,
        reject,
        turnId: this.activeForegroundTurnId,
      });
    });

    this.pushEvent({
      type: "permission_requested",
      provider: this.provider,
      request,
      turnId: this.activeForegroundTurnId ?? undefined,
    });
    return promise;
  }

  async sessionUpdate(params: SessionNotification): Promise<void> {
    this.logger.trace(
      {
        agentId: this.agentId,
        provider: this.provider,
        sessionId: params.sessionId,
        rawEvent: params,
      },
      "provider.acp.raw_event",
    );
    if (params.sessionId !== this.sessionId) {
      return;
    }

    const events = this.translateSessionUpdate(params.update);
    this.logger.trace(
      {
        agentId: this.agentId,
        provider: this.provider,
        sessionId: this.sessionId,
        turnId: this.activeForegroundTurnId ?? undefined,
        rawEvent: params,
        events,
      },
      "provider.acp.parsed_event",
    );
    if (this.replayingHistory) {
      for (const event of events) {
        if (event.type === "timeline") {
          this.persistedHistory.push(event.item);
        }
      }
      return;
    }

    for (const event of events) {
      this.pushEvent(event);
    }
  }

  async extNotification(method: string, params: Record<string, unknown>): Promise<void> {
    this.logger.trace(
      {
        agentId: this.agentId,
        provider: this.provider,
        sessionId: typeof params.sessionId === "string" ? params.sessionId : undefined,
        method,
        rawEvent: params,
      },
      "provider.acp.extension_notification",
    );
  }

  async readTextFile(params: ReadTextFileRequest): Promise<{ content: string }> {
    const resolvedPath = resolvePathInsideBase(params.path, this.config.cwd);
    const raw = await fs.readFile(resolvedPath, "utf8");
    if (!params.line && !params.limit) {
      return { content: raw };
    }
    const lines = raw.split(/\r?\n/);
    const start = Math.max((params.line ?? 1) - 1, 0);
    const end = params.limit ? start + params.limit : undefined;
    return { content: lines.slice(start, end).join("\n") };
  }

  async writeTextFile(params: WriteTextFileRequest): Promise<Record<string, never>> {
    const resolvedPath = resolvePathInsideBase(params.path, this.config.cwd);
    await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
    await fs.writeFile(resolvedPath, params.content, "utf8");
    return {};
  }

  async createTerminal(params: CreateTerminalRequest): Promise<{ terminalId: string }> {
    const terminalId = randomUUID();
    const env = Object.fromEntries(
      (params.env ?? []).map((entry: EnvVariable) => [entry.name, entry.value]),
    );
    const cwd = params.cwd ? resolvePathInsideBase(params.cwd, this.config.cwd) : this.config.cwd;
    const terminalCommand = resolveTerminalCommand(params.command, params.args);
    const child = spawnProcess(terminalCommand.command, terminalCommand.args, {
      cwd,
      ...createProviderEnvSpec({
        runtimeSettings: this.runtimeSettings,
        overlays: [env],
      }),
      stdio: ["ignore", "pipe", "pipe"],
    });

    let resolveExit!: (exit: TerminalExit) => void;
    let rejectExit!: (error: Error) => void;
    const waitForExit = new Promise<TerminalExit>((resolve, reject) => {
      resolveExit = resolve;
      rejectExit = reject;
    });
    waitForExit.catch(() => undefined);

    const entry: TerminalEntry = {
      id: terminalId,
      child,
      output: "",
      truncated: false,
      outputByteLimit: params.outputByteLimit ?? null,
      exit: null,
      waitForExit,
      resolveExit,
      rejectExit,
    };

    child.stdout!.on("data", (chunk: Buffer | string) =>
      appendTerminalOutput(entry, chunk.toString()),
    );
    child.stderr!.on("data", (chunk: Buffer | string) =>
      appendTerminalOutput(entry, chunk.toString()),
    );
    child.once("error", (error) => {
      const spawnError = error instanceof Error ? error : new Error(String(error));
      appendTerminalOutput(entry, `${spawnError.message}\n`);
      rejectExit(spawnError);
    });
    child.once("exit", (code, signal) => {
      const exit = { exitCode: code, signal };
      entry.exit = exit;
      resolveExit(exit);
    });

    this.terminalEntries.set(terminalId, entry);
    return { terminalId };
  }

  async terminalOutput(params: TerminalOutputRequest): Promise<TerminalOutputResponse> {
    const entry = this.getTerminalEntry(params.terminalId);
    return {
      output: entry.output,
      truncated: entry.truncated,
      exitStatus: entry.exit ?? undefined,
    };
  }

  async waitForTerminalExit(params: WaitForTerminalExitRequest): Promise<TerminalExit> {
    const entry = this.getTerminalEntry(params.terminalId);
    return entry.waitForExit;
  }

  async releaseTerminal(params: { sessionId: string; terminalId: string }): Promise<void> {
    const entry = this.getTerminalEntry(params.terminalId);
    if (!entry.exit) {
      entry.child.kill("SIGTERM");
    }
    this.terminalEntries.delete(params.terminalId);
  }

  async killTerminal(params: KillTerminalRequest): Promise<Record<string, never>> {
    const entry = this.getTerminalEntry(params.terminalId);
    if (!entry.exit) {
      entry.child.kill("SIGTERM");
    }
    return {};
  }

  private async spawnProcess(): Promise<SpawnedACPProcess> {
    const launch = await resolveACPLaunchCommand({
      provider: this.provider,
      runtimeSettings: this.runtimeSettings,
      defaultCommand: this.defaultCommand,
    });
    return spawnInitializedACPProcess({
      launch,
      cwd: this.config.cwd,
      runtimeSettings: this.runtimeSettings,
      launchEnv: this.launchEnv,
      logger: this.logger,
      provider: this.provider,
      clientFactory: () => this,
      onExit: ({ exitCode, signal, diagnostic }) => {
        if (this.closed || !this.activeForegroundTurnId) {
          return;
        }
        this.synthesizeCanceledToolCalls();
        this.finishTurn({
          type: "turn_failed",
          provider: this.provider,
          error: `ACP agent exited unexpectedly (${exitCode ?? "null"}${signal ? `, ${signal}` : ""})`,
          diagnostic,
          turnId: this.activeForegroundTurnId,
        });
      },
    });
  }

  private applySessionState(response: SessionStateResponse): void {
    const transformed = this.sessionResponseTransformer
      ? this.sessionResponseTransformer(response)
      : response;

    this.configOptions = this.transformConfigOptions(transformed.configOptions ?? []);

    const modeInfo = deriveModesFromACP(this.defaultModes, transformed.modes, this.configOptions);
    this.availableModes = modeInfo.modes;
    this.currentMode = modeInfo.currentModeId ?? this.currentMode;

    this.availableModels = transformed.models?.availableModels ?? null;
    this.currentModel =
      transformed.models?.currentModelId ?? deriveCurrentConfigValue(this.configOptions, "model");
    this.thinkingOptionId =
      deriveCurrentConfigValue(this.configOptions, "thought_level") ?? this.thinkingOptionId;
  }

  private transformConfigOptions(configOptions: SessionConfigOption[]): SessionConfigOption[] {
    return this.configOptionsTransformer
      ? this.configOptionsTransformer(configOptions)
      : configOptions;
  }

  private transformModeId(modeId: string): string | null {
    return this.modeIdTransformer ? this.modeIdTransformer(modeId) : modeId;
  }

  private async applyConfiguredOverrides(): Promise<void> {
    const configuredModeId = this.config.modeId;
    if (configuredModeId && configuredModeId !== this.currentMode) {
      const selection = resolveACPModeSelection({
        modeId: configuredModeId,
        availableModes: this.availableModes,
        configOptions: this.configOptions,
      });
      await this.setModeWithSelection({ modeId: configuredModeId, selection });
    }
    const configuredModelId = this.config.model;
    if (configuredModelId && configuredModelId !== this.currentModel) {
      const selection = resolveACPModelSelection({
        modelId: configuredModelId,
        availableModels: this.availableModels,
        configOptions: this.configOptions,
      });
      try {
        await this.setModelWithSelection({ modelId: configuredModelId, selection });
      } catch (error) {
        if (!this.isModelSelectionUnavailableError(error)) {
          throw error;
        }
        this.logger.warn(
          { value: configuredModelId },
          `${this.provider} does not expose ACP model selection; using provider default model`,
        );
      }
    }
    if (this.config.thinkingOptionId && this.config.thinkingOptionId !== this.thinkingOptionId) {
      await this.setThinkingOption(this.config.thinkingOptionId);
    }
  }

  private warnInvalidSelection(value: string, message: string): void {
    this.logger.warn({ value }, message);
  }

  private modelSelectionUnavailableMessage(): string {
    return `${this.provider} does not expose ACP model selection`;
  }

  private isModelSelectionUnavailableError(error: unknown): boolean {
    return error instanceof Error && error.message === this.modelSelectionUnavailableMessage();
  }

  private translateSessionUpdate(update: SessionUpdate): AgentStreamEvent[] {
    switch (update.sessionUpdate) {
      case "user_message_chunk": {
        const item = this.createMessageTimelineItem("user_message", update);
        if (!item) {
          return [];
        }
        const shouldSuppress =
          this.suppressUserEchoMessageId &&
          update.messageId === this.suppressUserEchoMessageId &&
          this.suppressUserEchoText &&
          item.text === this.suppressUserEchoText;
        if (shouldSuppress) {
          return [];
        }
        return [this.wrapTimeline(item)];
      }
      case "agent_message_chunk": {
        const item = this.createMessageTimelineItem("assistant_message", update);
        return item ? [this.wrapTimeline(item)] : [];
      }
      case "agent_thought_chunk": {
        const item = this.createMessageTimelineItem("reasoning", update);
        return item ? [this.wrapTimeline(item)] : [];
      }
      case "tool_call":
        return this.handleToolCallUpdate(update.toolCallId, update, undefined);
      case "tool_call_update":
        return this.handleToolCallUpdate(
          update.toolCallId,
          update,
          this.toolCalls.get(update.toolCallId),
        );
      case "plan":
        return [this.wrapTimeline(mapACPPlanToTimeline(update))];
      case "current_mode_update":
        this.handleCurrentModeUpdate(update);
        return [
          {
            type: "mode_changed",
            provider: this.provider,
            currentModeId: this.currentMode,
            availableModes: [...this.availableModes],
          },
        ];
      case "config_option_update":
        return this.handleConfigOptionUpdate(update);
      case "session_info_update":
        this.handleSessionInfoUpdate(update);
        return [];
      case "usage_update":
        this.handleUsageUpdate(update);
        return [];
      case "available_commands_update":
        this.cachedCommands = update.availableCommands.map((command) => ({
          name: command.name,
          description: command.description,
          argumentHint: "",
        }));
        this.settleCommandsReady();
        return [];
      default:
        return [];
    }
  }

  private handleToolCallUpdate(
    toolCallId: string,
    update: ToolCall | ToolCallUpdate,
    previous: ACPToolSnapshot | undefined,
  ): AgentStreamEvent[] {
    let snapshot = mergeACPToolSnapshot(toolCallId, update, previous);
    if (this.toolSnapshotTransformer) {
      snapshot = this.toolSnapshotTransformer(snapshot);
    }
    this.toolCalls.set(toolCallId, snapshot);
    return [this.wrapTimeline(mapACPToolSnapshotToTimeline(snapshot, this.terminalEntries))];
  }

  private createMessageTimelineItem(
    type: "user_message" | "assistant_message" | "reasoning",
    update: Extract<
      SessionUpdate,
      { sessionUpdate: "user_message_chunk" | "agent_message_chunk" | "agent_thought_chunk" }
    >,
  ):
    | { type: "user_message"; text: string; messageId?: string }
    | { type: "assistant_message"; text: string }
    | { type: "reasoning"; text: string }
    | null {
    const chunkText = contentBlockToText(update.content);
    if (!chunkText) {
      return null;
    }
    const key = `${type}:${update.messageId ?? "default"}`;
    const state = this.messageAssemblies.get(key) ?? { text: "" };
    state.text += chunkText;
    this.messageAssemblies.set(key, state);

    if (type === "user_message") {
      return { type: "user_message", text: state.text, messageId: update.messageId ?? undefined };
    }
    if (type === "assistant_message") {
      return { type: "assistant_message", text: chunkText };
    }
    return { type: "reasoning", text: chunkText };
  }

  private handleCurrentModeUpdate(update: CurrentModeUpdate): void {
    this.currentMode = this.transformModeId(update.currentModeId);
  }

  private handleConfigOptionUpdate(update: ConfigOptionUpdate): AgentStreamEvent[] {
    this.configOptions = this.transformConfigOptions(update.configOptions);
    const modeInfo = deriveModesFromACP(this.defaultModes, null, this.configOptions);
    const nextMode = modeInfo.currentModeId;
    const nextModel = deriveCurrentConfigValue(this.configOptions, "model");
    const nextThinkingOptionId = deriveCurrentConfigValue(this.configOptions, "thought_level");

    this.availableModes = modeInfo.modes;
    this.currentMode = nextMode ?? this.currentMode;
    this.currentModel = nextModel ?? this.currentModel;
    this.thinkingOptionId = nextThinkingOptionId ?? this.thinkingOptionId;

    const events: AgentStreamEvent[] = [];
    if (nextMode !== null) {
      events.push({
        type: "mode_changed",
        provider: this.provider,
        currentModeId: this.currentMode,
        availableModes: [...this.availableModes],
      });
    }
    if (nextModel !== null) {
      events.push({
        type: "model_changed",
        provider: this.provider,
        runtimeInfo: this.runtimeInfo(),
      });
    }
    if (nextThinkingOptionId !== null) {
      events.push({
        type: "thinking_option_changed",
        provider: this.provider,
        thinkingOptionId: this.thinkingOptionId,
      });
    }
    return events;
  }

  private handleSessionInfoUpdate(update: SessionInfoUpdate): void {
    if ("title" in update) {
      this.currentTitle = update.title ?? null;
    }
    if ("updatedAt" in update) {
      this.lastActivityAt = update.updatedAt ?? null;
    }
  }

  private handleUsageUpdate(update: UsageUpdate): void {
    void update;
  }

  private handlePromptResponse(response: PromptResponse, turnId: string): void {
    this.currentTurnUsage = mapACPUsage(response.usage) ?? this.currentTurnUsage;

    switch (response.stopReason) {
      case "cancelled":
        this.synthesizeCanceledToolCalls();
        this.finishTurn({
          type: "turn_canceled",
          provider: this.provider,
          reason: "Interrupted",
          turnId,
        });
        break;
      case "end_turn":
      case "max_tokens":
      case "max_turn_requests":
      case "refusal":
      default:
        this.finishTurn({
          type: "turn_completed",
          provider: this.provider,
          usage: this.currentTurnUsage,
          turnId,
        });
        break;
    }
  }

  private wrapTimeline(item: AgentTimelineItem): AgentStreamEvent {
    return {
      type: "timeline",
      provider: this.provider,
      item,
      turnId: this.activeForegroundTurnId ?? undefined,
    };
  }

  private pushEvent(event: AgentStreamEvent): void {
    this.logger.trace(
      {
        agentId: this.agentId,
        provider: this.provider,
        sessionId: this.sessionId,
        turnId: getAgentStreamEventTurnId(event) ?? this.activeForegroundTurnId ?? undefined,
        event,
      },
      "provider.acp.event_emit",
    );
    for (const subscriber of this.subscribers) {
      subscriber(event);
    }
  }

  private runtimeInfo(): AgentRuntimeInfo {
    return {
      provider: this.provider,
      sessionId: this.sessionId,
      model: this.currentModel,
      thinkingOptionId: this.thinkingOptionId,
      modeId: this.currentMode,
      extra: {
        title: this.currentTitle,
        updatedAt: this.lastActivityAt,
      },
    };
  }

  private finishTurn(
    event: Extract<AgentStreamEvent, { type: "turn_completed" | "turn_failed" | "turn_canceled" }>,
  ): void {
    this.activeForegroundTurnId = null;
    this.suppressUserEchoMessageId = null;
    this.suppressUserEchoText = null;
    this.pushEvent(event);
  }

  private emitBootstrapThreadEvent(): void {
    if (!this.bootstrapThreadEventPending || !this.sessionId) {
      return;
    }
    this.bootstrapThreadEventPending = false;
    this.pushEvent({
      type: "thread_started",
      provider: this.provider,
      sessionId: this.sessionId,
    });
  }

  private synthesizeCanceledToolCalls(): void {
    for (const snapshot of this.toolCalls.values()) {
      const mapped = mapACPToolSnapshotToTimeline(snapshot, this.terminalEntries);
      if (mapped.status === "running") {
        this.pushEvent(
          this.wrapTimeline({
            ...mapped,
            status: "canceled",
            error: null,
          }),
        );
      }
    }
  }

  private collectDiagnostic(message: string): string | undefined {
    const parts: string[] = [message];
    if (this.child?.exitCode != null) {
      parts.push(`exitCode=${this.child.exitCode}`);
    }
    if (this.child?.signalCode) {
      parts.push(`signal=${this.child.signalCode}`);
    }
    return parts.length > 0 ? parts.join(" | ") : undefined;
  }

  private getTerminalEntry(terminalId: string): TerminalEntry {
    const entry = this.terminalEntries.get(terminalId);
    if (!entry) {
      throw new Error(`Unknown terminal '${terminalId}'`);
    }
    return entry;
  }
}

function normalizeMcpServers(servers?: Record<string, McpServerConfig>): McpServer[] {
  if (!servers) {
    return [];
  }

  return Object.entries(servers).map(([name, config]) => {
    if (config.type === "stdio") {
      return {
        name,
        command: config.command,
        args: config.args ?? [],
        env: Object.entries(config.env ?? {}).map(([envName, value]) => ({
          name: envName,
          value,
        })),
      } satisfies McpServer;
    }

    if (config.type === "http") {
      return {
        type: "http",
        name,
        url: config.url,
        headers: Object.entries(config.headers ?? {}).map(([headerName, value]) => ({
          name: headerName,
          value,
        })),
      } satisfies McpServer;
    }

    return {
      type: "sse",
      name,
      url: config.url,
      headers: Object.entries(config.headers ?? {}).map(([headerName, value]) => ({
        name: headerName,
        value,
      })),
    } satisfies McpServer;
  });
}

function toACPContentBlocks(prompt: AgentPromptInput): ContentBlock[] {
  if (typeof prompt === "string") {
    return [{ type: "text", text: prompt }];
  }

  const contentBlocks: ContentBlock[] = [];
  for (const block of prompt) {
    switch (block.type) {
      case "text":
        contentBlocks.push({ type: "text", text: block.text });
        break;
      case "image":
        contentBlocks.push({ type: "image", data: block.data, mimeType: block.mimeType });
        break;
      default:
        contentBlocks.push({ type: "text", text: renderPromptAttachmentAsText(block) });
        break;
    }
  }
  return contentBlocks;
}

function extractPromptText(prompt: AgentPromptInput): string {
  if (typeof prompt === "string") {
    return prompt;
  }
  return prompt
    .filter(
      (block): block is Extract<AgentPromptContentBlock, { type: "text" }> => block.type === "text",
    )
    .map((block) => block.text)
    .join("");
}

function appendTerminalOutput(entry: TerminalEntry, chunk: string): void {
  entry.output += chunk;
  const limit = entry.outputByteLimit;
  if (!limit) {
    return;
  }
  while (Buffer.byteLength(entry.output, "utf8") > limit && entry.output.length > 0) {
    entry.output = entry.output.slice(1);
    entry.truncated = true;
  }
}

function coerceSessionConfigMetadata(
  metadata: AgentMetadata | undefined,
): Partial<AgentSessionConfig> {
  if (!metadata || typeof metadata !== "object") {
    return {};
  }
  return metadata as Partial<AgentSessionConfig>;
}
