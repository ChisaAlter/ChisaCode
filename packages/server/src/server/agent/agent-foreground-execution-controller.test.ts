import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pino } from "pino";

import type { AgentStreamEvent } from "./agent-sdk-types.js";
import type { ManagedAgent } from "./agent-manager.js";
import { ForegroundRunState } from "./foreground-run-state.js";
import { AgentForegroundExecutionController } from "./agent-foreground-execution-controller.js";

type ActiveManagedAgent = Exclude<ManagedAgent, { lifecycle: "closed" }>;

const PROVIDER = "claude-code" as const;

function buildFakeAgent(overrides?: Partial<ActiveManagedAgent>): ActiveManagedAgent {
  return {
    id: "agent-1",
    provider: PROVIDER,
    cwd: "/tmp/work",
    capabilities: { streaming: true },
    config: { model: "default" },
    createdAt: new Date(),
    updatedAt: new Date(),
    availableModes: ["default"],
    currentModeId: null,
    pendingPermissions: new Map(),
    bufferedPermissionResolutions: new Map(),
    inFlightPermissionResponses: new Set(),
    pendingReplacement: false,
    persistence: null,
    historyPrimed: false,
    lastUserMessageAt: null,
    attention: { kind: "none" },
    foregroundTurnWaiters: new Set(),
    finalizedForegroundTurnIds: new Set(),
    unsubscribeSession: null,
    labels: {},
    currentTurnToolCallCount: 0,
    lifecycle: "idle",
    activeForegroundTurnId: null,
    session: {
      startTurn: async () => ({ turnId: "turn-1" }),
    },
    ...overrides,
  } as unknown as ActiveManagedAgent;
}

interface Harness {
  controller: AgentForegroundExecutionController;
  agent: ActiveManagedAgent;
  foregroundRuns: ForegroundRunState;
  cancelRun: ReturnType<typeof vi.fn>;
  handledEvents: AgentStreamEvent[];
  terminalEvents: AgentStreamEvent[];
  agentTerminals: string[];
}

function buildHarness(timeoutMs: number): Harness {
  const agent = buildFakeAgent();
  const foregroundRuns = new ForegroundRunState();
  const cancelRun = vi.fn(async () => true);
  const handledEvents: AgentStreamEvent[] = [];
  const terminalEvents: AgentStreamEvent[] = [];
  const agentTerminals: string[] = [];

  const controller = new AgentForegroundExecutionController({
    attachPersistenceCwd: (handle) => handle,
    cancelRun,
    emitState: () => {},
    foregroundRuns,
    getAgent: () => agent,
    handleStreamEvent: async (_agent, event) => {
      handledEvents.push(event);
      // Emulate the pipeline's terminal handling: finalize the turn so the
      // activeForegroundTurnId clears like the real finalizeForeground does.
      if (event.type === "turn_failed" || event.type === "turn_canceled") {
        agent.activeForegroundTurnId = null;
        agent.lifecycle = "error";
      }
    },
    inactivityTimeoutMs: timeoutMs,
    isTerminalEvent: (event) =>
      event.type === "turn_completed" ||
      event.type === "turn_failed" ||
      event.type === "turn_canceled",
    logger: pino({ level: "silent" }),
    onAgentTerminal: (agentId) => agentTerminals.push(agentId),
    refreshRuntimeInfo: async () => {},
    touchUpdatedAt: () => new Date(),
  });
  return {
    controller,
    agent,
    foregroundRuns,
    cancelRun,
    handledEvents,
    terminalEvents,
    agentTerminals,
  };
}

/** Pushes an event into the turn stream the way the pipeline's notifyWaiters would. */
function pushTurnEvent(harness: Harness, event: AgentStreamEvent): void {
  const waiter = harness.agent.foregroundTurnWaiters.values().next().value;
  expect(waiter).toBeDefined();
  harness.foregroundRuns.notifyWaiters([waiter], event, {
    terminal:
      event.type === "turn_completed" ||
      event.type === "turn_failed" ||
      event.type === "turn_canceled",
  });
}

