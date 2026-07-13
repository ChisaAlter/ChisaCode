import { useCallback } from "react";
import invariant from "tiny-invariant";

import { getIsElectron } from "@/constants/platform";
import { createWorkspaceBrowser } from "@/stores/browser-store";
import { generateDraftId } from "@/stores/draft-keys";
import type { WorkspaceLayout } from "@/stores/workspace-layout-store";
import type { WorkspaceTab, WorkspaceTabTarget } from "@/stores/workspace-tabs-store";
import { resolveSideFileOpenPlacement } from "@/screens/workspace/workspace-pane-state";
import {
  createWorkspaceFileTabTarget,
  normalizeWorkspaceFileLocation,
  type WorkspaceFileLocation,
} from "@/workspace/file-open";
import { normalizeWorkspaceTabTarget } from "@/workspace-tabs/identity";

interface UseWorkspaceTabOpenActionsInput {
  persistenceKey: string | null;
  isMobile: boolean;
  workspaceLayout: WorkspaceLayout | null;
  uiTabs: WorkspaceTab[];
  showMobileAgent: () => void;
  focusWorkspaceTab: (workspaceKey: string, tabId: string) => void;
  focusWorkspacePane: (workspaceKey: string, paneId: string) => void;
  splitWorkspacePaneEmpty: (
    workspaceKey: string,
    input: { targetPaneId: string; position: "left" | "right" | "top" | "bottom" },
  ) => string | null;
  openWorkspaceTabFocused: (workspaceKey: string, target: WorkspaceTabTarget) => string | null;
  openWorkspaceChildTabFocused: (
    workspaceKey: string,
    target: WorkspaceTabTarget,
    parentTabId: string,
  ) => string | null;
  openWorkspaceTabInBackground: (workspaceKey: string, target: WorkspaceTabTarget) => string | null;
}

interface UseWorkspaceTabOpenActionsResult {
  openWorkspaceDraftTab: (input?: { draftId?: string; focus?: boolean }) => string | null;
  navigateToTabId: (tabId: string) => void;
  handleImportedAgent: (agentId: string) => void;
  handleOpenFileFromExplorer: (filePath: string) => void;
  handleOpenFileFromChat: (
    location: WorkspaceFileLocation,
    options?: { parentTabId?: string | null },
  ) => void;
  handleOpenFileFromChatInSidePane: (input: {
    location: WorkspaceFileLocation;
    sourcePaneId?: string;
    parentTabId?: string | null;
  }) => void;
  handleCreateDraftTab: (input?: { paneId?: string }) => void;
  handleCreateBrowserTab: (input?: { paneId?: string }) => void;
  handleOpenUrlInBrowserTab: (url: string) => void;
  handleSelectSwitcherTab: (key: string) => void;
  handleCreateDraftSplit: (input: {
    targetPaneId: string;
    position: "left" | "right" | "top" | "bottom";
  }) => void;
}

