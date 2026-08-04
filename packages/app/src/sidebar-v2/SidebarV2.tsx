import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { ChevronDown, ChevronRight, Plus } from "lucide-react-native";
import { ICON_SIZE, type Theme } from "@/styles/theme";
import { ThemedIconHost } from "@/components/themed-icon-host";
import { useTranslation } from "react-i18next";
import { useSessionStore } from "@/stores/session-store";
import { navigateToAgent } from "@/utils/navigate-to-agent";
import { SidebarV2Row } from "./SidebarV2Row";
import { SidebarV2Search, SidebarV2NewThreadButton } from "./SidebarV2Search";
import { SidebarV2ScopeMenu, SidebarV2ProjectSettingsDialog } from "./SidebarV2ScopeMenu";
import {
  partitionThreadsForSidebarV2,
  pageSettledThreads,
  SETTLED_TAIL_INITIAL_COUNT,
  SETTLED_TAIL_PAGE_COUNT,
} from "./shelves";
import {
  buildSidebarProjectSnapshots,
  sortProjectsForSidebar,
  type SidebarV2ProjectSnapshot,
} from "./projects";
import {
  agentToSidebarThread,
  findWorkspaceForAgent,
  buildWorkspaceDirectoryIndex,
  type SidebarV2Thread,
} from "./agent-adapter";
import { useSidebarV2Store } from "./store";
import { SIDEBAR_LABEL_SETTLED_OVERRIDE } from "./snooze";
import type { AggregatedAgent } from "@/hooks/use-aggregated-agents";
import type { WorkspaceDescriptor } from "@/stores/session-store";

const foregroundMutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

interface SidebarV2Props {
  agents: AggregatedAgent[];
  serverId: string | null;
  selectedAgentId?: string;
  workspaces?: ReadonlyMap<string, WorkspaceDescriptor> | null;
  onNewConversation: () => void;
  onAddProject: () => void;
}

/** Auto-settle window in days; matches T3's default. */
const AUTO_SETTLE_AFTER_DAYS = 3;
/** Shared no-op used for row actions the slim shelves do not surface. */
const NOOP = () => undefined;

