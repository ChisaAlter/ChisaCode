import { useCallback, useMemo, useRef, type ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import {
  Check,
  CircleAlert,
  GitBranch,
  GitPullRequest,
  Globe,
  Link2,
  ListTodo,
  ListTree,
  PanelRight,
  Settings2,
  SquareTerminal,
  X,
} from "lucide-react-native";
import { StyleSheet, useUnistyles, withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";

import { Combobox, ComboboxItem, type ComboboxProps } from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { usePanelStore, type EnvironmentPanelTabPreference } from "@/stores/panel-store";
import type { TodoEntry, TurnChangesItem } from "@/types/stream";
import type { Theme } from "@/styles/theme";
import { resolveThemeWorkbenchSurfaceRoles } from "@/styles/workbench-surface-roles";
import { isWeb } from "@/constants/platform";
import {
  WORKSPACE_SECONDARY_HEADER_HEIGHT,
  WORKBENCH_BODY_FONT_SIZE,
  WORKBENCH_BODY_LINE_HEIGHT,
  WORKBENCH_ENVIRONMENT_ACTION_GAP,
  WORKBENCH_ENVIRONMENT_ACTION_MARGIN_BOTTOM,
  WORKBENCH_ENVIRONMENT_BRANCH_LINE_HEIGHT,
  WORKBENCH_ENVIRONMENT_CALLOUT_HEIGHT,
  WORKBENCH_ENVIRONMENT_CALLOUT_TEXT_LINE_HEIGHT,
  WORKBENCH_ENVIRONMENT_CALLOUT_TITLE_LINE_HEIGHT,
  WORKBENCH_ENVIRONMENT_DIFF_SUMMARY_HEIGHT,
  WORKBENCH_ENVIRONMENT_PANEL_SHADOW,
  WORKBENCH_ENVIRONMENT_PANEL_INSET,
  WORKBENCH_ENVIRONMENT_PANEL_WIDTH,
  WORKBENCH_ENVIRONMENT_SECTION_GAP,
  WORKBENCH_ENVIRONMENT_TAB_HEIGHT,
  WORKBENCH_ENVIRONMENT_TAB_RADIUS,
  WORKBENCH_META_FONT_SIZE,
  WORKBENCH_META_LINE_HEIGHT,
} from "@/constants/layout";

const ThemedCheck = withUnistyles(Check);

const ThemedCircleAlert = withUnistyles(CircleAlert);
const ThemedGitBranch = withUnistyles(GitBranch);
const ThemedGitPullRequest = withUnistyles(GitPullRequest);
const ThemedGlobe = withUnistyles(Globe);
const ThemedLink2 = withUnistyles(Link2);
const ThemedListTodo = withUnistyles(ListTodo);
const ThemedListTree = withUnistyles(ListTree);
const ThemedPanelRight = withUnistyles(PanelRight);
const ThemedSettings2 = withUnistyles(Settings2);
const ThemedSquareTerminal = withUnistyles(SquareTerminal);
const ThemedSourceControlPanelIcon = withUnistyles(SourceControlPanelIcon);
const ThemedX = withUnistyles(X);

export const WORKSPACE_ENVIRONMENT_PANEL_WIDTH = WORKBENCH_ENVIRONMENT_PANEL_WIDTH;

const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const successColorMapping = (theme: Theme) => ({ color: theme.colors.palette.green[500] });
const dangerColorMapping = (theme: Theme) => ({ color: theme.colors.destructive });
const ENVIRONMENT_PANEL_OPACITY_OPTIONS = [0.88, 0.97, 1] as const;

interface WorkspaceEnvironmentPanelProps {
  serverId: string;
  cwd: string | null;
  currentBranchName: string | null;
  isGitCheckout: boolean;
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
  onClose: () => void;
}

type EnvironmentIconName =
  | "changes"
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
  onClose,
}: WorkspaceEnvironmentPanelProps) {
  const { t } = useTranslation();
  const pullRequest = githubRuntime?.pullRequest ?? null;
  const visibleTabs = usePanelStore((state) => state.environmentPanelVisibleTabs);
  const environmentPanelOpacity = usePanelStore((state) => state.environmentPanelOpacity);
  const toggleEnvironmentPanelTab = usePanelStore((state) => state.toggleEnvironmentPanelTab);
  const setEnvironmentPanelOpacity = usePanelStore((state) => state.setEnvironmentPanelOpacity);
  const renderedTabs = useMemo(
    () => WORKSPACE_ENVIRONMENT_TABS.filter((tab) => visibleTabs.includes(tab)),
    [visibleTabs],
  );
  const handleTogglePanelTab = useCallback(
    (tab: EnvironmentPanelTabPreference) => {
      if (visibleTabs.includes(tab) && dockState.activeTab === tab && visibleTabs.length > 1) {
        const fallbackTab = WORKSPACE_ENVIRONMENT_TABS.find(
          (candidate) => candidate !== tab && visibleTabs.includes(candidate),
        );
        if (fallbackTab) {
          onSelectDockTab(fallbackTab);
        }
      }
      toggleEnvironmentPanelTab(tab);
    },
    [dockState.activeTab, onSelectDockTab, toggleEnvironmentPanelTab, visibleTabs],
  );

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
          <View style={styles.environmentHeaderActions}>
            <EnvironmentSettingsMenu
              visibleTabs={visibleTabs}
              environmentPanelOpacity={environmentPanelOpacity}
              onToggleTab={handleTogglePanelTab}
              onSetOpacity={setEnvironmentPanelOpacity}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("workspace.environment.hideFloatingPanel")}
              onPress={onClose}
              style={styles.environmentCloseButton}
              testID="workspace-environment-close"
            >
              <ThemedX size={15} uniProps={mutedColorMapping} />
            </Pressable>
          </View>
        </View>
        <View style={styles.environmentDockTabs} accessibilityRole="tablist">
          {renderedTabs.map((tab) => (
            <EnvironmentDockTab
              key={tab}
              tab={tab}
              active={dockState.activeTab === tab}
              onPress={onSelectDockTab}
            />
          ))}
        </View>
        <View style={styles.environmentBody}>{activeContent}</View>
      </View>
    </View>
  );
}

