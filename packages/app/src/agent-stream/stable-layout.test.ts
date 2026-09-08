import { describe, expect, it } from "vitest";
import { layoutStream, type StreamLayoutItem } from "./layout";
import {
  computeStableStreamLayout,
  computeStableStreamLayoutItems,
  isStreamLayoutItemContentUnchanged,
} from "./stable-layout";
import { orderTailForStreamRenderStrategy, type StreamStrategy } from "./strategy";
import { resolveStreamRenderStrategy } from "./strategy-resolver";
import type { StreamItem } from "@/types/stream";

function timestamp(seed: number): Date {
  return new Date(`2026-01-01T00:00:${seed.toString().padStart(2, "0")}.000Z`);
}

function userMessage(id: string, seed: number): Extract<StreamItem, { kind: "user_message" }> {
  return { kind: "user_message", id, text: id, timestamp: timestamp(seed) };
}

function assistantMessage(
  id: string,
  seed: number,
  text = id,
): Extract<StreamItem, { kind: "assistant_message" }> {
  return { kind: "assistant_message", id, text, timestamp: timestamp(seed) };
}

function toolCall(
  id: string,
  seed: number,
  status: "executing" | "completed" = "completed",
): Extract<StreamItem, { kind: "tool_call" }> {
  return {
    kind: "tool_call",
    id,
    timestamp: timestamp(seed),
    payload: {
      source: "orchestrator",
      data: {
        toolCallId: id,
        toolName: "Shell",
        arguments: "echo hi",
        result: null,
        status,
      },
    },
  };
}

const strategy: StreamStrategy = resolveStreamRenderStrategy({
  platform: "web",
  isMobileBreakpoint: false,
});

// A shared segment array so rows built across frames pass the strict
// items-reference tier of the reuse check (production keeps the segment array
// identity-stable while its contents are only appended).
const SHARED_SEGMENT: StreamItem[] = [];

function makeLayoutItem(
  item: StreamItem,
  index: number,
  overrides: Partial<StreamLayoutItem> = {},
  items: StreamItem[] = SHARED_SEGMENT,
): StreamLayoutItem {
  return {
    item,
    index,
    items,
    aboveItem: null,
    belowItem: null,
    gapBelow: 8,
    assistantSpacing: "default",
    completedFooter: null,
    turnTiming: undefined,
    toolSequence: "none",
    toolSequenceGroup: null,
    toolSequenceGroupGapBelow: 0,
    isToolSequenceGroupContinuation: false,
    isFirstInUserGroup: item.kind === "user_message",
    isLastInUserGroup: item.kind === "user_message",
    isLastInToolSequence: false,
    frameOrder: strategy.getFrameChildOrder(),
    ...overrides,
  };
}

function frameOrderOf(layoutItem: StreamLayoutItem): StreamLayoutItem["frameOrder"] {
  return layoutItem.frameOrder;
}

