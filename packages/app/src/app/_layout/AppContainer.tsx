import { type CSSProperties, type ReactNode, useCallback, useMemo } from "react";
import { Pressable, View, type PressableStateCallbackType } from "react-native";
import { usePathname } from "expo-router";
import { PanelLeft } from "lucide-react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { getIsElectronRuntime, useIsCompactFormFactor } from "@/constants/layout";
import { isNative } from "@/constants/platform";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useActiveWorktreeNewAction } from "@/hooks/use-active-worktree-new-action";
import { useGlobalNewWorkspaceAction } from "@/hooks/use-global-new-workspace-action";
import { useCompactWebViewportZoomLock } from "@/hooks/use-compact-web-viewport-zoom-lock";
import { useAppSettings } from "@/hooks/use-settings";
import { useHosts } from "@/runtime/host-runtime";
import { usePanelStore } from "@/stores/panel-store";
import { ACTIVE_THEME_NAMES, type ThemeName } from "@/styles/theme";
import { toggleDesktopSidebarsWithCheckoutIntent } from "@/utils/desktop-sidebar-toggle";
import { useWindowControlsPadding } from "@/utils/desktop-window";
import { resolveActiveHost } from "@/utils/active-host";
import { LeftSidebar } from "@/components/left-sidebar";
import { LiquidNeonBackdrop } from "@/components/liquid-neon-backdrop";
import { FloatingPanelPortalHost } from "@/components/ui/floating-panel-portal";
import { DownloadToast } from "@/components/download-toast";
import { RosettaCalloutSource } from "@/desktop/updates/rosetta-callout-source";
import { UpdateCalloutSource } from "@/desktop/updates/update-callout-source";
import { WorktreeSetupCalloutSource } from "@/components/worktree-setup-callout-source";
import { CommandCenter } from "@/components/command-center";
import { ProjectPickerModal } from "@/components/project-picker-modal";
import { ProviderSettingsHost } from "@/components/provider-settings-host";
import { WorkspaceShortcutTargetsSubscriber } from "@/components/workspace-shortcut-targets-subscriber";
import { WorkspaceSetupDialog } from "@/components/workspace-setup-dialog";
import { KeyboardShortcutsDialog } from "@/components/keyboard-shortcuts-dialog";
import { QuittingOverlay } from "@/components/quitting-overlay";
import { keyboardActionDispatcher } from "@/keyboard/keyboard-action-dispatcher";
import { appI18n } from "@/i18n";
import { MobileGestureWrapper } from "./MobileGesture";

export interface AppContainerProps {
  children: ReactNode;
  selectedAgentId?: string;
  chromeEnabled?: boolean;
}

export const THEME_CYCLE_ORDER: readonly ThemeName[] = ACTIVE_THEME_NAMES;

