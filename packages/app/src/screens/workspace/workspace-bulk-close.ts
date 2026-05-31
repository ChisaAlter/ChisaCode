import type { DaemonClient } from "@chisacode/client/internal/daemon-client";
import type { WorkspaceTabDescriptor } from "@/screens/workspace/workspace-tabs-types";

export interface BulkClosableTabGroups {
  agentTabs: Array<{ tabId: string; agentId: string }>;
  terminalTabs: Array<{ tabId: string; terminalId: string }>;
  otherTabs: Array<{ tabId: string; target: WorkspaceTabDescriptor["target"] }>;
}

interface CloseWorkspaceTabWithCleanupInput {
  tabId: string;
  target?: WorkspaceTabDescriptor["target"];
}

interface CloseBulkWorkspaceTabsInput {
  client: Pick<DaemonClient, "closeItems"> | null;
  groups: BulkClosableTabGroups;
  closeTab: (tabId: string, action: () => Promise<void>) => Promise<void>;
  closeWorkspaceTabWithCleanup: (input: CloseWorkspaceTabWithCleanupInput) => void;
  logLabel: string;
  warn?: (message: string, payload: object) => void;
}

export function classifyBulkClosableTabs(tabs: WorkspaceTabDescriptor[]): BulkClosableTabGroups {
  const groups: BulkClosableTabGroups = {
    agentTabs: [],
    terminalTabs: [],
    otherTabs: [],
  };

  for (const tab of tabs) {
    if (tab.target.kind === "agent") {
      groups.agentTabs.push({ tabId: tab.tabId, agentId: tab.target.agentId });
      continue;
    }
    if (tab.target.kind === "terminal") {
      groups.terminalTabs.push({ tabId: tab.tabId, terminalId: tab.target.terminalId });
      continue;
    }
    groups.otherTabs.push({ tabId: tab.tabId, target: tab.target });
  }

  return groups;
}

export function buildBulkCloseConfirmationMessage(input: BulkClosableTabGroups): string {
  const { agentTabs, terminalTabs, otherTabs } = input;
  if (agentTabs.length > 0 && terminalTabs.length > 0 && otherTabs.length > 0) {
    return `这会归档 ${agentTabs.length} 个智能体、关闭 ${terminalTabs.length} 个终端，并关闭 ${otherTabs.length} 个标签页。已关闭终端中正在运行的进程会立即停止。`;
  }
  if (agentTabs.length > 0 && terminalTabs.length > 0) {
    return `这会归档 ${agentTabs.length} 个智能体并关闭 ${terminalTabs.length} 个终端。已关闭终端中正在运行的进程会立即停止。`;
  }
  if (terminalTabs.length > 0 && otherTabs.length > 0) {
    return `这会关闭 ${terminalTabs.length} 个终端和 ${otherTabs.length} 个标签页。已关闭终端中正在运行的进程会立即停止。`;
  }
  if (agentTabs.length > 0 && otherTabs.length > 0) {
    return `这会归档 ${agentTabs.length} 个智能体并关闭 ${otherTabs.length} 个标签页。`;
  }
  if (terminalTabs.length > 0) {
    return `这会关闭 ${terminalTabs.length} 个终端。已关闭终端中正在运行的进程会立即停止。`;
  }
  if (otherTabs.length > 0) {
    return `这会关闭 ${otherTabs.length} 个标签页。`;
  }
  return `这会归档 ${agentTabs.length} 个智能体。`;
}

export async function closeBulkWorkspaceTabs(input: CloseBulkWorkspaceTabsInput): Promise<void> {
  const { client, groups, closeTab, closeWorkspaceTabWithCleanup, logLabel, warn } = input;
  const hasDestructiveTabs = groups.agentTabs.length > 0 || groups.terminalTabs.length > 0;

  if (hasDestructiveTabs && client) {
    void client
      .closeItems({
        agentIds: groups.agentTabs.map((tab) => tab.agentId),
        terminalIds: groups.terminalTabs.map((tab) => tab.terminalId),
      })
      .catch((error) => {
        warn?.(`[WorkspaceScreen] Failed to bulk close tabs ${logLabel}`, { error });
      });
  } else if (hasDestructiveTabs) {
    warn?.(`[WorkspaceScreen] Failed to bulk close tabs ${logLabel}`, {
      error: new Error("Daemon client not available"),
    });
  }

  for (const { tabId, agentId } of groups.agentTabs) {
    void closeTab(tabId, async () => {
      closeWorkspaceTabWithCleanup({
        tabId,
        target: { kind: "agent", agentId },
      });
    });
  }

  for (const { tabId, terminalId } of groups.terminalTabs) {
    void closeTab(tabId, async () => {
      closeWorkspaceTabWithCleanup({
        tabId,
        target: { kind: "terminal", terminalId },
      });
    });
  }

  for (const { tabId, target } of groups.otherTabs) {
    void closeTab(tabId, async () => {
      closeWorkspaceTabWithCleanup({ tabId, target });
    });
  }
}