describe("computeStableStreamLayoutItems", () => {
  it("returns fresh state on first run with the input references", () => {
    const rows = [makeLayoutItem(userMessage("u1", 1), 0)];
    const state = computeStableStreamLayoutItems(rows, null);
    expect(state.result).toEqual(rows);
    expect(state.result[0]).toBe(rows[0]);
  });

  it("returns the previous state object when every row is unchanged", () => {
    const rows = [
      makeLayoutItem(userMessage("u1", 1), 0),
      makeLayoutItem(assistantMessage("a1", 2), 1),
    ];
    const first = computeStableStreamLayoutItems(rows, null);
    const rebuilt = rows.map((row, index) => ({ ...row, index }));
    const second = computeStableStreamLayoutItems(rebuilt, first);
    expect(second).toBe(first);
    expect(second.result[0]).toBe(rows[0]);
  });

  it("reuses unchanged rows and rebuilds only the row whose item changed", () => {
    const user = userMessage("u1", 1);
    const assistantA = assistantMessage("a1", 2, "partial");
    const assistantB = assistantMessage("a1", 2, "partial streaming…");
    const first = computeStableStreamLayoutItems(
      [makeLayoutItem(user, 0), makeLayoutItem(assistantA, 1)],
      null,
    );
    const second = computeStableStreamLayoutItems(
      [makeLayoutItem(user, 0), makeLayoutItem(assistantB, 1)],
      first,
    );
    expect(second).not.toBe(first);
    expect(second.result[0]).toBe(first.result[0]);
    expect(second.result[1]).not.toBe(first.result[1]);
    expect(second.result[1].item).toBe(assistantB);
  });

  it("rebuilds a row when its tool_call item reference changes", () => {
    const toolA = toolCall("t1", 1, "executing");
    const toolB = toolCall("t1", 1, "completed");
    const first = computeStableStreamLayoutItems([makeLayoutItem(toolA, 0)], null);
    const second = computeStableStreamLayoutItems([makeLayoutItem(toolB, 0)], first);
    expect(second.result[0]).not.toBe(first.result[0]);
    expect(second.result[0].item).toBe(toolB);
  });

  it("rebuilds the previous last row when a row is appended below it", () => {
    const user = userMessage("u1", 1);
    const first = computeStableStreamLayoutItems([makeLayoutItem(user, 0)], null);
    const appended = assistantMessage("a1", 2);
    const second = computeStableStreamLayoutItems(
      [
        makeLayoutItem(user, 0, { belowItem: appended }),
        makeLayoutItem(appended, 1, { aboveItem: user }),
      ],
      first,
    );
    expect(second.result[0]).not.toBe(first.result[0]);
    expect(second.result[1].item).toBe(appended);
  });

  it("returns a new state object when a row is removed", () => {
    const rows = [
      makeLayoutItem(userMessage("u1", 1), 0),
      makeLayoutItem(assistantMessage("a1", 2), 1),
    ];
    const first = computeStableStreamLayoutItems(rows, null);
    const second = computeStableStreamLayoutItems([rows[0] as StreamLayoutItem], first);
    expect(second).not.toBe(first);
    expect(second.result).toHaveLength(1);
    expect(second.result[0]).toBe(first.result[0]);
  });

  it("rebuilds shifted rows instead of carrying stale indexes", () => {
    const user = userMessage("u1", 1);
    const inserted = assistantMessage("a0", 3);
    const follower = assistantMessage("a1", 2);
    const first = computeStableStreamLayoutItems(
      [makeLayoutItem(user, 0), makeLayoutItem(follower, 1)],
      null,
    );
    const second = computeStableStreamLayoutItems(
      [
        makeLayoutItem(user, 0),
        makeLayoutItem(inserted, 1),
        makeLayoutItem(follower, 2, { aboveItem: inserted }),
      ],
      first,
    );
    expect(second.result[2]).not.toBe(first.result[1]);
    expect(second.result[2].index).toBe(2);
    expect(second.result[0]).toBe(first.result[0]);
  });

  it("rebuilds rows when frameOrder changes", () => {
    const row = makeLayoutItem(userMessage("u1", 1), 0);
    const first = computeStableStreamLayoutItems([row], null);
    const changed = makeLayoutItem(userMessage("u1", 1), 0, {
      frameOrder:
        frameOrderOf(row) === "content-then-footer" ? "footer-then-content" : "content-then-footer",
    });
    const second = computeStableStreamLayoutItems([changed], first);
    expect(second.result[0]).not.toBe(first.result[0]);
  });

  it("rebuilds rows when the segment items reference changes", () => {
    const item = userMessage("u1", 1);
    const first = computeStableStreamLayoutItems([makeLayoutItem(item, 0)], null);
    const second = computeStableStreamLayoutItems(
      [makeLayoutItem(item, 0, { items: [item, assistantMessage("a1", 2)] })],
      first,
    );
    expect(second).not.toBe(first);
    expect(second.result[0]).not.toBe(first.result[0]);
  });

  it("rebuilds a row when gapBelow changes", () => {
    const row = makeLayoutItem(userMessage("u1", 1), 0);
    const first = computeStableStreamLayoutItems([row], null);
    const second = computeStableStreamLayoutItems(
      [makeLayoutItem(userMessage("u1", 1), 0, { gapBelow: 16 })],
      first,
    );
    expect(second.result[0]).not.toBe(first.result[0]);
  });

  it("rebuilds a row when assistantSpacing changes", () => {
    const row = makeLayoutItem(assistantMessage("a1", 1), 0);
    const first = computeStableStreamLayoutItems([row], null);
    const second = computeStableStreamLayoutItems(
      [makeLayoutItem(assistantMessage("a1", 1), 0, { assistantSpacing: "compactTop" })],
      first,
    );
    expect(second.result[0]).not.toBe(first.result[0]);
  });

  it("treats a field-equal completedFooter replacement as unchanged", () => {
    const item = assistantMessage("a1", 1);
    const items = [item];
    const footer = {
      itemId: "a1",
      items,
      timing: undefined,
      startIndex: 0,
    };
    const first = computeStableStreamLayoutItems(
      [makeLayoutItem(item, 0, { completedFooter: footer })],
      null,
    );
    const second = computeStableStreamLayoutItems(
      [
        makeLayoutItem(item, 0, {
          completedFooter: { itemId: "a1", items, timing: undefined, startIndex: 0 },
        }),
      ],
      first,
    );
    expect(second).toBe(first);
  });

  it("rebuilds a row when its completedFooter appears or disappears", () => {
    const item = assistantMessage("a1", 1);
    const items = [item];
    const footer = { itemId: "a1", items, timing: undefined, startIndex: 0 };
    const bare = computeStableStreamLayoutItems([makeLayoutItem(item, 0)], null);
    const withFooter = computeStableStreamLayoutItems(
      [makeLayoutItem(item, 0, { completedFooter: footer })],
      bare,
    );
    expect(withFooter.result[0]).not.toBe(bare.result[0]);
    const backToBare = computeStableStreamLayoutItems([makeLayoutItem(item, 0)], withFooter);
    expect(backToBare.result[0]).not.toBe(withFooter.result[0]);
  });

  it("rebuilds a row when its turnTiming reference changes", () => {
    const timingA = { startedAt: timestamp(1), completedAt: timestamp(2), durationMs: 1 };
    const timingB = { startedAt: timestamp(1), completedAt: timestamp(2), durationMs: 1 };
    const first = computeStableStreamLayoutItems(
      [makeLayoutItem(assistantMessage("a1", 1), 0, { turnTiming: timingA })],
      null,
    );
    const second = computeStableStreamLayoutItems(
      [makeLayoutItem(assistantMessage("a1", 1), 0, { turnTiming: timingB })],
      first,
    );
    expect(second.result[0]).not.toBe(first.result[0]);
  });

  it("rebuilds a row when toolSequence changes", () => {
    const tool = toolCall("t1", 1);
    const first = computeStableStreamLayoutItems(
      [makeLayoutItem(tool, 0, { toolSequence: "single" })],
      null,
    );
    const second = computeStableStreamLayoutItems(
      [makeLayoutItem(tool, 0, { toolSequence: "none" })],
      first,
    );
    expect(second.result[0]).not.toBe(first.result[0]);
  });

  it("rebuilds a row when its toolSequenceGroup reference changes", () => {
    const tool = toolCall("t1", 1);
    const groupA = [makeLayoutItem(tool, 0)];
    const groupB = [makeLayoutItem(tool, 0)];
    const first = computeStableStreamLayoutItems(
      [makeLayoutItem(tool, 0, { toolSequence: "single", toolSequenceGroup: groupA })],
      null,
    );
    const second = computeStableStreamLayoutItems(
      [makeLayoutItem(tool, 0, { toolSequence: "single", toolSequenceGroup: groupB })],
      first,
    );
    expect(second.result[0]).not.toBe(first.result[0]);
  });

  it("rebuilds a row when its user-group flags flip", () => {
    const user = userMessage("u1", 1);
    const follower = userMessage("u2", 2);
    const first = computeStableStreamLayoutItems(
      [
        makeLayoutItem(user, 0, { isLastInUserGroup: true }),
        makeLayoutItem(follower, 1, { isFirstInUserGroup: false }),
      ],
      null,
    );
    const second = computeStableStreamLayoutItems(
      [
        makeLayoutItem(user, 0, { isLastInUserGroup: false }),
        makeLayoutItem(follower, 1, { isFirstInUserGroup: true }),
      ],
      first,
    );
    expect(second.result[0]).not.toBe(first.result[0]);
    expect(second.result[1]).not.toBe(first.result[1]);
  });

  it("keeps the empty state object across empty frames", () => {
    const first = computeStableStreamLayoutItems([], null);
    const second = computeStableStreamLayoutItems([], first);
    expect(second).toBe(first);
  });

  it("reports content equality independent of positional metadata", () => {
    const item = userMessage("u1", 1);
    const base = makeLayoutItem(item, 0);
    const shifted = makeLayoutItem(item, 3);
    expect(isStreamLayoutItemContentUnchanged(base, shifted)).toBe(true);
  });
});

