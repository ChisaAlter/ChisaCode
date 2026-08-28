import { describe, expect, it, vi } from "vitest";
import type { ProjectPlacementPayload } from "@chisacode/protocol/messages";
import type { Agent } from "@/stores/session-store";
import { __private__, createAggregatedAgentCache } from "./use-aggregated-agents";

vi.mock("@/runtime/host-runtime", () => ({
  getHostRuntimeStore: () => ({
    getSnapshot: vi.fn(),
    getVersion: vi.fn(() => 0),
    refreshAllAgentDirectories: vi.fn(),
    subscribeAll: vi.fn(() => () => undefined),
  }),
  useHosts: () => [],
}));

const BASE_TIME = new Date("2026-03-08T10:00:00.000Z");

const AGENT_DEFAULTS: Agent = {
  serverId: "server-1",
  id: "agent-1",
  provider: "codex",
  status: "idle",
  createdAt: BASE_TIME,
  updatedAt: BASE_TIME,
  lastUserMessageAt: null,
  lastActivityAt: BASE_TIME,
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
  runtimeInfo: undefined,
  lastUsage: undefined,
  lastError: null,
  title: "Agent",
  cwd: "/tmp/project",
  model: null,
  thinkingOptionId: undefined,
  requiresAttention: false,
  attentionReason: null,
  attentionTimestamp: null,
  archivedAt: null,
  parentAgentId: null,
  labels: {},
  projectPlacement: null,
};

function makeAgent(input?: Partial<Agent>): Agent {
  return { ...AGENT_DEFAULTS, ...input };
}

describe("buildAggregatedAgentsResult", () => {
  it("sorts running agents first and keeps invalid activity timestamps stable", () => {
    const result = __private__.buildAggregatedAgentsResult({
      hosts: [{ serverId: "server-1", label: "Local", agentDirectoryStatus: "ready" }],
      sessionAgents: {
        "server-1": new Map([
          [
            "invalid",
            makeAgent({
              id: "invalid",
              lastActivityAt: new Date(Number.NaN),
            }),
          ],
          [
            "recent",
            makeAgent({
              id: "recent",
              lastActivityAt: new Date("2026-03-08T12:00:00.000Z"),
            }),
          ],
          [
            "running",
            makeAgent({
              id: "running",
              status: "running",
              lastActivityAt: new Date("2026-03-08T09:00:00.000Z"),
            }),
          ],
        ]),
      },
      includeArchived: false,
    });

    expect(result.agents.map((agent) => agent.id)).toEqual(["running", "recent", "invalid"]);
  });

  it("filters archived agents by default and keeps host labels", () => {
    const result = __private__.buildAggregatedAgentsResult({
      hosts: [{ serverId: "server-1", label: "Local", agentDirectoryStatus: "ready" }],
      sessionAgents: {
        "server-1": new Map([
          ["visible", makeAgent({ id: "visible" })],
          [
            "archived",
            makeAgent({
              id: "archived",
              archivedAt: new Date("2026-03-08T11:00:00.000Z"),
            }),
          ],
        ]),
      },
      includeArchived: false,
    });

    expect(result.agents).toEqual([
      expect.objectContaining({
        id: "visible",
        serverLabel: "Local",
      }),
    ]);
  });

  it("preserves project placement from live session agents", () => {
    const projectPlacement: ProjectPlacementPayload = {
      projectKey: "C:\\Ai\\sample-desktop",
      projectName: "sample-desktop",
      checkout: {
        cwd: "C:\\Users\\48818\\.chisacode\\worktrees\\hash\\gallant-owl",
        isGit: true,
        currentBranch: "codex/gallant-owl",
        remoteUrl: null,
        worktreeRoot: "C:\\Users\\48818\\.chisacode\\worktrees\\hash\\gallant-owl",
        isChisaCodeOwnedWorktree: true,
        mainRepoRoot: "C:\\Ai\\sample-desktop",
      },
    };

    const result = __private__.buildAggregatedAgentsResult({
      hosts: [{ serverId: "server-1", label: "Local", agentDirectoryStatus: "ready" }],
      sessionAgents: {
        "server-1": new Map([
          [
            "owned-worktree",
            makeAgent({
              id: "owned-worktree",
              cwd: "C:\\Users\\48818\\.chisacode\\worktrees\\hash\\gallant-owl",
              projectPlacement,
            }),
          ],
        ]),
      },
      includeArchived: false,
    });

    expect(result.agents[0]?.projectPlacement).toEqual(projectPlacement);
  });

  it("derives initial loading and revalidating states from host directory status", () => {
    const initial = __private__.buildAggregatedAgentsResult({
      hosts: [{ serverId: "server-1", label: "Local", agentDirectoryStatus: "initial_loading" }],
      sessionAgents: {},
      includeArchived: false,
    });
    const revalidating = __private__.buildAggregatedAgentsResult({
      hosts: [{ serverId: "server-1", label: "Local", agentDirectoryStatus: "revalidating" }],
      sessionAgents: {
        "server-1": new Map([["visible", makeAgent({ id: "visible" })]]),
      },
      includeArchived: false,
    });
    const errorAfterReady = __private__.buildAggregatedAgentsResult({
      hosts: [{ serverId: "server-1", label: "Local", agentDirectoryStatus: "error_after_ready" }],
      sessionAgents: {
        "server-1": new Map([["visible", makeAgent({ id: "visible" })]]),
      },
      includeArchived: false,
    });

    expect(initial).toMatchObject({
      isLoading: true,
      isInitialLoad: true,
      isRevalidating: false,
    });
    expect(revalidating).toMatchObject({
      isLoading: true,
      isInitialLoad: false,
      isRevalidating: true,
    });
    expect(errorAfterReady).toMatchObject({
      isLoading: false,
      isInitialLoad: false,
      isRevalidating: false,
    });
  });
});

