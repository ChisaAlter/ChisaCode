import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { useIsFocused } from "@react-navigation/native";
import {
  ActivityIndicator,
  BackHandler,
  type LayoutChangeEvent,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useGlobalSearchParams, useRouter, type Href } from "expo-router";
import * as Clipboard from "expo-clipboard";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Ellipsis,
  EllipsisVertical,
  GitBranch,
  GitPullRequest,
  Globe,
  HardDrive,
  Import as ImportIcon,
  Link2,
  ListTodo,
  ListTree,
  PanelRight,
  Settings,
  SquarePen,
  SquareTerminal,
} from "lucide-react-native";
import { GestureDetector } from "react-native-gesture-handler";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import type { Theme } from "@/styles/theme";
import invariant from "tiny-invariant";
import { SidebarMenuToggle } from "@/components/headers/menu-header";
import { ErrorBoundary, SectionErrorFallback } from "@/components/error-boundary";
import { HeaderToggleButton } from "@/components/headers/header-toggle-button";
import { ScreenHeader } from "@/components/headers/screen-header";
import { BranchSwitcher } from "@/components/branch-switcher";
import { Combobox, ComboboxItem, type ComboboxProps } from "@/components/ui/combobox";
import type { ShortcutKey } from "@/utils/format-shortcut";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  FloatingPanelPortalHost,
  FloatingPanelPortalHostNameProvider,
} from "@/components/ui/floating-panel-portal";
import { ExplorerSidebar } from "@/components/explorer-sidebar";
import { SplitContainer } from "@/components/split-container";
import { SourceControlPanelIcon } from "@/components/icons/source-control-panel-icon";
import { useGitActions } from "@/git/use-actions";
import { WorkspaceScriptsButton } from "@/screens/workspace/workspace-scripts-button";
import { ImportSessionSheet } from "@/components/import-session-sheet";
import { ExplorerSidebarAnimationProvider } from "@/contexts/explorer-sidebar-animation-context";
import { useToast } from "@/contexts/toast-context";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { useExplorerOpenGesture } from "@/hooks/use-explorer-open-gesture";
import { selectIsFileExplorerOpen, usePanelStore } from "@/stores/panel-store";
import { type ExplorerCheckoutContext } from "@/stores/explorer-checkout-context";
import { useSessionStore, type Agent, type WorkspaceDescriptor } from "@/stores/session-store";
import { useIsLocalDaemon } from "@/hooks/use-is-local-daemon";
import {
  buildWorkspaceTabPersistenceKey,
  collectAllTabs,
  getFocusedBrowserId,
  type WorkspaceLayout,
  useWorkspaceLayoutStore,
  useWorkspaceLayoutStoreHydrated,
} from "@/stores/workspace-layout-store";
import type { WorkspaceTab, WorkspaceTabTarget } from "@/stores/workspace-tabs-store";
import { normalizeWorkspaceTabTarget, workspaceTabTargetsEqual } from "@/workspace-tabs/identity";
import {
  getHostRuntimeStore,
  useHostRuntimeClient,
  useHostRuntimeIsConnected,
  useHostRuntimeSnapshot,
  useHosts,
} from "@/runtime/host-runtime";
import { useProvidersSnapshot } from "@/hooks/use-providers-snapshot";
import { useWorkspace } from "@/stores/session-store-hooks";
import { useWorkspaceTerminalSessionRetention } from "@/terminal/hooks/use-workspace-terminal-session-retention";
import type { CheckoutStatusPayload } from "@/git/use-status-query";
import { checkoutStatusQueryKey } from "@/git/query-keys";
import { confirmDialog } from "@/utils/confirm-dialog";
import { useStableEvent } from "@/hooks/use-stable-event";
import { createWorkspaceBrowser, useBrowserStore } from "@/stores/browser-store";
import { getDesktopHost } from "@/desktop/host";
import { buildProviderCommand } from "@/utils/provider-command-templates";
import { generateDraftId } from "@/stores/draft-keys";
import {
  getWorkspaceExecutionAuthority,
  resolveWorkspaceRouteId,
  type WorkspaceExecutionAuthorityResult,
} from "@/utils/workspace-execution";
import {
  WorkspaceTabPresentationResolver,
  WorkspaceTabIcon,
} from "@/screens/workspace/workspace-tab-presentation";
import {
  useWorkspaceTabRename,
  WorkspaceTabRenameModal,
} from "@/screens/workspace/use-workspace-tab-rename";
import { useWorkspaceKeyboardActions } from "@/screens/workspace/use-workspace-keyboard-actions";
import { useWorkspacePersistenceHydration } from "@/screens/workspace/use-workspace-persistence-hydration";
import type { WorkspaceTabDescriptor } from "@/screens/workspace/workspace-tabs-types";
import {
  getFallbackTabOptionDescription,
  getFallbackTabOptionLabel,
  MobileWorkspaceTabSwitcher,
  type WorkspaceTabFallbackLabels,
} from "@/screens/workspace/workspace-mobile-tab-switcher";
import {
  resolveWorkspaceHeaderRenderState,
  type WorkspaceHeaderCheckoutState,
} from "@/screens/workspace/workspace-header-source";
import {
  resolveWorkspaceRouteState,
  type WorkspaceRouteState,
} from "@/screens/workspace/workspace-route-state";
import { useWorkspaceRouteLoadingTimedOut } from "@/screens/workspace/use-workspace-route-loading-timeout";
import { renderWorkspaceRouteGate } from "@/screens/workspace/workspace-route-state-views";
import {
  deriveWorkspaceAgentVisibility,
  workspaceAgentVisibilityEqual,
} from "@/workspace-tabs/agent-visibility";
import {
  deriveWorkspacePaneState,
  resolveSideFileOpenPlacement,
} from "@/screens/workspace/workspace-pane-state";
import {
  buildWorkspacePaneContentModel,
  WorkspacePaneContent,
  type WorkspacePaneContentModel,
} from "@/screens/workspace/workspace-pane-content";
import { useMountedTabSet } from "@/screens/workspace/use-mounted-tab-set";
import { WorkspaceFocusProvider } from "@/workspace/focus";

import {
  buildBulkCloseConfirmationMessage,
  classifyBulkClosableTabs,
  closeBulkWorkspaceTabs,
} from "@/screens/workspace/workspace-bulk-close";
import { closeAgentWorkspaceTabOnly } from "@/screens/workspace/workspace-agent-tab-close";
import { useSubagentsForParent, type SubagentRow } from "@/subagents/select";
import { isAbsolutePath } from "@/utils/path";
import { useIsCompactFormFactor, supportsDesktopPaneSplits } from "@/constants/layout";
import { getIsElectron, isNative, isWeb } from "@/constants/platform";
import { useWindowControlsPadding } from "@/utils/desktop-window";
import {
  buildHostRootRoute,
  buildHostWorkspaceRoute,
  buildSettingsHostRoute,
} from "@/utils/host-routes";
import { canCreateWorkspaceTerminal } from "@/screens/workspace/terminals/state";
import { useWorkspaceTerminals } from "@/screens/workspace/terminals/use-workspace-terminals";
import {
  createWorkspaceFileTabTarget,
  normalizeWorkspaceFileLocation,
  type WorkspaceFileLocation,
  type WorkspaceFileOpenRequest,
} from "@/workspace/file-open";
import type { TodoEntry, TurnChangesItem } from "@/types/stream";
import {
  buildWorkspaceActivityItems,
  buildWorkspaceStatusStripModel,
  findLatestTodoItems,
  shouldEnableWorkspaceReviewArchiveAction,
  type WorkspaceActivityItem,
} from "@/screens/workspace/workspace-environment-panel-model";
import { resolveWorkspaceScreenOpenIntentAction } from "@/screens/workspace/workspace-open-intent";
import { WorkspaceEnvironmentGitPopover } from "@/screens/workspace/workspace-environment-git-popover";
import {
  buildBrowserContextSummary,
  findLatestTurnChanges,
  resolveDockStateAfterAction,
  resolveWorkspacePaneCommand,
  type BrowserContextSummary,
  type WorkspacePaneCommand,
  type WorkspaceEnvironmentDockState,
  type WorkspaceEnvironmentDockTab,
} from "@/screens/workspace/workspace-environment-dock-model";

const WORKSPACE_FLOATING_PANEL_PORTAL_HOST_PREFIX = "workspace-floating-panels";
const EMPTY_UI_TABS: WorkspaceTab[] = [];
const EMPTY_WORKSPACE_SCRIPTS: WorkspaceDescriptor["scripts"] = [];
const EMPTY_PINNED_AGENT_IDS = new Set<string>();
const EMPTY_SET = new Set<string>();
const COMPACT_WEB_GESTURE_TOUCH_ACTION = isWeb ? "auto" : "pan-y";
const EMPTY_GIT_ACTION_ICON = <View />;
const REVIEW_CALLOUT_GIT_ACTION_ICONS = {
  commit: EMPTY_GIT_ACTION_ICON,
  pull: EMPTY_GIT_ACTION_ICON,
  push: EMPTY_GIT_ACTION_ICON,
  pullAndPush: EMPTY_GIT_ACTION_ICON,
  viewPr: EMPTY_GIT_ACTION_ICON,
  createPr: EMPTY_GIT_ACTION_ICON,
  mergePrSquash: EMPTY_GIT_ACTION_ICON,
  mergePrMerge: EMPTY_GIT_ACTION_ICON,
  mergePrRebase: EMPTY_GIT_ACTION_ICON,
  merge: EMPTY_GIT_ACTION_ICON,
  mergeFromBase: EMPTY_GIT_ACTION_ICON,
  archive: EMPTY_GIT_ACTION_ICON,
};

function getWorkspaceScripts(
  workspaceDescriptor: WorkspaceDescriptor | null | undefined,
): WorkspaceDescriptor["scripts"] {
  return workspaceDescriptor?.scripts ?? EMPTY_WORKSPACE_SCRIPTS;
}

const ThemedActivityIndicator = withUnistyles(ActivityIndicator);
const ThemedEllipsis = withUnistyles(Ellipsis);
const ThemedEllipsisVertical = withUnistyles(EllipsisVertical);
const ThemedChevronDown = withUnistyles(ChevronDown);
const ThemedChevronRight = withUnistyles(ChevronRight);
const ThemedCopy = withUnistyles(Copy);
const ThemedSquarePen = withUnistyles(SquarePen);
const ThemedSquareTerminal = withUnistyles(SquareTerminal);
const ThemedGlobe = withUnistyles(Globe);
const ThemedImport = withUnistyles(ImportIcon);
const ThemedSettings = withUnistyles(Settings);
const ThemedPanelRight = withUnistyles(PanelRight);
const ThemedGitBranch = withUnistyles(GitBranch);
const ThemedGitPullRequest = withUnistyles(GitPullRequest);
const ThemedHardDrive = withUnistyles(HardDrive);
const ThemedLink2 = withUnistyles(Link2);
const ThemedListTodo = withUnistyles(ListTodo);
const ThemedListTree = withUnistyles(ListTree);
const ThemedSourceControlPanelIcon = withUnistyles(SourceControlPanelIcon);

const WORKSPACE_ENVIRONMENT_PANEL_WIDTH = 300;
const WORKSPACE_ENVIRONMENT_PANEL_SAFE_GAP = 44;
const WORKSPACE_ENVIRONMENT_PANEL_MIN_CONTENT_WIDTH = 1008;
const WORKSPACE_FLOATING_PANEL_TOP_OFFSET = 56;

type WorkspaceEnvironmentPanelMode = "auto" | "forced-open" | "forced-closed";

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
const GATED_WORKSPACE_HEADER_LEFT = <SidebarMenuToggle />;

interface WorkspaceScreenProps {
  serverId: string;
  workspaceId: string;
  isRouteFocused?: boolean;
}

type WorkspaceScreenContentProps = WorkspaceScreenProps & {
  isRouteFocused: boolean;
};

function trimNonEmpty(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getSearchParamValue(value: string | string[] | undefined): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (Array.isArray(value)) {
    const firstValue = value[0];
    return typeof firstValue === "string" ? firstValue.trim() : "";
  }
  return "";
}

