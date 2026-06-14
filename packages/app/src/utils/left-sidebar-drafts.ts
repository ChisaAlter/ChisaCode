import type { Href } from "expo-router";
import { collectAllTabs, type WorkspaceLayout } from "@/stores/workspace-layout-store";
import {
  buildHostWorkspaceOpenRoute,
  parseHostWorkspaceRouteFromPathname,
} from "@/utils/host-routes";

export interface SidebarSessionDraft {
  serverId: string;
  workspaceId: string;
  draftId: string;
  cwd: string | null;
  createdAt: Date;
}

export interface SidebarDraftWorkspaceMetadata {
  workspaceDirectory: string | null;
}

export function collectSidebarDraftSessions(input: {
  activeServerId: string | null;
  layoutByWorkspace: Record<string, WorkspaceLayout>;
  workspacesById: Record<string, SidebarDraftWorkspaceMetadata | undefined>;
}): SidebarSessionDraft[] {
  const activeServerId = input.activeServerId?.trim() || null;
  if (!activeServerId) {
    return [];
  }

  const drafts: SidebarSessionDraft[] = [];
  const workspaceKeyPrefix = `${activeServerId}:`;
  for (const [workspaceKey, layout] of Object.entries(input.layoutByWorkspace)) {
    if (!workspaceKey.startsWith(workspaceKeyPrefix)) {
      continue;
    }

    const workspaceId = workspaceKey.slice(workspaceKeyPrefix.length).trim();
    if (!workspaceId) {
      continue;
    }

    const cwd = input.workspacesById[workspaceId]?.workspaceDirectory?.trim() || null;
    for (const tab of collectAllTabs(layout.root)) {
      if (tab.target.kind !== "draft") {
        continue;
      }
      drafts.push({
        serverId: activeServerId,
        workspaceId,
        draftId: tab.target.draftId,
        cwd,
        createdAt: new Date(tab.createdAt),
      });
    }
  }

  drafts.sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  return drafts;
}

export function resolveLeftSidebarNewConversationRoute(input: {
  activeServerId: string | null;
  pathname: string;
}): Href | null {
  const activeServerId = input.activeServerId?.trim() || null;
  if (!activeServerId) {
    return null;
  }

  const workspaceRoute = parseHostWorkspaceRouteFromPathname(input.pathname);
  if (!workspaceRoute || workspaceRoute.serverId !== activeServerId) {
    return null;
  }
  return buildHostWorkspaceOpenRoute(activeServerId, workspaceRoute.workspaceId, "draft:new");
}
