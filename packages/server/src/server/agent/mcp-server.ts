import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v3";
import { ensureValidJson } from "../json-utils.js";
import type { Logger } from "pino";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type {
  CallToolResult,
  ServerNotification,
  ServerRequest,
} from "@modelcontextprotocol/sdk/types.js";

import type { AgentMode, AgentProvider } from "./agent-sdk-types.js";
import type { AgentManager } from "./agent-manager.js";
import { AgentFeatureSchema } from "../messages.js";
import type { AgentStorage } from "./agent-storage.js";
import type { ArchiveChisaCodeWorktreeDependencies } from "../chisacode-worktree-archive-service.js";
import type { VoiceCallerContext, VoiceSpeakHandler } from "../voice-types.js";
import { expandUserPath, resolvePathFromBase } from "../path-utils.js";
import type { TerminalManager } from "../../terminal/terminal-manager.js";
import type { CreateChisaCodeWorktreeWorkflowFn } from "../worktree-session.js";
import { resolveSnapshotCwd, type ProviderSnapshotManager } from "./provider-snapshot-manager.js";
import {
  AgentModelSchema,
  AgentProviderEnum,
  ProviderModeSchema,
  ProviderSummarySchema,
  resolveProviderAndOptionalModel,
  resolveRequiredProviderModel,
} from "./mcp-shared.js";
import type { GitHubService } from "../../services/github-service.js";
import type { WorkspaceGitService } from "../workspace-git-service.js";
import type { UsageStore } from "../usage/usage-store.js";
import { registerAgentControlMcpTools } from "./agent-control-mcp-tools.js";
import { registerCreateAgentMcpTool } from "./create-agent-mcp-tool.js";
import { registerCompanionMcpTools } from "./companion-mcp-tools.js";
import { registerChatMcpTools, type ChatMcpService } from "./chat-mcp-tools.js";
import { registerLoopMcpTools, type LoopMcpService } from "./loop-mcp-tools.js";
import { registerScheduleMcpTools, type ScheduleMcpService } from "./schedule-mcp-tools.js";
import { registerUsageMcpTools } from "./usage-mcp-tools.js";
import { registerTerminalMcpTools } from "./terminal-mcp-tools.js";
import { resolveAgentIdentifier } from "../agent-session-helpers.js";
import { registerWorktreeMcpTools } from "./worktree-mcp-tools.js";

export interface AgentMcpServerOptions {
  agentManager: AgentManager;
  agentStorage: AgentStorage;
  terminalManager?: TerminalManager | null;
  getDaemonTcpPort?: () => number | null;
  scheduleService?: ScheduleMcpService | null;
  chatService?: ChatMcpService | null;
  loopService?: LoopMcpService | null;
  usageStore?: Pick<UsageStore, "list"> | null;
  providerSnapshotManager: ProviderSnapshotManager;
  github?: GitHubService;
  workspaceGitService?: Pick<
    WorkspaceGitService,
    "getSnapshot" | "listWorktrees" | "resolveRepoRoot"
  >;
  archiveWorkspaceRecord?: ArchiveChisaCodeWorktreeDependencies["archiveWorkspaceRecord"];
  emitWorkspaceUpdatesForWorkspaceIds?: ArchiveChisaCodeWorktreeDependencies["emitWorkspaceUpdatesForWorkspaceIds"];
  markWorkspaceArchiving?: ArchiveChisaCodeWorktreeDependencies["markWorkspaceArchiving"];
  clearWorkspaceArchiving?: ArchiveChisaCodeWorktreeDependencies["clearWorkspaceArchiving"];
  createChisaCodeWorktree?: CreateChisaCodeWorktreeWorkflowFn;
  /** Generates a redacted daemon report without log excerpts for the read-only diagnostics tool. */
  getDiagnostics?: () => Promise<string>;
  chisacodeHome?: string;
  /**
   * ID of the agent that is connecting to this MCP server.
   * Used for cwd/mode inheritance when agents spawn child agents.
   */
  callerAgentId?: string;
  companionParentAgentId?: string;
  companionToken?: string;
  /**
   * Optional resolver for session-bound speak handlers.
   * Used by hidden voice agents to narrate through daemon-managed TTS.
   */
  resolveSpeakHandler?: (callerAgentId: string) => VoiceSpeakHandler | null;
  resolveCallerContext?: (callerAgentId: string) => VoiceCallerContext | null;
  enableVoiceTools?: boolean;
  voiceOnly?: boolean;
  logger: Logger;
}

