import { afterEach, describe, expect, it } from "vitest";
import type { DaemonClient, FetchAgentsEntry } from "@chisacode/client/internal/daemon-client";
import type { AgentSnapshotPayload } from "@chisacode/protocol/messages";
import { PARENT_AGENT_ID_LABEL } from "@chisacode/protocol/agent-labels";
import { useCreateFlowStore } from "@/stores/create-flow-store";
import { type Agent, useSessionStore } from "@/stores/session-store";
import { replaceFetchedAgentDirectory } from "./agent-directory-sync";

function createAgentPayload(
  input: Partial<Omit<AgentSnapshotPayload, "labels">> & {
    id: string;
    labels?: Record<string, string>;
  },
): AgentSnapshotPayload {
  return {
    id: input.id,
    provider: input.provider ?? "codex",
    cwd: input.cwd ?? "/repo",
    model: input.model ?? null,
    createdAt: input.createdAt ?? "2026-04-20T00:00:00.000Z",
    updatedAt: input.updatedAt ?? "2026-04-20T00:01:00.000Z",
    lastUserMessageAt: input.lastUserMessageAt ?? null,
    status: input.status ?? "idle",
    capabilities: input.capabilities ?? {
      supportsStreaming: true,
      supportsSessionPersistence: true,
      supportsDynamicModes: true,
      supportsMcpServers: true,
      supportsReasoningStream: true,
      supportsToolInvocations: true,
    },
    currentModeId: input.currentModeId ?? null,
    availableModes: input.availableModes ?? [],
    pendingPermissions: input.pendingPermissions ?? [],
    persistence: input.persistence ?? null,
    title: input.title ?? null,
    labels: input.labels ?? {},
  };
}

function createEntry(agent: AgentSnapshotPayload): FetchAgentsEntry {
  return {
    agent,
    project: {
      projectKey: agent.cwd,
      projectName: "repo",
      checkout: {
        cwd: agent.cwd,
        isGit: false,
        currentBranch: null,
        remoteUrl: null,
        worktreeRoot: null,
        isChisaCodeOwnedWorktree: false,
        mainRepoRoot: null,
      },
    },
  };
}

function buildLocalAgent(input: {
  serverId: string;
  id: string;
  createdAt: Date;
  title?: string;
}): Agent {
  return {
    serverId: input.serverId,
    id: input.id,
    provider: "grokbuild",
    status: "running",
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    lastUserMessageAt: input.createdAt,
    lastActivityAt: input.createdAt,
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
    runtimeInfo: { provider: "grok-4-5-grokbuild", sessionId: null, model: "grok-4.5" },
    title: input.title ?? "你怎么看这个项目",
    cwd: "/repo/chisa-terminal",
    model: "grok-4.5",
    archivedAt: null,
    parentAgentId: null,
    labels: {},
    projectPlacement: {
      projectKey: "/repo/chisa-terminal",
      projectName: "ChisaTerminal",
      checkout: {
        cwd: "/repo/chisa-terminal",
        isGit: false,
        currentBranch: null,
        remoteUrl: null,
        worktreeRoot: null,
        isChisaCodeOwnedWorktree: false,
        mainRepoRoot: null,
      },
    },
  };
}

function seedLocalAgent(serverId: string, agent: Agent): void {
  useSessionStore.getState().setAgents(serverId, (prev) => {
    const next = new Map(prev);
    next.set(agent.id, agent);
    return next;
  });
}

