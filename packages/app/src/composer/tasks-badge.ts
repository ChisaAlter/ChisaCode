import type { StreamItem } from "@/types/stream";

/**
 * One step of the composer's task-progress badge (T3 port M6+18).
 */
export interface ComposerTask {
  id: string;
  title: string;
  status: "completed" | "in_progress" | "pending";
  /** ms between this step's first appearance and its completion; only for completed steps. */
  durationMs?: number;
}

export interface ComposerTaskBadge {
  completed: number;
  total: number;
  tasks: ComposerTask[];
}

/**
 * Derives the task-progress badge from the latest todo_list in the stream
 * (both providers' todo timeline items map to this shape). Returns null when
 * the stream carries no todo list.
 * @param items The agent's stream items (tail + head, chronological)
 * @returns The badge model, or null when there is nothing to show
 */
export function deriveComposerTasks(items: readonly StreamItem[]): ComposerTaskBadge | null {
  let latest: Extract<StreamItem, { kind: "todo_list" }> | null = null;
  for (const item of items) {
    if (item.kind === "todo_list") {
      latest = item;
    }
  }
  if (!latest || latest.items.length === 0) {
    return null;
  }
  const tasks: ComposerTask[] = latest.items.map((entry, index) => ({
    id: `${latest.id}:${index}`,
    title: entry.text,
    status: entry.completed ? "completed" : "pending",
  }));
  // The first pending step is the one in progress right now.
  const inProgress = tasks.find((task) => task.status === "pending");
  if (inProgress) {
    inProgress.status = "in_progress";
  }
  const completed = tasks.filter((task) => task.status === "completed").length;
  return { completed, total: tasks.length, tasks };
}
