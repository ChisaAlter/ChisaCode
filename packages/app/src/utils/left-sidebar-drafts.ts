import type { Href } from "expo-router";
import type { WorkspaceLayout } from "@/stores/workspace-layout-store";
import { buildHostNewWorkspaceRoute } from "@/utils/host-routes";

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

/**
 * 新对话 → Soft Home (/new)，不是 open-project 卡片墙。
 * 以默认路由实机为准。
 */
export function resolveLeftSidebarNewConversationRoute(input: {
  activeServerId: string | null;
  pathname: string;
  sourceDirectory?: string | null;
  draftKey?: string | null;
}): Href | null {
  const activeServerId = input.activeServerId?.trim() || null;
  if (!activeServerId) {
    return null;
  }
  void input.pathname;
  return buildHostNewWorkspaceRoute(activeServerId, input.sourceDirectory, {
    draftKey: input.draftKey ?? undefined,
  });
}

/**
 * 侧栏主页 → Soft Home (/new)。
 */
export function resolveLeftSidebarHomeRoute(activeServerId: string | null): Href | null {
  const normalizedServerId = activeServerId?.trim() || null;
  if (!normalizedServerId) {
    return null;
  }
  return buildHostNewWorkspaceRoute(normalizedServerId);
}
