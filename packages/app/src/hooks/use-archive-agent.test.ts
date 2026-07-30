/**
 * @vitest-environment jsdom
 */
import React, { type ReactNode } from "react";
import type { DaemonClient } from "@chisacode/client/internal/daemon-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Agent } from "@/stores/session-store";
import { useSessionStore } from "@/stores/session-store";
import {
  buildWorkspaceTabPersistenceKey,
  useWorkspaceLayoutStore,
} from "@/stores/workspace-layout-store";
import { agentHistoryQueryKey } from "./agent-history-query-key";
import {
  applyArchivedAgentCloseResults,
  ARCHIVE_AGENT_SUPPRESSED_QUERY_KEY,
  isAgentArchiving,
  isArchiveAgentNotFoundError,
  removeAgentFromListPayload,
  resolveArchiveAgentClient,
  selectSuppressedArchiveAgentIds,
  selectPendingArchiveAgentIds,
  setAgentArchiving,
  useArchiveAgent,
} from "./use-archive-agent";

vi.mock("@react-native-async-storage/async-storage", () => {
  const storage = new Map<string, string>();
  return {
    default: {
      getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
      setItem: vi.fn(async (key: string, value: string) => {
        storage.set(key, value);
      }),
      removeItem: vi.fn(async (key: string) => {
        storage.delete(key);
      }),
    },
  };
});

