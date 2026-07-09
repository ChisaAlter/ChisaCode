import { describe, expect, it, vi } from "vitest";
import type { DaemonClient } from "@chisacode/client/internal/daemon-client";
import type { WorkspaceDescriptor } from "@/stores/session-store";
import { hydrateWorkspaceDescriptors } from "./session-workspace-hydration";

const SERVER_ID = "server-1";

function workspacePayload(id: string) {
  return {
    id,
    projectId: "project-1",
    projectDisplayName: "Project",
    projectRootPath: "/repo",
    workspaceDirectory: `/repo/${id}`,
    projectKind: "git" as const,
    workspaceKind: "worktree" as const,
    name: id,
    status: "done" as const,
    activityAt: null,
    diffStat: null,
    scripts: [],
    archivingAt: null,
  };
}

function createRecorder() {
  const workspaceWrites: Array<{
    serverId: string;
    workspaces: Map<string, WorkspaceDescriptor>;
  }> = [];
  const hydrationWrites: Array<{ serverId: string; hydrated: boolean }> = [];
  return {
    workspaceWrites,
    hydrationWrites,
    setWorkspaces: (serverId: string, workspaces: Map<string, WorkspaceDescriptor>) => {
      workspaceWrites.push({ serverId, workspaces });
    },
    setHasHydratedWorkspaces: (serverId: string, hydrated: boolean) => {
      hydrationWrites.push({ serverId, hydrated });
    },
  };
}

describe("hydrateWorkspaceDescriptors", () => {
  it("writes fetched workspaces and marks hydration complete", async () => {
    const recorder = createRecorder();
    const client = {
      fetchWorkspaces: vi.fn(async () => ({
        requestId: "request-1",
        entries: [workspacePayload("workspace-1")],
        pageInfo: { hasMore: false, nextCursor: null },
        subscriptionId: null,
        error: null,
      })),
    } as unknown as Pick<DaemonClient, "fetchWorkspaces">;

    await hydrateWorkspaceDescriptors({
      client,
      serverId: SERVER_ID,
      setWorkspaces: recorder.setWorkspaces,
      setHasHydratedWorkspaces: recorder.setHasHydratedWorkspaces,
    });

    expect(recorder.workspaceWrites).toHaveLength(1);
    expect(recorder.workspaceWrites[0]?.workspaces.has("workspace-1")).toBe(true);
    expect(recorder.hydrationWrites).toEqual([{ serverId: SERVER_ID, hydrated: true }]);
  });

  it("marks hydration complete after fetch failure without wiping cached workspaces", async () => {
    const recorder = createRecorder();
    const client = {
      fetchWorkspaces: vi.fn(async () => {
        throw new Error("Timeout waiting for message (10000ms)");
      }),
    } as unknown as Pick<DaemonClient, "fetchWorkspaces">;

    await expect(
      hydrateWorkspaceDescriptors({
        client,
        serverId: SERVER_ID,
        setWorkspaces: recorder.setWorkspaces,
        setHasHydratedWorkspaces: recorder.setHasHydratedWorkspaces,
      }),
    ).rejects.toThrow("Timeout waiting for message");

    expect(recorder.workspaceWrites).toEqual([]);
    expect(recorder.hydrationWrites).toEqual([{ serverId: SERVER_ID, hydrated: true }]);
  });

  it("marks hydration complete when fetch never settles", async () => {
    vi.useFakeTimers();
    try {
      const recorder = createRecorder();
      const client = {
        fetchWorkspaces: vi.fn(() => new Promise<never>(() => {})),
      } as unknown as Pick<DaemonClient, "fetchWorkspaces">;

      const promise = hydrateWorkspaceDescriptors(
        {
          client,
          serverId: SERVER_ID,
          setWorkspaces: recorder.setWorkspaces,
          setHasHydratedWorkspaces: recorder.setHasHydratedWorkspaces,
        },
        { timeoutMs: 25 },
      );
      const expectation = expect(promise).rejects.toThrow(
        "Workspace hydration request timed out (25ms)",
      );

      await vi.advanceTimersByTimeAsync(25);

      await expectation;
      expect(recorder.workspaceWrites).toEqual([]);
      expect(recorder.hydrationWrites).toEqual([{ serverId: SERVER_ID, hydrated: true }]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not mark hydration complete when the request is cancelled", async () => {
    const recorder = createRecorder();
    const client = {
      fetchWorkspaces: vi.fn(async () => ({
        requestId: "request-1",
        entries: [workspacePayload("workspace-1")],
        pageInfo: { hasMore: false, nextCursor: null },
        subscriptionId: null,
        error: null,
      })),
    } as unknown as Pick<DaemonClient, "fetchWorkspaces">;

    await hydrateWorkspaceDescriptors(
      {
        client,
        serverId: SERVER_ID,
        setWorkspaces: recorder.setWorkspaces,
        setHasHydratedWorkspaces: recorder.setHasHydratedWorkspaces,
      },
      { isCancelled: () => true },
    );

    expect(recorder.workspaceWrites).toEqual([]);
    expect(recorder.hydrationWrites).toEqual([]);
  });
});
