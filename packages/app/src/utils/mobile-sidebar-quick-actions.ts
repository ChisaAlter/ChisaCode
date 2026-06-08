import { buildHostWorkspaceOpenRoute } from "@/utils/host-routes";

export interface MobileSidebarQuickActionModel {
  workspaceId: string | null;
  changesRoute: string | null;
  terminalRoute: string | null;
}

export type MobileSidebarQuickActionId = "resume" | "changes" | "terminal" | "sessions" | "close";

export interface MobileSidebarQuickActionButtonModel {
  id: MobileSidebarQuickActionId;
  variant: "primary" | "secondary";
}

export interface MobileSidebarQuickActionAgent {
  id: string;
  serverId: string;
  title?: string | null;
  cwd?: string | null;
  archivedAt?: string | Date | null;
}

export interface MobileSidebarQuickActionAgentTarget {
  serverId: string;
  agentId: string;
}

function trimNonEmpty(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function hasArchivedAt(value: string | Date | null | undefined): boolean {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime());
  }
  return trimNonEmpty(value) !== null;
}

export function selectMobileSidebarQuickActionAgent<Agent extends MobileSidebarQuickActionAgent>(
  agents: readonly Agent[],
  selectedAgentId: string | null | undefined,
  preferredServerId?: string | null,
): Agent | null {
  const availableAgents = agents.filter(
    (agent) =>
      !hasArchivedAt(agent.archivedAt) && trimNonEmpty(agent.serverId) && trimNonEmpty(agent.id),
  );
  const selected = trimNonEmpty(selectedAgentId);
  const preferredServer = trimNonEmpty(preferredServerId);
  if (selected) {
    const qualifiedMatch = availableAgents.find(
      (agent) => `${agent.serverId}:${agent.id}` === selected,
    );
    const preferredPlainMatch = preferredServer
      ? availableAgents.find((agent) => agent.serverId === preferredServer && agent.id === selected)
      : null;
    const plainMatch = availableAgents.find((agent) => agent.id === selected);
    const matched = qualifiedMatch ?? preferredPlainMatch ?? plainMatch;
    if (matched) {
      return matched;
    }
  }
  return (
    (preferredServer
      ? availableAgents.find((agent) => agent.serverId === preferredServer)
      : null) ??
    availableAgents[0] ??
    null
  );
}

export function resolveMobileSidebarQuickActionAgentLabel(
  agent: Pick<MobileSidebarQuickActionAgent, "title" | "cwd" | "id">,
): string {
  return (
    trimNonEmpty(agent.title) ??
    resolveMobileSidebarQuickActionCwdLabel(agent.cwd) ??
    trimNonEmpty(agent.id) ??
    "Agent"
  );
}

function resolveMobileSidebarQuickActionCwdLabel(cwd: string | null | undefined): string | null {
  const value = trimNonEmpty(cwd);
  if (!value) {
    return null;
  }
  const normalized = value.replace(/\\/g, "/").replace(/\/+$/, "");
  const segments = normalized.split("/").filter((segment) => segment.length > 0);
  return segments.at(-1) ?? value;
}

export function resolveMobileSidebarQuickActionAgentTarget(
  agent: Pick<MobileSidebarQuickActionAgent, "serverId" | "id"> | null | undefined,
): MobileSidebarQuickActionAgentTarget | null {
  const serverId = trimNonEmpty(agent?.serverId);
  const agentId = trimNonEmpty(agent?.id);
  if (!serverId || !agentId) {
    return null;
  }
  return { serverId, agentId };
}

export function buildMobileSidebarQuickActionModel(input: {
  serverId: string | null | undefined;
  workspaceId: string | null | undefined;
  projectKind: string | null | undefined;
}): MobileSidebarQuickActionModel {
  const serverId = trimNonEmpty(input.serverId);
  const workspaceId = trimNonEmpty(input.workspaceId);
  const canViewChanges = trimNonEmpty(input.projectKind)?.toLowerCase() === "git";
  if (!serverId || !workspaceId) {
    return {
      workspaceId: null,
      changesRoute: null,
      terminalRoute: null,
    };
  }
  return {
    workspaceId,
    changesRoute: canViewChanges
      ? buildHostWorkspaceOpenRoute(serverId, workspaceId, "changes:review")
      : null,
    terminalRoute: buildHostWorkspaceOpenRoute(serverId, workspaceId, "terminal:new"),
  };
}

export function buildMobileSidebarQuickActionButtons(input: {
  hasAgentTarget: boolean;
  changesRoute: string | null | undefined;
  terminalRoute: string | null | undefined;
  canViewSessions: boolean;
}): MobileSidebarQuickActionButtonModel[] {
  const buttons: MobileSidebarQuickActionButtonModel[] = [];
  if (input.hasAgentTarget) {
    buttons.push({ id: "resume", variant: "primary" });
  }
  if (trimNonEmpty(input.changesRoute)) {
    buttons.push({ id: "changes", variant: "secondary" });
  }
  if (trimNonEmpty(input.terminalRoute)) {
    buttons.push({ id: "terminal", variant: "secondary" });
  }
  if (input.canViewSessions) {
    buttons.push({ id: "sessions", variant: "secondary" });
  }
  buttons.push({ id: "close", variant: "secondary" });
  return buttons;
}
