import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
  type LayoutChangeEvent,
  type PressableStateCallbackType,
} from "react-native";
import { useTranslation } from "react-i18next";
import {
  CopyX,
  ArrowLeftToLine,
  ArrowRightToLine,
  Columns2,
  Copy,
  Globe2,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCw,
  SquareTerminal,
  X,
} from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { SortableInlineList } from "@/components/sortable-inline-list";
import type {
  DraggableListDragHandleProps,
  DraggableRenderItemInfo,
} from "@/components/draggable-list.types";
import { isNative, isWeb } from "@/constants/platform";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Shortcut } from "@/components/ui/shortcut";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TITLEBAR_NO_DRAG_VIEW_STYLE } from "@/components/desktop/titlebar-drag-region";
import { useShortcutKeys } from "@/hooks/use-shortcut-keys";
import {
  TAB_DROPDOWN_WIDTH,
  WORKBENCH_BODY_FONT_SIZE,
  WORKBENCH_BODY_LINE_HEIGHT,
  WORKBENCH_TAB_ESTIMATED_CHAR_WIDTH,
  WORKBENCH_TAB_GAP,
  WORKBENCH_TAB_MAX_WIDTH,
  WORKBENCH_TAB_MIN_WIDTH,
  WORKSPACE_SECONDARY_HEADER_HEIGHT,
} from "@/constants/layout";
import { useWorkspaceTabLayout } from "@/screens/workspace/use-workspace-tab-layout";
import { computeWorkspaceVisibleTabWindow } from "@/screens/workspace/workspace-tab-layout";
import {
  WorkspaceTabPresentationResolver,
  WorkspaceTabIcon,
  type WorkspaceTabPresentation,
} from "@/screens/workspace/workspace-tab-presentation";
import { buildDeterministicWorkspaceTabId } from "@/workspace-tabs/identity";
import { resolveThemeWorkbenchSurfaceRoles } from "@/styles/workbench-surface-roles";
import {
  buildWorkspaceDesktopTabActions,
  type WorkspaceDesktopTabActions,
  type WorkspaceTabMenuEntry,
} from "@/screens/workspace/workspace-tab-menu";
import type { WorkspaceTabDescriptor } from "@/screens/workspace/workspace-tabs-types";
import type { Theme } from "@/styles/theme";

const LOADING_TAB_LABEL_SKELETON_WIDTH = 80;
const OVERFLOW_MENU_RESERVED_WIDTH = 40;
const OVERFLOW_MENU_MAX_HEIGHT = 520;
const OVERFLOW_TAB_WIDTH = 132;

const WORKBENCH_TAB_GLYPHS: Partial<Record<WorkspaceTabPresentation["kind"], string>> = {
  agent: "✦",
  terminal: "▸",
  browser: "◎",
};

const ThemedActivityIndicator = withUnistyles(ActivityIndicator);
const ThemedX = withUnistyles(X);
const ThemedCopy = withUnistyles(Copy);
const ThemedRotateCw = withUnistyles(RotateCw);
const ThemedArrowLeftToLine = withUnistyles(ArrowLeftToLine);
const ThemedArrowRightToLine = withUnistyles(ArrowRightToLine);
const ThemedCopyX = withUnistyles(CopyX);
const ThemedPencil = withUnistyles(Pencil);

const ThemedSquareTerminal = withUnistyles(SquareTerminal);
const ThemedColumns2 = withUnistyles(Columns2);
const ThemedPlus = withUnistyles(Plus);
const ThemedGlobe2 = withUnistyles(Globe2);
const ThemedMoreHorizontal = withUnistyles(MoreHorizontal);

const foregroundColorMapping = (theme: Theme) => ({ color: theme.colors.foreground });
const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

const TAB_MORE_TERMINAL_ICON = <ThemedSquareTerminal size={16} uniProps={mutedColorMapping} />;
const TAB_MORE_BROWSER_ICON = <ThemedGlobe2 size={16} uniProps={mutedColorMapping} />;
const TAB_MORE_SPLIT_DOWN_ICON = <ThemedColumns2 size={16} uniProps={mutedColorMapping} />;

function newTabActionButtonStyle({ hovered, pressed }: PressableStateCallbackType) {
  return [styles.newTabActionButton, (hovered || pressed) && styles.newTabActionButtonHovered];
}

function TabContextMenuItem({
  entry,
}: {
  entry: Extract<WorkspaceTabMenuEntry, { kind: "item" }>;
}) {
  const leading = useMemo(() => {
    switch (entry.icon) {
      case "copy":
        return <ThemedCopy size={16} uniProps={mutedColorMapping} />;
      case "rotate-cw":
        return <ThemedRotateCw size={16} uniProps={mutedColorMapping} />;
      case "arrow-left-to-line":
        return <ThemedArrowLeftToLine size={16} uniProps={mutedColorMapping} />;
      case "arrow-right-to-line":
        return <ThemedArrowRightToLine size={16} uniProps={mutedColorMapping} />;
      case "copy-x":
        return <ThemedCopyX size={16} uniProps={mutedColorMapping} />;
      case "pencil":
        return <ThemedPencil size={16} uniProps={mutedColorMapping} />;
      case "x":
        return <ThemedX size={16} uniProps={mutedColorMapping} />;
      default:
        return undefined;
    }
  }, [entry.icon]);
  const trailing = useMemo(
    () => (entry.hint ? <Text style={styles.menuItemHint}>{entry.hint}</Text> : undefined),
    [entry.hint],
  );
  return (
    <ContextMenuItem
      testID={entry.testID}
      disabled={entry.disabled}
      destructive={entry.destructive}
      onSelect={entry.onSelect}
      tooltip={entry.tooltip}
      leading={leading}
      trailing={trailing}
    >
      {entry.label}
    </ContextMenuItem>
  );
}