function EnvironmentSettingsHeading({ children }: { children: string }) {
  return (
    <View style={styles.environmentSettingsHeading}>
      <Text style={styles.environmentSettingsHeadingText}>{children}</Text>
    </View>
  );
}

function EnvironmentVisibilityMenuItem({
  tab,
  selected,
  onToggle,
}: {
  tab: EnvironmentPanelTabPreference;
  selected: boolean;
  onToggle: (tab: EnvironmentPanelTabPreference) => void;
}) {
  const { t } = useTranslation();
  const handleSelect = useCallback(() => onToggle(tab), [onToggle, tab]);
  return (
    <DropdownMenuItem
      closeOnSelect={false}
      onSelect={handleSelect}
      selected={selected}
      showSelectedCheck
    >
      {t(`workspace.environment.dockTabs.${tab}`)}
    </DropdownMenuItem>
  );
}

function EnvironmentOpacityMenuItem({
  opacity,
  selected,
  onSelectOpacity,
}: {
  opacity: number;
  selected: boolean;
  onSelectOpacity: (opacity: number) => void;
}) {
  const handleSelect = useCallback(() => onSelectOpacity(opacity), [onSelectOpacity, opacity]);
  return (
    <DropdownMenuItem
      closeOnSelect={false}
      onSelect={handleSelect}
      selected={selected}
      showSelectedCheck
    >
      {Math.round(opacity * 100)}%
    </DropdownMenuItem>
  );
}

