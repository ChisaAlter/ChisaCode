import { describe, expect, it } from "vitest";
import type { TodoEntry, TodoListItem } from "@/types/stream";
import {
  buildPullRequestLabel,
  buildTodoProgressSummary,
  findLatestTodoItems,
  type WorkspacePullRequestRuntime,
} from "./workspace-environment-panel-model";

const basePullRequest: WorkspacePullRequestRuntime = {
  url: "https://github.com/example/repo/pull/42",
  title: "Add cool feature",
  state: "open",
  baseRefName: "main",
  headRefName: "feat/cool",
  isMerged: false,
  mergeable: "MERGEABLE",
  checksStatus: "success",
  reviewDecision: "approved",
};

describe("buildPullRequestLabel", () => {
  it("prepends the PR number when present", () => {
    expect(buildPullRequestLabel({ ...basePullRequest, number: 42 })).toBe("#42 Add cool feature");
  });

  it("falls back to the title when the number is missing", () => {
    expect(buildPullRequestLabel({ ...basePullRequest, number: undefined })).toBe(
      "Add cool feature",
    );
  });
});

function todoEntry(text: string, completed: boolean): TodoEntry {
  return { text, completed };
}

function todoListItem(items: TodoEntry[], timestamp: number): TodoListItem {
  return {
    kind: "todo_list",
    id: `todo-${timestamp}-${items.length}`,
    timestamp: new Date(timestamp),
    provider: "claude",
    items,
  };
}

describe("findLatestTodoItems", () => {
  it("returns null when no todo list is present", () => {
    expect(findLatestTodoItems({ head: [], tail: [] })).toBeNull();
  });

  it("returns the tail items when head has no todo", () => {
    const tail = todoListItem([todoEntry("Investigate", true)], 1_000);
    expect(findLatestTodoItems({ head: [], tail: [tail] })).toBe(tail.items);
  });

  it("prefers the most recent timestamp between head and tail", () => {
    const head = todoListItem([todoEntry("Head", false)], 2_000);
    const tail = todoListItem([todoEntry("Tail", true)], 1_000);
    expect(findLatestTodoItems({ head: [head], tail: [tail] })).toBe(head.items);
  });

  it("uses the tail when its todo is the most recent", () => {
    const head = todoListItem([todoEntry("Head", false)], 1_000);
    const tail = todoListItem([todoEntry("Tail", true)], 2_000);
    expect(findLatestTodoItems({ head: [head], tail: [tail] })).toBe(tail.items);
  });
});

describe("buildTodoProgressSummary", () => {
  it("returns null when no items are provided", () => {
    expect(buildTodoProgressSummary(null)).toBeNull();
    expect(buildTodoProgressSummary([])).toBeNull();
  });

  it("computes progress and respects max visible items", () => {
    const items = [
      todoEntry("First", true),
      todoEntry("Second", false),
      todoEntry("Third", true),
      todoEntry("Fourth", false),
    ];
    const summary = buildTodoProgressSummary(items, 2);
    expect(summary).toEqual({
      completedCount: 2,
      totalCount: 4,
      progress: 0.5,
      visibleItems: [items[0], items[1]],
      hiddenCount: 2,
    });
  });

  it("treats every item as visible when count is below the cap", () => {
    const items = [todoEntry("First", true)];
    const summary = buildTodoProgressSummary(items, 5);
    expect(summary?.hiddenCount).toBe(0);
    expect(summary?.progress).toBe(1);
  });
});
