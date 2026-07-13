import { useCallback, useEffect, useMemo, useRef } from "react";

import { useMountedTabSet } from "@/screens/workspace/use-mounted-tab-set";
import {
  buildWorkspacePaneContentModel,
  type WorkspacePaneContentModel,
} from "@/screens/workspace/workspace-pane-content";
import type { WorkspaceTabDescriptor } from "@/screens/workspace/workspace-tabs-types";
import type { WorkspaceTabTarget } from "@/stores/workspace-tabs-store";
import type { WorkspaceFileLocation } from "@/workspace/file-open";
import { workspaceTabTargetsEqual } from "@/workspace-tabs/identity";

type BuildMobilePaneContentModel = (input: {
  paneId: string | null;
  tab: WorkspaceTabDescriptor;
}) => WorkspacePaneContentModel;

type BuildDesktopPaneContentModel = (input: {
  paneId: string;
  tab: WorkspaceTabDescriptor;
}) => WorkspacePaneContentModel;

interface UseWorkspacePaneContentModelsInput {
  normalizedServerId: string;
  normalizedWorkspaceId: string;
  persistenceKey: string | null;
  tabs: WorkspaceTabDescriptor[];
  activeTabId: string | null;
  focusedPaneId: string | null;
  focusWorkspacePane: (workspaceKey: string, paneId: string) => void;
  openWorkspaceChildTabFocused: (
    workspaceKey: string,
    target: WorkspaceTabTarget,
    parentTabId: string,
  ) => string | null;
  navigateToTabId: (tabId: string) => void;
  handleCloseTabById: (tabId: string) => void | Promise<void>;
  retargetWorkspaceTab: (
    workspaceKey: string,
    tabId: string,
    target: WorkspaceTabTarget,
  ) => string | null;
  handleOpenFileFromChat: (
    location: WorkspaceFileLocation,
    options?: { parentTabId?: string | null },
  ) => void;
  handleOpenFileFromChatInSidePane: (input: {
    location: WorkspaceFileLocation;
    sourcePaneId?: string;
    parentTabId?: string | null;
  }) => void;
  openImportSheet: () => void;
}

interface UseWorkspacePaneContentModelsResult {
  focusedPaneId: string | null;
  mountedFocusedPaneTabIds: string[];
  focusedPaneTabDescriptorMap: Map<string, WorkspaceTabDescriptor>;
  buildMobilePaneContentModel: BuildMobilePaneContentModel;
  buildDesktopPaneContentModel: BuildDesktopPaneContentModel;
}

function useStableTabDescriptorMap(
  tabDescriptors: WorkspaceTabDescriptor[],
): Map<string, WorkspaceTabDescriptor> {
  const cacheRef = useRef(new Map<string, WorkspaceTabDescriptor>());
  const tabDescriptorMap = useMemo(() => {
    const next = new Map<string, WorkspaceTabDescriptor>();
    for (const tabDescriptor of tabDescriptors) {
      const cachedDescriptor = cacheRef.current.get(tabDescriptor.tabId);
      if (
        cachedDescriptor &&
        cachedDescriptor.key === tabDescriptor.key &&
        cachedDescriptor.kind === tabDescriptor.kind &&
        workspaceTabTargetsEqual(cachedDescriptor.target, tabDescriptor.target)
      ) {
        next.set(tabDescriptor.tabId, cachedDescriptor);
        continue;
      }
      next.set(tabDescriptor.tabId, tabDescriptor);
    }
    return next;
  }, [tabDescriptors]);

  useEffect(() => {
    cacheRef.current = tabDescriptorMap;
  }, [tabDescriptorMap]);

  return tabDescriptorMap;
}

