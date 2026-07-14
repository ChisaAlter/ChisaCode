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
import type { AgentManager, WaitForAgentResult } from "./agent-manager.js";
import {
  AgentFeatureSchema,
  AgentPermissionRequestPayloadSchema,
  AgentListItemPayloadSchema,
  AgentPermissionResponseSchema,
  AgentSnapshotPayloadSchema,
} from "../messages.js";
import type { AgentListItemPayload } from "../messages.js";
import {
  buildStoredAgentPayload,
  toAgentListItemPayload,
  toAgentPayload,
} from "./agent-projections.js";
import { curateAgentActivity } from "./activity-curator.js";
import { selectItemsByProjectedLimit } from "./timeline-projection.js";
import type { AgentStorage } from "./agent-storage.js";
import { ensureAgentLoaded } from "./agent-loading.js";
import { isStoredAgentProviderAvailable } from "../persistence-hooks.js";
import type { ArchiveChisaCodeWorktreeDependencies } from "../chisacode-worktree-archive-service.js";
import { WaitForAgentTracker } from "./wait-for-agent-tracker.js";
import { createAgentCommand } from "./create-agent/create.js";
import type { VoiceCallerContext, VoiceSpeakHandler } from "../voice-types.js";
import { expandUserPath, isSameOrDescendantPath, resolvePathFromBase } from "../path-utils.js";
import type { TerminalManager } from "../../terminal/terminal-manager.js";
import type { CreateChisaCodeWorktreeWorkflowFn } from "../worktree-session.js";

import { resolveSnapshotCwd, type ProviderSnapshotManager } from "./provider-snapshot-manager.js";
import {
  AgentModelSchema,
  AgentProviderEnum,
  AgentStatusEnum,
  ProviderModeSchema,
  ProviderSummarySchema,
  resolveProviderAndOptionalModel,
  resolveRequiredProviderModel,
  sanitizePermissionRequest,
  serializeSnapshotWithMetadata,
  waitForAgentWithTimeout,
} from "./mcp-shared.js";
import { sendPromptToAgent, setupFinishNotification } from "./agent-prompt.js";
import { respondToAgentPermission } from "./permission-response.js";
import {
  archiveAgentCommand,
  cancelAgentRunCommand,
  closeAgentCommand,
  setAgentModeCommand,
  updateAgentCommand,
} from "./lifecycle-command.js";
import type { GitHubService } from "../../services/github-service.js";
import type { WorkspaceGitService } from "../workspace-git-service.js";
import type { UsageStore } from "../usage/usage-store.js";
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