describe("createAggregatedAgentCache", () => {
  it("reuses the wrapper for an unchanged agent object across rebuilds", () => {
    const aggregate = createAggregatedAgentCache();
    const agent = makeAgent({ id: "stable" });

    const first = aggregate({ agent, serverId: "server-1", serverLabel: "Local" });
    const second = aggregate({ agent, serverId: "server-1", serverLabel: "Local" });

    expect(second).toBe(first);
    expect(first).toMatchObject({ id: "stable", serverId: "server-1", serverLabel: "Local" });
  });

  it("rebuilds the wrapper when the agent object identity changes", () => {
    const aggregate = createAggregatedAgentCache();
    const agent = makeAgent({ id: "changing" });
    const first = aggregate({ agent, serverId: "server-1", serverLabel: "Local" });

    const updated = { ...agent, status: "running" as const };
    const second = aggregate({ agent: updated, serverId: "server-1", serverLabel: "Local" });

    expect(second).not.toBe(first);
    expect(second.status).toBe("running");
  });

  it("rebuilds the wrapper when the server label changes", () => {
    const aggregate = createAggregatedAgentCache();
    const agent = makeAgent({ id: "relabeled" });
    const first = aggregate({ agent, serverId: "server-1", serverLabel: "Local" });
    const second = aggregate({ agent, serverId: "server-1", serverLabel: "Renamed" });

    expect(second).not.toBe(first);
    expect(second.serverLabel).toBe("Renamed");
  });

  it("keeps identical results in the full aggregation for unchanged agents", () => {
    const aggregate = createAggregatedAgentCache();
    const stable = makeAgent({ id: "stable" });
    const before = __private__.buildAggregatedAgentsResult({
      hosts: [{ serverId: "server-1", label: "Local", agentDirectoryStatus: "ready" }],
      sessionAgents: { "server-1": new Map([["stable", stable]]) },
      includeArchived: false,
      aggregate,
    });
    const after = __private__.buildAggregatedAgentsResult({
      hosts: [{ serverId: "server-1", label: "Local", agentDirectoryStatus: "ready" }],
      sessionAgents: {
        "server-1": new Map([
          ["stable", stable],
          ["fresh", makeAgent({ id: "fresh" })],
        ]),
      },
      includeArchived: false,
      aggregate,
    });

    const stableBefore = before.agents.find((agent) => agent.id === "stable");
    const stableAfter = after.agents.find((agent) => agent.id === "stable");
    expect(stableAfter).toBe(stableBefore);
  });
});