function tabKeyExtractor(tab: WorkspaceDesktopTabRowItem) {
  return `${tab.tab.key}:${tab.tab.kind}`;
}

export interface WorkspaceDesktopTabRowItem {
  tab: WorkspaceTabDescriptor;
  isActive: boolean;
  isCloseHovered: boolean;
  isClosingTab: boolean;
}

interface WorkspaceDesktopTabsRowProps {
  paneId?: string;
  isFocused?: boolean;
  tabs: WorkspaceDesktopTabRowItem[];
  normalizedServerId: string;
  normalizedWorkspaceId: string;
  setHoveredTabKey: Dispatch<SetStateAction<string | null>>;
  setHoveredCloseTabKey: Dispatch<SetStateAction<string | null>>;
  onNavigateTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => Promise<void> | void;
  onCopyResumeCommand: (agentId: string) => Promise<void> | void;
  onCopyAgentId: (agentId: string) => Promise<void> | void;
  onReloadAgent: (agentId: string) => Promise<void> | void;
  onRenameTab: (tab: WorkspaceTabDescriptor) => void;
  onCloseTabsToLeft: (tabId: string) => Promise<void> | void;
  onCloseTabsToRight: (tabId: string) => Promise<void> | void;
  onCloseOtherTabs: (tabId: string) => Promise<void> | void;
  onCreateDraftTab: (input: { paneId?: string }) => void;
  onCreateTerminalTab: (input: { paneId?: string }) => void;
  onCreateBrowserTab: (input: { paneId?: string }) => void;
  showCreateBrowserTab?: boolean;
  disableCreateTerminal?: boolean;
  isWaitingOnTerminalReadiness?: boolean;
  onReorderTabs: (nextTabs: WorkspaceTabDescriptor[]) => void;
  onSplitRight: () => void;
  onSplitDown: () => void;
  externalDndContext?: boolean;
  activeDragTabId?: string | null;
  tabDropPreviewIndex?: number | null;
  showPaneSplitActions?: boolean;
  trailingControls?: ReactNode;
}

function getFallbackTabLabel(
  tab: WorkspaceTabDescriptor,
  labels: {
    newAgent: string;
    setup: string;
    terminal: string;
    agent: string;
  },
): string {
  if (tab.target.kind === "draft") {
    return labels.newAgent;
  }
  if (tab.target.kind === "setup") {
    return labels.setup;
  }
  if (tab.target.kind === "terminal") {
    return labels.terminal;
  }
  if (tab.target.kind === "file") {
    return tab.target.path.split("/").findLast(Boolean) ?? tab.target.path;
  }
  return labels.agent;
}

function WorkspaceOverflowTabMenuItem({
  tab,
  normalizedServerId,
  normalizedWorkspaceId,
  onNavigateTab,
}: {
  tab: WorkspaceDesktopTabRowItem;
  normalizedServerId: string;
  normalizedWorkspaceId: string;
  onNavigateTab: (tabId: string) => void;
}) {
  const { t } = useTranslation();
  const handleSelect = useCallback(() => {
    onNavigateTab(tab.tab.tabId);
  }, [onNavigateTab, tab.tab.tabId]);

  return (
    <WorkspaceTabPresentationResolver
      tab={tab.tab}
      serverId={normalizedServerId}
      workspaceId={normalizedWorkspaceId}
    >
      {(presentation) => (
        <WorkspaceOverflowResolvedTabMenuItem
          tab={tab}
          presentation={presentation}
          label={presentation.titleState === "loading" ? t("common.loading") : presentation.label}
          onSelect={handleSelect}
        />
      )}
    </WorkspaceTabPresentationResolver>
  );
}

function WorkspaceOverflowResolvedTabMenuItem({
  tab,
  presentation,
  label,
  onSelect,
}: {
  tab: WorkspaceDesktopTabRowItem;
  presentation: WorkspaceTabPresentation;
  label: string;
  onSelect: () => void;
}) {
  const leading = useMemo(
    () => <WorkspaceTabIcon presentation={presentation} active={tab.isActive} />,
    [presentation, tab.isActive],
  );

  return (
    <DropdownMenuItem
      testID={`workspace-tabs-overflow-item-${buildDeterministicWorkspaceTabId(tab.tab.target)}`}
      description={presentation.subtitle}
      leading={leading}
      selected={tab.isActive}
      onSelect={onSelect}
    >
      {label}
    </DropdownMenuItem>
  );
}

