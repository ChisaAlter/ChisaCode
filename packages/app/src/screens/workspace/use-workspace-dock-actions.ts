import { useCallback, type Dispatch, type SetStateAction } from "react";

import { getIsElectron } from "@/constants/platform";
import {
  resolveDockStateAfterAction,
  resolveWorkspacePaneCommand,
  type WorkspaceEnvironmentDockState,
  type WorkspaceEnvironmentDockTab,
  type WorkspacePaneCommand,
} from "@/screens/workspace/workspace-environment-dock-model";
import { createWorkspaceBrowser } from "@/stores/browser-store";
import type { SplitPane } from "@/stores/workspace-layout-store";
import type { WorkspaceTabTarget } from "@/stores/workspace-tabs-store";

type ForcedEnvironmentPanelMode = "forced-open" | "forced-closed";

type OpenWorkspaceTab = (workspaceKey: string, target: WorkspaceTabTarget) => string | null;

interface UseWorkspaceDockActionsInput {
  isMobile: boolean;
  hasEnvironmentBrowserContext: boolean;
  hasEnvironmentPullRequest: boolean;
  persistenceKey: string | null;
  focusedPane: SplitPane | null;
  setEnvironmentDockState: Dispatch<SetStateAction<WorkspaceEnvironmentDockState>>;
  setEnvironmentPanelMode: (mode: ForcedEnvironmentPanelMode) => void;
  closeDesktopFileExplorer: () => void;
  handleOpenEnvironmentChanges: () => void;
  handleCreateTerminal: (input?: { paneId?: string }) => void;
  focusWorkspacePane: (workspaceKey: string, paneId: string) => void;
  splitWorkspacePaneEmpty: (
    workspaceKey: string,
    input: { targetPaneId: string; position: "left" | "right" | "top" | "bottom" },
  ) => string | null;
  openWorkspaceTabFocused: OpenWorkspaceTab;
  openWorkspaceTabInBackground: OpenWorkspaceTab;
}

interface UseWorkspaceDockActionsResult {
  handleOpenWorkspaceDockPane: (pane: WorkspaceEnvironmentDockTab) => void;
  handleOpenGitDock: () => void;
  handleOpenBrowserContextDock: () => void;
  handleOpenPullRequestDock: () => void;
}

