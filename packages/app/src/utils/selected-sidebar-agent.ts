import type { WorkspaceTabTarget } from "@/workspace-tabs/identity";

function trimNonEmpty(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Resolves the agent id currently shown by the workspace center column
 * @param activeTarget The workspace active content target, if any
 * @returns The active agent id, or null when the workspace shows no agent
 */
export function resolveSelectedSidebarAgentIdFromWorkspaceLayout(
  activeTarget: WorkspaceTabTarget | null | undefined,
): string | null {
  if (!activeTarget || activeTarget.kind !== "agent") {
    return null;
  }
  return trimNonEmpty(activeTarget.agentId);
}