function EnvironmentSettingsMenu({
  visibleTabs,
  environmentPanelOpacity,
  onToggleTab,
  onSetOpacity,
}: {
  visibleTabs: EnvironmentPanelTabPreference[];
  environmentPanelOpacity: number;
  onToggleTab: (tab: EnvironmentPanelTabPreference) => void;
  onSetOpacity: (opacity: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        accessibilityLabel={t("workspace.environment.panelSettings")}
        style={styles.environmentCloseButton}
        testID="workspace-environment-settings"
      >
        <ThemedSettings2 size={14} uniProps={mutedColorMapping} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" width={240}>
        <EnvironmentSettingsHeading>
          {t("workspace.environment.visibleModules")}
        </EnvironmentSettingsHeading>
        {WORKSPACE_ENVIRONMENT_TABS.map((tab) => (
          <EnvironmentVisibilityMenuItem
            key={tab}
            tab={tab}
            selected={visibleTabs.includes(tab)}
            onToggle={onToggleTab}
          />
        ))}
        <EnvironmentSettingsHeading>
          {t("workspace.environment.panelOpacity")}
        </EnvironmentSettingsHeading>
        {ENVIRONMENT_PANEL_OPACITY_OPTIONS.map((opacity) => (
          <EnvironmentOpacityMenuItem
            key={opacity}
            opacity={opacity}
            selected={Math.abs(environmentPanelOpacity - opacity) < 0.01}
            onSelectOpacity={onSetOpacity}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function EnvironmentDockTabIcon({ tab }: { tab: WorkspaceEnvironmentDockTab }) {
  if (tab === "git-summary") {
    return <ThemedSourceControlPanelIcon size={12} uniProps={mutedColorMapping} />;
  }
  if (tab === "pull-request") {
    return <ThemedGitPullRequest size={12} uniProps={mutedColorMapping} />;
  }
  if (tab === "tasks") {
    return <ThemedListTodo size={12} uniProps={mutedColorMapping} />;
  }
  if (tab === "subagents") {
    return <ThemedListTree size={12} uniProps={mutedColorMapping} />;
  }
  return <ThemedGlobe size={12} uniProps={mutedColorMapping} />;
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
  const label = t(`workspace.environment.dockTabs.${tab}`);
  const accessibilityState = useMemo(() => ({ selected: active }), [active]);
  const tabStyle = useMemo(
    () => [styles.environmentDockTab, active && styles.environmentDockTabActive],
    [active],
  );
  return (
    <Tooltip delayDuration={300} enabledOnDesktop enabledOnMobile={false}>
      <TooltipTrigger asChild>
        <Pressable
          accessibilityRole="tab"
          accessibilityLabel={label}
          accessibilityState={accessibilityState}
          onPress={handlePress}
          style={tabStyle}
          testID={`workspace-environment-tab-${tab}`}
        >
          <EnvironmentDockTabIcon tab={tab} />
        </Pressable>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="center" offset={6}>
        <Text style={styles.environmentDockTooltipText}>{label}</Text>
      </TooltipContent>
    </Tooltip>
  );
}

function GitSummaryPanel({
  serverId,
  cwd,
  currentBranchName,
  isGitCheckout,
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
  const isInterrupted = activeAgent?.status === "error";
  const canResume = isInterrupted && Boolean(activeAgent?.id);
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
          <View style={styles.environmentCalloutTitleRow}>
            <View style={styles.environmentCalloutTitleLeading}>
              {isInterrupted ? (
                <ThemedCircleAlert size={13} uniProps={dangerColorMapping} />
              ) : (
                <ThemedCheck size={13} uniProps={successColorMapping} />
              )}
              <Text style={styles.environmentCalloutTitle} numberOfLines={1}>
                {isInterrupted
                  ? t("workspace.reviewCallout.interruptedTitle")
                  : t("workspace.reviewCallout.completedTitle")}
              </Text>
            </View>
            {canResume ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("workspace.environment.resume")}
                onPress={handleResume}
                style={styles.environmentResumeAction}
                testID="workspace-environment-resume"
              >
                <Text style={styles.environmentResumeText}>
                  {t("workspace.environment.resume")}
                </Text>
              </Pressable>
            ) : null}
          </View>
          <Text style={styles.environmentCalloutText} numberOfLines={2}>
            {latestTurnChanges?.changeSummary ??
              pullRequest?.title ??
              t("workspace.environment.changeSummary")}
          </Text>
        </View>
      ) : null}
      <View style={styles.environmentActionRow}>
        <Button
          variant="default"
          size="xs"
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
    <View style={styles.environmentActivitySection}>
      <Text style={ENVIRONMENT_ACTIVITY_TITLE_STYLE}>
        {t("workspace.environment.recentActivity")}
      </Text>
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
    <View style={ENVIRONMENT_SOURCE_SECTION_STYLE} testID="workspace-environment-source">
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

  const currentBranchLabel = t("workspace.environment.currentBranch");
  const branchValue = <Text style={styles.environmentBranchValue}>{branchLabel}</Text>;

  if (!canSwitchBranch) {
    return (
      <EnvironmentDisplayRow label={currentBranchLabel} compact>
        {branchValue}
      </EnvironmentDisplayRow>
    );
  }

  return (
    <View ref={anchorRef} collapsable={false}>
      <EnvironmentActionRow
        label={currentBranchLabel}
        compact
        onPress={handleOpen}
        testID="workspace-environment-branch"
      >
        <View style={styles.environmentBranchValueRow}>{branchValue}</View>
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
  compact = false,
}: {
  icon?: EnvironmentIconName;
  label: string;
  children?: ReactNode;
  onPress: () => void;
  testID?: string;
  compact?: boolean;
}) {
  const rowStyle = useCallback(
    ({ hovered, pressed }: { hovered?: boolean; pressed?: boolean }) => [
      compact ? styles.environmentBranchSummaryRow : styles.environmentRow,
      (Boolean(hovered) || Boolean(pressed)) && styles.environmentRowHovered,
    ],
    [compact],
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={rowStyle}
      testID={testID}
    >
      <EnvironmentRowContent icon={icon} label={label} compact={compact}>
        {children}
      </EnvironmentRowContent>
    </Pressable>
  );
}

function EnvironmentDisplayRow({
  icon,
  label,
  children,
  compact = false,
}: {
  icon?: EnvironmentIconName;
  label: string;
  children?: ReactNode;
  compact?: boolean;
}) {
  return (
    <View style={compact ? styles.environmentBranchSummaryRow : styles.environmentRow}>
      <EnvironmentRowContent icon={icon} label={label} compact={compact}>
        {children}
      </EnvironmentRowContent>
    </View>
  );
}

function EnvironmentRowContent({
  icon,
  label,
  children,
  compact = false,
}: {
  icon?: EnvironmentIconName;
  label: string;
  children?: ReactNode;
  compact?: boolean;
}) {
  return (
    <>
      <View style={styles.environmentRowLeading}>
        {icon ? (
          <View style={styles.environmentIcon}>
            <EnvironmentIcon name={icon} />
          </View>
        ) : null}
        <Text
          style={compact ? styles.environmentBranchSummaryLabel : styles.environmentRowLabel}
          numberOfLines={1}
        >
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
  onClose,
}: {
  visible: boolean;
  serverId: string;
  workspaceDirectory: string | null;
  currentBranchName: string | null;
  isGitCheckout: boolean;
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
  onClose: () => void;
}) {
  const { theme } = useUnistyles();
  const environmentPanelOpacity = usePanelStore((state) => state.environmentPanelOpacity);
  const railBackgroundStyle = useMemo(
    () => [
      styles.environmentRailBackground,
      {
        backgroundColor: theme.colors.surface0,
        opacity: theme.glass.enabled ? environmentPanelOpacity : 1,
      },
    ],
    [environmentPanelOpacity, theme.colors.surface0, theme.glass.enabled],
  );
  if (!visible) {
    return null;
  }

  return (
    <View style={styles.environmentRail} testID="workspace-environment-rail">
      <View pointerEvents="none" style={railBackgroundStyle} />
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
          onClose={onClose}
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
    position: "absolute",
    top: WORKSPACE_SECONDARY_HEADER_HEIGHT + WORKBENCH_ENVIRONMENT_PANEL_INSET,
    right: WORKBENCH_ENVIRONMENT_PANEL_INSET,
    bottom: WORKBENCH_ENVIRONMENT_PANEL_INSET,
    zIndex: 80,
    elevation: 80,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: 12,
    backgroundColor: "transparent",
    overflow: "hidden",
    ...(isWeb ? ({ boxShadow: WORKBENCH_ENVIRONMENT_PANEL_SHADOW } as object) : theme.shadow.lg),
  },
  environmentRailBackground: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
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
    paddingVertical: 0,
    paddingHorizontal: 0,
    backgroundColor: resolveThemeWorkbenchSurfaceRoles(theme).content,
  },
  environmentInspectorCardHeader: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
    paddingHorizontal: 10,
    borderBottomWidth: theme.borderWidth[1],
    borderBottomColor: theme.colors.border,
  },
  environmentInspectorCardTitle: {
    color: theme.colors.foreground,
    fontSize: WORKBENCH_BODY_FONT_SIZE,
    lineHeight: WORKBENCH_BODY_LINE_HEIGHT,
    fontWeight: theme.fontWeight.semibold,
  },
  environmentHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  environmentCloseButton: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
  },
  environmentSettingsHeading: {
    paddingTop: 8,
    paddingRight: 10,
    paddingBottom: 4,
    paddingLeft: 10,
  },
  environmentSettingsHeadingText: {
    color: theme.colors.foregroundSubtleText,
    fontSize: theme.fontSize.xs,
    lineHeight: WORKBENCH_META_LINE_HEIGHT,
    fontWeight: theme.fontWeight.semibold,
  },
  environmentInspectorRows: {
    gap: theme.spacing[1],
    paddingTop: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
  },
  environmentDockTabs: {
    minHeight: 36,
    flexDirection: "row",
    paddingHorizontal: theme.spacing[2],
    alignItems: "center",
    gap: 2,
    borderBottomWidth: theme.borderWidth[1],
    borderBottomColor: theme.colors.border,
  },
  environmentDockTab: {
    flex: 1,
    minHeight: WORKBENCH_ENVIRONMENT_TAB_HEIGHT,
    height: WORKBENCH_ENVIRONMENT_TAB_HEIGHT,
    flexDirection: "row",
    paddingHorizontal: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: WORKBENCH_ENVIRONMENT_TAB_RADIUS,
    borderWidth: theme.borderWidth[1],
    borderColor: "transparent",
  },
  environmentDockTabActive: {
    backgroundColor: theme.colors.surfaceSidebarHover,
    borderColor: theme.colors.borderAccent,
    ...(isWeb ? ({ boxShadow: "0 1px 3px rgba(0, 0, 0, 0.06)" } as object) : theme.shadow.sm),
  },
  environmentDockTooltipText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xs,
    lineHeight: WORKBENCH_META_LINE_HEIGHT,
  },
  environmentBody: {
    gap: 0,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[3],
  },
  environmentSectionHeadingRow: {
    marginBottom: WORKBENCH_ENVIRONMENT_SECTION_GAP,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
  },
  environmentSectionHeading: {
    color: theme.colors.foreground,
    fontSize: WORKBENCH_META_FONT_SIZE,
    lineHeight: WORKBENCH_META_LINE_HEIGHT,
    fontWeight: theme.fontWeight.semibold,
  },
  environmentBranchChip: {
    maxWidth: 150,
    minHeight: 28,
    height: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingHorizontal: 7,
    borderRadius: theme.borderRadius.md,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.borderAccent,
    backgroundColor: theme.colors.surface2,
    ...(isWeb
      ? ({
          borderColor: `color-mix(in srgb, ${theme.colors.accent} 30%, ${theme.colors.border})`,
          backgroundColor: `color-mix(in srgb, ${theme.colors.accent} 10%, ${theme.colors.surface2})`,
        } as object)
      : {}),
  },
  environmentBranchChipText: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.xs,
    lineHeight: WORKBENCH_META_LINE_HEIGHT,
    flexShrink: 1,
  },
  environmentDiffSummary: {
    height: WORKBENCH_ENVIRONMENT_DIFF_SUMMARY_HEIGHT,
    marginBottom: WORKBENCH_ENVIRONMENT_SECTION_GAP,
    overflow: "hidden",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
  },
  environmentDiffNumbers: {
    paddingHorizontal: 0,
    paddingTop: 6,
  },
  environmentCallout: {
    height: WORKBENCH_ENVIRONMENT_CALLOUT_HEIGHT,
    marginBottom: WORKBENCH_ENVIRONMENT_SECTION_GAP,
    overflow: "hidden",
    gap: 3,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.surface1,
    ...(isWeb
      ? ({
          borderColor: `color-mix(in srgb, ${theme.colors.accent} 30%, ${theme.colors.border})`,
          backgroundColor: `color-mix(in srgb, ${theme.colors.accent} 8%, ${theme.colors.surface1})`,
        } as object)
      : {}),
  },
  environmentCalloutTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
  },
  environmentCalloutTitleLeading: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  environmentCalloutTitle: {
    flex: 1,
    color: theme.colors.foreground,
    fontSize: WORKBENCH_BODY_FONT_SIZE,
    lineHeight: WORKBENCH_ENVIRONMENT_CALLOUT_TITLE_LINE_HEIGHT,
    fontWeight: theme.fontWeight.semibold,
  },
  environmentCalloutText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    lineHeight: WORKBENCH_ENVIRONMENT_CALLOUT_TEXT_LINE_HEIGHT,
  },
  environmentActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: WORKBENCH_ENVIRONMENT_ACTION_GAP,
    marginBottom: WORKBENCH_ENVIRONMENT_ACTION_MARGIN_BOTTOM,
  },
  environmentAction: {
    flex: 1,
    minHeight: 28,
    height: 28,
    borderRadius: 8,
    borderColor: "transparent",
    backgroundColor: theme.colors.accent,
    ...(isWeb
      ? ({
          backgroundImage: `linear-gradient(135deg, ${theme.colors.accent}, ${theme.colors.accentNeon})`,
          boxShadow: `0 0 12px color-mix(in srgb, ${theme.colors.accent} 20%, transparent)`,
        } as object)
      : {}),
  },
  environmentSecondaryAction: {
    flex: 1,
    minHeight: 28,
    height: 28,
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
    minHeight: 28,
    paddingHorizontal: theme.spacing[1],
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
  },
  environmentResumeText: {
    color: theme.colors.foregroundMuted,
    fontSize: WORKBENCH_META_FONT_SIZE,
    lineHeight: WORKBENCH_META_LINE_HEIGHT,
  },
  environmentPrimaryText: {
    color: theme.colors.foreground,
    fontSize: WORKBENCH_BODY_FONT_SIZE,
    lineHeight: WORKBENCH_BODY_LINE_HEIGHT,
  },
  environmentSecondaryText: {
    color: theme.colors.foregroundMuted,
    fontSize: WORKBENCH_META_FONT_SIZE,
    lineHeight: WORKBENCH_META_LINE_HEIGHT,
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
    lineHeight: WORKBENCH_META_LINE_HEIGHT,
  },
  environmentUrl: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    lineHeight: WORKBENCH_META_LINE_HEIGHT,
  },
  environmentActivitySection: {
    gap: theme.spacing[1],
    marginTop: 0,
    paddingTop: 7,
    borderTopWidth: theme.borderWidth[1],
    borderTopColor: theme.colors.border,
  },
  environmentActivityTitle: {
    marginBottom: theme.spacing[1],
    color: theme.colors.foreground,
    fontWeight: theme.fontWeight.semibold,
  },
  environmentActivityRow: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  environmentActivityDot: {
    width: 6,
    height: 6,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.accent,
  },
  environmentEmptyState: {
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing[3],
  },
  environmentBranchSummaryRow: {
    height: 28,
    minHeight: 28,
    paddingVertical: 0,
    paddingHorizontal: 0,
    borderRadius: theme.borderRadius.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
  },
  environmentBranchSummaryLabel: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.foregroundMuted,
    fontSize: WORKBENCH_META_FONT_SIZE,
    lineHeight: WORKBENCH_ENVIRONMENT_BRANCH_LINE_HEIGHT,
    fontWeight: theme.fontWeight.normal,
  },
  environmentRow: {
    minHeight: 28,
    paddingVertical: 0,
    paddingHorizontal: 0,
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
    fontSize: WORKBENCH_BODY_FONT_SIZE,
    lineHeight: WORKBENCH_BODY_LINE_HEIGHT,
    fontWeight: theme.fontWeight.normal,
  },
  environmentRowTrailing: {
    minWidth: 48,
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  environmentBranchValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  environmentBranchValue: {
    color: theme.colors.foreground,
    fontSize: WORKBENCH_META_FONT_SIZE,
    lineHeight: WORKBENCH_ENVIRONMENT_BRANCH_LINE_HEIGHT,
    fontWeight: theme.fontWeight.semibold,
  },
  environmentInlineDiffStat: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
  },
  environmentInlineDiffAddition: {
    color: theme.colors.palette.green[500],
    fontSize: theme.fontSize.lg,
    lineHeight: 22,
    fontWeight: theme.fontWeight.bold,
  },
  environmentInlineDiffDeletion: {
    color: theme.colors.palette.red[500],
    fontSize: theme.fontSize.lg,
    lineHeight: 22,
    fontWeight: theme.fontWeight.bold,
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
  environmentSourceSection: {
    display: "none",
  },
  environmentSourceTitle: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    lineHeight: WORKBENCH_META_LINE_HEIGHT,
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

const ENVIRONMENT_ACTIVITY_TITLE_STYLE = [
  styles.environmentSourceTitle,
  styles.environmentActivityTitle,
];
const ENVIRONMENT_SOURCE_SECTION_STYLE = [
  styles.environmentSection,
  styles.environmentSourceSection,
];
