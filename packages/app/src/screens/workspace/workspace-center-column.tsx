import {
  memo,
  useCallback,
  useMemo,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";

import { SidebarMenuToggle } from "@/components/headers/menu-header";
import { ScreenHeader } from "@/components/headers/screen-header";
import { SplitContainer } from "@/components/split-container";
import type { Theme } from "@/styles/theme";
import { resolveThemeWorkbenchSurfaceRoles } from "@/styles/workbench-surface-roles";
import { WorkspaceFocusProvider } from "@/workspace/focus";
import type { WorkspaceTabDescriptor } from "@/screens/workspace/workspace-tabs-types";
import {
  WorkspacePaneContent,
  type WorkspacePaneContentModel,
} from "@/screens/workspace/workspace-pane-content";
import {
  MobileWorkspaceTabSwitcher,
  getFallbackTabOptionDescription,
  getFallbackTabOptionLabel,
  type WorkspaceTabFallbackLabels,
} from "@/screens/workspace/workspace-mobile-tab-switcher";
import {
  WorkspaceHeaderRightControls,
  WorkspaceHeaderTitleBar,
  WorkspaceDesktopSoftTopbar,
} from "@/screens/workspace/workspace-header";
import { WorkspaceEnvironmentPanelRail } from "@/screens/workspace/workspace-environment-panel";
import { shouldShowMobileWorkspaceTabSwitcher } from "@/screens/workspace/workspace-tab-layout";
import { supportsDesktopPaneSplits } from "@/constants/layout";
import { getIsElectron, isWeb } from "@/constants/platform";

const COMPACT_WEB_GESTURE_TOUCH_ACTION = isWeb ? "auto" : "pan-y";
const ThemedActivityIndicator = withUnistyles(ActivityIndicator);
const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const GATED_WORKSPACE_HEADER_LEFT = <SidebarMenuToggle />;

type WorkspaceHeaderTitleBarInput = Omit<
  ComponentProps<typeof WorkspaceHeaderTitleBar>,
  | "activeTab"
  | "normalizedServerId"
  | "normalizedWorkspaceId"
  | "showCreateBrowserTab"
  | "isMobile"
  | "createTerminalDisabled"
  | "browserContextDockDisabled"
>;

type WorkspaceHeaderRightControlsInput = Omit<
  ComponentProps<typeof WorkspaceHeaderRightControls>,
  "isMobile" | "isEnvironmentPanelVisible"
>;

type WorkspaceMobileTabSwitcherInput = Omit<
  ComponentProps<typeof MobileWorkspaceTabSwitcher>,
  | "activeTabKey"
  | "activeTab"
  | "tabSwitcherOptions"
  | "tabByKey"
  | "normalizedServerId"
  | "normalizedWorkspaceId"
>;

type WorkspaceSplitContainerInput = Omit<
  ComponentProps<typeof SplitContainer>,
  | "layout"
  | "workspaceKey"
  | "focusModeEnabled"
  | "normalizedServerId"
  | "normalizedWorkspaceId"
  | "isWorkspaceFocused"
  | "showCreateBrowserTab"
  | "renderPaneEmptyState"
  | "topRightControls"
>;

type WorkspaceEnvironmentPanelInput = Omit<
  ComponentProps<typeof WorkspaceEnvironmentPanelRail>,
  "visible"
>;

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

interface WorkspaceContentInput {
  isMissingWorkspaceExecutionAuthority: boolean;
  activeTabDescriptor: WorkspaceTabDescriptor | null;
  hasHydratedAgents: boolean;
  mountedFocusedPaneTabIds: string[];
  focusedPaneTabDescriptorMap: Map<string, WorkspaceTabDescriptor>;
  isRouteFocused: boolean;
  focusedPaneId: string | null;
  buildMobilePaneContentModel: MobileMountedTabSlotProps["buildPaneContentModel"];
}

function WorkspaceContent({
  isMissingWorkspaceExecutionAuthority,
  activeTabDescriptor,
  hasHydratedAgents,
  mountedFocusedPaneTabIds,
  focusedPaneTabDescriptorMap,
  isRouteFocused,
  focusedPaneId,
  buildMobilePaneContentModel,
}: WorkspaceContentInput) {
  const { t } = useTranslation();

  if (isMissingWorkspaceExecutionAuthority) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyStateText}>{t("workspace.screen.workspaceExecutionMissing")}</Text>
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
        <Text style={styles.emptyStateText}>{t("workspace.screen.noTabsAvailable")}</Text>
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

interface WorkspaceCenterColumnProps {
  isMobile: boolean;
  isFocusModeEnabled: boolean;
  isRouteFocused: boolean;
  normalizedServerId: string;
  normalizedWorkspaceId: string;
  activeTabDescriptor: WorkspaceTabDescriptor | null;
  isMissingWorkspaceExecutionAuthority: boolean;
  hasHydratedAgents: boolean;
  mountedFocusedPaneTabIds: string[];
  focusedPaneTabDescriptorMap: Map<string, WorkspaceTabDescriptor>;
  focusedPaneId: string | null;
  buildMobilePaneContentModel: MobileMountedTabSlotProps["buildPaneContentModel"];
  workspaceLayout: ComponentProps<typeof SplitContainer>["layout"] | null;
  persistenceKey: string | null;
  explorerOpenGesture: ComponentProps<typeof GestureDetector>["gesture"];
  onCenterContentLayout: ComponentProps<typeof View>["onLayout"];
  isEnvironmentPanelVisible: boolean;
  isCreateTerminalPending: boolean;
  hasEnvironmentBrowserContext: boolean;
  headerTitleBar: WorkspaceHeaderTitleBarInput;
  headerRightControls: WorkspaceHeaderRightControlsInput;
  mobileTabSwitcher: WorkspaceMobileTabSwitcherInput;
  splitContainer: WorkspaceSplitContainerInput;
  environmentPanel: WorkspaceEnvironmentPanelInput;
}

/**
 * Renders the responsive workspace center column across mobile, web, and Electron.
 * @param props Prepared header, tab, pane, and environment view models
 * @returns The center-column view
 */
export function WorkspaceCenterColumn({
  isMobile,
  isFocusModeEnabled,
  isRouteFocused,
  normalizedServerId,
  normalizedWorkspaceId,
  activeTabDescriptor,
  isMissingWorkspaceExecutionAuthority,
  hasHydratedAgents,
  mountedFocusedPaneTabIds,
  focusedPaneTabDescriptorMap,
  focusedPaneId,
  buildMobilePaneContentModel,
  workspaceLayout,
  persistenceKey,
  explorerOpenGesture,
  onCenterContentLayout,
  isEnvironmentPanelVisible,
  isCreateTerminalPending,
  hasEnvironmentBrowserContext,
  headerTitleBar,
  headerRightControls,
  mobileTabSwitcher,
  splitContainer,
  environmentPanel,
}: WorkspaceCenterColumnProps) {
  const { t } = useTranslation();
  const showCreateBrowserTab = getIsElectron();
  const environmentRailVisible = !isMobile && isEnvironmentPanelVisible;
  const desktopFocusModeEnabled = isFocusModeEnabled && !isMobile;

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
      mobileTabSwitcher.tabs.map((tab) => ({
        id: tab.key,
        label: getFallbackTabOptionLabel(tab, fallbackLabels),
        description: getFallbackTabOptionDescription(tab, fallbackLabels),
      })),
    [fallbackLabels, mobileTabSwitcher.tabs],
  );
  const tabByKey = useMemo(() => {
    const map = new Map<string, WorkspaceTabDescriptor>();
    for (const tab of mobileTabSwitcher.tabs) {
      map.set(tab.key, tab);
    }
    return map;
  }, [mobileTabSwitcher.tabs]);

  const headerRight = useMemo(
    () => (
      <WorkspaceHeaderRightControls
        {...headerRightControls}
        isMobile={isMobile}
        isEnvironmentPanelVisible={isEnvironmentPanelVisible}
      />
    ),
    [headerRightControls, isEnvironmentPanelVisible, isMobile],
  );

  // Soft desktop topbar owns title + ctx pills + tools; tabs row keeps only tab chrome.
  const desktopSoftTopbar = useMemo(() => {
    if (isMobile) return null;
    return (
      <WorkspaceDesktopSoftTopbar
        {...headerTitleBar}
        {...headerRightControls}
        activeTab={activeTabDescriptor}
        normalizedServerId={normalizedServerId}
        normalizedWorkspaceId={normalizedWorkspaceId}
        showCreateBrowserTab={showCreateBrowserTab}
        createTerminalDisabled={isCreateTerminalPending}
        browserContextDockDisabled={!hasEnvironmentBrowserContext}
        isEnvironmentPanelVisible={isEnvironmentPanelVisible}
      />
    );
  }, [
    activeTabDescriptor,
    hasEnvironmentBrowserContext,
    headerRightControls,
    headerTitleBar,
    isCreateTerminalPending,
    isEnvironmentPanelVisible,
    isMobile,
    normalizedServerId,
    normalizedWorkspaceId,
    showCreateBrowserTab,
  ]);

  const content = useMemo(
    () => (
      <WorkspaceContent
        isMissingWorkspaceExecutionAuthority={isMissingWorkspaceExecutionAuthority}
        activeTabDescriptor={activeTabDescriptor}
        hasHydratedAgents={hasHydratedAgents}
        mountedFocusedPaneTabIds={mountedFocusedPaneTabIds}
        focusedPaneTabDescriptorMap={focusedPaneTabDescriptorMap}
        isRouteFocused={isRouteFocused}
        focusedPaneId={focusedPaneId}
        buildMobilePaneContentModel={buildMobilePaneContentModel}
      />
    ),
    [
      activeTabDescriptor,
      buildMobilePaneContentModel,
      focusedPaneId,
      focusedPaneTabDescriptorMap,
      hasHydratedAgents,
      isMissingWorkspaceExecutionAuthority,
      isRouteFocused,
      mountedFocusedPaneTabIds,
    ],
  );
  const renderSplitPaneEmptyState = useCallback(
    () => (
      <View style={styles.emptyState}>
        <Text style={styles.emptyStateText}>{t("workspace.screen.emptyPane")}</Text>
      </View>
    ),
    [t],
  );
  const desktopContent = useMemo(() => {
    if (!supportsDesktopPaneSplits() || !workspaceLayout || !persistenceKey) {
      return content;
    }
    return (
      <SplitContainer
        {...splitContainer}
        layout={workspaceLayout}
        workspaceKey={persistenceKey}
        focusModeEnabled={desktopFocusModeEnabled}
        normalizedServerId={normalizedServerId}
        normalizedWorkspaceId={normalizedWorkspaceId}
        isWorkspaceFocused={isRouteFocused}
        showCreateBrowserTab={showCreateBrowserTab}
        renderPaneEmptyState={renderSplitPaneEmptyState}
        // Soft topbar owns explorer/env/more; keep tab-row trailing empty on desktop.
        topRightControls={null}
      />
    );
  }, [
    content,
    desktopFocusModeEnabled,
    isRouteFocused,
    normalizedServerId,
    normalizedWorkspaceId,
    persistenceKey,
    renderSplitPaneEmptyState,
    showCreateBrowserTab,
    splitContainer,
    workspaceLayout,
  ]);

  return (
    <View style={styles.centerColumn}>
      {desktopSoftTopbar}
      {isMobile ? (
        <ScreenHeader
          left={
            <>
              <SidebarMenuToggle />
              <WorkspaceHeaderTitleBar
                {...headerTitleBar}
                activeTab={activeTabDescriptor}
                normalizedServerId={normalizedServerId}
                normalizedWorkspaceId={normalizedWorkspaceId}
                showCreateBrowserTab={showCreateBrowserTab}
                isMobile={isMobile}
                createTerminalDisabled={isCreateTerminalPending}
                browserContextDockDisabled={!hasEnvironmentBrowserContext}
              />
            </>
          }
          right={headerRight}
        />
      ) : null}

      {isMobile && shouldShowMobileWorkspaceTabSwitcher(mobileTabSwitcher.tabs.length) ? (
        <MobileWorkspaceTabSwitcher
          {...mobileTabSwitcher}
          activeTabKey={activeTabDescriptor?.tabId ?? ""}
          activeTab={activeTabDescriptor}
          tabSwitcherOptions={tabSwitcherOptions}
          tabByKey={tabByKey}
          normalizedServerId={normalizedServerId}
          normalizedWorkspaceId={normalizedWorkspaceId}
        />
      ) : null}

      <View
        style={styles.centerContent}
        testID="workspace-main-panel"
        onLayout={onCenterContentLayout}
      >
        {isMobile ? (
          <GestureDetector
            gesture={explorerOpenGesture}
            touchAction={COMPACT_WEB_GESTURE_TOUCH_ACTION}
          >
            <View style={styles.content}>{content}</View>
          </GestureDetector>
        ) : (
          <View style={styles.content}>{desktopContent}</View>
        )}
      </View>
      {!isMobile ? (
        <WorkspaceEnvironmentPanelRail {...environmentPanel} visible={environmentRailVisible} />
      ) : null}
    </View>
  );
}

