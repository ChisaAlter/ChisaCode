import { useMemo } from "react";

import { useSubagentsForParent, type SubagentRow } from "@/subagents/select";
import { useSessionStore, type Agent, type WorkspaceDescriptor } from "@/stores/session-store";
import type { TodoEntry, TurnChangesItem } from "@/types/stream";
import {
  buildWorkspaceActivityItems,
  buildWorkspaceStatusStripModel,
  findLatestTodoItems,
  type WorkspaceActivityItem,
  type WorkspaceStatusStripModel,
} from "@/screens/workspace/workspace-environment-panel-model";
import { findLatestTurnChanges } from "@/screens/workspace/workspace-environment-dock-model";

interface UseWorkspaceEnvironmentDataInput {
  normalizedServerId: string;
  focusedPaneAgentId: string | null;
  workspaceDescriptor: WorkspaceDescriptor | null | undefined;
  currentBranchName: string | null;
}

interface UseWorkspaceEnvironmentDataResult {
  environmentPanelAgent: Agent | null;
  environmentPanelAgentId: string | null;
  environmentSubagents: SubagentRow[];
  environmentTodoItems: TodoEntry[] | null;
  environmentTurnChanges: TurnChangesItem | null;
  environmentSourceLabel: string | null;
  environmentWorkspaceStatus: WorkspaceDescriptor["status"] | null;
  workspaceStatusStripModel: WorkspaceStatusStripModel;
  workspaceActivityItems: WorkspaceActivityItem[];
}

function getWorkspaceEnvironmentSourceLabel(
  workspace: WorkspaceDescriptor | null | undefined,
): string | null {
  const label = workspace?.projectDisplayName ?? workspace?.projectRootPath;
  const normalized = label?.trim();
  return normalized ? normalized : null;
}

function useEnvironmentPanelAgent(serverId: string, agentId: string | null): Agent | null {
  return useSessionStore((state) => {
    if (!agentId) {
      return null;
    }
    return state.sessions[serverId]?.agents?.get(agentId) ?? null;
  });
}

function useEnvironmentPanelTodoItems(
  serverId: string,
  agentId: string | null,
): TodoEntry[] | null {
  return useSessionStore((state) => {
    if (!agentId) {
      return null;
    }
    const session = state.sessions[serverId];
    return findLatestTodoItems({
      head: session?.agentStreamHead.get(agentId),
      tail: session?.agentStreamTail.get(agentId),
    });
  });
}

function useEnvironmentPanelTurnChanges(
  serverId: string,
  agentId: string | null,
): TurnChangesItem | null {
  return useSessionStore((state) => {
    if (!agentId) {
      return null;
    }
    const session = state.sessions[serverId];
    return findLatestTurnChanges({
      head: session?.agentStreamHead.get(agentId),
      tail: session?.agentStreamTail.get(agentId),
    });
  });
}

/**
 * Aggregates the focused pane's agent, activity, and workspace environment models.
 * @param input Current server, focused agent, workspace, and branch inputs
 * @returns Reactive environment panel data and derived presentation models
 */
export function useWorkspaceEnvironmentData(
  input: UseWorkspaceEnvironmentDataInput,
): UseWorkspaceEnvironmentDataResult {
  const { normalizedServerId, focusedPaneAgentId, workspaceDescriptor, currentBranchName } = input;
  const environmentPanelAgent = useEnvironmentPanelAgent(normalizedServerId, focusedPaneAgentId);
  const environmentSubagents = useSubagentsForParent({
    serverId: normalizedServerId,
    parentAgentId: focusedPaneAgentId ?? "",
  });
  const environmentTodoItems = useEnvironmentPanelTodoItems(normalizedServerId, focusedPaneAgentId);
  const environmentTurnChanges = useEnvironmentPanelTurnChanges(
    normalizedServerId,
    focusedPaneAgentId,
  );
  const workspaceStatusStripModel = useMemo(
    () =>
      buildWorkspaceStatusStripModel({
        activeAgent: environmentPanelAgent,
        workspace: workspaceDescriptor,
        currentBranchName,
        todoItems: environmentTodoItems,
      }),
    [currentBranchName, environmentPanelAgent, environmentTodoItems, workspaceDescriptor],
  );
  const workspaceActivityItems = useMemo(
    () =>
      buildWorkspaceActivityItems({
        activeAgent: environmentPanelAgent,
        workspace: workspaceDescriptor,
        currentBranchName,
      }),
    [currentBranchName, environmentPanelAgent, workspaceDescriptor],
  );

  return {
    environmentPanelAgent,
    environmentPanelAgentId: environmentPanelAgent?.id ?? null,
    environmentSubagents,
    environmentTodoItems,
    environmentTurnChanges,
    environmentSourceLabel: getWorkspaceEnvironmentSourceLabel(workspaceDescriptor),
    environmentWorkspaceStatus: workspaceDescriptor?.status ?? null,
    workspaceStatusStripModel,
    workspaceActivityItems,
  };
}