function stripOpenSearchParamFromBrowserUrl() {
  if (!isWeb || typeof window === "undefined") {
    return;
  }
  const url = new URL(window.location.href);
  if (!url.searchParams.has("open")) {
    return;
  }
  url.searchParams.delete("open");
  window.history.replaceState(null, "", url.toString());
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function useSyncWorkspaceActiveBrowser(input: {
  workspaceLayout: WorkspaceLayout | null;
  isRouteFocused: boolean;
}) {
  const focusedBrowserId = useMemo(
    () => getFocusedBrowserId(input.workspaceLayout),
    [input.workspaceLayout],
  );
  const desktopActiveBrowserId = input.isRouteFocused ? focusedBrowserId : null;

  useEffect(() => {
    if (!getIsElectron()) {
      return;
    }
    void getDesktopHost()?.browser?.setWorkspaceActiveBrowser?.(desktopActiveBrowserId);
  }, [desktopActiveBrowserId]);
}

function useWorkspaceBrowserContextSummary(input: {
  workspaceLayout: WorkspaceLayout | null;
}): BrowserContextSummary | null {
  const focusedBrowserId = useMemo(
    () => getFocusedBrowserId(input.workspaceLayout),
    [input.workspaceLayout],
  );
  const browser = useBrowserStore((state) =>
    focusedBrowserId ? (state.browsersById[focusedBrowserId] ?? null) : null,
  );
  return useMemo(() => buildBrowserContextSummary({ browser }), [browser]);
}

function WorkspaceDocumentTitleEffect({
  label,
  titleState,
}: {
  label: string;
  titleState: "ready" | "loading";
}) {
  const { t } = useTranslation();
  useEffect(() => {
    if (isNative || typeof document === "undefined") {
      return;
    }
    const resolvedLabel = label.trim();
    document.title =
      titleState === "loading"
        ? t("workspace.screen.loading")
        : resolvedLabel || t("workspace.title");
  }, [label, t, titleState]);

  return null;
}

interface MobileMountedTabSlotProps {
  tabDescriptor: WorkspaceTabDescriptor;
  isVisible: boolean;
  isWorkspaceFocused: boolean;
  isPaneFocused: boolean;
  paneId: string | null;
  buildPaneContentModel: (input: {
    paneId: string | null;
    tab: WorkspaceTabDescriptor;
  }) => WorkspacePaneContentModel;
}

const MobileMountedTabSlot = memo(function MobileMountedTabSlot({
  tabDescriptor,
  isVisible,
  isWorkspaceFocused,
  isPaneFocused,
  paneId,
  buildPaneContentModel,
}: MobileMountedTabSlotProps) {
  const content = useMemo(
    () =>
      buildPaneContentModel({
        paneId,
        tab: tabDescriptor,
      }),
    [buildPaneContentModel, paneId, tabDescriptor],
  );

  const slotStyle = isVisible
    ? styles.mobileMountedTabSlotVisible
    : styles.mobileMountedTabSlotHidden;

  return (
    <View style={slotStyle} pointerEvents={isVisible ? "auto" : "none"}>
      <WorkspacePaneContent
        content={content}
        isWorkspaceFocused={isWorkspaceFocused}
        isPaneFocused={isPaneFocused}
      />
    </View>
  );
});

function useStableTabDescriptorMap(tabDescriptors: WorkspaceTabDescriptor[]) {
  const cacheRef = useRef(new Map<string, WorkspaceTabDescriptor>());
  const tabDescriptorMap = useMemo(() => {
    const next = new Map<string, WorkspaceTabDescriptor>();
    for (const tabDescriptor of tabDescriptors) {
      const cachedDescriptor = cacheRef.current.get(tabDescriptor.tabId);
      if (
        cachedDescriptor &&
        cachedDescriptor.key === tabDescriptor.key &&
        cachedDescriptor.kind === tabDescriptor.kind &&
        workspaceTabTargetsEqual(cachedDescriptor.target, tabDescriptor.target)
      ) {
        next.set(tabDescriptor.tabId, cachedDescriptor);
        continue;
      }
      next.set(tabDescriptor.tabId, tabDescriptor);
    }
    return next;
  }, [tabDescriptors]);
  useEffect(() => {
    cacheRef.current = tabDescriptorMap;
  }, [tabDescriptorMap]);

  return tabDescriptorMap;
}

export function WorkspaceScreen({ serverId, workspaceId, isRouteFocused }: WorkspaceScreenProps) {
  const navigationFocused = useIsFocused();
  const effectiveRouteFocused = isRouteFocused ?? navigationFocused;
  const { t: wsT } = useTranslation();

  const renderErrorFallback = useCallback(
    (error: unknown, resetError: () => void) => (
      <SectionErrorFallback
        error={error}
        onReset={resetError}
        sectionLabel={wsT("errors.sectionWorkspace")}
      />
    ),
    [wsT],
  );

  return (
    <ExplorerSidebarAnimationProvider>
      <ErrorBoundary fallback={renderErrorFallback}>
        <WorkspaceScreenContent
          serverId={serverId}
          workspaceId={workspaceId}
          isRouteFocused={effectiveRouteFocused}
        />
      </ErrorBoundary>
    </ExplorerSidebarAnimationProvider>
  );
}

interface UseCloseTabsResult {
  closingTabIds: Set<string>;
  closeTab: (tabId: string, action: () => Promise<void>) => Promise<void>;
}

function useCloseTabs(): UseCloseTabsResult {
  const pendingRef = useRef(new Set<string>());
  const [closingTabIds, setClosingTabIds] = useState<Set<string>>(EMPTY_SET);

  const closeTab = useCallback(async (tabId: string, action: () => Promise<void>) => {
    const normalized = tabId.trim();
    if (!normalized || pendingRef.current.has(normalized)) {
      return;
    }
    pendingRef.current.add(normalized);
    setClosingTabIds(new Set(pendingRef.current));
    try {
      await action();
    } finally {
      pendingRef.current.delete(normalized);
      setClosingTabIds(new Set(pendingRef.current));
    }
  }, []);

  return { closingTabIds, closeTab };
}

interface WorkspaceHeaderMenuProps {
  normalizedWorkspaceId: string;
  currentBranchName: string | null;
  showWorkspaceSetup: boolean;
  showCreateBrowserTab: boolean;
  isMobile: boolean;
  createTerminalDisabled: boolean;
  importAgentDisabled: boolean;
  menuNewAgentIcon: ReactElement;
  menuNewTerminalIcon: ReactElement;
  menuNewBrowserIcon: ReactElement;
  menuImportIcon: ReactElement;
  menuCopyIcon: ReactElement;
  menuSettingsIcon: ReactElement;
  menuGitDockIcon: ReactElement;
  menuBrowserContextIcon: ReactElement;
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
  menuNewAgentIcon,
  menuNewTerminalIcon,
  menuNewBrowserIcon,
  menuImportIcon,
  menuCopyIcon,
  menuSettingsIcon,
  menuGitDockIcon,
  menuBrowserContextIcon,
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
          leading={menuNewAgentIcon}
          onSelect={onCreateDraftTab}
        >
          {t("workspace.newAgent")}
        </DropdownMenuItem>
        <DropdownMenuItem
          testID="workspace-header-new-terminal"
          leading={menuNewTerminalIcon}
          disabled={createTerminalDisabled}
          onSelect={onCreateTerminal}
        >
          {t("workspace.newTerminal")}
        </DropdownMenuItem>
        {showCreateBrowserTab ? (
          <DropdownMenuItem
            testID="workspace-header-new-browser"
            leading={menuNewBrowserIcon}
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
              leading={menuGitDockIcon}
              onSelect={onOpenGitDock}
            >
              {t("workspace.openGitDock")}
            </DropdownMenuItem>
            <DropdownMenuItem
              testID="workspace-header-open-browser-context-dock"
              leading={menuBrowserContextIcon}
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
          leading={menuImportIcon}
          disabled={importAgentDisabled}
          onSelect={onOpenImportSheet}
        >
          {t("session.importSession")}
        </DropdownMenuItem>
        <DropdownMenuItem
          testID="workspace-header-copy-path"
          leading={menuCopyIcon}
          disabled={!isAbsolutePath(normalizedWorkspaceId)}
          onSelect={onCopyWorkspacePath}
        >
          {t("workspace.screen.copyWorkspacePath")}
        </DropdownMenuItem>
        {currentBranchName ? (
          <DropdownMenuItem
            testID="workspace-header-copy-branch-name"
            leading={menuCopyIcon}
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
              leading={menuSettingsIcon}
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
  menuNewAgentIcon: ReactElement;
  menuNewTerminalIcon: ReactElement;
  menuNewBrowserIcon: ReactElement;
  menuImportIcon: ReactElement;
  menuCopyIcon: ReactElement;
  menuSettingsIcon: ReactElement;
  menuGitDockIcon: ReactElement;
  menuBrowserContextIcon: ReactElement;
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

function WorkspaceHeaderTitleBar({
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
  menuNewAgentIcon,
  menuNewTerminalIcon,
  menuNewBrowserIcon,
  menuImportIcon,
  menuCopyIcon,
  menuSettingsIcon,
  menuGitDockIcon,
  menuBrowserContextIcon,
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
          menuNewAgentIcon={menuNewAgentIcon}
          menuNewTerminalIcon={menuNewTerminalIcon}
          menuNewBrowserIcon={menuNewBrowserIcon}
          menuImportIcon={menuImportIcon}
          menuCopyIcon={menuCopyIcon}
          menuSettingsIcon={menuSettingsIcon}
          menuGitDockIcon={menuGitDockIcon}
          menuBrowserContextIcon={menuBrowserContextIcon}
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
          <WorkspaceTabIcon presentation={presentation} active />
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

function WorkspaceHeaderRightControls({
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
            size={20}
            uniProps={colorMapping}
            {...sourceControlPanelStrokeWidth15}
          />
        ) : (
          <ThemedPanelRight size={20} uniProps={colorMapping} />
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
          return <ThemedListTree size={20} uniProps={colorMapping} />;
        }}
      </HeaderToggleButton>
    </View>
  );
}

function WorkspaceEnvironmentPanelRail({
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

function getEnvironmentExplorerTab(checkout: ExplorerCheckoutContext): "changes" | "files" {
  return checkout.isGit ? "changes" : "files";
}

function getWorkspaceEnvironmentSourceLabel(
  workspace: WorkspaceDescriptor | null | undefined,
): string | null {
  const label = workspace?.projectDisplayName ?? workspace?.projectRootPath;
  const normalized = label?.trim();
  return normalized ? normalized : null;
}

function getWorkspaceEnvironmentStatus(
  workspace: WorkspaceDescriptor | null | undefined,
): WorkspaceDescriptor["status"] | null {
  return workspace?.status ?? null;
}

function useEnvironmentPanelAgent(serverId: string, agentId: string | null): Agent | null {
  return useSessionStore((state) => {
    if (!agentId) {
      return null;
    }
    return state.sessions[serverId]?.agents?.get(agentId) ?? null;
  });
}

function useEnvironmentPanelTodoItems(
  serverId: string,
  agentId: string | null,
): TodoEntry[] | null {
  return useSessionStore((state) => {
    if (!agentId) {
      return null;
    }
    const session = state.sessions[serverId];
    return findLatestTodoItems({
      head: session?.agentStreamHead.get(agentId),
      tail: session?.agentStreamTail.get(agentId),
    });
  });
}

function useEnvironmentPanelTurnChanges(
  serverId: string,
  agentId: string | null,
): TurnChangesItem | null {
  return useSessionStore((state) => {
    if (!agentId) {
      return null;
    }
    const session = state.sessions[serverId];
    return findLatestTurnChanges({
      head: session?.agentStreamHead.get(agentId),
      tail: session?.agentStreamTail.get(agentId),
    });
  });
}

function shouldShowWorkspaceEnvironmentRail(input: {
  isMobile: boolean;
  isEnvironmentPanelVisible: boolean;
  workspaceDirectory: string | null;
}): boolean {
  return !input.isMobile && input.isEnvironmentPanelVisible;
}

interface RenderWorkspaceContentInput {
  isMissingWorkspaceExecutionAuthority: boolean;
  activeTabDescriptor: WorkspaceTabDescriptor | null;
  hasHydratedAgents: boolean;
  mountedFocusedPaneTabIds: string[];
  focusedPaneTabDescriptorMap: Map<string, WorkspaceTabDescriptor>;
  isRouteFocused: boolean;
  focusedPaneId: string | null;
  workspaceExecutionMissingText: string;
  noTabsAvailableText: string;
  buildMobilePaneContentModel: (input: {
    paneId: string | null;
    tab: WorkspaceTabDescriptor;
  }) => WorkspacePaneContentModel;
}

function renderWorkspaceContent(input: RenderWorkspaceContentInput): React.ReactNode {
  const {
    isMissingWorkspaceExecutionAuthority,
    activeTabDescriptor,
    hasHydratedAgents,
    mountedFocusedPaneTabIds,
    focusedPaneTabDescriptorMap,
    isRouteFocused,
    focusedPaneId,
    workspaceExecutionMissingText,
    noTabsAvailableText,
    buildMobilePaneContentModel,
  } = input;

  if (isMissingWorkspaceExecutionAuthority) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyStateText}>{workspaceExecutionMissingText}</Text>
      </View>
    );
  }
  if (!activeTabDescriptor && !hasHydratedAgents) {
    return (
      <View style={styles.emptyState}>
        <ThemedActivityIndicator uniProps={mutedColorMapping} />
      </View>
    );
  }
  if (!activeTabDescriptor) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyStateText}>{noTabsAvailableText}</Text>
      </View>
    );
  }
  return mountedFocusedPaneTabIds.map((tabId) => {
    const tabDescriptor = focusedPaneTabDescriptorMap.get(tabId);
    if (!tabDescriptor) {
      return null;
    }
    return (
      <MobileMountedTabSlot
        key={tabId}
        tabDescriptor={tabDescriptor}
        isVisible={isRouteFocused && tabId === activeTabDescriptor.tabId}
        isWorkspaceFocused={isRouteFocused}
        isPaneFocused={tabId === activeTabDescriptor.tabId}
        paneId={focusedPaneId}
        buildPaneContentModel={buildMobilePaneContentModel}
      />
    );
  });
}

interface WorkspaceHeaderFields {
  isWorkspaceHeaderLoading: boolean;
  workspaceHeaderTitle: string;
  workspaceHeaderSubtitle: string;
  shouldShowWorkspaceHeaderSubtitle: boolean;
  isGitCheckout: boolean;
  currentBranchName: string | null;
}

function buildWorkspaceHeaderCheckoutState(input: {
  isCheckoutStatusLoading: boolean;
  isError: boolean;
  data: CheckoutStatusPayload | undefined;
}): WorkspaceHeaderCheckoutState {
  if (input.isCheckoutStatusLoading) {
    return { kind: "pending" };
  }
  if (input.isError || !input.data) {
    return { kind: "error" };
  }
  return {
    kind: "ready",
    checkout: {
      isGit: input.data.isGit,
      currentBranch: input.data.currentBranch,
    },
  };
}

function deriveWorkspaceHeaderFields(input: {
  workspace: WorkspaceDescriptor | null;
  checkoutState: WorkspaceHeaderCheckoutState;
}): WorkspaceHeaderFields {
  const renderState = resolveWorkspaceHeaderRenderState(input);
  if (renderState.kind !== "ready") {
    return {
      isWorkspaceHeaderLoading: true,
      workspaceHeaderTitle: "",
      workspaceHeaderSubtitle: "",
      shouldShowWorkspaceHeaderSubtitle: false,
      isGitCheckout: false,
      currentBranchName: null,
    };
  }
  return {
    isWorkspaceHeaderLoading: false,
    workspaceHeaderTitle: renderState.title,
    workspaceHeaderSubtitle: renderState.subtitle,
    shouldShowWorkspaceHeaderSubtitle: renderState.shouldShowSubtitle,
    isGitCheckout: renderState.isGitCheckout,
    currentBranchName: renderState.currentBranchName,
  };
}

interface WorkspaceAuthorityState {
  workspaceDirectory: string | null;
  isMissingWorkspaceExecutionAuthority: boolean;
}

function resolveWorkspaceAuthorityState(
  workspaceAuthority: WorkspaceExecutionAuthorityResult,
  workspaceDescriptor: WorkspaceDescriptor | null | undefined,
): WorkspaceAuthorityState {
  const authority = workspaceAuthority.ok ? workspaceAuthority.authority : null;
  return {
    workspaceDirectory: authority?.workspaceDirectory ?? null,
    isMissingWorkspaceExecutionAuthority: Boolean(workspaceDescriptor && !authority),
  };
}

function getHostDisplayName(host: { label?: string | null } | null, fallback: string): string {
  const trimmed = host?.label?.trim();
  return trimmed ? trimmed : fallback;
}

function useWorkspaceRouteActions(normalizedServerId: string): {
  handleRetryHost: () => void;
  handleManageHost: () => void;
  handleDismissMissingWorkspace: () => void;
} {
  const router = useRouter();
  const handleRetryHost = useCallback(() => {
    if (!normalizedServerId) {
      return;
    }
    void getHostRuntimeStore().runProbeCycleNow(normalizedServerId);
  }, [normalizedServerId]);
  const handleManageHost = useCallback(() => {
    if (!normalizedServerId) {
      return;
    }
    router.push(buildSettingsHostRoute(normalizedServerId) as Href);
  }, [normalizedServerId, router]);
  const handleDismissMissingWorkspace = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    if (normalizedServerId) {
      router.replace(buildHostRootRoute(normalizedServerId) as Href);
      return;
    }
    router.replace("/" as Href);
  }, [normalizedServerId, router]);

  return {
    handleRetryHost,
    handleManageHost,
    handleDismissMissingWorkspace,
  };
}

