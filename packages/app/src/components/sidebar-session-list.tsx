import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
  type GestureResponderEvent,
  type PressableStateCallbackType,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import {
  Archive,
  ChevronDown,
  ChevronRight,
  Copy,
  Folder,
  MoreHorizontal,
  Pencil,
  Pin,
  SquarePen,
  Trash2,
} from "lucide-react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { DraggableList, type DraggableRenderItemInfo } from "@/components/draggable-list";
import type { AggregatedAgent } from "@/hooks/use-aggregated-agents";
import {
  useIsCompactFormFactor,
  WORKBENCH_BODY_FONT_SIZE,
  WORKBENCH_BODY_LINE_HEIGHT,
  WORKBENCH_META_FONT_SIZE,
  WORKBENCH_META_LINE_HEIGHT,
  WORKBENCH_SIDEBAR_GROUP_LINE_HEIGHT,
} from "@/constants/layout";
import { isWeb } from "@/constants/platform";
import { resolveSidebarSessionGroupPresentation } from "@/components/sidebar-session-presentation";
import { Button } from "@/components/ui/button";
import { AgentStatusIndicator } from "@/components/ui/agent-status-indicator";
import { getProviderIcon } from "@/components/provider-icons";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AdaptiveRenameModal } from "@/components/rename-modal";
import { useToast } from "@/contexts/toast-context";
import { useArchiveAgent, useSuppressedArchiveAgentIds } from "@/hooks/use-archive-agent";
import { agentHistoryQueryKey } from "@/hooks/agent-history-query-key";
import { useSessionStore } from "@/stores/session-store";
import { useSidebarOrderStore } from "@/stores/sidebar-order-store";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { generateDraftId } from "@/stores/draft-keys";
import { confirmDialog } from "@/utils/confirm-dialog";
import { rememberArchivedAgentDetail } from "@/utils/agent-history-navigation";
import type { SidebarSessionDraft } from "@/utils/left-sidebar-drafts";
import { navigateToAgent } from "@/utils/navigate-to-agent";
import {
  applyStableSidebarSessionOrder,
  PINNED_SIDEBAR_SESSION_GROUP_KEY,
  groupAgentsForSidebar,
  reconcileSidebarSessionOrder,
  type SidebarSessionGroup,
} from "@/utils/sidebar-session-groups";
import { buildHostNewWorkspaceRoute } from "@/utils/host-routes";

const SIDEBAR_PINNED_LABEL = "chisacode.sidebarPinned";

interface SidebarSessionListProps {
  agents: AggregatedAgent[];
  drafts?: SidebarSessionDraft[];
  serverId: string | null;
  selectedAgentId?: string;
  showGroupTitles?: boolean;
  isRefreshing?: boolean;
  isLoadingMore?: boolean;
  hasMore?: boolean;
  onRefresh?: () => void;
  onLoadMore?: () => void;
  onAgentPress?: () => void;
  onAddProject?: () => void;
}

interface SidebarSessionRenderGroup extends SidebarSessionGroup {
  workspaceId: string | null;
}

interface AgentListCacheAgent {
  id?: string | null;
  labels?: Record<string, string>;
}

interface AgentListCachePayload {
  entries?: Array<{ agent?: AgentListCacheAgent | null } | null>;
}

interface AgentHistoryCacheAgent {
  id?: string | null;
  labels?: Record<string, string>;
}

interface AgentHistoryCachePayload {
  pages?: Array<{ agents?: AgentHistoryCacheAgent[] }>;
}

interface SidebarPinnedCacheSnapshot {
  sidebarAgentsList: AgentListCachePayload | undefined;
  allAgents: AgentListCachePayload | undefined;
  agentHistory: AgentHistoryCachePayload | undefined;
}

function getAgentActionKey(agent: AggregatedAgent): string {
  return `${agent.serverId}:${agent.id}`;
}

function sidebarSessionKeyExtractor(agent: AggregatedAgent): string {
  return getAgentActionKey(agent);
}

function ordersEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((key, index) => key === right[index]);
}

function isSidebarAgentPinned(agent: AggregatedAgent): boolean {
  return agent.labels?.[SIDEBAR_PINNED_LABEL] === "true";
}

function getSidebarSessionTitle(agent: AggregatedAgent, fallbackTitle: string): string {
  const title = agent.title?.trim();
  return title && title.length > 0 ? title : fallbackTitle;
}

async function copySidebarSessionText({
  text,
  copiedLabel,
  copyFailedLabel,
  toast,
}: {
  text: string;
  copiedLabel: string;
  copyFailedLabel: string;
  toast: ReturnType<typeof useToast>;
}) {
  try {
    await Clipboard.setStringAsync(text);
    toast.copied(copiedLabel);
  } catch {
    toast.error(copyFailedLabel);
  }
}

function updateAgentLabelsInStore(input: {
  serverId: string;
  agentId: string;
  labels: Record<string, string>;
}) {
  const setAgents = useSessionStore.getState().setAgents;
  setAgents(input.serverId, (prev) => {
    const existing = prev.get(input.agentId);
    if (!existing) {
      return prev;
    }
    const next = new Map(prev);
    next.set(input.agentId, {
      ...existing,
      labels: {
        ...existing.labels,
        ...input.labels,
      },
    });
    return next;
  });
}

function patchAgentLabelsInListPayload<T extends AgentListCachePayload | undefined>(
  payload: T,
  input: { agentId: string; labels: Record<string, string> },
): T {
  if (!payload || !Array.isArray(payload.entries)) {
    return payload;
  }

  let changed = false;
  const entries = payload.entries.map((entry) => {
    if (!entry?.agent || entry.agent.id !== input.agentId) {
      return entry;
    }
    changed = true;
    return {
      ...entry,
      agent: {
        ...entry.agent,
        labels: {
          ...entry.agent.labels,
          ...input.labels,
        },
      },
    };
  });

  return changed ? ({ ...payload, entries } as T) : payload;
}

function patchAgentLabelsInHistoryPayload<T extends AgentHistoryCachePayload | undefined>(
  payload: T,
  input: { agentId: string; labels: Record<string, string> },
): T {
  if (!payload || !Array.isArray(payload.pages)) {
    return payload;
  }

  let changed = false;
  const pages = payload.pages.map((page) => {
    if (!Array.isArray(page.agents)) {
      return page;
    }

    let pageChanged = false;
    const agents = page.agents.map((agent) => {
      if (agent.id !== input.agentId) {
        return agent;
      }
      pageChanged = true;
      changed = true;
      return {
        ...agent,
        labels: {
          ...agent.labels,
          ...input.labels,
        },
      };
    });
    return pageChanged ? { ...page, agents } : page;
  });

  return changed ? ({ ...payload, pages } as T) : payload;
}

