import { useCallback, useMemo, useRef, type ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  GitBranch,
  GitPullRequest,
  Globe,
  HardDrive,
  Link2,
  ListTodo,
  ListTree,
  PanelRight,
  Settings,
  SquareTerminal,
} from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";

import { Combobox, ComboboxItem, type ComboboxProps } from "@/components/ui/combobox";
import { SourceControlPanelIcon } from "@/components/icons/source-control-panel-icon";
import { useToast } from "@/contexts/toast-context";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import { WorkspaceEnvironmentGitPopover } from "@/screens/workspace/workspace-environment-git-popover";
import type { WorkspaceActivityItem } from "@/screens/workspace/workspace-environment-panel-model";
import type {
  BrowserContextSummary,
  WorkspaceEnvironmentDockState,
  WorkspaceEnvironmentDockTab,
} from "@/screens/workspace/workspace-environment-dock-model";
import type { SubagentRow } from "@/subagents/select";
import type { Agent, WorkspaceDescriptor } from "@/stores/session-store";
import type { TodoEntry, TurnChangesItem } from "@/types/stream";
import type { Theme } from "@/styles/theme";
import { useWindowControlsPadding } from "@/utils/desktop-window";

const ThemedChevronDown = withUnistyles(ChevronDown);
const ThemedChevronRight = withUnistyles(ChevronRight);
const ThemedGitBranch = withUnistyles(GitBranch);
const ThemedGitPullRequest = withUnistyles(GitPullRequest);
const ThemedGlobe = withUnistyles(Globe);
const ThemedHardDrive = withUnistyles(HardDrive);
const ThemedLink2 = withUnistyles(Link2);
const ThemedListTodo = withUnistyles(ListTodo);
const ThemedListTree = withUnistyles(ListTree);
const ThemedPanelRight = withUnistyles(PanelRight);
const ThemedSettings = withUnistyles(Settings);
const ThemedSquareTerminal = withUnistyles(SquareTerminal);
const ThemedSourceControlPanelIcon = withUnistyles(SourceControlPanelIcon);

export const WORKSPACE_ENVIRONMENT_PANEL_WIDTH = 300;
const WORKSPACE_FLOATING_PANEL_TOP_OFFSET = 56;

const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

interface WorkspaceEnvironmentPanelProps {
  serverId: string;
  cwd: string | null;
  currentBranchName: string | null;
  isGitCheckout: boolean;
  isLocalDaemon: boolean;
  diffStat: WorkspaceDescriptor["diffStat"];
  githubRuntime: WorkspaceDescriptor["githubRuntime"];
  browserContext: BrowserContextSummary | null;
  dockState: WorkspaceEnvironmentDockState;
  sourceLabel: string | null;
  taskTitle: string | null;
  activityItems: WorkspaceActivityItem[];
  activeAgent: Agent | null;
  workspaceStatus: WorkspaceDescriptor["status"] | null;
  subagents: SubagentRow[];
  todoItems: TodoEntry[] | null;
  latestTurnChanges: TurnChangesItem | null;
  onSelectDockTab: (tab: WorkspaceEnvironmentDockTab) => void;
  onOpenChanges: () => void;
  onOpenSubagent: (agentId: string) => void;
  onCopyResumeCommand: (agentId: string) => void;
}

type EnvironmentIconName =
  | "changes"
  | "location"
  | "locality"
  | "branch"
  | "browser"
  | "pr"
  | "source"
  | "subagents"
  | "task"
  | "todo";

