import { useCallback, useMemo, useRef, type ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
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
import { Button } from "@/components/ui/button";
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
import { WORKSPACE_ENVIRONMENT_TABS } from "@/screens/workspace/workspace-environment-dock-model";
import type { SubagentRow } from "@/subagents/select";
import type { Agent, WorkspaceDescriptor } from "@/stores/session-store";
import type { TodoEntry, TurnChangesItem } from "@/types/stream";
import type { Theme } from "@/styles/theme";
import { WORKBENCH_ENVIRONMENT_PANEL_WIDTH } from "@/constants/layout";

const ThemedChevronDown = withUnistyles(ChevronDown);
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

export const WORKSPACE_ENVIRONMENT_PANEL_WIDTH = WORKBENCH_ENVIRONMENT_PANEL_WIDTH;

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
}: WorkspaceEnvironmentPanelProps) {
  const { t } = useTranslation();
  const pullRequest = githubRuntime?.pullRequest ?? null;

  let activeContent: ReactNode;
  if (dockState.activeTab === "pull-request") {
    activeContent = pullRequest ? (
      <PullRequestPanel pullRequest={pullRequest} />
    ) : (
      <EnvironmentEmptyState label={t("workspace.environment.noPullRequest")} />
    );
  } else if (dockState.activeTab === "tasks") {
    activeContent = (
      <TasksPanel taskTitle={taskTitle} workspaceStatus={workspaceStatus} todoItems={todoItems} />
    );
  } else if (dockState.activeTab === "subagents") {
    activeContent = <SubagentsPanel subagents={subagents} onOpenSubagent={onOpenSubagent} />;
  } else if (dockState.activeTab === "browser-context") {
    activeContent = browserContext ? (
      <BrowserContextPanel browserContext={browserContext} />
    ) : (
      <EnvironmentEmptyState label={t("workspace.environment.noBrowserContext")} />
    );
  } else {
    activeContent = (
      <GitSummaryPanel
        serverId={serverId}
        cwd={cwd}
        currentBranchName={currentBranchName}
        isGitCheckout={isGitCheckout}
        isLocalDaemon={isLocalDaemon}
        diffStat={diffStat}
        pullRequest={pullRequest}
        sourceLabel={sourceLabel}
        activityItems={activityItems}
        activeAgent={activeAgent}
        latestTurnChanges={latestTurnChanges}
        onOpenChanges={onOpenChanges}
        onCopyResumeCommand={onCopyResumeCommand}
      />
    );
  }

  return (
    <View style={styles.environmentPanel} testID="workspace-environment-panel">
      <View style={styles.environmentInspectorCard}>
        <View style={styles.environmentInspectorCardHeader}>
          <Text style={styles.environmentInspectorCardTitle}>
            {t("workspace.environment.panelTitle")}
          </Text>
          <ThemedSettings size={15} uniProps={mutedColorMapping} />
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.environmentDockTabs}
        >
          {WORKSPACE_ENVIRONMENT_TABS.map((tab) => (
            <EnvironmentDockTab
              key={tab}
              tab={tab}
              active={dockState.activeTab === tab}
              onPress={onSelectDockTab}
            />
          ))}
        </ScrollView>
        <View style={styles.environmentBody}>{activeContent}</View>
      </View>
    </View>
  );
}

function EnvironmentDockTab({
  tab,
  active,
  onPress,
}: {
  tab: WorkspaceEnvironmentDockTab;
  active: boolean;
  onPress: (tab: WorkspaceEnvironmentDockTab) => void;
}) {
  const { t } = useTranslation();
  const handlePress = useCallback(() => onPress(tab), [onPress, tab]);
  const accessibilityState = useMemo(() => ({ selected: active }), [active]);
  const tabStyle = useMemo(
    () => [styles.environmentDockTab, active && styles.environmentDockTabActive],
    [active],
  );
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={accessibilityState}
      onPress={handlePress}
      style={tabStyle}
      testID={`workspace-environment-tab-${tab}`}
    >
      <Text style={active ? styles.environmentDockTabTextActive : styles.environmentDockTabText}>
        {t(`workspace.environment.dockTabs.${tab}`)}
      </Text>
    </Pressable>
  );
}

