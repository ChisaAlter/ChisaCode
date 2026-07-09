import React, { useEffect } from "react";
import { Redirect, usePathname } from "expo-router";
import { StartupSplashScreen } from "@/screens/startup-splash-screen";
import { useEarliestOnlineHostServerId, useHostRuntimeBootstrapState } from "@/app/_layout";
import {
  resolveStartupRedirectRoute,
  resolveStartupWorkspaceSelection,
} from "@/utils/host-runtime-bootstrap";
import {
  forgetLastWorkspaceSelection,
  useIsLastWorkspaceSelectionHydrated,
  useLastWorkspaceSelection,
} from "@/stores/navigation-active-workspace-store";
import { useSessionStore } from "@/stores/session-store";
import { shouldUseDesktopDaemon } from "@/desktop/daemon/desktop-daemon";
import { buildHostWorkspaceRoute } from "@/utils/host-routes";
import { resolveWorkspaceMapKeyByIdentity } from "@/utils/workspace-execution";

const isDesktop = shouldUseDesktopDaemon();

export default function Index() {
  const pathname = usePathname();
  const bootstrapState = useHostRuntimeBootstrapState();
  const anyOnlineHostServerId = useEarliestOnlineHostServerId();
  const workspaceSelection = useLastWorkspaceSelection();
  const isWorkspaceSelectionLoaded = useIsLastWorkspaceSelectionHydrated();
  const isWorkspaceSelectionValidationPending = useSessionStore((state) => {
    if (!workspaceSelection) {
      return false;
    }
    const session = state.sessions[workspaceSelection.serverId];
    return session?.hasHydratedWorkspaces !== true;
  });
  const workspaceSelectionExists = useSessionStore((state) => {
    if (!workspaceSelection) {
      return false;
    }
    return Boolean(
      resolveWorkspaceMapKeyByIdentity({
        workspaces: state.sessions[workspaceSelection.serverId]?.workspaces,
        workspaceId: workspaceSelection.workspaceId,
      }),
    );
  });
  useEffect(() => {
    if (
      !workspaceSelection ||
      !isWorkspaceSelectionLoaded ||
      isWorkspaceSelectionValidationPending ||
      workspaceSelectionExists
    ) {
      return;
    }
    forgetLastWorkspaceSelection();
  }, [
    isWorkspaceSelectionLoaded,
    isWorkspaceSelectionValidationPending,
    workspaceSelection,
    workspaceSelectionExists,
  ]);

  const redirectRoute = resolveStartupRedirectRoute({
    pathname,
    anyOnlineHostServerId,
    workspaceSelection,
    isWorkspaceSelectionLoaded,
    isWorkspaceSelectionValidationPending,
    workspaceSelectionExists,
    hasGivenUpWaitingForHost: bootstrapState.hasGivenUpWaitingForHost,
  });
  const startupWorkspaceSelection = resolveStartupWorkspaceSelection({
    pathname,
    anyOnlineHostServerId,
    workspaceSelection,
    isWorkspaceSelectionLoaded,
    isWorkspaceSelectionValidationPending,
    workspaceSelectionExists,
    hasGivenUpWaitingForHost: bootstrapState.hasGivenUpWaitingForHost,
  });

  if (startupWorkspaceSelection) {
    return (
      <Redirect
        href={buildHostWorkspaceRoute(
          startupWorkspaceSelection.serverId,
          startupWorkspaceSelection.workspaceId,
        )}
      />
    );
  }

  if (redirectRoute) {
    return <Redirect href={redirectRoute} />;
  }

  return <StartupSplashScreen bootstrapState={isDesktop ? bootstrapState : undefined} />;
}