function WorkspaceEnvironmentPanel({
  serverId,
  cwd,
  currentBranchName,
  isGitCheckout,
  isLocalDaemon,
  diffStat,
  browserContext,
  sourceLabel,
  onOpenChanges,
}: WorkspaceEnvironmentPanelProps) {
  const { t } = useTranslation();
  const locationLabel = isLocalDaemon
    ? t("workspace.environment.local")
    : t("workspace.environment.remote");

  return (
    <View style={styles.environmentPanel} testID="workspace-environment-panel">
      <View style={styles.environmentInspectorCard}>
        <View style={styles.environmentInspectorCardHeader}>
          <Text style={styles.environmentInspectorCardTitle}>
            {t("workspace.environment.title")}
          </Text>
          <ThemedSettings size={16} uniProps={mutedColorMapping} />
        </View>
        <View style={styles.environmentInspectorRows}>
          <EnvironmentActionRow
            icon="changes"
            label={t("workspace.environment.changes")}
            onPress={onOpenChanges}
            testID="workspace-environment-changes"
          >
            <WorkspaceEnvironmentInlineDiffStat diffStat={diffStat} />
          </EnvironmentActionRow>
          <EnvironmentDisplayRow icon="location" label={locationLabel} />
          <WorkspaceEnvironmentBranchRow
            serverId={serverId}
            cwd={cwd}
            currentBranchName={currentBranchName}
            isGitCheckout={isGitCheckout}
          />
          <WorkspaceEnvironmentGitPopover
            serverId={serverId}
            cwd={cwd}
            currentBranchName={currentBranchName}
          >
            <EnvironmentRowContent icon="changes" label={t("workspace.environment.commitOrPush")}>
              <ThemedChevronDown size={14} uniProps={mutedColorMapping} />
            </EnvironmentRowContent>
          </WorkspaceEnvironmentGitPopover>
        </View>
        <View style={styles.environmentCardDivider} />
        <View style={styles.environmentSection}>
          <EnvironmentDisplayRow icon="task" label={t("workspace.environment.progress")}>
            <ThemedChevronRight size={14} uniProps={mutedColorMapping} />
          </EnvironmentDisplayRow>
        </View>
        <View style={styles.environmentCardDivider} />
        <View style={styles.environmentSection} testID="workspace-environment-browser">
          <Text style={styles.environmentSourceTitle}>
            {t("workspace.environment.dockTabs.browser-context")}
          </Text>
          <EnvironmentDisplayRow
            icon="browser"
            label={browserContext?.title ?? t("workspace.environment.noBrowserContext")}
          />
        </View>
        <View style={styles.environmentCardDivider} />
        <WorkspaceSourceSection sourceLabel={sourceLabel} />
      </View>
    </View>
  );
}

function WorkspaceSourceSection({ sourceLabel }: { sourceLabel: string | null }) {
  const { t } = useTranslation();
  return (
    <View style={styles.environmentSection} testID="workspace-environment-source">
      <Text style={styles.environmentSourceTitle}>{t("workspace.environment.source")}</Text>
      <Text style={styles.environmentSourceEmpty} numberOfLines={1}>
        {sourceLabel ?? t("workspace.environment.noSource")}
      </Text>
    </View>
  );
}

