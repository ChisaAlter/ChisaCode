import type { WorkspaceTabDescriptor } from "@/screens/workspace/workspace-tabs-types";
import { encodeFilePathForPathSegment } from "@/utils/host-routes";
import { buildDeterministicWorkspaceTabId } from "@/workspace-tabs/identity";

export type WorkspaceTabMenuSurface = "desktop" | "mobile";

export type WorkspaceTabMenuEntry =
  | {
      kind: "item";
      key: string;
      label: string;
      icon?:
        | "copy"
        | "rotate-cw"
        | "arrow-left-to-line"
        | "arrow-right-to-line"
        | "copy-x"
        | "pencil"
        | "x";
      hint?: string;
      tooltip?: string;
      disabled?: boolean;
      destructive?: boolean;
      testID: string;
      onSelect: () => void;
    }
  | {
      kind: "separator";
      key: string;
    };

interface BuildWorkspaceTabMenuEntriesInput {
  surface: WorkspaceTabMenuSurface;
  tab: WorkspaceTabDescriptor;
  index: number;
  tabCount: number;
  menuTestIDBase: string;
  onCopyResumeCommand: (agentId: string) => Promise<void> | void;
  onCopyAgentId: (agentId: string) => Promise<void> | void;
  onReloadAgent: (agentId: string) => Promise<void> | void;
  onRenameTab: (tab: WorkspaceTabDescriptor) => void;
  onCloseTab: (tabId: string) => Promise<void> | void;
  onCloseTabsBefore: (tabId: string) => Promise<void> | void;
  onCloseTabsAfter: (tabId: string) => Promise<void> | void;
  onCloseOtherTabs: (tabId: string) => Promise<void> | void;
}

interface BuildWorkspaceDesktopTabActionsInput {
  tab: WorkspaceTabDescriptor;
  index: number;
  tabCount: number;
  onCopyResumeCommand: (agentId: string) => Promise<void> | void;
  onCopyAgentId: (agentId: string) => Promise<void> | void;
  onReloadAgent: (agentId: string) => Promise<void> | void;
  onRenameTab: (tab: WorkspaceTabDescriptor) => void;
  onCloseTab: (tabId: string) => Promise<void> | void;
  onCloseTabsToLeft: (tabId: string) => Promise<void> | void;
  onCloseTabsToRight: (tabId: string) => Promise<void> | void;
  onCloseOtherTabs: (tabId: string) => Promise<void> | void;
}

export interface WorkspaceDesktopTabActions {
  contextMenuTestId: string;
  menuEntries: WorkspaceTabMenuEntry[];
  closeButtonTestId: string;
}

function buildCloseBeforeLabel(surface: WorkspaceTabMenuSurface): string {
  return surface === "mobile" ? "关闭上方标签页" : "关闭左侧标签页";
}

function buildCloseAfterLabel(surface: WorkspaceTabMenuSurface): string {
  return surface === "mobile" ? "关闭下方标签页" : "关闭右侧标签页";
}

function buildCloseBeforeTestIDSuffix(surface: WorkspaceTabMenuSurface): string {
  return surface === "mobile" ? "close-above" : "close-left";
}

function buildCloseAfterTestIDSuffix(surface: WorkspaceTabMenuSurface): string {
  return surface === "mobile" ? "close-below" : "close-right";
}

function getCloseButtonTestId(tab: WorkspaceTabDescriptor): string {
  if (tab.target.kind === "agent") {
    return `workspace-agent-close-${tab.target.agentId}`;
  }
  if (tab.target.kind === "terminal") {
    return `workspace-terminal-close-${tab.target.terminalId}`;
  }
  if (tab.target.kind === "draft") {
    return `workspace-draft-close-${tab.target.draftId}`;
  }
  if (tab.target.kind === "browser") {
    return `workspace-browser-close-${tab.target.browserId}`;
  }
  if (tab.target.kind === "setup") {
    return `workspace-setup-close-${encodeFilePathForPathSegment(tab.target.workspaceId)}`;
  }
  return `workspace-file-close-${encodeFilePathForPathSegment(tab.target.path)}`;
}

