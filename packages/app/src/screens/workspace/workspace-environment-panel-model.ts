import type { WorkspaceDescriptor } from "@/stores/session-store";
import type { StreamItem, TodoEntry } from "@/types/stream";

export type WorkspacePullRequestRuntime = NonNullable<
  NonNullable<WorkspaceDescriptor["githubRuntime"]>["pullRequest"]
>;

export interface TodoProgressSummary {
  completedCount: number;
  totalCount: number;
  progress: number;
  visibleItems: TodoEntry[];
  hiddenCount: number;
}

export function buildPullRequestLabel(pullRequest: WorkspacePullRequestRuntime): string {
  if (typeof pullRequest.number === "number") {
    return `#${pullRequest.number} ${pullRequest.title}`;
  }
  return pullRequest.title;
}

export function findLatestTodoItems(input: {
  head?: readonly StreamItem[] | null;
  tail?: readonly StreamItem[] | null;
}): TodoEntry[] | null {
  const latestHead = findLatestTodoList(input.head);
  const latestTail = findLatestTodoList(input.tail);

  if (!latestHead) {
    return latestTail?.items ?? null;
  }
  if (!latestTail) {
    return latestHead.items;
  }
  return latestHead.timestamp.getTime() >= latestTail.timestamp.getTime()
    ? latestHead.items
    : latestTail.items;
}

export function buildTodoProgressSummary(
  items: readonly TodoEntry[] | null | undefined,
  maxVisibleItems = 6,
): TodoProgressSummary | null {
  if (!items || items.length === 0) {
    return null;
  }

  let completedCount = 0;
  for (const item of items) {
    if (item.completed) {
      completedCount += 1;
    }
  }

  const visibleCount = Math.max(0, maxVisibleItems);
  const visibleItems = items.slice(0, visibleCount);
  return {
    completedCount,
    totalCount: items.length,
    progress: completedCount / items.length,
    visibleItems,
    hiddenCount: Math.max(0, items.length - visibleItems.length),
  };
}

function findLatestTodoList(items: readonly StreamItem[] | null | undefined) {
  let latest: Extract<StreamItem, { kind: "todo_list" }> | null = null;
  if (!items) {
    return latest;
  }

  for (const item of items) {
    if (item.kind !== "todo_list") {
      continue;
    }
    if (!latest || item.timestamp.getTime() >= latest.timestamp.getTime()) {
      latest = item;
    }
  }
  return latest;
}