vi.mock("@/runtime/host-runtime", () => ({
  getHostRuntimeStore: () => ({
    getClient: () => null,
  }),
}));

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    serverId: "server-a",
    id: "agent-1",
    provider: "codex",
    status: "running",
    createdAt: new Date("2026-04-01T03:00:00.000Z"),
    updatedAt: new Date("2026-04-01T03:00:00.000Z"),
    lastUserMessageAt: null,
    lastActivityAt: new Date("2026-04-01T03:00:00.000Z"),
    capabilities: {
      supportsStreaming: true,
      supportsSessionPersistence: true,
      supportsDynamicModes: true,
      supportsMcpServers: true,
      supportsReasoningStream: true,
      supportsToolInvocations: true,
    },
    currentModeId: null,
    availableModes: [],
    pendingPermissions: [],
    persistence: null,
    title: "Agent 1",
    cwd: "/repo",
    model: null,
    parentAgentId: null,
    labels: {},
    archivedAt: null,
    ...overrides,
  };
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function createQueryClientWrapper(queryClient: QueryClient) {
  const Wrapper = ({ children }: { children: ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return Wrapper;
}

describe("useArchiveAgent", () => {
  beforeEach(() => {
    useSessionStore.setState((state) => ({ ...state, sessions: {} }));
    useWorkspaceLayoutStore.setState({
      layoutByWorkspace: {},
      splitSizesByWorkspace: {},
      pinnedAgentIdsByWorkspace: {},
      hiddenAgentIdsByWorkspace: {},
      suppressedAutoOpenAgentIdsByWorkspace: {},
      suppressedAutoOpenTerminalIdsByWorkspace: {},
      workspaceAutoOpenSuppressedByWorkspace: {},
      focusRestorationByWorkspace: {},
    });
  });

  it("tracks pending archive state in shared react-query cache", () => {
    const queryClient = new QueryClient();

    expect(
      isAgentArchiving({
        queryClient,
        serverId: "server-a",
        agentId: "agent-1",
      }),
    ).toBe(false);

    setAgentArchiving({
      queryClient,
      serverId: "server-a",
      agentId: "agent-1",
      isArchiving: true,
    });

    expect(
      isAgentArchiving({
        queryClient,
        serverId: "server-a",
        agentId: "agent-1",
      }),
    ).toBe(true);
    expect(
      isAgentArchiving({
        queryClient,
        serverId: "server-a",
        agentId: "agent-2",
      }),
    ).toBe(false);

    setAgentArchiving({
      queryClient,
      serverId: "server-a",
      agentId: "agent-1",
      isArchiving: false,
    });

    expect(
      isAgentArchiving({
        queryClient,
        serverId: "server-a",
        agentId: "agent-1",
      }),
    ).toBe(false);
  });

  it("selects pending archive ids for a single server", () => {
    const pendingIds = selectPendingArchiveAgentIds(
      {
        "server-a:agent-1": true,
        "server-a:agent-2": true,
        "server-b:agent-3": true,
      },
      "server-a",
    );

    expect(Array.from(pendingIds)).toEqual(["agent-1", "agent-2"]);
  });

  it("uses the host runtime client when the session store has not attached one yet", () => {
    const runtimeClient = {
      archiveAgent: vi.fn(),
      closeItems: vi.fn(),
    } as Pick<DaemonClient, "archiveAgent" | "closeItems">;

    expect(
      resolveArchiveAgentClient({
        serverId: "server-a",
        sessionClient: null,
        runtimeClient,
      }),
    ).toBe(runtimeClient);
  });

  it("removes an archived agent from cached list payloads", () => {
    const payload = {
      entries: [{ agent: { id: "agent-1" } }, { agent: { id: "agent-2" } }],
      pageInfo: { hasMore: false },
    };

    const next = removeAgentFromListPayload(payload, "agent-1");

    expect(next.entries).toEqual([{ agent: { id: "agent-2" } }]);
    expect(next.pageInfo).toEqual({ hasMore: false });
  });

  it("applies archived agent close results to session state and cached lists", async () => {
    const queryClient = new QueryClient();
    useSessionStore.getState().initializeSession("server-a", {} as DaemonClient);
    useSessionStore.getState().setAgents("server-a", new Map([["agent-1", makeAgent()]]));
    queryClient.setQueryData(["sidebarAgentsList", "server-a"], {
      entries: [{ agent: { id: "agent-1" } }, { agent: { id: "agent-2" } }],
    });
    queryClient.setQueryData(["allAgents", "server-a"], {
      entries: [{ agent: { id: "agent-1" } }, { agent: { id: "agent-2" } }],
    });
    queryClient.setQueryData(agentHistoryQueryKey("server-a"), {
      pages: [
        {
          agents: [
            { id: "agent-1", archivedAt: null },
            { id: "agent-2", archivedAt: null },
          ],
        },
      ],
      pageParams: [null],
    });

    applyArchivedAgentCloseResults({
      queryClient,
      serverId: "server-a",
      results: [{ agentId: "agent-1", archivedAt: "2026-04-01T04:00:00.000Z" }],
    });

    expect(
      useSessionStore
        .getState()
        .sessions["server-a"]?.agents.get("agent-1")
        ?.archivedAt?.toISOString(),
    ).toBe("2026-04-01T04:00:00.000Z");
    expect(queryClient.getQueryData(["sidebarAgentsList", "server-a"])).toEqual({
      entries: [{ agent: { id: "agent-2" } }],
    });
    expect(queryClient.getQueryData(["allAgents", "server-a"])).toEqual({
      entries: [{ agent: { id: "agent-2" } }],
    });
    expect(queryClient.getQueryData(agentHistoryQueryKey("server-a"))).toEqual({
      pages: [
        {
          agents: [
            { id: "agent-1", archivedAt: new Date("2026-04-01T04:00:00.000Z") },
            { id: "agent-2", archivedAt: null },
          ],
        },
      ],
      pageParams: [null],
    });
    expect(
      selectSuppressedArchiveAgentIds(
        queryClient.getQueryData(ARCHIVE_AGENT_SUPPRESSED_QUERY_KEY) ?? {},
        "server-a",
      ),
    ).toEqual(new Set(["agent-1"]));
  });

  it("clears stale workspace pins when an agent is archived", () => {
    const queryClient = new QueryClient();
    const firstWorkspaceKey = buildWorkspaceTabPersistenceKey({
      serverId: "server-a",
      workspaceId: "workspace-a",
    });
    const secondWorkspaceKey = buildWorkspaceTabPersistenceKey({
      serverId: "server-a",
      workspaceId: "workspace-b",
    });

    expect(firstWorkspaceKey).toBeTruthy();
    expect(secondWorkspaceKey).toBeTruthy();

    useWorkspaceLayoutStore.getState().pinAgent(firstWorkspaceKey!, "agent-1");
    useWorkspaceLayoutStore.getState().pinAgent(secondWorkspaceKey!, "agent-1");
    useWorkspaceLayoutStore.getState().pinAgent(secondWorkspaceKey!, "agent-2");

    applyArchivedAgentCloseResults({
      queryClient,
      serverId: "server-a",
      results: [{ agentId: "agent-1", archivedAt: "2026-04-01T04:00:00.000Z" }],
      invalidateQueries: false,
    });

    const state = useWorkspaceLayoutStore.getState();
    expect(state.pinnedAgentIdsByWorkspace[firstWorkspaceKey!]).toBeUndefined();
    expect(Array.from(state.pinnedAgentIdsByWorkspace[secondWorkspaceKey!] ?? [])).toEqual([
      "agent-2",
    ]);
  });

  it("can apply archived agent close results without invalidating cached lists", () => {
    const queryClient = new QueryClient();
    useSessionStore.getState().initializeSession("server-a", {} as DaemonClient);
    useSessionStore.getState().setAgents("server-a", new Map([["agent-1", makeAgent()]]));
    queryClient.setQueryData(["sidebarAgentsList", "server-a"], {
      entries: [{ agent: { id: "agent-1" } }, { agent: { id: "agent-2" } }],
    });
    queryClient.setQueryData(["allAgents", "server-a"], {
      entries: [{ agent: { id: "agent-1" } }, { agent: { id: "agent-2" } }],
    });
    queryClient.setQueryData(agentHistoryQueryKey("server-a"), {
      pages: [
        {
          agents: [{ id: "agent-1", archivedAt: null }],
        },
      ],
      pageParams: [null],
    });

    applyArchivedAgentCloseResults({
      queryClient,
      serverId: "server-a",
      results: [{ agentId: "agent-1", archivedAt: "2026-04-01T04:00:00.000Z" }],
      invalidateQueries: false,
    });

    expect(queryClient.getQueryState(["sidebarAgentsList", "server-a"])?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(["allAgents", "server-a"])?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(agentHistoryQueryKey("server-a"))?.isInvalidated).toBe(false);
    expect(queryClient.getQueryData(agentHistoryQueryKey("server-a"))).toEqual({
      pages: [
        {
          agents: [{ id: "agent-1", archivedAt: new Date("2026-04-01T04:00:00.000Z") }],
        },
      ],
      pageParams: [null],
    });
  });

  it("archive mutation cancels stale list queries and keeps the server archivedAt in caches", async () => {
    const queryClient = createQueryClient();
    const archiveAgent = vi.fn().mockResolvedValue({ archivedAt: "2026-04-01T05:00:00.000Z" });
    const cancelQueriesSpy = vi.spyOn(queryClient, "cancelQueries");
    useSessionStore.getState().initializeSession("server-a", {
      archiveAgent,
    } as unknown as DaemonClient);
    useSessionStore.getState().setAgents("server-a", new Map([["agent-1", makeAgent()]]));
    queryClient.setQueryData(["sidebarAgentsList", "server-a"], {
      entries: [{ agent: { id: "agent-1" } }, { agent: { id: "agent-2" } }],
    });
    queryClient.setQueryData(["allAgents", "server-a"], {
      entries: [{ agent: { id: "agent-1" } }, { agent: { id: "agent-2" } }],
    });
    queryClient.setQueryData(agentHistoryQueryKey("server-a"), {
      pages: [
        {
          agents: [{ id: "agent-1", archivedAt: null }],
        },
      ],
      pageParams: [null],
    });
    const { result } = renderHook(() => useArchiveAgent(), {
      wrapper: createQueryClientWrapper(queryClient),
    });

    await act(async () => {
      await result.current.archiveAgent({
        serverId: "server-a",
        agentId: "agent-1",
      });
    });

    expect(cancelQueriesSpy).toHaveBeenCalledWith({
      queryKey: ["sidebarAgentsList", "server-a"],
    });
    expect(cancelQueriesSpy).toHaveBeenCalledWith({
      queryKey: ["allAgents", "server-a"],
    });
    expect(cancelQueriesSpy).toHaveBeenCalledWith({
      queryKey: agentHistoryQueryKey("server-a"),
    });
    expect(archiveAgent).toHaveBeenCalledWith("agent-1");
    expect(queryClient.getQueryData(["sidebarAgentsList", "server-a"])).toEqual({
      entries: [{ agent: { id: "agent-2" } }],
    });
    expect(queryClient.getQueryData(["allAgents", "server-a"])).toEqual({
      entries: [{ agent: { id: "agent-2" } }],
    });
    expect(queryClient.getQueryData(agentHistoryQueryKey("server-a"))).toEqual({
      pages: [
        {
          agents: [{ id: "agent-1", archivedAt: new Date("2026-04-01T05:00:00.000Z") }],
        },
      ],
      pageParams: [null],
    });
    expect(
      selectSuppressedArchiveAgentIds(
        queryClient.getQueryData(ARCHIVE_AGENT_SUPPRESSED_QUERY_KEY) ?? {},
        "server-a",
      ),
    ).toEqual(new Set(["agent-1"]));
    await waitFor(() => {
      expect(
        isAgentArchiving({
          queryClient,
          serverId: "server-a",
          agentId: "agent-1",
        }),
      ).toBe(false);
    });
  });

  it("treats agent-not-found archive responses as stale rows that should stay hidden", async () => {
    const queryClient = createQueryClient();
    const archiveAgent = vi
      .fn()
      .mockRejectedValue(
        new Error(
          "Request failed: Agent not found: agent-1 requestType=archive_agent_request code=handler_error",
        ),
      );
    useSessionStore.getState().initializeSession("server-a", {
      archiveAgent,
    } as unknown as DaemonClient);
    queryClient.setQueryData(agentHistoryQueryKey("server-a"), {
      pages: [
        {
          agents: [{ id: "agent-1", archivedAt: null }],
        },
      ],
      pageParams: [null],
    });
    const { result } = renderHook(() => useArchiveAgent(), {
      wrapper: createQueryClientWrapper(queryClient),
    });

    await act(async () => {
      await expect(
        result.current.archiveAgent({
          serverId: "server-a",
          agentId: "agent-1",
        }),
      ).resolves.toBeUndefined();
    });

    expect(
      selectSuppressedArchiveAgentIds(
        queryClient.getQueryData(ARCHIVE_AGENT_SUPPRESSED_QUERY_KEY) ?? {},
        "server-a",
      ),
    ).toEqual(new Set(["agent-1"]));
    expect(queryClient.getQueryData(agentHistoryQueryKey("server-a"))).toEqual({
      pages: [
        {
          agents: [{ id: "agent-1", archivedAt: expect.any(Date) }],
        },
      ],
      pageParams: [null],
    });
  });

  it("swallows the post-archive storage-not-found message from already-archived agents", async () => {
    // Server post-archive guard emits "Agent not found in storage after archive:"
    // (no colon after "found"). The old regex only matched "Agent not found:", so
    // re-archiving a stale already-archived row popped a toast.
    const queryClient = createQueryClient();
    const archiveAgent = vi
      .fn()
      .mockRejectedValue(
        new Error(
          "Request failed: Agent not found in storage after archive: agent-1 requestType=archive_agent_request code=handler_error",
        ),
      );
    useSessionStore.getState().initializeSession("server-a", {
      archiveAgent,
    } as unknown as DaemonClient);
    const { result } = renderHook(() => useArchiveAgent(), {
      wrapper: createQueryClientWrapper(queryClient),
    });

    await act(async () => {
      await expect(
        result.current.archiveAgent({
          serverId: "server-a",
          agentId: "agent-1",
        }),
      ).resolves.toBeUndefined();
    });

    expect(
      selectSuppressedArchiveAgentIds(
        queryClient.getQueryData(ARCHIVE_AGENT_SUPPRESSED_QUERY_KEY) ?? {},
        "server-a",
      ),
    ).toEqual(new Set(["agent-1"]));
  });

  it("does not treat batch closeItems count mismatches as not-found swallowable errors", () => {
    // Guard the public helper still only applies to archive_agent_request paths.
    expect(isArchiveAgentNotFoundError(new Error("server-a: failed to archive 2 session(s)"))).toBe(
      false,
    );
  });
});
