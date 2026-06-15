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

export interface BulkCloseConfirmationCopy {
  allKinds: (input: { agentCount: number; terminalCount: number; otherCount: number }) => string;
  agentsAndTerminals: (input: { agentCount: number; terminalCount: number }) => string;
  terminalsAndOthers: (input: { terminalCount: number; otherCount: number }) => string;
  agentsAndOthers: (input: { agentCount: number; otherCount: number }) => string;
  terminalsOnly: (input: { terminalCount: number }) => string;
  othersOnly: (input: { otherCount: number }) => string;
  agentsOnly: (input: { agentCount: number }) => string;
}

const DEFAULT_BULK_CLOSE_CONFIRMATION_COPY: BulkCloseConfirmationCopy = {
  allKinds: ({ agentCount, terminalCount, otherCount }) =>
    `This will close ${agentCount} agent tab(s), close ${terminalCount} terminal(s), and close ${otherCount} other tab(s). Any running process in a closed terminal will be stopped immediately.`,
  agentsAndTerminals: ({ agentCount, terminalCount }) =>
    `This will close ${agentCount} agent tab(s) and close ${terminalCount} terminal(s). Any running process in a closed terminal will be stopped immediately.`,
  terminalsAndOthers: ({ terminalCount, otherCount }) =>
    `This will close ${terminalCount} terminal(s) and ${otherCount} tab(s). Any running process in a closed terminal will be stopped immediately.`,
  agentsAndOthers: ({ agentCount, otherCount }) =>
    `This will close ${agentCount} agent tab(s) and close ${otherCount} other tab(s).`,
  terminalsOnly: ({ terminalCount }) =>
    `This will close ${terminalCount} terminal(s). Any running process in a closed terminal will be stopped immediately.`,
  othersOnly: ({ otherCount }) => `This will close ${otherCount} tab(s).`,
  agentsOnly: ({ agentCount }) => `This will close ${agentCount} agent tab(s).`,
};

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

export function buildBulkCloseConfirmationMessage(
  input: BulkClosableTabGroups,
  copy: BulkCloseConfirmationCopy = DEFAULT_BULK_CLOSE_CONFIRMATION_COPY,
): string {
  const { agentTabs, terminalTabs, otherTabs } = input;
  if (agentTabs.length > 0 && terminalTabs.length > 0 && otherTabs.length > 0) {
    return copy.allKinds({
      agentCount: agentTabs.length,
      terminalCount: terminalTabs.length,
      otherCount: otherTabs.length,
    });
  }
  if (agentTabs.length > 0 && terminalTabs.length > 0) {
    return copy.agentsAndTerminals({
      agentCount: agentTabs.length,
      terminalCount: terminalTabs.length,
    });
  }
  if (terminalTabs.length > 0 && otherTabs.length > 0) {
    return copy.terminalsAndOthers({
      terminalCount: terminalTabs.length,
      otherCount: otherTabs.length,
    });
  }
  if (agentTabs.length > 0 && otherTabs.length > 0) {
    return copy.agentsAndOthers({
      agentCount: agentTabs.length,
      otherCount: otherTabs.length,
    });
  }
  if (terminalTabs.length > 0) {
    return copy.terminalsOnly({ terminalCount: terminalTabs.length });
  }
  if (otherTabs.length > 0) {
    return copy.othersOnly({ otherCount: otherTabs.length });
  }
  return copy.agentsOnly({ agentCount: agentTabs.length });
}

export async function closeBulkWorkspaceTabs(input: CloseBulkWorkspaceTabsInput): Promise<void> {
  const { client, groups, closeTab, closeWorkspaceTabWithCleanup, logLabel, warn } = input;
  const hasTerminalTabs = groups.terminalTabs.length > 0;

  if (hasTerminalTabs && client) {
    void client
      .closeItems({
        terminalIds: groups.terminalTabs.map((tab) => tab.terminalId),
      })
      .catch((error) => {
        warn?.(`[WorkspaceScreen] Failed to bulk close tabs ${logLabel}`, { error });
      });
  } else if (hasTerminalTabs) {
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
