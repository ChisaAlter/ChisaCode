/**
 * Event Sourcing Tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  EventSourcedAggregate,
  FileEventStore,
  agentDecider,
  type AgentEvent,
  type AgentCommand,
  type AgentState,
} from "./event-sourcing";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

describe("Event Sourcing", () => {
  let tempDir: string;
  let eventStore: FileEventStore<AgentEvent>;

  beforeEach(async () => {
    // Create temp directory for tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "chisacode-test-"));
    eventStore = new FileEventStore<AgentEvent>(tempDir, {
      maxTokens: 1000,
      refillRate: 100,
    });
  });

  describe("FileEventStore", () => {
    it("should append and read events", async () => {
      const events: AgentEvent[] = [
        { type: "agent_created", id: "test-1", prompt: "test", timestamp: Date.now() },
        { type: "agent_started", timestamp: Date.now() },
      ];

      await eventStore.append("test-1", events);
      const read = await eventStore.readAll("test-1");

      expect(read).toEqual(events);
    });

    it("should return empty array for non-existent aggregate", async () => {
      const events = await eventStore.readAll("nonexistent");
      expect(events).toEqual([]);
    });

    it("should get correct sequence number", async () => {
      const events: AgentEvent[] = [
        { type: "agent_created", id: "test-1", prompt: "test", timestamp: Date.now() },
        { type: "agent_started", timestamp: Date.now() },
      ];

      await eventStore.append("test-1", events);
      const seq = await eventStore.getSequence("test-1");

      expect(seq).toBe(2);
    });

    it("should read events from sequence", async () => {
      const events: AgentEvent[] = [
        { type: "agent_created", id: "test-1", prompt: "test", timestamp: Date.now() },
        { type: "agent_started", timestamp: Date.now() },
        { type: "agent_completed", result: "done", timestamp: Date.now() },
      ];

      await eventStore.append("test-1", events);
      const fromSeq = await eventStore.readFrom("test-1", 1);

      expect(fromSeq).toHaveLength(2);
      expect(fromSeq[0].type).toBe("agent_started");
    });
  });

  describe("AgentDecider", () => {
    it("should decide create_agent command", () => {
      const command: AgentCommand = { type: "create_agent", prompt: "test prompt" };
      const events = agentDecider.decide(null, command);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("agent_created");
      expect((events[0] as any).prompt).toBe("test prompt");
    });

    it("should decide start_agent only when idle", () => {
      const idleState: AgentState = {
        id: "test-1",
        status: "idle",
        prompt: "test",
        output: [],
        createdAt: Date.now(),
      };

      const events = agentDecider.decide(idleState, { type: "start_agent" });
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("agent_started");
    });

    it("should not start agent when already running", () => {
      const runningState: AgentState = {
        id: "test-1",
        status: "running",
        prompt: "test",
        output: [],
        createdAt: Date.now(),
      };

      const events = agentDecider.decide(runningState, { type: "start_agent" });
      expect(events).toHaveLength(0); // Invalid transition
    });

    it("should evolve state from events", () => {
      let state = agentDecider.initialState;

      // Apply agent_created
      const event1: AgentEvent = {
        type: "agent_created",
        id: "test-1",
        prompt: "test",
        timestamp: 1000,
      };
      state = agentDecider.evolve(state, event1);

      expect(state.id).toBe("test-1");
      expect(state.status).toBe("idle");
      expect(state.prompt).toBe("test");

      // Apply agent_started
      const event2: AgentEvent = { type: "agent_started", timestamp: 2000 };
      state = agentDecider.evolve(state, event2);

      expect(state.status).toBe("running");
      expect(state.startedAt).toBe(2000);

      // Apply agent_output_received
      const event3: AgentEvent = {
        type: "agent_output_received",
        content: "output 1",
        timestamp: 3000,
      };
      state = agentDecider.evolve(state, event3);

      expect(state.output).toEqual(["output 1"]);

      // Apply agent_completed
      const event4: AgentEvent = {
        type: "agent_completed",
        result: "done",
        timestamp: 4000,
      };
      state = agentDecider.evolve(state, event4);

      expect(state.status).toBe("completed");
      expect(state.result).toBe("done");
      expect(state.completedAt).toBe(4000);
    });
  });

  describe("EventSourcedAggregate", () => {
    it("should execute commands and persist events", async () => {
      const aggregate = new EventSourcedAggregate("test-agent", agentDecider, eventStore);

      // Create agent
      const { events, state } = await aggregate.execute({
        type: "create_agent",
        prompt: "test prompt",
      });

      expect(events).toHaveLength(1);
      expect(state.status).toBe("idle");
      expect(state.prompt).toBe("test prompt");

      // Verify events persisted
      const persisted = await eventStore.readAll("test-agent");
      expect(persisted).toHaveLength(1);
    });

    it("should maintain state across commands", async () => {
      const aggregate = new EventSourcedAggregate("test-agent", agentDecider, eventStore);

      // Create
      await aggregate.execute({ type: "create_agent", prompt: "test" });

      // Start
      const { state: state2 } = await aggregate.execute({ type: "start_agent" });
      expect(state2.status).toBe("running");

      // Output
      await aggregate.execute({ type: "receive_output", content: "line 1" });
      await aggregate.execute({ type: "receive_output", content: "line 2" });

      // Complete
      const { state: finalState } = await aggregate.execute({
        type: "complete_agent",
        result: "success",
      });

      expect(finalState.status).toBe("completed");
      expect(finalState.output).toEqual(["line 1", "line 2"]);
      expect(finalState.result).toBe("success");
    });

    it("should rehydrate state from events", async () => {
      const aggregate = new EventSourcedAggregate("test-agent", agentDecider, eventStore);

      // Execute commands
      await aggregate.execute({ type: "create_agent", prompt: "test" });
      await aggregate.execute({ type: "start_agent" });
      await aggregate.execute({ type: "receive_output", content: "output" });

      // Get state (should replay events)
      const state = await aggregate.getState();

      expect(state.status).toBe("running");
      expect(state.output).toEqual(["output"]);
    });

    it("should enforce valid state transitions", async () => {
      const aggregate = new EventSourcedAggregate("test-agent", agentDecider, eventStore);

      // Try to start before creating (should produce no events)
      const { events } = await aggregate.execute({ type: "start_agent" });
      expect(events).toHaveLength(0);

      // Create first
      await aggregate.execute({ type: "create_agent", prompt: "test" });

      // Now start works
      const { events: events2 } = await aggregate.execute({ type: "start_agent" });
      expect(events2).toHaveLength(1);
    });
  });

  describe("RateLimiter", () => {
    it("should prevent DoS attacks by rate limiting", async () => {
      const limiter = new FileEventStore<AgentEvent>(tempDir, {
        maxTokens: 5,
        refillRate: 0, // No refill for testing
      });

      const events: AgentEvent[] = [
        { type: "agent_created", id: "test-1", prompt: "test", timestamp: Date.now() },
      ];

      // First 5 should succeed
      for (let i = 0; i < 5; i++) {
        await expect(limiter.append(`test-${i}`, events)).resolves.toBeUndefined();
      }

      // 6th should fail
      await expect(limiter.append("test-6", events)).rejects.toThrow("Rate limit exceeded");
    });

    it("should refill tokens over time", async () => {
      const limiter = new FileEventStore<AgentEvent>(tempDir, {
        maxTokens: 2,
        refillRate: 100, // 100 tokens per second
      });

      const events: AgentEvent[] = [
        { type: "agent_created", id: "test-1", prompt: "test", timestamp: Date.now() },
      ];

      // Consume both tokens
      await limiter.append("test-1", events);
      await limiter.append("test-2", events);

      // Should be rate limited now
      await expect(limiter.append("test-3", events)).rejects.toThrow("Rate limit exceeded");

      // Wait for refill (50ms = 5 tokens at 100/sec rate)
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should succeed after refill
      await expect(limiter.append("test-4", events)).resolves.toBeUndefined();
    });
  });

  describe("Time-travel debugging", () => {
    it("should replay state at any point in time", async () => {
      const aggregate = new EventSourcedAggregate("test-agent", agentDecider, eventStore);

      // Execute full lifecycle
      await aggregate.execute({ type: "create_agent", prompt: "test" });
      await aggregate.execute({ type: "start_agent" });
      await aggregate.execute({ type: "receive_output", content: "line 1" });
      await aggregate.execute({ type: "receive_output", content: "line 2" });
      await aggregate.execute({ type: "complete_agent", result: "done" });

      // Get all events
      const allEvents = await eventStore.readAll("test-agent");
      expect(allEvents).toHaveLength(5);

      // Replay to different points
      const stateAfterCreate = [allEvents[0]].reduce(
        (s, e) => agentDecider.evolve(s, e),
        agentDecider.initialState,
      );
      expect(stateAfterCreate.status).toBe("idle");

      const stateAfterStart = allEvents
        .slice(0, 2)
        .reduce((s, e) => agentDecider.evolve(s, e), agentDecider.initialState);
      expect(stateAfterStart.status).toBe("running");

      const stateAfterFirstOutput = allEvents
        .slice(0, 3)
        .reduce((s, e) => agentDecider.evolve(s, e), agentDecider.initialState);
      expect(stateAfterFirstOutput.output).toEqual(["line 1"]);

      const finalState = allEvents.reduce(
        (s, e) => agentDecider.evolve(s, e),
        agentDecider.initialState,
      );
      expect(finalState.status).toBe("completed");
      expect(finalState.output).toEqual(["line 1", "line 2"]);
    });
  });
});