/** Owns pane content callbacks, stable descriptors, and focused-pane mounted-tab retention. */
export function useWorkspacePaneContentModels(
  input: UseWorkspacePaneContentModelsInput,
): UseWorkspacePaneContentModelsResult {
  const {
    normalizedServerId,
    normalizedWorkspaceId,
    persistenceKey,
    tabs,
    activeTabId,
    focusedPaneId,
    focusWorkspacePane,
    openWorkspaceChildTabFocused,
    navigateToTabId,
    handleCloseTabById,
    retargetWorkspaceTab,
    handleOpenFileFromChat,
    handleOpenFileFromChatInSidePane,
    openImportSheet,
  } = input;

  const buildPaneContentModel = useCallback(
    (modelInput: {
      tab: WorkspaceTabDescriptor;
      paneId?: string | null;
      focusPaneBeforeOpen?: boolean;
    }) =>
      buildWorkspacePaneContentModel({
        tab: modelInput.tab,
        normalizedServerId,
        normalizedWorkspaceId,
        onOpenTab: (target) => {
          if (!persistenceKey) {
            return;
          }
          if (modelInput.focusPaneBeforeOpen && modelInput.paneId) {
            focusWorkspacePane(persistenceKey, modelInput.paneId);
          }
          const tabId = openWorkspaceChildTabFocused(persistenceKey, target, modelInput.tab.tabId);
          if (tabId) {
            navigateToTabId(tabId);
          }
        },
        onCloseCurrentTab: () => {
          void handleCloseTabById(modelInput.tab.tabId);
        },
        onRetargetCurrentTab: (target) => {
          if (persistenceKey) {
            retargetWorkspaceTab(persistenceKey, modelInput.tab.tabId, target);
          }
        },
        onOpenWorkspaceFile: (request) => {
          if (modelInput.focusPaneBeforeOpen && modelInput.paneId && persistenceKey) {
            focusWorkspacePane(persistenceKey, modelInput.paneId);
          }
          if (request.disposition === "side") {
            handleOpenFileFromChatInSidePane({
              location: request.location,
              sourcePaneId: modelInput.paneId ?? undefined,
              parentTabId: modelInput.tab.tabId,
            });
            return;
          }
          handleOpenFileFromChat(request.location, { parentTabId: modelInput.tab.tabId });
        },
        onOpenImportSheet: openImportSheet,
      }),
    [
      focusWorkspacePane,
      handleCloseTabById,
      handleOpenFileFromChat,
      handleOpenFileFromChatInSidePane,
      navigateToTabId,
      normalizedServerId,
      normalizedWorkspaceId,
      openImportSheet,
      openWorkspaceChildTabFocused,
      persistenceKey,
      retargetWorkspaceTab,
    ],
  );

  const focusedPaneTabIds = useMemo(() => tabs.map((tab) => tab.tabId), [tabs]);
  const focusedPaneTabDescriptorMap = useStableTabDescriptorMap(tabs);
  const { mountedTabIds } = useMountedTabSet({
    activeTabId,
    allTabIds: focusedPaneTabIds,
    cap: 3,
  });
  const mountedFocusedPaneTabIds = useMemo(
    () => focusedPaneTabIds.filter((tabId) => mountedTabIds.has(tabId)),
    [focusedPaneTabIds, mountedTabIds],
  );

  const buildMobilePaneContentModel = useCallback<BuildMobilePaneContentModel>(
    (mobileInput) =>
      buildPaneContentModel({
        tab: mobileInput.tab,
        paneId: mobileInput.paneId,
        focusPaneBeforeOpen: false,
      }),
    [buildPaneContentModel],
  );

  const buildDesktopPaneContentModel = useCallback<BuildDesktopPaneContentModel>(
    (desktopInput) =>
      buildPaneContentModel({
        tab: desktopInput.tab,
        paneId: desktopInput.paneId,
        focusPaneBeforeOpen: true,
      }),
    [buildPaneContentModel],
  );

  return {
    focusedPaneId,
    mountedFocusedPaneTabIds,
    focusedPaneTabDescriptorMap,
    buildMobilePaneContentModel,
    buildDesktopPaneContentModel,
  };
}
