import { router, usePathname } from "expo-router";
import {
  GitCompare,
  MessageSquareText,
  MessagesSquare,
  PanelLeft,
  PanelLeftClose,
  Search,
  Settings,
  SquarePen,
  SquareTerminal,
  X,
  type LucideIcon,
} from "lucide-react-native";
import {
  type Dispatch,
  memo,
  type ReactElement,
  type RefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Pressable,
  StyleSheet as RNStyleSheet,
  Text,
  useWindowDimensions,
  View,
  type PressableStateCallbackType,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  createAnimatedComponent,
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/shallow";
import { TitlebarDragRegion } from "@/components/desktop/titlebar-drag-region";
import { Combobox, ComboboxItem, type ComboboxOption } from "@/components/ui/combobox";
import { useIsCompactFormFactor } from "@/constants/layout";
import { isWeb } from "@/constants/platform";
import { useSidebarAnimation } from "@/contexts/sidebar-animation-context";
import { useAgentHistory } from "@/hooks/use-agent-history";
import { useOpenProjectPicker } from "@/hooks/use-open-project-picker";
import { useResolveWorkspaceIdByCwd, useWorkspaceFields } from "@/stores/session-store-hooks";
import { useSessionStore } from "@/stores/session-store";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { useHostRuntimeSnapshot, useHosts } from "@/runtime/host-runtime";
import {
  DEFAULT_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  selectIsAgentListOpen,
  usePanelStore,
} from "@/stores/panel-store";
import { useKeyboardShortcutsStore } from "@/stores/keyboard-shortcuts-store";
import { resolveActiveHost } from "@/utils/active-host";
import { formatConnectionStatus } from "@/utils/daemons";
import {
  buildMobileSidebarQuickActionButtons,
  buildMobileSidebarQuickActionModel,
  resolveMobileSidebarQuickActionAgentLabel,
  resolveMobileSidebarQuickActionAgentTarget,
  selectMobileSidebarQuickActionAgent,
  type MobileSidebarQuickActionButtonModel,
  type MobileSidebarQuickActionId,
} from "@/utils/mobile-sidebar-quick-actions";
import { getMobileSidebarWidth } from "@/utils/sidebar-animation-state";
import {
  buildHostSessionsRoute,
  buildSettingsRoute,
  mapPathnameToServer,
} from "@/utils/host-routes";
import {
  collectSidebarDraftSessions,
  resolveLeftSidebarNewConversationRoute,
  type SidebarSessionDraft,
} from "@/utils/left-sidebar-drafts";
import { navigateToAgent } from "@/utils/navigate-to-agent";
import { SidebarAgentListSkeleton } from "./sidebar-agent-list-skeleton";
import { SidebarSessionList } from "./sidebar-session-list";

const MIN_CHAT_WIDTH = 400;
const DESKTOP_SIDEBAR_GAP = 12;
const DESKTOP_SIDEBAR_ANIMATION_CONFIG = {
  duration: 180,
  easing: Easing.out(Easing.cubic),
};
const AnimatedPressable = createAnimatedComponent(Pressable);

type SidebarTheme = ReturnType<typeof useUnistyles>["theme"];

interface LeftSidebarProps {
  selectedAgentId?: string;
}

interface SidebarSharedProps {
  theme: SidebarTheme;
  activeServerId: string | null;
  activeHostLabel: string;
  activeHostStatusColor: string;
  hostOptions: ComboboxOption[];
  hostTriggerRef: RefObject<View | null>;
  isHostPickerOpen: boolean;
  setIsHostPickerOpen: Dispatch<SetStateAction<boolean>>;
  agents: ReturnType<typeof useAgentHistory>["agents"];
  drafts: SidebarSessionDraft[];
  selectedAgentId?: string;
  isInitialLoad: boolean;
  isRevalidating: boolean;
  isLoadingMore: boolean;
  isManualRefresh: boolean;
  hasMore: boolean;
  handleRefresh: () => void;
  handleLoadMore: () => void;
  handleHostSelect: (nextServerId: string) => void;
  handleOpenProject: () => void;
  handleSearch: () => void;
  handleSettings: () => void;
  renderHostOption: (input: {
    option: ComboboxOption;
    selected: boolean;
    active: boolean;
    onPress: () => void;
  }) => ReactElement;
}

interface MobileSidebarProps extends SidebarSharedProps {
  insetsTop: number;
  insetsBottom: number;
  isOpen: boolean;
  closeToAgent: () => void;
  handleViewMoreNavigate: () => void;
}

interface DesktopSidebarProps extends SidebarSharedProps {
  insetsTop: number;
  isOpen: boolean;
}

export const LeftSidebar = memo(function LeftSidebar({ selectedAgentId }: LeftSidebarProps) {
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  const isCompactLayout = useIsCompactFormFactor();
  const isOpen = usePanelStore((state) =>
    selectIsAgentListOpen(state, { isCompact: isCompactLayout }),
  );
  const showMobileAgent = usePanelStore((state) => state.showMobileAgent);
  const pathname = usePathname();
  const daemons = useHosts();
  const activeDaemon = useMemo(
    () => resolveActiveHost({ hosts: daemons, pathname }),
    [daemons, pathname],
  );
  const activeServerId = activeDaemon?.serverId ?? null;
  const activeHostLabel = useMemo(() => {
    if (!activeDaemon) return "No host";
    const trimmed = activeDaemon.label?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : activeDaemon.serverId;
  }, [activeDaemon]);
  const activeHostSnapshot = useHostRuntimeSnapshot(activeServerId ?? "");
  const activeHostStatus = activeServerId
    ? (activeHostSnapshot?.connectionStatus ?? "connecting")
    : "idle";
  let activeHostStatusColor: string;
  if (activeHostStatus === "online") activeHostStatusColor = theme.colors.palette.green[400];
  else if (activeHostStatus === "connecting")
    activeHostStatusColor = theme.colors.palette.amber[500];
  else activeHostStatusColor = theme.colors.palette.red[500];
  const hostOptions = useMemo(
    () =>
      daemons.map((daemon) => ({
        id: daemon.serverId,
        label: daemon.label?.trim() || daemon.serverId,
      })),
    [daemons],
  );
  const renderHostOption = useCallback(
    ({
      option,
      selected,
      active,
      onPress,
    }: {
      option: ComboboxOption;
      selected: boolean;
      active: boolean;
      onPress: () => void;
    }) => (
      <HostSwitchOption
        serverId={option.id}
        label={option.label}
        selected={selected}
        active={active}
        onPress={onPress}
      />
    ),
    [],
  );
  const hostTriggerRef = useRef<View | null>(null);
  const [isHostPickerOpen, setIsHostPickerOpen] = useState(false);

  const { agents, isInitialLoad, isRevalidating, isLoadingMore, hasMore, refreshAll, loadMore } =
    useAgentHistory({
      serverId: activeServerId,
      enabled: isCompactLayout || isOpen,
    });
  const layoutByWorkspace = useWorkspaceLayoutStore((state) => state.layoutByWorkspace);
  const draftWorkspaceMetadataEntries = useSessionStore(
    useShallow((state) => {
      const workspaces = activeServerId ? state.sessions[activeServerId]?.workspaces : null;
      if (!workspaces) {
        return [];
      }

      const entries: string[] = [];
      for (const workspace of workspaces.values()) {
        entries.push(`${workspace.id}\u0000${workspace.workspaceDirectory}`);
      }
      entries.sort();
      return entries;
    }),
  );
  const draftWorkspaceMetadata = useMemo(() => {
    const metadata: Record<string, { workspaceDirectory: string | null }> = {};
    for (const entry of draftWorkspaceMetadataEntries) {
      const separatorIndex = entry.indexOf("\u0000");
      if (separatorIndex < 0) {
        continue;
      }
      const workspaceId = entry.slice(0, separatorIndex);
      const workspaceDirectory = entry.slice(separatorIndex + 1);
      metadata[workspaceId] = { workspaceDirectory };
    }
    return metadata;
  }, [draftWorkspaceMetadataEntries]);
  const drafts = useMemo(
    () =>
      collectSidebarDraftSessions({
        activeServerId,
        layoutByWorkspace,
        workspacesById: draftWorkspaceMetadata,
      }),
    [activeServerId, draftWorkspaceMetadata, layoutByWorkspace],
  );

  const [isManualRefresh, setIsManualRefresh] = useState(false);

  const handleRefresh = useCallback(() => {
    setIsManualRefresh(true);
    refreshAll();
  }, [refreshAll]);

  const handleLoadMore = useCallback(() => {
    loadMore();
  }, [loadMore]);

  useEffect(() => {
    if (!isRevalidating && isManualRefresh) {
      setIsManualRefresh(false);
    }
  }, [isRevalidating, isManualRefresh]);

  const openProjectPicker = useOpenProjectPicker(activeServerId);

  const openCurrentWorkspaceDraft = useCallback(() => {
    const draftRoute = resolveLeftSidebarNewConversationRoute({
      activeServerId,
      pathname,
    });
    if (!draftRoute) {
      return false;
    }
    router.push(draftRoute);
    return true;
  }, [activeServerId, pathname]);

  const handleOpenProjectMobile = useCallback(() => {
    showMobileAgent();
    if (openCurrentWorkspaceDraft()) {
      return;
    }
    void openProjectPicker();
  }, [openCurrentWorkspaceDraft, openProjectPicker, showMobileAgent]);

  const handleOpenProjectDesktop = useCallback(() => {
    if (openCurrentWorkspaceDraft()) {
      return;
    }
    void openProjectPicker();
  }, [openCurrentWorkspaceDraft, openProjectPicker]);

  const handleSearch = useCallback(() => {
    useKeyboardShortcutsStore.getState().setCommandCenterOpen(true);
  }, []);

  const handleSettingsMobile = useCallback(() => {
    showMobileAgent();
    router.push(buildSettingsRoute());
  }, [showMobileAgent]);

  const handleSettingsDesktop = useCallback(() => {
    router.push(buildSettingsRoute());
  }, []);

  const handleViewMoreNavigate = useCallback(() => {
    if (!activeServerId) {
      return;
    }
    router.push(buildHostSessionsRoute(activeServerId));
  }, [activeServerId]);

  const handleHostSelect = useCallback(
    (nextServerId: string) => {
      if (!nextServerId) {
        return;
      }
      const nextPath = mapPathnameToServer(pathname, nextServerId);
      setIsHostPickerOpen(false);
      router.push(nextPath);
    },
    [pathname],
  );

  const sharedProps = {
    theme,
    activeServerId,
    activeHostLabel,
    activeHostStatusColor,
    hostOptions,
    hostTriggerRef,
    isHostPickerOpen,
    setIsHostPickerOpen,
    agents,
    drafts,
    selectedAgentId,
    isInitialLoad,
    isRevalidating,
    isLoadingMore,
    isManualRefresh,
    hasMore,
    handleRefresh,
    handleLoadMore,
    handleHostSelect,
    renderHostOption,
    handleSearch,
  };

  if (isCompactLayout) {
    return (
      <MobileSidebar
        {...sharedProps}
        insetsTop={insets.top}
        insetsBottom={insets.bottom}
        isOpen={isOpen}
        closeToAgent={showMobileAgent}
        handleOpenProject={handleOpenProjectMobile}
        handleSettings={handleSettingsMobile}
        handleViewMoreNavigate={handleViewMoreNavigate}
      />
    );
  }

  return (
    <DesktopSidebar
      {...sharedProps}
      insetsTop={insets.top}
      isOpen={isOpen}
      handleOpenProject={handleOpenProjectDesktop}
      handleSettings={handleSettingsDesktop}
    />
  );
});

interface HostPickerTriggerProps {
  triggerRef: React.Ref<View>;
  setIsHostPickerOpen: Dispatch<SetStateAction<boolean>>;
  hostOptionsEmpty: boolean;
  hostStatusDotStyle: StyleProp<ViewStyle>;
  activeHostLabel: string;
}

function HostPickerTrigger({
  triggerRef,
  setIsHostPickerOpen,
  hostOptionsEmpty,
  hostStatusDotStyle,
  activeHostLabel,
}: HostPickerTriggerProps) {
  const pressableStyle = useCallback(
    ({ hovered = false }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.hostTrigger,
      hovered && styles.hostTriggerHovered,
    ],
    [],
  );
  const handlePress = useCallback(() => setIsHostPickerOpen(true), [setIsHostPickerOpen]);
  return (
    <Pressable
      ref={triggerRef}
      style={pressableStyle}
      onPress={handlePress}
      disabled={hostOptionsEmpty}
    >
      <View style={hostStatusDotStyle} />
      <Text style={styles.hostTriggerText} numberOfLines={1}>
        {activeHostLabel}
      </Text>
    </Pressable>
  );
}

function HostSwitchOption({
  serverId,
  label,
  selected,
  active,
  onPress,
}: {
  serverId: string;
  label: string;
  selected: boolean;
  active: boolean;
  onPress: () => void;
}) {
  const snapshot = useHostRuntimeSnapshot(serverId);
  const connectionStatus = snapshot?.connectionStatus ?? "connecting";

  return (
    <ComboboxItem
      label={label}
      description={formatConnectionStatus(connectionStatus)}
      selected={selected}
      active={active}
      onPress={onPress}
    />
  );
}

function FooterIconButton({
  onPress,
  testID,
  accessibilityLabel,
  icon: Icon,
  theme,
  variant = "mobile",
}: {
  onPress: () => void;
  testID: string;
  accessibilityLabel: string;
  icon: LucideIcon;
  theme: SidebarTheme;
  variant?: "mobile" | "desktop";
}) {
  const buttonStyle = useCallback(
    ({ hovered, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.footerIconButton,
      variant === "desktop" && styles.desktopFooterIconButton,
      (hovered || pressed) && styles.footerIconButtonHovered,
    ],
    [variant],
  );
  return (
    <Pressable
      style={buttonStyle}
      testID={testID}
      nativeID={testID}
      collapsable={false}
      accessible
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
    >
      {({ hovered }) => (
        <Icon
          size={theme.iconSize.md}
          color={hovered ? theme.colors.foreground : theme.colors.foregroundMuted}
        />
      )}
    </Pressable>
  );
}

function SidebarTopActions({
  onCloseSidebar,
  onViewSessions,
  onNewConversation,
  onSearch,
}: {
  onCloseSidebar: () => void;
  onViewSessions: () => void;
  onNewConversation: () => void;
  onSearch: () => void;
}) {
  const { t } = useTranslation();

  return (
    <View style={styles.sidebarTopArea}>
      <View style={styles.sidebarTopActions}>
        <SidebarTopAction
          icon={PanelLeftClose}
          label={t("sidebar.closeSidebar")}
          onPress={onCloseSidebar}
          testID="sidebar-close-left"
        />
        <SidebarTopAction
          icon={MessagesSquare}
          label={t("sidebar.allSessions")}
          onPress={onViewSessions}
          testID="sidebar-all-sessions"
        />
      </View>
      <View style={styles.sidebarPrimaryActions}>
        <SidebarPrimaryAction
          icon={SquarePen}
          label={t("sidebar.newConversation")}
          onPress={onNewConversation}
          testID="sidebar-new-conversation"
        />
        <SidebarPrimaryAction
          icon={Search}
          label={t("common.search")}
          onPress={onSearch}
          testID="sidebar-search"
        />
      </View>
    </View>
  );
}

function SidebarTopAction({
  icon: Icon,
  label,
  onPress,
  testID,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  testID: string;
}) {
  const { theme } = useUnistyles();
  const actionStyle = useCallback(
    ({ hovered, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.sidebarTopAction,
      (Boolean(hovered) || pressed) && styles.sidebarTopActionHovered,
    ],
    [],
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={actionStyle}
      testID={testID}
    >
      {({ hovered, pressed }) => {
        const color = hovered || pressed ? theme.colors.foreground : theme.colors.foregroundMuted;
        return (
          <View style={styles.sidebarTopActionIconSlot}>
            <Icon size={theme.iconSize.sm} color={color} />
          </View>
        );
      }}
    </Pressable>
  );
}

function SidebarPrimaryAction({
  icon: Icon,
  label,
  onPress,
  testID,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  testID: string;
}) {
  const { theme } = useUnistyles();
  const actionStyle = useCallback(
    ({ hovered, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.sidebarPrimaryAction,
      (Boolean(hovered) || pressed) && styles.sidebarPrimaryActionHovered,
    ],
    [],
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={actionStyle}
      testID={testID}
    >
      {({ hovered, pressed }) => {
        const color = hovered || pressed ? theme.colors.foreground : theme.colors.foregroundMuted;
        return (
          <>
            <Icon size={theme.iconSize.sm} color={color} />
            <Text style={styles.sidebarPrimaryActionText} numberOfLines={1}>
              {label}
            </Text>
          </>
        );
      }}
    </Pressable>
  );
}

function SidebarFooter({
  theme,
  activeServerId,
  activeHostLabel,
  hostStatusDotStyle,
  hostOptions,
  hostTriggerRef,
  isHostPickerOpen,
  setIsHostPickerOpen,
  handleHostSelect,
  renderHostOption,
  handleSettings,
  variant = "mobile",
}: {
  theme: SidebarTheme;
  activeServerId: string | null;
  activeHostLabel: string;
  hostStatusDotStyle: StyleProp<ViewStyle>;
  hostOptions: ComboboxOption[];
  hostTriggerRef: RefObject<View | null>;
  isHostPickerOpen: boolean;
  setIsHostPickerOpen: Dispatch<SetStateAction<boolean>>;
  handleHostSelect: (nextServerId: string) => void;
  renderHostOption: SidebarSharedProps["renderHostOption"];
  handleSettings: () => void;
  variant?: "mobile" | "desktop";
}) {
  const { t } = useTranslation();
  const footerStyle = useMemo(
    () => [styles.sidebarFooter, variant === "desktop" && styles.desktopSidebarFooter],
    [variant],
  );
  const iconRowStyle = useMemo(
    () => [styles.footerIconRow, variant === "desktop" && styles.desktopFooterIconRow],
    [variant],
  );
  return (
    <View style={footerStyle}>
      <View style={styles.footerHostSlot}>
        <HostPickerTrigger
          triggerRef={hostTriggerRef}
          setIsHostPickerOpen={setIsHostPickerOpen}
          hostOptionsEmpty={hostOptions.length === 0}
          hostStatusDotStyle={hostStatusDotStyle}
          activeHostLabel={activeHostLabel}
        />
      </View>
      <View style={iconRowStyle}>
        <FooterIconButton
          onPress={handleSettings}
          testID="sidebar-settings"
          accessibilityLabel={t("sidebar.settings")}
          icon={Settings}
          theme={theme}
          variant={variant}
        />
      </View>
      <Combobox
        options={hostOptions}
        value={activeServerId ?? ""}
        onSelect={handleHostSelect}
        renderOption={renderHostOption}
        searchable={false}
        title={t("host.switchHost")}
        searchPlaceholder={t("sidebar.searchHosts")}
        desktopMinWidth={280}
        open={isHostPickerOpen}
        onOpenChange={setIsHostPickerOpen}
        anchorRef={hostTriggerRef}
      />
    </View>
  );
}

function MobileSidebarQuickActions({
  agent,
  buttons,
  theme,
  onOpenAgent,
  onViewChanges,
  onOpenTerminal,
  onViewMore,
  onClose,
}: {
  agent: SidebarSharedProps["agents"][number] | null;
  buttons: MobileSidebarQuickActionButtonModel[];
  theme: SidebarTheme;
  onOpenAgent: () => void;
  onViewChanges: () => void;
  onOpenTerminal: () => void;
  onViewMore: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  if (!agent) {
    return null;
  }
  const agentLabel = resolveMobileSidebarQuickActionAgentLabel(agent);
  const actions = {
    resume: {
      icon: MessageSquareText,
      label: t("sidebar.resumeSession"),
      accessibilityLabel: t("sidebar.resumeSessionLabel", { title: agentLabel }),
      testID: "mobile-sidebar-quick-resume",
      onPress: onOpenAgent,
    },
    changes: {
      icon: GitCompare,
      label: t("sidebar.viewChanges"),
      accessibilityLabel: t("sidebar.viewChangesLabel", { title: agentLabel }),
      testID: "mobile-sidebar-quick-changes",
      onPress: onViewChanges,
    },
    terminal: {
      icon: SquareTerminal,
      label: t("sidebar.openTerminal"),
      accessibilityLabel: t("sidebar.openTerminalLabel", { title: agentLabel }),
      testID: "mobile-sidebar-quick-terminal",
      onPress: onOpenTerminal,
    },
    sessions: {
      icon: MessagesSquare,
      label: t("sidebar.allSessions"),
      accessibilityLabel: t("sidebar.allSessionsLabel", { title: agentLabel }),
      testID: "mobile-sidebar-quick-sessions",
      onPress: onViewMore,
    },
    close: {
      icon: PanelLeftClose,
      label: t("sidebar.closeSidebar"),
      accessibilityLabel: t("sidebar.closeSidebar"),
      testID: "mobile-sidebar-quick-close",
      onPress: onClose,
    },
  } satisfies Record<
    MobileSidebarQuickActionId,
    {
      icon: LucideIcon;
      label: string;
      accessibilityLabel: string;
      testID: string;
      onPress: () => void;
    }
  >;

  return (
    <View style={styles.mobileQuickActions} testID="mobile-sidebar-quick-actions">
      <View style={styles.mobileQuickActionsTextGroup}>
        <Text style={styles.mobileQuickActionsLabel}>{t("sidebar.currentFocus")}</Text>
        <Text style={styles.mobileQuickActionsTitle} numberOfLines={1}>
          {agentLabel}
        </Text>
      </View>
      <View style={styles.mobileQuickActionsButtons}>
        {buttons.map((button) => {
          const action = actions[button.id];
          return (
            <MobileQuickActionButton
              key={button.id}
              icon={action.icon}
              label={action.label}
              accessibilityLabel={action.accessibilityLabel}
              testID={action.testID}
              theme={theme}
              variant={button.variant}
              onPress={action.onPress}
            />
          );
        })}
      </View>
    </View>
  );
}

function MobileQuickActionButton({
  icon: Icon,
  label,
  accessibilityLabel,
  testID,
  theme,
  variant = "secondary",
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  accessibilityLabel?: string;
  testID: string;
  theme: SidebarTheme;
  variant?: "primary" | "secondary";
  onPress: () => void;
}) {
  const resolveIconColor = useCallback(
    (hovered?: boolean, pressed?: boolean) =>
      variant === "primary" || hovered || pressed
        ? theme.colors.foreground
        : theme.colors.foregroundMuted,
    [theme.colors.foreground, theme.colors.foregroundMuted, variant],
  );
  const buttonStyle = useCallback(
    ({ hovered, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.mobileQuickActionButton,
      variant === "primary" && styles.mobileQuickActionPrimaryButton,
      variant === "secondary" && styles.mobileQuickActionSecondaryButton,
      (hovered || pressed) && styles.mobileQuickActionButtonHovered,
    ],
    [variant],
  );
  const textStyle = useMemo(
    () => [
      styles.mobileQuickActionText,
      variant === "primary" && styles.mobileQuickActionPrimaryText,
    ],
    [variant],
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      style={buttonStyle}
      testID={testID}
    >
      {({ hovered, pressed }) => (
        <>
          <View style={styles.mobileQuickActionIcon}>
            <Icon size={theme.iconSize.sm} color={resolveIconColor(hovered, pressed)} />
          </View>
          <Text style={textStyle} numberOfLines={1} ellipsizeMode="tail">
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

function MobileSidebar({
  theme,
  activeServerId,
  activeHostLabel,
  activeHostStatusColor,
  hostOptions,
  hostTriggerRef,
  isHostPickerOpen,
  setIsHostPickerOpen,
  agents,
  drafts,
  selectedAgentId,
  isInitialLoad,
  isRevalidating,
  isLoadingMore,
  isManualRefresh,
  hasMore,
  handleRefresh,
  handleLoadMore,
  handleHostSelect,
  renderHostOption,
  handleOpenProject,
  handleSearch,
  handleSettings,
  insetsTop,
  insetsBottom,
  isOpen,
  closeToAgent,
  handleViewMoreNavigate,
}: MobileSidebarProps) {
  const { t } = useTranslation();
  const {
    translateX,
    backdropOpacity,
    windowWidth,
    animateToOpen,
    animateToClose,
    isGesturing,
    gestureAnimatingRef,
    closeGestureRef,
  } = useSidebarAnimation();
  const mobileSidebarWidth = useMemo(() => getMobileSidebarWidth(windowWidth), [windowWidth]);
  const closeTouchStartX = useSharedValue(0);
  const closeTouchStartY = useSharedValue(0);

  const handleCloseFromGesture = useCallback(() => {
    gestureAnimatingRef.current = true;
    closeToAgent();
  }, [closeToAgent, gestureAnimatingRef]);

  const handleViewMore = useCallback(() => {
    if (!activeServerId) {
      return;
    }
    translateX.value = -mobileSidebarWidth;
    backdropOpacity.value = 0;
    closeToAgent();
    handleViewMoreNavigate();
  }, [
    activeServerId,
    backdropOpacity,
    closeToAgent,
    handleViewMoreNavigate,
    translateX,
    mobileSidebarWidth,
  ]);

  const handleAgentPress = useCallback(() => {
    closeToAgent();
  }, [closeToAgent]);
  const quickActionAgent = useMemo(() => {
    return selectMobileSidebarQuickActionAgent(agents, selectedAgentId, activeServerId);
  }, [activeServerId, agents, selectedAgentId]);
  const quickActionAgentTarget = useMemo(
    () => resolveMobileSidebarQuickActionAgentTarget(quickActionAgent),
    [quickActionAgent],
  );
  const quickActionWorkspaceId = useResolveWorkspaceIdByCwd(
    quickActionAgentTarget?.serverId ?? activeServerId,
    quickActionAgent?.cwd,
  );
  const quickActionProjectKind = useWorkspaceFields(
    quickActionAgentTarget?.serverId ?? activeServerId,
    quickActionWorkspaceId,
    (workspace) => workspace.projectKind,
  );
  const quickActionModel = useMemo(
    () =>
      buildMobileSidebarQuickActionModel({
        serverId: quickActionAgentTarget?.serverId ?? activeServerId,
        workspaceId: quickActionWorkspaceId,
        projectKind: quickActionProjectKind,
      }),
    [
      activeServerId,
      quickActionAgentTarget?.serverId,
      quickActionProjectKind,
      quickActionWorkspaceId,
    ],
  );
  const handleOpenQuickAgent = useCallback(() => {
    if (!quickActionAgentTarget) {
      return;
    }
    translateX.value = -mobileSidebarWidth;
    backdropOpacity.value = 0;
    closeToAgent();
    navigateToAgent({
      serverId: quickActionAgentTarget.serverId,
      agentId: quickActionAgentTarget.agentId,
      pin: true,
    });
  }, [backdropOpacity, closeToAgent, mobileSidebarWidth, quickActionAgentTarget, translateX]);
  const handleOpenQuickRoute = useCallback(
    (route: string | null) => {
      if (!route) {
        return;
      }
      translateX.value = -mobileSidebarWidth;
      backdropOpacity.value = 0;
      closeToAgent();
      router.push(route as never);
    },
    [backdropOpacity, closeToAgent, mobileSidebarWidth, translateX],
  );
  const handleViewQuickChanges = useCallback(() => {
    handleOpenQuickRoute(quickActionModel.changesRoute);
  }, [handleOpenQuickRoute, quickActionModel.changesRoute]);
  const handleOpenQuickTerminal = useCallback(() => {
    handleOpenQuickRoute(quickActionModel.terminalRoute);
  }, [handleOpenQuickRoute, quickActionModel.terminalRoute]);
  const quickActionButtons = useMemo(
    () =>
      buildMobileSidebarQuickActionButtons({
        hasAgentTarget: quickActionAgentTarget !== null,
        changesRoute: quickActionModel.changesRoute,
        terminalRoute: quickActionModel.terminalRoute,
        canViewSessions: activeServerId !== null,
      }),
    [
      activeServerId,
      quickActionAgentTarget,
      quickActionModel.changesRoute,
      quickActionModel.terminalRoute,
    ],
  );

  const closeGesture = useMemo(
    () =>
      Gesture.Pan()
        .withRef(closeGestureRef)
        .enabled(isOpen)
        .manualActivation(true)
        .onTouchesDown((event) => {
          const touch = event.changedTouches[0];
          if (!touch) {
            return;
          }
          closeTouchStartX.value = touch.absoluteX;
          closeTouchStartY.value = touch.absoluteY;
        })
        .onTouchesMove((event, stateManager) => {
          const touch = event.changedTouches[0];
          if (!touch || event.numberOfTouches !== 1) {
            stateManager.fail();
            return;
          }

          const deltaX = touch.absoluteX - closeTouchStartX.value;
          const deltaY = touch.absoluteY - closeTouchStartY.value;
          const absDeltaX = Math.abs(deltaX);
          const absDeltaY = Math.abs(deltaY);

          if (deltaX >= 10) {
            stateManager.fail();
            return;
          }
          if (absDeltaY > 10 && absDeltaY > absDeltaX) {
            stateManager.fail();
            return;
          }
          if (deltaX <= -15 && absDeltaX > absDeltaY) {
            stateManager.activate();
          }
        })
        .onStart(() => {
          isGesturing.value = true;
        })
        .onUpdate((event) => {
          const newTranslateX = Math.min(0, Math.max(-mobileSidebarWidth, event.translationX));
          translateX.value = newTranslateX;
          backdropOpacity.value = interpolate(
            newTranslateX,
            [-mobileSidebarWidth, 0],
            [0, 1],
            Extrapolation.CLAMP,
          );
        })
        .onEnd((event) => {
          isGesturing.value = false;
          const shouldClose =
            event.translationX < -mobileSidebarWidth / 3 || event.velocityX < -500;
          if (shouldClose) {
            animateToClose();
            runOnJS(handleCloseFromGesture)();
          } else {
            animateToOpen();
          }
        })
        .onFinalize(() => {
          isGesturing.value = false;
        }),
    [
      isOpen,
      closeGestureRef,
      closeTouchStartX,
      closeTouchStartY,
      isGesturing,
      mobileSidebarWidth,
      translateX,
      backdropOpacity,
      animateToClose,
      animateToOpen,
      handleCloseFromGesture,
    ],
  );

  const mobileSidebarInsetStyle = useMemo(
    () => ({
      width: mobileSidebarWidth,
      paddingTop: insetsTop,
      paddingBottom: insetsBottom,
    }),
    [mobileSidebarWidth, insetsTop, insetsBottom],
  );

  const hostStatusDotStyle = useMemo(
    () => [styles.hostStatusDot, { backgroundColor: activeHostStatusColor }],
    [activeHostStatusColor],
  );

  const sidebarAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
    pointerEvents: backdropOpacity.value > 0.01 ? "auto" : "none",
  }));

  let overlayPointerEvents: "auto" | "none" | "box-none";
  if (!isWeb) overlayPointerEvents = "box-none";
  else if (isOpen) overlayPointerEvents = "auto";
  else overlayPointerEvents = "none";

  const backdropStyle = useMemo(
    () => [staticStyles.backdrop, backdropAnimatedStyle],
    [backdropAnimatedStyle],
  );
  const mobileSidebarStyle = useMemo(
    () => [
      staticStyles.mobileSidebar,
      mobileSidebarInsetStyle,
      sidebarAnimatedStyle,
      { backgroundColor: theme.colors.surfaceWorkspace },
    ],
    [mobileSidebarInsetStyle, sidebarAnimatedStyle, theme.colors.surfaceWorkspace],
  );
  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents={overlayPointerEvents}>
      <AnimatedPressable
        accessible={isOpen}
        accessibilityRole="button"
        accessibilityLabel={t("sidebar.closeSidebar")}
        importantForAccessibility={isOpen ? "auto" : "no-hide-descendants"}
        onPress={closeToAgent}
        style={backdropStyle}
        testID="mobile-sidebar-backdrop"
      />

      <GestureDetector gesture={closeGesture} touchAction="pan-y">
        <Animated.View style={mobileSidebarStyle} pointerEvents="auto">
          <View style={styles.sidebarContent} pointerEvents="auto">
            <SidebarTopActions
              onCloseSidebar={closeToAgent}
              onViewSessions={handleViewMore}
              onNewConversation={handleOpenProject}
              onSearch={handleSearch}
            />
            <Pressable
              style={styles.mobileCloseButton}
              onPress={closeToAgent}
              testID="sidebar-close"
              nativeID="sidebar-close"
              accessible
              accessibilityRole="button"
              accessibilityLabel={t("sidebar.closeSidebar")}
              hitSlop={8}
            >
              {({ hovered, pressed }) => (
                <X
                  size={theme.iconSize.md}
                  color={
                    hovered || pressed ? theme.colors.foreground : theme.colors.foregroundMuted
                  }
                />
              )}
            </Pressable>

            <MobileSidebarQuickActions
              agent={quickActionAgent}
              buttons={quickActionButtons}
              theme={theme}
              onOpenAgent={handleOpenQuickAgent}
              onViewChanges={handleViewQuickChanges}
              onOpenTerminal={handleOpenQuickTerminal}
              onViewMore={handleViewMore}
              onClose={closeToAgent}
            />

            {isInitialLoad ? (
              <SidebarAgentListSkeleton />
            ) : (
              <SidebarSessionList
                serverId={activeServerId}
                agents={agents}
                drafts={drafts}
                selectedAgentId={selectedAgentId}
                isRefreshing={isManualRefresh && isRevalidating}
                onRefresh={handleRefresh}
                hasMore={hasMore}
                isLoadingMore={isLoadingMore}
                onLoadMore={handleLoadMore}
                onAgentPress={handleAgentPress}
                onAddProject={handleOpenProject}
              />
            )}

            <SidebarFooter
              theme={theme}
              activeServerId={activeServerId}
              activeHostLabel={activeHostLabel}
              hostStatusDotStyle={hostStatusDotStyle}
              hostOptions={hostOptions}
              hostTriggerRef={hostTriggerRef}
              isHostPickerOpen={isHostPickerOpen}
              setIsHostPickerOpen={setIsHostPickerOpen}
              handleHostSelect={handleHostSelect}
              renderHostOption={renderHostOption}
              handleSettings={handleSettings}
            />
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

function DesktopSidebar({
  theme,
  activeServerId,
  activeHostLabel,
  activeHostStatusColor,
  hostOptions,
  hostTriggerRef,
  isHostPickerOpen,
  setIsHostPickerOpen,
  agents,
  drafts,
  selectedAgentId,
  isInitialLoad,
  isRevalidating,
  isLoadingMore,
  isManualRefresh,
  hasMore,
  handleRefresh,
  handleLoadMore,
  handleHostSelect,
  renderHostOption,
  handleOpenProject,
  handleSearch,
  handleSettings,
  isOpen,
}: DesktopSidebarProps) {
  const { t } = useTranslation();
  const sidebarWidth = usePanelStore((state) => state.sidebarWidth);
  const setSidebarWidth = usePanelStore((state) => state.setSidebarWidth);
  const openDesktopAgentList = usePanelStore((state) => state.openDesktopAgentList);
  const closeDesktopAgentList = usePanelStore((state) => state.closeDesktopAgentList);
  const desktopSidebarWidth = DEFAULT_SIDEBAR_WIDTH;
  const { width: viewportWidth } = useWindowDimensions();
  const hostStatusDotStyle = useMemo(
    () => [styles.hostStatusDot, { backgroundColor: activeHostStatusColor }],
    [activeHostStatusColor],
  );

  const startWidthRef = useRef(desktopSidebarWidth);
  const resizeWidth = useSharedValue(desktopSidebarWidth);
  const openProgress = useSharedValue(isOpen ? 1 : 0);

  useEffect(() => {
    if (sidebarWidth !== desktopSidebarWidth) {
      setSidebarWidth(desktopSidebarWidth);
    }
    resizeWidth.value = withTiming(
      isOpen ? desktopSidebarWidth : 0,
      DESKTOP_SIDEBAR_ANIMATION_CONFIG,
    );
    openProgress.value = withTiming(isOpen ? 1 : 0, DESKTOP_SIDEBAR_ANIMATION_CONFIG);
  }, [desktopSidebarWidth, isOpen, openProgress, resizeWidth, setSidebarWidth, sidebarWidth]);

  const resizeGesture = useMemo(
    () =>
      Gesture.Pan()
        .hitSlop({ left: 8, right: 8, top: 0, bottom: 0 })
        .onStart(() => {
          startWidthRef.current = desktopSidebarWidth;
          resizeWidth.value = desktopSidebarWidth;
        })
        .onUpdate((event) => {
          // Dragging right (positive translationX) increases width
          const newWidth = startWidthRef.current + event.translationX;
          const maxWidth = Math.max(
            MIN_SIDEBAR_WIDTH,
            Math.min(MAX_SIDEBAR_WIDTH, viewportWidth - MIN_CHAT_WIDTH),
          );
          const clampedWidth = Math.max(MIN_SIDEBAR_WIDTH, Math.min(maxWidth, newWidth));
          resizeWidth.value = clampedWidth;
        })
        .onEnd(() => {
          runOnJS(setSidebarWidth)(resizeWidth.value);
        }),
    [desktopSidebarWidth, resizeWidth, setSidebarWidth, viewportWidth],
  );

  const resizeAnimatedStyle = useAnimatedStyle(() => ({
    width: resizeWidth.value,
    marginRight: DESKTOP_SIDEBAR_GAP * openProgress.value,
    opacity: openProgress.value,
  }));

  const desktopSidebarStyle = useMemo(
    () => [staticStyles.desktopSidebar, resizeAnimatedStyle],
    [resizeAnimatedStyle],
  );
  const desktopSidebarBorderStyle = useMemo(() => [styles.desktopSidebarBorder, { flex: 1 }], []);
  const resizeHandleStyle = useMemo(
    () => [styles.resizeHandle, isWeb && ({ cursor: "col-resize" } as object)],
    [],
  );
  const railButtonStyle = useCallback(
    ({ hovered, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.desktopSidebarRailButton,
      (Boolean(hovered) || pressed) && styles.desktopSidebarRailButtonHovered,
    ],
    [],
  );
  const handleViewSessions = useCallback(() => {
    if (!activeServerId) {
      return;
    }
    router.push(buildHostSessionsRoute(activeServerId));
  }, [activeServerId]);
  return (
    <>
      {!isOpen ? (
        <View style={styles.desktopSidebarRail}>
          <TitlebarDragRegion />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("sidebar.openSidebar")}
            onPress={openDesktopAgentList}
            style={railButtonStyle}
            testID="desktop-left-sidebar-open"
          >
            {({ hovered, pressed }) => (
              <PanelLeft
                size={theme.iconSize.md}
                color={hovered || pressed ? theme.colors.foreground : theme.colors.foregroundMuted}
              />
            )}
          </Pressable>
        </View>
      ) : null}
      <Animated.View
        style={desktopSidebarStyle}
        testID="desktop-left-sidebar"
        pointerEvents={isOpen ? "auto" : "none"}
      >
        <View style={desktopSidebarBorderStyle}>
          <View style={styles.desktopSidebarDragArea}>
            <TitlebarDragRegion />
            <SidebarTopActions
              onCloseSidebar={closeDesktopAgentList}
              onViewSessions={handleViewSessions}
              onNewConversation={handleOpenProject}
              onSearch={handleSearch}
            />
          </View>

          {isInitialLoad ? (
            <SidebarAgentListSkeleton />
          ) : (
            <SidebarSessionList
              serverId={activeServerId}
              agents={agents}
              drafts={drafts}
              selectedAgentId={selectedAgentId}
              isRefreshing={isManualRefresh && isRevalidating}
              onRefresh={handleRefresh}
              hasMore={hasMore}
              isLoadingMore={isLoadingMore}
              onLoadMore={handleLoadMore}
              onAddProject={handleOpenProject}
            />
          )}

          <SidebarFooter
            theme={theme}
            activeServerId={activeServerId}
            activeHostLabel={activeHostLabel}
            hostStatusDotStyle={hostStatusDotStyle}
            hostOptions={hostOptions}
            hostTriggerRef={hostTriggerRef}
            isHostPickerOpen={isHostPickerOpen}
            setIsHostPickerOpen={setIsHostPickerOpen}
            handleHostSelect={handleHostSelect}
            renderHostOption={renderHostOption}
            handleSettings={handleSettings}
            variant="desktop"
          />

          {/* Resize handle - absolutely positioned over right border */}
          <GestureDetector gesture={resizeGesture}>
            <View style={resizeHandleStyle} />
          </GestureDetector>
        </View>
      </Animated.View>
    </>
  );
}

// Static styles for Animated.Views — must NOT use Unistyles dynamic theme to
// avoid the "Unable to find node on an unmounted component" crash when Unistyles
// tries to patch the native node that Reanimated also manages.
const staticStyles = RNStyleSheet.create({
  backdrop: {
    ...RNStyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  mobileSidebar: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    bottom: 0,
    overflow: "hidden" as const,
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
  },
  desktopSidebar: {
    position: "relative" as const,
  },
});

const styles = StyleSheet.create((theme) => ({
  sidebarContent: {
    flex: 1,
    minHeight: 0,
  },
  mobileCloseButton: {
    position: "absolute",
    top: theme.spacing[3],
    right: theme.spacing[4],
    zIndex: 2,
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surfaceWorkspace,
  },
  mobileQuickActions: {
    marginHorizontal: theme.spacing[3],
    marginBottom: theme.spacing[2],
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.xl,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
    gap: theme.spacing[2],
    ...theme.shadow.sm,
  },
  mobileQuickActionsTextGroup: {
    minWidth: 0,
    paddingRight: theme.spacing[8],
    gap: 1,
  },
  mobileQuickActionsLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.normal,
  },
  mobileQuickActionsTitle: {
    minWidth: 0,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.normal,
  },
  mobileQuickActionsButtons: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  mobileQuickActionButton: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.borderAccent,
    backgroundColor: theme.colors.surface1,
  },
  mobileQuickActionPrimaryButton: {
    flexBasis: "100%",
    flexGrow: 1,
    minWidth: 0,
    borderColor: theme.colors.borderAccent,
    backgroundColor: theme.colors.surface2,
    ...theme.shadow.sm,
  },
  mobileQuickActionSecondaryButton: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 64,
  },
  mobileQuickActionButtonHovered: {
    backgroundColor: theme.colors.surface2,
  },
  mobileQuickActionIcon: {
    flexShrink: 0,
  },
  mobileQuickActionText: {
    minWidth: 0,
    flexShrink: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.normal,
  },
  mobileQuickActionPrimaryText: {
    fontSize: theme.fontSize.sm,
  },
  desktopSidebarBorder: {
    borderWidth: theme.borderWidth[1],
    borderRightWidth: theme.borderWidth[2],
    borderColor: theme.colors.border,
    borderRightColor: theme.colors.border,
    borderRadius: 8,
    backgroundColor: theme.colors.surfaceWorkspace,
    overflow: "hidden",
  },
  desktopSidebarRail: {
    width: 44,
    alignSelf: "stretch",
    alignItems: "center",
    paddingTop: theme.spacing[3],
    borderRightWidth: theme.borderWidth[1],
    borderRightColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceWorkspace,
  },
  desktopSidebarRailButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
  },
  desktopSidebarRailButtonHovered: {
    backgroundColor: theme.colors.surface2,
  },
  resizeHandle: {
    position: "absolute",
    right: -5,
    top: 0,
    bottom: 0,
    width: 10,
    zIndex: 10,
  },
  sidebarDragArea: {
    position: "relative",
  },
  desktopSidebarDragArea: {
    position: "relative",
    marginHorizontal: 0,
    marginTop: 0,
    marginBottom: 0,
  },
  sidebarTopArea: {
    paddingTop: theme.spacing[3],
    paddingRight: theme.spacing[3],
    paddingBottom: theme.spacing[3],
    paddingLeft: theme.spacing[3],
    gap: theme.spacing[2],
    userSelect: "none",
  },
  sidebarTopActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
  },
  sidebarTopAction: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
  },
  sidebarTopActionHovered: {
    backgroundColor: theme.colors.surface2,
  },
  sidebarTopActionIconSlot: {
    alignItems: "center",
    justifyContent: "center",
  },
  sidebarPrimaryActions: {
    gap: theme.spacing[1],
  },
  sidebarPrimaryAction: {
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
  },
  sidebarPrimaryActionHovered: {
    backgroundColor: theme.colors.surface1,
  },
  sidebarPrimaryActionText: {
    minWidth: 0,
    flexShrink: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.normal,
  },
  hostTrigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: theme.spacing[2],
    minWidth: 0,
    minHeight: 28,
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
  },
  hostTriggerHovered: {
    backgroundColor: theme.colors.surface1,
  },
  hostStatusDot: {
    width: 8,
    height: 8,
    borderRadius: theme.borderRadius.full,
  },
  hostTriggerText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
    flexShrink: 1,
    minWidth: 0,
  },
  sidebarFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  desktopSidebarFooter: {
    height: 54,
    paddingLeft: 18,
    paddingRight: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    marginHorizontal: 0,
    marginBottom: 0,
    borderTopWidth: theme.borderWidth[1],
    borderTopColor: theme.colors.border,
    borderRadius: 0,
    backgroundColor: "transparent",
  },
  footerHostSlot: {
    flexGrow: 0,
    flexShrink: 1,
    minWidth: 0,
    marginRight: theme.spacing[2],
  },
  footerIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    flexShrink: 0,
  },
  desktopFooterIconRow: {
    gap: 6,
  },
  footerIconButton: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
  },
  footerIconButtonHovered: {
    backgroundColor: theme.colors.surface1,
  },
  desktopFooterIconButton: {
    width: 32,
    height: 32,
  },
  hostPickerList: {
    gap: theme.spacing[2],
  },
  hostPickerOption: {
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface2,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
  },
  hostPickerOptionText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  hostPickerCancel: {
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface0,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    alignItems: "center",
  },
  hostPickerCancelText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
}));
