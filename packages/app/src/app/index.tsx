import React, { useEffect } from "react";
import { Redirect, usePathname } from "expo-router";
import { StartupSplashScreen } from "@/screens/startup-splash-screen";
import { useEarliestOnlineHostServerId, useHostRuntimeBootstrapState } from "@/app/_layout";
import { resolveStartupRedirectRoute } from "@/utils/host-runtime-bootstrap";
import {
  forgetLastWorkspaceSelection,
  useIsLastWorkspaceSelectionHydrated,
  useLastWorkspaceSelection,
} from "@/stores/navigation-active-workspace-store";
import { useSessionStore } from "@/stores/session-store";
import { shouldUseDesktopDaemon } from "@/desktop/daemon/desktop-daemon";
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

  // 启动不再恢复上次 workspace 的草稿 tab，统一走 Soft Home (/new)。
  // /new 路由内部会从 last-draft-directory-store 读取上次草稿所选目录作为初始值，
  // 让「启动默认草稿」和「点新对话」落到同一个目录。
  const redirectRoute = resolveStartupRedirectRoute({
    pathname,
    anyOnlineHostServerId,
    workspaceSelection: null,
    isWorkspaceSelectionLoaded,
    isWorkspaceSelectionValidationPending,
    workspaceSelectionExists,
    hasGivenUpWaitingForHost: bootstrapState.hasGivenUpWaitingForHost,
  });

  if (redirectRoute) {
    return <Redirect href={redirectRoute} />;
  }

  return <StartupSplashScreen bootstrapState={isDesktop ? bootstrapState : undefined} />;
}
