/** Validated generative UI action accepted by the manager-owned queue. */
export interface GenerativeUiQueuedAction {
  instanceId: string;
  action: string;
  payload: unknown;
  timestamp: number;
}

type AgentStatus = "initializing" | "idle" | "running" | "error" | "closed" | string;

interface QueueLogMetadata {
  agentId: string;
  actionCount: number;
  batchCount: number;
  reason: "agent_unavailable" | "dispatch_failed";
}

interface GenerativeUiActionQueueOptions {
  getAgentStatus: (agentId: string) => AgentStatus | undefined;
  dispatchPrompt: (agentId: string, prompt: string) => Promise<void>;
  log: (metadata: QueueLogMetadata) => void;
}

interface ActionBatch {
  actions: GenerativeUiQueuedAction[];
  changeIndexes: Map<string, number>;
  closed: boolean;
}

interface AgentQueueState {
  batches: ActionBatch[];
  scheduled: boolean;
  dispatching: boolean;
}

function isUnavailableStatus(status: AgentStatus | undefined): boolean {
  return status === undefined || status === "closed" || status === "error";
}
function createBatch(): ActionBatch {
  return { actions: [], changeIndexes: new Map(), closed: false };
}

function changeKey(action: GenerativeUiQueuedAction): string | null {
  if (action.action !== "change" || typeof action.payload !== "object" || action.payload === null) {
    return null;
  }
  const field = (action.payload as Record<string, unknown>).field;
  return typeof field === "string" ? `${action.instanceId}\u0000${field}` : null;
}

function appendAction(batch: ActionBatch, action: GenerativeUiQueuedAction): void {
  const key = changeKey(action);
  if (key !== null) {
    const existingIndex = batch.changeIndexes.get(key);
    if (existingIndex !== undefined) {
      batch.actions[existingIndex] = action;
      return;
    }
    batch.changeIndexes.set(key, batch.actions.length);
  }
  batch.actions.push(action);
  if (action.action === "submit") {
    batch.closed = true;
  }
}

function formatPrompt(actions: readonly GenerativeUiQueuedAction[]): string {
  return [
    "User interacted with generative UI components.",
    `Actions: ${JSON.stringify(actions)}`,
  ].join("\n");
}

/**
 * Coalesces generative UI actions per agent without interrupting active turns.
 * Failed batches are dropped after one start attempt; later batches continue independently.
 */
export class GenerativeUiActionQueue {
  private readonly states = new Map<string, AgentQueueState>();

  constructor(private readonly options: GenerativeUiActionQueueOptions) {}

  enqueue(agentId: string, action: GenerativeUiQueuedAction): void {
    const state = this.states.get(agentId) ?? { batches: [], scheduled: false, dispatching: false };
    let batch = state.batches.at(-1);
    if (!batch || batch.closed) {
      batch = createBatch();
      state.batches.push(batch);
    }
    appendAction(batch, action);
    this.states.set(agentId, state);
    this.scheduleIfIdle(agentId, state);
  }

  onAgentTerminal(agentId: string): void {
    const state = this.states.get(agentId);
    if (state) this.scheduleIfIdle(agentId, state);
  }

  clearAgent(agentId: string): void {
    const state = this.states.get(agentId);
    if (state) this.dropAll(agentId, state, "agent_unavailable");
  }

  hasPending(agentId: string): boolean {
    return (this.states.get(agentId)?.batches.length ?? 0) > 0;
  }

  private scheduleIfIdle(agentId: string, state: AgentQueueState): void {
    if (state.scheduled || state.dispatching || state.batches.length === 0) return;
    const status = this.options.getAgentStatus(agentId);
    if (status !== "idle" && !isUnavailableStatus(status)) return;
    state.scheduled = true;
    queueMicrotask(() => {
      state.scheduled = false;
      void this.dispatchNext(agentId, state);
    });
  }

  private async dispatchNext(agentId: string, state: AgentQueueState): Promise<void> {
    if (this.states.get(agentId) !== state || state.dispatching) return;
    const status = this.options.getAgentStatus(agentId);
    if (status !== "idle") {
      if (isUnavailableStatus(status)) this.dropAll(agentId, state, "agent_unavailable");
      return;
    }
    const batch = state.batches.shift();
    if (!batch) {
      this.states.delete(agentId);
      return;
    }
    state.dispatching = true;
    try {
      await this.options.dispatchPrompt(agentId, formatPrompt(batch.actions));
    } catch {
      this.options.log({
        agentId,
        actionCount: batch.actions.length,
        batchCount: state.batches.length + 1,
        reason: "dispatch_failed",
      });
    } finally {
      state.dispatching = false;
    }
    if (state.batches.length === 0) {
      this.states.delete(agentId);
      return;
    }
    const nextStatus = this.options.getAgentStatus(agentId);
    if (isUnavailableStatus(nextStatus)) {
      this.dropAll(agentId, state, "agent_unavailable");
      return;
    }
    this.scheduleIfIdle(agentId, state);
  }

  private dropAll(agentId: string, state: AgentQueueState, reason: "agent_unavailable"): void {
    const actionCount = state.batches.reduce((count, batch) => count + batch.actions.length, 0);
    this.states.delete(agentId);
    this.options.log({ agentId, actionCount, batchCount: state.batches.length, reason });
  }
}
