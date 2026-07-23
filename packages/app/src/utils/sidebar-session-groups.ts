import type { AggregatedAgent } from "@/hooks/use-aggregated-agents";

/** A group of agent sessions shown under one workspace heading in the sidebar. */
export interface SidebarSessionGroup {
  key: string;
  label: string;
  cwd: string | null;
  projectKey: string | null;
  agents: AggregatedAgent[];
  newestActivityAt: Date;
}

/** Group key reserved for the synthetic pinned-agents group in the sidebar. */
export const PINNED_SIDEBAR_SESSION_GROUP_KEY = "__pinned__";

/**
 * Reconciles a persisted ordering against the keys that currently exist.
 * @param storedOrder The previously persisted key order
 * @param currentKeys The keys that exist now
 * @returns The stored order filtered to existing keys, with new keys appended
 */
export function reconcileSidebarSessionOrder(
  storedOrder: readonly string[],
  currentKeys: readonly string[],
): string[] {
  const currentKeySet = new Set(currentKeys);
  const resolved = storedOrder.filter((key) => currentKeySet.has(key));
  const resolvedKeySet = new Set(resolved);
  for (const key of currentKeys) {
    if (!resolvedKeySet.has(key)) {
      resolved.push(key);
      resolvedKeySet.add(key);
    }
  }
  return resolved;
}

function orderItemsByKeys<T>(
  items: T[],
  keys: readonly string[],
  getKey: (item: T) => string,
): T[] {
  const itemByKey = new Map(items.map((item) => [getKey(item), item] as const));
  const ordered: T[] = [];
  for (const key of reconcileSidebarSessionOrder(keys, items.map(getKey))) {
    const item = itemByKey.get(key);
    if (item) {
      ordered.push(item);
    }
  }
  return ordered;
}

/**
 * Applies a stable, user-controlled order to sidebar groups and their agents, keeping pinned groups first.
 * @param groups The session groups to order
 * @param input The persisted group order, per-group agent order, and optionally pinned group keys
 * @returns A new array of groups with stable ordering applied to both groups and agents
 */
export function applyStableSidebarSessionOrder<T extends SidebarSessionGroup>(
  groups: T[],
  input: {
    groupOrder: readonly string[];
    agentOrderByGroup: Readonly<Record<string, readonly string[]>>;
    pinnedGroupKeys?: ReadonlySet<string>;
  },
): T[] {
  const pinnedGroup = groups.find((group) => group.key === PINNED_SIDEBAR_SESSION_GROUP_KEY);
  const workspaceGroups = groups.filter((group) => group.key !== PINNED_SIDEBAR_SESSION_GROUP_KEY);
  const orderedWorkspaceGroups = orderItemsByKeys(
    workspaceGroups,
    input.groupOrder,
    (group) => group.key,
  );
  const pinnedGroupKeys = input.pinnedGroupKeys ?? new Set<string>();
  const pinnedWorkspaceGroups = orderedWorkspaceGroups.filter((group) =>
    pinnedGroupKeys.has(group.key),
  );
  const unpinnedWorkspaceGroups = orderedWorkspaceGroups.filter(
    (group) => !pinnedGroupKeys.has(group.key),
  );
  const orderedGroups = pinnedGroup
    ? [pinnedGroup, ...pinnedWorkspaceGroups, ...unpinnedWorkspaceGroups]
    : [...pinnedWorkspaceGroups, ...unpinnedWorkspaceGroups];

  const result: T[] = [];
  for (const group of orderedGroups) {
    result.push({
      ...group,
      agents: orderItemsByKeys(
        group.agents,
        input.agentOrderByGroup[group.key] ?? [],
        (agent) => agent.id,
      ),
    });
  }
  return result;
}

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

/**
 * Normalizes an agent working directory into a stable group key.
 * @param cwd The agent working directory
 * @returns A lowercased, separator-normalized key, or "__unknown__" when the cwd is blank
 */
export function normalizeAgentCwdGroupKey(cwd: string | null | undefined): string {
  const trimmed = cwd?.trim() ?? "";
  if (!trimmed) {
    return "__unknown__";
  }
  const normalizedSeparators = trimmed.replaceAll(WINDOWS_SEPARATOR, POSIX_SEPARATOR);
  return trimTrailingSeparators(normalizedSeparators).toLocaleLowerCase();
}

