import { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Circle,
  Folder,
  GitBranch,
  GitCommitHorizontal,
  Laptop,
  RefreshCcw,
  X,
} from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";

import { Combobox, ComboboxItem, type ComboboxProps } from "@/components/ui/combobox";
import { SourceControlPanelIcon } from "@/components/icons/source-control-panel-icon";
import { getDesktopHost } from "@/desktop/host";
import { useToast } from "@/contexts/toast-context";
import { checkoutStatusQueryKey } from "@/git/query-keys";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import { WorkspaceEnvironmentGitPopover } from "@/screens/workspace/workspace-environment-git-popover";
import type {
  AgentProgressItem,
  AgentProgressModel,
} from "@/screens/workspace/workspace-environment-panel-model";
import type { WorkspaceDescriptor } from "@/stores/session-store";
import type { Theme } from "@/styles/theme";
import { isWeb } from "@/constants/platform";
import {
  WORKBENCH_BODY_FONT_SIZE,
  WORKBENCH_BODY_LINE_HEIGHT,
  WORKBENCH_ENVIRONMENT_PANEL_INSET,
  WORKBENCH_ENVIRONMENT_PANEL_SHADOW,
  WORKBENCH_ENVIRONMENT_PANEL_WIDTH,
  WORKBENCH_META_FONT_SIZE,
  WORKBENCH_META_LINE_HEIGHT,
  WORKBENCH_MICRO_FONT_SIZE,
  WORKBENCH_MICRO_LINE_HEIGHT,
  WORKSPACE_SECONDARY_HEADER_HEIGHT,
} from "@/constants/layout";

const ThemedArrowLeftRight = withUnistyles(ArrowLeftRight);
const ThemedArrowUpRight = withUnistyles(ArrowUpRight);
const ThemedCheck = withUnistyles(Check);
const ThemedChevronDown = withUnistyles(ChevronDown);
const ThemedCircle = withUnistyles(Circle);
const ThemedFolder = withUnistyles(Folder);
const ThemedGitBranch = withUnistyles(GitBranch);
const ThemedGitCommitHorizontal = withUnistyles(GitCommitHorizontal);
const ThemedLaptop = withUnistyles(Laptop);
const ThemedRefreshCcw = withUnistyles(RefreshCcw);
const ThemedSourceControlPanelIcon = withUnistyles(SourceControlPanelIcon);
const ThemedX = withUnistyles(X);

export const WORKSPACE_ENVIRONMENT_PANEL_WIDTH = WORKBENCH_ENVIRONMENT_PANEL_WIDTH;

const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const successColorMapping = (theme: Theme) => ({ color: theme.colors.palette.green[500] });
const accentColorMapping = (theme: Theme) => ({ color: theme.colors.accent });

type EnvironmentRowIconName =
  | "changes"
  | "local"
  | "branch"
  | "commit"
  | "compare"
  | "chevron"
  | "arrow";

/**
 * Renders the desktop workspace environment stack (Codex-style floating cards).
 * @param props Environment data, progress model, and command callbacks
 * @returns The environment stack, or null when hidden
 */
export function WorkspaceEnvironmentPanelRail({
  visible,
  serverId,
  workspaceDirectory,
  currentBranchName,
  isGitCheckout,
  diffStat,
  sourceLabel,
  progress,
  onOpenChanges,
  onClose,
}: {
  visible: boolean;
  serverId: string;
  workspaceDirectory: string | null;
  currentBranchName: string | null;
  isGitCheckout: boolean;
  diffStat: WorkspaceDescriptor["diffStat"];
  sourceLabel: string | null;
  progress: AgentProgressModel | null;
  onOpenChanges: () => void;
  onClose: () => void;
}) {
  if (!visible) {
    return null;
  }

  return (
    <View style={styles.environmentStack} testID="workspace-environment-rail">
      <EnvironmentInfoCard
        serverId={serverId}
        workspaceDirectory={workspaceDirectory}
        currentBranchName={currentBranchName}
        isGitCheckout={isGitCheckout}
        diffStat={diffStat}
        sourceLabel={sourceLabel}
        onOpenChanges={onOpenChanges}
        onClose={onClose}
      />
      {progress ? <TaskProgressCard progress={progress} /> : null}
    </View>
  );
}