function AppContainer({
  children,
  selectedAgentId,
  chromeEnabled: chromeEnabledOverride,
}: AppContainerProps) {
  const { theme } = useUnistyles();
  const daemons = useHosts();
  const { settings, updateSettings } = useAppSettings();
  const toggleMobileAgentList = usePanelStore((state) => state.toggleMobileAgentList);
  const toggleDesktopAgentList = usePanelStore((state) => state.toggleDesktopAgentList);
  const openDesktopAgentList = usePanelStore((state) => state.openDesktopAgentList);
  const closeDesktopAgentList = usePanelStore((state) => state.closeDesktopAgentList);
  const closeDesktopFileExplorer = usePanelStore((state) => state.closeDesktopFileExplorer);
  const toggleFocusMode = usePanelStore((state) => state.toggleFocusMode);
  const isFocusModeEnabled = usePanelStore((state) => state.desktop.focusModeEnabled);

  const cycleTheme = useCallback(() => {
    const currentIndex = THEME_CYCLE_ORDER.indexOf(settings.theme as ThemeName);
    const nextIndex = (currentIndex + 1) % THEME_CYCLE_ORDER.length;
    void updateSettings({ theme: THEME_CYCLE_ORDER[nextIndex] });
  }, [settings.theme, updateSettings]);

  const isCompactLayout = useIsCompactFormFactor();
  useCompactWebViewportZoomLock(isCompactLayout);
  const chromeEnabled = chromeEnabledOverride ?? daemons.length > 0;
  const pathname = usePathname();
  const activeServerId = useMemo(
    () => resolveActiveHost({ hosts: daemons, pathname })?.serverId ?? null,
    [daemons, pathname],
  );
  const toggleAgentList = isCompactLayout ? toggleMobileAgentList : toggleDesktopAgentList;
  const toggleDesktopSidebars = useCallback(() => {
    const { desktop } = usePanelStore.getState();
    toggleDesktopSidebarsWithCheckoutIntent({
      isAgentListOpen: desktop.agentListOpen,
      isFileExplorerOpen: desktop.fileExplorerOpen,
      openAgentList: openDesktopAgentList,
      closeAgentList: closeDesktopAgentList,
      closeFileExplorer: closeDesktopFileExplorer,
      toggleFocusedFileExplorer: () =>
        keyboardActionDispatcher.dispatch({
          id: "sidebar.toggle.right",
          scope: "sidebar",
        }),
    });
  }, [closeDesktopAgentList, closeDesktopFileExplorer, openDesktopAgentList]);
  const restoreLeftSidebarFromFocusMode = useCallback(() => {
    if (usePanelStore.getState().desktop.focusModeEnabled) {
      toggleFocusMode();
    }
    openDesktopAgentList();
  }, [openDesktopAgentList, toggleFocusMode]);
  // TODO: stop matching pathname here as a branch. `chromeEnabled` should not
  // conflate workspace/project-specific chrome (sidebar, mobile gesture) with
  // global concerns like keyboard shortcuts. Split those out so settings (and
  // other non-workspace routes) don't need a special-case to keep shortcuts alive.
  const keyboardShortcutsEnabled = chromeEnabled || pathname.startsWith("/settings");
  const windowControlsPadding = useWindowControlsPadding("sidebar");
  const titlebarSpacerStyle = useMemo(
    () =>
      !isCompactLayout && windowControlsPadding.top > 0
        ? { height: windowControlsPadding.top, flexShrink: 0 }
        : null,
    [isCompactLayout, windowControlsPadding.top],
  );
  const appRowStyle = useMemo(
    () => [layoutStyles.appRow, !isCompactLayout && layoutStyles.desktopAppRow],
    [isCompactLayout],
  );
  const desktopSidebarRestoreButtonStyle = useCallback(
    ({ hovered, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      layoutStyles.desktopSidebarRestoreButton,
      (Boolean(hovered) || pressed) && layoutStyles.desktopSidebarRestoreButtonHovered,
    ],
    [],
  );

  useKeyboardShortcuts({
    enabled: keyboardShortcutsEnabled,
    isMobile: isCompactLayout,
    toggleAgentList,
    toggleBothSidebars: toggleDesktopSidebars,
    toggleFocusMode,
    cycleTheme,
  });

  useActiveWorktreeNewAction();
  useGlobalNewWorkspaceAction();

  const appRowContent = (
    <>
      {!isCompactLayout && chromeEnabled && !isFocusModeEnabled && (
        <LeftSidebar selectedAgentId={selectedAgentId} />
      )}
      {!isCompactLayout && chromeEnabled && isFocusModeEnabled ? (
        <View style={layoutStyles.desktopSidebarRestoreRail}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={appI18n.t("sidebar.openSidebar")}
            onPress={restoreLeftSidebarFromFocusMode}
            style={desktopSidebarRestoreButtonStyle}
            testID="desktop-left-sidebar-open-focus"
          >
            {({ hovered, pressed }) => (
              <PanelLeft
                size={20}
                color={hovered || pressed ? theme.colors.foreground : theme.colors.foregroundMuted}
              />
            )}
          </Pressable>
        </View>
      ) : null}
      <View style={layoutStyles.appContent}>{children}</View>
    </>
  );

  const content = (
    <View style={layoutStyles.surfaceFill}>
      <LiquidNeonBackdrop />
      <DesktopTitlebarDragStrip />
      {titlebarSpacerStyle ? <View style={titlebarSpacerStyle} /> : null}
      <View style={appRowStyle}>{appRowContent}</View>
      <FloatingPanelPortalHost />
      {isCompactLayout && chromeEnabled && <LeftSidebar selectedAgentId={selectedAgentId} />}
      <DownloadToast />
      <RosettaCalloutSource />
      <UpdateCalloutSource />
      <WorktreeSetupCalloutSource />
      <CommandCenter />
      <ProjectPickerModal />
      <ProviderSettingsHost />
      <WorkspaceShortcutTargetsSubscriber enabled={false} serverId={activeServerId} />
      <WorkspaceSetupDialog />
      <KeyboardShortcutsDialog />
      <QuittingOverlay />
    </View>
  );

  if (!isCompactLayout) {
    return content;
  }

  return <MobileGestureWrapper chromeEnabled={chromeEnabled}>{content}</MobileGestureWrapper>;
}

function DesktopTitlebarDragStrip() {
  const padding = useWindowControlsPadding("explorerSidebar");
  const stripStyle = useMemo<CSSProperties>(
    () => ({
      position: "absolute",
      top: 0,
      left: 0,
      right: padding.right,
      height: padding.top,
      WebkitAppRegion: "drag",
    }),
    [padding.right, padding.top],
  );

  if (isNative || !getIsElectronRuntime() || padding.top <= 0) {
    return null;
  }

  return <div style={stripStyle} />;
}

export const layoutStyles = StyleSheet.create((theme) => ({
  surfaceFill: {
    flex: 1,
    position: "relative",
    backgroundColor: theme.colors.surfaceWorkspace,
  },
  appRow: {
    flex: 1,
    flexDirection: "row",
  },
  desktopAppRow: {
    padding: 8,
    backgroundColor: theme.colors.surfaceWorkspace,
  },
  appContent: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
  desktopSidebarRestoreRail: {
    width: 44,
    alignSelf: "stretch",
    alignItems: "center",
    paddingTop: theme.spacing[3],
    borderRightWidth: theme.borderWidth[1],
    borderRightColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceWorkspace,
  },
  desktopSidebarRestoreButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
  },
  desktopSidebarRestoreButtonHovered: {
    backgroundColor: theme.colors.surface2,
  },
}));

export { AppContainer, DesktopTitlebarDragStrip };