function getPinnedCacheSnapshot(
  queryClient: ReturnType<typeof useQueryClient>,
  serverId: string,
): SidebarPinnedCacheSnapshot {
  return {
    sidebarAgentsList: queryClient.getQueryData<AgentListCachePayload | undefined>([
      "sidebarAgentsList",
      serverId,
    ]),
    allAgents: queryClient.getQueryData<AgentListCachePayload | undefined>(["allAgents", serverId]),
    agentHistory: queryClient.getQueryData<AgentHistoryCachePayload | undefined>(
      agentHistoryQueryKey(serverId),
    ),
  };
}

function restoreCachedQuerySnapshot(
  queryClient: ReturnType<typeof useQueryClient>,
  queryKey: readonly unknown[],
  snapshot: unknown,
): void {
  if (snapshot === undefined) {
    queryClient.removeQueries({ queryKey, exact: true });
    return;
  }
  queryClient.setQueryData(queryKey, snapshot);
}

function restorePinnedCacheSnapshot(
  queryClient: ReturnType<typeof useQueryClient>,
  serverId: string,
  snapshot: SidebarPinnedCacheSnapshot,
): void {
  restoreCachedQuerySnapshot(
    queryClient,
    ["sidebarAgentsList", serverId],
    snapshot.sidebarAgentsList,
  );
  restoreCachedQuerySnapshot(queryClient, ["allAgents", serverId], snapshot.allAgents);
  restoreCachedQuerySnapshot(queryClient, agentHistoryQueryKey(serverId), snapshot.agentHistory);
}

function patchAgentLabelsInSidebarCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  input: { serverId: string; agentId: string; labels: Record<string, string> },
): void {
  queryClient.setQueryData<AgentListCachePayload | undefined>(
    ["sidebarAgentsList", input.serverId],
    (current) => patchAgentLabelsInListPayload(current, input),
  );
  queryClient.setQueryData<AgentListCachePayload | undefined>(
    ["allAgents", input.serverId],
    (current) => patchAgentLabelsInListPayload(current, input),
  );
  queryClient.setQueryData<AgentHistoryCachePayload | undefined>(
    agentHistoryQueryKey(input.serverId),
    (current) => patchAgentLabelsInHistoryPayload(current, input),
  );
}

function deleteAgentFromStore(input: { serverId: string; agentId: string }) {
  useWorkspaceLayoutStore.getState().unpinAgentEverywhere(input.agentId);
  const setAgents = useSessionStore.getState().setAgents;
  const setAgentDetails = useSessionStore.getState().setAgentDetails;
  setAgents(input.serverId, (prev) => {
    if (!prev.has(input.agentId)) {
      return prev;
    }
    const next = new Map(prev);
    next.delete(input.agentId);
    return next;
  });
  setAgentDetails(input.serverId, (prev) => {
    if (!prev.has(input.agentId)) {
      return prev;
    }
    const next = new Map(prev);
    next.delete(input.agentId);
    return next;
  });
}

function invalidateSidebarSessionQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  serverId: string,
) {
  void queryClient.invalidateQueries({ queryKey: ["sidebarAgentsList", serverId] });
  void queryClient.invalidateQueries({ queryKey: ["allAgents", serverId] });
  void queryClient.invalidateQueries({ queryKey: agentHistoryQueryKey(serverId) });
}

function buildRenderGroups(agentGroups: SidebarSessionGroup[]): SidebarSessionRenderGroup[] {
  return agentGroups.map((group) => ({
    ...group,
    workspaceId: null,
  }));
}

