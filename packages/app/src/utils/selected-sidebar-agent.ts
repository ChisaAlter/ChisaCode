import {
  collectAllTabs,
  findPaneById,
  type SplitPane,
  type WorkspaceLayout,
} from "@/stores/workspace-layout-store";
import type { WorkspaceTab } from "@/stores/workspace-tabs-store";

function trimNonEmpty(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getOrderedWorkspaceTabs(input: {
  focusedPane: SplitPane | null;
  allTabs: WorkspaceTab[];
}): WorkspaceTab[] {
  if (!input.focusedPane) {
    return input.allTabs;
  }

  const tabsById = new Map<string, WorkspaceTab>();
  for (const tab of input.allTabs) {
    tabsById.set(tab.tabId, tab);
  }

  const orderedTabs: WorkspaceTab[] = [];
  for (const tabId of input.focusedPane.tabIds) {
    const tab = tabsById.get(tabId);
    if (tab) {
      orderedTabs.push(tab);
    }
  }
  return orderedTabs;
}

export function resolveSelectedSidebarAgentIdFromWorkspaceLayout(
  layout: WorkspaceLayout | null | undefined,
): string | null {
  if (!layout) {
    return null;
  }

  const allTabs = collectAllTabs(layout.root);
  const focusedPaneId = trimNonEmpty(layout.focusedPaneId);
  const focusedPane = focusedPaneId ? findPaneById(layout.root, focusedPaneId) : null;
  const orderedTabs = getOrderedWorkspaceTabs({ focusedPane, allTabs });
  const focusedTabId = trimNonEmpty(focusedPane?.focusedTabId);
  let selectedTab: WorkspaceTab | null = null;
  if (focusedTabId) {
    selectedTab = orderedTabs.find((tab) => tab.tabId === focusedTabId) ?? null;
  }
  if (!selectedTab) {
    selectedTab = orderedTabs[0] ?? null;
  }

  if (selectedTab?.target.kind !== "agent") {
    return null;
  }
  return trimNonEmpty(selectedTab.target.agentId);
}
