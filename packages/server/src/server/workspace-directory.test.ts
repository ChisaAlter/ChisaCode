import { describe, expect, test, vi } from "vitest";
import type { AgentSnapshotPayload, WorkspaceDescriptorPayload } from "./messages.js";
import { WorkspaceDirectory } from "./workspace-directory.js";
import { normalizeWorkspaceId } from "./workspace-registry-model.js";
import { asSessionLogger } from "./test-utils/session-stubs.js";
import type { PersistedProjectRecord, PersistedWorkspaceRecord } from "./workspace-registry.js";

function createProject(projectId: string): PersistedProjectRecord {
  return {
    projectId,
    rootPath: `/tmp/${projectId}`,
    kind: "git",
    displayName: projectId,
    customName: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    archivedAt: null,
  };
}

function createWorkspaceRecord(workspaceId: string, cwd: string): PersistedWorkspaceRecord {
  return {
    workspaceId,
    projectId: "project-1",
    cwd,
    kind: "local_checkout",
    displayName: workspaceId,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    archivedAt: null,
  };
}

function createDescriptor(workspaceId: string, cwd: string): WorkspaceDescriptorPayload {
  return {
    id: workspaceId,
    projectId: "project-1",
    projectDisplayName: "project-1",
    projectCustomName: null,
    projectRootPath: "/tmp/project-1",
    workspaceDirectory: cwd,
    projectKind: "git",
    workspaceKind: "local_checkout",
    name: workspaceId,
    archivingAt: null,
    status: "done",
    activityAt: null,
    diffStat: null,
    scripts: [],
  };
}

function createAgent(input: {
  id: string;
  cwd: string;
  status?: AgentSnapshotPayload["status"];
}): AgentSnapshotPayload {
  return {
    id: input.id,
    provider: "claude",
    cwd: input.cwd,
    model: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    lastUserMessageAt: null,
    status: input.status ?? "running",
    capabilities: {
      supportsStreaming: true,
      supportsSessionPersistence: true,
      supportsDynamicModes: false,
      supportsMcpServers: false,
      supportsReasoningStream: false,
      supportsToolInvocations: true,
    },
    currentModeId: null,
    availableModes: [],
    pendingPermissions: [],
    persistence: null,
    title: null,
    labels: {},
  };
}

function createDirectory(input: {
  workspaces: PersistedWorkspaceRecord[];
  agents: AgentSnapshotPayload[];
}) {
  const listAgentPayloads = vi.fn(async (scope?: { cwds?: ReadonlySet<string> }) => {
    if (!scope?.cwds) {
      return input.agents;
    }
    const cwds = scope.cwds;
    return input.agents.filter((agent) => cwds.has(normalizeWorkspaceId(agent.cwd)));
  });
  const directory = new WorkspaceDirectory({
    logger: asSessionLogger({ debug: vi.fn() }),
    projectRegistry: { list: async () => [createProject("project-1")] },
    workspaceRegistry: { list: async () => input.workspaces },
    listAgentPayloads,
    isProviderVisibleToClient: () => true,
    buildWorkspaceDescriptor: async ({ workspace }) =>
      createDescriptor(workspace.workspaceId, workspace.cwd),
  });
  return { directory, listAgentPayloads };
}

describe("WorkspaceDirectory.buildDescriptorMap", () => {
  test("scoped rebuild only requests agents inside the target workspace directories", async () => {
    const wsA = createWorkspaceRecord("ws-a", "/tmp/project-1/a");
    const wsB = createWorkspaceRecord("ws-b", "/tmp/project-1/b");
    const { directory, listAgentPayloads } = createDirectory({
      workspaces: [wsA, wsB],
      agents: [
        createAgent({ id: "agent-a", cwd: wsA.cwd, status: "running" }),
        createAgent({ id: "agent-b", cwd: wsB.cwd, status: "running" }),
      ],
    });

    const descriptors = await directory.buildDescriptorMap({
      includeGitData: false,
      workspaceIds: [wsA.workspaceId],
    });

    expect(listAgentPayloads).toHaveBeenCalledTimes(1);
    const scope = listAgentPayloads.mock.calls[0][0];
    expect(scope?.cwds).toEqual(new Set([normalizeWorkspaceId(wsA.cwd)]));

    expect(Array.from(descriptors.keys())).toEqual([wsA.workspaceId]);
    // The running agent inside ws-a still elevates that workspace's status.
    expect(descriptors.get(wsA.workspaceId)?.status).toBe("running");
  });

  test("unscoped rebuild requests the full agent list and rolls up every workspace", async () => {
    const wsA = createWorkspaceRecord("ws-a", "/tmp/project-1/a");
    const wsB = createWorkspaceRecord("ws-b", "/tmp/project-1/b");
    const { directory, listAgentPayloads } = createDirectory({
      workspaces: [wsA, wsB],
      agents: [
        createAgent({ id: "agent-a", cwd: wsA.cwd, status: "running" }),
        createAgent({ id: "agent-b", cwd: wsB.cwd, status: "closed" }),
      ],
    });

    const descriptors = await directory.buildDescriptorMap({ includeGitData: false });

    expect(listAgentPayloads).toHaveBeenCalledTimes(1);
    expect(listAgentPayloads.mock.calls[0][0]?.cwds).toBeUndefined();
    expect(descriptors.get(wsA.workspaceId)?.status).toBe("running");
    expect(descriptors.get(wsB.workspaceId)?.status).toBe("done");
  });

  test("archived agents and agents outside any workspace never affect the rollup", async () => {
    const wsA = createWorkspaceRecord("ws-a", "/tmp/project-1/a");
    const archivedAgent = {
      ...createAgent({ id: "agent-archived", cwd: wsA.cwd, status: "running" }),
      archivedAt: "2026-08-20T00:00:00.000Z",
    };
    const { directory } = createDirectory({
      workspaces: [wsA],
      agents: [archivedAgent, createAgent({ id: "agent-stray", cwd: "/elsewhere" })],
    });

    const descriptors = await directory.buildDescriptorMap({
      includeGitData: false,
      workspaceIds: [wsA.workspaceId],
    });

    expect(descriptors.get(wsA.workspaceId)?.status).toBe("done");
  });
});
