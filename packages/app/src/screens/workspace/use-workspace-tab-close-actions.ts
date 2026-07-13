import type { DaemonClient } from "@chisacode/client/internal/daemon-client";
import { useCallback, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useTranslation } from "react-i18next";

import { getDesktopHost } from "@/desktop/host";
import { closeAgentWorkspaceTabOnly } from "@/screens/workspace/workspace-agent-tab-close";
import {
  buildBulkCloseConfirmationMessage,
  classifyBulkClosableTabs,
  closeBulkWorkspaceTabs,
} from "@/screens/workspace/workspace-bulk-close";
import type { WorkspaceTabDescriptor } from "@/screens/workspace/workspace-tabs-types";
import { useBrowserStore } from "@/stores/browser-store";
import type { WorkspaceTabTarget } from "@/stores/workspace-tabs-store";
import { confirmDialog } from "@/utils/confirm-dialog";

type HoveredTabKeySetter = Dispatch<SetStateAction<string | null>>;

type CloseWorkspaceTabWithCleanup = (input: {
  tabId: string;
  target?: WorkspaceTabTarget | null;
}) => void;

interface UseWorkspaceTabCloseActionsInput {
  client: Pick<DaemonClient, "closeItems"> | null;
  persistenceKey: string | null;
  tabs: WorkspaceTabDescriptor[];
  allTabDescriptorsById: ReadonlyMap<string, WorkspaceTabDescriptor>;
  closeWorkspaceTab: (workspaceKey: string, tabId: string) => void;
  unpinWorkspaceAgent: (workspaceKey: string, agentId: string) => void;
  suppressWorkspaceAgentAutoOpen: (workspaceKey: string, agentId: string) => void;
  suppressWorkspaceTerminalAutoOpen: (workspaceKey: string, terminalId: string) => void;
  removeTerminalFromCache: (terminalId: string) => void;
  killTerminal: (terminalId: string) => Promise<unknown>;
  invalidateTerminals: () => void;
  setHoveredTabKey: HoveredTabKeySetter;
  setHoveredCloseTabKey: HoveredTabKeySetter;
}

interface UseWorkspaceTabCloseActionsResult {
  closingTabIds: Set<string>;
  closeWorkspaceTabWithCleanup: CloseWorkspaceTabWithCleanup;
  handleCloseTabById: (tabId: string) => Promise<void>;
  handleCloseTabsToLeftInPane: (tabId: string, paneTabs: WorkspaceTabDescriptor[]) => Promise<void>;
  handleCloseTabsToLeft: (tabId: string) => Promise<void>;
  handleCloseTabsToRightInPane: (
    tabId: string,
    paneTabs: WorkspaceTabDescriptor[],
  ) => Promise<void>;
  handleCloseTabsToRight: (tabId: string) => Promise<void>;
  handleCloseOtherTabsInPane: (tabId: string, paneTabs: WorkspaceTabDescriptor[]) => Promise<void>;
  handleCloseOtherTabs: (tabId: string) => Promise<void>;
}

interface CloseTabsState {
  closingTabIds: Set<string>;
  closeTab: (tabId: string, action: () => Promise<void>) => Promise<void>;
}

function useCloseTabs(): CloseTabsState {
  const pendingRef = useRef(new Set<string>());
  const [closingTabIds, setClosingTabIds] = useState<Set<string>>(() => new Set());

  const closeTab = useCallback(async (tabId: string, action: () => Promise<void>) => {
    const normalized = tabId.trim();
    if (!normalized || pendingRef.current.has(normalized)) {
      return;
    }
    pendingRef.current.add(normalized);
    setClosingTabIds(new Set(pendingRef.current));
    try {
      await action();
    } finally {
      pendingRef.current.delete(normalized);
      setClosingTabIds(new Set(pendingRef.current));
    }
  }, []);

  return { closingTabIds, closeTab };
}