describe("replaceFetchedAgentDirectory", () => {
  afterEach(() => {
    useCreateFlowStore.getState().clearAll();
  });

  it("re-derives parentAgentId every time an agent snapshot is ingested", () => {
    const serverId = "server-1";
    const store = useSessionStore.getState();
    store.initializeSession(serverId, null as unknown as DaemonClient);

    replaceFetchedAgentDirectory({
      serverId,
      entries: [
        createEntry(
          createAgentPayload({
            id: "child-1",
            labels: { [PARENT_AGENT_ID_LABEL]: "parent-a" },
          }),
        ),
      ],
    });

    replaceFetchedAgentDirectory({
      serverId,
      entries: [
        createEntry(
          createAgentPayload({
            id: "child-1",
            labels: { [PARENT_AGENT_ID_LABEL]: "parent-b" },
          }),
        ),
      ],
    });

    expect(
      useSessionStore.getState().sessions[serverId]?.agents.get("child-1")?.parentAgentId,
    ).toBe("parent-b");

    store.clearSession(serverId);
  });

  it("preserves a pending optimistic local agent that the concurrent directory fetch missed", () => {
    const serverId = "server-1";
    const store = useSessionStore.getState();
    store.initializeSession(serverId, null as unknown as DaemonClient);

    const createdAt = new Date("2026-08-09T12:00:00.000Z");
    seedLocalAgent(serverId, buildLocalAgent({ serverId, id: "local-new", createdAt }));
    useCreateFlowStore.getState().setPending({
      draftId: "draft-1",
      serverId,
      agentId: "local-new",
      clientMessageId: "cm-1",
      text: "你怎么看这个项目",
      timestamp: createdAt.getTime(),
    });

    // The fetch snapshot started after the create, yet still missed the agent
    // (daemon-side directory lag). The pending create record protects the row.
    replaceFetchedAgentDirectory({
      serverId,
      entries: [createEntry(createAgentPayload({ id: "old-1", cwd: "/repo/other" }))],
      fetchStartedAt: new Date("2026-08-09T12:00:05.000Z"),
    });

    const agents = useSessionStore.getState().sessions[serverId]?.agents;
    expect(agents?.has("local-new")).toBe(true);
    expect(agents?.get("local-new")?.title).toBe("你怎么看这个项目");
    expect(agents?.has("old-1")).toBe(true);

    store.clearSession(serverId);
  });

  it("preserves a local agent created after the fetch snapshot started", () => {
    const serverId = "server-1";
    const store = useSessionStore.getState();
    store.initializeSession(serverId, null as unknown as DaemonClient);

    const createdAt = new Date("2026-08-09T12:00:10.000Z");
    seedLocalAgent(serverId, buildLocalAgent({ serverId, id: "local-after-fetch", createdAt }));

    replaceFetchedAgentDirectory({
      serverId,
      entries: [],
      fetchStartedAt: new Date("2026-08-09T12:00:00.000Z"),
    });

    expect(useSessionStore.getState().sessions[serverId]?.agents.has("local-after-fetch")).toBe(
      true,
    );

    store.clearSession(serverId);
  });

  it("drops a stale local agent the fetch authoritatively omitted", () => {
    const serverId = "server-1";
    const store = useSessionStore.getState();
    store.initializeSession(serverId, null as unknown as DaemonClient);

    const createdAt = new Date("2026-03-30T15:29:00.000Z");
    seedLocalAgent(serverId, buildLocalAgent({ serverId, id: "agent-archived", createdAt }));

    replaceFetchedAgentDirectory({
      serverId,
      entries: [],
      fetchStartedAt: new Date("2026-08-09T12:00:00.000Z"),
    });

    expect(useSessionStore.getState().sessions[serverId]?.agents.has("agent-archived")).toBe(false);

    store.clearSession(serverId);
  });

  it("conservatively preserves local-only agents when the fetch start time is unknown", () => {
    const serverId = "server-1";
    const store = useSessionStore.getState();
    store.initializeSession(serverId, null as unknown as DaemonClient);

    const createdAt = new Date("2026-03-30T15:29:00.000Z");
    seedLocalAgent(serverId, buildLocalAgent({ serverId, id: "local-unknown-fetch", createdAt }));

    replaceFetchedAgentDirectory({ serverId, entries: [] });

    expect(useSessionStore.getState().sessions[serverId]?.agents.has("local-unknown-fetch")).toBe(
      true,
    );

    store.clearSession(serverId);
  });
});
