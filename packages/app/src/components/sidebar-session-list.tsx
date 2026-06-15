import React, { useCallback, useMemo, useState } from "react";
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
  Copy,
  Folder,
  MoreHorizontal,
  Pencil,
  Pin,
  Plus,
  Trash2,
} from "lucide-react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import type { AggregatedAgent } from "@/hooks/use-aggregated-agents";
import { useIsCompactFormFactor } from "@/constants/layout";
import { Button } from "@/components/ui/button";
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
import { useArchiveAgent } from "@/hooks/use-archive-agent";
import { agentHistoryQueryKey } from "@/hooks/agent-history-query-key";
import { useResolveWorkspaceIdByCwd } from "@/stores/session-store-hooks";
import { useSessionStore } from "@/stores/session-store";
import { confirmDialog } from "@/utils/confirm-dialog";
import { rememberArchivedAgentDetail } from "@/utils/agent-history-navigation";
import type { SidebarSessionDraft } from "@/utils/left-sidebar-drafts";
import { navigateToAgent } from "@/utils/navigate-to-agent";
import {
  PINNED_SIDEBAR_SESSION_GROUP_KEY,
  groupAgentsForSidebar,
  type SidebarSessionGroup,
} from "@/utils/sidebar-session-groups";
import { buildHostWorkspaceOpenRoute } from "@/utils/host-routes";

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
  const setAgents = useSessionStore.getState().setAgents;
  setAgents(input.serverId, (prev) => {
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
  const rowQuickActionsStyle = isCompact ? styles.rowQuickActions : styles.desktopRowQuickActions;
  const rowQuickButtonStyle = isCompact ? styles.rowQuickButton : styles.desktopRowQuickButton;
  const rowQuickButtonActiveStyle = isCompact
    ? styles.rowQuickButtonActive
    : styles.desktopRowQuickButtonActive;
  const rowQuickButtonPressedStyle = isCompact
    ? styles.rowQuickButtonPressed
    : styles.desktopRowQuickButtonPressed;
  const selectedIndicatorStyle = isCompact
    ? styles.rowSelectedIndicator
    : styles.desktopRowSelectedIndicator;
  const showQuickActions = isCompact || isHovered || isPinning || isArchiving;
  const rowStyle = useCallback(
    ({ hovered = false, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      rowBaseStyle,
      Boolean(hovered) && rowHoveredStyle,
      isSelected && rowSelectedStyle,
      pressed && rowPressedStyle,
    ],
    [isSelected, rowBaseStyle, rowHoveredStyle, rowPressedStyle, rowSelectedStyle],
  );
  const titleStyle = useMemo(
    () => [rowTitleStyle, isSelected && rowTitleSelectedStyle],
    [isSelected, rowTitleSelectedStyle, rowTitleStyle],
  );
  const rowAccessibilityState = useMemo(() => ({ selected: isSelected }), [isSelected]);
  const rowIconColor = isSelected ? theme.colors.foreground : theme.colors.foregroundMuted;
  const handleHoverIn = useCallback(() => setIsHovered(true), []);
  const handleHoverOut = useCallback(() => setIsHovered(false), []);

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
  const handleQuickPin = useCallback(
    (event: GestureResponderEvent) => {
      event.stopPropagation();
      handleTogglePin();
    },
    [handleTogglePin],
  );
  const handleQuickArchive = useCallback(
    (event: GestureResponderEvent) => {
      event.stopPropagation();
      handleArchive();
    },
    [handleArchive],
  );
  const menuButtonStyle = useCallback(
    ({ hovered = false, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.rowMenuButton,
      (Boolean(hovered) || pressed) && styles.rowMenuButtonActive,
    ],
    [],
  );
  const quickButtonStyle = useCallback(
    ({ hovered = false, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      rowQuickButtonStyle,
      (Boolean(hovered) || pressed) && rowQuickButtonActiveStyle,
      pressed && rowQuickButtonPressedStyle,
    ],
    [rowQuickButtonActiveStyle, rowQuickButtonPressedStyle, rowQuickButtonStyle],
  );
  const quickActionsStyle = useMemo(
    () => [rowQuickActionsStyle, !showQuickActions && styles.rowQuickHidden],
    [rowQuickActionsStyle, showQuickActions],
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
      </View>
    </>
  );

  let rowTrailingContent: React.ReactNode;
  if (isCompact) {
    rowTrailingContent = (
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
  } else {
    rowTrailingContent = (
      <View
        pointerEvents={showQuickActions ? "auto" : "none"}
        style={quickActionsStyle}
        testID={`sidebar-session-quick-actions-${agent.serverId}-${agent.id}`}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            isPinned
              ? t("sidebar.unpinSessionLabel", { title: sessionTitle })
              : t("sidebar.pinSessionLabel", { title: sessionTitle })
          }
          testID={`sidebar-session-quick-pin-${agent.serverId}-${agent.id}`}
          style={quickButtonStyle}
          onPress={handleQuickPin}
          disabled={isPinning}
          pointerEvents={isPinning ? "none" : "auto"}
        >
          <Pin
            size={theme.iconSize.sm}
            color={isPinned ? theme.colors.accent : theme.colors.foregroundMuted}
          />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("sidebar.archiveSessionLabel", { title: sessionTitle })}
          testID={`sidebar-session-quick-archive-${agent.serverId}-${agent.id}`}
          style={quickButtonStyle}
          onPress={handleQuickArchive}
          disabled={isArchiving || Boolean(agent.archivedAt)}
        >
          <Archive size={theme.iconSize.sm} color={theme.colors.foregroundMuted} />
        </Pressable>
      </View>
    );
  }

  if (isCompact) {
    return (
      <Pressable
        style={rowStyle}
        onPress={handlePress}
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
          testID={`sidebar-session-${agent.serverId}-${agent.id}`}
          accessibilityRole="button"
          accessibilityLabel={sessionTitle}
          accessibilityState={rowAccessibilityState}
        >
          {rowMainContent}
        </ContextMenuTrigger>
        {rowTrailingContent}
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
}: {
  group: SidebarSessionRenderGroup;
  serverId: string | null;
}) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const resolvedWorkspaceId = useResolveWorkspaceIdByCwd(serverId, group.cwd);
  const workspaceId = group.workspaceId ?? resolvedWorkspaceId;
  const canOpenDraft = Boolean(serverId && workspaceId);
  const handleNewDraft = useCallback(
    (event: GestureResponderEvent) => {
      event.stopPropagation();
      if (!serverId || !workspaceId) {
        return;
      }
      router.push(buildHostWorkspaceOpenRoute(serverId, workspaceId, "draft:new"));
    },
    [serverId, workspaceId],
  );
  const addButtonStyle = useCallback(
    ({ hovered = false, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.groupAddButton,
      (Boolean(hovered) || pressed) && styles.groupAddButtonActive,
    ],
    [],
  );

  return (
    <View style={styles.groupHeader}>
      <View style={styles.groupHeaderLabel}>
        <Folder size={theme.iconSize.sm} color={theme.colors.foregroundMuted} />
        <Text style={styles.groupTitle} numberOfLines={1}>
          {group.label}
        </Text>
      </View>
      {canOpenDraft ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("sidebar.newSessionInWorkspace", { workspace: group.label })}
          hitSlop={4}
          onPress={handleNewDraft}
          style={addButtonStyle}
          testID={`sidebar-session-group-new-${serverId}-${group.key}`}
        >
          <Plus size={theme.iconSize.sm} color={theme.colors.foregroundMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

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
  const queryClient = useQueryClient();
  const toast = useToast();
  const { archiveAgent, isArchivingAgent } = useArchiveAgent();
  const [renamingAgent, setRenamingAgent] = useState<AggregatedAgent | null>(null);
  const [pinningAgentKey, setPinningAgentKey] = useState<string | null>(null);
  const [deletingAgentKey, setDeletingAgentKey] = useState<string | null>(null);
  const visibleAgents = useMemo(() => agents.filter((agent) => !agent.archivedAt), [agents]);
  const resolvedSelectedAgentId = useMemo(() => {
    if (selectedAgentId) {
      return selectedAgentId;
    }
    return visibleAgents.length === 1
      ? `${visibleAgents[0].serverId}:${visibleAgents[0].id}`
      : undefined;
  }, [selectedAgentId, visibleAgents]);
  const groups = useMemo(() => {
    const unknownWorkspaceLabel = t("sidebar.unknownWorkspace");
    const agentGroups = groupAgentsForSidebar(visibleAgents, {
      unknownWorkspaceLabel,
      pinnedGroupLabel: t("sidebar.pinnedSessions"),
      isPinnedAgent: isSidebarAgentPinned,
    });
    return buildRenderGroups(agentGroups);
  }, [t, visibleAgents]);
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
      void archiveAgent({ serverId: agent.serverId, agentId: agent.id }).catch(() => {});
    },
    [archiveAgent],
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

  const renderSessionGroup = (
    group: SidebarSessionRenderGroup,
    groupStyle: StyleProp<ViewStyle> = styles.group,
  ) => (
    <View key={group.key} style={groupStyle} testID={`sidebar-session-group-${group.key}`}>
      {showGroupTitles ? <SidebarSessionGroupHeader group={group} serverId={serverId} /> : null}
      <View style={styles.groupRows}>
        {group.agents.map((agent) => (
          <SidebarSessionRow
            key={`${agent.serverId}:${agent.id}`}
            agent={agent}
            selectedAgentId={resolvedSelectedAgentId}
            onAgentPress={onAgentPress}
            onTogglePin={handleTogglePin}
            onRename={handleRename}
            onArchive={handleArchive}
            onDelete={handleDelete}
            isPinning={pinningAgentKey === getAgentActionKey(agent)}
            isArchiving={isArchivingAgent({ serverId: agent.serverId, agentId: agent.id })}
            isDeleting={deletingAgentKey === getAgentActionKey(agent)}
          />
        ))}
      </View>
    </View>
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      refreshControl={refreshControl}
    >
      {pinnedGroup
        ? renderSessionGroup(pinnedGroup, showGroupTitles ? styles.pinnedGroup : styles.group)
        : null}
      {workspaceGroups.map((group) => renderSessionGroup(group))}
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
    paddingTop: theme.spacing[2],
    paddingRight: theme.spacing[3],
    paddingBottom: theme.spacing[4],
    paddingLeft: theme.spacing[3],
  },
  group: {
    marginBottom: theme.spacing[2],
  },
  pinnedGroup: {
    marginHorizontal: theme.spacing[2],
    marginBottom: theme.spacing[3],
    paddingBottom: theme.spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  groupHeader: {
    minHeight: 32,
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
  groupTitle: {
    minWidth: 0,
    flex: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
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
  groupRows: {
    gap: 0,
    paddingLeft: theme.spacing[4],
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
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    paddingLeft: theme.spacing[3],
    paddingRight: 68,
    borderRadius: theme.borderRadius.md,
  },
  desktopRowContainer: {
    position: "relative",
  },
  desktopRowHovered: {
    backgroundColor: theme.colors.surface1,
  },
  desktopRowPressed: {
    opacity: 0.9,
  },
  desktopRowSelected: {
    backgroundColor: theme.colors.surface2,
    ...theme.shadow.md,
  },
  desktopRowSelectedIndicator: {
    position: "absolute",
    left: theme.spacing[1],
    top: 7,
    bottom: 7,
    width: 3,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.accent,
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
  },
  desktopRowContent: {
    flex: 1,
    minWidth: 0,
  },
  rowMenuButton: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
    flexShrink: 0,
  },
  rowMenuButtonActive: {
    backgroundColor: theme.colors.surface1,
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
    width: 60,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 0,
    flexShrink: 0,
  },
  desktopRowQuickButton: {
    width: 28,
    height: 28,
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
    fontWeight: theme.fontWeight.normal,
  },
  rowTitleSelected: {
    color: theme.colors.foreground,
    fontWeight: theme.fontWeight.medium,
  },
  desktopRowTitle: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
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