describe("computeStableStreamLayout", () => {
  it("returns the previous layout object when nothing changed", () => {
    const tail = [userMessage("u1", 1), assistantMessage("a1", 2)];
    const ordered = orderTailForStreamRenderStrategy({ strategy, streamItems: tail });
    const firstLayout = layoutStream({
      strategy,
      agentStatus: "idle",
      history: ordered,
      liveHead: [],
      timingByAssistantId: new Map(),
    });
    const first = computeStableStreamLayout(firstLayout, null);
    const secondLayout = layoutStream({
      strategy,
      agentStatus: "idle",
      history: ordered,
      liveHead: [],
      timingByAssistantId: new Map(),
    });
    const second = computeStableStreamLayout(secondLayout, first);
    expect(second).toBe(first);
  });

  it("returns a new layout object when the auxiliary footer changes", () => {
    const tail = [userMessage("u1", 1), assistantMessage("a1", 2)];
    const ordered = orderTailForStreamRenderStrategy({ strategy, streamItems: tail });
    const running = layoutStream({
      strategy,
      agentStatus: "running",
      history: ordered,
      liveHead: [],
      timingByAssistantId: new Map(),
    });
    const idle = layoutStream({
      strategy,
      agentStatus: "idle",
      history: ordered,
      liveHead: [],
      timingByAssistantId: new Map(),
    });
    const first = computeStableStreamLayout(running, null);
    const second = computeStableStreamLayout(idle, first);
    expect(second).not.toBe(first);
  });
});