function trimNonEmpty(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Owns workspace tab creation, navigation, and file/browser open placement. */
export function useWorkspaceTabOpenActions(
  input: UseWorkspaceTabOpenActionsInput,
): UseWorkspaceTabOpenActionsResult {
  const {
    persistenceKey,
    isMobile,
    workspaceLayout,
    uiTabs,
    showMobileAgent,
    focusWorkspaceTab,
    focusWorkspacePane,
    splitWorkspacePaneEmpty,
    openWorkspaceTabFocused,
    openWorkspaceChildTabFocused,
    openWorkspaceTabInBackground,
  } = input;
  const navigateToTabId = useCallback(
    (tabId: string) => {
      if (tabId && persistenceKey) {
        focusWorkspaceTab(persistenceKey, tabId);
      }
    },
    [focusWorkspaceTab, persistenceKey],
  );

  const openWorkspaceDraftTab = useCallback(
    (options?: { draftId?: string; focus?: boolean }) => {
      if (!persistenceKey) {
        return null;
      }
      const target = normalizeWorkspaceTabTarget({
        kind: "draft",
        draftId: trimNonEmpty(options?.draftId) ?? generateDraftId(),
      });
      invariant(target?.kind === "draft", "Draft tab target must be valid");
      if (options?.focus === false) {
        return openWorkspaceTabInBackground(persistenceKey, target);
      }
      return openWorkspaceTabFocused(persistenceKey, target);
    },
    [openWorkspaceTabFocused, openWorkspaceTabInBackground, persistenceKey],
  );

  const handleImportedAgent = useCallback(
    (agentId: string) => {
      if (!persistenceKey) {
        return;
      }
      const tabId = openWorkspaceTabFocused(persistenceKey, {
        kind: "agent",
        agentId,
      });
      if (tabId) {
        navigateToTabId(tabId);
      }
    },
    [openWorkspaceTabFocused, persistenceKey, navigateToTabId],
  );

  const handleOpenFileFromExplorer = useCallback(
    (filePath: string) => {
      if (isMobile) {
        showMobileAgent();
      }
      if (!persistenceKey) {
        return;
      }
      const location = normalizeWorkspaceFileLocation({ path: filePath });
      if (!location) {
        return;
      }
      const tabId = openWorkspaceTabFocused(persistenceKey, createWorkspaceFileTabTarget(location));
      if (tabId) {
        navigateToTabId(tabId);
      }
    },
    [isMobile, openWorkspaceTabFocused, persistenceKey, showMobileAgent, navigateToTabId],
  );

  const handleOpenFileFromChat = useCallback(
    (location: WorkspaceFileLocation, options?: { parentTabId?: string | null }) => {
      const normalizedLocation = normalizeWorkspaceFileLocation(location);
      if (!normalizedLocation) {
        return;
      }
      if (isMobile) {
        showMobileAgent();
      }
      if (!persistenceKey) {
        return;
      }
      const target = createWorkspaceFileTabTarget(normalizedLocation);
      const tabId = options?.parentTabId
        ? openWorkspaceChildTabFocused(persistenceKey, target, options.parentTabId)
        : openWorkspaceTabFocused(persistenceKey, target);
      if (tabId) {
        navigateToTabId(tabId);
      }
    },
    [
      isMobile,
      openWorkspaceChildTabFocused,
      openWorkspaceTabFocused,
      persistenceKey,
      showMobileAgent,
      navigateToTabId,
    ],
  );

  const handleOpenFileFromChatInSidePane = useCallback(
    (sideInput: {
      location: WorkspaceFileLocation;
      sourcePaneId?: string;
      parentTabId?: string | null;
    }) => {
      const location = normalizeWorkspaceFileLocation(sideInput.location);
      if (!location) {
        return;
      }
      if (!persistenceKey || isMobile || !sideInput.sourcePaneId) {
        handleOpenFileFromChat(location, { parentTabId: sideInput.parentTabId });
        return;
      }

      const target: WorkspaceTabTarget = createWorkspaceFileTabTarget(location);
      const placement = resolveSideFileOpenPlacement({
        layout: workspaceLayout,
        sourcePaneId: sideInput.sourcePaneId,
        tabs: uiTabs,
        target,
      });
      if (placement.kind === "focus-side-pane") {
        focusWorkspacePane(persistenceKey, placement.paneId);
      } else if (placement.kind === "split-side-pane") {
        splitWorkspacePaneEmpty(persistenceKey, {
          targetPaneId: placement.paneId,
          position: "right",
        });
      }

      const tabId = sideInput.parentTabId
        ? openWorkspaceChildTabFocused(persistenceKey, target, sideInput.parentTabId)
        : openWorkspaceTabFocused(persistenceKey, target);
      if (tabId) {
        navigateToTabId(tabId);
      }
    },
    [
      handleOpenFileFromChat,
      focusWorkspacePane,
      isMobile,
      openWorkspaceChildTabFocused,
      openWorkspaceTabFocused,
      persistenceKey,
      splitWorkspacePaneEmpty,
      uiTabs,
      workspaceLayout,
      navigateToTabId,
    ],
  );

  const handleCreateDraftTab = useCallback(
    (options?: { paneId?: string }) => {
      if (options?.paneId && persistenceKey) {
        focusWorkspacePane(persistenceKey, options.paneId);
      }
      openWorkspaceDraftTab();
    },
    [focusWorkspacePane, persistenceKey, openWorkspaceDraftTab],
  );

  const handleCreateBrowserTab = useCallback(
    (options?: { paneId?: string }) => {
      if (!persistenceKey || !getIsElectron()) {
        return;
      }
      if (options?.paneId) {
        focusWorkspacePane(persistenceKey, options.paneId);
      }
      const { browserId } = createWorkspaceBrowser();
      openWorkspaceTabFocused(persistenceKey, { kind: "browser", browserId });
    },
    [focusWorkspacePane, openWorkspaceTabFocused, persistenceKey],
  );

  const handleOpenUrlInBrowserTab = useCallback(
    (url: string) => {
      if (!persistenceKey || !getIsElectron()) {
        return;
      }
      const { browserId } = createWorkspaceBrowser({ initialUrl: url });
      openWorkspaceTabFocused(persistenceKey, { kind: "browser", browserId });
    },
    [openWorkspaceTabFocused, persistenceKey],
  );

  const handleSelectSwitcherTab = useCallback(
    (key: string) => {
      navigateToTabId(key);
    },
    [navigateToTabId],
  );

  const handleCreateDraftSplit = useCallback(
    (splitInput: { targetPaneId: string; position: "left" | "right" | "top" | "bottom" }) => {
      if (!persistenceKey) {
        return;
      }
      const paneId = splitWorkspacePaneEmpty(persistenceKey, splitInput);
      if (paneId) {
        handleCreateDraftTab({ paneId });
      }
    },
    [handleCreateDraftTab, persistenceKey, splitWorkspacePaneEmpty],
  );

  return {
    openWorkspaceDraftTab,
    navigateToTabId,
    handleImportedAgent,
    handleOpenFileFromExplorer,
    handleOpenFileFromChat,
    handleOpenFileFromChatInSidePane,
    handleCreateDraftTab,
    handleCreateBrowserTab,
    handleOpenUrlInBrowserTab,
    handleSelectSwitcherTab,
    handleCreateDraftSplit,
  };
}