function addModelVisibleStructuredContent(result: CallToolResult): CallToolResult {
  if (result.structuredContent === undefined || result.content.length > 0) {
    return result;
  }

  return {
    ...result,
    content: [
      {
        type: "text",
        text: formatStructuredContentForModel(result.structuredContent),
      },
    ],
  };
}

function formatStructuredContentForModel(structuredContent: unknown): string {
  if (
    !structuredContent ||
    typeof structuredContent !== "object" ||
    Array.isArray(structuredContent)
  ) {
    return JSON.stringify(structuredContent, null, 2);
  }

  const record = structuredContent as Record<string, unknown>;
  const summary: string[] = [];
  for (const [key, value] of Object.entries(record)) {
    if (!Array.isArray(value)) {
      continue;
    }
    summary.push(`${key}_count=${value.length}`);
    const ids = value
      .map((item) =>
        item && typeof item === "object" && !Array.isArray(item)
          ? (item as Record<string, unknown>).id
          : null,
      )
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    if (ids.length === value.length && ids.length > 0) {
      summary.push(`${key}_ids=${ids.join(",")}`);
    }
  }

  const json = JSON.stringify(structuredContent, null, 2);
  return summary.length > 0 ? `${summary.join("\n")}\n\n${json}` : json;
}

function isZodSchema(value: unknown): value is z.ZodTypeAny {
  return (
    typeof value === "object" && value !== null && "_def" in value && "safeParseAsync" in value
  );
}

function relaxMcpOutputSchema(outputSchema: unknown): unknown {
  if (!outputSchema) {
    return outputSchema;
  }

  if (isZodSchema(outputSchema)) {
    return outputSchema instanceof z.ZodObject ? outputSchema.passthrough() : outputSchema;
  }

  return z.object(outputSchema as z.ZodRawShape).passthrough();
}

function relaxMcpToolOutputSchema<TConfig extends { outputSchema?: unknown }>(
  config: TConfig,
): TConfig {
  if (config.outputSchema === undefined) {
    return config;
  }

  return {
    ...config,
    outputSchema: relaxMcpOutputSchema(config.outputSchema),
  } as TConfig;
}

type McpToolContext = RequestHandlerExtra<ServerRequest, ServerNotification>;

interface ProviderSummary {
  id: AgentProvider;
  label: string;
  description: string;
  enabled: boolean;
  modes: AgentMode[];
  status: string;
  error?: string;
}

function toProviderSummary(entry: {
  provider: AgentProvider;
  label?: string;
  description?: string;
  enabled: boolean;
  modes?: AgentMode[];
  status: string;
  error?: string;
}): ProviderSummary {
  return {
    id: entry.provider,
    label: entry.label ?? entry.provider,
    description: entry.description ?? "",
    enabled: entry.enabled,
    modes: entry.modes ?? [],
    status: entry.status === "ready" ? "available" : entry.status,
    ...(entry.error ? { error: entry.error } : {}),
  };
}

function resolveChildAgentCwd(params: {
  parentCwd: string;
  requestedCwd?: string;
  lockedCwd?: string;
  allowCustomCwd: boolean;
}): string {
  const lockedCwd = params.lockedCwd?.trim();
  if (lockedCwd) {
    return expandUserPath(lockedCwd);
  }

  const requestedCwd = params.requestedCwd?.trim();
  if (!requestedCwd || !params.allowCustomCwd) {
    return params.parentCwd;
  }

  return resolvePathFromBase(params.parentCwd, requestedCwd);
}