function GitSummaryPanel({
  serverId,
  cwd,
  currentBranchName,
  isGitCheckout,
  isLocalDaemon,
  diffStat,
  pullRequest,
  sourceLabel,
  activityItems,
  activeAgent,
  latestTurnChanges,
  onOpenChanges,
  onCopyResumeCommand,
}: Pick<
  WorkspaceEnvironmentPanelProps,
  | "serverId"
  | "currentBranchName"
  | "isGitCheckout"
  | "isLocalDaemon"
  | "diffStat"
  | "sourceLabel"
  | "activityItems"
  | "activeAgent"
  | "latestTurnChanges"
  | "onOpenChanges"
  | "onCopyResumeCommand"
> & {
  cwd: string | null;
  pullRequest: NonNullable<WorkspaceDescriptor["githubRuntime"]>["pullRequest"] | null;
}) {
  const { t } = useTranslation();
  const locationLabel = isLocalDaemon
    ? t("workspace.environment.local")
    : t("workspace.environment.remote");
  const canResume = Boolean(activeAgent?.id);
  const handleResume = useCallback(() => {
    if (activeAgent?.id) onCopyResumeCommand(activeAgent.id);
  }, [activeAgent?.id, onCopyResumeCommand]);

  return (
    <>
      <View style={styles.environmentSectionHeadingRow}>
        <Text style={styles.environmentSectionHeading}>Git</Text>
        <View style={styles.environmentBranchChip}>
          <ThemedGitBranch size={12} uniProps={mutedColorMapping} />
          <Text style={styles.environmentBranchChipText} numberOfLines={1}>
            {currentBranchName ?? t("workspace.environment.branch")}
          </Text>
        </View>
      </View>
      <View style={styles.environmentDiffSummary}>
        <EnvironmentDisplayRow icon="location" label={locationLabel} />
        <WorkspaceEnvironmentBranchRow
          serverId={serverId}
          cwd={cwd}
          currentBranchName={currentBranchName}
          isGitCheckout={isGitCheckout}
        />
        <View style={styles.environmentDiffNumbers}>
          <WorkspaceEnvironmentInlineDiffStat diffStat={diffStat} />
        </View>
      </View>
      {activeAgent && (diffStat || pullRequest) ? (
        <View style={styles.environmentCallout}>
          <Text style={styles.environmentCalloutTitle}>
            {activeAgent.status === "error"
              ? t("workspace.reviewCallout.interruptedTitle")
              : t("workspace.reviewCallout.completedTitle")}
          </Text>
          <Text style={styles.environmentCalloutText}>
            {latestTurnChanges?.changeSummary ??
              pullRequest?.title ??
              t("workspace.environment.changeSummary")}
          </Text>
        </View>
      ) : null}
      <View style={styles.environmentActionRow}>
        <Button
          variant="default"
          size="sm"
          onPress={onOpenChanges}
          style={styles.environmentAction}
        >
          {t("workspace.environment.changes")}
        </Button>
        <WorkspaceEnvironmentGitPopover
          serverId={serverId}
          cwd={cwd}
          currentBranchName={currentBranchName}
        >
          <View style={styles.environmentSecondaryAction}>
            <Text style={styles.environmentSecondaryActionText}>
              {t("workspace.environment.commitOrPush")}
            </Text>
          </View>
        </WorkspaceEnvironmentGitPopover>
      </View>
      {canResume ? (
        <Button
          variant="ghost"
          size="xs"
          onPress={handleResume}
          style={styles.environmentResumeAction}
        >
          {t("workspace.environment.resume")}
        </Button>
      ) : null}
      <ActivityPanel activityItems={activityItems} latestTurnChanges={latestTurnChanges} />
      <WorkspaceSourceSection sourceLabel={sourceLabel} />
    </>
  );
}

function PullRequestPanel({
  pullRequest,
}: {
  pullRequest: NonNullable<NonNullable<WorkspaceDescriptor["githubRuntime"]>["pullRequest"]>;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.environmentSection}>
      <Text style={styles.environmentSectionHeading}>PR</Text>
      <Text style={styles.environmentPrimaryText}>{pullRequest.title}</Text>
      <Text style={styles.environmentSecondaryText}>
        {pullRequest.headRefName} → {pullRequest.baseRefName}
      </Text>
      <View style={styles.environmentPillRow}>
        <EnvironmentPill label={pullRequest.state} />
        <EnvironmentPill
          label={t(`workspace.environment.checksStatus.${pullRequest.checksStatus ?? "none"}`)}
        />
        {pullRequest.reviewDecision ? (
          <EnvironmentPill
            label={t(`workspace.environment.reviewDecision.${pullRequest.reviewDecision}`)}
          />
        ) : null}
      </View>
    </View>
  );
}

