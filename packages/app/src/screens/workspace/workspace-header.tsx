import { useCallback, useMemo } from "react";
import { Text, View } from "react-native";
import {
  Copy,
  Ellipsis,
  EllipsisVertical,
  Globe,
  Import as ImportIcon,
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
import { WorkspaceScriptsButton } from "@/screens/workspace/workspace-scripts-button";
import { WorkspaceTabPresentationResolver } from "@/screens/workspace/workspace-tab-presentation";
import type { WorkspaceTabDescriptor } from "@/screens/workspace/workspace-tabs-types";
import type { WorkspaceDescriptor } from "@/stores/session-store";
import type { Theme } from "@/styles/theme";
import type { ShortcutKey } from "@/utils/format-shortcut";
import { isAbsolutePath } from "@/utils/path";
import { WORKBENCH_BODY_FONT_SIZE } from "@/constants/layout";
import { isWeb } from "@/constants/platform";

const ThemedCopy = withUnistyles(Copy);
const ThemedEllipsis = withUnistyles(Ellipsis);
const ThemedEllipsisVertical = withUnistyles(EllipsisVertical);
const ThemedGlobe = withUnistyles(Globe);
const ThemedImport = withUnistyles(ImportIcon);
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
const MENU_IMPORT_ICON = <ThemedImport size={16} uniProps={mutedColorMapping} />;
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
  importAgentDisabled: boolean;
  browserContextDockDisabled: boolean;
  onCreateDraftTab: () => void;
  onCreateTerminal: () => void;
  onCreateBrowser: () => void;
  onOpenGitDock: () => void;
  onOpenBrowserContextDock: () => void;
  onOpenImportSheet: () => void;
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
  importAgentDisabled,
  browserContextDockDisabled,
  onCreateDraftTab,
  onCreateTerminal,
  onCreateBrowser,
  onOpenGitDock,
  onOpenBrowserContextDock,
  onOpenImportSheet,
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
        <DropdownMenuItem
          testID="workspace-header-import-agent"
          leading={MENU_IMPORT_ICON}
          disabled={importAgentDisabled}
          description={
            importAgentDisabled ? t("workspace.routeState.importRequiresConnection") : undefined
          }
          tooltip={
            importAgentDisabled ? t("workspace.routeState.importRequiresConnection") : undefined
          }
          onSelect={onOpenImportSheet}
        >
          {t("session.importSession")}
        </DropdownMenuItem>
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
  importAgentDisabled: boolean;
  browserContextDockDisabled: boolean;
  onCreateDraftTab: () => void;
  onCreateTerminal: () => void;
  onCreateBrowser: () => void;
  onOpenGitDock: () => void;
  onOpenBrowserContextDock: () => void;
  onOpenImportSheet: () => void;
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
  importAgentDisabled,
  browserContextDockDisabled,
  onCreateDraftTab,
  onCreateTerminal,
  onCreateBrowser,
  onOpenGitDock,
  onOpenBrowserContextDock,
  onOpenImportSheet,
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
          importAgentDisabled={importAgentDisabled}
          browserContextDockDisabled={browserContextDockDisabled}
          onCreateDraftTab={onCreateDraftTab}
          onCreateTerminal={onCreateTerminal}
          onCreateBrowser={onCreateBrowser}
          onOpenGitDock={onOpenGitDock}
          onOpenBrowserContextDock={onOpenBrowserContextDock}
          onOpenImportSheet={onOpenImportSheet}
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
          <View style={styles.desktopHeaderTabIcon}>
            <Text style={styles.desktopHeaderTabGlyph}>✦</Text>
          </View>
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

  return (
    <View style={styles.headerRight}>
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
  headerTitle: {
    fontSize: {
      xs: theme.fontSize.base,
      md: WORKBENCH_BODY_FONT_SIZE,
    },
    lineHeight: {
      xs: theme.fontSize.base,
      md: WORKBENCH_BODY_FONT_SIZE,
    },
    fontWeight: {
      xs: "400",
      md: "600",
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
  desktopHeaderTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    minWidth: 0,
    flexShrink: 1,
    maxWidth: 360,
  },
  desktopHeaderTabIcon: {
    width: 20,
    height: 20,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    backgroundColor: theme.colors.accent,
    ...(isWeb
      ? ({
          backgroundImage: `linear-gradient(135deg, ${theme.colors.accent}, ${theme.colors.accentNeon})`,
        } as object)
      : {}),
  },
  desktopHeaderTabGlyph: {
    color: theme.colors.palette.white,
    fontSize: 12,
    lineHeight: 12,
  },
  headerProjectTitle: {
    color: theme.colors.foregroundMuted,
    fontSize: {
      xs: theme.fontSize.sm,
      md: theme.fontSize.base,
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
    backgroundColor: theme.colors.surface3,
    opacity: 0.25,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  headerActionButton: {
    width: 28,
    height: 28,
    padding: 0,
    borderRadius: 6,
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
  compactHeaderActionButton: {
    width: theme.spacing[8],
    height: theme.spacing[8],
    padding: 0,
    borderRadius: theme.borderRadius.xl,
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
}));
