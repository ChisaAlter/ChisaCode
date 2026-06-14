import type { WorkspaceTabTarget } from "@/stores/workspace-tabs-store";

export interface CloseAgentWorkspaceTabOnlyInput {
  tabId: string;
  agentId: string;
  persistenceKey: string | null;
  closeWorkspaceTabWithCleanup: (input: { tabId: string; target?: WorkspaceTabTarget }) => void;
  suppressAgentAutoOpen: (workspaceKey: string, agentId: string) => void;
  unpinAgent: (workspaceKey: string, agentId: string) => void;
  setHoveredTabKey: (updater: (current: string | null) => string | null) => void;
  setHoveredCloseTabKey: (updater: (current: string | null) => string | null) => void;
}

export function closeAgentWorkspaceTabOnly(input: CloseAgentWorkspaceTabOnlyInput): void {
  input.setHoveredTabKey((current) => (current === input.tabId ? null : current));
  input.setHoveredCloseTabKey((current) => (current === input.tabId ? null : current));
  if (!input.persistenceKey) {
    return;
  }

  input.unpinAgent(input.persistenceKey, input.agentId);
  input.suppressAgentAutoOpen(input.persistenceKey, input.agentId);
  input.closeWorkspaceTabWithCleanup({
    tabId: input.tabId,
  });
}