function useResolvedWorkspaceRouteState(input: {
  serverId: string;
  workspaceId: string;
  workspace: WorkspaceDescriptor | null;
  hasHydratedWorkspaces: boolean;
}): WorkspaceRouteState {
  const hosts = useHosts();
  const host = useMemo(
    () => hosts.find((entry) => entry.serverId === input.serverId) ?? null,
    [hosts, input.serverId],
  );
  const hostSnapshot = useHostRuntimeSnapshot(input.serverId);
  const connectionStatus = hostSnapshot?.connectionStatus ?? "connecting";
  const workspaceLookupTimedOut = useWorkspaceRouteLoadingTimedOut({
    routeKey: `${input.serverId}:${input.workspaceId}`,
    connectionStatus,
    workspace: input.workspace,
    hasHydratedWorkspaces: input.hasHydratedWorkspaces,
  });
  const hostName = useMemo(() => getHostDisplayName(host, input.serverId), [host, input.serverId]);
  const routeMatchesHostName = useMemo(() => {
    const routeWorkspaceId = input.workspaceId.trim();
    const normalizedHostName = hostName.trim();
    return (
      routeWorkspaceId.length > 0 &&
      normalizedHostName.length > 0 &&
      routeWorkspaceId.toLowerCase() === normalizedHostName.toLowerCase()
    );
  }, [hostName, input.workspaceId]);

  return useMemo(
    () =>
      resolveWorkspaceRouteState({
        hostName,
        connectionStatus,
        lastError: hostSnapshot?.lastError ?? null,
        workspace: input.workspace,
        hasHydratedWorkspaces: input.hasHydratedWorkspaces,
        workspaceLookupTimedOut,
        routeMatchesHostName,
      }),
    [
      hostName,
      connectionStatus,
      hostSnapshot?.lastError,
      input.workspace,
      input.hasHydratedWorkspaces,
      workspaceLookupTimedOut,
      routeMatchesHostName,
    ],
  );
}

function WorkspaceScreenGateFrame({ children }: { children: ReactNode }) {
  return (
    <>
      <ScreenHeader left={GATED_WORKSPACE_HEADER_LEFT} />
      <View style={styles.centerContent}>{children}</View>
    </>
  );
}

function renderWorkspaceScreenGateShell(input: {
  gate: ReactNode;
  workspaceKey: string | null;
}): ReactElement | null {
  if (!input.gate) {
    return null;
  }

  return (
    <WorkspaceFocusProvider workspaceKey={input.workspaceKey}>
      <View style={styles.container}>
        <View style={styles.threePaneRow}>
          <View style={styles.centerColumn}>
            <WorkspaceScreenGateFrame>{input.gate}</WorkspaceScreenGateFrame>
          </View>
        </View>
      </View>
    </WorkspaceFocusProvider>
  );
}

function WorkspaceDocumentTitleEffectSlot({
  tab,
  serverId,
  workspaceId,
  isRouteFocused,
}: {
  tab: WorkspaceTabDescriptor | null;
  serverId: string;
  workspaceId: string;
  isRouteFocused: boolean;
}) {
  if (!isRouteFocused || !isWeb || !tab) {
    return null;
  }

  return (
    <WorkspaceTabPresentationResolver tab={tab} serverId={serverId} workspaceId={workspaceId}>
      {(presentation) => (
        <WorkspaceDocumentTitleEffect
          label={presentation.label}
          titleState={presentation.titleState}
        />
      )}
    </WorkspaceTabPresentationResolver>
  );
}

function shouldShowWorkspaceScreenHeader(input: {
  isFocusModeEnabled: boolean;
  isMobile: boolean;
}): boolean {
  return !input.isFocusModeEnabled || input.isMobile;
}

function shouldShowWorkspaceExplorerSidebar(input: {
  isRouteFocused: boolean;
  isFocusModeEnabled: boolean;
  isMobile: boolean;
}): boolean {
  return input.isRouteFocused && shouldShowWorkspaceScreenHeader(input);
}

function buildWorkspaceTerminalScopeKey(serverId: string, workspaceId: string): string | null {
  if (!serverId || !workspaceId) {
    return null;
  }
  return `${serverId}:${workspaceId}`;
}

interface WorkspaceTerminalTabActionsInput {
  persistenceKey: string | null;
  focusWorkspacePane: (workspaceKey: string, paneId: string) => void;
  openWorkspaceTabFocused: (workspaceKey: string, target: WorkspaceTabTarget) => string | null;
  toast: {
    error: (message: string) => void;
    show: (message: string) => void;
  };
}

interface WorkspaceTerminalTabActions {
  handleTerminalCreated: (input: { terminalId: string; paneId?: string }) => void;
  handleScriptTerminalSelected: (terminalId: string) => void;
  handleWorkspacePathUnavailable: () => void;
  handleTerminalCreateQueued: () => void;
}

function useWorkspaceTerminalTabActions({
  persistenceKey,
  focusWorkspacePane,
  openWorkspaceTabFocused,
  toast,
}: WorkspaceTerminalTabActionsInput): WorkspaceTerminalTabActions {
  const { t } = useTranslation();
  const handleTerminalCreated = useCallback(
    ({ terminalId, paneId }: { terminalId: string; paneId?: string }) => {
      if (!persistenceKey) {
        return;
      }
      if (paneId) {
        focusWorkspacePane(persistenceKey, paneId);
      }
      openWorkspaceTabFocused(persistenceKey, { kind: "terminal", terminalId });
    },
    [focusWorkspacePane, openWorkspaceTabFocused, persistenceKey],
  );
  const handleScriptTerminalSelected = useCallback(
    (terminalId: string) => {
      if (!persistenceKey) {
        return;
      }
      openWorkspaceTabFocused(persistenceKey, { kind: "terminal", terminalId });
    },
    [openWorkspaceTabFocused, persistenceKey],
  );
  const handleWorkspacePathUnavailable = useCallback(() => {
    toast.error(t("workspace.pathUnavailable"));
  }, [toast, t]);
  const handleTerminalCreateQueued = useCallback(() => {
    toast.show(t("workspace.preparingTerminal"));
  }, [toast, t]);

  return {
    handleTerminalCreated,
    handleScriptTerminalSelected,
    handleWorkspacePathUnavailable,
    handleTerminalCreateQueued,
  };
}

function useWorkspaceCheckoutStatus(input: {
  client: ReturnType<typeof useHostRuntimeClient>;
  isConnected: boolean;
  isRouteFocused: boolean;
  normalizedServerId: string;
  normalizedWorkspaceId: string;
  workspaceDirectory: string | null;
}) {
  const isCheckoutQueryEnabled = useMemo(
    () =>
      canCreateWorkspaceTerminal({
        isRouteFocused: input.isRouteFocused,
        client: input.client,
        isConnected: input.isConnected,
        workspaceDirectory: input.workspaceDirectory,
      }),
    [input.isRouteFocused, input.client, input.isConnected, input.workspaceDirectory],
  );
  const checkoutQuery = useQuery({
    queryKey: checkoutStatusQueryKey(
      input.normalizedServerId,
      input.workspaceDirectory ?? `missing-workspace-directory:${input.normalizedWorkspaceId}`,
    ),
    enabled: isCheckoutQueryEnabled,
    queryFn: async () => {
      if (!input.client || !input.workspaceDirectory) {
        throw new Error("Host is not connected");
      }
      return await input.client.getCheckoutStatus(input.workspaceDirectory);
    },
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });
  const isCheckoutStatusLoading = useMemo(
    () => isCheckoutQueryEnabled && checkoutQuery.data === undefined && !checkoutQuery.isError,
    [isCheckoutQueryEnabled, checkoutQuery.data, checkoutQuery.isError],
  );

  return { checkoutQuery, isCheckoutStatusLoading };
}