describe("tool sequence group identity (layout.ts cache)", () => {
  it("keeps the group array reference across layout runs with unchanged members", () => {
    const tail: StreamItem[] = [
      userMessage("u1", 1),
      toolCall("t1", 2),
      toolCall("t2", 3),
      assistantMessage("a1", 4),
    ];
    const ordered = orderTailForStreamRenderStrategy({ strategy, streamItems: tail });
    const first = layoutStream({
      strategy,
      agentStatus: "idle",
      history: ordered,
      liveHead: [],
      timingByAssistantId: new Map(),
    });
    const second = layoutStream({
      strategy,
      agentStatus: "idle",
      history: ordered,
      liveHead: [],
      timingByAssistantId: new Map(),
    });
    const firstHead = first.history.find((row) => row.toolSequenceGroup);
    const secondHead = second.history.find((row) => row.toolSequenceGroup);
    expect(firstHead).toBeDefined();
    expect(secondHead?.toolSequenceGroup).toBe(firstHead?.toolSequenceGroup);
  });

  it("produces a new group array when a member item changes", () => {
    const toolA = toolCall("t1", 2, "executing");
    const toolB = toolCall("t1", 2, "completed");
    const tailA: StreamItem[] = [userMessage("u1", 1), toolA, assistantMessage("a1", 4)];
    const tailB: StreamItem[] = [userMessage("u1", 1), toolB, assistantMessage("a1", 4)];
    const orderedA = orderTailForStreamRenderStrategy({ strategy, streamItems: tailA });
    const orderedB = orderTailForStreamRenderStrategy({ strategy, streamItems: tailB });
    const first = layoutStream({
      strategy,
      agentStatus: "idle",
      history: orderedA,
      liveHead: [],
      timingByAssistantId: new Map(),
    });
    const second = layoutStream({
      strategy,
      agentStatus: "idle",
      history: orderedB,
      liveHead: [],
      timingByAssistantId: new Map(),
    });
    const firstHead = first.history.find((row) => row.toolSequenceGroup);
    const secondHead = second.history.find((row) => row.toolSequenceGroup);
    expect(firstHead).toBeDefined();
    expect(secondHead?.toolSequenceGroup).not.toBe(firstHead?.toolSequenceGroup);
  });
});
