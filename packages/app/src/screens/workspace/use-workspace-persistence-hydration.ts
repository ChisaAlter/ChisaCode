import { useEffect, useMemo, useRef } from "react";
import type { DaemonClient } from "@chisacode/client/internal/daemon-client";

import type { PendingCreateAttempt } from "@/stores/create-flow-store";
import { useCreateFlowStore } from "@/stores/create-flow-store";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import type { WorkspaceTab, WorkspaceTabTarget } from "@/stores/workspace-tabs-store";
import {
  shouldAutoOpenWorkspaceSetup,
  shouldShowWorkspaceSetup,
  useWorkspaceSetupStore,
} from "@/stores/workspace-setup-store";
import { shouldSeedEmptyWorkspaceDraft } from "@/screens/workspace/workspace-empty-draft-seed";
import {
  buildWorkspaceTabSnapshot,
  type WorkspaceAgentVisibility,
} from "@/workspace-tabs/agent-visibility";
import { normalizeWorkspaceTabTarget } from "@/workspace-tabs/identity";

interface UseWorkspacePersistenceHydrationInput {
  client: Pick<DaemonClient, "fetchWorkspaceSetupStatus"> | null;
  isRouteFocused: boolean;
  serverId: string;
  workspaceId: string;
  persistenceKey: string | null;
  workspaceDirectory: string | null;
  hasHydratedWorkspaceLayoutStore: boolean;
  hasHydratedAgents: boolean;
  terminalsHydrated: boolean;
  terminalCount: number;
  knownTerminalIds: Iterable<string>;
  standaloneTerminalIds: Iterable<string>;
  uiTabs: readonly WorkspaceTab[];
  workspaceAgentVisibility: WorkspaceAgentVisibility;
  openWorkspaceDraftTab: () => string | null;
  openWorkspaceTabInBackground: (workspaceKey: string, target: WorkspaceTabTarget) => string | null;
}

interface UseWorkspacePersistenceHydrationResult {
  showWorkspaceSetup: boolean;
}

function hasActivePendingDraftCreate(input: {
  tabs: readonly WorkspaceTab[];
  pendingByDraftId: Readonly<Record<string, PendingCreateAttempt>>;
  serverId: string;
}): boolean {
  return input.tabs.some((tab) => {
    if (tab.target.kind !== "draft") {
      return false;
    }
    const pending = input.pendingByDraftId[tab.target.draftId];
    return (
      pending?.serverId === input.serverId &&
      (pending.lifecycle === "active" || pending.lifecycle === "sent")
    );
  });
}

