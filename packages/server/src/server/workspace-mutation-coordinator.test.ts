import { describe, expect, test, vi } from "vitest";

import { WorkspaceMutationCoordinator } from "./workspace-mutation-coordinator.js";

describe("WorkspaceMutationCoordinator", () => {
  test("canonicalizes windows and posix paths for lock identity", () => {
    const coordinator = new WorkspaceMutationCoordinator();
    const a = coordinator.canonicalize("C:\\tmp\\WorkTree\\branch");
    const b = coordinator.canonicalize("c:/tmp/WorkTree/branch/");
    expect(a).toBe(b);
    expect(coordinator.pathHash("C:\\tmp\\WorkTree\\branch")).toBe(
      coordinator.pathHash("c:/tmp/WorkTree/branch/"),
    );
  });

  test("serializes exclusive mutations on the same path", async () => {
    const coordinator = new WorkspaceMutationCoordinator();
    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = coordinator.runExclusive("/tmp/wt", "archive-worktree", async ({ setState }) => {
      order.push("first-enter");
      setState("quiescing", "begin");
      await firstGate;
      setState("archived", "done");
      order.push("first-exit");
      return 1;
    });

    await vi.waitFor(() => {
      expect(order).toEqual(["first-enter"]);
    });

    const secondPromise = coordinator.runExclusive(
      "/tmp/wt",
      "archive-worktree",
      async ({ setState }) => {
        order.push("second-enter");
        setState("quiescing", "begin2");
        setState("archived", "done2");
        order.push("second-exit");
        return 2;
      },
    );

    // Second must not enter while first is still holding the lock.
    await Promise.resolve();
    expect(order).toEqual(["first-enter"]);
    releaseFirst();
    const [firstResult, secondResult] = await Promise.all([first, secondPromise]);
    expect(firstResult).toBe(1);
    expect(secondResult).toBe(2);
    expect(order).toEqual(["first-enter", "first-exit", "second-enter", "second-exit"]);
  });

  test("restores active and rethrows when callback fails before terminal state", async () => {
    const coordinator = new WorkspaceMutationCoordinator();
    await expect(
      coordinator.runExclusive("/tmp/wt-fail", "archive-worktree", async ({ setState }) => {
        setState("quiescing", "begin");
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(coordinator.getState("/tmp/wt-fail")).toBe("active");
    expect(coordinator.isAcceptingWrites("/tmp/wt-fail")).toBe(true);
  });

  test("allows concurrent mutations on different paths", async () => {
    const coordinator = new WorkspaceMutationCoordinator();
    const started: string[] = [];
    let releaseA!: () => void;
    let releaseB!: () => void;
    const gateA = new Promise<void>((resolve) => {
      releaseA = resolve;
    });
    const gateB = new Promise<void>((resolve) => {
      releaseB = resolve;
    });

    const a = coordinator.runExclusive("/tmp/a", "delete-worktree", async () => {
      started.push("a");
      await gateA;
      return "a";
    });
    const b = coordinator.runExclusive("/tmp/b", "delete-worktree", async () => {
      started.push("b");
      await gateB;
      return "b";
    });

    await vi.waitFor(() => {
      expect(started.sort()).toEqual(["a", "b"]);
    });
    releaseA();
    releaseB();
    await expect(Promise.all([a, b])).resolves.toEqual(["a", "b"]);
  });

  test("pathHash never includes the raw path", () => {
    const coordinator = new WorkspaceMutationCoordinator();
    const hash = coordinator.pathHash("/secret/repo/worktree");
    expect(hash).toMatch(/^[a-f0-9]{16}$/);
    expect(hash.includes("secret")).toBe(false);
  });
});