function TasksPanel({
  taskTitle,
  workspaceStatus,
  todoItems,
}: Pick<WorkspaceEnvironmentPanelProps, "taskTitle" | "workspaceStatus" | "todoItems">) {
  const { t } = useTranslation();
  const completedCount = todoItems?.filter((item) => item.completed).length ?? 0;
  return (
    <View style={styles.environmentSection}>
      <Text style={styles.environmentSectionHeading}>{t("workspace.environment.tasks")}</Text>
      {taskTitle ? <Text style={styles.environmentPrimaryText}>{taskTitle}</Text> : null}
      {workspaceStatus ? (
        <EnvironmentPill label={t(`workspace.environment.workspaceStatus.${workspaceStatus}`)} />
      ) : null}
      {todoItems && todoItems.length > 0 ? (
        <>
          <Text style={styles.environmentSecondaryText}>
            {t("workspace.environment.taskProgress", {
              completed: completedCount,
              total: todoItems.length,
            })}
          </Text>
          {todoItems.map((item) => (
            <View
              key={`${item.completed ? "done" : "open"}:${item.text}`}
              style={styles.environmentListRow}
            >
              <Text style={item.completed ? styles.environmentCheckDone : styles.environmentCheck}>
                {item.completed ? "✓" : "○"}
              </Text>
              <Text style={styles.environmentListText}>{item.text}</Text>
            </View>
          ))}
        </>
      ) : (
        <EnvironmentEmptyState label={t("workspace.environment.noRecentActivity")} />
      )}
    </View>
  );
}

function SubagentsPanel({
  subagents,
  onOpenSubagent,
}: Pick<WorkspaceEnvironmentPanelProps, "subagents" | "onOpenSubagent">) {
  const { t } = useTranslation();
  if (subagents.length === 0) {
    return <EnvironmentEmptyState label={t("workspace.environment.noRecentActivity")} />;
  }
  return (
    <View style={styles.environmentSection}>
      <Text style={styles.environmentSectionHeading}>{t("workspace.environment.subagents")}</Text>
      {subagents.map((subagent) => (
        <SubagentActionRow key={subagent.id} subagent={subagent} onOpenSubagent={onOpenSubagent} />
      ))}
    </View>
  );
}

function SubagentActionRow({
  subagent,
  onOpenSubagent,
}: {
  subagent: SubagentRow;
  onOpenSubagent: (agentId: string) => void;
}) {
  const handlePress = useCallback(() => onOpenSubagent(subagent.id), [onOpenSubagent, subagent.id]);
  return (
    <EnvironmentActionRow
      icon="subagents"
      label={subagent.title || subagent.id}
      onPress={handlePress}
    >
      <Text style={styles.environmentSecondaryText}>{subagent.status}</Text>
    </EnvironmentActionRow>
  );
}

function BrowserContextPanel({ browserContext }: { browserContext: BrowserContextSummary }) {
  const { t } = useTranslation();
  return (
    <View style={styles.environmentSection} testID="workspace-environment-browser">
      <Text style={styles.environmentSectionHeading}>
        {t("workspace.environment.dockTabs.browser-context")}
      </Text>
      <Text style={styles.environmentPrimaryText}>{browserContext.title}</Text>
      <Text style={styles.environmentSecondaryText}>{browserContext.subtitle}</Text>
      <EnvironmentPill
        label={
          browserContext.isLoading
            ? t("workspace.environment.browserLoading")
            : t("workspace.environment.browserReady")
        }
      />
      <Text style={styles.environmentUrl} numberOfLines={3}>
        {browserContext.url}
      </Text>
    </View>
  );
}