export function SidebarV2({
  agents,
  serverId,
  selectedAgentId,
  workspaces,
  onNewConversation,
  onAddProject,
}: SidebarV2Props) {
  const [projectSettingsProject, setProjectSettingsProject] =
    useState<SidebarV2ProjectSnapshot | null>(null);

  const uiState = useSidebarV2Store((state) =>
    serverId ? state.getServerUiState(serverId) : null,
  );
  const setSettledShelfExpanded = useSidebarV2Store((state) => state.setSettledShelfExpanded);
  const setSnoozedShelfExpanded = useSidebarV2Store((state) => state.setSnoozedShelfExpanded);
  const setSettledVisibleCount = useSidebarV2Store((state) => state.setSettledVisibleCount);
  const resetSettledVisibleCount = useSidebarV2Store((state) => state.resetSettledVisibleCount);
  const searchQuery = useSidebarV2Store((state) => state.searchQuery);
  const selectedThreadKeys = useSidebarV2Store((state) => state.selectedThreadKeys);

  const now = useMemo(() => new Date().toISOString(), []);
  const activeServerId = serverId;

  const workspaceIndex = useMemo(
    () => (workspaces ? buildWorkspaceDirectoryIndex(workspaces.values()) : new Map()),
    [workspaces],
  );

  const threads = useMemo<SidebarV2Thread[]>(() => {
    if (!activeServerId) {
      return [];
    }
    return agents
      .filter((agent) => agent.serverId === activeServerId)
      .map((agent) => {
        const workspace = findWorkspaceForAgent(agent, workspaceIndex);
        return agentToSidebarThread(agent, workspace);
      });
  }, [activeServerId, agents, workspaceIndex]);

  const projectMembers = useMemo(
    () =>
      Array.from(workspaces?.values() ?? []).map((workspace) => ({
        workspaceId: workspace.id,
        physicalProjectKey: workspace.projectId,
        projectName: workspace.projectDisplayName || workspace.projectId,
        workspaceDirectory: workspace.workspaceDirectory,
        branch: workspace.gitRuntime?.currentBranch ?? null,
        kind: workspace.workspaceKind,
        status: workspace.status ?? null,
        archivedAt: workspace.archivingAt ?? null,
        changeRequestState: resolvePrState(workspace),
      })),
    [workspaces],
  );

  const projectSnapshots = useMemo(
    () => buildSidebarProjectSnapshots({ members: projectMembers }),
    [projectMembers],
  );

  const threadsByProjectKey = useMemo(() => {
    const byKey = new Map<string, SidebarV2Thread[]>();
    for (const thread of threads) {
      const key = thread.projectKey ?? "";
      const existing = byKey.get(key) ?? [];
      existing.push(thread);
      byKey.set(key, existing);
    }
    return byKey;
  }, [threads]);

  const sortedProjects = useMemo(
    () =>
      sortProjectsForSidebar({
        projects: projectSnapshots,
        threadsByProjectKey,
        preferredProjectKeys: uiState?.scopeProjectKey ? [uiState.scopeProjectKey] : undefined,
      }),
    [projectSnapshots, threadsByProjectKey, uiState?.scopeProjectKey],
  );

  const scopedThreads = useMemo(() => {
    if (!uiState?.scopeProjectKey) {
      return threads;
    }
    return threads.filter((thread) => thread.projectKey === uiState.scopeProjectKey);
  }, [threads, uiState?.scopeProjectKey]);

  const changeRequestStateByKey = useMemo(() => {
    const map = new Map<string, "open" | "closed" | "merged" | null>();
    for (const thread of threads) {
      map.set(thread.id, thread.changeRequestState);
    }
    return map;
  }, [threads]);

  const partition = useMemo(
    () =>
      partitionThreadsForSidebarV2({
        threads: scopedThreads,
        now,
        snoozeNow: now,
        autoSettleAfterDays: AUTO_SETTLE_AFTER_DAYS,
        changeRequestStateByKey,
      }),
    [scopedThreads, now, changeRequestStateByKey],
  );

  const settledPaging = useMemo(
    () =>
      pageSettledThreads({
        settledThreads: partition.settledThreads,
        settledVisibleCount: uiState?.settledVisibleCount ?? SETTLED_TAIL_INITIAL_COUNT,
        routeThreadKey: selectedAgentId ?? null,
        settledShelfExpanded: uiState?.settledShelfExpanded ?? true,
      }),
    [
      partition.settledThreads,
      selectedAgentId,
      uiState?.settledVisibleCount,
      uiState?.settledShelfExpanded,
    ],
  );

  const isSearching = searchQuery.length > 0;

  const handleOpenThread = useCallback(
    (thread: SidebarV2Thread) => {
      if (!activeServerId) {
        return;
      }
      navigateToAgent({ serverId: activeServerId, agentId: thread.id });
    },
    [activeServerId],
  );

  const handleUpdateLabels = useCallback(
    (thread: SidebarV2Thread, labels: Record<string, string>) => {
      const client = activeServerId
        ? useSessionStore.getState().sessions[activeServerId]?.client
        : null;
      if (!client) {
        return;
      }
      void client.updateAgent(thread.id, { labels }).catch(() => undefined);
    },
    [activeServerId],
  );

  const handleSettle = useCallback(
    (thread: SidebarV2Thread) => {
      handleUpdateLabels(thread, {
        [SIDEBAR_LABEL_SETTLED_OVERRIDE]: "settled",
      });
    },
    [handleUpdateLabels],
  );

  const handleUnsettle = useCallback(
    (thread: SidebarV2Thread) => {
      handleUpdateLabels(thread, { [SIDEBAR_LABEL_SETTLED_OVERRIDE]: "" });
    },
    [handleUpdateLabels],
  );

  const handleRename = useCallback(
    (thread: SidebarV2Thread, title: string) => {
      const client = activeServerId
        ? useSessionStore.getState().sessions[activeServerId]?.client
        : null;
      if (!client) {
        return;
      }
      void client.updateAgent(thread.id, { name: title }).catch(() => undefined);
    },
    [activeServerId],
  );

  const handleShowMoreSettled = useCallback(() => {
    if (!activeServerId) {
      return;
    }
    const current = uiState?.settledVisibleCount ?? SETTLED_TAIL_INITIAL_COUNT;
    setSettledVisibleCount(activeServerId, current + SETTLED_TAIL_PAGE_COUNT);
  }, [activeServerId, setSettledVisibleCount, uiState?.settledVisibleCount]);

  const handleToggleSettledShelf = useCallback(() => {
    if (activeServerId) {
      setSettledShelfExpanded(activeServerId, !(uiState?.settledShelfExpanded ?? true));
    }
  }, [activeServerId, setSettledShelfExpanded, uiState?.settledShelfExpanded]);

  const handleToggleSnoozedShelf = useCallback(() => {
    if (activeServerId) {
      setSnoozedShelfExpanded(activeServerId, !(uiState?.snoozedShelfExpanded ?? false));
    }
  }, [activeServerId, setSnoozedShelfExpanded, uiState?.snoozedShelfExpanded]);

  const handleCloseProjectSettings = useCallback(() => setProjectSettingsProject(null), []);

  useEffect(() => {
    if (!activeServerId) {
      return;
    }
    resetSettledVisibleCount(activeServerId);
  }, [activeServerId, uiState?.scopeProjectKey, resetSettledVisibleCount]);

  const rowHandlers = useMemo(() => {
    const byId = new Map<string, RowHandlers>();
    const fallback: RowHandlers = {
      onPress: NOOP,
      onRename: NOOP,
      onSettle: NOOP,
      onUnsettle: NOOP,
      onSnooze: NOOP,
      onUnsnooze: NOOP,
      onDelete: NOOP,
      onCopyPath: NOOP,
      onCopyBranch: NOOP,
      onMarkUnread: NOOP,
      onRegenerateTitle: NOOP,
    };
    for (const thread of threads) {
      byId.set(thread.id, {
        onPress: () => handleOpenThread(thread),
        onRename: (title) => handleRename(thread, title),
        onSettle: () => handleSettle(thread),
        onUnsettle: () => handleUnsettle(thread),
        onSnooze: NOOP,
        onUnsnooze: NOOP,
        onDelete: NOOP,
        onCopyPath: NOOP,
        onCopyBranch: NOOP,
        onMarkUnread: NOOP,
        onRegenerateTitle: NOOP,
      });
    }
    return { byId, fallback };
  }, [handleOpenThread, handleRename, handleSettle, handleUnsettle, threads]);

  const noProjects = projectSnapshots.length === 0;
  const noThreads = threads.length === 0;

  const renderActiveRow = useCallback(
    (thread: SidebarV2Thread) => (
      <SidebarV2Row
        key={thread.id}
        thread={thread}
        variant="card"
        variantAction="settle"
        isActive={selectedAgentId === thread.id}
        isSelected={selectedThreadKeys.includes(thread.id)}
        isMultiSelectMode={false}
        isSnoozed={false}
        isSettled={false}
        isWoke={false}
        unseenCompletion={false}
        now={now}
        snoozeNow={now}
        canSnoozeThread={false}
        canSettleThread={true}
        projectLabel={thread.projectName}
        {...(rowHandlers.byId.get(thread.id) ?? rowHandlers.fallback)}
      />
    ),
    [now, rowHandlers, selectedAgentId, selectedThreadKeys],
  );

  const renderSnoozedRow = useCallback(
    (thread: SidebarV2Thread) => (
      <SidebarV2Row
        key={thread.id}
        thread={thread}
        variant="slim"
        variantAction="unsnooze"
        isActive={selectedAgentId === thread.id}
        isSelected={selectedThreadKeys.includes(thread.id)}
        isMultiSelectMode={false}
        isSnoozed
        isSettled={false}
        isWoke={threadWoke(thread, now)}
        unseenCompletion={false}
        now={now}
        snoozeNow={now}
        canSnoozeThread={false}
        canSettleThread={false}
        projectLabel={thread.projectName}
        {...(rowHandlers.byId.get(thread.id) ?? rowHandlers.fallback)}
      />
    ),
    [now, rowHandlers, selectedAgentId, selectedThreadKeys],
  );

  const renderSettledRow = useCallback(
    (thread: SidebarV2Thread) => (
      <SidebarV2Row
        key={thread.id}
        thread={thread}
        variant="slim"
        variantAction="unsettle"
        isActive={selectedAgentId === thread.id}
        isSelected={selectedThreadKeys.includes(thread.id)}
        isMultiSelectMode={false}
        isSnoozed={false}
        isSettled
        isWoke={false}
        unseenCompletion={false}
        now={now}
        snoozeNow={now}
        canSnoozeThread={false}
        canSettleThread={false}
        projectLabel={thread.projectName}
        {...(rowHandlers.byId.get(thread.id) ?? rowHandlers.fallback)}
      />
    ),
    [now, rowHandlers, selectedAgentId, selectedThreadKeys],
  );

  return (
    <View style={styles.container}>
      <View style={styles.fixedHeader}>
        <View style={styles.searchNewRow}>
          <View style={styles.searchContainer}>
            <SidebarV2Search
              threads={threads}
              isSearching={isSearching}
              activeResultIndex={0}
              onOpenThread={handleOpenThread}
            />
          </View>
          <SidebarV2NewThreadButton disabled={noProjects} onPress={onNewConversation} />
        </View>
        {projectSnapshots.length > 0 ? (
          <SidebarV2ScopeMenu
            serverId={activeServerId ?? ""}
            projects={sortedProjects}
            onAddProject={onAddProject}
            onProjectSettings={setProjectSettingsProject}
          />
        ) : null}
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        <SidebarV2Body
          isSearching={isSearching}
          noProjects={noProjects}
          noThreads={noThreads}
          scopeProjectKey={uiState?.scopeProjectKey ?? null}
          snoozedShelfExpanded={uiState?.snoozedShelfExpanded ?? false}
          settledShelfExpanded={uiState?.settledShelfExpanded ?? true}
          activeThreads={partition.activeThreads}
          snoozedThreads={partition.snoozedThreads}
          visibleSettledThreads={settledPaging.visibleSettledThreads}
          hiddenSettledCount={settledPaging.hiddenSettledCount}
          selectedAgentId={selectedAgentId ?? null}
          selectedThreadKeys={selectedThreadKeys}
          now={now}
          renderActiveRow={renderActiveRow}
          renderSnoozedRow={renderSnoozedRow}
          renderSettledRow={renderSettledRow}
          onAddProject={onAddProject}
          onToggleSnoozedShelf={handleToggleSnoozedShelf}
          onToggleSettledShelf={handleToggleSettledShelf}
          onShowMoreSettled={handleShowMoreSettled}
        />
      </ScrollView>

      {projectSettingsProject ? (
        <SidebarV2ProjectSettingsDialog
          project={projectSettingsProject}
          onClose={handleCloseProjectSettings}
        />
      ) : null}
    </View>
  );
}

