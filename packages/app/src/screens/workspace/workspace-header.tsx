import { useCallback, useMemo } from "react";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import {
  ChevronDown,
  Copy,
  Ellipsis,
  EllipsisVertical,
  Globe,
  ListTree,
  PanelRight,
  Settings,
  SquarePen,
  SquareTerminal,
} from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";

import { BranchSwitcher } from "@/components/branch-switcher";
import { HeaderToggleButton } from "@/components/headers/header-toggle-button";
import { SourceControlPanelIcon } from "@/components/icons/source-control-panel-icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  TitlebarDragRegion,
  TITLEBAR_NO_DRAG_VIEW_STYLE,
} from "@/components/desktop/titlebar-drag-region";
import { WorkspaceScriptsButton } from "@/screens/workspace/workspace-scripts-button";
import { WorkspaceTabPresentationResolver } from "@/screens/workspace/workspace-tab-presentation";
import type { WorkspaceTabDescriptor } from "@/screens/workspace/workspace-tabs-types";
import type { WorkspaceDescriptor } from "@/stores/session-store";
import type { Theme } from "@/styles/theme";
import type { ShortcutKey } from "@/utils/format-shortcut";
import { isAbsolutePath } from "@/utils/path";
import { DESKTOP_WINDOW_CONTROLS_WIDTH } from "@/constants/layout";
import { getIsElectron, isWeb } from "@/constants/platform";

const ThemedCopy = withUnistyles(Copy);
const ThemedEllipsis = withUnistyles(Ellipsis);
const ThemedEllipsisVertical = withUnistyles(EllipsisVertical);
const ThemedGlobe = withUnistyles(Globe);
const ThemedListTree = withUnistyles(ListTree);
const ThemedPanelRight = withUnistyles(PanelRight);
const ThemedSettings = withUnistyles(Settings);
const ThemedSquarePen = withUnistyles(SquarePen);
const ThemedSquareTerminal = withUnistyles(SquareTerminal);
const ThemedSourceControlPanelIcon = withUnistyles(SourceControlPanelIcon);

const foregroundColorMapping = (theme: Theme) => ({ color: theme.colors.foreground });
const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const sourceControlPanelStrokeWidth15 = { strokeWidth: 1.5 };

const MENU_NEW_AGENT_ICON = <ThemedSquarePen size={16} uniProps={mutedColorMapping} />;
const MENU_NEW_TERMINAL_ICON = <ThemedSquareTerminal size={16} uniProps={mutedColorMapping} />;
const MENU_NEW_BROWSER_ICON = <ThemedGlobe size={16} uniProps={mutedColorMapping} />;
const MENU_COPY_ICON = <ThemedCopy size={16} uniProps={mutedColorMapping} />;
const MENU_SETTINGS_ICON = <ThemedSettings size={16} uniProps={mutedColorMapping} />;
const MENU_GIT_DOCK_ICON = <ThemedSourceControlPanelIcon size={16} uniProps={mutedColorMapping} />;
const MENU_BROWSER_CONTEXT_ICON = <ThemedGlobe size={16} uniProps={mutedColorMapping} />;

const EXPLORER_TOGGLE_KEYS: ShortcutKey[] = ["mod", "E"];
const ENVIRONMENT_TOGGLE_KEYS: ShortcutKey[] = [];

interface WorkspaceHeaderMenuProps {
  normalizedWorkspaceId: string;
  currentBranchName: string | null;
  showWorkspaceSetup: boolean;
  showCreateBrowserTab: boolean;
  isMobile: boolean;
  createTerminalDisabled: boolean;
  browserContextDockDisabled: boolean;
  onCreateDraftTab: () => void;
  onCreateTerminal: () => void;
  onCreateBrowser: () => void;
  onOpenGitDock: () => void;
  onOpenBrowserContextDock: () => void;
  onCopyWorkspacePath: () => void;
  onCopyBranchName: () => void;
  onOpenSetupTab: () => void;
}

function WorkspaceHeaderMenuTriggerIcon({
  hovered,
  open,
  isMobile,
}: {
  hovered: boolean;
  open: boolean;
  isMobile: boolean;
}) {
  const Icon = isMobile ? ThemedEllipsisVertical : ThemedEllipsis;
  const colorMapping = hovered || open ? foregroundColorMapping : mutedColorMapping;
  return <Icon size={16} uniProps={colorMapping} />;
}