export function buildWorkspaceTabMenuEntries(
  input: BuildWorkspaceTabMenuEntriesInput,
): WorkspaceTabMenuEntry[] {
  const {
    surface,
    tab,
    index,
    tabCount,
    menuTestIDBase,
    onCopyResumeCommand,
    onCopyAgentId,
    onReloadAgent,
    onRenameTab,
    onCloseTab,
    onCloseTabsBefore,
    onCloseTabsAfter,
    onCloseOtherTabs,
  } = input;
  const isFirstTab = index === 0;
  const isLastTab = index === tabCount - 1;
  const isOnlyTab = tabCount <= 1;
  const entries: WorkspaceTabMenuEntry[] = [];

  if (tab.target.kind === "agent") {
    const { agentId } = tab.target;
    entries.push({
      kind: "item",
      key: "copy-resume-command",
      label: "复制恢复命令",
      icon: "copy",
      testID: `${menuTestIDBase}-copy-resume-command`,
      onSelect: () => {
        void onCopyResumeCommand(agentId);
      },
    });
    entries.push({
      kind: "item",
      key: "copy-agent-id",
      label: "复制智能体 ID",
      icon: "copy",
      hint: agentId.slice(0, 7),
      testID: `${menuTestIDBase}-copy-agent-id`,
      onSelect: () => {
        void onCopyAgentId(agentId);
      },
    });
  }

  if (tab.target.kind === "agent" || tab.target.kind === "terminal") {
    entries.push({
      kind: "item",
      key: "rename",
      label: "重命名",
      icon: "pencil",
      testID: `${menuTestIDBase}-rename`,
      onSelect: () => {
        onRenameTab(tab);
      },
    });
    entries.push({
      kind: "separator",
      key: "rename-separator",
    });
  }

  entries.push({
    kind: "item",
    key: "close-before",
    label: buildCloseBeforeLabel(surface),
    icon: "arrow-left-to-line",
    disabled: isFirstTab,
    testID: `${menuTestIDBase}-${buildCloseBeforeTestIDSuffix(surface)}`,
    onSelect: () => {
      void onCloseTabsBefore(tab.tabId);
    },
  });
  entries.push({
    kind: "item",
    key: "close-after",
    label: buildCloseAfterLabel(surface),
    icon: "arrow-right-to-line",
    disabled: isLastTab,
    testID: `${menuTestIDBase}-${buildCloseAfterTestIDSuffix(surface)}`,
    onSelect: () => {
      void onCloseTabsAfter(tab.tabId);
    },
  });
  entries.push({
    kind: "item",
    key: "close-others",
    label: "关闭其他标签页",
    icon: "copy-x",
    disabled: isOnlyTab,
    testID: `${menuTestIDBase}-close-others`,
    onSelect: () => {
      void onCloseOtherTabs(tab.tabId);
    },
  });
  if (tab.target.kind === "agent") {
    const { agentId } = tab.target;
    entries.push({
      kind: "item",
      key: "reload-agent",
      label: "重新加载智能体",
      icon: "rotate-cw",
      tooltip: "重新加载智能体以更新技能、MCP 或登录状态。",
      testID: `${menuTestIDBase}-reload-agent`,
      onSelect: () => {
        void onReloadAgent(agentId);
      },
    });
  }
  entries.push({
    kind: "item",
    key: "close",
    label: "关闭",
    icon: "x",
    testID: `${menuTestIDBase}-close`,
    onSelect: () => {
      void onCloseTab(tab.tabId);
    },
  });

  return entries;
}

export function buildWorkspaceDesktopTabActions(
  input: BuildWorkspaceDesktopTabActionsInput,
): WorkspaceDesktopTabActions {
  const contextMenuTestId = `workspace-tab-context-${buildDeterministicWorkspaceTabId(input.tab.target)}`;
  return {
    contextMenuTestId,
    menuEntries: buildWorkspaceTabMenuEntries({
      surface: "desktop",
      tab: input.tab,
      index: input.index,
      tabCount: input.tabCount,
      menuTestIDBase: contextMenuTestId,
      onCopyResumeCommand: input.onCopyResumeCommand,
      onCopyAgentId: input.onCopyAgentId,
      onReloadAgent: input.onReloadAgent,
      onRenameTab: input.onRenameTab,
      onCloseTab: input.onCloseTab,
      onCloseTabsBefore: input.onCloseTabsToLeft,
      onCloseTabsAfter: input.onCloseTabsToRight,
      onCloseOtherTabs: input.onCloseOtherTabs,
    }),
    closeButtonTestId: getCloseButtonTestId(input.tab),
  };
}
