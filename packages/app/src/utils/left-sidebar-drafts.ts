import type { Href } from "expo-router";
import type { WorkspaceLayout } from "@/stores/workspace-layout-store";
import {
  buildHostOpenProjectRoute,
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

export function collectSidebarDraftSessions(_input: {
  activeServerId: string | null;
  layoutByWorkspace: Record<string, WorkspaceLayout>;
  workspacesById: Record<string, SidebarDraftWorkspaceMetadata | undefined>;
}): SidebarSessionDraft[] {
  return [];
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

export function resolveLeftSidebarHomeRoute(activeServerId: string | null): Href | null {
  const normalizedServerId = activeServerId?.trim() || null;
  if (!normalizedServerId) {
    return null;
  }
  return buildHostOpenProjectRoute(normalizedServerId);
}
