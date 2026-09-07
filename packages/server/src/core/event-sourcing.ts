/**
 * Event Sourcing Pattern - Simplified for ChisaCode
 *
 * Inspired by T3code's event-sourced orchestration.
 * Provides audit trail, time-travel debugging, and deterministic testing.
 *
 * Architecture:
 * 1. Commands (user intent) → Decider (pure function)
 * 2. Decider → Events (what happened)
 * 3. Events → Projector → Read Model (current state)
 * 4. Events stored in append-only log
 *
 * Benefits:
 * - Complete audit trail (GDPR/compliance)
 * - Time-travel debugging (replay any point)
 * - Deterministic tests (replay events)
 * - Easy to add new projections (analytics, reports)
 *
 * Usage:
 *
 * ```typescript
 * // Define events
 * type AgentEvent =
 *   | { type: 'agent_created'; id: string; config: AgentConfig }
 *   | { type: 'agent_started'; id: string; timestamp: number }
 *   | { type: 'agent_completed'; id: string; result: unknown }
 *
 * // Pure decider (command → events)
 * function decideAgentCommand(
 *   state: AgentState | null,
 *   command: AgentCommand
 * ): AgentEvent[] {
 *   if (command.type === 'create_agent') {
 *     return [{ type: 'agent_created', id: generateId(), config: command.config }]
 *   }
 *   // ...
 * }
 *
 * // Projector (events → state)
 * function projectAgentState(events: AgentEvent[]): AgentState {
 *   return events.reduce((state, event) => {
 *     if (event.type === 'agent_created') {
 *       return { ...state, id: event.id, status: 'idle' }
 *     }
 *     // ...
 *   }, initialState)
 * }
 *
 * // Usage
 * const events = decideAgentCommand(null, { type: 'create_agent', config })
 * await eventStore.append(events)
 * const state = projectAgentState(await eventStore.readAll())
 * ```
 */

/**
 * Rate Limiter - Token bucket algorithm for DoS protection
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly maxTokens: number = 1000,
    private readonly refillRate: number = 100, // tokens per second
  ) {
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }

  /**
   * Check if action is allowed (throws if rate limit exceeded)
   */
  async check(): Promise<void> {
    this.refill();

    if (this.tokens < 1) {
      throw new Error("Rate limit exceeded. Please try again later.");
    }

    this.tokens -= 1;
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refill(): void {
    const now = Date.now();
    const elapsedSeconds = (now - this.lastRefill) / 1000;
    const tokensToAdd = Math.floor(elapsedSeconds * this.refillRate);

    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }
  }

  /**
   * Get current token count (for monitoring)
   */
  getTokens(): number {
    this.refill();
    return this.tokens;
  }
}

/**
 * Event Store - Append-only event log
 */
export interface EventStore<TEvent> {
  /** Append events atomically */
  append(events: TEvent[]): Promise<void>;

  /** Read all events for an aggregate */
  readAll(aggregateId: string): Promise<TEvent[]>;

  /** Read events after a sequence number */
  readFrom(aggregateId: string, afterSeq: number): Promise<TEvent[]>;

  /** Get current sequence number */
  getSequence(aggregateId: string): Promise<number>;
}

/**
 * Simple file-based event store (compatible with ChisaCode's current JSON storage)
 */
export class FileEventStore<TEvent extends { type: string }> implements EventStore<TEvent> {
  private rateLimiter: RateLimiter;

  constructor(
    private baseDir: string,
    rateLimitOptions?: {
      maxTokens?: number;
      refillRate?: number;
    },
  ) {
    this.rateLimiter = new RateLimiter(
      rateLimitOptions?.maxTokens ?? 1000,
      rateLimitOptions?.refillRate ?? 100,
    );
  }

  async append(aggregateId: string, events: TEvent[]): Promise<void> {
    if (events.length === 0) return;

    // Rate limit check - prevents DoS attacks
    await this.rateLimiter.check();

    const eventFile = this.getEventFile(aggregateId);
    const existing = await this.readAll(aggregateId);
    const updated = [...existing, ...events];

    // Atomic write with temp file
    const tempFile = `${eventFile}.tmp`;
    await fs.promises.writeFile(tempFile, JSON.stringify(updated, null, 2));
    await fs.promises.rename(tempFile, eventFile);
  }

