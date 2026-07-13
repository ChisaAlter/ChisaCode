import { useKeyboardActionHandler } from "@/hooks/use-keyboard-action-handler";
import { useStableEvent } from "@/hooks/use-stable-event";
import type { KeyboardActionDefinition } from "@/keyboard/keyboard-action-dispatcher";
import type { SplitPane, WorkspaceLayout } from "@/stores/workspace-layout-store";
import type { WorkspaceTabTarget } from "@/stores/workspace-tabs-store";
import { isWorkspaceDockCommandAvailable } from "@/screens/workspace/workspace-environment-dock-model";
import type { WorkspaceTabDescriptor } from "@/screens/workspace/workspace-tabs-types";
import { findAdjacentPane } from "@/utils/split-navigation";

const WORKSPACE_TAB_ACTIONS = [
  "workspace.tab.new",
  "workspace.tab.close-current",
  "workspace.tab.navigate-index",
  "workspace.tab.navigate-relative",
  "workspace.terminal.new",
] as const;

const WORKSPACE_PANE_ACTIONS = [
  "workspace.pane.split.right",
  "workspace.pane.split.down",
  "workspace.pane.focus.left",
  "workspace.pane.focus.right",
  "workspace.pane.focus.up",
  "workspace.pane.focus.down",
  "workspace.pane.move-tab.left",
  "workspace.pane.move-tab.right",
  "workspace.pane.move-tab.up",
  "workspace.pane.move-tab.down",
  "workspace.pane.close",
] as const;

const WORKSPACE_DOCK_ACTIONS = [
  "workspace.dock.git.open",
  "workspace.dock.browser.open",
  "workspace.dock.pr.open",
] as const;

const WORKSPACE_SIDEBAR_ACTIONS = ["sidebar.toggle.right"] as const;

const WORKSPACE_COMMAND_CENTER_ACTIONS = [
  "workspace.changes.open",
  "workspace.environment.toggle",
  "workspace.terminal.new",
  "workspace.resume.copy",
  "worktree.archive",
] as const;

const isWorkspaceActionHandlerActive = () => true;

type PaneDirection = "left" | "right" | "up" | "down";

interface UseWorkspaceKeyboardActionsInput {
  serverId: string;
  workspaceId: string;
  enabled: boolean;
  persistenceKey: string | null;
  workspaceLayout: WorkspaceLayout | null;
  focusedPane: SplitPane | null;
  focusedPaneActiveTabId: string | null;
  tabs: readonly WorkspaceTabDescriptor[];
  allTabDescriptorsById: ReadonlyMap<string, WorkspaceTabDescriptor>;
  paneFocusSuppressedRef: { current: boolean };
  hasEnvironmentBrowserContext: boolean;
  hasEnvironmentPullRequest: boolean;
  onCreateDraftTab: () => void;
  onCreateTerminal: () => void;
  onCloseTabById: (tabId: string) => void | Promise<void>;
  onNavigateToTabId: (tabId: string) => void;
  onToggleExplorer: () => void;
  onOpenGitDock: () => void;
  onOpenBrowserContextDock: () => void;
  onOpenPullRequestDock: () => void;
  onCreateDraftSplit: (input: {
    targetPaneId: string;
    position: "left" | "right" | "top" | "bottom";
  }) => void;
  focusWorkspacePane: (workspaceKey: string, paneId: string) => void;
  moveWorkspaceTabToPane: (workspaceKey: string, tabId: string, paneId: string) => void;
  closeWorkspaceTabWithCleanup: (input: {
    tabId: string;
    target?: WorkspaceTabTarget | null;
  }) => void;
  onOpenEnvironmentChanges: () => void;
  onToggleEnvironmentPanel: () => void;
  onCopyEnvironmentResumeCommand: () => void;
  onArchiveWorktree: (() => void) | null;
}

function parsePaneDirection(actionId: string): PaneDirection | null {
  const direction = actionId.split(".").pop();
  if (direction === "left" || direction === "right" || direction === "up" || direction === "down") {
    return direction;
  }
  return null;
}

