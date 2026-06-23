import type { AggregatedAgent } from "@/hooks/use-aggregated-agents";
import type { Agent } from "@/stores/session-store";

function getAgentSourceKey(agent: Pick<AggregatedAgent, "serverId" | "id">): string {
  return `${agent.serverId}:${agent.id}`;
}

function getActivityTime(agent: AggregatedAgent): number {
  const value = agent.lastActivityAt.getTime();
  return Number.isFinite(value) ? value : 0;
}

function compareSidebarLiveAgents(left: AggregatedAgent, right: AggregatedAgent): number {
  const leftRunning = left.status === "running";
  const rightRunning = right.status === "running";
  if (leftRunning && !rightRunning) {
    return -1;
  }
  if (!leftRunning && rightRunning) {
    return 1;
  }
  return getActivityTime(right) - getActivityTime(left);
}

export function buildSidebarLiveAgents(input: {
  agents: Map<string, Agent> | undefined;
  serverId: string | null;
  serverLabel: string;
}): AggregatedAgent[] {
  if (!input.serverId || !input.agents) {
    return [];
  }
  const liveAgents: AggregatedAgent[] = [];
  for (const agent of input.agents.values()) {
    if (agent.archivedAt) {
      continue;
    }
    liveAgents.push({
      id: agent.id,
      serverId: input.serverId,
      serverLabel: input.serverLabel,
      title: agent.title ?? null,
      status: agent.status,
      lastActivityAt: agent.lastActivityAt,
      cwd: agent.cwd,
      provider: agent.provider,
      pendingPermissionCount: agent.pendingPermissions.length,
      requiresAttention: agent.requiresAttention,
      attentionReason: agent.attentionReason,
      attentionTimestamp: agent.attentionTimestamp ?? null,
      archivedAt: agent.archivedAt ?? null,
      createdAt: agent.createdAt,
      labels: agent.labels,
      projectPlacement: agent.projectPlacement ?? null,
    });
  }
  liveAgents.sort(compareSidebarLiveAgents);
  return liveAgents;
}

export function mergeSidebarSessionSources(input: {
  liveAgents: AggregatedAgent[];
  historyAgents: AggregatedAgent[];
  suppressedAgentIds?: ReadonlySet<string>;
  selectedAgentId?: string;
}): { agents: AggregatedAgent[]; selectedAgentId?: string } {
  const merged: AggregatedAgent[] = [];
  const seen = new Set<string>();
  for (const agent of [...input.liveAgents, ...input.historyAgents]) {
    if (input.suppressedAgentIds?.has(agent.id)) {
      continue;
    }
    const key = getAgentSourceKey(agent);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(agent);
  }
  const selectedAgentId =
    input.selectedAgentId &&
    merged.some(
      (agent) =>
        agent.id === input.selectedAgentId ||
        `${agent.serverId}:${agent.id}` === input.selectedAgentId,
    )
      ? input.selectedAgentId
      : undefined;
  return {
    agents: merged,
    selectedAgentId,
  };
}
