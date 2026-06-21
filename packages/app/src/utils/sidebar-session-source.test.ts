import { describe, expect, it } from "vitest";
import type { AggregatedAgent } from "@/hooks/use-aggregated-agents";
import { mergeSidebarSessionSources } from "./sidebar-session-source";

function makeAgent(input: {
  id: string;
  serverId?: string;
  status?: AggregatedAgent["status"];
  lastActivityAt?: Date;
  archivedAt?: Date | null;
}): AggregatedAgent {
  return {
    id: input.id,
    serverId: input.serverId ?? "server-1",
    serverLabel: input.serverId ?? "server-1",
    title: input.id,
    status: input.status ?? "idle",
    lastActivityAt: input.lastActivityAt ?? new Date("2026-04-02T10:00:00.000Z"),
    cwd: "/repo",
    provider: "codex",
    pendingPermissionCount: 0,
    requiresAttention: false,
    attentionReason: null,
    attentionTimestamp: null,
    archivedAt: input.archivedAt ?? null,
    createdAt: new Date("2026-04-02T10:00:00.000Z"),
    labels: {},
  };
}

describe("mergeSidebarSessionSources", () => {
  it("shows live active agents even when history has not loaded them yet", () => {
    const result = mergeSidebarSessionSources({
      liveAgents: [makeAgent({ id: "live-agent" })],
      historyAgents: [],
      selectedAgentId: "live-agent",
    });

    expect(result.agents.map((agent) => agent.id)).toEqual(["live-agent"]);
    expect(result.selectedAgentId).toBe("live-agent");
  });

  it("dedupes history entries behind the live directory copy", () => {
    const liveAgent = makeAgent({ id: "agent-1", status: "running" });
    const historyAgent = makeAgent({ id: "agent-1", status: "closed" });

    const result = mergeSidebarSessionSources({
      liveAgents: [liveAgent],
      historyAgents: [historyAgent, makeAgent({ id: "agent-2" })],
      selectedAgentId: "agent-1",
    });

    expect(result.agents).toEqual([liveAgent, makeAgent({ id: "agent-2" })]);
  });

  it("drops stale selectedAgentId when it is absent from the merged list", () => {
    const result = mergeSidebarSessionSources({
      liveAgents: [makeAgent({ id: "agent-1" })],
      historyAgents: [],
      selectedAgentId: "missing-agent",
    });

    expect(result.selectedAgentId).toBeUndefined();
  });
});