/** Owns workspace dock state transitions and pane-placement command routing. */
export function useWorkspaceDockActions(
  input: UseWorkspaceDockActionsInput,
): UseWorkspaceDockActionsResult {
  const {
    isMobile,
    hasEnvironmentBrowserContext,
    hasEnvironmentPullRequest,
    persistenceKey,
    focusedPane,
    setEnvironmentDockState,
    setEnvironmentPanelMode,
    closeDesktopFileExplorer,
    handleOpenEnvironmentChanges,
    handleCreateTerminal,
    focusWorkspacePane,
    splitWorkspacePaneEmpty,
    openWorkspaceTabFocused,
    openWorkspaceTabInBackground,
  } = input;

  const handleOpenWorkspaceDockPane = useCallback(
    (pane: WorkspaceEnvironmentDockTab) => {
      setEnvironmentDockState((state) =>
        resolveDockStateAfterAction(state, { type: "openDockPane", pane }),
      );
      setEnvironmentPanelMode("forced-open");
      if (!isMobile) {
        closeDesktopFileExplorer();
      }
    },
    [closeDesktopFileExplorer, isMobile, setEnvironmentDockState, setEnvironmentPanelMode],
  );

  const handleApplyWorkspaceDockCommand = useCallback(
    (
      command: Extract<
        WorkspacePaneCommand,
        { type: "openDockPane" | "toggleDockPane" | "openGitSummary" }
      >,
    ) => {
      let nextOpen = true;
      setEnvironmentDockState((state) => {
        const nextState = resolveDockStateAfterAction(state, command);
        nextOpen = nextState.open;
        return nextState;
      });
      setEnvironmentPanelMode(nextOpen ? "forced-open" : "forced-closed");
      if (nextOpen && !isMobile) {
        closeDesktopFileExplorer();
      }
    },
    [closeDesktopFileExplorer, isMobile, setEnvironmentDockState, setEnvironmentPanelMode],
  );

  const handleOpenTargetInPanePlacement = useCallback(
    (
      targetKind: Extract<WorkspacePaneCommand, { type: "openTarget" }>["targetKind"],
      placement: "current" | "new-tab" | "right" | "down",
    ) => {
      if (targetKind === "diff") {
        handleOpenEnvironmentChanges();
        return;
      }
      if (targetKind === "pull-request") {
        handleOpenWorkspaceDockPane("pull-request");
        return;
      }
      if (targetKind !== "browser" && targetKind !== "terminal") {
        return;
      }
      if (!persistenceKey) {
        return;
      }

      let targetPaneId: string | undefined;
      if (placement === "right" || placement === "down") {
        if (!focusedPane) {
          return;
        }
        const paneId = splitWorkspacePaneEmpty(persistenceKey, {
          targetPaneId: focusedPane.id,
          position: placement === "right" ? "right" : "bottom",
        });
        if (!paneId) {
          return;
        }
        targetPaneId = paneId;
      }

      if (targetKind === "terminal") {
        handleCreateTerminal(targetPaneId ? { paneId: targetPaneId } : undefined);
        return;
      }
      if (!getIsElectron()) {
        return;
      }

      const { browserId } = createWorkspaceBrowser();
      const target = { kind: "browser" as const, browserId };
      if (targetPaneId) {
        focusWorkspacePane(persistenceKey, targetPaneId);
      }
      if (placement === "new-tab") {
        openWorkspaceTabInBackground(persistenceKey, target);
        return;
      }
      openWorkspaceTabFocused(persistenceKey, target);
    },
    [
      focusedPane,
      focusWorkspacePane,
      handleCreateTerminal,
      handleOpenEnvironmentChanges,
      handleOpenWorkspaceDockPane,
      openWorkspaceTabFocused,
      openWorkspaceTabInBackground,
      persistenceKey,
      splitWorkspacePaneEmpty,
    ],
  );

  const handleExecuteWorkspacePaneCommand = useCallback(
    (command: WorkspacePaneCommand) => {
      if (
        command.type === "openDockPane" ||
        command.type === "toggleDockPane" ||
        command.type === "openGitSummary"
      ) {
        handleApplyWorkspaceDockCommand(command);
        return;
      }
      if (command.type === "moveTabToDock") {
        return;
      }
      const resolution = resolveWorkspacePaneCommand(command);
      if (resolution.placement === "dock") {
        handleOpenWorkspaceDockPane(resolution.dockPane);
        return;
      }
      handleOpenTargetInPanePlacement(resolution.targetKind, resolution.placement);
    },
    [handleApplyWorkspaceDockCommand, handleOpenTargetInPanePlacement, handleOpenWorkspaceDockPane],
  );

  const handleOpenGitDock = useCallback(() => {
    handleExecuteWorkspacePaneCommand({ type: "openGitSummary" });
  }, [handleExecuteWorkspacePaneCommand]);

  const handleOpenBrowserContextDock = useCallback(() => {
    if (!hasEnvironmentBrowserContext) {
      return;
    }
    handleExecuteWorkspacePaneCommand({
      type: "openTarget",
      targetKind: "browser",
      placement: "dock",
    });
  }, [handleExecuteWorkspacePaneCommand, hasEnvironmentBrowserContext]);

  const handleOpenPullRequestDock = useCallback(() => {
    if (hasEnvironmentPullRequest) {
      handleOpenWorkspaceDockPane("pull-request");
    }
  }, [handleOpenWorkspaceDockPane, hasEnvironmentPullRequest]);

  return {
    handleOpenWorkspaceDockPane,
    handleOpenGitDock,
    handleOpenBrowserContextDock,
    handleOpenPullRequestDock,
  };
}