function EnvironmentInfoCard({
  serverId,
  workspaceDirectory,
  currentBranchName,
  isGitCheckout,
  diffStat,
  sourceLabel,
  onOpenChanges,
  onClose,
}: {
  serverId: string;
  workspaceDirectory: string | null;
  currentBranchName: string | null;
  isGitCheckout: boolean;
  diffStat: WorkspaceDescriptor["diffStat"];
  sourceLabel: string | null;
  onOpenChanges: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [localExpanded, setLocalExpanded] = useState(false);
  const normalizedCwd = workspaceDirectory?.trim() ?? "";
  const canRefreshGit = Boolean(normalizedCwd && isGitCheckout);
  const locationLabel = sourceLabel ?? normalizedCwd;

  const handleRefreshStatus = useCallback(() => {
    if (!canRefreshGit) {
      return;
    }
    void queryClient.invalidateQueries({
      queryKey: checkoutStatusQueryKey(serverId, normalizedCwd),
    });
  }, [canRefreshGit, normalizedCwd, queryClient, serverId]);

  const handleToggleLocal = useCallback(() => {
    setLocalExpanded((current) => !current);
  }, []);

  const handleOpenLocalPath = useCallback(() => {
    if (!normalizedCwd) {
      return;
    }
    const openPath = getDesktopHost()?.opener?.openPath;
    if (!openPath) {
      return;
    }
    void openPath(normalizedCwd).catch(() => {
      // Desktop host may reject; keep silent to match other path openers.
    });
  }, [normalizedCwd]);

  const changeCount =
    diffStat && Number.isFinite(diffStat.additions) && Number.isFinite(diffStat.deletions)
      ? Math.max(0, diffStat.additions) + Math.max(0, diffStat.deletions)
      : 0;

  return (
    <View style={styles.floatingCard} testID="workspace-environment-panel">
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{t("workspace.environment.title")}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("workspace.environment.hideFloatingPanel")}
          onPress={onClose}
          style={styles.iconButton}
          testID="workspace-environment-close"
        >
          <ThemedX size={14} uniProps={mutedColorMapping} />
        </Pressable>
      </View>

      <View style={styles.cardBody}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("workspace.environment.changesShort")}
          onPress={onOpenChanges}
          style={infoRowStyle}
          testID="workspace-environment-changes"
        >
          <View style={styles.rowLeading}>
            <View style={styles.rowIcon}>
              <RowIcon name="changes" />
            </View>
            <Text style={styles.rowLabel} numberOfLines={1}>
              {t("workspace.environment.changesShort")}
            </Text>
          </View>
          <View style={styles.rowTrailing}>
            {changeCount > 0 ? <Text style={styles.rowMetaText}>{changeCount}</Text> : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("workspace.environment.refreshStatus")}
              disabled={!canRefreshGit}
              hitSlop={6}
              onPress={handleRefreshStatus}
              style={styles.trailingIconHit}
              testID="workspace-environment-refresh"
            >
              <ThemedRefreshCcw size={14} uniProps={mutedColorMapping} />
            </Pressable>
          </View>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("workspace.environment.local")}
          onPress={handleToggleLocal}
          style={infoRowStyle}
          testID="workspace-environment-local"
        >
          <View style={styles.rowLeading}>
            <View style={styles.rowIcon}>
              <RowIcon name="local" />
            </View>
            <Text style={styles.rowLabel} numberOfLines={1}>
              {t("workspace.environment.local")}
            </Text>
          </View>
          <RowIcon name="chevron" />
        </Pressable>
        {localExpanded ? (
          <View style={styles.expandedBlock}>
            <Text style={styles.expandedPath} numberOfLines={3}>
              {locationLabel || t("workspace.environment.noSource")}
            </Text>
            {normalizedCwd ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("workspace.environment.openLocation")}
                onPress={handleOpenLocalPath}
                style={styles.expandedAction}
                testID="workspace-environment-open-location"
              >
                <ThemedFolder size={13} uniProps={mutedColorMapping} />
                <Text style={styles.expandedActionText}>
                  {t("workspace.environment.openLocation")}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <BranchSwitcherRow
          serverId={serverId}
          cwd={workspaceDirectory}
          currentBranchName={currentBranchName}
          isGitCheckout={isGitCheckout}
        />

        <WorkspaceEnvironmentGitPopover
          serverId={serverId}
          cwd={workspaceDirectory}
          currentBranchName={currentBranchName}
        >
          <View style={styles.rowLeading}>
            <View style={styles.rowIcon}>
              <RowIcon name="commit" />
            </View>
            <Text style={styles.rowLabel} numberOfLines={1}>
              {t("workspace.environment.commitOrPush")}
            </Text>
          </View>
        </WorkspaceEnvironmentGitPopover>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("workspace.environment.compareBranches")}
          onPress={onOpenChanges}
          style={infoRowStyle}
          testID="workspace-environment-compare"
        >
          <View style={styles.rowLeading}>
            <View style={styles.rowIcon}>
              <RowIcon name="compare" />
            </View>
            <Text style={styles.rowLabel} numberOfLines={1}>
              {t("workspace.environment.compareBranches")}
            </Text>
          </View>
          <RowIcon name="arrow" />
        </Pressable>
      </View>
    </View>
  );
}