// Complexity grew by one when we wired the right-side context panel to
// subagents + todo data. The function is a long, intentional screen-level
// coordinator; extracting further would scatter the routing policy. The
// threshold is raised just for this single function.
// eslint-disable-next-line complexity
function WorkspaceScreenContent({
  serverId,
  workspaceId,
  isRouteFocused,
}: WorkspaceScreenContentProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const router = useRouter();
  const isMobile = useIsCompactFormFactor();
  const globalParams = useGlobalSearchParams<{ open?: string | string[] }>();
  const isFocusModeEnabled = usePanelStore((state) => state.desktop.focusModeEnabled);
  const [environmentPanelMode, setEnvironmentPanelMode] =
    useState<WorkspaceEnvironmentPanelMode>("auto");
  const [centerContentSize, setCenterContentSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [environmentDockState, setEnvironmentDockState] = useState<WorkspaceEnvironmentDockState>({
    open: true,
    activeTab: "git-summary",
  });

  const normalizedServerId = useMemo(() => trimNonEmpty(decodeSegment(serverId)) ?? "", [serverId]);
  const openIntentValue = useMemo(
    () => getSearchParamValue(globalParams.open),
    [globalParams.open],
  );
  const consumedWorkspaceIntentRef = useRef<string | null>(null);

  const normalizedWorkspaceId = useMemo(
    () => resolveWorkspaceRouteId({ routeWorkspaceId: workspaceId }) ?? "",
    [workspaceId],
  );
  const workspaceDescriptor = useWorkspace(normalizedServerId, normalizedWorkspaceId);
  const workspaceScripts = getWorkspaceScripts(workspaceDescriptor);
  const { handleRetryHost, handleManageHost, handleDismissMissingWorkspace } =
    useWorkspaceRouteActions(normalizedServerId);

  const workspaceTerminalScopeKey = useMemo(
    () => buildWorkspaceTerminalScopeKey(normalizedServerId, normalizedWorkspaceId),
    [normalizedServerId, normalizedWorkspaceId],
  );
  useWorkspaceTerminalSessionRetention({
    scopeKey: workspaceTerminalScopeKey,
  });

  const client = useHostRuntimeClient(normalizedServerId);
  const isConnected = useHostRuntimeIsConnected(normalizedServerId);
  const workspaceAuthority = useMemo(
    () =>
      getWorkspaceExecutionAuthority({
        workspace: workspaceDescriptor,
      }),
    [workspaceDescriptor],
  );
  const { workspaceDirectory, isMissingWorkspaceExecutionAuthority } =
    resolveWorkspaceAuthorityState(workspaceAuthority, workspaceDescriptor);
  const shouldEnableReviewCalloutGitActions = Boolean(
    isRouteFocused &&
    shouldEnableWorkspaceReviewArchiveAction({
      workspace: workspaceDescriptor,
      workspaceDirectory,
    }),
  );
  const { gitActions: reviewCalloutGitActions } = useGitActions({
    serverId: normalizedServerId,
    cwd: workspaceDirectory ?? "",
    enabled: shouldEnableReviewCalloutGitActions,
    icons: REVIEW_CALLOUT_GIT_ACTION_ICONS,
  });
  const [isImportSheetVisible, setIsImportSheetVisible] = useState(false);
  const canOpenImportSheet = [client, isConnected, workspaceDirectory].every(Boolean);
  const openImportSheet = useCallback(() => {
    setIsImportSheetVisible(true);
  }, []);
  const closeImportSheet = useCallback(() => {
    setIsImportSheetVisible(false);
  }, []);

  // Warm the workspace-scoped provider snapshot so the model picker is ready when opened.
  useProvidersSnapshot(normalizedServerId, {
    cwd: workspaceDirectory,
    enabled: isRouteFocused,
  });

  const persistenceKey = useMemo(
    () =>
      buildWorkspaceTabPersistenceKey({
        serverId: normalizedServerId,
        workspaceId: normalizedWorkspaceId,
      }),
    [normalizedServerId, normalizedWorkspaceId],
  );
  const openWorkspaceTabFocused = useWorkspaceLayoutStore((state) => state.openTabFocused);
  const openWorkspaceChildTabFocused = useWorkspaceLayoutStore(
    (state) => state.openChildTabFocused,
  );
  const focusWorkspacePane = useWorkspaceLayoutStore((state) => state.focusPane);
  const hasHydratedWorkspaces = useSessionStore(
    (state) => state.sessions[normalizedServerId]?.hasHydratedWorkspaces ?? false,
  );

  const workspaceAgentVisibility = useStoreWithEqualityFn(
    useSessionStore,
    (state) =>
      deriveWorkspaceAgentVisibility({
        sessionAgents: state.sessions[normalizedServerId]?.agents,
        agentDetails: state.sessions[normalizedServerId]?.agentDetails,
        workspaceDirectory,
      }),
    workspaceAgentVisibilityEqual,
  );

  const {
    handleTerminalCreated,
    handleScriptTerminalSelected,
    handleWorkspacePathUnavailable,
    handleTerminalCreateQueued,
  } = useWorkspaceTerminalTabActions({
    persistenceKey,
    focusWorkspacePane,
    openWorkspaceTabFocused,
    toast,
  });
  const queryClient = useQueryClient();
  const {
    createMutation: createTerminalMutation,
    createTerminal,
    handleScriptTerminalStarted,
    handleViewScriptTerminal,
    invalidateTerminals,
    killMutation: killTerminalMutation,
    knownTerminalIds,
    liveTerminalIds,
    pendingCreateInput: pendingTerminalCreateInput,
    query: terminalsQuery,
    queryKey: terminalsQueryKey,
    removeTerminalFromCache,
    standaloneTerminalIds,
    terminals,
  } = useWorkspaceTerminals({
    client,
    isConnected,
    isRouteFocused,
    normalizedServerId,
    normalizedWorkspaceId,
    workspaceDirectory,
    workspaceScripts,
    hasHydratedWorkspaces,
    isMissingWorkspaceExecutionAuthority,
    onTerminalCreated: handleTerminalCreated,
    onScriptTerminalSelected: handleScriptTerminalSelected,
    onWorkspacePathUnavailable: handleWorkspacePathUnavailable,
    onTerminalCreateQueued: handleTerminalCreateQueued,
  });
  const { checkoutQuery, isCheckoutStatusLoading } = useWorkspaceCheckoutStatus({
    client,
    isConnected,
    isRouteFocused,
    normalizedServerId,
    normalizedWorkspaceId,
    workspaceDirectory,
  });
  const hasHydratedAgents = useSessionStore(
    (state) => state.sessions[normalizedServerId]?.hasHydratedAgents ?? false,
  );
  const workspaceRouteState = useResolvedWorkspaceRouteState({
    serverId: normalizedServerId,
    workspaceId: normalizedWorkspaceId,
    workspace: workspaceDescriptor,
    hasHydratedWorkspaces,
  });
  const workspaceHeaderCheckoutState = buildWorkspaceHeaderCheckoutState({
    isCheckoutStatusLoading,
    isError: checkoutQuery.isError,
    data: checkoutQuery.data,
  });
  const {
    isWorkspaceHeaderLoading,
    workspaceHeaderTitle,
    workspaceHeaderSubtitle,
    shouldShowWorkspaceHeaderSubtitle,
    isGitCheckout,
    currentBranchName,
  } = deriveWorkspaceHeaderFields({
    workspace: workspaceDescriptor,
    checkoutState: workspaceHeaderCheckoutState,
  });

  const isExplorerOpen = usePanelStore((state) =>
    selectIsFileExplorerOpen(state, { isCompact: isMobile }),
  );
  const canOpenExplorerFromAgentView = usePanelStore(
    (state) =>
      state.mobileView === "agent" && !selectIsFileExplorerOpen(state, { isCompact: true }),
  );
  const openFileExplorerForCheckout = usePanelStore((state) => state.openFileExplorerForCheckout);
  const toggleFileExplorerForCheckout = usePanelStore(
    (state) => state.toggleFileExplorerForCheckout,
  );
  const closeDesktopFileExplorer = usePanelStore((state) => state.closeDesktopFileExplorer);
  const setExplorerTabForCheckout = usePanelStore((state) => state.setExplorerTabForCheckout);
  const showMobileAgent = usePanelStore((state) => state.showMobileAgent);
  const isLocalDaemon = useIsLocalDaemon(normalizedServerId);

  const activeExplorerCheckout = useMemo<ExplorerCheckoutContext | null>(() => {
    if (!normalizedServerId || !workspaceDirectory) {
      return null;
    }
    return {
      serverId: normalizedServerId,
      cwd: workspaceDirectory,
      isGit: isGitCheckout,
    };
  }, [isGitCheckout, normalizedServerId, workspaceDirectory]);

  const openExplorerForWorkspace = useCallback(() => {
    if (!activeExplorerCheckout) {
      return;
    }
    openFileExplorerForCheckout({
      isCompact: isMobile,
      checkout: activeExplorerCheckout,
    });
  }, [activeExplorerCheckout, isMobile, openFileExplorerForCheckout]);

  const handleToggleExplorer = useCallback(() => {
    if (!activeExplorerCheckout) {
      return;
    }
    toggleFileExplorerForCheckout({
      isCompact: isMobile,
      checkout: activeExplorerCheckout,
    });
  }, [activeExplorerCheckout, isMobile, toggleFileExplorerForCheckout]);

  const desktopContentStyle = styles.content;

  const hasEnoughSpaceForEnvironmentPanel = useMemo(() => {
    if (!centerContentSize) {
      return true;
    }
    return (
      centerContentSize.width >=
      WORKSPACE_ENVIRONMENT_PANEL_WIDTH +
        WORKSPACE_ENVIRONMENT_PANEL_SAFE_GAP +
        WORKSPACE_ENVIRONMENT_PANEL_MIN_CONTENT_WIDTH
    );
  }, [centerContentSize]);
  const previousHasEnoughSpaceForEnvironmentPanelRef = useRef(hasEnoughSpaceForEnvironmentPanel);
  const wantsEnvironmentPanelVisible =
    environmentPanelMode === "forced-open" ||
    (environmentPanelMode === "auto" && hasEnoughSpaceForEnvironmentPanel);
  const isEnvironmentPanelVisible = wantsEnvironmentPanelVisible;

  useEffect(() => {
    const wasEnough = previousHasEnoughSpaceForEnvironmentPanelRef.current;
    previousHasEnoughSpaceForEnvironmentPanelRef.current = hasEnoughSpaceForEnvironmentPanel;
    if (
      !wasEnough &&
      hasEnoughSpaceForEnvironmentPanel &&
      environmentPanelMode === "forced-closed"
    ) {
      setEnvironmentPanelMode("auto");
    }
  }, [environmentPanelMode, hasEnoughSpaceForEnvironmentPanel]);

  const handleCenterContentLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setCenterContentSize((current) =>
      current?.width === width && current.height === height ? current : { width, height },
    );
  }, []);

  const handleToggleEnvironmentPanel = useCallback(() => {
    if (!isEnvironmentPanelVisible) {
      setEnvironmentDockState((state) => ({ ...state, open: true }));
    }
    setEnvironmentPanelMode(isEnvironmentPanelVisible ? "forced-closed" : "forced-open");
    if (!isEnvironmentPanelVisible && isExplorerOpen && activeExplorerCheckout) {
      toggleFileExplorerForCheckout({
        isCompact: isMobile,
        checkout: activeExplorerCheckout,
      });
    }
  }, [
    activeExplorerCheckout,
    isEnvironmentPanelVisible,
    isExplorerOpen,
    isMobile,
    toggleFileExplorerForCheckout,
  ]);

  const handleOpenEnvironmentChanges = useCallback(() => {
    if (!activeExplorerCheckout) {
      return;
    }
    setExplorerTabForCheckout({
      ...activeExplorerCheckout,
      tab: getEnvironmentExplorerTab(activeExplorerCheckout),
    });
    openFileExplorerForCheckout({
      isCompact: isMobile,
      checkout: activeExplorerCheckout,
    });
    setEnvironmentPanelMode("forced-closed");
  }, [activeExplorerCheckout, isMobile, openFileExplorerForCheckout, setExplorerTabForCheckout]);

  const explorerToggleAccessibilityState = useMemo(
    () => ({ expanded: isExplorerOpen }),
    [isExplorerOpen],
  );
  const environmentSourceLabel = useMemo(
    () => getWorkspaceEnvironmentSourceLabel(workspaceDescriptor),
    [workspaceDescriptor],
  );
  const environmentWorkspaceStatus = useMemo(
    () => getWorkspaceEnvironmentStatus(workspaceDescriptor),
    [workspaceDescriptor],
  );

  const explorerOpenGesture = useExplorerOpenGesture({
    enabled: isMobile && canOpenExplorerFromAgentView,
    onOpen: openExplorerForWorkspace,
  });

  useEffect(() => {
    if (!isRouteFocused || isWeb || !isExplorerOpen) {
      return;
    }

    const handler = BackHandler.addEventListener("hardwareBackPress", () => {
      if (isExplorerOpen) {
        showMobileAgent();
        return true;
      }
      return false;
    });

    return () => handler.remove();
  }, [isExplorerOpen, isRouteFocused, showMobileAgent]);

  const workspaceLayout = useWorkspaceLayoutStore((state) =>
    persistenceKey ? (state.layoutByWorkspace[persistenceKey] ?? null) : null,
  );
  const hasHydratedWorkspaceLayoutStore = useWorkspaceLayoutStoreHydrated();
  const uiTabs = useMemo(
    () => (workspaceLayout ? collectAllTabs(workspaceLayout.root) : EMPTY_UI_TABS),
    [workspaceLayout],
  );
  useSyncWorkspaceActiveBrowser({ workspaceLayout, isRouteFocused });
  const environmentBrowserContext = useWorkspaceBrowserContextSummary({ workspaceLayout });
  const hasEnvironmentBrowserContext = environmentBrowserContext !== null;
  const hasEnvironmentPullRequest = Boolean(workspaceDescriptor?.githubRuntime?.pullRequest);
  const openWorkspaceTabInBackground = useWorkspaceLayoutStore(
    (state) => state.openTabInBackground,
  );
  const focusWorkspaceTab = useWorkspaceLayoutStore((state) => state.focusTab);
  const closeWorkspaceTab = useWorkspaceLayoutStore((state) => state.closeTab);
  const unpinWorkspaceAgent = useWorkspaceLayoutStore((state) => state.unpinAgent);
  const suppressWorkspaceAgentAutoOpen = useWorkspaceLayoutStore(
    (state) => state.suppressAgentAutoOpen,
  );
  const suppressWorkspaceTerminalAutoOpen = useWorkspaceLayoutStore(
    (state) => state.suppressTerminalAutoOpen,
  );
  const retargetWorkspaceTab = useWorkspaceLayoutStore((state) => state.retargetTab);
  const splitWorkspacePane = useWorkspaceLayoutStore((state) => state.splitPane);
  const splitWorkspacePaneEmpty = useWorkspaceLayoutStore((state) => state.splitPaneEmpty);
  const moveWorkspaceTabToPane = useWorkspaceLayoutStore((state) => state.moveTabToPane);
  const paneFocusSuppressedRef = useRef(false);
  const resizeWorkspaceSplit = useWorkspaceLayoutStore((state) => state.resizeSplit);
  const reorderWorkspaceTabsInPane = useWorkspaceLayoutStore((state) => state.reorderTabsInPane);
  const _pinnedAgentIds = useWorkspaceLayoutStore((state) =>
    persistenceKey
      ? (state.pinnedAgentIdsByWorkspace[persistenceKey] ?? EMPTY_PINNED_AGENT_IDS)
      : EMPTY_PINNED_AGENT_IDS,
  );
  const _hiddenAgentIds = useWorkspaceLayoutStore((state) =>
    persistenceKey ? (state.hiddenAgentIdsByWorkspace[persistenceKey] ?? EMPTY_SET) : EMPTY_SET,
  );
  const { closingTabIds, closeTab } = useCloseTabs();
  const closeWorkspaceTabWithCleanup = useCallback(
    function closeWorkspaceTabWithCleanup(input: {
      tabId: string;
      target?: WorkspaceTabTarget | null;
    }) {
      const normalizedTabId = trimNonEmpty(input.tabId);
      if (!normalizedTabId || !persistenceKey) {
        return;
      }

      if (input.target?.kind === "agent") {
        unpinWorkspaceAgent(persistenceKey, input.target.agentId);
        suppressWorkspaceAgentAutoOpen(persistenceKey, input.target.agentId);
      }
      if (input.target?.kind === "terminal") {
        suppressWorkspaceTerminalAutoOpen(persistenceKey, input.target.terminalId);
      }
      if (input.target?.kind === "browser") {
        const { browserId } = input.target;
        useBrowserStore.getState().removeBrowser(browserId);
        void getDesktopHost()?.browser?.clearPartition?.(browserId);
      }
      closeWorkspaceTab(persistenceKey, normalizedTabId);
    },
    [
      closeWorkspaceTab,
      persistenceKey,
      suppressWorkspaceAgentAutoOpen,
      suppressWorkspaceTerminalAutoOpen,
      unpinWorkspaceAgent,
    ],
  );

  const focusedPaneTabState = useMemo(
    () =>
      deriveWorkspacePaneState({
        layout: workspaceLayout,
        tabs: uiTabs,
      }),
    [uiTabs, workspaceLayout],
  );
  const setFocusedAgentId = useSessionStore((state) => state.setFocusedAgentId);
  const focusedPaneAgentId = useMemo(() => {
    const target = focusedPaneTabState.activeTab?.descriptor.target;
    if (target?.kind !== "agent") {
      return null;
    }
    return target.agentId;
  }, [focusedPaneTabState.activeTab]);
  const environmentPanelAgent = useEnvironmentPanelAgent(normalizedServerId, focusedPaneAgentId);
  const environmentSubagents = useSubagentsForParent({
    serverId: normalizedServerId,
    parentAgentId: focusedPaneAgentId ?? "",
  });
  const environmentTodoItems = useEnvironmentPanelTodoItems(normalizedServerId, focusedPaneAgentId);
  const workspaceStatusStripModel = useMemo(
    () =>
      buildWorkspaceStatusStripModel({
        activeAgent: environmentPanelAgent,
        workspace: workspaceDescriptor,
        currentBranchName,
        todoItems: environmentTodoItems,
      }),
    [currentBranchName, environmentPanelAgent, environmentTodoItems, workspaceDescriptor],
  );
  const workspaceActivityItems = useMemo(
    () =>
      buildWorkspaceActivityItems({
        activeAgent: environmentPanelAgent,
        workspace: workspaceDescriptor,
        currentBranchName,
      }),
    [currentBranchName, environmentPanelAgent, workspaceDescriptor],
  );
  const environmentPanelAgentId = environmentPanelAgent?.id ?? null;
  const workspaceReviewArchiveAction = useMemo(() => {
    if (
      !workspaceDirectory ||
      workspaceDescriptor?.projectKind !== "git" ||
      workspaceDescriptor.workspaceKind !== "worktree"
    ) {
      return null;
    }
    const action = [
      reviewCalloutGitActions.primary,
      ...reviewCalloutGitActions.secondary,
      ...reviewCalloutGitActions.menu,
    ].find((candidate) => candidate?.id === "archive-worktree");
    if (!action || action.unavailableMessage || action.status === "pending") {
      return null;
    }
    return action;
  }, [
    reviewCalloutGitActions,
    workspaceDescriptor?.projectKind,
    workspaceDescriptor?.workspaceKind,
    workspaceDirectory,
  ]);
  const environmentTurnChanges = useEnvironmentPanelTurnChanges(
    normalizedServerId,
    focusedPaneAgentId,
  );

  useEffect(() => {
    if (!isRouteFocused) {
      return;
    }
    setFocusedAgentId(normalizedServerId, focusedPaneAgentId);
  }, [focusedPaneAgentId, isRouteFocused, normalizedServerId, setFocusedAgentId]);

  useEffect(() => {
    if (!isRouteFocused) {
      return;
    }
    return () => {
      setFocusedAgentId(normalizedServerId, null);
    };
  }, [isRouteFocused, normalizedServerId, setFocusedAgentId]);

  const openWorkspaceDraftTab = useCallback(
    function openWorkspaceDraftTab(input?: { draftId?: string; focus?: boolean }) {
      if (!persistenceKey) {
        return null;
      }

      const target = normalizeWorkspaceTabTarget({
        kind: "draft",
        draftId: trimNonEmpty(input?.draftId) ?? generateDraftId(),
      });
      invariant(target?.kind === "draft", "Draft tab target must be valid");
      if (input?.focus === false) {
        return openWorkspaceTabInBackground(persistenceKey, target);
      }
      return openWorkspaceTabFocused(persistenceKey, target);
    },
    [openWorkspaceTabFocused, openWorkspaceTabInBackground, persistenceKey],
  );
  const { showWorkspaceSetup } = useWorkspacePersistenceHydration({
    client,
    isRouteFocused,
    serverId: normalizedServerId,
    workspaceId: normalizedWorkspaceId,
    persistenceKey,
    workspaceDirectory,
    hasHydratedWorkspaceLayoutStore,
    hasHydratedAgents,
    terminalsHydrated: terminalsQuery.isSuccess,
    terminalCount: terminals.length,
    knownTerminalIds,
    standaloneTerminalIds,
    uiTabs,
    workspaceAgentVisibility,
    openWorkspaceDraftTab,
    openWorkspaceTabInBackground,
  });

  const activeTabId = focusedPaneTabState.activeTabId;
  const activeTab = focusedPaneTabState.activeTab;

  const tabs = useMemo<WorkspaceTabDescriptor[]>(
    () => focusedPaneTabState.tabs.map((tab) => tab.descriptor),
    [focusedPaneTabState.tabs],
  );
  const navigateToTabId = useCallback(
    function navigateToTabId(tabId: string) {
      if (!tabId || !persistenceKey) {
        return;
      }
      focusWorkspaceTab(persistenceKey, tabId);
    },
    [focusWorkspaceTab, persistenceKey],
  );
  const handleImportedAgent = useCallback(
    (agentId: string) => {
      if (!persistenceKey) {
        return;
      }
      const tabId = openWorkspaceTabFocused(persistenceKey, { kind: "agent", agentId });
      if (tabId) {
        navigateToTabId(tabId);
      }
    },
    [navigateToTabId, openWorkspaceTabFocused, persistenceKey],
  );
  const handleOpenEnvironmentSubagent = handleImportedAgent;

  const handleOpenFileFromExplorer = useCallback(
    function handleOpenFileFromExplorer(filePath: string) {
      if (isMobile) {
        showMobileAgent();
      }
      if (!persistenceKey) {
        return;
      }
      const location = normalizeWorkspaceFileLocation({ path: filePath });
      if (!location) {
        return;
      }
      const tabId = openWorkspaceTabFocused(persistenceKey, createWorkspaceFileTabTarget(location));
      if (tabId) {
        navigateToTabId(tabId);
      }
    },
    [isMobile, navigateToTabId, openWorkspaceTabFocused, persistenceKey, showMobileAgent],
  );

  const handleOpenFileFromChat = useCallback(
    (location: WorkspaceFileLocation, options?: { parentTabId?: string | null }) => {
      const normalizedLocation = normalizeWorkspaceFileLocation(location);
      if (!normalizedLocation) {
        return;
      }
      if (isMobile) {
        showMobileAgent();
      }
      if (!persistenceKey) {
        return;
      }
      const target = createWorkspaceFileTabTarget(normalizedLocation);
      const tabId = options?.parentTabId
        ? openWorkspaceChildTabFocused(persistenceKey, target, options.parentTabId)
        : openWorkspaceTabFocused(persistenceKey, target);
      if (tabId) {
        navigateToTabId(tabId);
      }
    },
    [
      isMobile,
      navigateToTabId,
      openWorkspaceChildTabFocused,
      openWorkspaceTabFocused,
      persistenceKey,
      showMobileAgent,
    ],
  );

  const handleOpenFileFromChatInSidePane = useCallback(
    (input: {
      location: WorkspaceFileLocation;
      sourcePaneId?: string;
      parentTabId?: string | null;
    }) => {
      const location = normalizeWorkspaceFileLocation(input.location);
      if (!location) {
        return;
      }
      if (!persistenceKey || isMobile || !input.sourcePaneId) {
        handleOpenFileFromChat(location, { parentTabId: input.parentTabId });
        return;
      }

      const target: WorkspaceTabTarget = createWorkspaceFileTabTarget(location);
      const placement = resolveSideFileOpenPlacement({
        layout: workspaceLayout,
        sourcePaneId: input.sourcePaneId,
        tabs: uiTabs,
        target,
      });
      if (placement.kind === "focus-side-pane") {
        focusWorkspacePane(persistenceKey, placement.paneId);
      } else if (placement.kind === "split-side-pane") {
        splitWorkspacePaneEmpty(persistenceKey, {
          targetPaneId: placement.paneId,
          position: "right",
        });
      }

      const tabId = input.parentTabId
        ? openWorkspaceChildTabFocused(persistenceKey, target, input.parentTabId)
        : openWorkspaceTabFocused(persistenceKey, target);
      if (tabId) {
        navigateToTabId(tabId);
      }
    },
    [
      handleOpenFileFromChat,
      isMobile,
      focusWorkspacePane,
      navigateToTabId,
      openWorkspaceChildTabFocused,
      openWorkspaceTabFocused,
      persistenceKey,
      splitWorkspacePaneEmpty,
      uiTabs,
      workspaceLayout,
    ],
  );

  const [_hoveredTabKey, setHoveredTabKey] = useState<string | null>(null);
  const [hoveredCloseTabKey, setHoveredCloseTabKey] = useState<string | null>(null);
  const { handleRenameTab, renamingTab, handleRenameModalSubmit, handleRenameModalClose } =
    useWorkspaceTabRename({
      client,
      normalizedServerId,
      queryClient,
      terminalsData: terminalsQuery.data,
      terminalsQueryKey,
    });

  const tabByKey = useMemo(() => {
    const map = new Map<string, WorkspaceTabDescriptor>();
    for (const tab of tabs) {
      map.set(tab.key, tab);
    }
    return map;
  }, [tabs]);

  const allTabDescriptorsById = useMemo(() => {
    const map = new Map<string, WorkspaceTabDescriptor>();
    for (const tab of uiTabs) {
      map.set(tab.tabId, {
        key: tab.tabId,
        tabId: tab.tabId,
        kind: tab.target.kind,
        target: tab.target,
      });
    }
    return map;
  }, [uiTabs]);

  const activeTabKey = useMemo(() => activeTabId ?? "", [activeTabId]);
  const fallbackLabels = useMemo<WorkspaceTabFallbackLabels>(
    () => ({
      newAgent: t("workspace.newAgent"),
      setup: t("workspace.setup"),
      workspaceSetup: t("workspace.workspaceSetup"),
      agent: t("session.agent"),
      terminal: t("terminal.title"),
      browser: t("browser.title"),
    }),
    [t],
  );

  const tabSwitcherOptions = useMemo(
    () =>
      tabs.map((tab) => ({
        id: tab.key,
        label: getFallbackTabOptionLabel(tab, fallbackLabels),
        description: getFallbackTabOptionDescription(tab, fallbackLabels),
      })),
    [fallbackLabels, tabs],
  );

  const handleCreateDraftTab = useCallback(
    (input?: { paneId?: string }) => {
      if (input?.paneId && persistenceKey) {
        focusWorkspacePane(persistenceKey, input.paneId);
      }
      openWorkspaceDraftTab();
    },
    [focusWorkspacePane, openWorkspaceDraftTab, persistenceKey],
  );

  const handleCreateTerminal = useStableEvent(createTerminal);

  useEffect(() => {
    if (!isRouteFocused || !openIntentValue || !persistenceKey) {
      return;
    }
    const consumptionKey = `${normalizedServerId}:${normalizedWorkspaceId}:${openIntentValue}`;
    if (consumedWorkspaceIntentRef.current === consumptionKey) {
      return;
    }
    const action = resolveWorkspaceScreenOpenIntentAction({
      openIntentValue,
      hasExplorerCheckout: activeExplorerCheckout !== null,
      isTerminalCreatePending:
        createTerminalMutation.isPending || pendingTerminalCreateInput !== null,
    });
    if (action.kind === "ignore" || action.kind === "wait") {
      return;
    }
    consumedWorkspaceIntentRef.current = consumptionKey;
    if (isWeb) {
      stripOpenSearchParamFromBrowserUrl();
    } else {
      router.replace(buildHostWorkspaceRoute(normalizedServerId, normalizedWorkspaceId) as Href);
    }
    if (action.kind === "open-changes") {
      handleOpenEnvironmentChanges();
      return;
    }
    handleCreateTerminal();
  }, [
    activeExplorerCheckout,
    createTerminalMutation.isPending,
    handleCreateTerminal,
    handleOpenEnvironmentChanges,
    isRouteFocused,
    normalizedServerId,
    normalizedWorkspaceId,
    openIntentValue,
    pendingTerminalCreateInput,
    persistenceKey,
    router,
  ]);

  const handleCreateBrowserTab = useCallback(
    (input?: { paneId?: string }) => {
      if (!persistenceKey || !getIsElectron()) {
        return;
      }
      if (input?.paneId) {
        focusWorkspacePane(persistenceKey, input.paneId);
      }
      const { browserId } = createWorkspaceBrowser();
      openWorkspaceTabFocused(persistenceKey, { kind: "browser", browserId });
    },
    [focusWorkspacePane, openWorkspaceTabFocused, persistenceKey],
  );

  const handleOpenUrlInBrowserTab = useCallback(
    (url: string) => {
      if (!persistenceKey || !getIsElectron()) {
        return;
      }
      const { browserId } = createWorkspaceBrowser({ initialUrl: url });
      openWorkspaceTabFocused(persistenceKey, { kind: "browser", browserId });
    },
    [openWorkspaceTabFocused, persistenceKey],
  );

  const handleSelectSwitcherTab = useCallback(
    (key: string) => {
      navigateToTabId(key);
    },
    [navigateToTabId],
  );

  const handleCreateDraftSplit = useCallback(
    (input: { targetPaneId: string; position: "left" | "right" | "top" | "bottom" }) => {
      if (!persistenceKey) {
        return;
      }

      const paneId = splitWorkspacePaneEmpty(persistenceKey, input);
      if (!paneId) {
        return;
      }

      handleCreateDraftTab({ paneId });
    },
    [handleCreateDraftTab, persistenceKey, splitWorkspacePaneEmpty],
  );

  const handleOpenWorkspaceDockPane = useCallback(
    (pane: WorkspaceEnvironmentDockTab) => {
      setEnvironmentDockState((state) =>
        resolveDockStateAfterAction(state, { type: "openDockPane", pane }),
      );
      setEnvironmentPanelMode("forced-open");
      if (!isMobile) {
        closeDesktopFileExplorer();
      }
    },
    [closeDesktopFileExplorer, isMobile],
  );

  const handleApplyWorkspaceDockCommand = useCallback(
    (
      command: Extract<
        WorkspacePaneCommand,
        { type: "openDockPane" | "toggleDockPane" | "openGitSummary" }
      >,
    ) => {
      let nextOpen = true;
      setEnvironmentDockState((state) => {
        const nextState = resolveDockStateAfterAction(state, command);
        nextOpen = nextState.open;
        return nextState;
      });
      setEnvironmentPanelMode(nextOpen ? "forced-open" : "forced-closed");
      if (nextOpen && !isMobile) {
        closeDesktopFileExplorer();
      }
    },
    [closeDesktopFileExplorer, isMobile],
  );

  const handleOpenTargetInPanePlacement = useCallback(
    (
      targetKind: Extract<WorkspacePaneCommand, { type: "openTarget" }>["targetKind"],
      placement: "current" | "new-tab" | "right" | "down",
    ) => {
      if (targetKind === "diff") {
        handleOpenEnvironmentChanges();
        return;
      }
      if (targetKind === "pull-request") {
        handleOpenWorkspaceDockPane("pull-request");
        return;
      }
      if (targetKind !== "browser" && targetKind !== "terminal") {
        return;
      }

      if (!persistenceKey) {
        return;
      }

      let targetPaneId: string | undefined;
      if (placement === "right" || placement === "down") {
        const focusedPane = focusedPaneTabState.pane;
        if (!focusedPane) {
          return;
        }
        const paneId = splitWorkspacePaneEmpty(persistenceKey, {
          targetPaneId: focusedPane.id,
          position: placement === "right" ? "right" : "bottom",
        });
        if (!paneId) {
          return;
        }
        targetPaneId = paneId;
      }

      if (targetKind === "terminal") {
        handleCreateTerminal(targetPaneId ? { paneId: targetPaneId } : undefined);
        return;
      }

      if (!getIsElectron()) {
        return;
      }
      const { browserId } = createWorkspaceBrowser();
      const target = { kind: "browser" as const, browserId };
      if (targetPaneId) {
        focusWorkspacePane(persistenceKey, targetPaneId);
      }
      if (placement === "new-tab") {
        openWorkspaceTabInBackground(persistenceKey, target);
        return;
      }
      openWorkspaceTabFocused(persistenceKey, target);
    },
    [
      focusedPaneTabState.pane,
      focusWorkspacePane,
      handleCreateTerminal,
      handleOpenEnvironmentChanges,
      handleOpenWorkspaceDockPane,
      openWorkspaceTabFocused,
      openWorkspaceTabInBackground,
      persistenceKey,
      splitWorkspacePaneEmpty,
    ],
  );

  const handleExecuteWorkspacePaneCommand = useCallback(
    (command: WorkspacePaneCommand) => {
      if (
        command.type === "openDockPane" ||
        command.type === "toggleDockPane" ||
        command.type === "openGitSummary"
      ) {
        handleApplyWorkspaceDockCommand(command);
        return;
      }
      if (command.type === "moveTabToDock") {
        return;
      }
      const resolution = resolveWorkspacePaneCommand(command);
      if (resolution.placement === "dock") {
        handleOpenWorkspaceDockPane(resolution.dockPane);
        return;
      }
      handleOpenTargetInPanePlacement(resolution.targetKind, resolution.placement);
    },
    [handleApplyWorkspaceDockCommand, handleOpenTargetInPanePlacement, handleOpenWorkspaceDockPane],
  );
  const handleOpenGitDock = useCallback(() => {
    handleExecuteWorkspacePaneCommand({ type: "openGitSummary" });
  }, [handleExecuteWorkspacePaneCommand]);
  const handleOpenBrowserContextDock = useCallback(() => {
    if (!hasEnvironmentBrowserContext) {
      return;
    }
    handleExecuteWorkspacePaneCommand({
      type: "openTarget",
      targetKind: "browser",
      placement: "dock",
    });
  }, [handleExecuteWorkspacePaneCommand, hasEnvironmentBrowserContext]);
  const handleOpenPullRequestDock = useCallback(() => {
    if (!hasEnvironmentPullRequest) {
      return;
    }
    handleOpenWorkspaceDockPane("pull-request");
  }, [handleOpenWorkspaceDockPane, hasEnvironmentPullRequest]);

  const killTerminalAsync = killTerminalMutation.mutateAsync;

  const handleCloseTerminalTab = useCallback(
    async (input: { tabId: string; terminalId: string }) => {
      const { tabId, terminalId } = input;
      await closeTab(tabId, async () => {
        const confirmed = await confirmDialog({
          title: t("workspace.screen.closeTerminalTitle"),
          message: t("workspace.screen.closeTerminalMessage"),
          confirmLabel: t("common.close"),
          cancelLabel: t("common.cancel"),
          destructive: true,
        });
        if (!confirmed) {
          return;
        }

        removeTerminalFromCache(terminalId);
        setHoveredTabKey((current) => (current === tabId ? null : current));
        setHoveredCloseTabKey((current) => (current === tabId ? null : current));
        if (persistenceKey) {
          closeWorkspaceTabWithCleanup({
            tabId,
            target: { kind: "terminal", terminalId },
          });
        }

        void killTerminalAsync(terminalId).catch(invalidateTerminals);
      });
    },
    [
      closeTab,
      closeWorkspaceTabWithCleanup,
      invalidateTerminals,
      killTerminalAsync,
      persistenceKey,
      removeTerminalFromCache,
      t,
    ],
  );

  const handleCloseAgentTab = useCallback(
    async (input: { tabId: string; agentId: string }) => {
      const { tabId, agentId } = input;
      await closeTab(tabId, async () => {
        closeAgentWorkspaceTabOnly({
          tabId,
          agentId,
          persistenceKey,
          closeWorkspaceTabWithCleanup,
          suppressAgentAutoOpen: suppressWorkspaceAgentAutoOpen,
          unpinAgent: unpinWorkspaceAgent,
          setHoveredTabKey,
          setHoveredCloseTabKey,
        });
      });
    },
    [
      closeTab,
      closeWorkspaceTabWithCleanup,
      persistenceKey,
      suppressWorkspaceAgentAutoOpen,
      unpinWorkspaceAgent,
    ],
  );

  const handleCloseDraftOrFileTab = useCallback(
    function handleCloseDraftOrFileTab(input: {
      tabId: string;
      target?: WorkspaceTabTarget | null;
    }) {
      setHoveredTabKey((current) => (current === input.tabId ? null : current));
      setHoveredCloseTabKey((current) => (current === input.tabId ? null : current));
      if (persistenceKey) {
        closeWorkspaceTabWithCleanup({ tabId: input.tabId, target: input.target });
      }
    },
    [closeWorkspaceTabWithCleanup, persistenceKey],
  );

  const handleCloseTabById = useCallback(
    async (tabId: string) => {
      const tab = allTabDescriptorsById.get(tabId);
      if (!tab) {
        return;
      }
      if (tab.target.kind === "terminal") {
        await handleCloseTerminalTab({ tabId, terminalId: tab.target.terminalId });
        return;
      }
      if (tab.target.kind === "agent") {
        await handleCloseAgentTab({ tabId, agentId: tab.target.agentId });
        return;
      }
      handleCloseDraftOrFileTab({ tabId, target: tab.target });
    },
    [allTabDescriptorsById, handleCloseAgentTab, handleCloseDraftOrFileTab, handleCloseTerminalTab],
  );

  const handleCopyAgentId = useCallback(
    async (agentId: string) => {
      if (!agentId) return;
      try {
        await Clipboard.setStringAsync(agentId);
        toast.copied(t("workspace.screen.agentIdCopied"));
      } catch {
        toast.error(t("workspace.screen.copyFailed"));
      }
    },
    [t, toast],
  );

  const handleCopyResumeCommand = useCallback(
    async (agentId: string) => {
      if (!agentId) return;
      const agent =
        useSessionStore.getState().sessions[normalizedServerId]?.agents?.get(agentId) ?? null;
      const providerSessionId =
        agent?.runtimeInfo?.sessionId ?? agent?.persistence?.sessionId ?? null;
      if (!agent || !providerSessionId) {
        toast.error(t("workspace.screen.resumeIdUnavailable"));
        return;
      }

      const command =
        buildProviderCommand({
          provider: agent.provider,
          id: "resume",
          sessionId: providerSessionId,
        }) ?? null;
      if (!command) {
        toast.error(t("workspace.screen.resumeCommandUnavailable"));
        return;
      }
      try {
        await Clipboard.setStringAsync(command);
        toast.copied(t("workspace.screen.resumeCommandCopied"));
      } catch {
        toast.error(t("workspace.screen.copyFailed"));
      }
    },
    [normalizedServerId, t, toast],
  );

  const handleCopyEnvironmentResumeCommand = useCallback(() => {
    if (environmentPanelAgentId) {
      void handleCopyResumeCommand(environmentPanelAgentId);
      return;
    }
    toast.error(t("workspace.screen.resumeIdUnavailable"));
  }, [environmentPanelAgentId, handleCopyResumeCommand, t, toast]);

  const handleReloadAgent = useCallback(
    async (agentId: string) => {
      if (!client || !isConnected) {
        toast.error(t("workspace.screen.hostDisconnected"));
        return;
      }

      toast.show(t("workspace.screen.reloadingAgent"), { durationMs: null });
      try {
        await client.refreshAgent(agentId);
        // Send the existing cursor so the server detects the new epoch and
        // returns reset:true. Without a cursor, the server returns reset:false
        // and the client takes the incremental path, where new-epoch rows are
        // dropped against the stale cursor.
        const sessionState = useSessionStore.getState().sessions[normalizedServerId];
        const currentCursor = sessionState?.agentTimelineCursor.get(agentId);
        await client.fetchAgentTimeline(agentId, {
          direction: "tail",
          projection: "canonical",
          ...(currentCursor
            ? { cursor: { epoch: currentCursor.epoch, seq: currentCursor.endSeq } }
            : {}),
        });
        toast.show(t("workspace.screen.agentReloaded"), { variant: "success" });
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : t("workspace.screen.reloadAgentFailed"),
        );
      }
    },
    [client, isConnected, normalizedServerId, t, toast],
  );

  const handleCopyWorkspacePath = useCallback(async () => {
    if (!workspaceDirectory) {
      toast.error(t("workspace.screen.workspacePathUnavailable"));
      return;
    }

    try {
      await Clipboard.setStringAsync(workspaceDirectory);
      toast.copied(t("workspace.screen.workspacePathCopied"));
    } catch {
      toast.error(t("workspace.screen.copyFailed"));
    }
  }, [t, toast, workspaceDirectory]);

  const handleCopyBranchName = useCallback(async () => {
    if (!currentBranchName) {
      toast.error(t("workspace.screen.branchNameUnavailable"));
      return;
    }

    try {
      await Clipboard.setStringAsync(currentBranchName);
      toast.copied(t("workspace.screen.branchNameCopied"));
    } catch {
      toast.error(t("workspace.screen.copyFailed"));
    }
  }, [currentBranchName, t, toast]);

  const handleOpenSetupTab = useCallback(() => {
    if (!persistenceKey) {
      return;
    }
    const target = normalizeWorkspaceTabTarget({
      kind: "setup",
      workspaceId: normalizedWorkspaceId,
    });
    if (!target) {
      return;
    }
    openWorkspaceTabFocused(persistenceKey, target);
  }, [normalizedWorkspaceId, openWorkspaceTabFocused, persistenceKey]);

  const bulkCloseCopy = useMemo(
    () => ({
      allKinds: ({
        agentCount,
        terminalCount,
        otherCount,
      }: {
        agentCount: number;
        terminalCount: number;
        otherCount: number;
      }) =>
        t("workspace.bulkClose.allKinds", {
          agentCount,
          terminalCount,
          otherCount,
        }),
      agentsAndTerminals: ({
        agentCount,
        terminalCount,
      }: {
        agentCount: number;
        terminalCount: number;
      }) =>
        t("workspace.bulkClose.agentsAndTerminals", {
          agentCount,
          terminalCount,
        }),
      terminalsAndOthers: ({
        terminalCount,
        otherCount,
      }: {
        terminalCount: number;
        otherCount: number;
      }) =>
        t("workspace.bulkClose.terminalsAndOthers", {
          terminalCount,
          otherCount,
        }),
      agentsAndOthers: ({ agentCount, otherCount }: { agentCount: number; otherCount: number }) =>
        t("workspace.bulkClose.agentsAndOthers", {
          agentCount,
          otherCount,
        }),
      terminalsOnly: ({ terminalCount }: { terminalCount: number }) =>
        t("workspace.bulkClose.terminalsOnly", { terminalCount }),
      othersOnly: ({ otherCount }: { otherCount: number }) =>
        t("workspace.bulkClose.othersOnly", { otherCount }),
      agentsOnly: ({ agentCount }: { agentCount: number }) =>
        t("workspace.bulkClose.agentsOnly", { agentCount }),
    }),
    [t],
  );

  const handleBulkCloseTabs = useCallback(
    async (input: { tabsToClose: WorkspaceTabDescriptor[]; title: string; logLabel: string }) => {
      const { tabsToClose, title, logLabel } = input;
      if (tabsToClose.length === 0) {
        return;
      }

      const groups = classifyBulkClosableTabs(tabsToClose);
      const confirmed = await confirmDialog({
        title,
        message: buildBulkCloseConfirmationMessage(groups, bulkCloseCopy),
        confirmLabel: t("common.close"),
        cancelLabel: t("common.cancel"),
        destructive: true,
      });
      if (!confirmed) {
        return;
      }

      await closeBulkWorkspaceTabs({
        client,
        groups,
        closeTab,
        closeWorkspaceTabWithCleanup: (cleanupInput) => {
          if (!persistenceKey) {
            return;
          }
          closeWorkspaceTabWithCleanup(cleanupInput);
        },
        logLabel,
        warn: (message, payload) => {
          console.warn(message, payload);
        },
      });

      const closedKeys = new Set(tabsToClose.map((tab) => tab.key));
      setHoveredTabKey((current) => (current && closedKeys.has(current) ? null : current));
      setHoveredCloseTabKey((current) => (current && closedKeys.has(current) ? null : current));
    },
    [bulkCloseCopy, client, closeTab, closeWorkspaceTabWithCleanup, persistenceKey, t],
  );

  const handleCloseTabsToLeftInPane = useCallback(
    async (tabId: string, paneTabs: WorkspaceTabDescriptor[]) => {
      const index = paneTabs.findIndex((tab) => tab.tabId === tabId);
      if (index < 0) {
        return;
      }
      await handleBulkCloseTabs({
        tabsToClose: paneTabs.slice(0, index),
        title: t("workspace.bulkClose.closeTabsLeftTitle"),
        logLabel: "to the left",
      });
    },
    [handleBulkCloseTabs, t],
  );

  const handleCloseTabsToLeft = useCallback(
    async (tabId: string) => {
      await handleCloseTabsToLeftInPane(tabId, tabs);
    },
    [handleCloseTabsToLeftInPane, tabs],
  );

  const handleCloseTabsToRightInPane = useCallback(
    async (tabId: string, paneTabs: WorkspaceTabDescriptor[]) => {
      const index = paneTabs.findIndex((tab) => tab.tabId === tabId);
      if (index < 0) {
        return;
      }
      await handleBulkCloseTabs({
        tabsToClose: paneTabs.slice(index + 1),
        title: t("workspace.bulkClose.closeTabsRightTitle"),
        logLabel: "to the right",
      });
    },
    [handleBulkCloseTabs, t],
  );

  const handleCloseTabsToRight = useCallback(
    async (tabId: string) => {
      await handleCloseTabsToRightInPane(tabId, tabs);
    },
    [handleCloseTabsToRightInPane, tabs],
  );

  const handleCloseOtherTabsInPane = useCallback(
    async (tabId: string, paneTabs: WorkspaceTabDescriptor[]) => {
      const tabsToClose = paneTabs.filter((tab) => tab.tabId !== tabId);
      await handleBulkCloseTabs({
        tabsToClose,
        title: t("workspace.bulkClose.closeOtherTabsTitle"),
        logLabel: "from close other tabs",
      });
    },
    [handleBulkCloseTabs, t],
  );

  const handleCloseOtherTabs = useCallback(
    async (tabId: string) => {
      await handleCloseOtherTabsInPane(tabId, tabs);
    },
    [handleCloseOtherTabsInPane, tabs],
  );

  useWorkspaceKeyboardActions({
    serverId: normalizedServerId,
    workspaceId: normalizedWorkspaceId,
    enabled: Boolean(isRouteFocused && normalizedServerId && normalizedWorkspaceId),
    persistenceKey,
    workspaceLayout,
    focusedPane: focusedPaneTabState.pane,
    focusedPaneActiveTabId: focusedPaneTabState.activeTabId,
    tabs,
    allTabDescriptorsById,
    paneFocusSuppressedRef,
    hasEnvironmentBrowserContext,
    hasEnvironmentPullRequest,
    onCreateDraftTab: handleCreateDraftTab,
    onCreateTerminal: handleCreateTerminal,
    onCloseTabById: handleCloseTabById,
    onNavigateToTabId: navigateToTabId,
    onToggleExplorer: handleToggleExplorer,
    onOpenGitDock: handleOpenGitDock,
    onOpenBrowserContextDock: handleOpenBrowserContextDock,
    onOpenPullRequestDock: handleOpenPullRequestDock,
    onCreateDraftSplit: handleCreateDraftSplit,
    focusWorkspacePane,
    moveWorkspaceTabToPane,
    closeWorkspaceTabWithCleanup,
    onOpenEnvironmentChanges: handleOpenEnvironmentChanges,
    onToggleEnvironmentPanel: handleToggleEnvironmentPanel,
    onCopyEnvironmentResumeCommand: handleCopyEnvironmentResumeCommand,
    onArchiveWorktree:
      workspaceReviewArchiveAction && !workspaceReviewArchiveAction.disabled
        ? workspaceReviewArchiveAction.handler
        : null,
  });

  const activeTabDescriptor = useMemo(() => activeTab?.descriptor ?? null, [activeTab]);
  const canRenderDesktopPaneSplits = supportsDesktopPaneSplits();
  useEffect(() => {
    if (!isRouteFocused || isNative || typeof document === "undefined" || activeTabDescriptor) {
      return;
    }
    document.title = t("workspace.title");
  }, [activeTabDescriptor, isRouteFocused, t]);
  const buildPaneContentModel = useCallback(
    (input: {
      tab: WorkspaceTabDescriptor;
      paneId?: string | null;
      focusPaneBeforeOpen?: boolean;
    }) =>
      buildWorkspacePaneContentModel({
        tab: input.tab,
        normalizedServerId,
        normalizedWorkspaceId,
        onOpenTab: (target) => {
          if (!persistenceKey) {
            return;
          }
          if (input.focusPaneBeforeOpen && input.paneId) {
            focusWorkspacePane(persistenceKey, input.paneId);
          }
          const tabId = openWorkspaceChildTabFocused(persistenceKey, target, input.tab.tabId);
          if (tabId) {
            navigateToTabId(tabId);
          }
        },
        onCloseCurrentTab: () => {
          void handleCloseTabById(input.tab.tabId);
        },
        onRetargetCurrentTab: (target) => {
          if (!persistenceKey) {
            return;
          }
          retargetWorkspaceTab(persistenceKey, input.tab.tabId, target);
        },
        onOpenWorkspaceFile: (request: WorkspaceFileOpenRequest) => {
          if (input.focusPaneBeforeOpen && input.paneId && persistenceKey) {
            focusWorkspacePane(persistenceKey, input.paneId);
          }
          if (request.disposition === "side") {
            handleOpenFileFromChatInSidePane({
              location: request.location,
              sourcePaneId: input.paneId ?? undefined,
              parentTabId: input.tab.tabId,
            });
            return;
          }
          handleOpenFileFromChat(request.location, { parentTabId: input.tab.tabId });
        },
        onOpenImportSheet: openImportSheet,
      }),
    [
      handleCloseTabById,
      handleOpenFileFromChat,
      handleOpenFileFromChatInSidePane,
      focusWorkspacePane,
      navigateToTabId,
      normalizedServerId,
      normalizedWorkspaceId,
      openImportSheet,
      openWorkspaceChildTabFocused,
      persistenceKey,
      retargetWorkspaceTab,
    ],
  );
  const focusedPaneId = useMemo(
    () => focusedPaneTabState.pane?.id ?? null,
    [focusedPaneTabState.pane],
  );
  const focusedPaneTabIds = useMemo(() => tabs.map((tab) => tab.tabId), [tabs]);
  const focusedPaneTabDescriptorMap = useStableTabDescriptorMap(tabs);
  const { mountedTabIds: mountedFocusedPaneTabIdsSet } = useMountedTabSet({
    activeTabId,
    allTabIds: focusedPaneTabIds,
    cap: 3,
  });
  const mountedFocusedPaneTabIds = useMemo(
    () => focusedPaneTabIds.filter((tabId) => mountedFocusedPaneTabIdsSet.has(tabId)),
    [focusedPaneTabIds, mountedFocusedPaneTabIdsSet],
  );
  const buildMobilePaneContentModel = useCallback(
    function buildMobilePaneContentModel(input: {
      paneId: string | null;
      tab: WorkspaceTabDescriptor;
    }) {
      return buildPaneContentModel({
        tab: input.tab,
        paneId: input.paneId,
        focusPaneBeforeOpen: false,
      });
    },
    [buildPaneContentModel],
  );
  const content = renderWorkspaceContent({
    isMissingWorkspaceExecutionAuthority,
    activeTabDescriptor,
    hasHydratedAgents,
    mountedFocusedPaneTabIds,
    focusedPaneTabDescriptorMap,
    isRouteFocused,
    focusedPaneId,
    workspaceExecutionMissingText: t("workspace.screen.workspaceExecutionMissing"),
    noTabsAvailableText: t("workspace.screen.noTabsAvailable"),
    buildMobilePaneContentModel,
  });

  const buildDesktopPaneContentModel = useCallback(
    function buildDesktopPaneContentModel(input: { paneId: string; tab: WorkspaceTabDescriptor }) {
      return buildPaneContentModel({
        tab: input.tab,
        paneId: input.paneId,
        focusPaneBeforeOpen: true,
      });
    },
    [buildPaneContentModel],
  );

  const handleFocusPane = useStableEvent(function handleFocusPane(paneId: string) {
    if (!persistenceKey || paneFocusSuppressedRef.current) {
      return;
    }
    focusWorkspacePane(persistenceKey, paneId);
  });

  const handleSplitPane = useCallback(
    function handleSplitPane(input: {
      tabId: string;
      targetPaneId: string;
      position: "left" | "right" | "top" | "bottom";
    }) {
      if (!persistenceKey) {
        return;
      }
      splitWorkspacePane(persistenceKey, input);
    },
    [persistenceKey, splitWorkspacePane],
  );

  const handleMoveTabToPane = useCallback(
    function handleMoveTabToPane(tabId: string, toPaneId: string) {
      if (!persistenceKey) {
        return;
      }
      moveWorkspaceTabToPane(persistenceKey, tabId, toPaneId);
    },
    [moveWorkspaceTabToPane, persistenceKey],
  );

  const handleResizePaneSplit = useCallback(
    function handleResizePaneSplit(groupId: string, sizes: number[]) {
      if (!persistenceKey) {
        return;
      }
      resizeWorkspaceSplit(persistenceKey, groupId, sizes);
    },
    [persistenceKey, resizeWorkspaceSplit],
  );

  const handleReorderTabsInPane = useCallback(
    function handleReorderTabsInPane(paneId: string, tabIds: string[]) {
      if (!persistenceKey) {
        return;
      }
      reorderWorkspaceTabsInPane(persistenceKey, paneId, tabIds);
    },
    [persistenceKey, reorderWorkspaceTabsInPane],
  );

  const renderSplitPaneEmptyState = useCallback(
    function renderSplitPaneEmptyState() {
      return (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>{t("workspace.screen.emptyPane")}</Text>
        </View>
      );
    },
    [t],
  );

  const containerStyle = containerWithWorkspaceBackgroundStyle;

  const menuNewAgentIcon = MENU_NEW_AGENT_ICON;
  const menuNewTerminalIcon = MENU_NEW_TERMINAL_ICON;
  const menuCopyIcon = MENU_COPY_ICON;
  const menuSettingsIcon = MENU_SETTINGS_ICON;
  const workspaceScreenGate = renderWorkspaceRouteGate({
    state: workspaceRouteState,
    actions: {
      onRetryHost: handleRetryHost,
      onManageHost: handleManageHost,
      onDismissMissingWorkspace: handleDismissMissingWorkspace,
    },
  });
  const gatedWorkspaceScreen = renderWorkspaceScreenGateShell({
    gate: workspaceScreenGate,
    workspaceKey: persistenceKey,
  });

  const headerRight = useMemo(() => {
    return (
      <WorkspaceHeaderRightControls
        isMobile={isMobile}
        isGitCheckout={isGitCheckout}
        isExplorerOpen={isExplorerOpen}
        canToggleExplorer={Boolean(activeExplorerCheckout)}
        isEnvironmentPanelVisible={isEnvironmentPanelVisible}
        canShowEnvironmentPanel={Boolean(workspaceDirectory)}
        explorerToggleAccessibilityState={explorerToggleAccessibilityState}
        onToggleExplorer={handleToggleExplorer}
        onToggleEnvironmentPanel={handleToggleEnvironmentPanel}
      />
    );
  }, [
    activeExplorerCheckout,
    isMobile,
    isGitCheckout,
    handleToggleExplorer,
    handleToggleEnvironmentPanel,
    isEnvironmentPanelVisible,
    isExplorerOpen,
    explorerToggleAccessibilityState,
    workspaceDirectory,
  ]);

  const showScreenHeader = useMemo(
    () => shouldShowWorkspaceScreenHeader({ isFocusModeEnabled, isMobile }),
    [isFocusModeEnabled, isMobile],
  );
  const showExplorerSidebar = useMemo(
    () => shouldShowWorkspaceExplorerSidebar({ isRouteFocused, isFocusModeEnabled, isMobile }),
    [isRouteFocused, isFocusModeEnabled, isMobile],
  );
  const environmentRailVisible = useMemo(
    () =>
      shouldShowWorkspaceEnvironmentRail({
        isMobile,
        isEnvironmentPanelVisible,
        workspaceDirectory,
      }),
    [isMobile, isEnvironmentPanelVisible, workspaceDirectory],
  );
  const createTerminalDisabled = useMemo(
    () => createTerminalMutation.isPending || pendingTerminalCreateInput !== null,
    [createTerminalMutation.isPending, pendingTerminalCreateInput],
  );
  const showCreateBrowserTab = getIsElectron();
  const desktopFocusModeEnabled = useMemo(
    () => isFocusModeEnabled && !isMobile,
    [isFocusModeEnabled, isMobile],
  );
  const workspaceFloatingPanelPortalHostName = useMemo(
    () =>
      `${WORKSPACE_FLOATING_PANEL_PORTAL_HOST_PREFIX}:${normalizedServerId}:${normalizedWorkspaceId}`,
    [normalizedServerId, normalizedWorkspaceId],
  );
  const desktopContent = useMemo(() => {
    if (!canRenderDesktopPaneSplits || !workspaceLayout || !persistenceKey) {
      return content;
    }
    return (
      <SplitContainer
        layout={workspaceLayout}
        focusModeEnabled={desktopFocusModeEnabled}
        workspaceKey={persistenceKey}
        normalizedServerId={normalizedServerId}
        normalizedWorkspaceId={normalizedWorkspaceId}
        isWorkspaceFocused={isRouteFocused}
        uiTabs={uiTabs}
        hoveredCloseTabKey={hoveredCloseTabKey}
        setHoveredTabKey={setHoveredTabKey}
        setHoveredCloseTabKey={setHoveredCloseTabKey}
        closingTabIds={closingTabIds}
        onNavigateTab={navigateToTabId}
        onCloseTab={handleCloseTabById}
        onCopyResumeCommand={handleCopyResumeCommand}
        onCopyAgentId={handleCopyAgentId}
        onReloadAgent={handleReloadAgent}
        onRenameTab={handleRenameTab}
        onCloseTabsToLeft={handleCloseTabsToLeftInPane}
        onCloseTabsToRight={handleCloseTabsToRightInPane}
        onCloseOtherTabs={handleCloseOtherTabsInPane}
        onCreateDraftTab={handleCreateDraftTab}
        onCreateTerminalTab={handleCreateTerminal}
        onCreateBrowserTab={handleCreateBrowserTab}
        showCreateBrowserTab={showCreateBrowserTab}
        buildPaneContentModel={buildDesktopPaneContentModel}
        onFocusPane={handleFocusPane}
        onSplitPane={handleSplitPane}
        onSplitPaneEmpty={handleCreateDraftSplit}
        onMoveTabToPane={handleMoveTabToPane}
        onResizeSplit={handleResizePaneSplit}
        onReorderTabsInPane={handleReorderTabsInPane}
        renderPaneEmptyState={renderSplitPaneEmptyState}
        topRightControls={headerRight}
      />
    );
  }, [
    content,
    canRenderDesktopPaneSplits,
    workspaceLayout,
    persistenceKey,
    desktopFocusModeEnabled,
    normalizedServerId,
    normalizedWorkspaceId,
    isRouteFocused,
    uiTabs,
    hoveredCloseTabKey,
    closingTabIds,
    navigateToTabId,
    handleCloseTabById,
    handleCopyResumeCommand,
    handleCopyAgentId,
    handleReloadAgent,
    handleRenameTab,
    handleCloseTabsToLeftInPane,
    handleCloseTabsToRightInPane,
    handleCloseOtherTabsInPane,
    handleCreateDraftTab,
    handleCreateTerminal,
    handleCreateBrowserTab,
    showCreateBrowserTab,
    buildDesktopPaneContentModel,
    handleFocusPane,
    handleSplitPane,
    handleCreateDraftSplit,
    handleMoveTabToPane,
    handleResizePaneSplit,
    handleReorderTabsInPane,
    renderSplitPaneEmptyState,
    headerRight,
  ]);
  const workspaceCenterColumn = (
    <View style={styles.centerColumn}>
      {showScreenHeader && isMobile && (
        <ScreenHeader
          left={
            isMobile ? (
              <>
                <SidebarMenuToggle />
                <WorkspaceHeaderTitleBar
                  isLoading={isWorkspaceHeaderLoading}
                  title={workspaceHeaderTitle}
                  subtitle={workspaceHeaderSubtitle}
                  showSubtitle={shouldShowWorkspaceHeaderSubtitle}
                  activeTab={activeTabDescriptor}
                  currentBranchName={currentBranchName}
                  isGitCheckout={isGitCheckout}
                  normalizedServerId={normalizedServerId}
                  normalizedWorkspaceId={normalizedWorkspaceId}
                  workspaceScripts={workspaceScripts}
                  liveTerminalIds={liveTerminalIds}
                  showWorkspaceSetup={showWorkspaceSetup}
                  showCreateBrowserTab={showCreateBrowserTab}
                  isMobile={isMobile}
                  createTerminalDisabled={createTerminalDisabled}
                  importAgentDisabled={!canOpenImportSheet}
                  menuNewAgentIcon={menuNewAgentIcon}
                  menuNewTerminalIcon={menuNewTerminalIcon}
                  menuNewBrowserIcon={MENU_NEW_BROWSER_ICON}
                  menuImportIcon={MENU_IMPORT_ICON}
                  menuCopyIcon={menuCopyIcon}
                  menuSettingsIcon={menuSettingsIcon}
                  menuGitDockIcon={MENU_GIT_DOCK_ICON}
                  menuBrowserContextIcon={MENU_BROWSER_CONTEXT_ICON}
                  browserContextDockDisabled={!hasEnvironmentBrowserContext}
                  onCreateDraftTab={handleCreateDraftTab}
                  onCreateTerminal={handleCreateTerminal}
                  onCreateBrowser={handleCreateBrowserTab}
                  onOpenGitDock={handleOpenGitDock}
                  onOpenBrowserContextDock={handleOpenBrowserContextDock}
                  onOpenImportSheet={openImportSheet}
                  onCopyWorkspacePath={handleCopyWorkspacePath}
                  onCopyBranchName={handleCopyBranchName}
                  onOpenSetupTab={handleOpenSetupTab}
                  onScriptTerminalStarted={handleScriptTerminalStarted}
                  onViewScriptTerminal={handleViewScriptTerminal}
                  onOpenUrlInBrowserTab={handleOpenUrlInBrowserTab}
                />
              </>
            ) : null
          }
          right={headerRight}
        />
      )}

      {isMobile ? (
        <MobileWorkspaceTabSwitcher
          tabs={tabs}
          activeTabKey={activeTabKey}
          activeTab={activeTabDescriptor}
          tabSwitcherOptions={tabSwitcherOptions}
          tabByKey={tabByKey}
          normalizedServerId={normalizedServerId}
          normalizedWorkspaceId={normalizedWorkspaceId}
          onSelectSwitcherTab={handleSelectSwitcherTab}
          onCopyResumeCommand={handleCopyResumeCommand}
          onCopyAgentId={handleCopyAgentId}
          onReloadAgent={handleReloadAgent}
          onRenameTab={handleRenameTab}
          onCloseTab={handleCloseTabById}
          onCloseTabsAbove={handleCloseTabsToLeft}
          onCloseTabsBelow={handleCloseTabsToRight}
          onCloseOtherTabs={handleCloseOtherTabs}
        />
      ) : null}

      <View
        style={styles.centerContent}
        testID="workspace-main-panel"
        onLayout={handleCenterContentLayout}
      >
        {isMobile ? (
          <GestureDetector
            gesture={explorerOpenGesture}
            touchAction={COMPACT_WEB_GESTURE_TOUCH_ACTION}
          >
            <View style={styles.content}>{content}</View>
          </GestureDetector>
        ) : (
          <View style={desktopContentStyle}>{desktopContent}</View>
        )}
        {!isMobile ? (
          <WorkspaceEnvironmentPanelRail
            visible={environmentRailVisible}
            serverId={normalizedServerId}
            workspaceDirectory={workspaceDirectory}
            currentBranchName={currentBranchName}
            isGitCheckout={isGitCheckout}
            isLocalDaemon={isLocalDaemon}
            diffStat={workspaceDescriptor?.diffStat ?? null}
            githubRuntime={workspaceDescriptor?.githubRuntime}
            browserContext={environmentBrowserContext}
            dockState={environmentDockState}
            sourceLabel={environmentSourceLabel}
            taskTitle={workspaceStatusStripModel.taskTitle}
            activityItems={workspaceActivityItems}
            activeAgent={environmentPanelAgent}
            workspaceStatus={environmentWorkspaceStatus}
            subagents={environmentSubagents}
            todoItems={environmentTodoItems}
            latestTurnChanges={environmentTurnChanges}
            onSelectDockTab={handleOpenWorkspaceDockPane}
            onOpenChanges={handleOpenEnvironmentChanges}
            onOpenSubagent={handleOpenEnvironmentSubagent}
            onCopyResumeCommand={handleCopyResumeCommand}
          />
        ) : null}
      </View>
    </View>
  );

  return (
    gatedWorkspaceScreen ?? (
      <WorkspaceFocusProvider workspaceKey={persistenceKey}>
        <View style={containerStyle}>
          <WorkspaceDocumentTitleEffectSlot
            tab={activeTabDescriptor}
            serverId={normalizedServerId}
            workspaceId={normalizedWorkspaceId}
            isRouteFocused={isRouteFocused}
          />
          <View style={styles.threePaneRow}>
            <FloatingPanelPortalHostNameProvider hostName={workspaceFloatingPanelPortalHostName}>
              {workspaceCenterColumn}
            </FloatingPanelPortalHostNameProvider>

            <FloatingPanelPortalHost name={workspaceFloatingPanelPortalHostName} />

            {showExplorerSidebar && workspaceDirectory ? (
              <ExplorerSidebar
                serverId={normalizedServerId}
                workspaceId={normalizedWorkspaceId}
                workspaceRoot={workspaceDirectory}
                isGit={isGitCheckout}
                onOpenFile={handleOpenFileFromExplorer}
              />
            ) : null}
          </View>
          <ImportSessionSheet
            visible={isImportSheetVisible}
            client={client}
            serverId={normalizedServerId}
            cwd={workspaceDirectory}
            onClose={closeImportSheet}
            onImportedAgent={handleImportedAgent}
          />
          <WorkspaceTabRenameModal
            renamingTab={renamingTab}
            onSubmit={handleRenameModalSubmit}
            onClose={handleRenameModalClose}
          />
        </View>
      </WorkspaceFocusProvider>
    )
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.surface0,
  },
  containerWorkspaceBackground: {
    backgroundColor: theme.colors.surfaceWorkspace,
  },
  threePaneRow: {
    flex: 1,
    minHeight: 0,
    position: "relative",
    flexDirection: "row",
    alignItems: "stretch",
    gap: 12,
    backgroundColor: "transparent",
    overflow: "hidden",
  },
  centerColumn: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    position: "relative",
  },
  headerTitle: {
    fontSize: theme.fontSize.base,
    fontWeight: {
      xs: "400",
      md: "300",
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
    gap: {
      xs: theme.spacing[1],
      md: theme.spacing[2],
    },
  },
  headerActionButton: {
    width: 32,
    height: 32,
    padding: 0,
    borderRadius: theme.borderRadius.xl,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.borderAccent,
    backgroundColor: theme.colors.surface0,
    alignItems: "center",
    justifyContent: "center",
    ...theme.shadow.sm,
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
    flexDirection: "row",
    alignItems: "center",
    gap: {
      xs: 0,
      md: theme.spacing[2],
    },
  },
  environmentPanel: {
    flex: 1,
  },
  environmentDockTabs: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[1],
    paddingBottom: theme.spacing[1],
  },
  environmentDockTab: {
    minHeight: 30,
    flex: 1,
    minWidth: 0,
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[1],
  },
  environmentDockTabActive: {
    backgroundColor: theme.colors.surface2,
  },
  environmentDockTabHovered: {
    backgroundColor: theme.colors.surface1,
  },
  environmentDockTabText: {
    minWidth: 0,
    flexShrink: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  environmentDockTabTextActive: {
    color: theme.colors.foreground,
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
  environmentCardHeader: {
    minHeight: 38,
    paddingRight: theme.spacing[1],
    paddingLeft: theme.spacing[1],
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
  },
  environmentCardHeaderTitle: {
    minWidth: 0,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  environmentCardHeaderText: {
    minWidth: 0,
    flex: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.normal,
  },
  environmentCardCloseButton: {
    width: 26,
    height: 26,
    padding: 0,
    borderRadius: theme.borderRadius.lg,
    alignItems: "center",
    justifyContent: "center",
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
  environmentValueText: {
    maxWidth: 120,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    textAlign: "right",
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
  environmentDivider: {
    height: theme.borderWidth[1],
    backgroundColor: theme.colors.border,
    marginHorizontal: theme.spacing[2],
    marginVertical: theme.spacing[2],
  },
  environmentCardDivider: {
    height: theme.borderWidth[1],
    backgroundColor: theme.colors.border,
    marginVertical: theme.spacing[3],
    marginHorizontal: theme.spacing[4],
  },
  environmentTaskSection: {
    gap: theme.spacing[1],
  },
  environmentTaskAction: {
    alignSelf: "flex-start",
    marginLeft: theme.spacing[2],
    marginTop: theme.spacing[1],
    minHeight: 26,
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
    alignItems: "center",
    justifyContent: "center",
  },
  environmentTaskActionHovered: {
    backgroundColor: theme.colors.surface2,
  },
  environmentTaskActionDisabled: {
    opacity: 0.5,
  },
  environmentTaskActionText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.normal,
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
  environmentOutlineCard: {
    marginTop: "auto",
    minHeight: 54,
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.xl,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
    ...theme.shadow.sm,
  },
  environmentOutlineText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.normal,
  },
  environmentSectionHeaderTrailing: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  environmentSectionBody: {
    gap: theme.spacing[1],
    paddingLeft: theme.spacing[2],
  },
  environmentActivityLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.normal,
    paddingHorizontal: theme.spacing[2],
  },
  environmentNestedRow: {
    minHeight: 24,
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  environmentNestedRowText: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xs,
  },
  environmentStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  environmentStatusDotRunning: {
    backgroundColor: theme.colors.palette.blue[500],
  },
  environmentStatusDotNeedsInput: {
    backgroundColor: theme.colors.palette.amber[500],
  },
  environmentStatusDotFailed: {
    backgroundColor: theme.colors.palette.red[500],
  },
  environmentStatusDotAttention: {
    backgroundColor: theme.colors.palette.green[500],
  },
  environmentStatusDotDone: {
    backgroundColor: theme.colors.border,
  },
  environmentPillRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  environmentPill: {
    paddingHorizontal: theme.spacing[1],
    paddingVertical: 1,
    borderRadius: theme.borderRadius.full,
  },
  environmentPillSuccess: {
    backgroundColor: "transparent",
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.palette.green[500],
  },
  environmentPillDanger: {
    backgroundColor: "transparent",
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.palette.red[500],
  },
  environmentPillWarning: {
    backgroundColor: "transparent",
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.palette.amber[500],
  },
  environmentPillText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  environmentTodoProgressTrack: {
    height: 4,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface2,
    marginHorizontal: theme.spacing[2],
    overflow: "hidden",
  },
  environmentTodoProgressFill: {
    height: "100%",
    backgroundColor: theme.colors.foreground,
  },
  environmentTodoBadge: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  environmentTodoBadgeComplete: {
    backgroundColor: theme.colors.foreground,
    borderColor: theme.colors.foreground,
  },
  environmentTodoBadgePending: {
    backgroundColor: "transparent",
  },
  environmentTodoNumber: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: theme.colors.surface2,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
    textAlign: "center",
    lineHeight: 18,
  },
  environmentTodoNumberComplete: {
    color: theme.colors.foregroundMuted,
    backgroundColor: "transparent",
  },
  environmentTodoTextComplete: {
    color: theme.colors.foregroundMuted,
    textDecorationLine: "line-through",
  },
  environmentMoreText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    paddingHorizontal: theme.spacing[2],
  },
  newTabActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  newTabActionButton: {
    width: 30,
    height: 30,
    borderRadius: theme.borderRadius.md,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
    alignItems: "center",
    justifyContent: "center",
  },
  newTabActionButtonHovered: {
    backgroundColor: theme.colors.surface2,
  },
  newTabTooltipText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.popoverForeground,
  },
  newTabTooltipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  newTabTooltipShortcut: {},
  tabsContainer: {
    marginHorizontal: theme.spacing[2],
    marginTop: theme.spacing[2],
    marginBottom: theme.spacing[1],
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.borderAccent,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: theme.colors.surface0,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
    ...theme.shadow.sm,
  },
  tabsScroll: {
    flex: 1,
    minWidth: 0,
  },
  tabsContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
  },
  tabsActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingRight: theme.spacing[2],
    paddingVertical: theme.spacing[1],
  },
  centerContent: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    position: "relative",
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: 14,
    backgroundColor: theme.colors.surface0,
    overflow: "hidden",
    ...theme.shadow.lg,
  },
  tab: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    maxWidth: 260,
  },
  tabHandle: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    flex: 1,
    minWidth: 0,
  },
  tabIcon: {
    flexShrink: 0,
  },
  tabActive: {
    backgroundColor: theme.colors.surface0,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.borderAccent,
    ...theme.shadow.sm,
  },
  tabHovered: {
    backgroundColor: theme.colors.surface2,
  },
  tabLabel: {
    flexShrink: 1,
    minWidth: 0,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.normal,
  },
  tabLabelWithCloseButton: {
    paddingRight: 0,
  },
  tabLabelActive: {
    color: theme.colors.foreground,
  },
  tabCloseButton: {
    width: 18,
    height: 18,
    marginLeft: 0,
    borderRadius: theme.borderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  tabCloseButtonShown: {
    opacity: 1,
  },
  tabCloseButtonHidden: {
    opacity: 0,
  },
  tabCloseButtonActive: {
    backgroundColor: theme.colors.surface3,
  },
  content: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    backgroundColor: theme.colors.surface0,
    position: "relative",
  },
  mobileMountedTabSlotVisible: {
    ...StyleSheet.absoluteFillObject,
    opacity: 1,
  },
  mobileMountedTabSlotHidden: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0,
  },
  contentPlaceholder: {
    flex: 1,
    minHeight: 0,
    backgroundColor: theme.colors.surface0,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[6],
  },
  emptyStateText: {
    color: theme.colors.foregroundMuted,
    textAlign: "center",
  },
}));

const containerWithWorkspaceBackgroundStyle = [
  styles.container,
  styles.containerWorkspaceBackground,
];

const EXPLORER_TOGGLE_KEYS: ShortcutKey[] = ["mod", "E"];
const ENVIRONMENT_TOGGLE_KEYS: ShortcutKey[] = [];
