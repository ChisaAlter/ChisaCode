import React, { useCallback, useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
  type GestureResponderEvent,
  type PressableStateCallbackType,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { Archive, Copy, MoreHorizontal, Pencil, Pin, Trash2 } from "lucide-react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import type { AggregatedAgent } from "@/hooks/use-aggregated-agents";
import { isWeb } from "@/constants/platform";
import { useIsCompactFormFactor } from "@/constants/layout";
import { Button } from "@/components/ui/button";
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
import { getProviderIcon } from "@/components/provider-icons";
import { useToast } from "@/contexts/toast-context";
import { useArchiveAgent } from "@/hooks/use-archive-agent";
import { agentHistoryQueryKey } from "@/hooks/agent-history-query-key";
import { useSessionStore } from "@/stores/session-store";
import { confirmDialog } from "@/utils/confirm-dialog";
import { rememberArchivedAgentDetail } from "@/utils/agent-history-navigation";
import { navigateToAgent } from "@/utils/navigate-to-agent";
import { groupAgentsForSidebar } from "@/utils/sidebar-session-groups";
import { formatTimeAgo } from "@/utils/time";

const SIDEBAR_PINNED_LABEL = "chisacode.sidebarPinned";

interface SidebarSessionListProps {
  agents: AggregatedAgent[];
  serverId: string | null;
  selectedAgentId?: string;
  isRefreshing?: boolean;
  isLoadingMore?: boolean;
  hasMore?: boolean;
  onRefresh?: () => void;
  onLoadMore?: () => void;
  onAgentPress?: () => void;
  onAddProject?: () => void;
}

function formatStatusLabel(
  status: AggregatedAgent["status"],
  t: ReturnType<typeof useTranslation>["t"],
) {
  return t(`session.status.${status}`, { defaultValue: status });
}

function getAgentActionKey(agent: AggregatedAgent): string {
  return `${agent.serverId}:${agent.id}`;
}

function isSidebarAgentPinned(agent: AggregatedAgent): boolean {
  return agent.labels?.[SIDEBAR_PINNED_LABEL] === "true";
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
  const [isHovered, setIsHovered] = useState(false);
  const ProviderIcon = getProviderIcon(agent.provider);
  const isSelected = selectedAgentId === `${agent.serverId}:${agent.id}`;
  const isPinned = isSidebarAgentPinned(agent);
  const hasPendingPermissions = (agent.pendingPermissionCount ?? 0) > 0;
  const statusLabel = formatStatusLabel(agent.status, t);
  const timeLabel = formatTimeAgo(agent.lastActivityAt);
  const showQuickActions = isHovered || isPinned;
  const rowStyle = useCallback(
    ({ hovered = false, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.row,
      isSelected && styles.rowSelected,
      Boolean(hovered) && styles.rowHovered,
      pressed && styles.rowPressed,
    ],
    [isSelected],
  );
  const titleStyle = useMemo(
    () => [styles.rowTitle, isSelected && styles.rowTitleSelected],
    [isSelected],
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
  const handlePointerEnter = useCallback(() => setIsHovered(true), []);
  const handlePointerLeave = useCallback(() => setIsHovered(false), []);
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
      styles.rowQuickButton,
      (Boolean(hovered) || pressed) && styles.rowQuickButtonActive,
      pressed && styles.rowQuickButtonPressed,
    ],
    [],
  );
  const quickActionsStyle = useMemo(
    () => [styles.rowQuickActions, !showQuickActions && styles.rowQuickHidden],
    [showQuickActions],
  );

  const rowMainContent = (
    <>
      <View style={styles.rowLeading}>
        <ProviderIcon size={theme.iconSize.sm} color={theme.colors.foregroundMuted} />
      </View>
      <View style={styles.rowContent}>
        <View style={styles.rowTitleLine}>
          <Text style={titleStyle} numberOfLines={1}>
            {agent.title || t("session.newSession")}
          </Text>
          {isPinned ? <Pin size={theme.fontSize.xs} color={theme.colors.foregroundMuted} /> : null}
          {agent.archivedAt ? (
            <Archive size={theme.fontSize.xs} color={theme.colors.foregroundMuted} />
          ) : null}
        </View>
        <View style={styles.rowMetaLine}>
          <Text style={styles.rowMeta} numberOfLines={1}>
            {statusLabel}
          </Text>
          <Text style={styles.rowMetaSeparator}>·</Text>
          <Text style={styles.rowMeta} numberOfLines={1}>
            {timeLabel}
          </Text>
          {hasPendingPermissions ? (
            <>
              <Text style={styles.rowMetaSeparator}>·</Text>
              <Text style={styles.rowMetaWarning} numberOfLines={1}>
                {t("session.pendingCount", { count: agent.pendingPermissionCount ?? 0 })}
              </Text>
            </>
          ) : null}
          {agent.requiresAttention ? (
            <>
              <Text style={styles.rowMetaSeparator}>·</Text>
              <Text style={styles.rowMetaDanger} numberOfLines={1}>
                {t("session.needsAttention")}
              </Text>
            </>
          ) : null}
        </View>
      </View>
    </>
  );

  const rowTrailingContent = isCompact ? (
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
  ) : (
    <View pointerEvents={showQuickActions ? "auto" : "none"} style={quickActionsStyle}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isPinned ? t("sidebar.unpinSession") : t("sidebar.pinSession")}
        testID={`sidebar-session-quick-pin-${agent.serverId}-${agent.id}`}
        style={quickButtonStyle}
        onPress={handleQuickPin}
        disabled={isPinning}
      >
        <Pin
          size={theme.iconSize.sm}
          color={isPinned ? theme.colors.accent : theme.colors.foregroundMuted}
        />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("sidebar.archive")}
        testID={`sidebar-session-quick-archive-${agent.serverId}-${agent.id}`}
        style={quickButtonStyle}
        onPress={handleQuickArchive}
        disabled={isArchiving || Boolean(agent.archivedAt)}
      >
        <Archive size={theme.iconSize.sm} color={theme.colors.foregroundMuted} />
      </Pressable>
    </View>
  );

  if (isCompact) {
    return (
      <Pressable
        style={rowStyle}
        onPress={handlePress}
        testID={`sidebar-session-${agent.serverId}-${agent.id}`}
        accessibilityRole="button"
        accessibilityLabel={agent.title || t("session.newSession")}
      >
        {rowMainContent}
        {rowTrailingContent}
      </Pressable>
    );
  }

  return (
    <ContextMenu>
      <View
        onPointerEnter={isWeb ? handlePointerEnter : undefined}
        onPointerLeave={isWeb ? handlePointerLeave : undefined}
      >
        <ContextMenuTrigger
          enabledOnMobile={false}
          style={rowStyle}
          onPress={handlePress}
          testID={`sidebar-session-${agent.serverId}-${agent.id}`}
            accessibilityRole="button"
            accessibilityLabel={agent.title || t("session.newSession")}
          >
            {rowMainContent}
            {rowTrailingContent}
          </ContextMenuTrigger>
      </View>
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

export function SidebarSessionList({
  agents,
  serverId,
  selectedAgentId,
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
  const groups = useMemo(
    () =>
      groupAgentsForSidebar(visibleAgents, {
        unknownWorkspaceLabel: t("sidebar.unknownWorkspace"),
        isPinnedAgent: isSidebarAgentPinned,
      }),
    [t, visibleAgents],
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
      const nextPinned = !isSidebarAgentPinned(agent);
      const labels = { [SIDEBAR_PINNED_LABEL]: nextPinned ? "true" : "false" };
      setPinningAgentKey(actionKey);
      updateAgentLabelsInStore({
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
            labels: { [SIDEBAR_PINNED_LABEL]: isSidebarAgentPinned(agent) ? "true" : "false" },
          });
          toast.error(error instanceof Error ? error.message : t("sidebar.pinSessionFailed"));
        } finally {
          setPinningAgentKey(null);
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

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      refreshControl={refreshControl}
    >
      {groups.map((group) => (
        <View key={group.key} style={styles.group}>
          <Text style={styles.groupTitle} numberOfLines={1}>
            {group.label}
          </Text>
          <View style={styles.groupRows}>
            {group.agents.map((agent) => (
              <SidebarSessionRow
                key={`${agent.serverId}:${agent.id}`}
                agent={agent}
                selectedAgentId={selectedAgentId}
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
    paddingTop: theme.spacing[2],
    paddingBottom: theme.spacing[4],
  },
  group: {
    marginHorizontal: theme.spacing[2],
    marginBottom: theme.spacing[3],
  },
  groupTitle: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
  groupRows: {
    gap: theme.spacing[1],
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
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  rowPressed: {
    opacity: 0.85,
  },
  rowSelected: {
    backgroundColor: theme.colors.surface2,
  },
  rowLeading: {
    width: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  rowContent: {
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
    backgroundColor: theme.colors.surfaceSidebarHover,
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
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  rowQuickButtonPressed: {
    opacity: 0.85,
  },
  rowTitleLine: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
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
  },
  rowMetaLine: {
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
    gap: theme.spacing[1],
    marginTop: theme.spacing[1],
  },
  rowMeta: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  rowMetaWarning: {
    color: theme.colors.palette.amber[500],
    fontSize: theme.fontSize.xs,
  },
  rowMetaDanger: {
    color: theme.colors.palette.red[300],
    fontSize: theme.fontSize.xs,
  },
  rowMetaSeparator: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
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