export async function createAgentMcpServer(options: AgentMcpServerOptions): Promise<McpServer> {
  const {
    agentManager,
    agentStorage,
    terminalManager,
    scheduleService,
    chatService,
    loopService,
    usageStore,
    providerSnapshotManager,
    callerAgentId,
    companionParentAgentId,
    companionToken,
    resolveSpeakHandler,
    resolveCallerContext,
    logger,
  } = options;
  const childLogger = logger.child({ module: "agent", component: "mcp-server" });

  const callerContext = callerAgentId ? (resolveCallerContext?.(callerAgentId) ?? null) : null;
  if (companionParentAgentId || companionToken) {
    if (!companionParentAgentId || !companionToken) {
      throw new Error("Companion MCP requires parentAgentId and companionToken");
    }
    if (callerAgentId !== companionParentAgentId) {
      throw new Error("Companion MCP callerAgentId must match parentAgentId");
    }
    if (!agentManager.validateCompanionMcpToken(companionParentAgentId, companionToken)) {
      throw new Error("Invalid or expired companion MCP token");
    }
  }

  const server = new McpServer({
    name: "agent-mcp",
    version: "2.0.0",
  });
  const registerRawTool = server.registerTool.bind(server);
  const registerTool: McpServer["registerTool"] = (name, config, handler) =>
    registerRawTool(name, relaxMcpToolOutputSchema(config), (async (args: never, extra: never) =>
      addModelVisibleStructuredContent(await handler(args, extra))) as typeof handler);

  const resolveCallerAgent = () => {
    if (!callerAgentId) {
      return null;
    }
    const parentAgent = agentManager.getAgent(callerAgentId);
    if (!parentAgent) {
      throw new Error(`Parent agent ${callerAgentId} not found`);
    }
    return parentAgent;
  };

  const resolveScopedCwd = (requestedCwd?: string, opts?: { required?: boolean }): string => {
    const callerAgent = resolveCallerAgent();
    if (callerAgent) {
      return resolveChildAgentCwd({
        parentCwd: callerAgent.cwd,
        requestedCwd,
        lockedCwd: callerContext?.lockedCwd,
        allowCustomCwd: callerContext?.allowCustomCwd ?? true,
      });
    }

    const trimmedCwd = requestedCwd?.trim();
    if (!trimmedCwd) {
      if (opts?.required) {
        throw new Error("cwd is required");
      }
      throw new Error("cwd is required when no caller agent is available");
    }

    return expandUserPath(trimmedCwd);
  };

  const resolveScopeRoot = (): string | null => {
    const lockedCwd = callerContext?.lockedCwd?.trim();
    if (lockedCwd) {
      return expandUserPath(lockedCwd);
    }
    if (!callerAgentId || (callerContext?.allowCustomCwd ?? true)) {
      return null;
    }
    return resolveCallerAgent()?.cwd ?? null;
  };
  const ProviderOrProviderModelInputSchema = AgentProviderEnum.trim()
    .min(1, "provider is required")
    .refine(
      (value) => {
        if (!value.includes("/")) {
          return true;
        }
        try {
          resolveRequiredProviderModel(value);
          return true;
        } catch {
          return false;
        }
      },
      { message: "provider must be provider or provider/model, for example codex/gpt-5.4" },
    );
  const InspectProviderSettingsInputSchema = z
    .object({
      modeId: z.string().optional().describe("Draft session mode ID."),
      model: z.string().optional().describe("Draft model ID."),
      thinkingOptionId: z.string().optional().describe("Draft thinking option ID."),
      features: z.record(z.unknown()).optional().describe("Draft provider feature values."),
    })
    .strict();
  const inspectProviderInputSchema = {
    provider: ProviderOrProviderModelInputSchema.describe(
      "Provider ID, optionally with a model ID (for example codex or codex/gpt-5.4).",
    ),
    cwd: z
      .string()
      .optional()
      .describe("Working directory used to resolve provider feature availability."),
    settings: InspectProviderSettingsInputSchema.optional().describe(
      "Draft provider settings used to compute available features.",
    ),
  };
  if (options.voiceOnly || options.enableVoiceTools || callerContext?.enableVoiceTools) {
    registerTool(
      "speak",
      {
        title: "Speak",
        description:
          "Speak text to the user via daemon-managed voice output. Blocks until playback completes.",
        inputSchema: {
          text: z
            .string()
            .trim()
            .min(1, "text is required")
            .max(4000, "text must be 4000 characters or fewer"),
        },
        outputSchema: {
          ok: z.boolean(),
        },
      },
      async (args, context?: McpToolContext) => {
        if (!callerAgentId) {
          throw new Error("speak is only available to agent-scoped MCP sessions");
        }
        const handler = resolveSpeakHandler?.(callerAgentId) ?? null;
        if (!handler) {
          throw new Error(`No speak handler registered for caller agent '${callerAgentId}'`);
        }
        await handler({
          text: args.text,
          callerAgentId,
          signal: context?.signal,
        });
        return {
          content: [],
          structuredContent: ensureValidJson({ ok: true }),
        };
      },
    );
  }

  if (options.voiceOnly) {
    return server;
  }

  if (companionParentAgentId) {
    registerCompanionMcpTools({
      server,
      parentAgentId: companionParentAgentId,
      agentManager,
      agentStorage,
      providerSnapshotManager,
      logger: childLogger,
      registerTool,
    });
  }

  registerChatMcpTools({
    registerTool,
    chatService,
    agentManager,
    agentStorage,
    callerAgentId,
    logger: childLogger,
    resolveAgentIdentifier: (identifier) =>
      resolveAgentIdentifier(
        {
          listLiveAgentIds: () => agentManager.listAgents().map((agent) => agent.id),
          listStoredRecords: async () =>
            (await agentStorage.list()).map((record) => ({
              id: record.id,
              title: record.title,
              internal: record.internal,
            })),
        },
        identifier,
      ),
  });
  registerLoopMcpTools({
    registerTool,
    loopService,
    resolveScopedCwd,
  });
  registerScheduleMcpTools({
    registerTool,
    scheduleService,
    callerAgentId,
    resolveCallerAgent,
    resolveScopedCwd,
  });
  registerUsageMcpTools({
    registerTool,
    usageStore,
    callerAgentId,
    lockedCwd: callerContext?.lockedCwd,
  });
  registerTerminalMcpTools({
    registerTool,
    terminalManager,
    resolveScopedCwd,
    resolveScopeRoot,
  });
  registerWorktreeMcpTools({
    registerTool,
    agentManager,
    agentStorage,
    terminalManager,
    github: options.github,
    workspaceGitService: options.workspaceGitService,
    archiveWorkspaceRecord: options.archiveWorkspaceRecord,
    emitWorkspaceUpdatesForWorkspaceIds: options.emitWorkspaceUpdatesForWorkspaceIds,
    markWorkspaceArchiving: options.markWorkspaceArchiving,
    clearWorkspaceArchiving: options.clearWorkspaceArchiving,
    createChisaCodeWorktree: options.createChisaCodeWorktree,
    chisacodeHome: options.chisacodeHome,
    logger: childLogger,
    resolveScopedCwd,
    resolveScopeRoot,
  });

  registerCreateAgentMcpTool({
    registerTool,
    agentManager,
    agentStorage,
    terminalManager,
    providerSnapshotManager,
    callerAgentId,
    callerContext,
    logger: childLogger,
    chisacodeHome: options.chisacodeHome,
    workspaceGitService: options.workspaceGitService,
    createChisaCodeWorktree: options.createChisaCodeWorktree,
  });
  registerAgentControlMcpTools({
    registerTool,
    agentManager,
    agentStorage,
    providerSnapshotManager,
    callerAgentId,
    logger: childLogger,
    resolveScopedCwd,
    resolveScopeRoot,
  });
  registerTool(
    "list_providers",
    {
      title: "List providers",
      description: "List configured agent providers, availability, and their modes.",
      inputSchema: {},
      outputSchema: {
        providers: z.array(ProviderSummarySchema),
      },
    },
    async () => {
      const providers = (await providerSnapshotManager.listProviders({ wait: true })).map(
        toProviderSummary,
      );
      return {
        content: [],
        structuredContent: ensureValidJson({ providers }),
      };
    },
  );

  registerTool(
    "list_models",
    {
      title: "List models",
      description: "List models for an agent provider.",
      inputSchema: {
        provider: AgentProviderEnum,
      },
      outputSchema: {
        provider: z.string(),
        models: z.array(AgentModelSchema),
      },
    },
    async ({ provider }) => {
      const models = await providerSnapshotManager.listModels({
        cwd: resolveSnapshotCwd(),
        provider,
        wait: true,
      });
      return {
        content: [],
        structuredContent: ensureValidJson({
          provider,
          models,
        }),
      };
    },
  );

  registerTool(
    "inspect_provider",
    {
      title: "Inspect provider",
      description:
        "Inspect compact provider capabilities for orchestration, including modes and draft feature settings. Use list_models for the full model list.",
      inputSchema: inspectProviderInputSchema,
      outputSchema: {
        provider: AgentProviderEnum,
        label: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
        enabled: z.boolean(),
        status: z.string(),
        modes: z.array(ProviderModeSchema).nullish(),
        selectedModel: z.string().nullable(),
        features: z.array(AgentFeatureSchema),
      },
    },
    async ({ provider, cwd, settings }) => {
      const resolvedProviderModel = resolveProviderAndOptionalModel(provider, provider);
      const providerId = resolvedProviderModel.provider;
      const resolvedCwd = resolveScopedCwd(cwd, { required: true });
      const entry = await providerSnapshotManager.getProvider({
        cwd: resolvedCwd,
        provider: providerId,
        wait: true,
      });
      const summary = toProviderSummary(entry);
      if (!entry.enabled) {
        throw new Error(`Provider '${providerId}' is disabled`);
      }
      if (entry.status !== "ready") {
        throw new Error(entry.error ?? `Provider '${providerId}' is unavailable`);
      }
      const selectedModel = settings?.model ?? resolvedProviderModel.model;
      const features = await agentManager.listDraftFeatures({
        provider: providerId,
        cwd: resolvedCwd,
        ...(settings?.modeId ? { modeId: settings.modeId } : {}),
        ...(selectedModel ? { model: selectedModel } : {}),
        ...(settings?.thinkingOptionId ? { thinkingOptionId: settings.thinkingOptionId } : {}),
        ...(settings?.features ? { featureValues: settings.features } : {}),
      });
      return {
        content: [],
        structuredContent: ensureValidJson({
          provider: providerId,
          label: summary.label,
          description: summary.description,
          enabled: summary.enabled,
          status: summary.status,
          modes: summary.modes,
          selectedModel: selectedModel ?? null,
          features,
        }),
      };
    },
  );

  const getDiagnostics = options.getDiagnostics;
  if (getDiagnostics) {
    registerTool(
      "get_diagnostics",
      {
        title: "Get diagnostics",
        description:
          "Return a redacted daemon troubleshooting report. Daemon log excerpts are never included through MCP.",
        inputSchema: {},
        outputSchema: {
          diagnostic: z.string(),
        },
      },
      async () => ({
        content: [],
        structuredContent: ensureValidJson({ diagnostic: await getDiagnostics() }),
      }),
    );
  }

  return server;
}
