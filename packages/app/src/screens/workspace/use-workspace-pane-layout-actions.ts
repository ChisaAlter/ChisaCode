import { useCallback, useRef } from "react";

import { useStableEvent } from "@/hooks/use-stable-event";

type SplitPosition = "left" | "right" | "top" | "bottom";

interface UseWorkspacePaneLayoutActionsInput {
  persistenceKey: string | null;
  focusWorkspacePane: (workspaceKey: string, paneId: string) => void;
  splitWorkspacePane: (
    workspaceKey: string,
    input: { tabId: string; targetPaneId: string; position: SplitPosition },
  ) => string | null;
  moveWorkspaceTabToPane: (workspaceKey: string, tabId: string, toPaneId: string) => void;
  resizeWorkspaceSplit: (workspaceKey: string, groupId: string, sizes: number[]) => void;
  reorderWorkspaceTabsInPane: (workspaceKey: string, paneId: string, tabIds: string[]) => void;
}

interface UseWorkspacePaneLayoutActionsResult {
  paneFocusSuppressedRef: { current: boolean };
  handleFocusPane: (paneId: string) => void;
  handleSplitPane: (input: {
    tabId: string;
    targetPaneId: string;
    position: SplitPosition;
  }) => void;
  handleMoveTabToPane: (tabId: string, toPaneId: string) => void;
  handleResizePaneSplit: (groupId: string, sizes: number[]) => void;
  handleReorderTabsInPane: (paneId: string, tabIds: string[]) => void;
}

/** Owns workspace pane focus suppression and persisted split/tab layout mutations. */
export function useWorkspacePaneLayoutActions(
  input: UseWorkspacePaneLayoutActionsInput,
): UseWorkspacePaneLayoutActionsResult {
  const {
    persistenceKey,
    focusWorkspacePane,
    splitWorkspacePane,
    moveWorkspaceTabToPane,
    resizeWorkspaceSplit,
    reorderWorkspaceTabsInPane,
  } = input;
  const paneFocusSuppressedRef = useRef(false);

  const handleFocusPane = useStableEvent((paneId: string) => {
    if (!persistenceKey || paneFocusSuppressedRef.current) {
      return;
    }
    focusWorkspacePane(persistenceKey, paneId);
  });

  const handleSplitPane = useCallback(
    (splitInput: { tabId: string; targetPaneId: string; position: SplitPosition }) => {
      if (persistenceKey) {
        splitWorkspacePane(persistenceKey, splitInput);
      }
    },
    [persistenceKey, splitWorkspacePane],
  );

  const handleMoveTabToPane = useCallback(
    (tabId: string, toPaneId: string) => {
      if (persistenceKey) {
        moveWorkspaceTabToPane(persistenceKey, tabId, toPaneId);
      }
    },
    [moveWorkspaceTabToPane, persistenceKey],
  );

  const handleResizePaneSplit = useCallback(
    (groupId: string, sizes: number[]) => {
      if (persistenceKey) {
        resizeWorkspaceSplit(persistenceKey, groupId, sizes);
      }
    },
    [persistenceKey, resizeWorkspaceSplit],
  );

  const handleReorderTabsInPane = useCallback(
    (paneId: string, tabIds: string[]) => {
      if (persistenceKey) {
        reorderWorkspaceTabsInPane(persistenceKey, paneId, tabIds);
      }
    },
    [persistenceKey, reorderWorkspaceTabsInPane],
  );

  return {
    paneFocusSuppressedRef,
    handleFocusPane,
    handleSplitPane,
    handleMoveTabToPane,
    handleResizePaneSplit,
    handleReorderTabsInPane,
  };
}