  async readAll(aggregateId: string): Promise<TEvent[]> {
    const eventFile = this.getEventFile(aggregateId);

    try {
      const content = await fs.promises.readFile(eventFile, "utf-8");
      return JSON.parse(content);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  async readFrom(aggregateId: string, afterSeq: number): Promise<TEvent[]> {
    const all = await this.readAll(aggregateId);
    return all.slice(afterSeq);
  }

  async getSequence(aggregateId: string): Promise<number> {
    const events = await this.readAll(aggregateId);
    return events.length;
  }

  private getEventFile(aggregateId: string): string {
    return path.join(this.baseDir, `${aggregateId}.events.json`);
  }
}

/**
 * Decider Pattern - Pure command → events transformation
 */
export type Decider<TCommand, TEvent, TState> = {
  /** Pure function: current state + command → events */
  decide(state: TState | null, command: TCommand): TEvent[];

  /** Pure function: events → state */
  evolve(state: TState | null, event: TEvent): TState;

  /** Initial state */
  initialState: TState;
};

/**
 * Event-Sourced Aggregate
 *
 * Handles command → event → state lifecycle with event store persistence.
 */
export class EventSourcedAggregate<TCommand, TEvent, TState> {
  constructor(
    private aggregateId: string,
    private decider: Decider<TCommand, TEvent, TState>,
    private eventStore: EventStore<TEvent>,
  ) {}

  /**
   * Execute a command (returns new events + updated state)
   */
  async execute(command: TCommand): Promise<{ events: TEvent[]; state: TState | null }> {
    // 1. Load current state from events
    const events = await this.eventStore.readAll(this.aggregateId);
    const currentState = this.rehydrate(events);

    // 2. Decide what events to produce (pure function)
    const newEvents = this.decider.decide(currentState, command);

    // 3. Append events to store
    await this.eventStore.append(this.aggregateId, newEvents);

    // 4. Apply events to get new state
    const newState = newEvents.reduce(
      (state, event) => this.decider.evolve(state, event),
      currentState,
    );

    return { events: newEvents, state: newState };
  }

  /**
   * Get current state by replaying all events
   */
  async getState(): Promise<TState | null> {
    const events = await this.eventStore.readAll(this.aggregateId);
    return this.rehydrate(events);
  }

  /**
   * Rehydrate state from events (pure)
   */
  private rehydrate(events: TEvent[]): TState | null {
    if (events.length === 0) {
      return null;
    }
    return events.reduce(
      (state, event) => this.decider.evolve(state, event),
      null as TState | null,
    ) as TState;
  }
}

/**
 * Example: Agent lifecycle with event sourcing
 */

// Events
type AgentEvent =
  | { type: "agent_created"; id: string; prompt: string; timestamp: number }
  | { type: "agent_started"; timestamp: number }
  | { type: "agent_output_received"; content: string; timestamp: number }
  | { type: "agent_completed"; result: string; timestamp: number }
  | { type: "agent_failed"; error: string; timestamp: number };

// Commands
type AgentCommand =
  | { type: "create_agent"; prompt: string }
  | { type: "start_agent" }
  | { type: "receive_output"; content: string }
  | { type: "complete_agent"; result: string }
  | { type: "fail_agent"; error: string };

// State
interface AgentState {
  id: string;
  status: "idle" | "running" | "completed" | "failed";
  prompt: string;
  output: string[];
  result?: string;
  error?: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
}

// Decider
export const agentDecider: Decider<AgentCommand, AgentEvent, AgentState> = {
  initialState: {
    id: "",
    status: "idle",
    prompt: "",
    output: [],
    createdAt: 0,
  },

  decide(state: AgentState | null, command: AgentCommand): AgentEvent[] {
    const now = Date.now();

    switch (command.type) {
      case "create_agent":
        return [
          {
            type: "agent_created",
            id: generateId(),
            prompt: command.prompt,
            timestamp: now,
          },
        ];

      case "start_agent":
        if (!state || state.status !== "idle") {
          return []; // Invalid transition
        }
        return [{ type: "agent_started", timestamp: now }];

      case "receive_output":
        if (!state || state.status !== "running") {
          return [];
        }
        return [{ type: "agent_output_received", content: command.content, timestamp: now }];

      case "complete_agent":
        if (!state || state.status !== "running") {
          return [];
        }
        return [{ type: "agent_completed", result: command.result, timestamp: now }];

      case "fail_agent":
        return [{ type: "agent_failed", error: command.error, timestamp: now }];

      default:
        return [];
    }
  },

  evolve(state: AgentState | null, event: AgentEvent): AgentState {
    if (!state) {
      state = { ...agentDecider.initialState };
    }

    switch (event.type) {
      case "agent_created":
        return {
          ...state,
          id: event.id,
          prompt: event.prompt,
          status: "idle",
          createdAt: event.timestamp,
        };

      case "agent_started":
        return {
          ...state,
          status: "running",
          startedAt: event.timestamp,
        };

      case "agent_output_received":
        return {
          ...state,
          output: [...state.output, event.content],
        };

      case "agent_completed":
        return {
          ...state,
          status: "completed",
          result: event.result,
          completedAt: event.timestamp,
        };

      case "agent_failed":
        return {
          ...state,
          status: "failed",
          error: event.error,
          completedAt: event.timestamp,
        };

      default:
        return state;
    }
  },
};

function generateId(): string {
  return `agent-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Node.js imports (for file store)
import fs from "node:fs";
import path from "node:path";