/** Owns single and bulk workspace tab closure, cleanup, confirmation, and terminal shutdown. */
export function useWorkspaceTabCloseActions(
  input: UseWorkspaceTabCloseActionsInput,
): UseWorkspaceTabCloseActionsResult {
  const {
    client,
    persistenceKey,
    tabs,
    allTabDescriptorsById,
    closeWorkspaceTab,
    unpinWorkspaceAgent,
    suppressWorkspaceAgentAutoOpen,
    suppressWorkspaceTerminalAutoOpen,
    removeTerminalFromCache,
    killTerminal,
    invalidateTerminals,
    setHoveredTabKey,
    setHoveredCloseTabKey,
  } = input;
  const { t } = useTranslation();
  const { closingTabIds, closeTab } = useCloseTabs();

  const clearHoveredTab = useCallback(
    (tabId: string) => {
      setHoveredTabKey((current) => (current === tabId ? null : current));
      setHoveredCloseTabKey((current) => (current === tabId ? null : current));
    },
    [setHoveredCloseTabKey, setHoveredTabKey],
  );

  const closeWorkspaceTabWithCleanup = useCallback<CloseWorkspaceTabWithCleanup>(
    (closeInput) => {
      const tabId = closeInput.tabId.trim();
      if (!tabId || !persistenceKey) {
        return;
      }
      if (closeInput.target?.kind === "agent") {
        unpinWorkspaceAgent(persistenceKey, closeInput.target.agentId);
        suppressWorkspaceAgentAutoOpen(persistenceKey, closeInput.target.agentId);
      }
      if (closeInput.target?.kind === "terminal") {
        suppressWorkspaceTerminalAutoOpen(persistenceKey, closeInput.target.terminalId);
      }
      if (closeInput.target?.kind === "browser") {
        const { browserId } = closeInput.target;
        useBrowserStore.getState().removeBrowser(browserId);
        void getDesktopHost()?.browser?.clearPartition?.(browserId);
      }
      closeWorkspaceTab(persistenceKey, tabId);
    },
    [
      closeWorkspaceTab,
      persistenceKey,
      suppressWorkspaceAgentAutoOpen,
      suppressWorkspaceTerminalAutoOpen,
      unpinWorkspaceAgent,
    ],
  );

  const handleCloseTerminalTab = useCallback(
    async (closeInput: { tabId: string; terminalId: string }) => {
      const { tabId, terminalId } = closeInput;
      await closeTab(tabId, async () => {
        const confirmed = await confirmDialog({
          title: t("workspace.screen.closeTerminalTitle"),
          message: t("workspace.screen.closeTerminalMessage"),
          confirmLabel: t("common.close"),
          cancelLabel: t("common.cancel"),
          destructive: true,
        });
        if (!confirmed) {
          return;
        }

        removeTerminalFromCache(terminalId);
        clearHoveredTab(tabId);
        closeWorkspaceTabWithCleanup({
          tabId,
          target: { kind: "terminal", terminalId },
        });
        void killTerminal(terminalId).catch(invalidateTerminals);
      });
    },
    [
      clearHoveredTab,
      closeTab,
      closeWorkspaceTabWithCleanup,
      invalidateTerminals,
      killTerminal,
      removeTerminalFromCache,
      t,
    ],
  );

  const handleCloseAgentTab = useCallback(
    async (closeInput: { tabId: string; agentId: string }) => {
      const { tabId, agentId } = closeInput;
      await closeTab(tabId, async () => {
        closeAgentWorkspaceTabOnly({
          tabId,
          agentId,
          persistenceKey,
          closeWorkspaceTabWithCleanup,
          suppressAgentAutoOpen: suppressWorkspaceAgentAutoOpen,
          unpinAgent: unpinWorkspaceAgent,
          setHoveredTabKey,
          setHoveredCloseTabKey,
        });
      });
    },
    [
      closeTab,
      closeWorkspaceTabWithCleanup,
      persistenceKey,
      setHoveredCloseTabKey,
      setHoveredTabKey,
      suppressWorkspaceAgentAutoOpen,
      unpinWorkspaceAgent,
    ],
  );

  const handleClosePassiveTab = useCallback(
    (closeInput: { tabId: string; target?: WorkspaceTabTarget | null }) => {
      clearHoveredTab(closeInput.tabId);
      closeWorkspaceTabWithCleanup(closeInput);
    },
    [clearHoveredTab, closeWorkspaceTabWithCleanup],
  );

  const handleCloseTabById = useCallback(
    async (tabId: string) => {
      const tab = allTabDescriptorsById.get(tabId);
      if (!tab) {
        return;
      }
      if (tab.target.kind === "terminal") {
        await handleCloseTerminalTab({ tabId, terminalId: tab.target.terminalId });
        return;
      }
      if (tab.target.kind === "agent") {
        await handleCloseAgentTab({ tabId, agentId: tab.target.agentId });
        return;
      }
      handleClosePassiveTab({ tabId, target: tab.target });
    },
    [allTabDescriptorsById, handleCloseAgentTab, handleClosePassiveTab, handleCloseTerminalTab],
  );

  const bulkCloseCopy = useMemo(
    () => ({
      allKinds: ({
        agentCount,
        terminalCount,
        otherCount,
      }: {
        agentCount: number;
        terminalCount: number;
        otherCount: number;
      }) =>
        t("workspace.bulkClose.allKinds", {
          agentCount,
          terminalCount,
          otherCount,
        }),
      agentsAndTerminals: ({
        agentCount,
        terminalCount,
      }: {
        agentCount: number;
        terminalCount: number;
      }) =>
        t("workspace.bulkClose.agentsAndTerminals", {
          agentCount,
          terminalCount,
        }),
      terminalsAndOthers: ({
        terminalCount,
        otherCount,
      }: {
        terminalCount: number;
        otherCount: number;
      }) =>
        t("workspace.bulkClose.terminalsAndOthers", {
          terminalCount,
          otherCount,
        }),
      agentsAndOthers: ({ agentCount, otherCount }: { agentCount: number; otherCount: number }) =>
        t("workspace.bulkClose.agentsAndOthers", {
          agentCount,
          otherCount,
        }),
      terminalsOnly: ({ terminalCount }: { terminalCount: number }) =>
        t("workspace.bulkClose.terminalsOnly", { terminalCount }),
      othersOnly: ({ otherCount }: { otherCount: number }) =>
        t("workspace.bulkClose.othersOnly", { otherCount }),
      agentsOnly: ({ agentCount }: { agentCount: number }) =>
        t("workspace.bulkClose.agentsOnly", { agentCount }),
    }),
    [t],
  );

  const handleBulkCloseTabs = useCallback(
    async (bulkInput: {
      tabsToClose: WorkspaceTabDescriptor[];
      title: string;
      logLabel: string;
    }) => {
      const { tabsToClose, title, logLabel } = bulkInput;
      if (tabsToClose.length === 0) {
        return;
      }
      const groups = classifyBulkClosableTabs(tabsToClose);
      const confirmed = await confirmDialog({
        title,
        message: buildBulkCloseConfirmationMessage(groups, bulkCloseCopy),
        confirmLabel: t("common.close"),
        cancelLabel: t("common.cancel"),
        destructive: true,
      });
      if (!confirmed) {
        return;
      }

      await closeBulkWorkspaceTabs({
        client,
        groups,
        closeTab,
        closeWorkspaceTabWithCleanup,
        logLabel,
        warn: (message, payload) => {
          console.warn(message, payload);
        },
      });

      const closedKeys = new Set(tabsToClose.map((tab) => tab.key));
      setHoveredTabKey((current) => (current && closedKeys.has(current) ? null : current));
      setHoveredCloseTabKey((current) => (current && closedKeys.has(current) ? null : current));
    },
    [
      bulkCloseCopy,
      client,
      closeTab,
      closeWorkspaceTabWithCleanup,
      setHoveredCloseTabKey,
      setHoveredTabKey,
      t,
    ],
  );

  const handleCloseTabsToLeftInPane = useCallback(
    async (tabId: string, paneTabs: WorkspaceTabDescriptor[]) => {
      const index = paneTabs.findIndex((tab) => tab.tabId === tabId);
      if (index < 0) {
        return;
      }
      await handleBulkCloseTabs({
        tabsToClose: paneTabs.slice(0, index),
        title: t("workspace.bulkClose.closeTabsLeftTitle"),
        logLabel: "to the left",
      });
    },
    [handleBulkCloseTabs, t],
  );

  const handleCloseTabsToLeft = useCallback(
    async (tabId: string) => {
      await handleCloseTabsToLeftInPane(tabId, tabs);
    },
    [handleCloseTabsToLeftInPane, tabs],
  );

  const handleCloseTabsToRightInPane = useCallback(
    async (tabId: string, paneTabs: WorkspaceTabDescriptor[]) => {
      const index = paneTabs.findIndex((tab) => tab.tabId === tabId);
      if (index < 0) {
        return;
      }
      await handleBulkCloseTabs({
        tabsToClose: paneTabs.slice(index + 1),
        title: t("workspace.bulkClose.closeTabsRightTitle"),
        logLabel: "to the right",
      });
    },
    [handleBulkCloseTabs, t],
  );

  const handleCloseTabsToRight = useCallback(
    async (tabId: string) => {
      await handleCloseTabsToRightInPane(tabId, tabs);
    },
    [handleCloseTabsToRightInPane, tabs],
  );

  const handleCloseOtherTabsInPane = useCallback(
    async (tabId: string, paneTabs: WorkspaceTabDescriptor[]) => {
      await handleBulkCloseTabs({
        tabsToClose: paneTabs.filter((tab) => tab.tabId !== tabId),
        title: t("workspace.bulkClose.closeOtherTabsTitle"),
        logLabel: "from close other tabs",
      });
    },
    [handleBulkCloseTabs, t],
  );

  const handleCloseOtherTabs = useCallback(
    async (tabId: string) => {
      await handleCloseOtherTabsInPane(tabId, tabs);
    },
    [handleCloseOtherTabsInPane, tabs],
  );

  return {
    closingTabIds,
    closeWorkspaceTabWithCleanup,
    handleCloseTabById,
    handleCloseTabsToLeftInPane,
    handleCloseTabsToLeft,
    handleCloseTabsToRightInPane,
    handleCloseTabsToRight,
    handleCloseOtherTabsInPane,
    handleCloseOtherTabs,
  };
}
