import { useCallback, useEffect, useMemo, useState } from "react";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { useIsFocused } from "@react-navigation/native";
import { View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, type Href } from "expo-router";
import * as Clipboard from "expo-clipboard";

import { StyleSheet } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { ErrorBoundary, SectionErrorFallback } from "@/components/error-boundary";
import {
  FloatingPanelPortalHost,
  FloatingPanelPortalHostNameProvider,
} from "@/components/ui/floating-panel-portal";
import { ExplorerSidebar } from "@/components/explorer-sidebar";
import { useGitActions } from "@/git/use-actions";
import { ImportSessionSheet } from "@/components/import-session-sheet";
import { ExplorerSidebarAnimationProvider } from "@/contexts/explorer-sidebar-animation-context";
import { useToast } from "@/contexts/toast-context";
import { usePanelStore } from "@/stores/panel-store";
import { useSessionStore, type WorkspaceDescriptor } from "@/stores/session-store";
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
import { normalizeWorkspaceTabTarget } from "@/workspace-tabs/identity";
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
import { useStableEvent } from "@/hooks/use-stable-event";
import { useBrowserStore } from "@/stores/browser-store";
import { getDesktopHost } from "@/desktop/host";
import { buildProviderCommand } from "@/utils/provider-command-templates";
import { WorkspaceTabPresentationResolver } from "@/screens/workspace/workspace-tab-presentation";
import {
  getWorkspaceExecutionAuthority,
  resolveWorkspaceRouteId,
  type WorkspaceExecutionAuthorityResult,
} from "@/utils/workspace-execution";
import {
  useWorkspaceTabRename,
  WorkspaceTabRenameModal,
} from "@/screens/workspace/use-workspace-tab-rename";
import { useWorkspaceKeyboardActions } from "@/screens/workspace/use-workspace-keyboard-actions";
import { useWorkspacePersistenceHydration } from "@/screens/workspace/use-workspace-persistence-hydration";
import { useWorkspaceTabOpenActions } from "@/screens/workspace/use-workspace-tab-open-actions";
import { useWorkspaceTabCloseActions } from "@/screens/workspace/use-workspace-tab-close-actions";
import { useWorkspaceDockActions } from "@/screens/workspace/use-workspace-dock-actions";
import { useWorkspacePaneLayoutActions } from "@/screens/workspace/use-workspace-pane-layout-actions";
import { useWorkspacePaneContentModels } from "@/screens/workspace/use-workspace-pane-content-models";
import { useWorkspaceEnvironmentPanelState } from "@/screens/workspace/use-workspace-environment-panel-state";
import { useWorkspaceEnvironmentData } from "@/screens/workspace/use-workspace-environment-data";
import { WORKSPACE_ENVIRONMENT_PANEL_WIDTH } from "@/screens/workspace/workspace-environment-panel";
import {
  WorkspaceCenterColumn,
  WorkspaceScreenGateShell,
} from "@/screens/workspace/workspace-center-column";
import { useWorkspaceExplorerActions } from "@/screens/workspace/use-workspace-explorer-actions";
import { useWorkspaceOpenIntent } from "@/screens/workspace/use-workspace-open-intent";
import type { WorkspaceTabDescriptor } from "@/screens/workspace/workspace-tabs-types";
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
import { deriveWorkspacePaneState } from "@/screens/workspace/workspace-pane-state";
import { WorkspaceFocusProvider } from "@/workspace/focus";

import { useIsCompactFormFactor } from "@/constants/layout";
import { getIsElectron, isNative, isWeb } from "@/constants/platform";
import { buildHostRootRoute, buildSettingsHostRoute } from "@/utils/host-routes";
import { canCreateWorkspaceTerminal } from "@/screens/workspace/terminals/state";
import { useWorkspaceTerminals } from "@/screens/workspace/terminals/use-workspace-terminals";
import { shouldEnableWorkspaceReviewArchiveAction } from "@/screens/workspace/workspace-environment-panel-model";
import {
  buildBrowserContextSummary,
  type BrowserContextSummary,
} from "@/screens/workspace/workspace-environment-dock-model";