function TaskProgressCard({ progress }: { progress: AgentProgressModel }) {
  const { t } = useTranslation();
  const progressFillStyle = useMemo<StyleProp<ViewStyle>>(
    () => [
      styles.progressFill,
      { width: `${Math.round(Math.min(1, Math.max(0, progress.progress)) * 100)}%` },
    ],
    [progress.progress],
  );

  return (
    <View style={styles.floatingCard} testID="workspace-task-progress-panel">
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{t("workspace.environment.taskProgressTitle")}</Text>
        <Text style={styles.cardHeaderMeta}>
          {t("workspace.environment.taskProgress", {
            completed: progress.completedCount,
            total: progress.totalCount,
          })}
        </Text>
      </View>
      <View style={styles.cardBody}>
        <View style={styles.progressTrack} testID="workspace-task-progress-bar">
          <View style={progressFillStyle} />
        </View>
        {progress.visibleItems.map((item) => (
          <ProgressItemRow key={item.id} item={item} />
        ))}
        {progress.hiddenCount > 0 ? (
          <Text style={styles.hiddenCountText}>
            {t("workspace.environment.moreTasks", { count: progress.hiddenCount })}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function ProgressItemRow({ item }: { item: AgentProgressItem }) {
  return (
    <View style={styles.progressRow}>
      <ProgressItemIcon item={item} />
      <Text
        style={item.completed ? styles.progressTextDone : styles.progressText}
        numberOfLines={2}
      >
        {item.text}
      </Text>
    </View>
  );
}

function ProgressItemIcon({ item }: { item: AgentProgressItem }) {
  if (item.completed) {
    return <ThemedCheck size={14} uniProps={successColorMapping} />;
  }
  if (item.status === "in_progress") {
    return <ThemedCircle size={12} uniProps={accentColorMapping} />;
  }
  return <ThemedCircle size={12} uniProps={mutedColorMapping} />;
}

function BranchSwitcherRow({
  serverId,
  cwd,
  currentBranchName,
  isGitCheckout,
}: {
  serverId: string;
  cwd: string | null;
  currentBranchName: string | null;
  isGitCheckout: boolean;
}) {
  const { t } = useTranslation();
  const anchorRef = useRef<View>(null);
  const client = useHostRuntimeClient(serverId);
  const isConnected = useHostRuntimeIsConnected(serverId);
  const toast = useToast();
  const queryClient = useQueryClient();
  const normalizedCwd = cwd?.trim() ?? "";
  const canSwitchBranch = Boolean(normalizedCwd && currentBranchName && isGitCheckout);
  const branchLabel = currentBranchName ?? t("workspace.environment.branch");
  const { branchOptions, isOpen, setIsOpen, handleBranchSelect } = useBranchSwitcher({
    client,
    normalizedServerId: serverId,
    normalizedWorkspaceId: normalizedCwd,
    currentBranchName,
    isGitCheckout: canSwitchBranch,
    isConnected,
    toast,
    queryClient,
  });

  const branchLeadingSlot = useMemo(
    () => <ThemedGitBranch size={14} uniProps={mutedColorMapping} />,
    [],
  );
  const renderBranchOption = useCallback<NonNullable<ComboboxProps["renderOption"]>>(
    ({ option, selected, active, onPress }) => (
      <ComboboxItem
        label={option.label}
        selected={selected}
        active={active}
        onPress={onPress}
        leadingSlot={branchLeadingSlot}
      />
    ),
    [branchLeadingSlot],
  );
  const handleOpen = useCallback(() => {
    if (canSwitchBranch) {
      setIsOpen(true);
    }
  }, [canSwitchBranch, setIsOpen]);

  const branchRowStyle = useCallback(
    ({ hovered, pressed }: { hovered?: boolean; pressed?: boolean }) => [
      styles.infoRow,
      canSwitchBranch && (Boolean(hovered) || Boolean(pressed)) && styles.infoRowHovered,
      !canSwitchBranch && styles.infoRowDisabled,
    ],
    [canSwitchBranch],
  );

  return (
    <View ref={anchorRef} collapsable={false}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={branchLabel}
        disabled={!canSwitchBranch}
        onPress={handleOpen}
        style={branchRowStyle}
        testID="workspace-environment-branch"
      >
        <View style={styles.rowLeading}>
          <View style={styles.rowIcon}>
            <RowIcon name="branch" />
          </View>
          <Text style={styles.rowLabel} numberOfLines={1}>
            {branchLabel}
          </Text>
        </View>
        <RowIcon name="chevron" />
      </Pressable>
      {canSwitchBranch ? (
        <Combobox
          options={branchOptions}
          value={branchLabel}
          onSelect={handleBranchSelect}
          searchable
          placeholder={t("branches.placeholder")}
          searchPlaceholder={t("branches.searchPlaceholder")}
          emptyText={t("branches.empty")}
          title={t("branches.title")}
          open={isOpen}
          onOpenChange={setIsOpen}
          anchorRef={anchorRef}
          desktopPlacement="bottom-start"
          desktopPreventInitialFlash
          desktopMinWidth={280}
          renderOption={renderBranchOption}
        />
      ) : null}
    </View>
  );
}

function RowIcon({ name }: { name: EnvironmentRowIconName }) {
  if (name === "changes") {
    return <ThemedSourceControlPanelIcon size={15} uniProps={mutedColorMapping} />;
  }
  if (name === "local") {
    return <ThemedLaptop size={15} uniProps={mutedColorMapping} />;
  }
  if (name === "branch") {
    return <ThemedGitBranch size={15} uniProps={mutedColorMapping} />;
  }
  if (name === "commit") {
    return <ThemedGitCommitHorizontal size={15} uniProps={mutedColorMapping} />;
  }
  if (name === "compare") {
    return <ThemedArrowLeftRight size={15} uniProps={mutedColorMapping} />;
  }
  if (name === "arrow") {
    return <ThemedArrowUpRight size={14} uniProps={mutedColorMapping} />;
  }
  return <ThemedChevronDown size={14} uniProps={mutedColorMapping} />;
}

function infoRowStyle({ hovered, pressed }: { hovered?: boolean; pressed?: boolean }) {
  return [styles.infoRow, (Boolean(hovered) || Boolean(pressed)) && styles.infoRowHovered];
}

const styles = StyleSheet.create((theme) => ({
  environmentStack: {
    width: WORKSPACE_ENVIRONMENT_PANEL_WIDTH,
    position: "absolute",
    top: WORKSPACE_SECONDARY_HEADER_HEIGHT + WORKBENCH_ENVIRONMENT_PANEL_INSET,
    right: WORKBENCH_ENVIRONMENT_PANEL_INSET,
    zIndex: 80,
    elevation: 80,
    gap: 8,
    maxHeight: "100%",
  },
  floatingCard: {
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius["2xl"],
    // Soft elevated surface when open — same family as composer / settings cards.
    backgroundColor: theme.colors.surface0,
    overflow: "hidden",
    ...(isWeb ? ({ boxShadow: WORKBENCH_ENVIRONMENT_PANEL_SHADOW } as object) : theme.shadow.sm),
  },
  cardHeader: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
    paddingHorizontal: 12,
    borderBottomWidth: theme.borderWidth[1],
    borderBottomColor: theme.colors.border,
  },
  cardTitle: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.foreground,
    fontSize: WORKBENCH_BODY_FONT_SIZE,
    lineHeight: WORKBENCH_BODY_LINE_HEIGHT,
    fontWeight: theme.fontWeight.semibold,
  },
  cardHeaderMeta: {
    color: theme.colors.foregroundMuted,
    fontSize: WORKBENCH_META_FONT_SIZE,
    lineHeight: WORKBENCH_META_LINE_HEIGHT,
    fontWeight: theme.fontWeight.medium,
  },
  iconButton: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
  },
  cardBody: {
    paddingVertical: 6,
    paddingHorizontal: 6,
    gap: 2,
  },
  infoRow: {
    minHeight: 34,
    paddingHorizontal: 8,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
  },
  infoRowHovered: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  infoRowDisabled: {
    opacity: 0.55,
  },
  rowLeading: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rowIcon: {
    width: 18,
    alignItems: "center",
  },
  rowLabel: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.foreground,
    fontSize: WORKBENCH_BODY_FONT_SIZE,
    lineHeight: WORKBENCH_BODY_LINE_HEIGHT,
  },
  rowTrailing: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
  },
  rowMetaText: {
    color: theme.colors.foregroundMuted,
    fontSize: WORKBENCH_META_FONT_SIZE,
    lineHeight: WORKBENCH_META_LINE_HEIGHT,
    fontWeight: theme.fontWeight.medium,
  },
  trailingIconHit: {
    minWidth: 22,
    minHeight: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  expandedBlock: {
    marginHorizontal: 8,
    marginBottom: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: theme.colors.surface1,
    gap: 6,
  },
  expandedPath: {
    color: theme.colors.foregroundMuted,
    fontSize: WORKBENCH_MICRO_FONT_SIZE,
    lineHeight: WORKBENCH_MICRO_LINE_HEIGHT,
  },
  expandedAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
  },
  expandedActionText: {
    color: theme.colors.foregroundMuted,
    fontSize: WORKBENCH_META_FONT_SIZE,
    lineHeight: WORKBENCH_META_LINE_HEIGHT,
  },
  progressTrack: {
    height: 4,
    marginHorizontal: 8,
    marginBottom: 6,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.accent,
  },
  progressRow: {
    minHeight: 28,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  progressText: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.foreground,
    fontSize: WORKBENCH_META_FONT_SIZE,
    lineHeight: WORKBENCH_META_LINE_HEIGHT,
  },
  progressTextDone: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.foregroundMuted,
    fontSize: WORKBENCH_META_FONT_SIZE,
    lineHeight: WORKBENCH_META_LINE_HEIGHT,
    textDecorationLine: "line-through",
  },
  hiddenCountText: {
    paddingHorizontal: 8,
    paddingBottom: 4,
    color: theme.colors.foregroundSubtleText,
    fontSize: WORKBENCH_MICRO_FONT_SIZE,
    lineHeight: WORKBENCH_MICRO_LINE_HEIGHT,
  },
}));