async function collect(harness: Harness): Promise<AgentStreamEvent[]> {
  const events: AgentStreamEvent[] = [];
  for await (const event of harness.controller.stream(harness.agent.id, "hello")) {
    events.push(event);
  }
  return events;
}

describe("AgentForegroundExecutionController inactivity watchdog", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("cancels the run when no stream events arrive within the inactivity window", async () => {
    const harness = buildHarness(50);

    const consuming = collect(harness);
    await vi.advanceTimersByTimeAsync(60);

    // The watchdog fired and routed cancellation through run control (the
    // provider turn is actually interrupted — the old code never did this).
    expect(harness.cancelRun).toHaveBeenCalledWith("agent-1");

    // With cancellation resolving, the turn stream stays open until a terminal
    // event arrives (in production, run-control force-dispatches one).
    // Verify no direct no-turnId turn_failed injection happened: the fix must
    // not bypass the pipeline.
    expect(harness.handledEvents).toHaveLength(0);

    // Emulate run-control's force-cancel dispatch (turn_canceled with turnId).
    pushTurnEvent(harness, {
      type: "turn_canceled",
      provider: PROVIDER,
      reason: "interrupted",
      turnId: "turn-1",
    });
    const events = await consuming;
    expect(events.map((event) => event.type)).toEqual(["turn_canceled"]);
    expect(harness.agentTerminals).toEqual(["agent-1"]);
  });

  it("falls back to a turnId-bearing turn_failed when cancellation itself fails", async () => {
    const harness = buildHarness(50);
    harness.cancelRun.mockRejectedValueOnce(new Error("interrupt failed"));

    const consuming = collect(harness);
    await vi.advanceTimersByTimeAsync(60);

    expect(harness.cancelRun).toHaveBeenCalledWith("agent-1");
    // Fallback injects turn_failed WITH the turnId through the pipeline so
    // finalizeForeground can clear activeForegroundTurnId (the old code
    // omitted the turnId and permanently stuck the agent "running").
    expect(harness.handledEvents).toEqual([
      expect.objectContaining({ type: "turn_failed", turnId: "turn-1" }),
    ]);
    expect(harness.agent.activeForegroundTurnId).toBeNull();

    const events = await consuming;
    expect(events.map((event) => event.type)).toEqual(["turn_failed"]);
  });

  it("does not fire while the turn is waiting on the user (permission_requested)", async () => {
    const harness = buildHarness(50);

    const consuming = collect(harness);
    await vi.advanceTimersByTimeAsync(10);
    pushTurnEvent(harness, { type: "permission_requested", provider: PROVIDER });
    // Long user deliberation: well past the inactivity window.
    await vi.advanceTimersByTimeAsync(200);
    expect(harness.cancelRun).not.toHaveBeenCalled();

    pushTurnEvent(harness, { type: "permission_resolved", provider: PROVIDER });
    pushTurnEvent(harness, {
      type: "turn_completed",
      provider: PROVIDER,
      turnId: "turn-1",
    });
    const events = await consuming;
    expect(events.map((event) => event.type)).toEqual([
      "permission_requested",
      "permission_resolved",
      "turn_completed",
    ]);
    expect(harness.cancelRun).not.toHaveBeenCalled();
  });

  it("re-arms on regular stream activity so slow-but-alive turns are not killed", async () => {
    const harness = buildHarness(50);

    const consuming = collect(harness);
    for (let i = 0; i < 6; i += 1) {
      await vi.advanceTimersByTimeAsync(30);
      pushTurnEvent(harness, { type: "text", text: `chunk-${i}` });
    }
    expect(harness.cancelRun).not.toHaveBeenCalled();

    pushTurnEvent(harness, { type: "turn_completed", provider: PROVIDER, turnId: "turn-1" });
    const events = await consuming;
    expect(events.some((event) => event.type === "text")).toBe(true);
    expect(harness.cancelRun).not.toHaveBeenCalled();
  });
});
