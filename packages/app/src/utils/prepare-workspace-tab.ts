import { generateDraftId } from "@/stores/draft-keys";
import {
  buildWorkspaceTabPersistenceKey,
  type WorkspaceTabTarget,
} from "@/stores/workspace-tabs-store";
import { buildHostWorkspaceRoute } from "@/utils/host-routes";

/** Identifies the workspace tab to open or focus, with an optional pin request */
export interface PrepareWorkspaceTabInput {
  serverId: string;
  workspaceId: string;
  target: WorkspaceTabTarget;
  pin?: boolean;
}

/** Extends {@link PrepareWorkspaceTabInput} with the current route used for navigation decisions */
export interface NavigateToPreparedWorkspaceTabInput extends PrepareWorkspaceTabInput {
  currentPathname?: string | null;
}

/** Store callbacks needed to open or pin a workspace tab */
export interface PrepareWorkspaceTabDeps {
  openTabFocused: (workspaceKey: string, target: WorkspaceTabTarget) => string | null;
  pinAgent: (workspaceKey: string, agentId: string) => void;
}

/** Extends {@link PrepareWorkspaceTabDeps} with the workspace navigation callback */
export interface NavigateToPreparedWorkspaceTabDeps extends PrepareWorkspaceTabDeps {
  navigateToWorkspace: (
    serverId: string,
    workspaceId: string,
    options: { currentPathname?: string | null },
  ) => void;
}

function getPreparedTarget(target: WorkspaceTabTarget): WorkspaceTabTarget {
  if (target.kind !== "draft" || target.draftId.trim() !== "new") {
    return target;
  }
  return { kind: "draft", draftId: generateDraftId() };
}

/**
 * Opens (or focuses) the target workspace tab, materializing "new" draft ids and pinning agents on request
 * @param input The workspace, tab target, and pin option to prepare
 * @param deps The store callbacks used to open and pin tabs
 * @returns The host workspace route for the prepared tab
 */
export function prepareWorkspaceTab(
  input: PrepareWorkspaceTabInput,
  deps: PrepareWorkspaceTabDeps,
): string {
  const target = getPreparedTarget(input.target);
  const key =
    buildWorkspaceTabPersistenceKey({
      serverId: input.serverId,
      workspaceId: input.workspaceId,
    }) ?? "";

  deps.openTabFocused(key, target);

  if (input.pin && target.kind === "agent") {
    deps.pinAgent(key, target.agentId);
  }

  return buildHostWorkspaceRoute(input.serverId, input.workspaceId);
}

/**
 * Prepares the target workspace tab and then navigates to its workspace route
 * @param input The workspace, tab target, and current route used for navigation
 * @param deps The store and navigation callbacks used to open the tab and change route
 * @returns The host workspace route that was navigated to
 */
export function navigateToPreparedWorkspaceTab(
  input: NavigateToPreparedWorkspaceTabInput,
  deps: NavigateToPreparedWorkspaceTabDeps,
): string {
  const route = prepareWorkspaceTab(input, deps);
  deps.navigateToWorkspace(input.serverId, input.workspaceId, {
    currentPathname: input.currentPathname,
  });
  return route;
}
