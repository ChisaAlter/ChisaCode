import { useEffect, useState } from "react";
import type { HostRuntimeConnectionStatus } from "@/runtime/host-runtime";
import type { WorkspaceDescriptor } from "@/stores/session-store";

export const WORKSPACE_ROUTE_LOADING_TIMEOUT_MS = 12_000;

interface WorkspaceRouteLoadingTimeoutInput {
  routeKey: string;
  connectionStatus: HostRuntimeConnectionStatus;
  workspace: WorkspaceDescriptor | null;
  hasHydratedWorkspaces: boolean;
}

export function useWorkspaceRouteLoadingTimedOut({
  routeKey,
  connectionStatus,
  workspace,
  hasHydratedWorkspaces,
}: WorkspaceRouteLoadingTimeoutInput): boolean {
  const [timedOut, setTimedOut] = useState(false);
  const shouldArmTimeout =
    routeKey.trim().length > 0 &&
    connectionStatus === "online" &&
    !workspace &&
    !hasHydratedWorkspaces;

  useEffect(() => {
    if (!shouldArmTimeout) {
      setTimedOut(false);
      return;
    }

    setTimedOut(false);
    const timeoutHandle = setTimeout(() => {
      setTimedOut(true);
    }, WORKSPACE_ROUTE_LOADING_TIMEOUT_MS);

    return () => {
      clearTimeout(timeoutHandle);
    };
  }, [routeKey, shouldArmTimeout]);

  return timedOut;
}