function ActivityPanel({
  activityItems,
  latestTurnChanges,
}: Pick<WorkspaceEnvironmentPanelProps, "activityItems" | "latestTurnChanges">) {
  const { t } = useTranslation();
  const recentFiles = latestTurnChanges?.changedFiles.slice(0, 3) ?? [];
  return (
    <View style={styles.environmentSection}>
      <Text style={styles.environmentSourceTitle}>{t("workspace.environment.recentActivity")}</Text>
      {recentFiles.map((file) => (
        <View key={file.path} style={styles.environmentActivityRow}>
          <View style={styles.environmentActivityDot} />
          <Text style={styles.environmentListText} numberOfLines={2}>
            {file.path}
          </Text>
        </View>
      ))}
      {recentFiles.length === 0
        ? activityItems.slice(0, 3).map((item) => (
            <View key={item.key} style={styles.environmentActivityRow}>
              <View style={styles.environmentActivityDot} />
              <Text style={styles.environmentListText}>{item.label}</Text>
            </View>
          ))
        : null}
    </View>
  );
}

function EnvironmentPill({ label }: { label: string }) {
  return (
    <View style={styles.environmentPill}>
      <Text style={styles.environmentPillText}>{label}</Text>
    </View>
  );
}

function EnvironmentEmptyState({ label }: { label: string }) {
  return (
    <View style={styles.environmentEmptyState}>
      <Text style={styles.environmentSecondaryText}>{label}</Text>
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
  if (!visible) {
    return null;
  }

  return (
    <View style={styles.environmentRail} testID="workspace-environment-rail">
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
    width: WORKSPACE_ENVIRONMENT_PANEL_WIDTH,
    flexShrink: 0,
    minHeight: 0,
    borderLeftWidth: theme.borderWidth[1],
    borderLeftColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
  },
  environmentRailScroll: {
    flex: 1,
  },
  environmentRailScrollContent: {
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  environmentInspectorCard: {
    overflow: "hidden",
    paddingVertical: theme.spacing[3],
    paddingHorizontal: 0,
    backgroundColor: theme.colors.surface0,
  },
  environmentInspectorCardHeader: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderBottomWidth: theme.borderWidth[1],
    borderBottomColor: theme.colors.border,
  },
  environmentInspectorCardTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
  },
  environmentInspectorRows: {
    gap: theme.spacing[1],
    paddingTop: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
  },
  environmentDockTabs: {
    minHeight: 36,
    paddingHorizontal: theme.spacing[2],
    alignItems: "center",
    gap: theme.spacing[1],
    borderBottomWidth: theme.borderWidth[1],
    borderBottomColor: theme.colors.border,
  },
  environmentDockTab: {
    minHeight: 26,
    paddingHorizontal: theme.spacing[2],
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
  },
  environmentDockTabActive: {
    backgroundColor: theme.colors.surface2,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.borderAccent,
  },
  environmentDockTabText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  environmentDockTabTextActive: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xs,
  },
  environmentBody: {
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[3],
  },
  environmentSectionHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
  },
  environmentSectionHeading: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  environmentBranchChip: {
    maxWidth: 150,
    minHeight: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.borderAccent,
    backgroundColor: theme.colors.surface2,
  },
  environmentBranchChipText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xs,
    flexShrink: 1,
  },
  environmentDiffSummary: {
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
  },
  environmentDiffNumbers: {
    paddingHorizontal: theme.spacing[2],
    paddingTop: theme.spacing[1],
  },
  environmentCallout: {
    gap: theme.spacing[1],
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.surface1,
  },
  environmentCalloutTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  environmentCalloutText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  environmentActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  environmentAction: {
    flex: 1,
  },
  environmentSecondaryAction: {
    minHeight: 32,
    paddingHorizontal: theme.spacing[3],
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.borderAccent,
  },
  environmentSecondaryActionText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xs,
  },
  environmentResumeAction: {
    alignSelf: "flex-start",
  },
  environmentPrimaryText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  environmentSecondaryText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  environmentPillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[1],
  },
  environmentPill: {
    alignSelf: "flex-start",
    minHeight: 22,
    paddingHorizontal: theme.spacing[2],
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface2,
  },
  environmentPillText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  environmentListRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[1],
  },
  environmentCheck: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  environmentCheckDone: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.sm,
  },
  environmentListText: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  environmentUrl: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  environmentActivityRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing[2],
    paddingVertical: 2,
  },
  environmentActivityDot: {
    width: 5,
    height: 5,
    marginTop: 5,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.accent,
  },
  environmentEmptyState: {
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
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
