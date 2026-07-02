import { type ReactNode, useEffect, useMemo } from "react";
import {
  Stack,
  useGlobalSearchParams,
  usePathname,
  useRootNavigationState,
  useRouter,
} from "expo-router";
import { useUnistyles } from "react-native-unistyles";
import { SidebarAnimationProvider } from "@/contexts/sidebar-animation-context";
import { HorizontalScrollProvider } from "@/contexts/horizontal-scroll-context";
import { useHosts } from "@/runtime/host-runtime";
import {
  buildWorkspaceTabPersistenceKey,
  useWorkspaceLayoutStore,
} from "@/stores/workspace-layout-store";
import { resolveActiveHostRedirectRoute } from "@/utils/host-runtime-bootstrap";
import {
  parseHostAgentRouteFromPathname,
  parseHostWorkspaceRouteFromPathname,
  parseServerIdFromPathname,
  parseSettingsHostRouteFromPathname,
  parseWorkspaceOpenIntent,
} from "@/utils/host-routes";
import { resolveSelectedSidebarAgentIdFromWorkspaceLayout } from "@/utils/selected-sidebar-agent";
import { AppContainer } from "./AppContainer";
import { useStoreReady } from "./BootstrapProvider";
import { OpenProjectListener } from "./LinkListeners";

function AppWithSidebar({ children }: { children: ReactNode }) {
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ open?: string | string[] }>();
  const hosts = useHosts();
  const storeReady = useStoreReady();
  const chromeServerId = useMemo(() => parseServerIdFromPathname(pathname), [pathname]);
  const activeServerId = useMemo(
    () => chromeServerId ?? parseSettingsHostRouteFromPathname(pathname),
    [chromeServerId, pathname],
  );
  const workspaceRoute = useMemo(() => parseHostWorkspaceRouteFromPathname(pathname), [pathname]);
  const selectedWorkspaceAgentKey = useWorkspaceLayoutStore((state) => {
    if (!workspaceRoute) {
      return undefined;
    }
    const workspaceKey = buildWorkspaceTabPersistenceKey(workspaceRoute);
    if (!workspaceKey) {
      return undefined;
    }
    const agentId = resolveSelectedSidebarAgentIdFromWorkspaceLayout(
      state.layoutByWorkspace[workspaceKey],
    );
    return agentId ? `${workspaceRoute.serverId}:${agentId}` : undefined;
  });
  const shouldShowAppChrome =
    storeReady && chromeServerId !== null && hosts.some((host) => host.serverId === chromeServerId);

  useEffect(() => {
    if (!rootNavigationState?.key) {
      return;
    }
    const redirectRoute = resolveActiveHostRedirectRoute({
      pathname,
      activeServerId,
      hostServerIds: hosts.map((host) => host.serverId),
    });
    if (!redirectRoute) {
      return;
    }
    const handle = setTimeout(() => {
      router.replace(redirectRoute);
    }, 0);
    return () => clearTimeout(handle);
  }, [activeServerId, hosts, pathname, rootNavigationState?.key, router]);

  // Parse selectedAgentKey directly from pathname
  // useLocalSearchParams doesn't update when navigating between same-pattern routes
  const selectedAgentKey = useMemo(() => {
    const match = parseHostAgentRouteFromPathname(pathname);
    if (match) {
      return `${match.serverId}:${match.agentId}`;
    }

    if (selectedWorkspaceAgentKey) {
      return selectedWorkspaceAgentKey;
    }

    const openValue = Array.isArray(params.open) ? params.open[0] : params.open;
    const openIntent = parseWorkspaceOpenIntent(openValue);
    if (workspaceRoute && openIntent?.kind === "agent") {
      const agentId = openIntent.agentId.trim();
      return agentId ? `${workspaceRoute.serverId}:${agentId}` : undefined;
    }

    return undefined;
  }, [params.open, pathname, selectedWorkspaceAgentKey, workspaceRoute]);

  return (
    <AppContainer
      selectedAgentId={shouldShowAppChrome ? selectedAgentKey : undefined}
      chromeEnabled={shouldShowAppChrome}
    >
      {children}
    </AppContainer>
  );
}

const AGENT_SCREEN_OPTIONS = { gestureEnabled: false };

function RootStack() {
  const storeReady = useStoreReady();
  const { theme } = useUnistyles();
  const stackScreenOptions = useMemo(
    () => ({
      headerShown: false,
      animation: "none" as const,
      contentStyle: {
        backgroundColor: theme.colors.surface0,
      },
    }),
    [theme.colors.surface0],
  );
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name="index" />
      <Stack.Protected guard={storeReady}>
        <Stack.Screen name="welcome" />
        <Stack.Screen name="pair-scan" />
      </Stack.Protected>
      {/*
        Do not add getId or dangerouslySingular back to the workspace route.
        Expo Router maps dangerouslySingular to React Navigation getId, and
        getId repeatedly breaks Android native-stack/Fabric by reordering an
        already-mounted workspace screen. Keep workspace identity/retention
        outside this route-level native-stack API.
      */}
      <Stack.Screen name="h/[serverId]/workspace/[workspaceId]" />
      <Stack.Screen name="h/[serverId]/agent/[agentId]" options={AGENT_SCREEN_OPTIONS} />
      <Stack.Screen name="h/[serverId]/index" />
      <Stack.Screen name="h/[serverId]/sessions" />
      <Stack.Screen name="h/[serverId]/open-project" />
      <Stack.Screen name="h/[serverId]/settings" />
      <Stack.Screen name="settings/index" />
      <Stack.Screen name="settings/[section]" />
      <Stack.Screen name="settings/projects/index" />
      <Stack.Screen name="settings/projects/[projectKey]" />
      <Stack.Screen name="settings/hosts/[serverId]" />
    </Stack>
  );
}

function AppShell() {
  return (
    <SidebarAnimationProvider>
      <HorizontalScrollProvider>
        <OpenProjectListener />
        <AppWithSidebar>
          <RootStack />
        </AppWithSidebar>
      </HorizontalScrollProvider>
    </SidebarAnimationProvider>
  );
}

export { AppWithSidebar, AGENT_SCREEN_OPTIONS, RootStack, AppShell };
