import { describe, expect, it } from "vitest";
import type { StreamItem } from "@/types/stream";
import { buildAgentStreamRenderModel, collapseCompletedTurnThoughtsForDisplay } from "./model";

function createTimestamp(seed: number): Date {
  return new Date(`2026-01-01T00:00:${seed.toString().padStart(2, "0")}.000Z`);
}

function userMessage(id: string, seed: number): StreamItem {
  return {
    kind: "user_message",
    id,
    text: id,
    timestamp: createTimestamp(seed),
  };
}

function assistantMessage(id: string, seed: number): StreamItem {
  return {
    kind: "assistant_message",
    id,
    text: id,
    timestamp: createTimestamp(seed),
  };
}

function thoughtMessage(id: string, seed: number, text = id): StreamItem {
  return {
    kind: "thought",
    id,
    text,
    status: "ready",
    timestamp: createTimestamp(seed),
  };
}

function toolCall(id: string, seed: number): StreamItem {
  return {
    kind: "tool_call",
    id,
    timestamp: createTimestamp(seed),
    payload: {
      source: "orchestrator",
      data: {
        toolCallId: id,
        toolName: "Shell",
        arguments: "pwd",
        result: null,
        status: "completed",
      },
    },
  };
}

describe("buildAgentStreamRenderModel", () => {
  it("keeps head separate from committed history on desktop web", () => {
    const tail: StreamItem[] = [];
    for (let index = 0; index < 60; index += 1) {
      const seed = index * 2;
      tail.push(userMessage(`u${index}`, seed + 1));
      tail.push(assistantMessage(`a${index}`, seed + 2));
    }
    const head = [assistantMessage("live-a", 121)];

    const model = buildAgentStreamRenderModel({
      agentStatus: "running",
      tail,
      head,
      platform: "web",
      isMobileBreakpoint: false,
    });

    expect(model.segments.historyVirtualized.length).toBeGreaterThan(0);
    expect(model.segments.historyMounted.length).toBeGreaterThan(0);
    expect(model.segments.liveHead.map((item) => item.id)).toEqual(["live-a"]);
    expect(model.history).not.toContain(head[0]);
  });

  it("keeps the full committed tail mounted on mobile web", () => {
    const tail = [userMessage("u1", 1), assistantMessage("a1", 2)];
    const head = [assistantMessage("live-a", 3)];

    const model = buildAgentStreamRenderModel({
      agentStatus: "running",
      tail,
      head,
      platform: "web",
      isMobileBreakpoint: true,
    });

    expect(model.segments.historyVirtualized).toHaveLength(0);
    expect(model.segments.historyMounted).toBe(tail);
    expect(model.segments.liveHead).toBe(head);
  });

  it("reuses ordered committed history when only the live head changes", () => {
    const tail = [userMessage("u1", 1), assistantMessage("a1", 2)];
    const firstHead = [assistantMessage("live-a", 3)];
    const secondHead = [assistantMessage("live-b", 4)];

    const first = buildAgentStreamRenderModel({
      agentStatus: "running",
      tail,
      head: firstHead,
      platform: "native",
      isMobileBreakpoint: false,
    });
    const second = buildAgentStreamRenderModel({
      agentStatus: "running",
      tail,
      head: secondHead,
      platform: "native",
      isMobileBreakpoint: false,
    });

    expect(first.history).toBe(second.history);
    expect(first.segments.historyMounted).toBe(second.segments.historyMounted);
    expect(second.segments.liveHead.map((item) => item.id)).toEqual(["live-b"]);
  });

  it("derives running turn timing across committed history and live head", () => {
    const tail = [userMessage("u1", 1)];
    const head = [assistantMessage("live-a", 4)];

    const model = buildAgentStreamRenderModel({
      agentStatus: "running",
      tail,
      head,
      platform: "web",
      isMobileBreakpoint: false,
    });

    expect(model.turnTiming.runningStartedAt).toBe(tail[0]?.timestamp);
    expect(model.turnTiming.byAssistantId.has("live-a")).toBe(false);
  });

  it("maps completed turn timing to assistant ids across committed history and live head", () => {
    const tail = [userMessage("u1", 1)];
    const head = [assistantMessage("live-a", 4)];

    const model = buildAgentStreamRenderModel({
      agentStatus: "idle",
      tail,
      head,
      platform: "web",
      isMobileBreakpoint: false,
    });

    expect(model.turnTiming.runningStartedAt).toBe(null);
    expect(model.turnTiming.byAssistantId.get("live-a")).toEqual({
      startedAt: tail[0]?.timestamp,
      completedAt: head[0]?.timestamp,
      durationMs: 3000,
    });
  });

  it("derives the same timing for native inverted rendering", () => {
    const tail = [userMessage("u1", 1), assistantMessage("a1", 4)];

    const model = buildAgentStreamRenderModel({
      agentStatus: "idle",
      tail,
      head: [],
      platform: "native",
      isMobileBreakpoint: false,
    });

    expect(model.segments.historyMounted.map((item) => item.id)).toEqual(["a1", "u1"]);
    expect(model.turnTiming.byAssistantId.get("a1")).toEqual({
      startedAt: tail[0]?.timestamp,
      completedAt: tail[1]?.timestamp,
      durationMs: 3000,
    });
  });

  it("does not create completed timing for adjacent user messages", () => {
    const tail = [userMessage("u1", 1), userMessage("u2", 4)];

    const model = buildAgentStreamRenderModel({
      agentStatus: "idle",
      tail,
      head: [],
      platform: "web",
      isMobileBreakpoint: false,
    });

    expect(model.turnTiming.byAssistantId.size).toBe(0);
  });
});