/** Registers workspace-scoped keyboard and command-center actions. */
export function useWorkspaceKeyboardActions(input: UseWorkspaceKeyboardActionsInput): void {
  const handleWorkspaceTabAction = useStableEvent((action: KeyboardActionDefinition): boolean => {
    switch (action.id) {
      case "workspace.tab.new":
        input.onCreateDraftTab();
        return true;
      case "workspace.terminal.new":
        input.onCreateTerminal();
        return true;
      case "workspace.tab.close-current":
        if (input.focusedPaneActiveTabId) {
          void input.onCloseTabById(input.focusedPaneActiveTabId);
        }
        return true;
      case "workspace.tab.navigate-index": {
        const next = input.tabs[action.index - 1] ?? null;
        if (next?.tabId) {
          input.onNavigateToTabId(next.tabId);
        }
        return true;
      }
      case "workspace.tab.navigate-relative": {
        if (input.tabs.length > 0) {
          const currentIndex = input.tabs.findIndex(
            (tab) => tab.tabId === input.focusedPaneActiveTabId,
          );
          const fromIndex = currentIndex >= 0 ? currentIndex : 0;
          const nextIndex = (fromIndex + action.delta + input.tabs.length) % input.tabs.length;
          const next = input.tabs[nextIndex] ?? null;
          if (next?.tabId) {
            input.onNavigateToTabId(next.tabId);
          }
        }
        return true;
      }
      default:
        return false;
    }
  });

  const handleWorkspacePaneAction = useStableEvent((action: KeyboardActionDefinition): boolean => {
    if (!input.persistenceKey || !input.workspaceLayout) {
      return true;
    }

    const focusedPane = input.focusedPane;
    if (!focusedPane) {
      return true;
    }

    if (action.id === "workspace.pane.split.right") {
      input.onCreateDraftSplit({ targetPaneId: focusedPane.id, position: "right" });
      return true;
    }
    if (action.id === "workspace.pane.split.down") {
      input.onCreateDraftSplit({ targetPaneId: focusedPane.id, position: "bottom" });
      return true;
    }
    if (action.id.startsWith("workspace.pane.focus.")) {
      const direction = parsePaneDirection(action.id);
      if (direction) {
        const adjacentPaneId = findAdjacentPane(
          input.workspaceLayout.root,
          focusedPane.id,
          direction,
        );
        if (adjacentPaneId) {
          input.focusWorkspacePane(input.persistenceKey, adjacentPaneId);
        }
      }
      return true;
    }
    if (action.id.startsWith("workspace.pane.move-tab.")) {
      const direction = parsePaneDirection(action.id);
      if (direction) {
        const adjacentPaneId = findAdjacentPane(
          input.workspaceLayout.root,
          focusedPane.id,
          direction,
        );
        if (input.focusedPaneActiveTabId && adjacentPaneId) {
          input.paneFocusSuppressedRef.current = true;
          input.moveWorkspaceTabToPane(
            input.persistenceKey,
            input.focusedPaneActiveTabId,
            adjacentPaneId,
          );
          requestAnimationFrame(() => {
            input.paneFocusSuppressedRef.current = false;
          });
        }
      }
      return true;
    }
    if (action.id === "workspace.pane.close") {
      for (const tabId of focusedPane.tabIds) {
        input.closeWorkspaceTabWithCleanup({
          tabId,
          target: input.allTabDescriptorsById.get(tabId)?.target ?? null,
        });
      }
      return true;
    }
    return false;
  });

  const handleWorkspaceDockAction = useStableEvent((action: KeyboardActionDefinition): boolean => {
    if (action.id === "workspace.dock.git.open") {
      input.onOpenGitDock();
      return true;
    }
    if (action.id === "workspace.dock.browser.open") {
      if (
        !isWorkspaceDockCommandAvailable({
          command: { type: "openTarget", targetKind: "browser", placement: "dock" },
          hasBrowserContext: input.hasEnvironmentBrowserContext,
          hasPullRequest: input.hasEnvironmentPullRequest,
        })
      ) {
        return false;
      }
      input.onOpenBrowserContextDock();
      return true;
    }
    if (action.id === "workspace.dock.pr.open") {
      if (
        !isWorkspaceDockCommandAvailable({
          command: { type: "openDockPane", pane: "pull-request" },
          hasBrowserContext: input.hasEnvironmentBrowserContext,
          hasPullRequest: input.hasEnvironmentPullRequest,
        })
      ) {
        return false;
      }
      input.onOpenPullRequestDock();
      return true;
    }
    return false;
  });

  const handleWorkspaceSidebarAction = useStableEvent(
    (action: KeyboardActionDefinition): boolean => {
      if (action.id !== "sidebar.toggle.right") {
        return false;
      }
      input.onToggleExplorer();
      return true;
    },
  );

  const handleWorkspaceCommandCenterAction = useStableEvent(
    (action: KeyboardActionDefinition): boolean => {
      switch (action.id) {
        case "workspace.changes.open":
          input.onOpenEnvironmentChanges();
          return true;
        case "workspace.environment.toggle":
          input.onToggleEnvironmentPanel();
          return true;
        case "workspace.terminal.new":
          input.onCreateTerminal();
          return true;
        case "workspace.resume.copy":
          input.onCopyEnvironmentResumeCommand();
          return true;
        case "worktree.archive":
          if (!input.onArchiveWorktree) {
            return false;
          }
          input.onArchiveWorktree();
          return true;
        default:
          return false;
      }
    },
  );

  const handlerIdSuffix = `${input.serverId}:${input.workspaceId}`;
  useKeyboardActionHandler({
    handlerId: `workspace-tab-actions:${handlerIdSuffix}`,
    actions: WORKSPACE_TAB_ACTIONS,
    enabled: input.enabled,
    priority: 100,
    isActive: isWorkspaceActionHandlerActive,
    handle: handleWorkspaceTabAction,
  });
  useKeyboardActionHandler({
    handlerId: `workspace-pane-actions:${handlerIdSuffix}`,
    actions: WORKSPACE_PANE_ACTIONS,
    enabled: input.enabled,
    priority: 100,
    isActive: isWorkspaceActionHandlerActive,
    handle: handleWorkspacePaneAction,
  });
  useKeyboardActionHandler({
    handlerId: `workspace-dock-actions:${handlerIdSuffix}`,
    actions: WORKSPACE_DOCK_ACTIONS,
    enabled: input.enabled,
    priority: 100,
    isActive: isWorkspaceActionHandlerActive,
    handle: handleWorkspaceDockAction,
  });
  useKeyboardActionHandler({
    handlerId: `workspace-sidebar-actions:${handlerIdSuffix}`,
    actions: WORKSPACE_SIDEBAR_ACTIONS,
    enabled: input.enabled,
    priority: 100,
    isActive: isWorkspaceActionHandlerActive,
    handle: handleWorkspaceSidebarAction,
  });
  useKeyboardActionHandler({
    handlerId: `workspace-command-center-actions:${handlerIdSuffix}`,
    actions: WORKSPACE_COMMAND_CENTER_ACTIONS,
    enabled: input.enabled,
    priority: 100,
    isActive: isWorkspaceActionHandlerActive,
    handle: handleWorkspaceCommandCenterAction,
  });
}