function parseTimestamp(value: string | null | undefined): number {
  if (!value) {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function resolveAgentListActivityTime(agent: AgentListItemPayload): number {
  return Math.max(
    parseTimestamp(agent.updatedAt),
    parseTimestamp(agent.lastUserMessageAt),
    parseTimestamp(agent.attentionTimestamp),
    parseTimestamp(agent.archivedAt),
    parseTimestamp(agent.createdAt),
  );
}

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

function compareAgentListItems(a: AgentListItemPayload, b: AgentListItemPayload): number {
  const attentionDelta =
    Number(b.requiresAttention ?? false) - Number(a.requiresAttention ?? false);
  if (attentionDelta !== 0) {
    return attentionDelta;
  }

  const statusOrder = {
    running: 0,
    initializing: 1,
    idle: 2,
    error: 3,
    closed: 4,
  } as Record<string, number>;
  const statusDelta = (statusOrder[a.status] ?? 999) - (statusOrder[b.status] ?? 999);
  if (statusDelta !== 0) {
    return statusDelta;
  }

  return resolveAgentListActivityTime(b) - resolveAgentListActivityTime(a);
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
  const waitTracker = new WaitForAgentTracker(logger);
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
  const ProviderModelInputSchema = AgentProviderEnum.trim()
    .refine((value) => value.includes("/"), {
      message: "provider must be provider/model, for example codex/gpt-5.4",
    })
    .refine(
      (value) => {
        try {
          resolveRequiredProviderModel(value);
          return true;
        } catch {
          return false;
        }
      },
      { message: "provider must be provider/model, for example codex/gpt-5.4" },
    );
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
  const CreateAgentSettingsInputSchema = z
    .object({
      modeId: z.string().optional().describe("Session mode to configure before the first run."),
      thinkingOptionId: z.string().optional().describe("Thinking option ID."),
      features: z
        .record(z.unknown())
        .optional()
        .describe("Provider-specific feature values, for example { fast_mode: true } for Codex."),
    })
    .strict();
  const UpdateAgentSettingsInputSchema = z
    .object({
      modeId: z.string().optional().describe("Session mode ID."),
      model: z.string().nullable().optional().describe("Model ID. Pass null to clear."),
      thinkingOptionId: z
        .string()
        .nullable()
        .optional()
        .describe("Thinking option ID. Pass null to clear."),
      features: z
        .record(z.unknown())
        .optional()
        .describe("Provider-specific feature values, for example { fast_mode: true } for Codex."),
    })
    .strict();
  const InspectProviderSettingsInputSchema = z
    .object({
      modeId: z.string().optional().describe("Draft session mode ID."),
      model: z.string().optional().describe("Draft model ID."),
      thinkingOptionId: z.string().optional().describe("Draft thinking option ID."),
      features: z.record(z.unknown()).optional().describe("Draft provider feature values."),
    })
    .strict();
  const agentToAgentInputSchema = {
    cwd: z
      .string()
      .optional()
      .describe("Optional working directory. Defaults to the caller agent working directory."),
    title: z
      .string()
      .trim()
      .min(1, "Title is required")
      .max(60, "Title must be 60 characters or fewer")
      .describe("Short descriptive title (<= 60 chars) summarizing the agent's focus."),
    provider: ProviderModelInputSchema.describe(
      "Required provider/model pair, for example codex/gpt-5.4.",
    ),
    relationKind: z
      .enum(["subagent", "detached", "handoff", "team-slot"])
      .optional()
      .describe("Relationship to the caller agent. Defaults to subagent for agent-scoped calls."),
    labels: z.record(z.string(), z.string()).optional().describe("Labels to set on the agent"),
    settings: CreateAgentSettingsInputSchema.optional().describe(
      "Initial runtime settings for the new agent.",
    ),
    initialPrompt: z
      .string()
      .trim()
      .min(1, "initialPrompt is required")
      .describe("Required first task to run immediately after creation."),
    background: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "Run agent in background. If false (default), waits for completion or permission request. If true, returns immediately.",
      ),
    notifyOnFinish: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "Send a notification prompt to the caller agent when this agent finishes, errors, or needs permission. Requires a caller agent context.",
      ),
  };

  const topLevelInputSchema = {
    cwd: z
      .string()
      .describe("Required working directory for the agent (absolute, relative, or ~)."),
    title: z
      .string()
      .trim()
      .min(1, "Title is required")
      .max(60, "Title must be 60 characters or fewer")
      .describe("Short descriptive title (<= 60 chars) summarizing the agent's focus."),
    provider: ProviderModelInputSchema.describe(
      "Required provider/model pair, for example codex/gpt-5.4.",
    ),
    labels: z.record(z.string(), z.string()).optional().describe("Labels to set on the agent"),
    settings: CreateAgentSettingsInputSchema.optional().describe(
      "Initial runtime settings for the new agent.",
    ),
    initialPrompt: z
      .string()
      .trim()
      .min(1, "initialPrompt is required")
      .describe("Required first task to run immediately after creation."),
    worktreeName: z
      .string()
      .optional()
      .describe("Optional git worktree branch name (lowercase alphanumerics + hyphen)."),
    baseBranch: z
      .string()
      .optional()
      .describe("Required when worktreeName is set: the base branch to diff/merge against."),
    refName: z.string().min(1).optional().describe("Optional source ref for worktree creation."),
    action: z
      .enum(["branch-off", "checkout"])
      .optional()
      .describe("Optional worktree creation action."),
    githubPrNumber: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Optional GitHub pull request number to checkout."),
    background: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "Run agent in background. If false (default), waits for completion or permission request. If true, returns immediately.",
      ),
    notifyOnFinish: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "Send a notification prompt to the caller agent when this agent finishes, errors, or needs permission. Requires a caller agent context.",
      ),
  };

  const createAgentInputSchema = callerAgentId ? agentToAgentInputSchema : topLevelInputSchema;
  const agentToAgentCreateAgentArgsSchema = z.object(agentToAgentInputSchema).strict();
  const topLevelCreateAgentArgsSchema = z.object(topLevelInputSchema).strict();
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
  type TopLevelCreateAgentArgs = z.infer<typeof topLevelCreateAgentArgsSchema>;

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

  registerTool(
    "create_agent",
    {
      title: "Create agent",
      description:
        "Create an agent tied to a working directory. Requires provider/model, for example codex/gpt-5.4. Do not guess; call list_providers and list_models first if uncertain. Optionally run an initial prompt immediately or create a git worktree for the agent.",
      inputSchema: createAgentInputSchema,
      outputSchema: {
        agentId: z.string(),
        type: AgentProviderEnum,
        status: AgentStatusEnum,
        cwd: z.string(),
        currentModeId: z.string().nullable(),
        availableModes: z.array(ProviderModeSchema),
        lastMessage: z.string().nullable().optional(),
        permission: AgentPermissionRequestPayloadSchema.nullable().optional(),
      },
    },
    async (args: unknown) => {
      const { parsedArgs, worktree } = resolveCreateAgentToolArgs(args);
      const { snapshot, background, initialPromptStarted } = await createAgentCommand(
        {
          agentManager,
          agentStorage,
          logger: childLogger,
          chisacodeHome: options.chisacodeHome,
          workspaceGitService: options.workspaceGitService,
          terminalManager,
          providerSnapshotManager,
          createChisaCodeWorktree: options.createChisaCodeWorktree,
        },
        {
          kind: "mcp",
          provider: parsedArgs.provider,
          title: parsedArgs.title,
          initialPrompt: parsedArgs.initialPrompt,
          cwd: parsedArgs.cwd,
          thinking: parsedArgs.settings?.thinkingOptionId,
          features: parsedArgs.settings?.features,
          labels: parsedArgs.labels,
          relationKind: "relationKind" in parsedArgs ? parsedArgs.relationKind : undefined,
          mode: parsedArgs.settings?.modeId,
          background: parsedArgs.background ?? false,
          notifyOnFinish: parsedArgs.notifyOnFinish ?? false,
          callerAgentId,
          callerContext,
          worktree,
        },
      );

      try {
        if (!background && initialPromptStarted) {
          const result = await waitForAgentWithTimeout(agentManager, snapshot.id, {
            waitForActive: true,
          });

          const liveSnapshot = agentManager.getAgent(snapshot.id) ?? snapshot;
          const responseData = {
            agentId: snapshot.id,
            type: snapshot.provider,
            status: result.status,
            cwd: liveSnapshot.cwd,
            currentModeId: liveSnapshot.currentModeId,
            availableModes: liveSnapshot.availableModes,
            lastMessage: result.lastMessage,
            permission: sanitizePermissionRequest(result.permission),
          };
          const validJson = ensureValidJson(responseData);

          const response = {
            content: [],
            structuredContent: validJson,
          };
          return response;
        }
      } catch (error) {
        childLogger.error({ err: error, agentId: snapshot.id }, "Failed to run initial prompt");
        throw error;
      }

      // Return immediately if background=true
      const currentSnapshot = agentManager.getAgent(snapshot.id) ?? snapshot;
      const response = {
        content: [],
        structuredContent: ensureValidJson({
          agentId: currentSnapshot.id,
          type: snapshot.provider,
          status: currentSnapshot.lifecycle,
          cwd: currentSnapshot.cwd,
          currentModeId: currentSnapshot.currentModeId,
          availableModes: currentSnapshot.availableModes,
          lastMessage: null,
          permission: null,
        }),
      };
      return response;
    },
  );

  function resolveCreateAgentToolArgs(args: unknown): {
    parsedArgs:
      | z.infer<typeof agentToAgentCreateAgentArgsSchema>
      | z.infer<typeof topLevelCreateAgentArgsSchema>;
    worktree: ReturnType<typeof resolveTopLevelCreateAgentWorktree>;
  } {
    if (callerAgentId) {
      return {
        parsedArgs: agentToAgentCreateAgentArgsSchema.parse(args),
        worktree: undefined,
      };
    }
    const parsedArgs = topLevelCreateAgentArgsSchema.parse(args);
    return {
      parsedArgs,
      worktree: resolveTopLevelCreateAgentWorktree(parsedArgs),
    };
  }

  function resolveTopLevelCreateAgentWorktree(args: TopLevelCreateAgentArgs):
    | {
        worktreeName?: string;
        baseBranch?: string;
        refName?: string;
        action?: "branch-off" | "checkout";
        githubPrNumber?: number;
      }
    | undefined {
    return {
      worktreeName: args.worktreeName,
      baseBranch: args.baseBranch,
      refName: args.refName,
      action: args.action,
      githubPrNumber: args.githubPrNumber,
    };
  }

  registerTool(
    "wait_for_agent",
    {
      title: "Wait for agent",
      description:
        "Block until the agent requests permission or the current run completes. Returns the pending permission (if any) and recent activity summary.",
      inputSchema: {
        agentId: z.string().describe("Agent identifier returned by the create_agent tool"),
      },
      outputSchema: {
        agentId: z.string(),
        status: AgentStatusEnum,
        permission: AgentPermissionRequestPayloadSchema.nullable(),
        lastMessage: z.string().nullable(),
      },
    },
    async ({ agentId }, { signal }) => {
      const abortController = new AbortController();
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

      const forwardExternalAbort = () => {
        if (!abortController.signal.aborted) {
          const reason = signal?.reason ?? new Error("wait_for_agent aborted");
          abortController.abort(reason);
        }
      };

      if (signal) {
        if (signal.aborted) {
          forwardExternalAbort();
        } else {
          signal.addEventListener("abort", forwardExternalAbort, { once: true });
          cleanupFns.push(() => signal.removeEventListener("abort", forwardExternalAbort));
        }
      }

      const unregister = waitTracker.register(agentId, (reason) => {
        if (!abortController.signal.aborted) {
          abortController.abort(new Error(reason ?? "wait_for_agent cancelled"));
        }
      });
      cleanupFns.push(unregister);

      try {
        const result: WaitForAgentResult = await waitForAgentWithTimeout(agentManager, agentId, {
          signal: abortController.signal,
        });

        const validJson = ensureValidJson({
          agentId,
          status: result.status,
          permission: sanitizePermissionRequest(result.permission),
          lastMessage: result.lastMessage,
        });

        const response = {
          content: [],
          structuredContent: validJson,
        };
        return response;
      } finally {
        cleanup();
      }
    },
  );

  registerTool(
    "send_agent_prompt",
    {
      title: "Send agent prompt",
      description:
        "Send a task to a running agent. Returns immediately after the agent begins processing.",
      inputSchema: {
        agentId: z.string(),
        prompt: z.string(),
        sessionMode: z
          .string()
          .optional()
          .describe("Optional mode to set before running the prompt."),
        background: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "Run agent in background. If false (default), waits for completion or permission request. If true, returns immediately.",
          ),
        notifyOnFinish: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "Send a notification prompt to the caller agent when this agent finishes, errors, or needs permission.",
          ),
      },
      outputSchema: {
        success: z.boolean(),
        status: AgentStatusEnum,
        lastMessage: z.string().nullable().optional(),
        permission: AgentPermissionRequestPayloadSchema.nullable().optional(),
      },
    },
    async ({ agentId, prompt, sessionMode, background = false, notifyOnFinish = false }) => {
      if (agentManager.hasInFlightRun(agentId)) {
        waitTracker.cancel(agentId, "Agent run interrupted by new prompt");
      }

      await sendPromptToAgent({
        agentManager,
        agentStorage,
        agentId,
        prompt,
        sessionMode,
        logger: childLogger,
      });

      if (notifyOnFinish && callerAgentId) {
        setupFinishNotification({
          agentManager,
          agentStorage,
          childAgentId: agentId,
          callerAgentId,
          logger: childLogger,
        });
      }

      // If not running in background, wait for completion
      if (!background) {
        const result = await waitForAgentWithTimeout(agentManager, agentId, {
          waitForActive: true,
        });

        const responseData = {
          success: true,
          status: result.status,
          lastMessage: result.lastMessage,
          permission: sanitizePermissionRequest(result.permission),
        };
        const validJson = ensureValidJson(responseData);

        const response = {
          content: [],
          structuredContent: validJson,
        };
        return response;
      }

      // Return immediately if background=true
      // Re-fetch snapshot since the state may have changed
      const currentSnapshot = agentManager.getAgent(agentId);

      const responseData = {
        success: true,
        status: currentSnapshot?.lifecycle ?? "idle",
        lastMessage: null,
        permission: null,
      };
      const validJson = ensureValidJson(responseData);

      const response = {
        content: [],
        structuredContent: validJson,
      };
      return response;
    },
  );

  registerTool(
    "get_agent_status",
    {
      title: "Get agent status",
      description:
        "Return the latest snapshot for an agent, including lifecycle state, capabilities, and pending permissions.",
      inputSchema: {
        agentId: z.string(),
      },
      outputSchema: {
        status: AgentStatusEnum,
        snapshot: AgentSnapshotPayloadSchema,
      },
    },
    async ({ agentId }) => {
      const snapshot = agentManager.getAgent(agentId);
      if (snapshot) {
        const structuredSnapshot = await serializeSnapshotWithMetadata(
          agentStorage,
          snapshot,
          childLogger,
        );
        return {
          content: [],
          structuredContent: ensureValidJson({
            status: snapshot.lifecycle,
            snapshot: structuredSnapshot,
          }),
        };
      }

      const record = await agentStorage.get(agentId);
      if (!record || record.internal) {
        throw new Error(`Agent ${agentId} not found`);
      }

      const structuredSnapshot = buildStoredAgentPayload(
        record,
        providerSnapshotManager.listRegisteredProviderIds(),
      );
      return {
        content: [],
        structuredContent: ensureValidJson({
          status: structuredSnapshot.status,
          snapshot: structuredSnapshot,
        }),
      };
    },
  );

  registerTool(
    "list_agents",
    {
      title: "List agents",
      description: "List recent agents as compact metadata.",
      inputSchema: {
        includeArchived: z.boolean().optional().default(false),
        cwd: z.string().optional(),
        sinceHours: z
          .number()
          .int()
          .positive()
          .max(24 * 30)
          .optional()
          .default(48),
        statuses: z.array(AgentStatusEnum).optional(),
        limit: z.number().int().positive().max(200).optional().default(50),
      },
      outputSchema: {
        agents: z.array(AgentListItemPayloadSchema),
      },
    },
    async ({ includeArchived = false, cwd, sinceHours = 48, statuses, limit = 50 }) => {
      const callerCwd = callerAgentId ? resolveCallerAgent()?.cwd : undefined;
      const requestedCwd = cwd?.trim() ? expandUserPath(cwd) : callerCwd;
      const statusFilter = statuses && statuses.length > 0 ? new Set(statuses) : null;
      const sinceMs = Date.now() - sinceHours * 60 * 60 * 1000;
      const liveSnapshots = agentManager.listAgents();
      const liveAgents = await Promise.all(
        liveSnapshots.map((snapshot) =>
          serializeSnapshotWithMetadata(agentStorage, snapshot, childLogger),
        ),
      );
      const liveIds = new Set(liveSnapshots.map((snapshot) => snapshot.id));
      const storedRecords = await agentStorage.list();
      const registeredProviderIds = providerSnapshotManager.listRegisteredProviderIds();
      const storedAgents = storedRecords
        .filter((record) => !record.internal && !liveIds.has(record.id))
        .filter((record) => includeArchived || !record.archivedAt)
        .filter(
          (record) =>
            includeArchived || isStoredAgentProviderAvailable(record, registeredProviderIds),
        )
        .map((record) => buildStoredAgentPayload(record, registeredProviderIds));
      const agents = [...liveAgents, ...storedAgents]
        .map(toAgentListItemPayload)
        .filter((agent) => !requestedCwd || isSameOrDescendantPath(requestedCwd, agent.cwd))
        .filter((agent) => !statusFilter || statusFilter.has(agent.status))
        .filter((agent) => !agent.archivedAt || resolveAgentListActivityTime(agent) >= sinceMs)
        .sort(compareAgentListItems)
        .slice(0, limit);

      return {
        content: [],
        structuredContent: ensureValidJson({ agents }),
      };
    },
  );

  registerTool(
    "cancel_agent",
    {
      title: "Cancel agent run",
      description: "Abort the agent's current run but keep the agent alive for future tasks.",
      inputSchema: {
        agentId: z.string(),
      },
      outputSchema: {
        success: z.boolean(),
      },
    },
    async ({ agentId }) => {
      const { cancelled } = await cancelAgentRunCommand(
        { agentManager, logger: childLogger },
        agentId,
      );
      if (cancelled) {
        waitTracker.cancel(agentId, "Agent run cancelled");
      }
      return {
        content: [],
        structuredContent: ensureValidJson({ success: cancelled }),
      };
    },
  );

  registerTool(
    "archive_agent",
    {
      title: "Archive agent",
      description:
        "Archive an agent (soft-delete). The agent is interrupted if running and removed from the active list.",
      inputSchema: {
        agentId: z.string(),
      },
      outputSchema: {
        success: z.boolean(),
      },
    },
    async ({ agentId }) => {
      await archiveAgentCommand(
        {
          agentManager,
          agentStorage,
          logger: childLogger,
        },
        agentId,
      );
      waitTracker.cancel(agentId, "Agent archived");
      return {
        content: [],
        structuredContent: ensureValidJson({ success: true }),
      };
    },
  );

  registerTool(
    "kill_agent",
    {
      title: "Kill agent",
      description: "Terminate an agent session permanently.",
      inputSchema: {
        agentId: z.string(),
      },
      outputSchema: {
        success: z.boolean(),
      },
    },
    async ({ agentId }) => {
      await closeAgentCommand({ agentManager }, agentId);
      waitTracker.cancel(agentId, "Agent terminated");
      return {
        content: [],
        structuredContent: ensureValidJson({ success: true }),
      };
    },
  );

  registerTool(
    "update_agent",
    {
      title: "Update agent",
      description: "Update an agent name, labels, and/or runtime settings.",
      inputSchema: {
        agentId: z.string(),
        name: z.string().optional(),
        labels: z.record(z.string(), z.string()).optional().describe("Labels to set on the agent"),
        settings: UpdateAgentSettingsInputSchema.optional().describe(
          "Runtime settings to apply to the agent.",
        ),
      },
      outputSchema: {
        success: z.boolean(),
      },
    },
    async ({ agentId, name, labels, settings }) => {
      if (settings?.modeId !== undefined) {
        await agentManager.setAgentMode(agentId, settings.modeId);
      }
      if (settings?.model !== undefined) {
        await agentManager.setAgentModel(agentId, settings.model);
      }
      if (settings?.thinkingOptionId !== undefined) {
        await agentManager.setAgentThinkingOption(agentId, settings.thinkingOptionId);
      }
      if (settings?.features) {
        for (const [featureId, value] of Object.entries(settings.features)) {
          await agentManager.setAgentFeature(agentId, featureId, value);
        }
      }

      await updateAgentCommand({ agentManager }, { agentId, name, labels });

      return {
        content: [],
        structuredContent: ensureValidJson({ success: true }),
      };
    },
  );

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

  registerTool(
    "get_agent_activity",
    {
      title: "Get agent activity",
      description: "Return recent agent timeline entries as a curated summary.",
      inputSchema: {
        agentId: z.string(),
        limit: z
          .number()
          .optional()
          .describe("Optional limit for number of activities to include (most recent first)."),
      },
      outputSchema: {
        agentId: z.string(),
        updateCount: z.number(),
        currentModeId: z.string().nullable(),
        content: z.string(),
      },
    },
    async ({ agentId, limit }) => {
      await ensureAgentLoaded(agentId, {
        agentManager,
        agentStorage,
        logger: childLogger,
      });
      const timeline = agentManager.getTimeline(agentId);
      const snapshot = agentManager.getAgent(agentId);

      const selection = selectItemsByProjectedLimit({
        items: timeline,
        direction: "tail",
        limit: limit ?? 0,
      });
      const curatedContent = curateAgentActivity(selection.items);
      const { totalProjected, shownProjected } = selection;

      const noun = totalProjected === 1 ? "activity" : "activities";
      const countHeader =
        limit && shownProjected < totalProjected
          ? `Showing ${shownProjected} of ${totalProjected} ${noun} (limited to ${limit})`
          : `Showing all ${totalProjected} ${noun}`;

      const contentWithCount = `${countHeader}\n\n${curatedContent}`;

      return {
        content: [],
        structuredContent: ensureValidJson({
          agentId,
          updateCount: timeline.length,
          currentModeId: snapshot?.currentModeId ?? null,
          content: contentWithCount,
        }),
      };
    },
  );

  registerTool(
    "set_agent_mode",
    {
      title: "Set agent session mode",
      description:
        "Switch the agent's session mode (plan, bypassPermissions, read-only, auto, etc.).",
      inputSchema: {
        agentId: z.string(),
        modeId: z.string(),
      },
      outputSchema: {
        success: z.boolean(),
        newMode: z.string(),
      },
    },
    async ({ agentId, modeId }) => {
      const result = await setAgentModeCommand({ agentManager }, { agentId, modeId });
      return {
        content: [],
        structuredContent: ensureValidJson({ success: true, newMode: result.modeId }),
      };
    },
  );

  registerTool(
    "list_pending_permissions",
    {
      title: "List pending permissions",
      description:
        "Return all pending permission requests across all agents with the normalized payloads.",
      inputSchema: {},
      outputSchema: {
        permissions: z.array(
          z.object({
            agentId: z.string(),
            status: AgentStatusEnum,
            request: AgentPermissionRequestPayloadSchema,
          }),
        ),
      },
    },
    async () => {
      const permissions = agentManager.listAgents().flatMap((agent) => {
        const payload = toAgentPayload(agent);
        return payload.pendingPermissions.map((request) => ({
          agentId: agent.id,
          status: payload.status,
          request,
        }));
      });

      return {
        content: [],
        structuredContent: ensureValidJson({ permissions }),
      };
    },
  );

  registerTool(
    "respond_to_permission",
    {
      title: "Respond to permission",
      description:
        "Approve or deny a pending permission request with an AgentManager-compatible response payload.",
      inputSchema: {
        agentId: z.string(),
        requestId: z.string(),
        response: AgentPermissionResponseSchema,
      },
      outputSchema: {
        success: z.boolean(),
      },
    },
    async ({ agentId, requestId, response }) => {
      await respondToAgentPermission({
        agentManager,
        agentId,
        requestId,
        response,
        logger: childLogger,
      });
      return {
        content: [],
        structuredContent: ensureValidJson({ success: true }),
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