const WORKSPACE_FLOATING_PANEL_PORTAL_HOST_PREFIX = "workspace-floating-panels";
const EMPTY_UI_TABS: WorkspaceTab[] = [];
const EMPTY_WORKSPACE_SCRIPTS: WorkspaceDescriptor["scripts"] = [];
const EMPTY_PINNED_AGENT_IDS = new Set<string>();
const EMPTY_SET = new Set<string>();
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
  const isMobile = useIsCompactFormFactor();
  const isFocusModeEnabled = usePanelStore((state) => state.desktop.focusModeEnabled);
  const normalizedServerId = useMemo(() => trimNonEmpty(decodeSegment(serverId)) ?? "", [serverId]);
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

  const {
    isExplorerOpen,
    activeExplorerCheckout,
    openFileExplorerForCheckout,
    toggleFileExplorerForCheckout,
    closeDesktopFileExplorer,
    setExplorerTabForCheckout,
    showMobileAgent,
    handleToggleExplorer,
    explorerToggleAccessibilityState,
    explorerOpenGesture,
  } = useWorkspaceExplorerActions({
    normalizedServerId,
    workspaceDirectory,
    isGitCheckout,
    isMobile,
    isRouteFocused,
  });
  const isLocalDaemon = useIsLocalDaemon(normalizedServerId);

  const {
    environmentDockState,
    setEnvironmentDockState,
    setEnvironmentPanelMode,
    isEnvironmentPanelVisible,
    handleCenterContentLayout,
    handleToggleEnvironmentPanel,
    handleOpenEnvironmentChanges,
  } = useWorkspaceEnvironmentPanelState({
    panelWidth: WORKSPACE_ENVIRONMENT_PANEL_WIDTH,
    isMobile,
    isExplorerOpen,
    activeExplorerCheckout,
    openFileExplorerForCheckout,
    toggleFileExplorerForCheckout,
    setExplorerTabForCheckout,
  });

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
  const resizeWorkspaceSplit = useWorkspaceLayoutStore((state) => state.resizeSplit);
  const reorderWorkspaceTabsInPane = useWorkspaceLayoutStore((state) => state.reorderTabsInPane);
  const {
    paneFocusSuppressedRef,
    handleFocusPane,
    handleSplitPane,
    handleMoveTabToPane,
    handleResizePaneSplit,
    handleReorderTabsInPane,
  } = useWorkspacePaneLayoutActions({
    persistenceKey,
    focusWorkspacePane,
    splitWorkspacePane,
    moveWorkspaceTabToPane,
    resizeWorkspaceSplit,
    reorderWorkspaceTabsInPane,
  });
  const _pinnedAgentIds = useWorkspaceLayoutStore((state) =>
    persistenceKey
      ? (state.pinnedAgentIdsByWorkspace[persistenceKey] ?? EMPTY_PINNED_AGENT_IDS)
      : EMPTY_PINNED_AGENT_IDS,
  );
  const _hiddenAgentIds = useWorkspaceLayoutStore((state) =>
    persistenceKey ? (state.hiddenAgentIdsByWorkspace[persistenceKey] ?? EMPTY_SET) : EMPTY_SET,
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
  const {
    environmentPanelAgent,
    environmentPanelAgentId,
    environmentSubagents,
    environmentTodoItems,
    environmentTurnChanges,
    environmentSourceLabel,
    environmentWorkspaceStatus,
    workspaceStatusStripModel,
    workspaceActivityItems,
  } = useWorkspaceEnvironmentData({
    normalizedServerId,
    focusedPaneAgentId,
    workspaceDescriptor,
    currentBranchName,
  });
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

  const {
    openWorkspaceDraftTab,
    navigateToTabId,
    handleImportedAgent,
    handleOpenFileFromExplorer,
    handleOpenFileFromChat,
    handleOpenFileFromChatInSidePane,
    handleCreateDraftTab,
    handleCreateBrowserTab,
    handleOpenUrlInBrowserTab,
    handleSelectSwitcherTab,
    handleCreateDraftSplit,
  } = useWorkspaceTabOpenActions({
    persistenceKey,
    isMobile,
    workspaceLayout,
    uiTabs,
    showMobileAgent,
    focusWorkspaceTab,
    focusWorkspacePane,
    splitWorkspacePaneEmpty,
    openWorkspaceTabFocused,
    openWorkspaceChildTabFocused,
    openWorkspaceTabInBackground,
  });
  const handleOpenEnvironmentSubagent = handleImportedAgent;

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

  const {
    closingTabIds,
    closeWorkspaceTabWithCleanup,
    handleCloseTabById,
    handleCloseTabsToLeftInPane,
    handleCloseTabsToLeft,
    handleCloseTabsToRightInPane,
    handleCloseTabsToRight,
    handleCloseOtherTabsInPane,
    handleCloseOtherTabs,
  } = useWorkspaceTabCloseActions({
    client,
    persistenceKey,
    tabs,
    allTabDescriptorsById,
    closeWorkspaceTab,
    unpinWorkspaceAgent,
    suppressWorkspaceAgentAutoOpen,
    suppressWorkspaceTerminalAutoOpen,
    removeTerminalFromCache,
    killTerminal: killTerminalMutation.mutateAsync,
    invalidateTerminals,
    setHoveredTabKey,
    setHoveredCloseTabKey,
  });

  const handleCreateTerminal = useStableEvent(createTerminal);

  useWorkspaceOpenIntent({
    isRouteFocused,
    persistenceKey,
    normalizedServerId,
    normalizedWorkspaceId,
    hasExplorerCheckout: activeExplorerCheckout !== null,
    isTerminalCreatePending:
      createTerminalMutation.isPending || pendingTerminalCreateInput !== null,
    onOpenChanges: handleOpenEnvironmentChanges,
    onCreateTerminal: handleCreateTerminal,
  });

  const {
    handleOpenWorkspaceDockPane,
    handleOpenGitDock,
    handleOpenBrowserContextDock,
    handleOpenPullRequestDock,
  } = useWorkspaceDockActions({
    isMobile,
    hasEnvironmentBrowserContext,
    hasEnvironmentPullRequest,
    persistenceKey,
    focusedPane: focusedPaneTabState.pane,
    setEnvironmentDockState,
    setEnvironmentPanelMode,
    closeDesktopFileExplorer,
    handleOpenEnvironmentChanges,
    handleCreateTerminal,
    focusWorkspacePane,
    splitWorkspacePaneEmpty,
    openWorkspaceTabFocused,
    openWorkspaceTabInBackground,
  });

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
  useEffect(() => {
    if (!isRouteFocused || isNative || typeof document === "undefined" || activeTabDescriptor) {
      return;
    }
    document.title = t("workspace.title");
  }, [activeTabDescriptor, isRouteFocused, t]);
  const {
    focusedPaneId,
    mountedFocusedPaneTabIds,
    focusedPaneTabDescriptorMap,
    buildMobilePaneContentModel,
    buildDesktopPaneContentModel,
  } = useWorkspacePaneContentModels({
    normalizedServerId,
    normalizedWorkspaceId,
    persistenceKey,
    tabs,
    activeTabId,
    focusedPaneId: focusedPaneTabState.pane?.id ?? null,
    focusWorkspacePane,
    openWorkspaceChildTabFocused,
    navigateToTabId,
    handleCloseTabById,
    retargetWorkspaceTab,
    handleOpenFileFromChat,
    handleOpenFileFromChatInSidePane,
    openImportSheet,
  });
  const containerStyle = containerWithWorkspaceBackgroundStyle;

  const workspaceScreenGate = renderWorkspaceRouteGate({
    state: workspaceRouteState,
    actions: {
      onRetryHost: handleRetryHost,
      onManageHost: handleManageHost,
      onDismissMissingWorkspace: handleDismissMissingWorkspace,
    },
  });
  const gatedWorkspaceScreen = (
    <WorkspaceScreenGateShell gate={workspaceScreenGate} workspaceKey={persistenceKey} />
  );

  const showExplorerSidebar = useMemo(
    () => shouldShowWorkspaceExplorerSidebar({ isRouteFocused, isFocusModeEnabled, isMobile }),
    [isRouteFocused, isFocusModeEnabled, isMobile],
  );
  const workspaceFloatingPanelPortalHostName = useMemo(
    () =>
      `${WORKSPACE_FLOATING_PANEL_PORTAL_HOST_PREFIX}:${normalizedServerId}:${normalizedWorkspaceId}`,
    [normalizedServerId, normalizedWorkspaceId],
  );

  const workspaceCenterHeaderTitleBar = useMemo(
    () => ({
      isLoading: isWorkspaceHeaderLoading,
      title: workspaceHeaderTitle,
      subtitle: workspaceHeaderSubtitle,
      showSubtitle: shouldShowWorkspaceHeaderSubtitle,
      currentBranchName,
      isGitCheckout,
      workspaceScripts,
      liveTerminalIds,
      showWorkspaceSetup,
      importAgentDisabled: !canOpenImportSheet,
      onCreateDraftTab: handleCreateDraftTab,
      onCreateTerminal: handleCreateTerminal,
      onCreateBrowser: handleCreateBrowserTab,
      onOpenGitDock: handleOpenGitDock,
      onOpenBrowserContextDock: handleOpenBrowserContextDock,
      onOpenImportSheet: openImportSheet,
      onCopyWorkspacePath: handleCopyWorkspacePath,
      onCopyBranchName: handleCopyBranchName,
      onOpenSetupTab: handleOpenSetupTab,
      onScriptTerminalStarted: handleScriptTerminalStarted,
      onViewScriptTerminal: handleViewScriptTerminal,
      onOpenUrlInBrowserTab: handleOpenUrlInBrowserTab,
    }),
    [
      canOpenImportSheet,
      currentBranchName,
      handleCopyBranchName,
      handleCopyWorkspacePath,
      handleCreateBrowserTab,
      handleCreateDraftTab,
      handleCreateTerminal,
      handleOpenBrowserContextDock,
      handleOpenGitDock,
      handleOpenSetupTab,
      handleOpenUrlInBrowserTab,
      handleScriptTerminalStarted,
      handleViewScriptTerminal,
      isGitCheckout,
      isWorkspaceHeaderLoading,
      liveTerminalIds,
      openImportSheet,
      shouldShowWorkspaceHeaderSubtitle,
      showWorkspaceSetup,
      workspaceHeaderSubtitle,
      workspaceHeaderTitle,
      workspaceScripts,
    ],
  );
  const workspaceCenterHeaderRightControls = useMemo(
    () => ({
      isGitCheckout,
      isExplorerOpen,
      canToggleExplorer: Boolean(activeExplorerCheckout),
      canShowEnvironmentPanel: Boolean(workspaceDirectory),
      explorerToggleAccessibilityState,
      onToggleExplorer: handleToggleExplorer,
      onToggleEnvironmentPanel: handleToggleEnvironmentPanel,
    }),
    [
      activeExplorerCheckout,
      explorerToggleAccessibilityState,
      handleToggleEnvironmentPanel,
      handleToggleExplorer,
      isExplorerOpen,
      isGitCheckout,
      workspaceDirectory,
    ],
  );
  const workspaceCenterMobileTabSwitcher = useMemo(
    () => ({
      tabs,
      onSelectSwitcherTab: handleSelectSwitcherTab,
      onCopyResumeCommand: handleCopyResumeCommand,
      onCopyAgentId: handleCopyAgentId,
      onReloadAgent: handleReloadAgent,
      onRenameTab: handleRenameTab,
      onCloseTab: handleCloseTabById,
      onCloseTabsAbove: handleCloseTabsToLeft,
      onCloseTabsBelow: handleCloseTabsToRight,
      onCloseOtherTabs: handleCloseOtherTabs,
    }),
    [
      handleCloseOtherTabs,
      handleCloseTabById,
      handleCloseTabsToLeft,
      handleCloseTabsToRight,
      handleCopyAgentId,
      handleCopyResumeCommand,
      handleReloadAgent,
      handleRenameTab,
      handleSelectSwitcherTab,
      tabs,
    ],
  );
  const workspaceCenterSplitContainer = useMemo(
    () => ({
      uiTabs,
      hoveredCloseTabKey,
      setHoveredTabKey,
      setHoveredCloseTabKey,
      closingTabIds,
      onNavigateTab: navigateToTabId,
      onCloseTab: handleCloseTabById,
      onCopyResumeCommand: handleCopyResumeCommand,
      onCopyAgentId: handleCopyAgentId,
      onReloadAgent: handleReloadAgent,
      onRenameTab: handleRenameTab,
      onCloseTabsToLeft: handleCloseTabsToLeftInPane,
      onCloseTabsToRight: handleCloseTabsToRightInPane,
      onCloseOtherTabs: handleCloseOtherTabsInPane,
      onCreateDraftTab: handleCreateDraftTab,
      onCreateTerminalTab: handleCreateTerminal,
      onCreateBrowserTab: handleCreateBrowserTab,
      buildPaneContentModel: buildDesktopPaneContentModel,
      onFocusPane: handleFocusPane,
      onSplitPane: handleSplitPane,
      onSplitPaneEmpty: handleCreateDraftSplit,
      onMoveTabToPane: handleMoveTabToPane,
      onResizeSplit: handleResizePaneSplit,
      onReorderTabsInPane: handleReorderTabsInPane,
    }),
    [
      buildDesktopPaneContentModel,
      closingTabIds,
      handleCloseOtherTabsInPane,
      handleCloseTabById,
      handleCloseTabsToLeftInPane,
      handleCloseTabsToRightInPane,
      handleCopyAgentId,
      handleCopyResumeCommand,
      handleCreateBrowserTab,
      handleCreateDraftSplit,
      handleCreateDraftTab,
      handleCreateTerminal,
      handleFocusPane,
      handleMoveTabToPane,
      handleReloadAgent,
      handleRenameTab,
      handleReorderTabsInPane,
      handleResizePaneSplit,
      handleSplitPane,
      hoveredCloseTabKey,
      navigateToTabId,
      uiTabs,
    ],
  );
  const workspaceCenterEnvironmentPanel = useMemo(
    () => ({
      serverId: normalizedServerId,
      workspaceDirectory,
      currentBranchName,
      isGitCheckout,
      isLocalDaemon,
      diffStat: workspaceDescriptor?.diffStat ?? null,
      githubRuntime: workspaceDescriptor?.githubRuntime,
      browserContext: environmentBrowserContext,
      dockState: environmentDockState,
      sourceLabel: environmentSourceLabel,
      taskTitle: workspaceStatusStripModel.taskTitle,
      activityItems: workspaceActivityItems,
      activeAgent: environmentPanelAgent,
      workspaceStatus: environmentWorkspaceStatus,
      subagents: environmentSubagents,
      todoItems: environmentTodoItems,
      latestTurnChanges: environmentTurnChanges,
      onSelectDockTab: handleOpenWorkspaceDockPane,
      onOpenChanges: handleOpenEnvironmentChanges,
      onOpenSubagent: handleOpenEnvironmentSubagent,
      onCopyResumeCommand: handleCopyResumeCommand,
    }),
    [
      currentBranchName,
      environmentBrowserContext,
      environmentDockState,
      environmentPanelAgent,
      environmentSourceLabel,
      environmentSubagents,
      environmentTodoItems,
      environmentTurnChanges,
      environmentWorkspaceStatus,
      handleCopyResumeCommand,
      handleOpenEnvironmentChanges,
      handleOpenEnvironmentSubagent,
      handleOpenWorkspaceDockPane,
      isGitCheckout,
      isLocalDaemon,
      normalizedServerId,
      workspaceActivityItems,
      workspaceDescriptor?.diffStat,
      workspaceDescriptor?.githubRuntime,
      workspaceDirectory,
      workspaceStatusStripModel.taskTitle,
    ],
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
              <WorkspaceCenterColumn
                isMobile={isMobile}
                isFocusModeEnabled={isFocusModeEnabled}
                isRouteFocused={isRouteFocused}
                normalizedServerId={normalizedServerId}
                normalizedWorkspaceId={normalizedWorkspaceId}
                activeTabDescriptor={activeTabDescriptor}
                isMissingWorkspaceExecutionAuthority={isMissingWorkspaceExecutionAuthority}
                hasHydratedAgents={hasHydratedAgents}
                mountedFocusedPaneTabIds={mountedFocusedPaneTabIds}
                focusedPaneTabDescriptorMap={focusedPaneTabDescriptorMap}
                focusedPaneId={focusedPaneId}
                buildMobilePaneContentModel={buildMobilePaneContentModel}
                workspaceLayout={workspaceLayout}
                persistenceKey={persistenceKey}
                explorerOpenGesture={explorerOpenGesture}
                onCenterContentLayout={handleCenterContentLayout}
                isEnvironmentPanelVisible={isEnvironmentPanelVisible}
                isCreateTerminalPending={
                  createTerminalMutation.isPending || pendingTerminalCreateInput !== null
                }
                hasEnvironmentBrowserContext={hasEnvironmentBrowserContext}
                headerTitleBar={workspaceCenterHeaderTitleBar}
                headerRightControls={workspaceCenterHeaderRightControls}
                mobileTabSwitcher={workspaceCenterMobileTabSwitcher}
                splitContainer={workspaceCenterSplitContainer}
                environmentPanel={workspaceCenterEnvironmentPanel}
              />
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
}));

const containerWithWorkspaceBackgroundStyle = [
  styles.container,
  styles.containerWorkspaceBackground,
];