function WorkspaceHeaderMenu({
  normalizedWorkspaceId,
  currentBranchName,
  showWorkspaceSetup,
  showCreateBrowserTab,
  isMobile,
  createTerminalDisabled,
  browserContextDockDisabled,
  onCreateDraftTab,
  onCreateTerminal,
  onCreateBrowser,
  onOpenGitDock,
  onOpenBrowserContextDock,
  onCopyWorkspacePath,
  onCopyBranchName,
  onOpenSetupTab,
}: WorkspaceHeaderMenuProps) {
  const { t } = useTranslation();
  const renderTriggerIcon = useCallback(
    ({ hovered, open }: { hovered: boolean; open: boolean }) => (
      <WorkspaceHeaderMenuTriggerIcon hovered={hovered} open={open} isMobile={isMobile} />
    ),
    [isMobile],
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        testID="workspace-header-menu-trigger"
        style={isMobile ? styles.compactHeaderActionButton : styles.headerActionButton}
        accessibilityRole="button"
        accessibilityLabel={t("workspace.actions")}
      >
        {renderTriggerIcon}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" width={220} testID="workspace-header-menu">
        <DropdownMenuItem
          testID="workspace-header-new-agent"
          leading={MENU_NEW_AGENT_ICON}
          onSelect={onCreateDraftTab}
        >
          {t("workspace.newAgent")}
        </DropdownMenuItem>
        <DropdownMenuItem
          testID="workspace-header-new-terminal"
          leading={MENU_NEW_TERMINAL_ICON}
          disabled={createTerminalDisabled}
          description={
            createTerminalDisabled ? t("workspace.routeState.creatingTerminal") : undefined
          }
          tooltip={createTerminalDisabled ? t("workspace.routeState.creatingTerminal") : undefined}
          onSelect={onCreateTerminal}
        >
          {t("workspace.newTerminal")}
        </DropdownMenuItem>
        {showCreateBrowserTab ? (
          <DropdownMenuItem
            testID="workspace-header-new-browser"
            leading={MENU_NEW_BROWSER_ICON}
            onSelect={onCreateBrowser}
          >
            {t("workspace.newBrowserTab")}
          </DropdownMenuItem>
        ) : null}
        {!isMobile ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              testID="workspace-header-open-git-dock"
              leading={MENU_GIT_DOCK_ICON}
              onSelect={onOpenGitDock}
            >
              {t("workspace.openGitDock")}
            </DropdownMenuItem>
            <DropdownMenuItem
              testID="workspace-header-open-browser-context-dock"
              leading={MENU_BROWSER_CONTEXT_ICON}
              disabled={browserContextDockDisabled}
              description={
                browserContextDockDisabled ? t("workspace.noBrowserContextDock") : undefined
              }
              tooltip={browserContextDockDisabled ? t("workspace.noBrowserContextDock") : undefined}
              onSelect={onOpenBrowserContextDock}
            >
              {t("workspace.openBrowserContextDock")}
            </DropdownMenuItem>
          </>
        ) : null}
        {/* Import session lives on Soft Home draft only — hide on active conversation chrome. */}
        <DropdownMenuItem
          testID="workspace-header-copy-path"
          leading={MENU_COPY_ICON}
          disabled={!isAbsolutePath(normalizedWorkspaceId)}
          description={
            !isAbsolutePath(normalizedWorkspaceId)
              ? t("workspace.screen.workspacePathUnavailable")
              : undefined
          }
          tooltip={
            !isAbsolutePath(normalizedWorkspaceId)
              ? t("workspace.screen.workspacePathUnavailable")
              : undefined
          }
          onSelect={onCopyWorkspacePath}
        >
          {t("workspace.screen.copyWorkspacePath")}
        </DropdownMenuItem>
        {currentBranchName ? (
          <DropdownMenuItem
            testID="workspace-header-copy-branch-name"
            leading={MENU_COPY_ICON}
            onSelect={onCopyBranchName}
          >
            {t("workspace.screen.copyBranchName")}
          </DropdownMenuItem>
        ) : null}
        {showWorkspaceSetup ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              testID="workspace-header-show-setup"
              leading={MENU_SETTINGS_ICON}
              onSelect={onOpenSetupTab}
            >
              {t("workspace.screen.showSetup")}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface WorkspaceHeaderTitleBarProps {
  isLoading: boolean;
  title: string;
  subtitle: string;
  showSubtitle: boolean;
  activeTab: WorkspaceTabDescriptor | null;
  currentBranchName: string | null;
  isGitCheckout: boolean;
  normalizedServerId: string;
  normalizedWorkspaceId: string;
  workspaceScripts: WorkspaceDescriptor["scripts"];
  liveTerminalIds: string[];
  showWorkspaceSetup: boolean;
  showCreateBrowserTab: boolean;
  isMobile: boolean;
  createTerminalDisabled: boolean;
  browserContextDockDisabled: boolean;
  onCreateDraftTab: () => void;
  onCreateTerminal: () => void;
  onCreateBrowser: () => void;
  onOpenGitDock: () => void;
  onOpenBrowserContextDock: () => void;
  onCopyWorkspacePath: () => void;
  onCopyBranchName: () => void;
  onOpenSetupTab: () => void;
  onScriptTerminalStarted: (terminalId: string) => void;
  onViewScriptTerminal: (terminalId: string) => void;
  onOpenUrlInBrowserTab: (url: string) => void;
}

/**
 * Renders the workspace title, action menu, and optional mobile script control.
 * @param props Workspace title state and command callbacks
 * @returns The responsive workspace header title bar
 */
export function WorkspaceHeaderTitleBar({
  isLoading,
  title,
  subtitle,
  showSubtitle,
  activeTab,
  currentBranchName,
  isGitCheckout,
  normalizedServerId,
  normalizedWorkspaceId,
  workspaceScripts,
  liveTerminalIds,
  showWorkspaceSetup,
  showCreateBrowserTab,
  isMobile,
  createTerminalDisabled,
  browserContextDockDisabled,
  onCreateDraftTab,
  onCreateTerminal,
  onCreateBrowser,
  onOpenGitDock,
  onOpenBrowserContextDock,
  onCopyWorkspacePath,
  onCopyBranchName,
  onOpenSetupTab,
  onScriptTerminalStarted,
  onViewScriptTerminal,
  onOpenUrlInBrowserTab,
}: WorkspaceHeaderTitleBarProps) {
  return (
    <View style={styles.headerTitleContainer}>
      {isLoading ? (
        <View style={styles.headerTitleTextGroup}>
          <View style={styles.headerTitleSkeleton} />
        </View>
      ) : (
        <View style={styles.headerTitleTextGroup}>
          {isMobile ? (
            <BranchSwitcher
              currentBranchName={currentBranchName}
              title={title}
              serverId={normalizedServerId}
              workspaceId={normalizedWorkspaceId}
              isGitCheckout={isGitCheckout}
            />
          ) : (
            <DesktopWorkspaceHeaderTitle
              activeTab={activeTab}
              fallbackTitle={title}
              serverId={normalizedServerId}
              workspaceId={normalizedWorkspaceId}
            />
          )}
          {isMobile && showSubtitle ? (
            <Text
              testID="workspace-header-subtitle"
              style={styles.headerProjectTitle}
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
      )}
      <View style={styles.compactHeaderMenuCluster}>
        <WorkspaceHeaderMenu
          normalizedWorkspaceId={normalizedWorkspaceId}
          currentBranchName={currentBranchName}
          showWorkspaceSetup={showWorkspaceSetup}
          showCreateBrowserTab={showCreateBrowserTab}
          isMobile={isMobile}
          createTerminalDisabled={createTerminalDisabled}
          browserContextDockDisabled={browserContextDockDisabled}
          onCreateDraftTab={onCreateDraftTab}
          onCreateTerminal={onCreateTerminal}
          onCreateBrowser={onCreateBrowser}
          onOpenGitDock={onOpenGitDock}
          onOpenBrowserContextDock={onOpenBrowserContextDock}
          onCopyWorkspacePath={onCopyWorkspacePath}
          onCopyBranchName={onCopyBranchName}
          onOpenSetupTab={onOpenSetupTab}
        />
        {isMobile && workspaceScripts.length > 0 ? (
          <WorkspaceScriptsButton
            serverId={normalizedServerId}
            workspaceId={normalizedWorkspaceId}
            scripts={workspaceScripts}
            liveTerminalIds={liveTerminalIds}
            onScriptTerminalStarted={onScriptTerminalStarted}
            onViewTerminal={onViewScriptTerminal}
            onOpenUrlInBrowserTab={onOpenUrlInBrowserTab}
            hideLabels
            presentation="ghost"
          />
        ) : null}
      </View>
    </View>
  );
}

function DesktopWorkspaceHeaderTitle({
  activeTab,
  fallbackTitle,
  serverId,
  workspaceId,
}: {
  activeTab: WorkspaceTabDescriptor | null;
  fallbackTitle: string;
  serverId: string;
  workspaceId: string;
}) {
  const { t } = useTranslation();

  if (!activeTab) {
    return (
      <View style={styles.desktopHeaderTitleRow}>
        <Text testID="workspace-header-title" style={styles.headerTitle} numberOfLines={1}>
          {fallbackTitle}
        </Text>
      </View>
    );
  }

  return (
    <WorkspaceTabPresentationResolver tab={activeTab} serverId={serverId} workspaceId={workspaceId}>
      {(presentation) => (
        <View style={styles.desktopHeaderTitleRow}>
          <Text testID="workspace-header-title" style={styles.headerTitle} numberOfLines={1}>
            {presentation.titleState === "loading"
              ? t("workspace.screen.loading")
              : presentation.label}
          </Text>
        </View>
      )}
    </WorkspaceTabPresentationResolver>
  );
}

/**
 * Soft `.ctx` workspace label: project short name only (design "ChisaCode").
 * Never fall back to a label that equals the branch (avoids master/master twin pills
 * when workspace.name is a worktree/branch folder).
 */
function resolveSoftWorkspaceCtxLabel(
  workspaceName: string,
  projectDisplayName: string,
  branchName: string | null,
): string {
  const project = projectDisplayName.trim();
  if (project.length > 0) {
    const slash = Math.max(project.lastIndexOf("/"), project.lastIndexOf("\\"));
    return slash >= 0 ? project.slice(slash + 1) : project;
  }
  const name = workspaceName.trim();
  const branch = branchName?.trim() ?? "";
  if (
    name.length > 0 &&
    branch.length > 0 &&
    name.toLocaleLowerCase() === branch.toLocaleLowerCase()
  ) {
    return "";
  }
  return name;
}

function SoftContextPill({
  label,
  testID,
  accessibilityLabel,
  onPress,
}: {
  label: string;
  testID: string;
  accessibilityLabel: string;
  onPress?: () => void;
}) {
  const triggerStyle = useCallback(
    ({ hovered = false, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.softContextPill,
      (Boolean(hovered) || pressed) && styles.softContextPillHovered,
    ],
    [],
  );

  // Conversation shell: working directory is display-only (no chevron / no picker).
  if (!onPress) {
    return (
      <View testID={testID} accessibilityLabel={accessibilityLabel} style={styles.softContextPill}>
        <Text style={styles.softContextPillText} numberOfLines={1}>
          {label}
        </Text>
      </View>
    );
  }

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={triggerStyle}
    >
      <Text style={styles.softContextPillText} numberOfLines={1}>
        {label}
      </Text>
      <ChevronDown size={12} color="#6f7686" />
    </Pressable>
  );
}

/**
 * Soft Workbench desktop topbar: session title + tools.
 * Conversation tabs also show workspace/branch ctx pills (right cluster).
 * Draft Soft Home keeps path/branch above the composer instead.
 * Matches design `.topbar` (height 48, title left, ctx + tools right cluster).
 */
export function WorkspaceDesktopSoftTopbar({
  isLoading,
  title,
  subtitle,
  showSubtitle: _showSubtitle,
  activeTab,
  currentBranchName,
  isGitCheckout,
  normalizedServerId,
  normalizedWorkspaceId,
  showWorkspaceSetup,
  showCreateBrowserTab,
  createTerminalDisabled,
  browserContextDockDisabled,
  isExplorerOpen,
  canToggleExplorer,
  isEnvironmentPanelVisible,
  canShowEnvironmentPanel,
  explorerToggleAccessibilityState,
  onToggleExplorer,
  onToggleEnvironmentPanel,
  onCreateDraftTab,
  onCreateTerminal,
  onCreateBrowser,
  onOpenGitDock,
  onOpenBrowserContextDock,
  onCopyWorkspacePath,
  onCopyBranchName,
  onOpenSetupTab,
}: {
  isLoading: boolean;
  title: string;
  subtitle: string;
  showSubtitle: boolean;
  activeTab: WorkspaceTabDescriptor | null;
  currentBranchName: string | null;
  isGitCheckout: boolean;
  normalizedServerId: string;
  normalizedWorkspaceId: string;
  showWorkspaceSetup: boolean;
  showCreateBrowserTab: boolean;
  createTerminalDisabled: boolean;
  browserContextDockDisabled: boolean;
  isExplorerOpen: boolean;
  canToggleExplorer: boolean;
  isEnvironmentPanelVisible: boolean;
  canShowEnvironmentPanel: boolean;
  explorerToggleAccessibilityState: { expanded: boolean };
  onToggleExplorer: () => void;
  onToggleEnvironmentPanel: () => void;
  onCreateDraftTab: () => void;
  onCreateTerminal: () => void;
  onCreateBrowser: () => void;
  onOpenGitDock: () => void;
  onOpenBrowserContextDock: () => void;
  onCopyWorkspacePath: () => void;
  onCopyBranchName: () => void;
  onOpenSetupTab: () => void;
}) {
  const { t } = useTranslation();
  // Soft .ctx workspace: project short name only (not workspace/branch folder name).
  // Conversation: directory is read-only display; branch remains switchable.
  const workspaceCtxLabel = resolveSoftWorkspaceCtxLabel(title, subtitle, currentBranchName);
  const branchCtxLabel = currentBranchName;

  // Draft Soft Home: directory + branch live above the composer, not in the topbar.
  // Only conversation (and other non-draft tabs) move path/branch to the top cluster.
  // Wait for an active tab so draft entry does not flash top ctx pills while loading.
  const showSoftCtxPills = activeTab != null && activeTab.kind !== "draft";
  const titleFallback = title.trim().length > 0 ? title : "";
  const showWorkspacePill = showSoftCtxPills && workspaceCtxLabel.length > 0;
  const showBranchPill = showSoftCtxPills && isGitCheckout && Boolean(branchCtxLabel);
  // Native caption buttons overlay the right of this 48px row (no separate white titlebar).
  const softTopbarStyle = useMemo(
    () =>
      getIsElectron() ? [styles.softTopbar, SOFT_TOPBAR_ELECTRON_RIGHT_PAD] : styles.softTopbar,
    [],
  );

  return (
    <View style={softTopbarStyle} testID="workspace-desktop-soft-topbar">
      {/* Soft topbar owns window drag when the desktop tab strip is hidden. */}
      <TitlebarDragRegion />
      <View style={styles.softTopbarTitleCluster}>
        {isLoading && !activeTab && titleFallback.length === 0 ? (
          <View style={styles.headerTitleSkeleton} />
        ) : (
          <DesktopWorkspaceHeaderTitle
            activeTab={activeTab}
            fallbackTitle={titleFallback}
            serverId={normalizedServerId}
            workspaceId={normalizedWorkspaceId}
          />
        )}
      </View>

      <View style={SOFT_TOPBAR_RIGHT_CLUSTER_STYLE}>
        <View style={styles.softCtxCluster}>
          {showWorkspacePill ? (
            <SoftContextPill
              testID="workspace-header-workspace-ctx"
              label={workspaceCtxLabel}
              accessibilityLabel={t("workspace.title")}
            />
          ) : null}
          {showBranchPill ? (
            <BranchSwitcher
              currentBranchName={currentBranchName}
              title={branchCtxLabel ?? ""}
              serverId={normalizedServerId}
              workspaceId={normalizedWorkspaceId}
              isGitCheckout={isGitCheckout}
              presentation="soft-pill"
            />
          ) : null}
        </View>

        <View style={SOFT_TOP_TOOLS_STYLE}>
          <WorkspaceHeaderRightControls
            isMobile={false}
            isGitCheckout={isGitCheckout}
            isExplorerOpen={isExplorerOpen}
            canToggleExplorer={canToggleExplorer}
            isEnvironmentPanelVisible={isEnvironmentPanelVisible}
            canShowEnvironmentPanel={canShowEnvironmentPanel}
            explorerToggleAccessibilityState={explorerToggleAccessibilityState}
            onToggleExplorer={onToggleExplorer}
            onToggleEnvironmentPanel={onToggleEnvironmentPanel}
          />
          <WorkspaceHeaderMenu
            normalizedWorkspaceId={normalizedWorkspaceId}
            currentBranchName={currentBranchName}
            showWorkspaceSetup={showWorkspaceSetup}
            showCreateBrowserTab={showCreateBrowserTab}
            isMobile={false}
            createTerminalDisabled={createTerminalDisabled}
            browserContextDockDisabled={browserContextDockDisabled}
            onCreateDraftTab={onCreateDraftTab}
            onCreateTerminal={onCreateTerminal}
            onCreateBrowser={onCreateBrowser}
            onOpenGitDock={onOpenGitDock}
            onOpenBrowserContextDock={onOpenBrowserContextDock}
            onCopyWorkspacePath={onCopyWorkspacePath}
            onCopyBranchName={onCopyBranchName}
            onOpenSetupTab={onOpenSetupTab}
          />
        </View>
      </View>
    </View>
  );
}

/**
 * Renders explorer and environment-panel header toggles for the active form factor.
 * @param props Toggle visibility, availability, and callbacks
 * @returns The workspace header action controls
 */
export function WorkspaceHeaderRightControls({
  isMobile,
  isGitCheckout,
  isExplorerOpen,
  canToggleExplorer,
  isEnvironmentPanelVisible,
  canShowEnvironmentPanel,
  explorerToggleAccessibilityState,
  onToggleExplorer,
  onToggleEnvironmentPanel,
}: {
  isMobile: boolean;
  isGitCheckout: boolean;
  isExplorerOpen: boolean;
  canToggleExplorer: boolean;
  isEnvironmentPanelVisible: boolean;
  canShowEnvironmentPanel: boolean;
  explorerToggleAccessibilityState: { expanded: boolean };
  onToggleExplorer: () => void;
  onToggleEnvironmentPanel: () => void;
}) {
  const { t } = useTranslation();
  const environmentToggleAccessibilityState = useMemo(
    () => ({ expanded: isEnvironmentPanelVisible }),
    [isEnvironmentPanelVisible],
  );
  const environmentToggleLabel = isEnvironmentPanelVisible
    ? t("workspace.environment.hideFloatingPanel")
    : t("workspace.environment.showFloatingPanel");

  const explorerButton = (
    <HeaderToggleButton
      testID="workspace-explorer-toggle"
      onPress={onToggleExplorer}
      tooltipLabel={t("workspace.screen.toggleExplorer")}
      tooltipKeys={EXPLORER_TOGGLE_KEYS}
      tooltipSide="left"
      style={styles.headerActionButton}
      disabled={!canToggleExplorer}
      accessible
      accessibilityRole="button"
      accessibilityLabel={
        isExplorerOpen ? t("workspace.screen.closeExplorer") : t("workspace.screen.openExplorer")
      }
      accessibilityState={explorerToggleAccessibilityState}
    >
      {({ hovered }) => {
        const colorMapping = isExplorerOpen || hovered ? foregroundColorMapping : mutedColorMapping;
        return isGitCheckout ? (
          <ThemedSourceControlPanelIcon
            size={16}
            uniProps={colorMapping}
            {...sourceControlPanelStrokeWidth15}
          />
        ) : (
          <ThemedPanelRight size={16} uniProps={colorMapping} />
        );
      }}
    </HeaderToggleButton>
  );

  if (isMobile) {
    return <View style={styles.headerRight}>{explorerButton}</View>;
  }

  // Soft .top-tools: explorer + environment (file tree / env panel), then more menu outside.
  return (
    <View style={styles.headerRight}>
      {explorerButton}
      <HeaderToggleButton
        testID="workspace-environment-toggle"
        onPress={onToggleEnvironmentPanel}
        tooltipLabel={environmentToggleLabel}
        tooltipKeys={ENVIRONMENT_TOGGLE_KEYS}
        tooltipSide="left"
        style={styles.headerActionButton}
        disabled={!canShowEnvironmentPanel}
        accessible
        accessibilityRole="button"
        accessibilityLabel={environmentToggleLabel}
        accessibilityState={environmentToggleAccessibilityState}
      >
        {({ hovered }) => {
          const colorMapping =
            isEnvironmentPanelVisible || hovered ? foregroundColorMapping : mutedColorMapping;
          return <ThemedListTree size={16} uniProps={colorMapping} />;
        }}
      </HeaderToggleButton>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  // Soft .topbar .title: 13.5 medium; compact keeps 14.5 readable.
  headerTitle: {
    fontSize: {
      xs: 14.5,
      md: 13.5,
    },
    lineHeight: {
      xs: 20,
      md: 18,
    },
    fontWeight: {
      xs: "500",
      md: "500",
    },
    color: theme.colors.foreground,
    flexShrink: 1,
  },
  headerTitleContainer: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: {
      xs: theme.spacing[1],
      md: theme.spacing[2],
    },
    overflow: "hidden",
  },
  headerTitleTextGroup: {
    minWidth: 0,
    overflow: "hidden",
    flexShrink: 1,
    flexGrow: {
      xs: 1,
      md: 0,
    },
    flexDirection: {
      xs: "column",
      md: "row",
    },
    alignItems: {
      xs: "flex-start",
      md: "center",
    },
    justifyContent: "flex-start",
    gap: {
      xs: 0,
      md: theme.spacing[2],
    },
  },
  // Soft .topbar .title: plain session label, no icon chip, flex fills remaining space.
  desktopHeaderTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    minWidth: 0,
    flex: 1,
    flexShrink: 1,
  },
  headerProjectTitle: {
    color: theme.colors.foregroundMuted,
    // Soft topbar project label: 13 compact / 14.5 desktop.
    fontSize: {
      xs: 13,
      md: 14.5,
    },
    lineHeight: {
      xs: 18,
      md: 20,
    },
    flexShrink: 1,
    minWidth: 0,
    maxWidth: "60%",
  },
  headerTitleSkeleton: {
    width: 220,
    maxWidth: "100%",
    height: 22,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surfaceWorkspace,
    opacity: 0.45,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  // Soft .top-tools .icon-btn: 32 r10.
  headerActionButton: {
    width: 32,
    height: 32,
    padding: 0,
    borderRadius: 10,
    borderWidth: 0,
    borderColor: "transparent",
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    ...(isWeb
      ? { boxShadow: "none" as const }
      : {
          shadowOpacity: 0,
          elevation: 0,
        }),
  },
  // Soft compact header action: quiet r10 pill (32 family).
  compactHeaderActionButton: {
    width: theme.spacing[8],
    height: theme.spacing[8],
    padding: 0,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  compactHeaderMenuCluster: {
    marginLeft: {
      xs: 0,
      md: "auto",
    },
    flexDirection: "row",
    alignItems: "center",
    gap: {
      xs: 0,
      md: theme.spacing[2],
    },
  },
  // Soft .topbar: 48h, pad 0 12 0 16, title left, ctx+tools right.
  softTopbar: {
    position: "relative",
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: 16,
    paddingRight: 12,
    borderBottomWidth: theme.borderWidth[1],
    // design --border-soft
    borderBottomColor: theme.colors.surface2,
    backgroundColor: theme.colors.surfaceWorkspace,
    width: "100%",
    minWidth: 0,
    zIndex: 30,
  },
  softTopbarTitleCluster: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    marginRight: 6,
  },
  softTopbarRightCluster: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  softCtxCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
    minWidth: 0,
  },
  // Soft .ctx: h30 pill, border, surface, 12px, max-width 130.
  softContextPill: {
    height: 30,
    maxWidth: 130,
    paddingHorizontal: 10,
    borderRadius: theme.borderRadius.full,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 1,
    minWidth: 0,
  },
  softContextPillHovered: {
    backgroundColor: theme.colors.surface1,
  },
  softContextPillText: {
    // design --text-2
    color: theme.colors.foregroundSubtleText,
    fontSize: 12,
    lineHeight: 16,
    flexShrink: 1,
    minWidth: 0,
  },
  softTopTools: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    flexShrink: 0,
  },
}));

const SOFT_TOPBAR_RIGHT_CLUSTER_STYLE = [
  styles.softTopbarRightCluster,
  TITLEBAR_NO_DRAG_VIEW_STYLE,
];
const SOFT_TOP_TOOLS_STYLE = [styles.softTopTools, TITLEBAR_NO_DRAG_VIEW_STYLE];
const SOFT_TOPBAR_ELECTRON_RIGHT_PAD = {
  paddingRight: 12 + DESKTOP_WINDOW_CONTROLS_WIDTH,
} as const;