describe("collapseCompletedTurnThoughtsForDisplay", () => {
  it("moves all completed thoughts in a turn after the formal assistant answer", () => {
    const items = [
      userMessage("u1", 1),
      thoughtMessage("t1", 2, "Inspect project"),
      toolCall("tool-1", 3),
      thoughtMessage("t2", 4, "Compare files"),
      assistantMessage("a1", 5),
    ];

    const result = collapseCompletedTurnThoughtsForDisplay(items, { isRunning: false });

    expect(result.map((item) => item.kind)).toEqual([
      "user_message",
      "tool_call",
      "assistant_message",
      "thought",
    ]);
    const summary = result.at(-1);
    expect(summary).toMatchObject({
      kind: "thought",
      text: "Inspect project\n\nCompare files",
      status: "ready",
      isCollapsedSummary: true,
      summaryForAssistantMessageId: "a1",
    });
  });

  it("keeps tool calls in place when collapsing completed thoughts", () => {
    const items = [
      userMessage("u1", 1),
      thoughtMessage("t1", 2),
      toolCall("tool-1", 3),
      assistantMessage("a1", 4),
    ];

    const result = collapseCompletedTurnThoughtsForDisplay(items, { isRunning: false });

    expect(result.map((item) => item.id)).toEqual(["u1", "tool-1", "a1", "thought-summary:a1"]);
  });

  it("does not move active running thoughts before the formal answer exists", () => {
    const items = [userMessage("u1", 1), thoughtMessage("t1", 2), toolCall("tool-1", 3)];

    const result = collapseCompletedTurnThoughtsForDisplay(items, { isRunning: true });

    expect(result).toBe(items);
  });

  it("collapses completed thoughts across the history and live-head boundary", () => {
    const thought = thoughtMessage("t1", 2, "Inspect project");
    const assistant = assistantMessage("a1", 3);
    const model = buildAgentStreamRenderModel({
      agentStatus: "idle",
      tail: [userMessage("u1", 1), thought],
      head: [assistant],
      platform: "web",
      isMobileBreakpoint: false,
    });

    expect(model.segments.historyMounted.map((item) => item.id)).toEqual(["u1"]);
    expect(model.segments.liveHead.map((item) => item.id)).toEqual(["a1", "thought-summary:a1"]);
    expect(model.segments.liveHead.at(-1)).toMatchObject({
      kind: "thought",
      text: "Inspect project",
      isCollapsedSummary: true,
      summaryForAssistantMessageId: "a1",
    });
  });
});
