import type { AggregatedAgent } from "@/hooks/use-aggregated-agents";

export interface SidebarSessionGroup {
  key: string;
  label: string;
  agents: AggregatedAgent[];
  newestActivityAt: Date;
}

export const PINNED_SIDEBAR_SESSION_GROUP_KEY = "__pinned__";

const WINDOWS_DRIVE_PREFIX = /^[a-z]:/i;
const WINDOWS_SEPARATOR = "\\";
const POSIX_SEPARATOR = "/";

function trimTrailingSeparators(value: string): string {
  let end = value.length;
  while (end > 1) {
    const char = value[end - 1];
    if (char !== POSIX_SEPARATOR && char !== WINDOWS_SEPARATOR) {
      break;
    }
    if (end === 3 && WINDOWS_DRIVE_PREFIX.test(value.slice(0, 2))) {
      break;
    }
    end -= 1;
  }
  return value.slice(0, end);
}

export function normalizeAgentCwdGroupKey(cwd: string | null | undefined): string {
  const trimmed = cwd?.trim() ?? "";
  if (!trimmed) {
    return "__unknown__";
  }
  const normalizedSeparators = trimmed.replaceAll(WINDOWS_SEPARATOR, POSIX_SEPARATOR);
  return trimTrailingSeparators(normalizedSeparators).toLocaleLowerCase();
}

export function getAgentCwdGroupLabel(
  cwd: string | null | undefined,
  fallbackLabel = "Unknown workspace",
): string {
  const trimmed = cwd?.trim() ?? "";
  if (!trimmed) {
    return fallbackLabel;
  }
  const cleaned = trimTrailingSeparators(trimmed);
  const normalized = cleaned.replaceAll(WINDOWS_SEPARATOR, POSIX_SEPARATOR);
  const parts = normalized.split(POSIX_SEPARATOR).filter(Boolean);
  return parts.at(-1) ?? cleaned;
}

export function groupAgentsForSidebar(
  agents: AggregatedAgent[],
  options?: {
    unknownWorkspaceLabel?: string;
    pinnedGroupLabel?: string;
    isPinnedAgent?: (agent: AggregatedAgent) => boolean;
  },
): SidebarSessionGroup[] {
  const groups = new Map<string, SidebarSessionGroup>();
  const unknownWorkspaceLabel = options?.unknownWorkspaceLabel ?? "Unknown workspace";
  const pinnedGroupLabel = options?.pinnedGroupLabel ?? "Pinned";
  const isPinnedAgent = options?.isPinnedAgent ?? (() => false);
  const pinnedAgents: AggregatedAgent[] = [];

  for (const agent of agents) {
    if (isPinnedAgent(agent)) {
      pinnedAgents.push(agent);
      continue;
    }

    const key = normalizeAgentCwdGroupKey(agent.cwd);
    const existing = groups.get(key);
    if (existing) {
      existing.agents.push(agent);
      if (agent.lastActivityAt.getTime() > existing.newestActivityAt.getTime()) {
        existing.newestActivityAt = agent.lastActivityAt;
      }
      continue;
    }

    groups.set(key, {
      key,
      label: getAgentCwdGroupLabel(agent.cwd, unknownWorkspaceLabel),
      agents: [agent],
      newestActivityAt: agent.lastActivityAt,
    });
  }

  const groupedAgents = Array.from(groups.values())
    .map((group) => ({
      key: group.key,
      label: group.label,
      newestActivityAt: group.newestActivityAt,
      agents: group.agents.slice().sort((left, right) => {
        return right.lastActivityAt.getTime() - left.lastActivityAt.getTime();
      }),
    }))
    .sort((left, right) => {
      return right.newestActivityAt.getTime() - left.newestActivityAt.getTime();
    });

  if (pinnedAgents.length === 0) {
    return groupedAgents;
  }

  const sortedPinnedAgents = pinnedAgents
    .slice()
    .sort((left, right) => right.lastActivityAt.getTime() - left.lastActivityAt.getTime());
  return [
    {
      key: PINNED_SIDEBAR_SESSION_GROUP_KEY,
      label: pinnedGroupLabel,
      agents: sortedPinnedAgents,
      newestActivityAt: sortedPinnedAgents[0]?.lastActivityAt ?? new Date(0),
    },
    ...groupedAgents,
  ];
}
