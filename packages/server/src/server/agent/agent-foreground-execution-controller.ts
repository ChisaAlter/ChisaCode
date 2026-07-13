import type { Logger } from "pino";

import type {
  AgentPersistenceHandle,
  AgentPromptInput,
  AgentRunOptions,
  AgentStreamEvent,
} from "./agent-sdk-types.js";
import type { ManagedAgent } from "./agent-manager.js";
import { ForegroundRunState, type PendingForegroundRun } from "./foreground-run-state.js";

type ActiveManagedAgent = Exclude<ManagedAgent, { lifecycle: "closed" }>;

interface ForegroundLifecycleHooks {
  onStarted(): void;
  onStartFailed(error: unknown): void;
}

interface AgentForegroundExecutionControllerOptions {
  attachPersistenceCwd(
    handle: AgentPersistenceHandle | null,
    cwd: string,
  ): AgentPersistenceHandle | null;
  emitState(agent: ManagedAgent): void;
  foregroundRuns: ForegroundRunState;
  getAgent(agentId: string): ActiveManagedAgent;
  handleStreamEvent(agent: ActiveManagedAgent, event: AgentStreamEvent): Promise<unknown>;
  isTerminalEvent(event: AgentStreamEvent): boolean;
  logger: Logger;
  onAgentTerminal(agentId: string): void;
  refreshRuntimeInfo(agent: ActiveManagedAgent): Promise<void>;
  touchUpdatedAt(agent: ManagedAgent): Date;
}

/** Owns one foreground turn from start request through terminal finalization. */
export class AgentForegroundExecutionController {
  constructor(private readonly options: AgentForegroundExecutionControllerOptions) {}

  stream(
    agentId: string,
    prompt: AgentPromptInput,
    runOptions?: AgentRunOptions,
    lifecycleHooks?: ForegroundLifecycleHooks,
  ): AsyncGenerator<AgentStreamEvent> {
    const agent = this.options.getAgent(agentId);
    this.options.logger.trace(
      {
        agentId,
        provider: agent.provider,
        sessionId: agent.persistence?.sessionId ?? undefined,
        turnId: agent.activeForegroundTurnId ?? undefined,
        lifecycle: agent.lifecycle,
        activeForegroundTurnId: agent.activeForegroundTurnId,
        hasPendingForegroundRun: this.options.foregroundRuns.hasPendingRun(agentId),
        promptType: typeof prompt === "string" ? "string" : "structured",
        hasRunOptions: Boolean(runOptions),
      },
      "agent.manager.stream.request",
    );
    if (agent.activeForegroundTurnId || this.options.foregroundRuns.hasPendingRun(agentId)) {
      this.options.logger.trace(
        {
          agentId,
          provider: agent.provider,
          sessionId: agent.persistence?.sessionId ?? undefined,
          turnId: agent.activeForegroundTurnId ?? undefined,
          lifecycle: agent.lifecycle,
          hasPendingForegroundRun: this.options.foregroundRuns.hasPendingRun(agentId),
        },
        "agent.manager.stream.reject",
      );
      throw new Error(`Agent ${agentId} already has an active run`);
    }

    agent.pendingReplacement = false;
    agent.lastError = undefined;

    const pendingRun = this.options.foregroundRuns.createPendingRun(agentId);
    return this.forwardTurn(agent, prompt, runOptions, pendingRun, lifecycleHooks);
  }

  finalize(agent: ActiveManagedAgent, turnId?: string): void {
    if (turnId) {
      this.options.foregroundRuns.rememberFinalizedTurn(agent, turnId);
    }
    agent.activeForegroundTurnId = null;
    const terminalError = agent.lastError;
    const shouldHoldBusyForReplacement = agent.pendingReplacement && !terminalError;
    let nextLifecycle: "running" | "error" | "idle";
    if (shouldHoldBusyForReplacement) {
      nextLifecycle = "running";
    } else if (terminalError) {
      nextLifecycle = "error";
    } else {
      nextLifecycle = "idle";
    }
    agent.lifecycle = nextLifecycle;
    const persistenceHandle =
      agent.session.describePersistence() ??
      (agent.runtimeInfo?.sessionId
        ? {
            provider: agent.runtimeInfo.provider,
            sessionId: agent.runtimeInfo.sessionId,
          }
        : null);
    if (persistenceHandle) {
      agent.persistence = this.options.attachPersistenceCwd(persistenceHandle, agent.cwd);
    }
    this.options.logger.trace(
      {
        agentId: agent.id,
        provider: agent.provider,
        sessionId: agent.persistence?.sessionId ?? undefined,
        turnId,
        lifecycle: agent.lifecycle,
        terminalError,
        pendingReplacement: agent.pendingReplacement,
      },
      "agent.manager.finalize",
    );
    if (!shouldHoldBusyForReplacement) {
      this.options.touchUpdatedAt(agent);
      this.options.emitState(agent);
    }
  }

  private async *forwardTurn(
    agent: ActiveManagedAgent,
    prompt: AgentPromptInput,
    runOptions: AgentRunOptions | undefined,
    pendingRun: PendingForegroundRun,
    lifecycleHooks?: ForegroundLifecycleHooks,
  ): AsyncGenerator<AgentStreamEvent> {
    const agentId = agent.id;
    let turnId: string;
    let turnStream: ReturnType<ForegroundRunState["createTurnStream"]> | null = null;
    try {
      const result = await agent.session.startTurn(prompt, runOptions);
      turnId = result.turnId;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Failed to start turn";
      await this.options.handleStreamEvent(agent, {
        type: "turn_failed",
        provider: agent.provider,
        error: errorMsg,
      });
      this.finalize(agent);
      this.options.foregroundRuns.settlePendingRun(agentId, pendingRun.token);
      lifecycleHooks?.onStartFailed(error);
      throw error;
    }

    pendingRun.started = true;
    agent.activeForegroundTurnId = turnId;
    agent.lifecycle = "running";
    this.options.touchUpdatedAt(agent);
    this.options.emitState(agent);
    lifecycleHooks?.onStarted();
    this.options.logger.trace(
      {
        agentId,
        provider: agent.provider,
        sessionId: agent.persistence?.sessionId ?? undefined,
        turnId,
        lifecycle: agent.lifecycle,
        activeForegroundTurnId: agent.activeForegroundTurnId,
      },
      "agent.manager.stream.start",
    );

    turnStream = this.options.foregroundRuns.createTurnStream(turnId);
    this.options.foregroundRuns.addWaiter(agent, turnStream.waiter);

    try {
      for await (const event of turnStream.events(this.options.isTerminalEvent)) {
        yield event;
      }
    } finally {
      if (turnStream) {
        this.options.foregroundRuns.deleteWaiter(agent, turnStream.waiter);
      }
      this.options.foregroundRuns.settlePendingRun(agentId, pendingRun.token);
      this.options.onAgentTerminal(agentId);
      if (!agent.activeForegroundTurnId) {
        await this.options.refreshRuntimeInfo(agent);
      }
    }
  }
}