/**
 * Renders a route-state gate inside the standard workspace shell.
 * @param props Gate content and optional workspace focus key
 * @returns The gate shell, or null when no gate is active
 */
export function WorkspaceScreenGateShell({
  gate,
  workspaceKey,
}: {
  gate: ReactNode;
  workspaceKey: string | null;
}): ReactElement | null {
  if (!gate) {
    return null;
  }

  return (
    <WorkspaceFocusProvider workspaceKey={workspaceKey}>
      <View style={styles.container}>
        <View style={styles.threePaneRow}>
          <View style={styles.centerColumn}>
            <ScreenHeader left={GATED_WORKSPACE_HEADER_LEFT} />
            <View style={styles.centerContent}>{gate}</View>
          </View>
        </View>
      </View>
    </WorkspaceFocusProvider>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    backgroundColor: resolveThemeWorkbenchSurfaceRoles(theme).content,
  },
  threePaneRow: {
    flex: 1,
    minHeight: 0,
    position: "relative",
    flexDirection: "row",
    alignItems: "stretch",
    gap: 0,
    backgroundColor: "transparent",
    overflow: "hidden",
  },
  centerColumn: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    position: "relative",
  },
  centerContent: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    position: "relative",

    backgroundColor: resolveThemeWorkbenchSurfaceRoles(theme).content,
    overflow: "hidden",
  },
  content: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    backgroundColor: resolveThemeWorkbenchSurfaceRoles(theme).content,
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