function WorkspaceTabsOverflowMenu({
  hiddenTabs,
  normalizedServerId,
  normalizedWorkspaceId,
  onNavigateTab,
}: {
  hiddenTabs: WorkspaceDesktopTabRowItem[];
  normalizedServerId: string;
  normalizedWorkspaceId: string;
  onNavigateTab: (tabId: string) => void;
}) {
  const { t } = useTranslation();
  const overflowLabel = t("workspace.desktopTabs.moreTabs", { count: hiddenTabs.length });

  if (hiddenTabs.length === 0) {
    return null;
  }

  return (
    <DropdownMenu>
      <Tooltip delayDuration={0} enabledOnDesktop enabledOnMobile={false}>
        <TooltipTrigger asChild triggerRefProp="triggerRef">
          <DropdownMenuTrigger
            testID="workspace-tabs-overflow-menu"
            accessibilityRole="button"
            accessibilityLabel={overflowLabel}
            style={newTabActionButtonStyle}
          >
            <ThemedMoreHorizontal size={16} uniProps={mutedColorMapping} />
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="center" offset={8}>
          <Text style={styles.newTabTooltipText}>{overflowLabel}</Text>
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="end"
        maxHeight={OVERFLOW_MENU_MAX_HEIGHT}
        scrollable
        width={TAB_DROPDOWN_WIDTH}
        testID="workspace-tabs-overflow-content"
      >
        {hiddenTabs.map((tab) => (
          <WorkspaceOverflowTabMenuItem
            key={tabKeyExtractor(tab)}
            tab={tab}
            normalizedServerId={normalizedServerId}
            normalizedWorkspaceId={normalizedWorkspaceId}
            onNavigateTab={onNavigateTab}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function useVisibleWorkspaceTabs({
  requiresOverflow,
  tabs,
  tabsActionsWidth,
  tabsContainerWidth,
}: {
  requiresOverflow: boolean;
  tabs: readonly WorkspaceDesktopTabRowItem[];
  tabsActionsWidth: number;
  tabsContainerWidth: number;
}): {
  visibleTabs: WorkspaceDesktopTabRowItem[];
  hiddenTabs: WorkspaceDesktopTabRowItem[];
} {
  const visibleTabWindow = useMemo(() => {
    if (!requiresOverflow) {
      return computeWorkspaceVisibleTabWindow({
        tabCount: tabs.length,
        activeIndex: 0,
        maxVisibleTabs: tabs.length,
      });
    }

    const activeIndex = Math.max(
      0,
      tabs.findIndex((tab) => tab.isActive),
    );
    const availableTabsWidth = Math.max(
      OVERFLOW_TAB_WIDTH,
      tabsContainerWidth - tabsActionsWidth - OVERFLOW_MENU_RESERVED_WIDTH,
    );
    const maxVisibleTabs = Math.max(1, Math.floor(availableTabsWidth / OVERFLOW_TAB_WIDTH));

    return computeWorkspaceVisibleTabWindow({
      tabCount: tabs.length,
      activeIndex,
      maxVisibleTabs,
    });
  }, [requiresOverflow, tabs, tabsActionsWidth, tabsContainerWidth]);

  const visibleTabs = useMemo(
    () => tabs.slice(visibleTabWindow.startIndex, visibleTabWindow.endIndex),
    [tabs, visibleTabWindow.endIndex, visibleTabWindow.startIndex],
  );
  const hiddenTabs = useMemo(
    () =>
      requiresOverflow
        ? tabs.filter(
            (_tab, index) =>
              index < visibleTabWindow.startIndex || index >= visibleTabWindow.endIndex,
          )
        : [],
    [requiresOverflow, tabs, visibleTabWindow.endIndex, visibleTabWindow.startIndex],
  );

  return { visibleTabs, hiddenTabs };
}

function WorkspaceTabMoreMenu({
  showCreateBrowserTab,
  terminalDisabled,
  onCreateTerminal,
  onCreateBrowserTab,
  onSplitDown,
}: {
  showCreateBrowserTab: boolean;
  terminalDisabled: boolean;
  onCreateTerminal: () => void;
  onCreateBrowserTab: () => void;
  onSplitDown: () => void;
}) {
  const { t } = useTranslation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        testID="workspace-tabs-more"
        accessibilityRole="button"
        accessibilityLabel={t("workspace.actions")}
        style={newTabActionButtonStyle}
      >
        <ThemedMoreHorizontal size={16} uniProps={mutedColorMapping} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" width={220}>
        <DropdownMenuItem
          testID="workspace-new-terminal"
          leading={TAB_MORE_TERMINAL_ICON}
          disabled={terminalDisabled}
          onSelect={onCreateTerminal}
        >
          {t("workspace.desktopTabs.newTerminalTab")}
        </DropdownMenuItem>
        {showCreateBrowserTab ? (
          <DropdownMenuItem leading={TAB_MORE_BROWSER_ICON} onSelect={onCreateBrowserTab}>
            {t("workspace.newBrowserTab")}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem leading={TAB_MORE_SPLIT_DOWN_ICON} onSelect={onSplitDown}>
          {t("workspace.desktopTabs.splitPaneDown")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
function WorkspaceOptionalSplitRightButton({
  showPaneSplitActions,
  onSplitRight,
  splitRightKeys,
}: {
  showPaneSplitActions: boolean;
  onSplitRight: () => void;
  splitRightKeys: ReturnType<typeof useShortcutKeys>;
}) {
  const { t } = useTranslation();

  if (!showPaneSplitActions) {
    return null;
  }

  return (
    <Tooltip delayDuration={0} enabledOnDesktop enabledOnMobile={false}>
      <TooltipTrigger
        testID="workspace-split-right"
        onPress={onSplitRight}
        accessibilityRole="button"
        accessibilityLabel={t("workspace.desktopTabs.splitPaneRight")}
        style={newTabActionButtonStyle}
      >
        <ThemedColumns2 size={16} uniProps={mutedColorMapping} />
      </TooltipTrigger>
      <TooltipContent side="bottom" align="center" offset={8}>
        <View style={styles.newTabTooltipRow}>
          <Text style={styles.newTabTooltipText}>{t("workspace.desktopTabs.splitPaneRight")}</Text>
          {splitRightKeys ? (
            <Shortcut chord={splitRightKeys} style={styles.newTabTooltipShortcut} />
          ) : null}
        </View>
      </TooltipContent>
    </Tooltip>
  );
}

function useMiddleClickClose(onClose: () => void) {
  const ref = useRef<View>(null);

  useEffect(() => {
    if (isNative) return;
    const node = ref.current as unknown as HTMLElement | null;
    if (!node) return;

    function handleAuxClick(event: MouseEvent) {
      if (event.button === 1) {
        event.preventDefault();
        onClose();
      }
    }

    node.addEventListener("auxclick", handleAuxClick);
    return () => node.removeEventListener("auxclick", handleAuxClick);
  }, [onClose]);

  return ref;
}

function TabHandleContent({
  presentation,
  isHighlighted,
  showLabel,
  tabLabelSkeletonStyle,
  tabLabelStyle,
}: {
  presentation: WorkspaceTabPresentation;
  isHighlighted: boolean;
  showLabel: boolean;
  tabLabelSkeletonStyle: React.ComponentProps<typeof View>["style"];
  tabLabelStyle: React.ComponentProps<typeof Text>["style"];
}) {
  const workbenchGlyph = WORKBENCH_TAB_GLYPHS[presentation.kind];

  return (
    <View style={styles.tabHandle}>
      <View style={styles.tabIcon}>
        {workbenchGlyph ? (
          <Text style={isHighlighted ? styles.tabGlyphActive : styles.tabGlyph}>
            {workbenchGlyph}
          </Text>
        ) : (
          <WorkspaceTabIcon presentation={presentation} active={isHighlighted} />
        )}
      </View>
      {showLabel && presentation.titleState === "loading" ? (
        <View style={tabLabelSkeletonStyle} />
      ) : null}
      {showLabel && presentation.titleState !== "loading" ? (
        <Text style={tabLabelStyle} selectable={false} numberOfLines={1} ellipsizeMode="tail">
          {presentation.label}
        </Text>
      ) : null}
    </View>
  );
}

function TabChip({
  tab,
  isActive,
  isDragging,
  resolvedTabWidth,
  showLabel,
  showCloseButton,
  isCloseHovered,
  isClosingTab,
  presentation,
  tooltipLabel,
  resolvedTab,
  setHoveredTabKey,
  setHoveredCloseTabKey,
  onNavigateTab,
  onCloseTab,
  dragHandleProps,
}: {
  tab: WorkspaceTabDescriptor;
  isActive: boolean;
  isDragging: boolean;
  resolvedTabWidth: number;
  showLabel: boolean;
  showCloseButton: boolean;
  isCloseHovered: boolean;
  isClosingTab: boolean;
  presentation: WorkspaceTabPresentation;
  tooltipLabel: string;
  resolvedTab: WorkspaceDesktopTabActions;
  setHoveredTabKey: Dispatch<SetStateAction<string | null>>;
  setHoveredCloseTabKey: Dispatch<SetStateAction<string | null>>;
  onNavigateTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => Promise<void> | void;
  dragHandleProps: DraggableListDragHandleProps | undefined;
}) {
  const { t } = useTranslation();
  const { closeButtonTestId, contextMenuTestId, menuEntries } = resolvedTab;
  const middleClickRef = useMiddleClickClose(
    useCallback(() => void onCloseTab(tab.tabId), [onCloseTab, tab.tabId]),
  );
  const [hovered, setHovered] = useState(false);
  const isHighlighted = isActive || hovered || isCloseHovered;
  const closeButtonDragBlockers = isWeb
    ? ({
        onPointerDown: (event: { stopPropagation?: () => void }) => {
          event.stopPropagation?.();
        },
        onMouseDown: (event: { stopPropagation?: () => void }) => {
          event.stopPropagation?.();
        },
      } as const)
    : undefined;

  const tabChipStyle = useCallback(
    () => [
      styles.tab,
      isHighlighted && styles.tabHighlighted,
      isActive && styles.tabActive,
      isWeb && isDragging && ({ cursor: "grabbing" } as object),
      {
        minWidth: resolvedTabWidth,
        width: resolvedTabWidth,
        maxWidth: resolvedTabWidth,
      },
    ],
    [isActive, isDragging, isHighlighted, resolvedTabWidth],
  );

  const handleTabHoverIn = useCallback(() => {
    setHovered(true);
    setHoveredTabKey(tab.key);
  }, [setHoveredTabKey, tab.key]);

  const handleTabHoverOut = useCallback(() => {
    setHovered(false);
    setHoveredTabKey((current) => (current === tab.key ? null : current));
  }, [setHoveredTabKey, tab.key]);

  const handleNavigateTab = useCallback(() => {
    onNavigateTab(tab.tabId);
  }, [onNavigateTab, tab.tabId]);

  const handleCloseButtonPressIn = useCallback((event: { stopPropagation?: () => void }) => {
    event.stopPropagation?.();
  }, []);

  const handleCloseButtonHoverIn = useCallback(() => {
    setHoveredTabKey(tab.key);
    setHoveredCloseTabKey(tab.key);
  }, [setHoveredTabKey, setHoveredCloseTabKey, tab.key]);

  const handleCloseButtonHoverOut = useCallback(() => {
    setHoveredTabKey((current) => (current === tab.key ? null : current));
    setHoveredCloseTabKey((current) => (current === tab.key ? null : current));
  }, [setHoveredTabKey, setHoveredCloseTabKey, tab.key]);

  const handleCloseButtonPress = useCallback(
    (event: { stopPropagation?: () => void }) => {
      event.stopPropagation?.();
      void onCloseTab(tab.tabId);
    },
    [onCloseTab, tab.tabId],
  );

  const closeButtonStyle = useCallback(
    ({ hovered: isButtonHovered, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.tabCloseButton,
      styles.tabCloseButtonShown,
      (Boolean(isButtonHovered) || pressed) && styles.tabCloseButtonActive,
    ],
    [],
  );

  const tabAccessibilityState = useMemo(() => ({ selected: isActive }), [isActive]);
  const tabLabelSkeletonStyle = useMemo(
    () => [styles.tabLabelSkeleton, showCloseButton && styles.tabLabelSkeletonWithCloseButton],
    [showCloseButton],
  );
  const tabLabelStyle = useMemo(
    () => [
      styles.tabLabel,
      isHighlighted && styles.tabLabelActive,
      showCloseButton && styles.tabLabelWithCloseButton,
    ],
    [isHighlighted, showCloseButton],
  );

  return (
    <View ref={middleClickRef}>
      <ContextMenu key={tab.key}>
        <Tooltip delayDuration={400} enabledOnDesktop enabledOnMobile={false}>
          <TooltipTrigger asChild triggerRefProp="triggerRef">
            <ContextMenuTrigger
              {...(dragHandleProps?.attributes as object | undefined)}
              {...(dragHandleProps?.listeners as object | undefined)}
              testID={`workspace-tab-${buildDeterministicWorkspaceTabId(tab.target)}`}
              triggerRef={dragHandleProps?.setActivatorNodeRef as unknown as undefined}
              enabledOnMobile={false}
              style={tabChipStyle}
              onHoverIn={handleTabHoverIn}
              onHoverOut={handleTabHoverOut}
              onPressIn={handleNavigateTab}
              onPress={handleNavigateTab}
              accessibilityRole="button"
              accessibilityLabel={tooltipLabel}
              accessibilityState={tabAccessibilityState}
              aria-selected={isActive}
            >
              <TabHandleContent
                presentation={presentation}
                isHighlighted={isHighlighted}
                showLabel={showLabel}
                tabLabelSkeletonStyle={tabLabelSkeletonStyle}
                tabLabelStyle={tabLabelStyle}
              />

              {showCloseButton ? (
                <Pressable
                  {...(closeButtonDragBlockers as object | undefined)}
                  testID={closeButtonTestId}
                  accessibilityRole="button"
                  accessibilityLabel={`${t("workspace.tabMenu.close")}: ${tooltipLabel}`}
                  disabled={isClosingTab}
                  onPressIn={handleCloseButtonPressIn}
                  onHoverIn={handleCloseButtonHoverIn}
                  onHoverOut={handleCloseButtonHoverOut}
                  onPress={handleCloseButtonPress}
                  style={closeButtonStyle}
                >
                  {({ hovered: closeHovered, pressed }) =>
                    isClosingTab ? (
                      <ThemedActivityIndicator
                        size={12}
                        uniProps={
                          closeHovered || pressed ? foregroundColorMapping : mutedColorMapping
                        }
                      />
                    ) : (
                      <ThemedX
                        size={12}
                        uniProps={
                          closeHovered || pressed ? foregroundColorMapping : mutedColorMapping
                        }
                      />
                    )
                  }
                </Pressable>
              ) : null}
            </ContextMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="center" offset={8}>
            {tab.target.kind === "agent" ? (
              <View style={styles.tooltipAgentRow}>
                <Text style={styles.newTabTooltipText}>{tooltipLabel}</Text>
                <Text style={styles.tooltipAgentId}>{tab.target.agentId.slice(0, 7)}</Text>
              </View>
            ) : (
              <Text style={styles.newTabTooltipText}>{tooltipLabel}</Text>
            )}
          </TooltipContent>
        </Tooltip>

        <ContextMenuContent align="start" width={TAB_DROPDOWN_WIDTH} testID={contextMenuTestId}>
          {menuEntries.map((entry) =>
            entry.kind === "separator" ? (
              <ContextMenuSeparator key={entry.key} />
            ) : (
              <TabContextMenuItem key={entry.key} entry={entry} />
            ),
          )}
        </ContextMenuContent>
      </ContextMenu>
    </View>
  );
}

export function WorkspaceDesktopTabsRow({
  paneId,
  tabs,
  normalizedServerId,
  normalizedWorkspaceId,
  setHoveredTabKey,
  setHoveredCloseTabKey,
  onNavigateTab,
  onCloseTab,
  onCopyResumeCommand,
  onCopyAgentId,
  onReloadAgent,
  onRenameTab,
  onCloseTabsToLeft,
  onCloseTabsToRight,
  onCloseOtherTabs,
  onCreateDraftTab,
  onCreateTerminalTab,
  onCreateBrowserTab,
  showCreateBrowserTab = false,
  disableCreateTerminal = false,
  isWaitingOnTerminalReadiness = false,
  onReorderTabs,
  onSplitRight,
  onSplitDown,
  externalDndContext = false,
  activeDragTabId = null,
  tabDropPreviewIndex = null,
  showPaneSplitActions = true,
  trailingControls = null,
}: WorkspaceDesktopTabsRowProps) {
  const { t } = useTranslation();
  const fallbackTabLabels = useMemo(
    () => ({
      newAgent: t("workspace.newAgent"),
      setup: t("workspace.setup"),
      terminal: t("terminal.title"),
      agent: t("session.agent"),
    }),
    [t],
  );
  const newTabKeys = useShortcutKeys("workspace-tab-new");

  const splitRightKeys = useShortcutKeys("workspace-pane-split-right");
  const [tabsContainerWidth, setTabsContainerWidth] = useState<number>(0);
  const [tabsActionsWidth, setTabsActionsWidth] = useState<number>(0);

  const handleTabsContainerLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = Math.round(event.nativeEvent.layout.width);
    setTabsContainerWidth((current) => (Math.abs(current - nextWidth) > 1 ? nextWidth : current));
  }, []);

  const handleTabsActionsLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = Math.round(event.nativeEvent.layout.width);
    setTabsActionsWidth((current) => (Math.abs(current - nextWidth) > 1 ? nextWidth : current));
  }, []);

  const layoutMetrics = useMemo(
    () => ({
      rowHorizontalInset: 0,
      actionsReservedWidth: Math.max(0, tabsActionsWidth),
      rowPaddingHorizontal: 0,
      tabGap: 2,
      maxTabWidth: WORKBENCH_TAB_MAX_WIDTH,
      minTabWidth: WORKBENCH_TAB_MIN_WIDTH,
      tabIconWidth: 14,
      tabHorizontalPadding: 8,
      tabContentGap: WORKBENCH_TAB_GAP * 2,
      estimatedCharWidth: WORKBENCH_TAB_ESTIMATED_CHAR_WIDTH,
      closeButtonWidth: 28,
    }),
    [tabsActionsWidth],
  );

  const tabLabelLengths = useMemo(
    () =>
      tabs.map((tab) => {
        const label = getFallbackTabLabel(tab.tab, fallbackTabLabels);
        return label.length;
      }),
    [fallbackTabLabels, tabs],
  );

  const { layout } = useWorkspaceTabLayout({
    tabLabelLengths,
    viewportWidthOverride: tabsContainerWidth > 0 ? tabsContainerWidth : null,
    metrics: layoutMetrics,
  });
  const { visibleTabs, hiddenTabs } = useVisibleWorkspaceTabs({
    requiresOverflow: layout.requiresHorizontalScrollFallback,
    tabs,
    tabsActionsWidth,
    tabsContainerWidth,
  });

  const handleDragEnd = useCallback(
    (nextTabs: WorkspaceDesktopTabRowItem[]) => {
      onReorderTabs(nextTabs.map((tab) => tab.tab));
    },
    [onReorderTabs],
  );

  const getTabDragData = useMemo(() => {
    if (!paneId) return undefined;
    return (tab: WorkspaceDesktopTabRowItem) => ({
      kind: "workspace-tab" as const,
      paneId,
      tabId: tab.tab.tabId,
    });
  }, [paneId]);

  const handleCreateAgentTab = useCallback(() => {
    onCreateDraftTab({ paneId });
  }, [onCreateDraftTab, paneId]);

  const handleCreateTerminal = useCallback(() => {
    onCreateTerminalTab({ paneId });
  }, [onCreateTerminalTab, paneId]);
  const handleCreateBrowserTab = useCallback(() => {
    onCreateBrowserTab({ paneId });
  }, [onCreateBrowserTab, paneId]);

  const terminalDisabled = disableCreateTerminal || isWaitingOnTerminalReadiness;

  const renderTab = useCallback(
    ({
      item,
      index,
      dragHandleProps,
      isActive,
    }: DraggableRenderItemInfo<WorkspaceDesktopTabRowItem>) => {
      const shouldShowCloseButton = layout.closeButtonPolicy === "all";
      const originalIndex = tabs.findIndex((tab) => tab.tab.tabId === item.tab.tabId);
      const layoutItem = layout.items[originalIndex >= 0 ? originalIndex : index] ?? null;
      const resolvedTabWidth = layoutItem?.width ?? 150;
      const showLabel = layoutItem?.showLabel ?? true;
      const resolvedIndex = originalIndex >= 0 ? originalIndex : index;
      const showDropIndicatorBefore =
        activeDragTabId !== null && tabDropPreviewIndex === resolvedIndex;
      const showDropIndicatorAfter =
        activeDragTabId !== null &&
        tabDropPreviewIndex === tabs.length &&
        resolvedIndex === tabs.length - 1;

      return (
        <ResolvedDesktopTabChip
          key={`${item.tab.key}:${item.tab.kind}`}
          item={item}
          isDragging={isActive}
          index={resolvedIndex}
          tabCount={tabs.length}
          normalizedServerId={normalizedServerId}
          normalizedWorkspaceId={normalizedWorkspaceId}
          onCopyResumeCommand={onCopyResumeCommand}
          onCopyAgentId={onCopyAgentId}
          onReloadAgent={onReloadAgent}
          onRenameTab={onRenameTab}
          onCloseTabsToLeft={onCloseTabsToLeft}
          onCloseTabsToRight={onCloseTabsToRight}
          onCloseOtherTabs={onCloseOtherTabs}
          resolvedTabWidth={resolvedTabWidth}
          showLabel={showLabel}
          showCloseButton={shouldShowCloseButton}
          setHoveredTabKey={setHoveredTabKey}
          setHoveredCloseTabKey={setHoveredCloseTabKey}
          onNavigateTab={onNavigateTab}
          onCloseTab={onCloseTab}
          dragHandleProps={dragHandleProps}
          showDropIndicatorBefore={showDropIndicatorBefore}
          showDropIndicatorAfter={showDropIndicatorAfter}
        />
      );
    },
    [
      activeDragTabId,
      layout.closeButtonPolicy,
      layout.items,
      normalizedServerId,
      normalizedWorkspaceId,
      onCloseOtherTabs,
      onCloseTab,
      onCloseTabsToLeft,
      onCloseTabsToRight,
      onCopyAgentId,
      onCopyResumeCommand,
      onNavigateTab,
      onReloadAgent,
      onRenameTab,
      setHoveredCloseTabKey,
      setHoveredTabKey,
      tabDropPreviewIndex,
      tabs,
    ],
  );

  const tabsScrollStyle = useMemo(
    () => [
      styles.tabsScroll,
      layout.requiresHorizontalScrollFallback
        ? styles.tabsScrollOverflow
        : styles.tabsScrollFitContent,
    ],
    [layout.requiresHorizontalScrollFallback],
  );

  return (
    <View
      style={styles.tabsContainer}
      testID="workspace-tabs-row"
      onLayout={handleTabsContainerLayout}
    >
      <ScrollView
        horizontal
        scrollEnabled={false}
        testID="workspace-tabs-scroll"
        style={tabsScrollStyle}
        contentContainerStyle={styles.tabsContent}
        showsHorizontalScrollIndicator={false}
      >
        <SortableInlineList
          data={visibleTabs}
          keyExtractor={tabKeyExtractor}
          useDragHandle
          disabled={
            layout.requiresHorizontalScrollFallback || (!externalDndContext && tabs.length < 2)
          }
          onDragEnd={layout.requiresHorizontalScrollFallback ? undefined : handleDragEnd}
          externalDndContext={externalDndContext}
          activeId={activeDragTabId}
          getItemData={getTabDragData}
          renderItem={renderTab}
        />
      </ScrollView>
      <View
        testID="workspace-tabs-actions"
        style={TABS_ACTIONS_STYLE}
        onLayout={handleTabsActionsLayout}
      >
        <WorkspaceTabsOverflowMenu
          hiddenTabs={hiddenTabs}
          normalizedServerId={normalizedServerId}
          normalizedWorkspaceId={normalizedWorkspaceId}
          onNavigateTab={onNavigateTab}
        />
        <Tooltip delayDuration={0} enabledOnDesktop enabledOnMobile={false}>
          <TooltipTrigger
            testID="workspace-new-agent-tab"
            onPress={handleCreateAgentTab}
            accessibilityRole="button"
            accessibilityLabel={t("workspace.desktopTabs.newAgentTab")}
            style={newTabActionButtonStyle}
          >
            <ThemedPlus size={16} uniProps={mutedColorMapping} />
          </TooltipTrigger>
          <TooltipContent side="bottom" align="center" offset={8}>
            <View style={styles.newTabTooltipRow}>
              <Text style={styles.newTabTooltipText}>{t("workspace.desktopTabs.newAgentTab")}</Text>
              {newTabKeys ? (
                <Shortcut chord={newTabKeys} style={styles.newTabTooltipShortcut} />
              ) : null}
            </View>
          </TooltipContent>
        </Tooltip>
        <WorkspaceOptionalSplitRightButton
          showPaneSplitActions={showPaneSplitActions}
          onSplitRight={onSplitRight}
          splitRightKeys={splitRightKeys}
        />
        <WorkspaceTabMoreMenu
          showCreateBrowserTab={showCreateBrowserTab}
          terminalDisabled={terminalDisabled}
          onCreateBrowserTab={handleCreateBrowserTab}
          onCreateTerminal={handleCreateTerminal}
          onSplitDown={onSplitDown}
        />{" "}
        {trailingControls}
      </View>
    </View>
  );
}

function ResolvedDesktopTabChip({
  item,
  isDragging,
  index,
  tabCount,
  normalizedServerId,
  normalizedWorkspaceId,
  onCopyResumeCommand,
  onCopyAgentId,
  onReloadAgent,
  onRenameTab,
  onCloseTabsToLeft,
  onCloseTabsToRight,
  onCloseOtherTabs,
  resolvedTabWidth,
  showLabel,
  showCloseButton,
  setHoveredTabKey,
  setHoveredCloseTabKey,
  onNavigateTab,
  onCloseTab,
  dragHandleProps,
  showDropIndicatorBefore,
  showDropIndicatorAfter,
}: {
  item: WorkspaceDesktopTabRowItem;
  isDragging: boolean;
  index: number;
  tabCount: number;
  normalizedServerId: string;
  normalizedWorkspaceId: string;
  onCopyResumeCommand: (agentId: string) => Promise<void> | void;
  onCopyAgentId: (agentId: string) => Promise<void> | void;
  onReloadAgent: (agentId: string) => Promise<void> | void;
  onRenameTab: (tab: WorkspaceTabDescriptor) => void;
  onCloseTabsToLeft: (tabId: string) => Promise<void> | void;
  onCloseTabsToRight: (tabId: string) => Promise<void> | void;
  onCloseOtherTabs: (tabId: string) => Promise<void> | void;
  resolvedTabWidth: number;
  showLabel: boolean;
  showCloseButton: boolean;
  setHoveredTabKey: Dispatch<SetStateAction<string | null>>;
  setHoveredCloseTabKey: Dispatch<SetStateAction<string | null>>;
  onNavigateTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => Promise<void> | void;
  dragHandleProps: DraggableListDragHandleProps | undefined;
  showDropIndicatorBefore: boolean;
  showDropIndicatorAfter: boolean;
}) {
  const { t } = useTranslation();
  const tabMenuCopy = useMemo(
    () => ({
      copyResumeCommand: t("workspace.tabMenu.copyResumeCommand"),
      copyAgentId: t("workspace.tabMenu.copyAgentId"),
      rename: t("workspace.tabMenu.rename"),
      closeTabsAbove: t("workspace.tabMenu.closeTabsAbove"),
      closeTabsBelow: t("workspace.tabMenu.closeTabsBelow"),
      closeTabsLeft: t("workspace.tabMenu.closeTabsLeft"),
      closeTabsRight: t("workspace.tabMenu.closeTabsRight"),
      closeOtherTabs: t("workspace.tabMenu.closeOtherTabs"),
      reloadAgent: t("workspace.tabMenu.reloadAgent"),
      reloadAgentTooltip: t("workspace.tabMenu.reloadAgentTooltip"),
      close: t("workspace.tabMenu.close"),
    }),
    [t],
  );
  const resolvedTab = useMemo(
    () =>
      buildWorkspaceDesktopTabActions({
        tab: item.tab,
        index,
        tabCount,
        copy: tabMenuCopy,
        onCopyResumeCommand,
        onCopyAgentId,
        onReloadAgent,
        onRenameTab,
        onCloseTab,
        onCloseTabsToLeft,
        onCloseTabsToRight,
        onCloseOtherTabs,
      }),
    [
      index,
      item.tab,
      onCloseOtherTabs,
      onCloseTab,
      onCloseTabsToLeft,
      onCloseTabsToRight,
      onCopyAgentId,
      onCopyResumeCommand,
      onReloadAgent,
      onRenameTab,
      tabCount,
      tabMenuCopy,
    ],
  );

  return (
    <WorkspaceTabPresentationResolver
      tab={item.tab}
      serverId={normalizedServerId}
      workspaceId={normalizedWorkspaceId}
    >
      {(presentation) => {
        const tooltipLabel =
          presentation.titleState === "loading"
            ? t("workspace.desktopTabs.loadingAgentTitle")
            : presentation.label;

        return (
          <View style={styles.tabSlot}>
            {showDropIndicatorBefore ? <View style={TAB_DROP_INDICATOR_BEFORE_STYLE} /> : null}
            <TabChip
              tab={item.tab}
              isActive={item.isActive}
              isDragging={isDragging}
              resolvedTabWidth={resolvedTabWidth}
              showLabel={showLabel}
              showCloseButton={showCloseButton}
              isCloseHovered={item.isCloseHovered}
              isClosingTab={item.isClosingTab}
              presentation={presentation}
              tooltipLabel={tooltipLabel}
              resolvedTab={resolvedTab}
              setHoveredTabKey={setHoveredTabKey}
              setHoveredCloseTabKey={setHoveredCloseTabKey}
              onNavigateTab={onNavigateTab}
              onCloseTab={onCloseTab}
              dragHandleProps={dragHandleProps}
            />
            {showDropIndicatorAfter ? <View style={TAB_DROP_INDICATOR_AFTER_STYLE} /> : null}
          </View>
        );
      }}
    </WorkspaceTabPresentationResolver>
  );
}

const styles = StyleSheet.create((theme) => ({
  tabsContainer: {
    minWidth: 0,
    height: WORKSPACE_SECONDARY_HEADER_HEIGHT,
    borderBottomWidth: theme.borderWidth[1],
    borderBottomColor: theme.colors.border,
    backgroundColor: resolveThemeWorkbenchSurfaceRoles(theme).chrome,
    flexDirection: "row",
    alignItems: "flex-end",
    overflow: "hidden",
  },
  tabsScroll: {
    minWidth: 0,
  },
  tabsScrollFitContent: {
    flex: 1,
  },
  tabsScrollOverflow: {
    flex: 1,
  },
  tabsContent: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingLeft: 10,
    paddingVertical: 0,
    gap: 2,
  },
  tabsActions: {
    position: "relative",
    zIndex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 10,
    paddingBottom: 4,
  },
  tab: {
    height: 30,
    minHeight: 30,
    paddingHorizontal: 8,
    paddingVertical: 0,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderWidth: theme.borderWidth[1],
    borderBottomWidth: 0,
    borderColor: "transparent",
    flexDirection: "row",
    alignItems: "center",
    gap: WORKBENCH_TAB_GAP,
    userSelect: "none",
  },
  tabHighlighted: {
    backgroundColor: theme.colors.surface2,
  },
  tabActive: {
    backgroundColor: theme.colors.surfaceWorkspace,
    borderColor: theme.colors.border,
    ...(isWeb ? ({ boxShadow: "0 1px 3px rgba(0, 0, 0, 0.08)" } as object) : theme.shadow.sm),
  },

  tabSlot: {
    position: "relative",
    overflow: "visible",
  },
  tabHandle: {
    flexDirection: "row",
    alignItems: "center",
    gap: WORKBENCH_TAB_GAP,
    flex: 1,
    minWidth: 0,
    userSelect: "none",
  },
  tabIcon: {
    width: 14,
    height: 14,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  tabGlyph: {
    color: theme.colors.foregroundMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  tabGlyphActive: {
    color: theme.colors.foreground,
    fontSize: 12,
    lineHeight: 16,
  },
  tabDropIndicator: {
    position: "absolute",
    top: theme.spacing[2],
    bottom: theme.spacing[2],
    width: 5,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.accent,
    zIndex: 10,
    pointerEvents: "none",
  },
  tabDropIndicatorBefore: {
    left: -3,
  },
  tabDropIndicatorAfter: {
    right: -3,
  },
  tabLabel: {
    flexShrink: 1,
    minWidth: 0,
    color: theme.colors.foregroundMuted,
    fontSize: WORKBENCH_BODY_FONT_SIZE,
    lineHeight: WORKBENCH_BODY_LINE_HEIGHT,
    fontWeight: theme.fontWeight.normal,
    userSelect: "none",
  },
  tabLabelSkeleton: {
    width: 96,
    maxWidth: "100%",
    flexShrink: 1,
    minWidth: 0,
    height: 10,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface3,
    opacity: 0.9,
  },
  tabLabelSkeletonWithCloseButton: {
    width: LOADING_TAB_LABEL_SKELETON_WIDTH,
  },
  tabLabelWithCloseButton: {
    paddingRight: 0,
  },
  tabLabelActive: {
    color: theme.colors.foreground,
  },
  tabCloseButton: {
    width: 28,
    height: 28,
    marginLeft: 0,
    borderRadius: theme.borderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  tabCloseButtonShown: {
    opacity: 1,
  },
  tabCloseButtonActive: {
    backgroundColor: theme.colors.surface3,
  },
  newTabActionButton: {
    width: 28,
    height: 28,
    borderRadius: theme.borderRadius.md,
    borderWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  newTabActionButtonDisabled: {
    opacity: 0.5,
  },
  newTabActionButtonHovered: {
    backgroundColor: theme.colors.surface2,
    borderColor: theme.colors.borderAccent,
  },
  newTabTooltipText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  newTabTooltipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  newTabTooltipShortcut: {},
  tooltipAgentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  tooltipAgentId: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  menuItemHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
}));

const TABS_ACTIONS_STYLE = [styles.tabsActions, TITLEBAR_NO_DRAG_VIEW_STYLE];

const TAB_DROP_INDICATOR_BEFORE_STYLE = [styles.tabDropIndicator, styles.tabDropIndicatorBefore];
const TAB_DROP_INDICATOR_AFTER_STYLE = [styles.tabDropIndicator, styles.tabDropIndicatorAfter];
