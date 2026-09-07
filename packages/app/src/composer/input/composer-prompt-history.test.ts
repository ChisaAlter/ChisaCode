import { describe, expect, it } from "vitest";
import {
  buildComposerPromptHistory,
  isCursorOnFirstLine,
  isCursorOnLastLine,
  stepComposerPromptHistory,
  type PromptHistoryEntry,
} from "./composer-prompt-history";
import type { UserMessageItem } from "@/types/stream";

function makeUser(id: string, text: string, createdAt: number): UserMessageItem {
  return { kind: "user_message", id, text, timestamp: new Date(createdAt) };
}

describe("buildComposerPromptHistory", () => {
  it("returns entries newest first from chronological messages", () => {
    const entries = buildComposerPromptHistory([
      makeUser("a", "first", 1),
      makeUser("b", "second", 2),
      makeUser("c", "third", 3),
    ]);
    expect(entries.map((entry) => entry.text)).toEqual(["third", "second", "first"]);
    expect(entries.map((entry) => entry.id)).toEqual(["c", "b", "a"]);
    expect(entries.map((entry) => entry.createdAt)).toEqual([3, 2, 1]);
  });

  it("collapses consecutive duplicates into the newest entry", () => {
    const entries = buildComposerPromptHistory([
      makeUser("a", "same", 1),
      makeUser("b", "same", 2),
      makeUser("c", "other", 3),
    ]);
    expect(entries.map((entry) => entry.text)).toEqual(["other", "same"]);
    expect(entries.map((entry) => entry.id)).toEqual(["c", "b"]);
  });

  it("preserves non-adjacent duplicates", () => {
    const entries = buildComposerPromptHistory([
      makeUser("a", "repeat", 1),
      makeUser("b", "middle", 2),
      makeUser("c", "repeat", 3),
    ]);
    expect(entries.map((entry) => entry.text)).toEqual(["repeat", "middle", "repeat"]);
  });

  it("skips whitespace-only prompts", () => {
    const entries = buildComposerPromptHistory([
      makeUser("a", "   ", 1),
      makeUser("b", "real", 2),
      makeUser("c", "\n\t ", 3),
    ]);
    expect(entries.map((entry) => entry.text)).toEqual(["real"]);
  });

  it("trims entry text but preserves internal newlines", () => {
    const entries = buildComposerPromptHistory([makeUser("a", "  line one\nline two  ", 1)]);
    expect(entries[0]?.text).toBe("line one\nline two");
  });

  it("returns an empty list for empty messages", () => {
    expect(buildComposerPromptHistory([])).toEqual([]);
  });
});

describe("stepComposerPromptHistory", () => {
  const entries: PromptHistoryEntry[] = [
    { id: "c", text: "third", createdAt: 3 },
    { id: "b", text: "second", createdAt: 2 },
    { id: "a", text: "first", createdAt: 1 },
  ];

  it("back from not browsing starts at the newest entry", () => {
    expect(stepComposerPromptHistory({ entries, direction: "back", position: null })).toEqual({
      text: "third",
      position: 0,
    });
  });

  it("back walks toward older entries", () => {
    expect(stepComposerPromptHistory({ entries, direction: "back", position: 0 })).toEqual({
      text: "second",
      position: 1,
    });
    expect(stepComposerPromptHistory({ entries, direction: "back", position: 1 })).toEqual({
      text: "first",
      position: 2,
    });
  });

  it("back saturates at the oldest entry as a no-op", () => {
    expect(stepComposerPromptHistory({ entries, direction: "back", position: 2 })).toBeNull();
  });

  it("back on empty history is a no-op", () => {
    expect(
      stepComposerPromptHistory({ entries: [], direction: "back", position: null }),
    ).toBeNull();
  });

  it("forward past the newest entry clears the composer and exits browsing", () => {
    expect(stepComposerPromptHistory({ entries, direction: "forward", position: 0 })).toEqual({
      text: "",
      position: null,
    });
  });

  it("forward walks toward newer entries", () => {
    expect(stepComposerPromptHistory({ entries, direction: "forward", position: 2 })).toEqual({
      text: "second",
      position: 1,
    });
    expect(stepComposerPromptHistory({ entries, direction: "forward", position: 1 })).toEqual({
      text: "third",
      position: 0,
    });
  });

  it("forward while not browsing is a no-op", () => {
    expect(stepComposerPromptHistory({ entries, direction: "forward", position: null })).toBeNull();
  });

  it("clamps a stale position beyond the current entries", () => {
    // History shrank while browsing: position 5 maps onto the oldest entry.
    expect(stepComposerPromptHistory({ entries, direction: "back", position: 5 })).toBeNull();
    expect(stepComposerPromptHistory({ entries, direction: "forward", position: 5 })).toEqual({
      text: "second",
      position: 1,
    });
  });
});

describe("cursor line predicates", () => {
  it("treats the caret before any newline as on the first line", () => {
    expect(isCursorOnFirstLine("one\ntwo", 0)).toBe(true);
    expect(isCursorOnFirstLine("one\ntwo", 2)).toBe(true);
    expect(isCursorOnFirstLine("one\ntwo", 4)).toBe(false);
    expect(isCursorOnFirstLine("one", 3)).toBe(true);
  });

  it("treats the caret after the last newline as on the last line", () => {
    expect(isCursorOnLastLine("one\ntwo", 8)).toBe(true);
    expect(isCursorOnLastLine("one\ntwo", 4)).toBe(true);
    expect(isCursorOnLastLine("one\ntwo", 2)).toBe(false);
    expect(isCursorOnLastLine("one", 0)).toBe(true);
  });

  it("tolerates selection offsets beyond the text length", () => {
    expect(isCursorOnLastLine("one", 99)).toBe(true);
    expect(isCursorOnFirstLine("one", 99)).toBe(true);
  });
});
