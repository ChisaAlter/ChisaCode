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
import { resolveAppSurfaceBackgrounds } from "./app-surface-backgrounds";

export interface AppContainerProps {
  children: ReactNode;
  selectedAgentId?: string;
  chromeEnabled?: boolean;
}

export const THEME_CYCLE_ORDER: readonly ThemeName[] = ACTIVE_THEME_NAMES;

const DESKTOP_WORKBENCH_FONT_CSS = `[data-testid="app-surface"] * {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
}`;

function AppContainer({
  children,
  selectedAgentId,
  chromeEnabled: chromeEnabledOverride,
}: AppContainerProps) {
  const { theme } = useUnistyles();
  const isCompactLayout = useIsCompactFormFactor();
  const surfaceBackgrounds = resolveAppSurfaceBackgrounds({
    frameEnabled: !isCompactLayout && getIsElectronRuntime(),
    glassEnabled: theme.glass.enabled,
    surfaceWorkspace: theme.colors.surfaceWorkspace,
    surface0: theme.colors.surface0,
    glassShell: theme.glass.shell,
    borderAccent: theme.colors.border,
  });
  const surfaceFillStyle = useMemo(
    () => [
      layoutStyles.surfaceFill,
      {
        backgroundColor: surfaceBackgrounds.root,
        borderWidth: surfaceBackgrounds.frameBorderWidth,
        borderColor: surfaceBackgrounds.frameBorderColor,
      },
    ],
    [
      surfaceBackgrounds.frameBorderColor,
      surfaceBackgrounds.frameBorderWidth,
      surfaceBackgrounds.root,
    ],
  );
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
  const desktopWorkbenchFontEnabled =
    !isCompactLayout && getIsElectronRuntime() && pathname.includes("/workspace/");
  const appRowStyle = useMemo(
    () => [
      layoutStyles.appRow,
      !isCompactLayout && { backgroundColor: surfaceBackgrounds.desktopRow },
    ],
    [isCompactLayout, surfaceBackgrounds.desktopRow],
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
    <View style={surfaceFillStyle} testID="app-surface">
      <DesktopWorkbenchFontStyle enabled={desktopWorkbenchFontEnabled} />
      <LiquidNeonBackdrop />
      <DesktopTitlebarDragStrip />
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

function DesktopWorkbenchFontStyle({ enabled }: { enabled: boolean }) {
  if (isNative || !enabled) {
    return null;
  }

  return <style>{DESKTOP_WORKBENCH_FONT_CSS}</style>;
}

function DesktopTitlebarDragStrip() {
  const padding = useWindowControlsPadding("titlebar");
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
  },
  // Soft: spacer is transparent clearance only (no white band / no hard divider).
  desktopTitlebarSpacer: {
    flexShrink: 0,
    backgroundColor: "transparent",
    borderBottomWidth: 0,
  },
  appRow: {
    flex: 1,
    flexDirection: "row",
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
    borderRadius: 10,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
  },
  desktopSidebarRestoreButtonHovered: {
    backgroundColor: theme.colors.surface1,
  },
}));

export { AppContainer, DesktopTitlebarDragStrip };