function WorkspaceEnvironmentBranchRow({
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

  if (!canSwitchBranch) {
    return <EnvironmentDisplayRow icon="branch" label={branchLabel} />;
  }

  return (
    <View ref={anchorRef} collapsable={false}>
      <EnvironmentActionRow
        icon="branch"
        label={branchLabel}
        onPress={handleOpen}
        testID="workspace-environment-branch"
      >
        <ThemedChevronDown size={14} uniProps={mutedColorMapping} />
      </EnvironmentActionRow>
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
    </View>
  );
}

function WorkspaceEnvironmentInlineDiffStat({
  diffStat,
}: {
  diffStat: WorkspaceDescriptor["diffStat"];
}) {
  const additions = diffStat?.additions ?? 0;
  const deletions = diffStat?.deletions ?? 0;
  return (
    <View style={styles.environmentInlineDiffStat}>
      <Text style={styles.environmentInlineDiffAddition}>+{additions}</Text>
      <Text style={styles.environmentInlineDiffDeletion}>-{deletions}</Text>
    </View>
  );
}

function EnvironmentActionRow({
  icon,
  label,
  children,
  onPress,
  testID,
}: {
  icon?: EnvironmentIconName;
  label: string;
  children?: ReactNode;
  onPress: () => void;
  testID?: string;
}) {
  const rowStyle = useCallback(
    ({ hovered, pressed }: { hovered?: boolean; pressed?: boolean }) => [
      styles.environmentRow,
      (Boolean(hovered) || Boolean(pressed)) && styles.environmentRowHovered,
    ],
    [],
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={rowStyle}
      testID={testID}
    >
      <EnvironmentRowContent icon={icon} label={label}>
        {children}
      </EnvironmentRowContent>
    </Pressable>
  );
}

function EnvironmentDisplayRow({
  icon,
  label,
  children,
}: {
  icon?: EnvironmentIconName;
  label: string;
  children?: ReactNode;
}) {
  return (
    <View style={styles.environmentRow}>
      <EnvironmentRowContent icon={icon} label={label}>
        {children}
      </EnvironmentRowContent>
    </View>
  );
}

function EnvironmentRowContent({
  icon,
  label,
  children,
}: {
  icon?: EnvironmentIconName;
  label: string;
  children?: ReactNode;
}) {
  return (
    <>
      <View style={styles.environmentRowLeading}>
        {icon ? (
          <View style={styles.environmentIcon}>
            <EnvironmentIcon name={icon} />
          </View>
        ) : null}
        <Text style={styles.environmentRowLabel} numberOfLines={1}>
          {label}
        </Text>
      </View>
      {children ? <View style={styles.environmentRowTrailing}>{children}</View> : null}
    </>
  );
}

function EnvironmentIcon({ name }: { name: EnvironmentIconName }) {
  if (name === "changes") {
    return <ThemedSourceControlPanelIcon size={15} uniProps={mutedColorMapping} />;
  }
  if (name === "location") {
    return <ThemedHardDrive size={15} uniProps={mutedColorMapping} />;
  }
  if (name === "locality") {
    return <ThemedPanelRight size={15} uniProps={mutedColorMapping} />;
  }
  if (name === "branch") {
    return <ThemedGitBranch size={15} uniProps={mutedColorMapping} />;
  }
  if (name === "browser") {
    return <ThemedGlobe size={15} uniProps={mutedColorMapping} />;
  }
  if (name === "pr") {
    return <ThemedGitPullRequest size={15} uniProps={mutedColorMapping} />;
  }
  if (name === "subagents") {
    return <ThemedListTree size={15} uniProps={mutedColorMapping} />;
  }
  if (name === "task") {
    return <ThemedSquareTerminal size={15} uniProps={mutedColorMapping} />;
  }
  if (name === "todo") {
    return <ThemedListTodo size={15} uniProps={mutedColorMapping} />;
  }
  return <ThemedLink2 size={15} uniProps={mutedColorMapping} />;
}

/**
 * Renders the desktop workspace environment rail and its inspector content.
 * @param props Environment data, visibility, and command callbacks
 * @returns The environment rail, or null when hidden
 */
export function WorkspaceEnvironmentPanelRail({
  visible,
  serverId,
  workspaceDirectory,
  currentBranchName,
  isGitCheckout,
  isLocalDaemon,
  diffStat,
  githubRuntime,
  browserContext,
  dockState,
  sourceLabel,
  taskTitle,
  activityItems,
  activeAgent,
  workspaceStatus,
  subagents,
  todoItems,
  latestTurnChanges,
  onSelectDockTab,
  onOpenChanges,
  onOpenSubagent,
  onCopyResumeCommand,
}: {
  visible: boolean;
  serverId: string;
  workspaceDirectory: string | null;
  currentBranchName: string | null;
  isGitCheckout: boolean;
  isLocalDaemon: boolean;
  diffStat: WorkspaceDescriptor["diffStat"];
  githubRuntime: WorkspaceDescriptor["githubRuntime"];
  browserContext: BrowserContextSummary | null;
  dockState: WorkspaceEnvironmentDockState;
  sourceLabel: string | null;
  taskTitle: string | null;
  activityItems: WorkspaceActivityItem[];
  activeAgent: Agent | null;
  workspaceStatus: WorkspaceDescriptor["status"] | null;
  subagents: SubagentRow[];
  todoItems: TodoEntry[] | null;
  latestTurnChanges: TurnChangesItem | null;
  onSelectDockTab: (tab: WorkspaceEnvironmentDockTab) => void;
  onOpenChanges: () => void;
  onOpenSubagent: (agentId: string) => void;
  onCopyResumeCommand: (agentId: string) => void;
}) {
  const tabRowPadding = useWindowControlsPadding("tabRow");
  const environmentRailStyle = useMemo(
    () => [
      styles.environmentRail,
      { top: tabRowPadding.top + WORKSPACE_FLOATING_PANEL_TOP_OFFSET + 14 },
    ],
    [tabRowPadding.top],
  );

  if (!visible) {
    return null;
  }

  return (
    <View style={environmentRailStyle} testID="workspace-environment-rail">
      <ScrollView
        style={styles.environmentRailScroll}
        contentContainerStyle={styles.environmentRailScrollContent}
        showsVerticalScrollIndicator={false}
      >
        <WorkspaceEnvironmentPanel
          serverId={serverId}
          cwd={workspaceDirectory}
          currentBranchName={currentBranchName}
          isGitCheckout={isGitCheckout}
          isLocalDaemon={isLocalDaemon}
          diffStat={diffStat}
          githubRuntime={githubRuntime}
          browserContext={browserContext}
          dockState={dockState}
          sourceLabel={sourceLabel}
          taskTitle={taskTitle}
          activityItems={activityItems}
          activeAgent={activeAgent}
          workspaceStatus={workspaceStatus}
          subagents={subagents}
          todoItems={todoItems}
          latestTurnChanges={latestTurnChanges}
          onSelectDockTab={onSelectDockTab}
          onOpenChanges={onOpenChanges}
          onOpenSubagent={onOpenSubagent}
          onCopyResumeCommand={onCopyResumeCommand}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  environmentPanel: {
    flex: 1,
  },
  environmentRail: {
    position: "absolute",
    right: 16,
    bottom: 14,
    width: WORKSPACE_ENVIRONMENT_PANEL_WIDTH,
    minHeight: 0,
    backgroundColor: "transparent",
    zIndex: 5,
  },
  environmentRailScroll: {
    maxHeight: "100%",
  },
  environmentRailScrollContent: {
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  environmentInspectorCard: {
    overflow: "hidden",
    paddingVertical: theme.spacing[3],
    paddingHorizontal: 0,
    borderRadius: 18,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
    ...theme.shadow.lg,
  },
  environmentInspectorCardHeader: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[4],
  },
  environmentInspectorCardTitle: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  environmentInspectorRows: {
    gap: theme.spacing[1],
    paddingTop: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
  },
  environmentRow: {
    minHeight: 30,
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
  },
  environmentRowHovered: {
    backgroundColor: theme.colors.surface2,
  },
  environmentRowLeading: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  environmentIcon: {
    width: 18,
    alignItems: "center",
  },
  environmentRowLabel: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.normal,
  },
  environmentRowTrailing: {
    minWidth: 48,
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  environmentInlineDiffStat: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
  },
  environmentInlineDiffAddition: {
    color: theme.colors.palette.green[500],
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.normal,
  },
  environmentInlineDiffDeletion: {
    color: theme.colors.palette.red[500],
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.normal,
  },
  environmentCardDivider: {
    height: theme.borderWidth[1],
    backgroundColor: theme.colors.border,
    marginVertical: theme.spacing[3],
    marginHorizontal: theme.spacing[4],
  },
  environmentSection: {
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[3],
  },
  environmentSourceTitle: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
  },
  environmentSourceEmpty: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.normal,
    paddingTop: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
  },
}));
