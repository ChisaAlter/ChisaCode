import type { AggregatedAgent } from "@/hooks/use-aggregated-agents";
import { type Agent, useSessionStore } from "@/stores/session-store";

function buildHistoricalAgentDetail(agent: AggregatedAgent): Agent {
  return {
    serverId: agent.serverId,
    id: agent.id,
    provider: agent.provider,
    status: agent.status,
    createdAt: agent.createdAt,
    updatedAt: agent.lastActivityAt,
    lastUserMessageAt: null,
    lastActivityAt: agent.lastActivityAt,
    capabilities: {
      supportsStreaming: false,
      supportsSessionPersistence: false,
      supportsDynamicModes: false,
      supportsMcpServers: false,
      supportsReasoningStream: false,
      supportsToolInvocations: false,
    },
    currentModeId: null,
    availableModes: [],
    pendingPermissions: [],
    persistence: null,
    runtimeInfo: {
      provider: agent.provider,
      sessionId: null,
    },
    title: agent.title,
    cwd: agent.cwd,
    model: null,
    thinkingOptionId: null,
    requiresAttention: agent.requiresAttention,
    attentionReason: agent.attentionReason,
    attentionTimestamp: agent.attentionTimestamp,
    archivedAt: agent.archivedAt,
    labels: agent.labels,
    parentAgentId: null,
  };
}

export function rememberArchivedAgentDetail(agent: AggregatedAgent): void {
  if (!agent.archivedAt) {
    return;
  }

  useSessionStore.getState().setAgentDetails(agent.serverId, (previous) => {
    const existing = previous.get(agent.id);
    const next = new Map(previous);
    next.set(agent.id, {
      ...buildHistoricalAgentDetail(agent),
      ...existing,
      archivedAt: existing?.archivedAt ?? agent.archivedAt,
      cwd: existing?.cwd ?? agent.cwd,
    });
    return next;
  });
}