/** Owns workspace layout reconciliation, setup hydration, and automatic persisted tab recovery. */
export function useWorkspacePersistenceHydration(
  input: UseWorkspacePersistenceHydrationInput,
): UseWorkspacePersistenceHydrationResult {
  const openWorkspaceDraftTab = input.openWorkspaceDraftTab;
  const openWorkspaceTabInBackground = input.openWorkspaceTabInBackground;
  const pendingByDraftId = useCreateFlowStore((state) => state.pendingByDraftId);
  const reconcileWorkspaceTabs = useWorkspaceLayoutStore((state) => state.reconcileTabs);
  const workspaceSetupSnapshot = useWorkspaceSetupStore((state) =>
    input.persistenceKey ? (state.snapshots[input.persistenceKey] ?? null) : null,
  );
  const upsertWorkspaceSetupProgress = useWorkspaceSetupStore((state) => state.upsertProgress);
  const showWorkspaceSetup = shouldShowWorkspaceSetup(workspaceSetupSnapshot);
  const hasSetupTab = useMemo(
    () =>
      input.uiTabs.some(
        (tab) => tab.target.kind === "setup" && tab.target.workspaceId === input.workspaceId,
      ),
    [input.uiTabs, input.workspaceId],
  );
  const emptyWorkspaceSeedKeysRef = useRef<Set<string>>(new Set());
  const autoOpenedSetupTabWorkspaceRef = useRef<string | null>(null);
  const requestedWorkspaceSetupStatusKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (
      !input.isRouteFocused ||
      !input.serverId ||
      !input.workspaceId ||
      !input.persistenceKey ||
      !input.hasHydratedWorkspaceLayoutStore
    ) {
      return;
    }

    reconcileWorkspaceTabs(
      input.persistenceKey,
      buildWorkspaceTabSnapshot({
        agentVisibility: input.workspaceAgentVisibility,
        agentsHydrated: input.hasHydratedAgents,
        terminalsHydrated: input.terminalsHydrated,
        knownTerminalIds: input.knownTerminalIds,
        standaloneTerminalIds: input.standaloneTerminalIds,
        hasActivePendingDraftCreate: hasActivePendingDraftCreate({
          tabs: input.uiTabs,
          pendingByDraftId,
          serverId: input.serverId,
        }),
        activeSetupWorkspaceId: showWorkspaceSetup ? input.workspaceId : null,
      }),
    );
  }, [
    input.hasHydratedAgents,
    input.hasHydratedWorkspaceLayoutStore,
    input.isRouteFocused,
    input.knownTerminalIds,
    input.persistenceKey,
    input.serverId,
    input.standaloneTerminalIds,
    input.terminalsHydrated,
    input.uiTabs,
    input.workspaceAgentVisibility,
    input.workspaceId,
    pendingByDraftId,
    reconcileWorkspaceTabs,
    showWorkspaceSetup,
  ]);

  useEffect(() => {
    if (
      !input.isRouteFocused ||
      !input.client ||
      !input.serverId ||
      !input.workspaceId ||
      !input.persistenceKey ||
      workspaceSetupSnapshot ||
      requestedWorkspaceSetupStatusKeyRef.current === input.persistenceKey
    ) {
      return;
    }

    requestedWorkspaceSetupStatusKeyRef.current = input.persistenceKey;
    let isCancelled = false;

    input.client
      .fetchWorkspaceSetupStatus(input.workspaceId)
      .then((response) => {
        if (isCancelled || response.workspaceId !== input.workspaceId || !response.snapshot) {
          return;
        }
        upsertWorkspaceSetupProgress({
          serverId: input.serverId,
          payload: { workspaceId: response.workspaceId, ...response.snapshot },
          source: "cached",
        });
        return;
      })
      .catch(() => {
        if (requestedWorkspaceSetupStatusKeyRef.current === input.persistenceKey) {
          requestedWorkspaceSetupStatusKeyRef.current = null;
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [
    input.client,
    input.isRouteFocused,
    input.persistenceKey,
    input.serverId,
    input.workspaceId,
    upsertWorkspaceSetupProgress,
    workspaceSetupSnapshot,
  ]);

  useEffect(() => {
    const hasSeedPrerequisites = Boolean(
      input.isRouteFocused &&
      input.persistenceKey &&
      input.workspaceDirectory &&
      input.hasHydratedWorkspaceLayoutStore &&
      input.hasHydratedAgents &&
      input.terminalsHydrated,
    );
    if (!hasSeedPrerequisites || !input.persistenceKey) {
      return;
    }

    const hasConsideredEmptyWorkspaceDraftSeed = emptyWorkspaceSeedKeysRef.current.has(
      input.persistenceKey,
    );
    const shouldSeedDraft = shouldSeedEmptyWorkspaceDraft({
      isRouteFocused: input.isRouteFocused,
      hasPersistenceKey: true,
      hasWorkspaceDirectory: true,
      hasHydratedWorkspaceLayoutStore: input.hasHydratedWorkspaceLayoutStore,
      hasHydratedAgents: input.hasHydratedAgents,
      hasLoadedTerminals: input.terminalsHydrated,
      hasConsideredEmptyWorkspaceDraftSeed,
      activeAgentCount: input.workspaceAgentVisibility.activeAgentIds.size,
      terminalCount: input.terminalCount,
      workspaceTabCount: input.uiTabs.length,
    });

    if (hasConsideredEmptyWorkspaceDraftSeed) {
      return;
    }
    emptyWorkspaceSeedKeysRef.current.add(input.persistenceKey);
    if (shouldSeedDraft) {
      openWorkspaceDraftTab();
    }
  }, [
    input.hasHydratedAgents,
    input.hasHydratedWorkspaceLayoutStore,
    input.isRouteFocused,
    openWorkspaceDraftTab,
    input.persistenceKey,
    input.terminalCount,
    input.terminalsHydrated,
    input.uiTabs.length,
    input.workspaceAgentVisibility.activeAgentIds.size,
    input.workspaceDirectory,
  ]);

  useEffect(() => {
    if (!input.isRouteFocused || !input.persistenceKey) {
      return;
    }
    if (!workspaceSetupSnapshot || !showWorkspaceSetup) {
      if (autoOpenedSetupTabWorkspaceRef.current === input.persistenceKey) {
        autoOpenedSetupTabWorkspaceRef.current = null;
      }
      return;
    }
    if (!shouldAutoOpenWorkspaceSetup(workspaceSetupSnapshot)) {
      return;
    }
    if (hasSetupTab) {
      autoOpenedSetupTabWorkspaceRef.current = input.persistenceKey;
      return;
    }
    if (autoOpenedSetupTabWorkspaceRef.current === input.persistenceKey) {
      return;
    }

    const target = normalizeWorkspaceTabTarget({
      kind: "setup",
      workspaceId: input.workspaceId,
    });
    if (!target) {
      return;
    }
    const tabId = openWorkspaceTabInBackground(input.persistenceKey, target);
    if (tabId) {
      autoOpenedSetupTabWorkspaceRef.current = input.persistenceKey;
    }
  }, [
    hasSetupTab,
    input.isRouteFocused,
    openWorkspaceTabInBackground,
    input.persistenceKey,
    input.workspaceId,
    showWorkspaceSetup,
    workspaceSetupSnapshot,
  ]);

  return { showWorkspaceSetup };
}