/**
 * Derives a human-readable group label from an agent working directory.
 * @param cwd The agent working directory
 * @param fallbackLabel The label to use when the cwd is blank
 * @returns The last path segment, or the fallback label when the cwd is blank
 */
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

function getChisaCodeOwnedProjectRoot(agent: AggregatedAgent): string | null {
  const placement = agent.projectPlacement;
  if (placement?.checkout.isChisaCodeOwnedWorktree !== true) {
    return null;
  }
  const mainRepoRoot = placement.checkout.mainRepoRoot?.trim() ?? "";
  if (mainRepoRoot) {
    return mainRepoRoot;
  }
  const projectKey = placement.projectKey.trim();
  return projectKey || null;
}

function getSidebarSessionGroupKey(agent: AggregatedAgent): string {
  return normalizeAgentCwdGroupKey(getChisaCodeOwnedProjectRoot(agent) ?? agent.cwd);
}

function getSidebarSessionGroupLabel(
  agent: AggregatedAgent,
  fallbackLabel = "Unknown workspace",
): string {
  const ownedProjectRoot = getChisaCodeOwnedProjectRoot(agent);
  if (ownedProjectRoot) {
    return getAgentCwdGroupLabel(ownedProjectRoot, fallbackLabel);
  }
  return getAgentCwdGroupLabel(agent.cwd, fallbackLabel);
}

function getSidebarSessionGroupCwd(agent: AggregatedAgent): string | null {
  return (getChisaCodeOwnedProjectRoot(agent) ?? agent.cwd)?.trim() || null;
}

function getSidebarSessionProjectKey(agent: AggregatedAgent): string | null {
  const projectKey = agent.projectPlacement?.projectKey.trim() ?? "";
  if (projectKey) {
    return projectKey;
  }
  return getSidebarSessionGroupCwd(agent);
}

function getActivityTime(value: Date): number {
  const time = value.getTime();
  return Number.isFinite(time) ? time : 0;
}

function isNewerActivity(left: Date, right: Date): boolean {
  return getActivityTime(left) > getActivityTime(right);
}

function compareActivityDatesDescending(left: Date, right: Date): number {
  return getActivityTime(right) - getActivityTime(left);
}

function compareAgentsByActivityDescending(left: AggregatedAgent, right: AggregatedAgent): number {
  return compareActivityDatesDescending(left.lastActivityAt, right.lastActivityAt);
}

/**
 * Groups agents into sidebar session sections keyed by workspace, with pinned agents lifted into a leading group.
 * @param agents The agents to group
 * @param options Optional labels for unknown/pinned groups and a pinned-agent predicate
 * @returns The session groups sorted by most recent activity, with the pinned group first when present
 */
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

    const key = getSidebarSessionGroupKey(agent);
    const existing = groups.get(key);
    if (existing) {
      existing.agents.push(agent);
      if (isNewerActivity(agent.lastActivityAt, existing.newestActivityAt)) {
        existing.newestActivityAt = agent.lastActivityAt;
      }
      continue;
    }

    groups.set(key, {
      key,
      label: getSidebarSessionGroupLabel(agent, unknownWorkspaceLabel),
      cwd: getSidebarSessionGroupCwd(agent),
      projectKey: getSidebarSessionProjectKey(agent),
      agents: [agent],
      newestActivityAt: agent.lastActivityAt,
    });
  }

  const groupedAgents = Array.from(groups.values())
    .map((group) => ({
      key: group.key,
      label: group.label,
      cwd: group.cwd,
      projectKey: group.projectKey,
      newestActivityAt: group.newestActivityAt,
      agents: group.agents.slice().sort(compareAgentsByActivityDescending),
    }))
    .sort((left, right) => {
      return compareActivityDatesDescending(left.newestActivityAt, right.newestActivityAt);
    });

  if (pinnedAgents.length === 0) {
    return groupedAgents;
  }

  const sortedPinnedAgents = pinnedAgents.slice().sort(compareAgentsByActivityDescending);
  return [
    {
      key: PINNED_SIDEBAR_SESSION_GROUP_KEY,
      label: pinnedGroupLabel,
      cwd: null,
      projectKey: null,
      agents: sortedPinnedAgents,
      newestActivityAt: sortedPinnedAgents[0]?.lastActivityAt ?? new Date(0),
    },
    ...groupedAgents,
  ];
}
