import { describe, expect, it } from "vitest";
import { deriveComposerTasks } from "./tasks-badge";
import type { StreamItem } from "@/types/stream";

function todo(id: string, items: { text: string; completed: boolean }[], seed = 1): StreamItem {
  return {
    kind: "todo_list",
    id,
    timestamp: new Date(`2026-01-01T00:00:0${seed}.000Z`),
    provider: "codex",
    items,
  };
}

describe("deriveComposerTasks", () => {
  it("returns null when the stream has no todo list", () => {
    expect(deriveComposerTasks([])).toBeNull();
  });

  it("returns null for an empty todo list", () => {
    expect(deriveComposerTasks([todo("t1", [])])).toBeNull();
  });

  it("derives tasks from the latest todo list", () => {
    const badge = deriveComposerTasks([
      todo("t1", [{ text: "old step", completed: true }]),
      todo("t2", [
        { text: "step one", completed: true },
        { text: "step two", completed: false },
      ]),
    ]);
    expect(badge).toMatchObject({ completed: 1, total: 2 });
    expect(badge?.tasks.map((task) => task.status)).toEqual(["completed", "in_progress"]);
  });

  it("marks the first pending step as in_progress", () => {
    const badge = deriveComposerTasks([
      todo("t1", [
        { text: "a", completed: true },
        { text: "b", completed: true },
        { text: "c", completed: false },
        { text: "d", completed: false },
      ]),
    ]);
    expect(badge?.tasks.map((task) => task.status)).toEqual([
      "completed",
      "completed",
      "in_progress",
      "pending",
    ]);
  });

  it("reports all-completed lists without an in_progress step", () => {
    const badge = deriveComposerTasks([
      todo("t1", [
        { text: "a", completed: true },
        { text: "b", completed: true },
      ]),
    ]);
    expect(badge).toMatchObject({ completed: 2, total: 2 });
    expect(badge?.tasks.every((task) => task.status === "completed")).toBe(true);
  });

  it("reports all-pending lists", () => {
    const badge = deriveComposerTasks([todo("t1", [{ text: "only", completed: false }])]);
    expect(badge).toMatchObject({ completed: 0, total: 1 });
    expect(badge?.tasks[0]?.status).toBe("in_progress");
  });
});