/** Handlers passed to a row, memoized per thread id. */
interface RowHandlers {
  onPress: () => void;
  onRename: (title: string) => void;
  onSettle: () => void;
  onUnsettle: () => void;
  onSnooze: (untilIso: string) => void;
  onUnsnooze: () => void;
  onDelete: () => void;
  onCopyPath: () => void;
  onCopyBranch: () => void;
  onMarkUnread: () => void;
  onRegenerateTitle: () => void;
}

/** Renders the scroll body: search mode, empty states, or the shelf list. */
function SidebarV2Body({
  isSearching,
  noProjects,
  noThreads,
  scopeProjectKey,
  snoozedShelfExpanded,
  settledShelfExpanded,
  activeThreads,
  snoozedThreads,
  visibleSettledThreads,
  hiddenSettledCount,
  renderActiveRow,
  renderSnoozedRow,
  renderSettledRow,
  onAddProject,
  onToggleSnoozedShelf,
  onToggleSettledShelf,
  onShowMoreSettled,
}: {
  isSearching: boolean;
  noProjects: boolean;
  noThreads: boolean;
  scopeProjectKey: string | null;
  snoozedShelfExpanded: boolean;
  settledShelfExpanded: boolean;
  activeThreads: readonly SidebarV2Thread[];
  snoozedThreads: readonly SidebarV2Thread[];
  visibleSettledThreads: readonly SidebarV2Thread[];
  hiddenSettledCount: number;
  selectedAgentId: string | null;
  selectedThreadKeys: readonly string[];
  now: string;
  renderActiveRow: (thread: SidebarV2Thread) => ReactElement;
  renderSnoozedRow: (thread: SidebarV2Thread) => ReactElement;
  renderSettledRow: (thread: SidebarV2Thread) => ReactElement;
  onAddProject: () => void;
  onToggleSnoozedShelf: () => void;
  onToggleSettledShelf: () => void;
  onShowMoreSettled: () => void;
}) {
  const { t } = useTranslation();
  if (isSearching) {
    return null;
  }
  if (noProjects) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>{t("sidebarV2.noProjectsYet")}</Text>
        <Pressable style={styles.emptyButton} onPress={onAddProject}>
          <Text style={styles.emptyButtonLabel}>{t("sidebarV2.addProject")}</Text>
        </Pressable>
      </View>
    );
  }
  if (noThreads) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>
          {scopeProjectKey ? t("sidebarV2.noThreadsInScope") : t("sidebarV2.noThreadsYet")}
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.list}>
      {activeThreads.map(renderActiveRow)}

      {snoozedThreads.length > 0 ? (
        <>
          <ShelfHeader
            label={t("sidebarV2.snoozed")}
            count={snoozedThreads.length}
            expanded={snoozedShelfExpanded}
            onToggle={onToggleSnoozedShelf}
            tone="snoozed"
          />
          {snoozedShelfExpanded ? snoozedThreads.map(renderSnoozedRow) : null}
        </>
      ) : null}

      {visibleSettledThreads.length > 0 || hiddenSettledCount > 0 ? (
        <>
          <ShelfHeader
            label={t("sidebarV2.settled")}
            count={visibleSettledThreads.length + hiddenSettledCount}
            expanded={settledShelfExpanded}
            onToggle={onToggleSettledShelf}
            tone="settled"
          />
          {visibleSettledThreads.map(renderSettledRow)}
          {hiddenSettledCount > 0 ? (
            <Pressable style={styles.showMore} onPress={onShowMoreSettled}>
              <ThemedIconHost
                Icon={Plus}
                size={ICON_SIZE.xs}
                uniProps={foregroundMutedColorMapping}
              />
              <Text style={styles.showMoreLabel}>
                {t("sidebarV2.showMore", {
                  count: Math.min(hiddenSettledCount, SETTLED_TAIL_PAGE_COUNT),
                })}
              </Text>
            </Pressable>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

function ShelfHeader({
  label,
  count,
  expanded,
  onToggle,
  tone,
}: {
  label: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  tone: "snoozed" | "settled";
}) {
  const labelStyle = useMemo(
    () =>
      tone === "snoozed"
        ? [styles.shelfHeaderLabel, styles.shelfHeaderSnoozed]
        : styles.shelfHeaderLabel,
    [tone],
  );
  return (
    <Pressable style={styles.shelfHeader} onPress={onToggle} accessibilityRole="button">
      <Text style={labelStyle}>
        {label}
        {count > 0 ? ` (${count})` : ""}
      </Text>
      <View style={styles.shelfHeaderDivider} />
      <ThemedIconHost
        Icon={expanded ? ChevronDown : ChevronRight}
        size={ICON_SIZE.xs}
        uniProps={foregroundMutedColorMapping}
      />
    </Pressable>
  );
}

function threadWoke(thread: SidebarV2Thread, now: string): boolean {
  if (!thread.snoozedUntil) {
    return false;
  }
  return Date.parse(thread.snoozedUntil) <= Date.parse(now);
}

function resolvePrState(workspace: WorkspaceDescriptor): "open" | "closed" | "merged" | null {
  const state = workspace.githubRuntime?.pullRequest?.state;
  if (state === "open" || state === "closed" || state === "merged") {
    return state;
  }
  return null;
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
  },
  fixedHeader: {
    paddingHorizontal: theme.spacing[1],
    paddingTop: theme.spacing[1],
    gap: theme.spacing[0.5],
  },
  searchNewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[0.5],
  },
  searchContainer: {
    flex: 1,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: theme.spacing[1],
    paddingVertical: theme.spacing[1],
  },
  list: {
    gap: 2,
  },
  shelfHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingVertical: 8,
    paddingHorizontal: theme.spacing[0.5],
  },
  shelfHeaderLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.foregroundMuted,
  },
  shelfHeaderSnoozed: {
    color: theme.colors.accent,
  },
  shelfHeaderDivider: {
    flex: 1,
    height: 1,
    backgroundColor: theme.colors.border,
  },
  emptyState: {
    alignItems: "center",
    gap: theme.spacing[1],
    paddingVertical: theme.spacing[6],
  },
  emptyTitle: {
    fontSize: 13,
    color: theme.colors.foregroundMuted,
  },
  emptyButton: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  emptyButtonLabel: {
    fontSize: 13,
    color: theme.colors.foreground,
  },
  showMore: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[0.5],
    paddingVertical: 8,
    borderRadius: theme.borderRadius.sm,
  },
  showMoreLabel: {
    fontSize: 12,
    color: theme.colors.foregroundMuted,
  },
}));

export type { SidebarV2Props };
