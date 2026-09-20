import { describe, expect, it } from "vitest";
import {
  SCROLL_COLLAPSE_INPUT_SUPPRESS_MS,
  SCROLL_COLLAPSE_THRESHOLD_PX,
  createComposerScrollGestureState,
  expandComposerScrollGesture,
  noteComposerScrollInput,
  recordComposerScrollGestureEvent,
} from "./composer-scroll-gesture";

function fold(
  state: ReturnType<typeof createComposerScrollGestureState>,
  input: { deltaPx: number; towardEnd?: boolean; atEnd?: boolean; now: number; inputAt?: number },
) {
  if (input.inputAt !== undefined) {
    noteComposerScrollInput(state, input.inputAt);
  }
  return recordComposerScrollGestureEvent(state, {
    deltaPx: input.deltaPx,
    towardEnd: input.towardEnd ?? false,
    atEnd: input.atEnd ?? false,
    now: input.now,
  });
}

describe("recordComposerScrollGestureEvent", () => {
  it("does not collapse below the threshold", () => {
    const state = createComposerScrollGestureState();
    const result = fold(state, { deltaPx: 10, now: 1_000 });
    expect(result.collapsed).toBe(false);
    expect(state.collapsed).toBe(false);
    expect(state.accumulatedDeltaPx).toBe(10);
  });

  it("collapses when accumulation reaches the threshold", () => {
    const state = createComposerScrollGestureState();
    fold(state, { deltaPx: 12, now: 1_000 });
    const result = fold(state, { deltaPx: 12, now: 1_010 });
    expect(result.collapsed).toBe(true);
    expect(state.collapsed).toBe(true);
    expect(state.accumulatedDeltaPx).toBe(0);
  });

  it("accumulates across many small upward events", () => {
    const state = createComposerScrollGestureState();
    let collapsed = false;
    for (let index = 0; index < 5; index += 1) {
      collapsed = fold(state, { deltaPx: 5, now: 1_000 + index }).collapsed;
    }
    expect(collapsed).toBe(true);
    expect(SCROLL_COLLAPSE_THRESHOLD_PX).toBe(24);
  });

  it("collapses on a single large upward flick", () => {
    const state = createComposerScrollGestureState();
    const result = fold(state, { deltaPx: 60, now: 1_000 });
    expect(result.collapsed).toBe(true);
  });

  it("a toward-end event resets accumulation", () => {
    const state = createComposerScrollGestureState();
    fold(state, { deltaPx: 20, now: 1_000 });
    const result = fold(state, { deltaPx: 10, towardEnd: true, now: 1_010 });
    expect(result.collapsed).toBe(false);
    expect(result.expanded).toBe(false);
    expect(state.accumulatedDeltaPx).toBe(0);
    expect(state.collapsed).toBe(false);
  });

  it("a toward-end event expands an already collapsed composer", () => {
    const state = createComposerScrollGestureState();
    fold(state, { deltaPx: 60, now: 1_000 });
    expect(state.collapsed).toBe(true);
    const result = fold(state, { deltaPx: 10, towardEnd: true, now: 1_010 });
    expect(result.collapsed).toBe(false);
    expect(result.expanded).toBe(true);
    expect(state.collapsed).toBe(false);
  });

  it("suppresses collapse within the input window", () => {
    const state = createComposerScrollGestureState();
    noteComposerScrollInput(state, 1_000);
    const result = fold(state, {
      deltaPx: 60,
      now: 1_000 + SCROLL_COLLAPSE_INPUT_SUPPRESS_MS - 1,
    });
    expect(result.collapsed).toBe(false);
    expect(state.accumulatedDeltaPx).toBe(0);
  });

  it("allows collapse once the input window has passed", () => {
    const state = createComposerScrollGestureState();
    noteComposerScrollInput(state, 1_000);
    const result = fold(state, { deltaPx: 60, now: 1_000 + SCROLL_COLLAPSE_INPUT_SUPPRESS_MS });
    expect(result.collapsed).toBe(true);
  });

  it("upward events at the bottom do not accumulate", () => {
    const state = createComposerScrollGestureState();
    const result = fold(state, { deltaPx: 40, atEnd: true, now: 1_000 });
    expect(result.collapsed).toBe(false);
    expect(state.accumulatedDeltaPx).toBe(0);
  });

  it("keeps accumulating after expansion from bottom arrival", () => {
    const state = createComposerScrollGestureState();
    fold(state, { deltaPx: 40, atEnd: true, now: 1_000 });
    const result = fold(state, { deltaPx: 30, now: 1_010 });
    expect(result.collapsed).toBe(true);
  });

  it("resets accumulation after collapse so the next collapse needs a fresh gesture", () => {
    const state = createComposerScrollGestureState();
    fold(state, { deltaPx: 60, now: 1_000 });
    expandComposerScrollGesture(state);
    expect(state.collapsed).toBe(false);
    const result = fold(state, { deltaPx: 5, now: 1_010 });
    expect(result.collapsed).toBe(false);
    expect(state.accumulatedDeltaPx).toBe(5);
  });
});

describe("noteComposerScrollInput", () => {
  it("stores the timestamp used by the suppress window", () => {
    const state = createComposerScrollGestureState();
    noteComposerScrollInput(state, 42);
    expect(state.lastInputAt).toBe(42);
  });
});

describe("expandComposerScrollGesture", () => {
  it("clears both accumulation and collapse", () => {
    const state = createComposerScrollGestureState();
    fold(state, { deltaPx: 60, now: 1_000 });
    expandComposerScrollGesture(state);
    expect(state.collapsed).toBe(false);
    expect(state.accumulatedDeltaPx).toBe(0);
  });
});