// eslint-disable-next-line complexity -- Cross-platform row owns desktop hover, desktop context menu, and compact menu parity.
function SidebarSessionRow({
  agent,
  selectedAgentId,
  onAgentPress,
  onTogglePin,
  onRename,
  onArchive,
  onDelete,
  isPinning,
  isArchiving,
  isDeleting,
  isDragging = false,
  drag,
}: {
  agent: AggregatedAgent;
  selectedAgentId?: string;
  onAgentPress?: () => void;
  onTogglePin: (agent: AggregatedAgent) => void;
  onRename: (agent: AggregatedAgent) => void;
  onArchive: (agent: AggregatedAgent) => void;
  onDelete: (agent: AggregatedAgent) => void;
  isPinning: boolean;
  isArchiving: boolean;
  isDeleting: boolean;
  isDragging?: boolean;
  drag?: () => void;
}) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const toast = useToast();
  const isCompact = useIsCompactFormFactor();
  const agentActionKey = getAgentActionKey(agent);
  const ProviderIcon = getProviderIcon(agent.provider);
  const isSelected = selectedAgentId === `${agent.serverId}:${agent.id}`;
  const isPinned = isSidebarAgentPinned(agent);
  const [isHovered, setIsHovered] = useState(false);

  const sessionTitle = getSidebarSessionTitle(agent, t("session.newSession"));
  const rowBaseStyle = isCompact ? styles.row : styles.desktopRow;
  const rowHoveredStyle = isCompact ? styles.rowHovered : styles.desktopRowHovered;
  const rowSelectedStyle = isCompact ? styles.rowSelected : styles.desktopRowSelected;
  const rowPressedStyle = isCompact ? styles.rowPressed : styles.desktopRowPressed;
  const rowLeadingStyle = isCompact ? styles.rowLeading : styles.desktopRowLeading;
  const rowContentStyle = isCompact ? styles.rowContent : styles.desktopRowContent;
  const rowTitleStyle = isCompact ? styles.rowTitle : styles.desktopRowTitle;
  const rowTitleSelectedStyle = isCompact
    ? styles.rowTitleSelected
    : styles.desktopRowTitleSelected;

  const selectedIndicatorStyle = isCompact
    ? styles.rowSelectedIndicator
    : styles.desktopRowSelectedIndicator;

  const rowStyle = useCallback(
    ({ hovered = false, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      rowBaseStyle,
      Boolean(hovered) && rowHoveredStyle,
      isSelected && rowSelectedStyle,
      isDragging && styles.desktopRowDragging,
      pressed && rowPressedStyle,
    ],
    [isDragging, isSelected, rowBaseStyle, rowHoveredStyle, rowPressedStyle, rowSelectedStyle],
  );
  const titleStyle = useMemo(
    () => [rowTitleStyle, isSelected && rowTitleSelectedStyle],
    [isSelected, rowTitleSelectedStyle, rowTitleStyle],
  );
  const rowAccessibilityState = useMemo(() => ({ selected: isSelected }), [isSelected]);
  const rowIconColor = isSelected ? theme.colors.foreground : theme.colors.foregroundMuted;
  const showDesktopMenu = isHovered || isPinning || isArchiving || isDeleting;
  const handleHoverIn = useCallback(() => setIsHovered(true), []);
  const handleHoverOut = useCallback(() => setIsHovered(false), []);
  const desktopMenuSlotStyle = useMemo(
    () => [styles.desktopRowMenuSlot, !showDesktopMenu && styles.desktopRowMenuHidden],
    [showDesktopMenu],
  );

  const handlePress = useCallback(
    (event: GestureResponderEvent) => {
      event.stopPropagation();
      rememberArchivedAgentDetail(agent);
      onAgentPress?.();
      navigateToAgent({
        serverId: agent.serverId,
        agentId: agent.id,
        pin: Boolean(agent.archivedAt),
      });
    },
    [agent, onAgentPress],
  );
  const handleRename = useCallback(() => onRename(agent), [agent, onRename]);
  const handleTogglePin = useCallback(() => onTogglePin(agent), [agent, onTogglePin]);
  const handleArchive = useCallback(() => onArchive(agent), [agent, onArchive]);
  const handleDelete = useCallback(() => onDelete(agent), [agent, onDelete]);
  const handleCopyPath = useCallback(() => {
    if (!agent.cwd) {
      return;
    }
    void copySidebarSessionText({
      text: agent.cwd,
      copiedLabel: t("common.copiedToClipboard"),
      copyFailedLabel: t("workspace.screen.copyFailed"),
      toast,
    });
  }, [agent.cwd, t, toast]);
  const handleCopyAgentId = useCallback(() => {
    void copySidebarSessionText({
      text: agent.id,
      copiedLabel: t("common.copiedToClipboard"),
      copyFailedLabel: t("workspace.screen.copyFailed"),
      toast,
    });
  }, [agent.id, t, toast]);
  const copyLeading = useMemo(
    () => <Copy size={16} color={theme.colors.foregroundMuted} />,
    [theme.colors.foregroundMuted],
  );
  const pinLeading = useMemo(
    () => <Pin size={16} color={theme.colors.foregroundMuted} />,
    [theme.colors.foregroundMuted],
  );
  const renameLeading = useMemo(
    () => <Pencil size={16} color={theme.colors.foregroundMuted} />,
    [theme.colors.foregroundMuted],
  );
  const archiveLeading = useMemo(
    () => <Archive size={16} color={theme.colors.foregroundMuted} />,
    [theme.colors.foregroundMuted],
  );
  const deleteLeading = useMemo(
    () => <Trash2 size={16} color={theme.colors.foregroundMuted} />,
    [theme.colors.foregroundMuted],
  );

  const menuButtonStyle = useCallback(
    ({ hovered = false, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.rowMenuButton,
      !isCompact && styles.desktopRowMenuButton,
      (Boolean(hovered) || pressed) && styles.rowMenuButtonActive,
    ],
    [isCompact],
  );

  const rowMainContent = (
    <>
      {isSelected ? <View style={selectedIndicatorStyle} /> : null}
      <View style={rowLeadingStyle}>
        <ProviderIcon size={theme.iconSize.sm} color={rowIconColor} />
      </View>
      <View style={rowContentStyle}>
        <Text style={titleStyle} numberOfLines={1}>
          {agent.title || t("session.newSession")}
        </Text>
        <AgentStatusIndicator
          status={agent.status}
          requiresAttention={agent.requiresAttention}
          attentionReason={agent.attentionReason}
          pendingPermissionCount={agent.pendingPermissionCount}
          size="sm"
        />
      </View>
    </>
  );

  const rowTrailingContent = (
    <DropdownMenu>
      <DropdownMenuTrigger
        testID={`sidebar-session-menu-${agent.serverId}-${agent.id}`}
        accessibilityLabel={t("sidebar.sessionActions")}
        style={menuButtonStyle}
      >
        <MoreHorizontal size={theme.iconSize.sm} color={theme.colors.foregroundMuted} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" width={220}>
        <DropdownMenuItem
          testID={`sidebar-session-toggle-pin-${agent.serverId}-${agent.id}`}
          onSelect={handleTogglePin}
          status={isPinning ? "pending" : "idle"}
          leading={pinLeading}
        >
          {isPinned ? t("sidebar.unpinSession") : t("sidebar.pinSession")}
        </DropdownMenuItem>
        <DropdownMenuItem
          testID={`sidebar-session-archive-${agent.serverId}-${agent.id}`}
          onSelect={handleArchive}
          disabled={Boolean(agent.archivedAt)}
          status={isArchiving ? "pending" : "idle"}
          pendingLabel={t("sidebar.archiving")}
          destructive={!agent.archivedAt}
          leading={archiveLeading}
        >
          {agent.archivedAt ? t("session.archived") : t("sidebar.archive")}
        </DropdownMenuItem>
        <DropdownMenuItem
          testID={`sidebar-session-copy-path-${agent.serverId}-${agent.id}`}
          onSelect={handleCopyPath}
          disabled={!agent.cwd}
          leading={copyLeading}
        >
          {t("sidebar.copyPath")}
        </DropdownMenuItem>
        <DropdownMenuItem
          testID={`sidebar-session-copy-agent-id-${agent.serverId}-${agent.id}`}
          onSelect={handleCopyAgentId}
          leading={copyLeading}
        >
          {t("workspace.tabMenu.copyAgentId")}
        </DropdownMenuItem>
        <DropdownMenuItem
          testID={`sidebar-session-rename-${agent.serverId}-${agent.id}`}
          onSelect={handleRename}
          leading={renameLeading}
        >
          {t("workspace.screen.rename")}
        </DropdownMenuItem>
        <DropdownMenuItem
          testID={`sidebar-session-delete-${agent.serverId}-${agent.id}`}
          onSelect={handleDelete}
          status={isDeleting ? "pending" : "idle"}
          pendingLabel={t("sidebar.deletingSession")}
          destructive
          leading={deleteLeading}
        >
          {t("sidebar.deleteSession")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (isCompact) {
    return (
      <Pressable
        style={rowStyle}
        onPress={handlePress}
        onLongPress={drag}
        testID={`sidebar-session-${agent.serverId}-${agent.id}`}
        accessibilityRole="button"
        accessibilityLabel={sessionTitle}
        accessibilityState={rowAccessibilityState}
      >
        {rowMainContent}
        {rowTrailingContent}
      </Pressable>
    );
  }

  return (
    <ContextMenu>
      <Pressable
        key={agentActionKey}
        style={styles.desktopRowContainer}
        onHoverIn={handleHoverIn}
        onHoverOut={handleHoverOut}
        testID={`sidebar-session-container-${agent.serverId}-${agent.id}`}
      >
        <ContextMenuTrigger
          enabledOnMobile={false}
          style={rowStyle}
          onPress={handlePress}
          onLongPress={drag}
          testID={`sidebar-session-${agent.serverId}-${agent.id}`}
          accessibilityRole="button"
          accessibilityLabel={sessionTitle}
          accessibilityState={rowAccessibilityState}
        >
          {rowMainContent}
        </ContextMenuTrigger>
        <View pointerEvents={showDesktopMenu ? "auto" : "none"} style={desktopMenuSlotStyle}>
          {rowTrailingContent}
        </View>
      </Pressable>
      <ContextMenuContent
        align="start"
        width={220}
        mobileMode="sheet"
        testID={`sidebar-session-context-${agent.serverId}-${agent.id}`}
      >
        <ContextMenuItem
          testID={`sidebar-session-copy-path-${agent.serverId}-${agent.id}`}
          onSelect={handleCopyPath}
          disabled={!agent.cwd}
          leading={copyLeading}
        >
          {t("sidebar.copyPath")}
        </ContextMenuItem>
        <ContextMenuItem
          testID={`sidebar-session-copy-agent-id-${agent.serverId}-${agent.id}`}
          onSelect={handleCopyAgentId}
          leading={copyLeading}
        >
          {t("workspace.tabMenu.copyAgentId")}
        </ContextMenuItem>
        <ContextMenuItem
          testID={`sidebar-session-rename-${agent.serverId}-${agent.id}`}
          onSelect={handleRename}
          leading={renameLeading}
        >
          {t("workspace.screen.rename")}
        </ContextMenuItem>
        <ContextMenuItem
          testID={`sidebar-session-delete-${agent.serverId}-${agent.id}`}
          onSelect={handleDelete}
          status={isDeleting ? "pending" : "idle"}
          pendingLabel={t("sidebar.deletingSession")}
          destructive
          leading={deleteLeading}
        >
          {t("sidebar.deleteSession")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function SidebarSessionGroupHeader({
  group,
  serverId,
  isCompact,
  collapsed,
  onToggleCollapsed,
}: {
  group: SidebarSessionRenderGroup;
  serverId: string | null;
  isCompact: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const toast = useToast();
  const [isHovered, setIsHovered] = useState(false);
  const presentation = resolveSidebarSessionGroupPresentation(isCompact);
  const canOpenDraft = Boolean(serverId && group.cwd);
  const canCollapse = Boolean(group.cwd);
  const isWorkspaceGroup = Boolean(group.cwd);
  const actionsVisible = isCompact || isHovered;
  const handleNewDraft = useCallback(
    (event: GestureResponderEvent) => {
      event.stopPropagation();
      if (!serverId || !group.cwd) {
        return;
      }
      router.push(
        buildHostNewWorkspaceRoute(serverId, group.cwd, {
          draftKey: generateDraftId(),
        }),
      );
    },
    [group.cwd, serverId],
  );
  const addButtonStyle = useCallback(
    ({ hovered = false, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.groupAddButton,
      (Boolean(hovered) || pressed) && styles.groupAddButtonActive,
    ],
    [],
  );
  const handleCopyPath = useCallback(() => {
    if (!group.cwd) {
      return;
    }
    void copySidebarSessionText({
      text: group.cwd,
      copiedLabel: t("sidebar.pathCopied"),
      copyFailedLabel: t("workspace.screen.copyFailed"),
      toast,
    });
  }, [group.cwd, t, toast]);
  const handlePointerEnter = useCallback(() => setIsHovered(true), []);
  const handlePointerLeave = useCallback(() => setIsHovered(false), []);
  const copyPathLeading = useMemo(
    () => <Copy size={theme.iconSize.sm} color={theme.colors.foregroundMuted} />,
    [theme.colors.foregroundMuted, theme.iconSize.sm],
  );
  const actionsStyle = useMemo(
    () => [styles.groupActions, !actionsVisible && styles.groupActionsHidden],
    [actionsVisible],
  );
  const headerStyle =
    presentation.variant === "workbench" ? styles.desktopGroupHeader : styles.groupHeader;
  const headerLabelStyle =
    presentation.variant === "workbench" ? styles.desktopGroupHeaderLabel : styles.groupHeaderLabel;
  const titleStyle =
    presentation.variant === "workbench" ? styles.desktopGroupTitle : styles.groupTitle;
  const accessibilityState = useMemo(
    () => (canCollapse ? { expanded: !collapsed } : undefined),
    [canCollapse, collapsed],
  );
  const resolvedTitleStyle = useMemo(
    () => [titleStyle, !isCompact && isWorkspaceGroup && styles.desktopWorkspaceGroupTitle],
    [isCompact, isWorkspaceGroup, titleStyle],
  );
  let collapseIndicator: React.ReactNode = null;
  if (canCollapse && presentation.showCollapseIndicator) {
    collapseIndicator = collapsed ? (
      <ChevronRight size={theme.iconSize.xs} color={theme.colors.foregroundSubtleText} />
    ) : (
      <ChevronDown size={theme.iconSize.xs} color={theme.colors.foregroundSubtleText} />
    );
  }

  return (
    <View
      style={headerStyle}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      <Pressable
        accessibilityRole={canCollapse ? "button" : undefined}
        accessibilityState={accessibilityState}
        disabled={!canCollapse}
        onPress={onToggleCollapsed}
        style={headerLabelStyle}
        testID={canCollapse ? `sidebar-session-group-toggle-${group.key}` : undefined}
      >
        {collapseIndicator}
        {presentation.showWorkspaceIcon && group.cwd ? (
          <Folder
            size={theme.iconSize.md}
            color={
              isWorkspaceGroup ? theme.colors.foregroundMuted : theme.colors.foregroundSubtleText
            }
          />
        ) : null}
        <Text style={resolvedTitleStyle} numberOfLines={1}>
          {group.label}
        </Text>
      </Pressable>
      {canOpenDraft ? (
        <View
          pointerEvents={actionsVisible ? "auto" : "none"}
          style={actionsStyle}
          testID={`sidebar-session-group-actions-${group.key}`}
        >
          <DropdownMenu>
            <DropdownMenuTrigger
              accessibilityRole={isWeb ? undefined : "button"}
              accessibilityLabel={t("sidebar.projectActions")}
              hitSlop={4}
              style={addButtonStyle}
              testID={`sidebar-session-group-menu-${group.key}`}
            >
              <MoreHorizontal size={theme.iconSize.sm} color={theme.colors.foregroundMuted} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" width={220}>
              <DropdownMenuItem
                leading={copyPathLeading}
                onSelect={handleCopyPath}
                testID={`sidebar-session-group-copy-path-${group.key}`}
              >
                {t("sidebar.copyPath")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("sidebar.createConversationForProject", {
              project: group.label,
            })}
            hitSlop={4}
            onPress={handleNewDraft}
            style={addButtonStyle}
            testID={`sidebar-session-group-new-${serverId}-${group.key}`}
          >
            <SquarePen size={theme.iconSize.sm} color={theme.colors.foregroundMuted} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

interface SidebarSessionGroupViewProps {
  group: SidebarSessionRenderGroup;
  groupStyle: StyleProp<ViewStyle>;
  serverId: string;
  isCompact: boolean;
  showGroupTitles: boolean;
  collapsed: boolean;
  selectedAgentId?: string;
  onAgentPress?: () => void;
  onTogglePin: (agent: AggregatedAgent) => void;
  onRename: (agent: AggregatedAgent) => void;
  onArchive: (agent: AggregatedAgent) => void;
  onDelete: (agent: AggregatedAgent) => void;
  pinningAgentKey: string | null;
  deletingAgentKey: string | null;
  isArchivingAgent: (input: { serverId: string; agentId: string }) => boolean;
  onToggleCollapsed: (groupKey: string) => void;
  onReorderAgents: (groupKey: string, agents: AggregatedAgent[]) => void;
}

function SidebarSessionGroupView({
  group,
  groupStyle,
  serverId,
  isCompact,
  showGroupTitles,
  collapsed,
  selectedAgentId,
  onAgentPress,
  onTogglePin,
  onRename,
  onArchive,
  onDelete,
  pinningAgentKey,
  deletingAgentKey,
  isArchivingAgent,
  onToggleCollapsed,
  onReorderAgents,
}: SidebarSessionGroupViewProps) {
  const handleToggleCollapsed = useCallback(
    () => onToggleCollapsed(group.key),
    [group.key, onToggleCollapsed],
  );
  const groupRowsStyle = useMemo(
    () => [styles.groupRows, !isCompact && group.cwd && styles.desktopWorkspaceGroupRows],
    [group.cwd, isCompact],
  );
  const renderAgent = useCallback(
    ({ item, drag, isActive }: DraggableRenderItemInfo<AggregatedAgent>) => (
      <SidebarSessionRow
        agent={item}
        selectedAgentId={selectedAgentId}
        onAgentPress={onAgentPress}
        onTogglePin={onTogglePin}
        onRename={onRename}
        onArchive={onArchive}
        onDelete={onDelete}
        isPinning={pinningAgentKey === getAgentActionKey(item)}
        isArchiving={isArchivingAgent({ serverId: item.serverId, agentId: item.id })}
        isDeleting={deletingAgentKey === getAgentActionKey(item)}
        isDragging={isActive}
        drag={drag}
      />
    ),
    [
      deletingAgentKey,
      isArchivingAgent,
      onAgentPress,
      onArchive,
      onDelete,
      onRename,
      onTogglePin,
      pinningAgentKey,
      selectedAgentId,
    ],
  );
  const handleDragEnd = useCallback(
    (agents: AggregatedAgent[]) => onReorderAgents(group.key, agents),
    [group.key, onReorderAgents],
  );
  let renderedRows: React.ReactNode = null;
  if (!collapsed) {
    renderedRows = isCompact ? (
      <View style={groupRowsStyle}>
        {group.agents.map((agent) => (
          <SidebarSessionRow
            key={`${agent.serverId}:${agent.id}`}
            agent={agent}
            selectedAgentId={selectedAgentId}
            onAgentPress={onAgentPress}
            onTogglePin={onTogglePin}
            onRename={onRename}
            onArchive={onArchive}
            onDelete={onDelete}
            isPinning={pinningAgentKey === getAgentActionKey(agent)}
            isArchiving={isArchivingAgent({ serverId: agent.serverId, agentId: agent.id })}
            isDeleting={deletingAgentKey === getAgentActionKey(agent)}
          />
        ))}
      </View>
    ) : (
      <DraggableList
        data={group.agents}
        keyExtractor={sidebarSessionKeyExtractor}
        renderItem={renderAgent}
        onDragEnd={handleDragEnd}
        scrollEnabled={false}
        containerStyle={groupRowsStyle}
        testID={`sidebar-session-order-${group.key}`}
      />
    );
  }

  return (
    <View style={groupStyle} testID={`sidebar-session-group-${group.key}`}>
      {showGroupTitles ? (
        <SidebarSessionGroupHeader
          group={group}
          serverId={serverId}
          isCompact={isCompact}
          collapsed={collapsed}
          onToggleCollapsed={handleToggleCollapsed}
        />
      ) : null}
      {renderedRows}
    </View>
  );
}

// eslint-disable-next-line complexity -- Session orchestration spans query caches, async actions, and responsive states.
export function SidebarSessionList({
  agents,
  serverId,
  selectedAgentId,
  showGroupTitles = true,
  isRefreshing = false,
  isLoadingMore = false,
  hasMore = false,
  onRefresh,
  onLoadMore,
  onAgentPress,
  onAddProject,
}: SidebarSessionListProps) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const isCompact = useIsCompactFormFactor();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { archiveAgent, isArchivingAgent } = useArchiveAgent();
  const suppressedArchiveAgentIds = useSuppressedArchiveAgentIds(serverId ?? "");
  const [renamingAgent, setRenamingAgent] = useState<AggregatedAgent | null>(null);
  const [pinningAgentKey, setPinningAgentKey] = useState<string | null>(null);
  const [deletingAgentKey, setDeletingAgentKey] = useState<string | null>(null);
  const [collapsedGroupKeys, setCollapsedGroupKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const sessionGroupOrderByServerId = useSidebarOrderStore(
    (state) => state.sessionGroupOrderByServerId,
  );
  const sessionOrderByServerAndGroup = useSidebarOrderStore(
    (state) => state.sessionOrderByServerAndGroup,
  );
  const getSessionOrder = useSidebarOrderStore((state) => state.getSessionOrder);
  const setSessionGroupOrder = useSidebarOrderStore((state) => state.setSessionGroupOrder);
  const setSessionOrder = useSidebarOrderStore((state) => state.setSessionOrder);
  const visibleAgents = useMemo(
    () => agents.filter((agent) => !agent.archivedAt && !suppressedArchiveAgentIds.has(agent.id)),
    [agents, suppressedArchiveAgentIds],
  );
  const resolvedSelectedAgentId = useMemo(() => {
    if (selectedAgentId) {
      return selectedAgentId;
    }
    return visibleAgents.length === 1
      ? `${visibleAgents[0].serverId}:${visibleAgents[0].id}`
      : undefined;
  }, [selectedAgentId, visibleAgents]);
  const activitySortedGroups = useMemo(() => {
    const unknownWorkspaceLabel = t("sidebar.unknownWorkspace");
    const agentGroups = groupAgentsForSidebar(visibleAgents, {
      unknownWorkspaceLabel,
      pinnedGroupLabel: t("sidebar.pinnedSessions"),
      isPinnedAgent: isSidebarAgentPinned,
    });
    return buildRenderGroups(agentGroups);
  }, [t, visibleAgents]);
  const storedGroupOrder = useMemo(
    () => (serverId ? (sessionGroupOrderByServerId[serverId] ?? []) : []),
    [serverId, sessionGroupOrderByServerId],
  );
  const storedAgentOrderByGroup = useMemo(() => {
    void sessionOrderByServerAndGroup;
    if (!serverId) {
      return {};
    }
    return Object.fromEntries(
      activitySortedGroups.map((group) => [group.key, getSessionOrder(serverId, group.key)]),
    );
  }, [activitySortedGroups, getSessionOrder, serverId, sessionOrderByServerAndGroup]);
  const groups = useMemo(
    () =>
      applyStableSidebarSessionOrder(activitySortedGroups, {
        groupOrder: storedGroupOrder,
        agentOrderByGroup: storedAgentOrderByGroup,
      }),
    [activitySortedGroups, storedAgentOrderByGroup, storedGroupOrder],
  );

  useEffect(() => {
    if (!serverId) {
      return;
    }
    const currentGroupKeys = activitySortedGroups
      .filter((group) => group.key !== PINNED_SIDEBAR_SESSION_GROUP_KEY)
      .map((group) => group.key);
    const nextGroupOrder = reconcileSidebarSessionOrder(storedGroupOrder, currentGroupKeys);
    if (!ordersEqual(storedGroupOrder, nextGroupOrder)) {
      setSessionGroupOrder(serverId, nextGroupOrder);
    }
    for (const group of activitySortedGroups) {
      const storedOrder = getSessionOrder(serverId, group.key);
      const nextOrder = reconcileSidebarSessionOrder(
        storedOrder,
        group.agents.map((agent) => agent.id),
      );
      if (!ordersEqual(storedOrder, nextOrder)) {
        setSessionOrder(serverId, group.key, nextOrder);
      }
    }
  }, [
    activitySortedGroups,
    getSessionOrder,
    serverId,
    setSessionGroupOrder,
    setSessionOrder,
    storedGroupOrder,
  ]);
  const pinnedGroup = useMemo(
    () => groups.find((group) => group.key === PINNED_SIDEBAR_SESSION_GROUP_KEY) ?? null,
    [groups],
  );
  const workspaceGroups = useMemo(
    () => groups.filter((group) => group.key !== PINNED_SIDEBAR_SESSION_GROUP_KEY),
    [groups],
  );
  const refreshControl = useMemo(
    () =>
      onRefresh ? (
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={onRefresh}
          tintColor={theme.colors.foregroundMuted}
        />
      ) : undefined,
    [isRefreshing, onRefresh, theme.colors.foregroundMuted],
  );
  const renamingClient = useSessionStore((state) =>
    renamingAgent?.serverId ? (state.sessions[renamingAgent.serverId]?.client ?? null) : null,
  );

  const handleRename = useCallback((agent: AggregatedAgent) => {
    rememberArchivedAgentDetail(agent);
    setRenamingAgent(agent);
  }, []);

  const handleTogglePin = useCallback(
    (agent: AggregatedAgent) => {
      const actionClient = useSessionStore.getState().sessions[agent.serverId]?.client ?? null;
      if (!actionClient) {
        toast.error(t("workspace.screen.hostDisconnected"));
        return;
      }
      const actionKey = getAgentActionKey(agent);
      const wasPinned = isSidebarAgentPinned(agent);
      const nextPinned = !wasPinned;
      const labels = { [SIDEBAR_PINNED_LABEL]: nextPinned ? "true" : "false" };
      const cacheSnapshot = getPinnedCacheSnapshot(queryClient, agent.serverId);
      setPinningAgentKey(actionKey);
      updateAgentLabelsInStore({
        serverId: agent.serverId,
        agentId: agent.id,
        labels,
      });
      patchAgentLabelsInSidebarCaches(queryClient, {
        serverId: agent.serverId,
        agentId: agent.id,
        labels,
      });
      void (async () => {
        try {
          await actionClient.updateAgent(agent.id, { labels });
          invalidateSidebarSessionQueries(queryClient, agent.serverId);
        } catch (error) {
          updateAgentLabelsInStore({
            serverId: agent.serverId,
            agentId: agent.id,
            labels: { [SIDEBAR_PINNED_LABEL]: wasPinned ? "true" : "false" },
          });
          restorePinnedCacheSnapshot(queryClient, agent.serverId, cacheSnapshot);
          toast.error(error instanceof Error ? error.message : t("sidebar.pinSessionFailed"));
        } finally {
          setPinningAgentKey((currentKey) => (currentKey === actionKey ? null : currentKey));
        }
      })();
    },
    [queryClient, t, toast],
  );

  const handleArchive = useCallback(
    (agent: AggregatedAgent) => {
      if (agent.archivedAt) {
        return;
      }
      void archiveAgent({ serverId: agent.serverId, agentId: agent.id }).catch((error) => {
        toast.error(error instanceof Error ? error.message : t("sidebar.archiveSessionFailed"));
      });
    },
    [archiveAgent, t, toast],
  );

  const handleDelete = useCallback(
    (agent: AggregatedAgent) => {
      const actionClient = useSessionStore.getState().sessions[agent.serverId]?.client ?? null;
      if (!actionClient) {
        toast.error(t("workspace.screen.hostDisconnected"));
        return;
      }
      const actionKey = getAgentActionKey(agent);
      void (async () => {
        const confirmed = await confirmDialog({
          title: t("sidebar.deleteSessionTitle"),
          message: t("sidebar.deleteSessionMessage", {
            name: agent.title || t("session.newSession"),
          }),
          confirmLabel: t("sidebar.deleteSession"),
          cancelLabel: t("common.cancel"),
          destructive: true,
        });
        if (!confirmed) {
          return;
        }
        setDeletingAgentKey(actionKey);
        try {
          await actionClient.deleteAgent(agent.id);
          deleteAgentFromStore({ serverId: agent.serverId, agentId: agent.id });
          invalidateSidebarSessionQueries(queryClient, agent.serverId);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : t("sidebar.deleteSessionFailed"));
        } finally {
          setDeletingAgentKey(null);
        }
      })();
    },
    [queryClient, t, toast],
  );

  const handleRenameClose = useCallback(() => {
    setRenamingAgent(null);
  }, []);
  const toggleCollapsedGroup = useCallback((groupKey: string) => {
    setCollapsedGroupKeys((current) => {
      const next = new Set(current);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  }, []);
  const handleReorderAgents = useCallback(
    (groupKey: string, reorderedAgents: AggregatedAgent[]) => {
      if (!serverId) {
        return;
      }
      setSessionOrder(
        serverId,
        groupKey,
        reorderedAgents.map((agent) => agent.id),
      );
    },
    [serverId, setSessionOrder],
  );

  const handleRenameSubmit = useCallback(
    async (nextTitle: string) => {
      if (!renamingAgent) {
        return;
      }
      if (!renamingClient) {
        throw new Error(t("workspace.screen.hostDisconnected"));
      }
      const trimmed = nextTitle.trim();
      await renamingClient.updateAgent(renamingAgent.id, { name: trimmed });
      void queryClient.invalidateQueries({
        queryKey: ["sidebarAgentsList", renamingAgent.serverId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["allAgents", renamingAgent.serverId],
      });
      void queryClient.invalidateQueries({
        queryKey: agentHistoryQueryKey(renamingAgent.serverId),
      });
    },
    [queryClient, renamingAgent, renamingClient, t],
  );

  const renameModal = (
    <AdaptiveRenameModal
      visible={renamingAgent !== null}
      title={t("workspace.screen.renameAgent")}
      initialValue={renamingAgent?.title ?? ""}
      submitLabel={t("workspace.screen.rename")}
      maxLength={200}
      onClose={handleRenameClose}
      onSubmit={handleRenameSubmit}
      testID={
        renamingAgent
          ? `sidebar-session-rename-modal-${renamingAgent.serverId}-${renamingAgent.id}`
          : undefined
      }
    />
  );

  if (!serverId) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>{t("sidebar.noHost")}</Text>
        {renameModal}
      </View>
    );
  }

  if (groups.length === 0) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.emptyScrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
      >
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>{t("sidebar.noSessions")}</Text>
          {onAddProject ? (
            <Button variant="ghost" size="sm" onPress={onAddProject}>
              {t("sidebar.addProject")}
            </Button>
          ) : null}
        </View>
        {renameModal}
      </ScrollView>
    );
  }

  const defaultGroupStyle = isCompact ? styles.group : styles.desktopGroup;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={isCompact ? styles.scrollContent : styles.desktopScrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={refreshControl}
    >
      {pinnedGroup ? (
        <SidebarSessionGroupView
          group={pinnedGroup}
          groupStyle={isCompact && showGroupTitles ? styles.pinnedGroup : defaultGroupStyle}
          serverId={serverId}
          isCompact={isCompact}
          showGroupTitles={showGroupTitles}
          collapsed={false}
          selectedAgentId={resolvedSelectedAgentId}
          onAgentPress={onAgentPress}
          onTogglePin={handleTogglePin}
          onRename={handleRename}
          onArchive={handleArchive}
          onDelete={handleDelete}
          pinningAgentKey={pinningAgentKey}
          deletingAgentKey={deletingAgentKey}
          isArchivingAgent={isArchivingAgent}
          onToggleCollapsed={toggleCollapsedGroup}
          onReorderAgents={handleReorderAgents}
        />
      ) : null}
      {workspaceGroups.length > 0 && !isCompact && showGroupTitles ? (
        <Text style={styles.desktopSectionLabel}>{t("sidebar.projects")}</Text>
      ) : null}
      {workspaceGroups.map((group) => (
        <SidebarSessionGroupView
          key={group.key}
          group={group}
          groupStyle={defaultGroupStyle}
          serverId={serverId}
          isCompact={isCompact}
          showGroupTitles={showGroupTitles}
          collapsed={Boolean(group.cwd && collapsedGroupKeys.has(group.key))}
          selectedAgentId={resolvedSelectedAgentId}
          onAgentPress={onAgentPress}
          onTogglePin={handleTogglePin}
          onRename={handleRename}
          onArchive={handleArchive}
          onDelete={handleDelete}
          pinningAgentKey={pinningAgentKey}
          deletingAgentKey={deletingAgentKey}
          isArchivingAgent={isArchivingAgent}
          onToggleCollapsed={toggleCollapsedGroup}
          onReorderAgents={handleReorderAgents}
        />
      ))}
      {hasMore ? (
        <Button
          variant="ghost"
          size="sm"
          onPress={onLoadMore}
          loading={isLoadingMore}
          disabled={isLoadingMore}
          style={styles.loadMoreButton}
        >
          {isLoadingMore ? t("common.loading") : t("sidebar.loadMoreSessions")}
        </Button>
      ) : null}
      {renameModal}
    </ScrollView>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    minHeight: 0,
  },
  scrollContent: {
    paddingTop: theme.spacing[1],
    paddingRight: theme.spacing[2],
    paddingBottom: theme.spacing[3],
    paddingLeft: theme.spacing[2],
  },
  desktopScrollContent: {
    paddingTop: 10,
    paddingRight: 6,
    paddingBottom: 0,
    paddingLeft: 6,
  },
  group: {
    marginBottom: theme.spacing[2],
  },
  desktopGroup: {
    marginBottom: 0,
  },
  pinnedGroup: {
    marginHorizontal: theme.spacing[2],
    marginBottom: theme.spacing[3],
    paddingBottom: theme.spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  groupHeader: {
    minHeight: 26,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
  },
  groupHeaderLabel: {
    minWidth: 0,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  desktopGroupHeader: {
    minHeight: 30,
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    marginRight: 4,
    marginBottom: 2,
    marginLeft: 4,
    paddingHorizontal: 6,
  },
  desktopGroupHeaderLabel: {
    minWidth: 0,
    minHeight: 28,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  groupTitle: {
    minWidth: 0,
    flex: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.normal,
  },
  desktopGroupTitle: {
    minWidth: 0,
    flex: 1,
    color: theme.colors.foregroundSubtleText,
    fontSize: WORKBENCH_META_FONT_SIZE,
    lineHeight: WORKBENCH_SIDEBAR_GROUP_LINE_HEIGHT,
    fontWeight: theme.fontWeight.normal,
  },
  desktopWorkspaceGroupTitle: {
    color: theme.colors.foregroundMuted,
    fontSize: WORKBENCH_BODY_FONT_SIZE,
    lineHeight: WORKBENCH_BODY_LINE_HEIGHT,
  },
  desktopSectionLabel: {
    marginTop: 14,
    marginRight: 10,
    marginBottom: 6,
    marginLeft: 10,
    color: theme.colors.foregroundSubtleText,
    fontSize: WORKBENCH_META_FONT_SIZE,
    lineHeight: WORKBENCH_META_LINE_HEIGHT,
    fontWeight: theme.fontWeight.normal,
  },
  groupAddButton: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
    flexShrink: 0,
  },
  groupAddButtonActive: {
    backgroundColor: theme.colors.surface1,
  },
  groupActions: {
    position: "absolute",
    top: 1,
    right: 0,
    width: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    flexShrink: 0,
    backgroundColor: theme.colors.surfaceSidebar,
    zIndex: 1,
  },
  groupActionsHidden: {
    opacity: 0,
  },
  groupRows: {
    gap: 0,
    paddingLeft: 0,
  },
  desktopWorkspaceGroupRows: {
    paddingLeft: 20,
  },
  row: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
  },
  rowHovered: {
    backgroundColor: theme.colors.surface1,
  },
  rowPressed: {
    opacity: 0.85,
  },
  rowSelected: {
    backgroundColor: theme.colors.surface2,
    ...theme.shadow.sm,
  },
  rowSelectedIndicator: {
    position: "absolute",
    left: theme.spacing[1],
    top: theme.spacing[2],
    bottom: theme.spacing[2],
    width: 3,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.accent,
  },
  rowLeading: {
    width: 18,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  desktopRow: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingVertical: 0,
    paddingLeft: 8,
    paddingRight: 34,
    borderRadius: theme.borderRadius.md,
  },
  desktopRowContainer: {
    position: "relative",
  },
  desktopRowHovered: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  desktopRowPressed: {
    opacity: 0.9,
  },
  desktopRowDragging: {
    backgroundColor: theme.colors.surface2,
    opacity: 0.86,
  },
  desktopRowSelected: {
    backgroundColor: theme.colors.surfaceSidebarHover,
    ...(isWeb
      ? ({
          backgroundColor: `color-mix(in srgb, ${theme.colors.accent} 10%, ${theme.colors.surfaceSidebarHover})`,
        } as object)
      : {}),
  },
  desktopRowSelectedIndicator: {
    display: "none",
  },
  desktopRowLeading: {
    width: 18,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  rowContent: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  desktopRowContent: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  rowMenuButton: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
    flexShrink: 0,
  },
  rowMenuButtonActive: {
    backgroundColor: theme.colors.surface1,
  },
  desktopRowMenuButton: {
    backgroundColor: theme.colors.surfaceSidebar,
  },
  desktopRowMenuSlot: {
    position: "absolute",
    top: 2,
    right: 2,
  },
  desktopRowMenuHidden: {
    opacity: 0,
  },
  rowQuickActions: {
    width: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: theme.spacing[1],
    flexShrink: 0,
  },
  rowQuickHidden: {
    opacity: 0,
  },
  rowQuickButton: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
  },
  rowQuickButtonActive: {
    backgroundColor: theme.colors.surface1,
  },
  rowQuickButtonPressed: {
    opacity: 0.85,
  },
  desktopRowQuickActions: {
    position: "absolute",
    top: 3,
    right: theme.spacing[1],
    bottom: 3,
    width: 30,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 0,
    flexShrink: 0,
  },
  desktopRowQuickButton: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.sm,
  },
  desktopRowQuickButtonActive: {
    backgroundColor: theme.colors.surface2,
  },
  desktopRowQuickButtonPressed: {
    opacity: 0.9,
  },
  rowTitle: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
    paddingTop: 4,
    transform: [{ translateY: 2 }],
    includeFontPadding: false,
    fontWeight: theme.fontWeight.normal,
  },
  rowTitleSelected: {
    color: theme.colors.foreground,
    fontWeight: theme.fontWeight.normal,
  },
  desktopRowTitle: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.foreground,
    fontSize: WORKBENCH_BODY_FONT_SIZE,
    lineHeight: WORKBENCH_BODY_LINE_HEIGHT,
    fontWeight: theme.fontWeight.normal,
  },
  desktopRowTitleSelected: {
    color: theme.colors.foreground,
  },
  emptyScrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[8],
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
  },
  emptyTitle: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    textAlign: "center",
  },
  loadMoreButton: {
    alignSelf: "center",
    marginTop: theme.spacing[1],
  },
}));
