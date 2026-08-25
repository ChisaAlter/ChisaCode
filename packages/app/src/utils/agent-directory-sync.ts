import type { FetchAgentsEntry } from "@chisacode/client/internal/daemon-client";
import { useCreateFlowStore } from "@/stores/create-flow-store";
import { type Agent, useSessionStore } from "@/stores/session-store";
import { derivePendingPermissionKey, normalizeAgentSnapshot } from "@/utils/agent-snapshots";
import { resolveProjectPlacement } from "@/utils/project-placement";

type AgentDirectoryFetchEntry = FetchAgentsEntry;

interface PendingPermissionEntry {
  key: string;
  agentId: string;
  request: Agent["pendingPermissions"][number];
}

/**
 * Builds session-store agent and pending-permission maps from a directory fetch
 * @param input Server id and fetched agent directory entries
 * @returns Normalized agents map and pending permission entries keyed for the store
 */
export function buildAgentDirectoryState(input: {
  serverId: string;
  entries: AgentDirectoryFetchEntry[];
}): {
  agents: Map<string, Agent>;
  pendingPermissions: Map<string, PendingPermissionEntry>;
} {
  const agents = new Map<string, Agent>();
  const pendingPermissions = new Map<string, PendingPermissionEntry>();

  for (const entry of input.entries) {
    const normalized = normalizeAgentSnapshot(entry.agent, input.serverId);
    const projectPlacement = resolveProjectPlacement({
      projectPlacement: entry.project,
      cwd: normalized.cwd,
    });
    const agent: Agent = {
      ...normalized,
      projectPlacement,
    };
    agents.set(agent.id, agent);

    for (const request of agent.pendingPermissions) {
      const key = derivePendingPermissionKey(agent.id, request);
      pendingPermissions.set(key, { key, agentId: agent.id, request });
    }
  }

  return { agents, pendingPermissions };
}

/**
 * Merges just-created or optimistic local agents into a fetched directory map so
 * a concurrent directory refresh cannot wipe rows that the UI already knows about,
 * while still letting the fetch drop agents the daemon no longer reports.
 *
 * A local agent missing from the fetch survives only when it is still protected:
 * either an in-flight optimistic create tracks it, or its local timestamps are
 * newer than the moment the fetch started (the fetch snapshot cannot know about
 * it yet). Everything else missing from the fetch is authoritatively stale —
 * archived or deleted on the daemon — and is dropped.
 * @param input Fetched agents, local agents, protected optimistic ids, and the fetch start time
 * @returns Directory map with protected/newer local agents preserved
 */
export function mergeLocalAgentsIntoFetchedDirectory(input: {
  fetchedAgents: Map<string, Agent>;
  localAgents: Iterable<Agent>;
  protectedAgentIds?: ReadonlySet<string>;
  fetchStartedAt?: Date | null;
}): Map<string, Agent> {
  const fetchStartedAtMs = input.fetchStartedAt ? input.fetchStartedAt.getTime() : null;
  let next: Map<string, Agent> | null = null;
  for (const local of input.localAgents) {
    if (local.archivedAt) {
      continue;
    }
    const fetched = input.fetchedAgents.get(local.id);
    if (!fetched) {
      const isProtectedOptimistic = input.protectedAgentIds?.has(local.id) ?? false;
      // When the fetch start time is unknown, keep the conservative legacy
      // behavior of preserving the row rather than risking a vanishing
      // just-created agent.
      const isNewerThanFetch =
        fetchStartedAtMs === null ||
        local.createdAt.getTime() > fetchStartedAtMs ||
        local.updatedAt.getTime() > fetchStartedAtMs;
      if (!isProtectedOptimistic && !isNewerThanFetch) {
        continue;
      }
      next ??= new Map(input.fetchedAgents);
      next.set(local.id, local);
      continue;
    }
    if (local.updatedAt.getTime() <= fetched.updatedAt.getTime()) {
      continue;
    }
    next ??= new Map(input.fetchedAgents);
    next.set(local.id, {
      ...fetched,
      ...local,
      projectPlacement: local.projectPlacement ?? fetched.projectPlacement ?? null,
    });
  }
  return next ?? input.fetchedAgents;
}

/**
 * Collects agent ids with an in-flight optimistic create for a server so a
 * concurrent directory replace cannot wipe their sidebar rows.
 * @param serverId The server whose pending optimistic creates to collect
 * @returns Set of agent ids that must survive a directory replace
 */
function collectPendingOptimisticAgentIds(serverId: string): ReadonlySet<string> {
  const pendingIds = new Set<string>();
  for (const pending of Object.values(useCreateFlowStore.getState().pendingByDraftId)) {
    if (pending.serverId === serverId && pending.agentId && pending.lifecycle !== "abandoned") {
      pendingIds.add(pending.agentId);
    }
  }
  return pendingIds;
}

/**
 * Replaces the session-store agent directory for a server with fetched entries
 * @param input Server id, daemon fetch results, and the time the fetch started
 * (used to protect local rows the fetch snapshot cannot know about; omit only
 * when unknown, which conservatively preserves local-only rows)
 * @returns The agents map written into the session store
 */
export function replaceFetchedAgentDirectory(input: {
  serverId: string;
  entries: FetchAgentsEntry[];
  fetchStartedAt?: Date | null;
}): { agents: Map<string, Agent> } {
  const { agents: fetchedAgents, pendingPermissions } = buildAgentDirectoryState(input);
  const store = useSessionStore.getState();
  const previousAgents = store.sessions[input.serverId]?.agents;
  const agents = previousAgents
    ? mergeLocalAgentsIntoFetchedDirectory({
        fetchedAgents,
        localAgents: previousAgents.values(),
        protectedAgentIds: collectPendingOptimisticAgentIds(input.serverId),
        fetchStartedAt: input.fetchStartedAt ?? null,
      })
    : fetchedAgents;

  store.setAgents(input.serverId, agents);
  store.setAgentDetails(input.serverId, (prev) => {
    let next: Map<string, Agent> | null = null;
    for (const agentId of agents.keys()) {
      if (!prev.has(agentId)) {
        continue;
      }
      next ??= new Map(prev);
      next.delete(agentId);
    }
    return next ?? prev;
  });

  const lastActivityByAgentId = new Map<string, Date>();
  for (const agent of agents.values()) {
    lastActivityByAgentId.set(agent.id, agent.lastActivityAt);
  }
  store.setAgentLastActivityBatch(lastActivityByAgentId);

  store.setPendingPermissions(input.serverId, new Map(pendingPermissions));
  store.setInitializingAgents(input.serverId, new Map());
  store.setHasHydratedAgents(input.serverId, true);
  return { agents };
}
