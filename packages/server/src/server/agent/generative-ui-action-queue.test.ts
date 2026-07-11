import { describe, expect, it } from "vitest";
import {
  GenerativeUiActionQueue,
  type GenerativeUiQueuedAction,
} from "./generative-ui-action-queue.js";

function action(
  actionName: string,
  payload: unknown,
  instanceId = "form-1",
): GenerativeUiQueuedAction {
  return { instanceId, action: actionName, payload, timestamp: 1_750_000_000_000 };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("GenerativeUiActionQueue", () => {
  it("coalesces same-tick idle changes and dispatches on the next microtask", async () => {
    const prompts: string[] = [];
    const queue = new GenerativeUiActionQueue({
      getAgentStatus: () => "idle",
      dispatchPrompt: async (_agentId, prompt) => prompts.push(prompt),
      log: () => undefined,
    });
    queue.enqueue("agent-1", action("change", { field: "name", value: "first" }));
    queue.enqueue("agent-1", action("change", { field: "email", value: "a@example.com" }));
    queue.enqueue("agent-1", action("change", { field: "name", value: "latest" }));
    expect(prompts).toEqual([]);
    await flushMicrotasks();
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain('"field":"name","value":"latest"');
    expect(prompts[0]).not.toContain('"value":"first"');
    expect(prompts[0]?.indexOf('"field":"name"')).toBeLessThan(
      prompts[0]?.indexOf('"field":"email"') ?? -1,
    );
  });

  it("waits for a running agent terminal event and ignores duplicate terminal notifications", async () => {
    let status = "running";
    const prompts: string[] = [];
    const queue = new GenerativeUiActionQueue({
      getAgentStatus: () => status,
      dispatchPrompt: async (_agentId, prompt) => prompts.push(prompt),
      log: () => undefined,
    });
    queue.enqueue("agent-1", action("change", { field: "name", value: "Ada" }));
    await flushMicrotasks();
    expect(prompts).toEqual([]);
    status = "idle";
    queue.onAgentTerminal("agent-1");
    queue.onAgentTerminal("agent-1");
    await flushMicrotasks();
    expect(prompts).toHaveLength(1);
  });

  it("keeps submit after preceding changes and moves later actions into the next batch", async () => {
    let status = "idle";
    const prompts: string[] = [];
    const queue = new GenerativeUiActionQueue({
      getAgentStatus: () => status,
      dispatchPrompt: async (_agentId, prompt) => {
        prompts.push(prompt);
        status = "running";
      },
      log: () => undefined,
    });
    queue.enqueue("agent-1", action("change", { field: "name", value: "Ada" }));
    queue.enqueue("agent-1", action("submit", { values: { name: "Ada" } }));
    queue.enqueue("agent-1", action("change", { field: "name", value: "Grace" }));
    await flushMicrotasks();
    expect(prompts).toHaveLength(1);
    expect(prompts[0]?.indexOf('"action":"change"')).toBeLessThan(
      prompts[0]?.indexOf('"action":"submit"') ?? -1,
    );
    expect(prompts[0]).not.toContain("Grace");
    status = "idle";
    queue.onAgentTerminal("agent-1");
    await flushMicrotasks();
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("Grace");
  });

  it("drops failed batches once and reports bounded metadata", async () => {
    const logs: Array<Record<string, unknown>> = [];
    const queue = new GenerativeUiActionQueue({
      getAgentStatus: () => "idle",
      dispatchPrompt: async () => {
        throw new Error("provider included secret payload");
      },
      log: (metadata) => logs.push(metadata),
    });
    queue.enqueue("agent-1", action("submit", { secret: "do-not-log" }));
    await flushMicrotasks();
    expect(logs).toEqual([
      expect.objectContaining({ agentId: "agent-1", actionCount: 1, reason: "dispatch_failed" }),
    ]);
    expect(JSON.stringify(logs)).not.toContain("do-not-log");
    expect(queue.hasPending("agent-1")).toBe(false);
  });

  it("does not retry a failed batch and continues a later idle batch", async () => {
    let attempts = 0;
    const prompts: string[] = [];
    const queue = new GenerativeUiActionQueue({
      getAgentStatus: () => "idle",
      dispatchPrompt: async (_agentId, prompt) => {
        attempts += 1;
        if (attempts === 1) throw new Error("first batch failed");
        prompts.push(prompt);
      },
      log: () => undefined,
    });
    queue.enqueue("agent-1", action("submit", { values: { name: "Ada" } }));
    queue.enqueue("agent-1", action("change", { field: "name", value: "Grace" }));
    await flushMicrotasks();
    await flushMicrotasks();
    expect(attempts).toBe(2);
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("Grace");
  });
  it("clears queued state once when a terminal event leaves the agent in error", async () => {
    const logs: Array<Record<string, unknown>> = [];
    const queue = new GenerativeUiActionQueue({
      getAgentStatus: () => "error",
      dispatchPrompt: async () => {
        throw new Error("must not dispatch");
      },
      log: (metadata) => logs.push(metadata),
    });

    queue.enqueue("agent-1", action("submit", { secret: "do-not-log" }));
    queue.onAgentTerminal("agent-1");
    queue.onAgentTerminal("agent-1");
    await flushMicrotasks();

    expect(queue.hasPending("agent-1")).toBe(false);
    expect(logs).toEqual([
      expect.objectContaining({ agentId: "agent-1", actionCount: 1, reason: "agent_unavailable" }),
    ]);
    expect(JSON.stringify(logs)).not.toContain("do-not-log");
  });
  it("clears queued state when the agent is removed before dispatch", async () => {
    const logs: Array<Record<string, unknown>> = [];
    const queue = new GenerativeUiActionQueue({
      getAgentStatus: () => undefined,
      dispatchPrompt: async () => {
        throw new Error("must not dispatch");
      },
      log: (metadata) => logs.push(metadata),
    });
    queue.enqueue("agent-1", action("change", { field: "name", value: "Ada" }));
    await flushMicrotasks();
    expect(queue.hasPending("agent-1")).toBe(false);
    expect(logs).toEqual([
      expect.objectContaining({ agentId: "agent-1", actionCount: 1, reason: "agent_unavailable" }),
    ]);
  });
});
