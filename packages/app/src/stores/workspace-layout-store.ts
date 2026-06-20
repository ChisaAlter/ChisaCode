import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  buildWorkspaceTabPersistenceKey,
  type WorkspaceTab,
  type WorkspaceTabTarget,
} from "@/stores/workspace-tabs-store";
import {
  defaultWorkspaceLayoutIds,
  type WorkspaceLayoutIdSource,
} from "@/stores/workspace-layout-ids";
import {
  clampNormalizedSizes,
  closeTabInLayout,
  collectAllPanes,
  collectAllTabs,
  convertDraftToAgentInLayout,
  createDefaultLayout,
  findPaneById,
  findPaneContainingTab,
  focusPaneInLayout,
  focusTabInLayout,
  getFocusedBrowserId,
  getTreeDepth,
  insertSplit,
  moveTabToPaneInLayout,
  normalizeLayout,
  openTabInLayoutBackground,
  openTabInLayoutFocused,
  reconcileWorkspaceTabs,
  removePaneFromTree,
  removeTabFromTree,
  reorderFocusedPaneTabsInLayout,
  reorderPaneTabsInLayout,
  retargetTabInLayout,
  splitPaneEmptyInLayout,
  splitPaneInLayout,
  type SplitGroup,
  type SplitNode,
  type SplitPane,
  type WorkspaceTabReconcileState,
  type WorkspaceTabSnapshot,
  type WorkspaceLayout,
} from "@/stores/workspace-layout-actions";
import { normalizeWorkspaceTabTarget } from "@/workspace-tabs/identity";

export { buildWorkspaceTabPersistenceKey };
export {
  collectAllPanes,
  collectAllTabs,
  createDefaultLayout,
  findPaneById,
  findPaneContainingTab,
  getFocusedBrowserId,
  getTreeDepth,
  insertSplit,
  normalizeLayout,
  removePaneFromTree,
  removeTabFromTree,
};
export type {
  SplitGroup,
  SplitNode,
  SplitPane,
  WorkspaceLayout,
  WorkspaceTabReconcileState,
  WorkspaceTabSnapshot,
};

interface WorkspaceLayoutStore {
  layoutByWorkspace: Record<string, WorkspaceLayout>;
  splitSizesByWorkspace: Record<string, Record<string, number[]>>;
  pinnedAgentIdsByWorkspace: Record<string, Set<string>>;
  hiddenAgentIdsByWorkspace: Record<string, Set<string>>;
  suppressedAutoOpenAgentIdsByWorkspace: Record<string, Set<string>>;
  suppressedAutoOpenTerminalIdsByWorkspace: Record<string, Set<string>>;
  workspaceAutoOpenSuppressedByWorkspace: Record<string, true>;
  focusRestorationByWorkspace: Record<string, WorkspaceFocusRestorationState>;
  openTabFocused: (workspaceKey: string, target: WorkspaceTabTarget) => string | null;
  openChildTabFocused: (
    workspaceKey: string,
    target: WorkspaceTabTarget,
    parentTabId: string,
  ) => string | null;
  openTabInBackground: (workspaceKey: string, target: WorkspaceTabTarget) => string | null;
  closeTab: (workspaceKey: string, tabId: string) => void;
  focusTab: (workspaceKey: string, tabId: string) => void;
  retargetTab: (workspaceKey: string, tabId: string, target: WorkspaceTabTarget) => string | null;
  convertDraftToAgent: (workspaceKey: string, tabId: string, agentId: string) => string | null;
  reconcileTabs: (workspaceKey: string, snapshot: WorkspaceTabSnapshot) => void;
  reorderTabs: (workspaceKey: string, tabIds: string[]) => void;
  getWorkspaceTabs: (workspaceKey: string) => WorkspaceTab[];
  splitPane: (
    workspaceKey: string,
    input: {
      tabId: string;
      targetPaneId: string;
      position: "left" | "right" | "top" | "bottom";
    },
  ) => string | null;
  splitPaneEmpty: (
    workspaceKey: string,
    input: {
      targetPaneId: string;
      position: "left" | "right" | "top" | "bottom";
    },
  ) => string | null;
  moveTabToPane: (workspaceKey: string, tabId: string, toPaneId: string) => void;
  focusPane: (workspaceKey: string, paneId: string) => void;
  unfocusPane: (workspaceKey: string) => string | null;
  restorePaneFocus: (workspaceKey: string, token: string) => void;
  resizeSplit: (workspaceKey: string, groupId: string, sizes: number[]) => void;
  reorderTabsInPane: (workspaceKey: string, paneId: string, tabIds: string[]) => void;
  pinAgent: (workspaceKey: string, agentId: string) => void;
  unpinAgent: (workspaceKey: string, agentId: string) => void;
  unpinAgentEverywhere: (agentId: string) => void;
  hideAgent: (workspaceKey: string, agentId: string) => void;
  unhideAgent: (workspaceKey: string, agentId: string) => void;
  suppressAgentAutoOpen: (workspaceKey: string, agentId: string) => void;
  unsuppressAgentAutoOpen: (workspaceKey: string, agentId: string) => void;
  suppressTerminalAutoOpen: (workspaceKey: string, terminalId: string) => void;
  unsuppressTerminalAutoOpen: (workspaceKey: string, terminalId: string) => void;
  purgeWorkspace: (workspaceKey: string) => void;
}

interface WorkspaceFocusRestorationState {
  restorePaneId: string | null;
  tokens: string[];
}

const MAX_TREE_DEPTH = 4;

function trimNonEmpty(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function addIdToWorkspaceSet(
  state: Record<string, Set<string>>,
  workspaceKey: string,
  id: string,
): Record<string, Set<string>> {
  const currentIds = state[workspaceKey] ?? null;
  if (currentIds?.has(id)) {
    return state;
  }

  const nextIds = new Set(currentIds ?? []);
  nextIds.add(id);
  return {
    ...state,
    [workspaceKey]: nextIds,
  };
}

function removeIdFromWorkspaceSet(
  state: Record<string, Set<string>>,
  workspaceKey: string,
  id: string,
): Record<string, Set<string>> {
  const currentIds = state[workspaceKey] ?? null;
  if (!currentIds?.has(id)) {
    return state;
  }

  if (currentIds.size === 1) {
    const nextState = { ...state };
    delete nextState[workspaceKey];
    return nextState;
  }

  const nextIds = new Set(currentIds);
  nextIds.delete(id);
  return {
    ...state,
    [workspaceKey]: nextIds,
  };
}

function removeIdFromEveryWorkspaceSet(
  state: Record<string, Set<string>>,
  id: string,
): Record<string, Set<string>> {
  let nextState: Record<string, Set<string>> | null = null;
  for (const [workspaceKey, currentIds] of Object.entries(state)) {
    if (!currentIds.has(id)) {
      continue;
    }

    nextState ??= { ...state };
    if (currentIds.size === 1) {
      delete nextState[workspaceKey];
      continue;
    }

    const nextIds = new Set(currentIds);
    nextIds.delete(id);
    nextState[workspaceKey] = nextIds;
  }

  return nextState ?? state;
}

function getWorkspaceLayout(
  state: Record<string, WorkspaceLayout>,
  workspaceKey: string,
): WorkspaceLayout {
  return normalizeLayout(state[workspaceKey] ?? createDefaultLayout());
}

function withoutFocusRestoration(
  state: WorkspaceLayoutStore,
  workspaceKey: string,
): Pick<WorkspaceLayoutStore, "focusRestorationByWorkspace"> | null {
  if (!(workspaceKey in state.focusRestorationByWorkspace)) {
    return null;
  }
  const { [workspaceKey]: _removed, ...focusRestorationByWorkspace } =
    state.focusRestorationByWorkspace;
  return { focusRestorationByWorkspace };
}

function clearAgentVisibilityBlocks(input: {
  state: WorkspaceLayoutStore;
  workspaceKey: string;
  agentId: string;
}): Pick<
  WorkspaceLayoutStore,
  "hiddenAgentIdsByWorkspace" | "suppressedAutoOpenAgentIdsByWorkspace"
> {
  return {
    hiddenAgentIdsByWorkspace: removeIdFromWorkspaceSet(
      input.state.hiddenAgentIdsByWorkspace,
      input.workspaceKey,
      input.agentId,
    ),
    suppressedAutoOpenAgentIdsByWorkspace: removeIdFromWorkspaceSet(
      input.state.suppressedAutoOpenAgentIdsByWorkspace,
      input.workspaceKey,
      input.agentId,
    ),
  };
}

function clearTerminalVisibilityBlocks(input: {
  state: WorkspaceLayoutStore;
  workspaceKey: string;
  terminalId: string;
}): Pick<WorkspaceLayoutStore, "suppressedAutoOpenTerminalIdsByWorkspace"> {
  return {
    suppressedAutoOpenTerminalIdsByWorkspace: removeIdFromWorkspaceSet(
      input.state.suppressedAutoOpenTerminalIdsByWorkspace,
      input.workspaceKey,
      input.terminalId,
    ),
  };
}

function clearWorkspaceAutoOpenSuppression(
  state: WorkspaceLayoutStore,
  workspaceKey: string,
): Pick<WorkspaceLayoutStore, "workspaceAutoOpenSuppressedByWorkspace"> | null {
  if (!(workspaceKey in state.workspaceAutoOpenSuppressedByWorkspace)) {
    return null;
  }
  const { [workspaceKey]: _removed, ...workspaceAutoOpenSuppressedByWorkspace } =
    state.workspaceAutoOpenSuppressedByWorkspace;
  return { workspaceAutoOpenSuppressedByWorkspace };
}

function attachParentTab(input: {
  layout: WorkspaceLayout;
  childTabId: string | null;
  parentTabId: string | null;
}): WorkspaceLayout {
  const childTabId = trimNonEmpty(input.childTabId);
  const parentTabId = trimNonEmpty(input.parentTabId);
  if (!childTabId || !parentTabId || childTabId === parentTabId) {
    return normalizeLayout(input.layout);
  }

  const openTabIds = new Set(collectAllTabs(input.layout.root).map((tab) => tab.tabId));
  if (!openTabIds.has(childTabId) || !openTabIds.has(parentTabId)) {
    return normalizeLayout(input.layout);
  }

  return normalizeLayout({
    ...input.layout,
    parentTabIdByTabId: {
      ...input.layout.parentTabIdByTabId,
      [childTabId]: parentTabId,
    },
  });
}

export function createWorkspaceLayoutStore(
  ids: WorkspaceLayoutIdSource = defaultWorkspaceLayoutIds,
) {
  return create<WorkspaceLayoutStore>()(
    persist(
      (set, get) => ({
        layoutByWorkspace: {},
        splitSizesByWorkspace: {},
        pinnedAgentIdsByWorkspace: {},
        hiddenAgentIdsByWorkspace: {},
        suppressedAutoOpenAgentIdsByWorkspace: {},
        suppressedAutoOpenTerminalIdsByWorkspace: {},
        workspaceAutoOpenSuppressedByWorkspace: {},
        focusRestorationByWorkspace: {},
        openTabFocused: (workspaceKey, target) => {
          const normalizedWorkspaceKey = trimNonEmpty(workspaceKey);
          const normalizedTarget = normalizeWorkspaceTabTarget(target);
          if (!normalizedWorkspaceKey || !normalizedTarget) {
            return null;
          }

          const result = openTabInLayoutFocused({
            layout: getWorkspaceLayout(get().layoutByWorkspace, normalizedWorkspaceKey),
            target: normalizedTarget,
            now: Date.now(),
          });

          set((state) => ({
            ...withoutFocusRestoration(state, normalizedWorkspaceKey),
            ...clearWorkspaceAutoOpenSuppression(state, normalizedWorkspaceKey),
            ...(normalizedTarget.kind === "agent"
              ? clearAgentVisibilityBlocks({
                  state,
                  workspaceKey: normalizedWorkspaceKey,
                  agentId: normalizedTarget.agentId,
                })
              : {}),
            ...(normalizedTarget.kind === "terminal"
              ? clearTerminalVisibilityBlocks({
                  state,
                  workspaceKey: normalizedWorkspaceKey,
                  terminalId: normalizedTarget.terminalId,
                })
              : {}),
            layoutByWorkspace: {
              ...state.layoutByWorkspace,
              [normalizedWorkspaceKey]: result.layout,
            },
          }));

          return result.tabId;
        },
        openChildTabFocused: (workspaceKey, target, parentTabId) => {
          const normalizedWorkspaceKey = trimNonEmpty(workspaceKey);
          const normalizedParentTabId = trimNonEmpty(parentTabId);
          const normalizedTarget = normalizeWorkspaceTabTarget(target);
          if (!normalizedWorkspaceKey || !normalizedParentTabId || !normalizedTarget) {
            return null;
          }

          const result = openTabInLayoutFocused({
            layout: getWorkspaceLayout(get().layoutByWorkspace, normalizedWorkspaceKey),
            target: normalizedTarget,
            now: Date.now(),
          });

          set((state) => {
            const layout = attachParentTab({
              layout: result.layout,
              childTabId: result.tabId,
              parentTabId: normalizedParentTabId,
            });
            return {
              ...withoutFocusRestoration(state, normalizedWorkspaceKey),
              ...clearWorkspaceAutoOpenSuppression(state, normalizedWorkspaceKey),
              ...(normalizedTarget.kind === "agent"
                ? clearAgentVisibilityBlocks({
                    state,
                    workspaceKey: normalizedWorkspaceKey,
                    agentId: normalizedTarget.agentId,
                  })
                : {}),
              ...(normalizedTarget.kind === "terminal"
                ? clearTerminalVisibilityBlocks({
                    state,
                    workspaceKey: normalizedWorkspaceKey,
                    terminalId: normalizedTarget.terminalId,
                  })
                : {}),
              layoutByWorkspace: {
                ...state.layoutByWorkspace,
                [normalizedWorkspaceKey]: layout,
              },
            };
          });

          return result.tabId;
        },
        openTabInBackground: (workspaceKey, target) => {
          const normalizedWorkspaceKey = trimNonEmpty(workspaceKey);
          const normalizedTarget = normalizeWorkspaceTabTarget(target);
          if (!normalizedWorkspaceKey || !normalizedTarget) {
            return null;
          }

          const result = openTabInLayoutBackground({
            layout: getWorkspaceLayout(get().layoutByWorkspace, normalizedWorkspaceKey),
            target: normalizedTarget,
            now: Date.now(),
          });

          set((state) => ({
            ...clearWorkspaceAutoOpenSuppression(state, normalizedWorkspaceKey),
            ...(normalizedTarget.kind === "agent"
              ? clearAgentVisibilityBlocks({
                  state,
                  workspaceKey: normalizedWorkspaceKey,
                  agentId: normalizedTarget.agentId,
                })
              : {}),
            ...(normalizedTarget.kind === "terminal"
              ? clearTerminalVisibilityBlocks({
                  state,
                  workspaceKey: normalizedWorkspaceKey,
                  terminalId: normalizedTarget.terminalId,
                })
              : {}),
            layoutByWorkspace: {
              ...state.layoutByWorkspace,
              [normalizedWorkspaceKey]: result.layout,
            },
          }));

          return result.tabId;
        },
        closeTab: (workspaceKey, tabId) => {
          const normalizedWorkspaceKey = trimNonEmpty(workspaceKey);
          const normalizedTabId = trimNonEmpty(tabId);
          if (!normalizedWorkspaceKey || !normalizedTabId) {
            return;
          }

          set((state) => {
            const currentLayout = getWorkspaceLayout(
              state.layoutByWorkspace,
              normalizedWorkspaceKey,
            );
            const closingTab =
              collectAllTabs(currentLayout.root).find((tab) => tab.tabId === normalizedTabId) ??
              null;
            const nextLayout = closeTabInLayout({
              layout: currentLayout,
              tabId: normalizedTabId,
            });
            if (!nextLayout) {
              return state;
            }

            return {
              ...withoutFocusRestoration(state, normalizedWorkspaceKey),
              ...(closingTab?.target.kind === "terminal"
                ? {
                    suppressedAutoOpenTerminalIdsByWorkspace: addIdToWorkspaceSet(
                      state.suppressedAutoOpenTerminalIdsByWorkspace,
                      normalizedWorkspaceKey,
                      closingTab.target.terminalId,
                    ),
                  }
                : {}),
              ...(collectAllTabs(nextLayout.root).length === 0
                ? {
                    workspaceAutoOpenSuppressedByWorkspace: {
                      ...state.workspaceAutoOpenSuppressedByWorkspace,
                      [normalizedWorkspaceKey]: true,
                    },
                  }
                : {}),
              layoutByWorkspace: {
                ...state.layoutByWorkspace,
                [normalizedWorkspaceKey]: nextLayout,
              },
            };
          });
        },
        focusTab: (workspaceKey, tabId) => {
          const normalizedWorkspaceKey = trimNonEmpty(workspaceKey);
          const normalizedTabId = trimNonEmpty(tabId);
          if (!normalizedWorkspaceKey || !normalizedTabId) {
            return;
          }

          set((state) => {
            const nextLayout = focusTabInLayout({
              layout: getWorkspaceLayout(state.layoutByWorkspace, normalizedWorkspaceKey),
              tabId: normalizedTabId,
            });
            if (!nextLayout) {
              return state;
            }

            return {
              ...withoutFocusRestoration(state, normalizedWorkspaceKey),
              layoutByWorkspace: {
                ...state.layoutByWorkspace,
                [normalizedWorkspaceKey]: nextLayout,
              },
            };
          });
        },
        retargetTab: (workspaceKey, tabId, target) => {
          const normalizedWorkspaceKey = trimNonEmpty(workspaceKey);
          const normalizedTabId = trimNonEmpty(tabId);
          const normalizedTarget = normalizeWorkspaceTabTarget(target);
          if (!normalizedWorkspaceKey || !normalizedTabId || !normalizedTarget) {
            return null;
          }

          const result = retargetTabInLayout({
            layout: getWorkspaceLayout(get().layoutByWorkspace, normalizedWorkspaceKey),
            tabId: normalizedTabId,
            target: normalizedTarget,
          });
          if (!result) {
            return null;
          }

          set((state) => ({
            ...(result.layout.focusedPaneId !== null
              ? (withoutFocusRestoration(state, normalizedWorkspaceKey) ?? {})
              : {}),
            ...(normalizedTarget.kind === "agent"
              ? clearAgentVisibilityBlocks({
                  state,
                  workspaceKey: normalizedWorkspaceKey,
                  agentId: normalizedTarget.agentId,
                })
              : {}),
            layoutByWorkspace: {
              ...state.layoutByWorkspace,
              [normalizedWorkspaceKey]: result.layout,
            },
          }));

          return result.tabId;
        },
        convertDraftToAgent: (workspaceKey, tabId, agentId) => {
          const normalizedWorkspaceKey = trimNonEmpty(workspaceKey);
          const normalizedTabId = trimNonEmpty(tabId);
          const normalizedAgentId = trimNonEmpty(agentId);
          if (!normalizedWorkspaceKey || !normalizedTabId || !normalizedAgentId) {
            return null;
          }

          const result = convertDraftToAgentInLayout({
            layout: getWorkspaceLayout(get().layoutByWorkspace, normalizedWorkspaceKey),
            tabId: normalizedTabId,
            agentId: normalizedAgentId,
          });
          if (!result) {
            return null;
          }

          set((state) => ({
            ...(result.layout.focusedPaneId !== null
              ? (withoutFocusRestoration(state, normalizedWorkspaceKey) ?? {})
              : {}),
            ...clearAgentVisibilityBlocks({
              state,
              workspaceKey: normalizedWorkspaceKey,
              agentId: normalizedAgentId,
            }),
            layoutByWorkspace: {
              ...state.layoutByWorkspace,
              [normalizedWorkspaceKey]: result.layout,
            },
          }));

          return result.tabId;
        },
        reconcileTabs: (workspaceKey, snapshot) => {
          const normalizedWorkspaceKey = trimNonEmpty(workspaceKey);
          if (!normalizedWorkspaceKey) {
            return;
          }

          set((state) => {
            const currentLayout = getWorkspaceLayout(
              state.layoutByWorkspace,
              normalizedWorkspaceKey,
            );
            const nextState = reconcileWorkspaceTabs(
              {
                layout: currentLayout,
                pinnedAgentIds: state.pinnedAgentIdsByWorkspace[normalizedWorkspaceKey] ?? null,
                hiddenAgentIds: state.hiddenAgentIdsByWorkspace[normalizedWorkspaceKey] ?? null,
                suppressedAutoOpenAgentIds:
                  state.suppressedAutoOpenAgentIdsByWorkspace[normalizedWorkspaceKey] ?? null,
                suppressedAutoOpenTerminalIds:
                  state.suppressedAutoOpenTerminalIdsByWorkspace[normalizedWorkspaceKey] ?? null,
                isWorkspaceAutoOpenSuppressed: Boolean(
                  state.workspaceAutoOpenSuppressedByWorkspace[normalizedWorkspaceKey],
                ),
              },
              snapshot,
            );
            if (nextState.layout === currentLayout) {
              return state;
            }

            return {
              layoutByWorkspace: {
                ...state.layoutByWorkspace,
                [normalizedWorkspaceKey]: nextState.layout,
              },
            };
          });
        },
        reorderTabs: (workspaceKey, tabIds) => {
          const normalizedWorkspaceKey = trimNonEmpty(workspaceKey);
          if (!normalizedWorkspaceKey) {
            return;
          }

          set((state) => {
            const nextLayout = reorderFocusedPaneTabsInLayout({
              layout: getWorkspaceLayout(state.layoutByWorkspace, normalizedWorkspaceKey),
              tabIds,
            });
            if (!nextLayout) {
              return state;
            }

            return {
              layoutByWorkspace: {
                ...state.layoutByWorkspace,
                [normalizedWorkspaceKey]: nextLayout,
              },
            };
          });
        },
        getWorkspaceTabs: (workspaceKey) => {
          const normalizedWorkspaceKey = trimNonEmpty(workspaceKey);
          if (!normalizedWorkspaceKey) {
            return [];
          }
          return collectAllTabs(
            getWorkspaceLayout(get().layoutByWorkspace, normalizedWorkspaceKey).root,
          );
        },
        splitPane: (workspaceKey, input) => {
          const normalizedWorkspaceKey = trimNonEmpty(workspaceKey);
          const normalizedTabId = trimNonEmpty(input.tabId);
          const normalizedTargetPaneId = trimNonEmpty(input.targetPaneId);
          if (!normalizedWorkspaceKey || !normalizedTabId || !normalizedTargetPaneId) {
            return null;
          }

          const result = splitPaneInLayout({
            layout: getWorkspaceLayout(get().layoutByWorkspace, normalizedWorkspaceKey),
            tabId: normalizedTabId,
            targetPaneId: normalizedTargetPaneId,
            position: input.position,
            maxTreeDepth: MAX_TREE_DEPTH,
            createNodeId: ids.createNodeId,
          });
          if (!result) {
            return null;
          }

          set((state) => ({
            ...withoutFocusRestoration(state, normalizedWorkspaceKey),
            layoutByWorkspace: {
              ...state.layoutByWorkspace,
              [normalizedWorkspaceKey]: result.layout,
            },
          }));

          return result.paneId;
        },
        splitPaneEmpty: (workspaceKey, input) => {
          const normalizedWorkspaceKey = trimNonEmpty(workspaceKey);
          const normalizedTargetPaneId = trimNonEmpty(input.targetPaneId);
          if (!normalizedWorkspaceKey || !normalizedTargetPaneId) {
            return null;
          }

          const result = splitPaneEmptyInLayout({
            layout: getWorkspaceLayout(get().layoutByWorkspace, normalizedWorkspaceKey),
            targetPaneId: normalizedTargetPaneId,
            position: input.position,
            maxTreeDepth: MAX_TREE_DEPTH,
            createNodeId: ids.createNodeId,
          });
          if (!result) {
            return null;
          }

          set((state) => ({
            ...withoutFocusRestoration(state, normalizedWorkspaceKey),
            layoutByWorkspace: {
              ...state.layoutByWorkspace,
              [normalizedWorkspaceKey]: result.layout,
            },
          }));

          return result.paneId;
        },
        moveTabToPane: (workspaceKey, tabId, toPaneId) => {
          const normalizedWorkspaceKey = trimNonEmpty(workspaceKey);
          const normalizedTabId = trimNonEmpty(tabId);
          const normalizedToPaneId = trimNonEmpty(toPaneId);
          if (!normalizedWorkspaceKey || !normalizedTabId || !normalizedToPaneId) {
            return;
          }

          set((state) => {
            const nextLayout = moveTabToPaneInLayout({
              layout: getWorkspaceLayout(state.layoutByWorkspace, normalizedWorkspaceKey),
              tabId: normalizedTabId,
              toPaneId: normalizedToPaneId,
            });
            if (!nextLayout) {
              return state;
            }

            return {
              ...withoutFocusRestoration(state, normalizedWorkspaceKey),
              layoutByWorkspace: {
                ...state.layoutByWorkspace,
                [normalizedWorkspaceKey]: nextLayout,
              },
            };
          });
        },
        focusPane: (workspaceKey, paneId) => {
          const normalizedWorkspaceKey = trimNonEmpty(workspaceKey);
          const normalizedPaneId = trimNonEmpty(paneId);
          if (!normalizedWorkspaceKey || !normalizedPaneId) {
            return;
          }

          set((state) => {
            const nextLayout = focusPaneInLayout({
              layout: getWorkspaceLayout(state.layoutByWorkspace, normalizedWorkspaceKey),
              paneId: normalizedPaneId,
            });
            if (!nextLayout) {
              return state;
            }

            return {
              ...withoutFocusRestoration(state, normalizedWorkspaceKey),
              layoutByWorkspace: {
                ...state.layoutByWorkspace,
                [normalizedWorkspaceKey]: nextLayout,
              },
            };
          });
        },
        unfocusPane: (workspaceKey) => {
          const normalizedWorkspaceKey = trimNonEmpty(workspaceKey);
          if (!normalizedWorkspaceKey) {
            return null;
          }

          const token = ids.createFocusRestorationToken();
          set((state) => {
            const layout = getWorkspaceLayout(state.layoutByWorkspace, normalizedWorkspaceKey);
            const currentRestoration = state.focusRestorationByWorkspace[normalizedWorkspaceKey];
            const restorePaneId = currentRestoration?.restorePaneId ?? layout.focusedPaneId;

            return {
              focusRestorationByWorkspace: {
                ...state.focusRestorationByWorkspace,
                [normalizedWorkspaceKey]: {
                  restorePaneId,
                  tokens: [...(currentRestoration?.tokens ?? []), token],
                },
              },
              layoutByWorkspace: {
                ...state.layoutByWorkspace,
                [normalizedWorkspaceKey]:
                  layout.focusedPaneId === null ? layout : { ...layout, focusedPaneId: null },
              },
            };
          });
          return token;
        },
        restorePaneFocus: (workspaceKey, token) => {
          const normalizedWorkspaceKey = trimNonEmpty(workspaceKey);
          const normalizedToken = trimNonEmpty(token);
          if (!normalizedWorkspaceKey || !normalizedToken) {
            return;
          }

          set((state) => {
            const restoration = state.focusRestorationByWorkspace[normalizedWorkspaceKey];
            if (!restoration?.tokens.includes(normalizedToken)) {
              return state;
            }

            const nextTokens = restoration.tokens.filter((entry) => entry !== normalizedToken);
            const { [normalizedWorkspaceKey]: _removed, ...remainingRestorations } =
              state.focusRestorationByWorkspace;
            const layout = getWorkspaceLayout(state.layoutByWorkspace, normalizedWorkspaceKey);

            if (layout.focusedPaneId !== null) {
              return {
                focusRestorationByWorkspace: remainingRestorations,
              };
            }

            if (nextTokens.length > 0) {
              return {
                focusRestorationByWorkspace: {
                  ...remainingRestorations,
                  [normalizedWorkspaceKey]: {
                    restorePaneId: restoration.restorePaneId,
                    tokens: nextTokens,
                  },
                },
              };
            }

            const restorePaneId = findPaneById(layout.root, restoration.restorePaneId)?.id ?? null;
            if (!restorePaneId) {
              return {
                focusRestorationByWorkspace: remainingRestorations,
              };
            }

            return {
              focusRestorationByWorkspace: remainingRestorations,
              layoutByWorkspace: {
                ...state.layoutByWorkspace,
                [normalizedWorkspaceKey]: {
                  ...layout,
                  focusedPaneId: restorePaneId,
                },
              },
            };
          });
        },
        resizeSplit: (workspaceKey, groupId, sizes) => {
          const normalizedWorkspaceKey = trimNonEmpty(workspaceKey);
          const normalizedGroupId = trimNonEmpty(groupId);
          if (!normalizedWorkspaceKey || !normalizedGroupId) {
            return;
          }

          set((state) => ({
            splitSizesByWorkspace: {
              ...state.splitSizesByWorkspace,
              [normalizedWorkspaceKey]: {
                ...state.splitSizesByWorkspace[normalizedWorkspaceKey],
                [normalizedGroupId]: clampNormalizedSizes(sizes),
              },
            },
          }));
        },
        reorderTabsInPane: (workspaceKey, paneId, tabIds) => {
          const normalizedWorkspaceKey = trimNonEmpty(workspaceKey);
          const normalizedPaneId = trimNonEmpty(paneId);
          if (!normalizedWorkspaceKey || !normalizedPaneId) {
            return;
          }

          set((state) => {
            const nextLayout = reorderPaneTabsInLayout({
              layout: getWorkspaceLayout(state.layoutByWorkspace, normalizedWorkspaceKey),
              paneId: normalizedPaneId,
              tabIds,
            });
            if (!nextLayout) {
              return state;
            }

            return {
              ...withoutFocusRestoration(state, normalizedWorkspaceKey),
              layoutByWorkspace: {
                ...state.layoutByWorkspace,
                [normalizedWorkspaceKey]: nextLayout,
              },
            };
          });
        },
        pinAgent: (workspaceKey, agentId) => {
          const normalizedWorkspaceKey = trimNonEmpty(workspaceKey);
          const normalizedAgentId = trimNonEmpty(agentId);
          if (!normalizedWorkspaceKey || !normalizedAgentId) {
            return;
          }

          set((state) => {
            const currentPinnedAgentIds =
              state.pinnedAgentIdsByWorkspace[normalizedWorkspaceKey] ?? null;
            if (currentPinnedAgentIds?.has(normalizedAgentId)) {
              return state;
            }

            const nextPinnedAgentIds = new Set(currentPinnedAgentIds ?? []);
            nextPinnedAgentIds.add(normalizedAgentId);

            return {
              ...clearAgentVisibilityBlocks({
                state,
                workspaceKey: normalizedWorkspaceKey,
                agentId: normalizedAgentId,
              }),
              pinnedAgentIdsByWorkspace: {
                ...state.pinnedAgentIdsByWorkspace,
                [normalizedWorkspaceKey]: nextPinnedAgentIds,
              },
            };
          });
        },
        unpinAgent: (workspaceKey, agentId) => {
          const normalizedWorkspaceKey = trimNonEmpty(workspaceKey);
          const normalizedAgentId = trimNonEmpty(agentId);
          if (!normalizedWorkspaceKey || !normalizedAgentId) {
            return;
          }

          set((state) => {
            const currentPinnedAgentIds =
              state.pinnedAgentIdsByWorkspace[normalizedWorkspaceKey] ?? null;
            if (!currentPinnedAgentIds?.has(normalizedAgentId)) {
              return state;
            }

            if (currentPinnedAgentIds.size === 1) {
              const nextPinnedAgentIdsByWorkspace = {
                ...state.pinnedAgentIdsByWorkspace,
              };
              delete nextPinnedAgentIdsByWorkspace[normalizedWorkspaceKey];
              return {
                pinnedAgentIdsByWorkspace: nextPinnedAgentIdsByWorkspace,
              };
            }

            const nextPinnedAgentIds = new Set(currentPinnedAgentIds);
            nextPinnedAgentIds.delete(normalizedAgentId);

            return {
              pinnedAgentIdsByWorkspace: {
                ...state.pinnedAgentIdsByWorkspace,
                [normalizedWorkspaceKey]: nextPinnedAgentIds,
              },
            };
          });
        },
        unpinAgentEverywhere: (agentId) => {
          const normalizedAgentId = trimNonEmpty(agentId);
          if (!normalizedAgentId) {
            return;
          }

          set((state) => {
            const pinnedAgentIdsByWorkspace = removeIdFromEveryWorkspaceSet(
              state.pinnedAgentIdsByWorkspace,
              normalizedAgentId,
            );
            if (pinnedAgentIdsByWorkspace === state.pinnedAgentIdsByWorkspace) {
              return state;
            }
            return { pinnedAgentIdsByWorkspace };
          });
        },
        hideAgent: (workspaceKey, agentId) => {
          const normalizedWorkspaceKey = trimNonEmpty(workspaceKey);
          const normalizedAgentId = trimNonEmpty(agentId);
          if (!normalizedWorkspaceKey || !normalizedAgentId) {
            return;
          }

          set((state) => {
            const nextHiddenAgentIdsByWorkspace = addIdToWorkspaceSet(
              state.hiddenAgentIdsByWorkspace,
              normalizedWorkspaceKey,
              normalizedAgentId,
            );
            if (nextHiddenAgentIdsByWorkspace === state.hiddenAgentIdsByWorkspace) {
              return state;
            }

            return {
              hiddenAgentIdsByWorkspace: nextHiddenAgentIdsByWorkspace,
            };
          });
        },
        unhideAgent: (workspaceKey, agentId) => {
          const normalizedWorkspaceKey = trimNonEmpty(workspaceKey);
          const normalizedAgentId = trimNonEmpty(agentId);
          if (!normalizedWorkspaceKey || !normalizedAgentId) {
            return;
          }

          set((state) => {
            const nextHiddenAgentIdsByWorkspace = removeIdFromWorkspaceSet(
              state.hiddenAgentIdsByWorkspace,
              normalizedWorkspaceKey,
              normalizedAgentId,
            );
            if (nextHiddenAgentIdsByWorkspace === state.hiddenAgentIdsByWorkspace) {
              return state;
            }

            return {
              hiddenAgentIdsByWorkspace: nextHiddenAgentIdsByWorkspace,
            };
          });
        },
        suppressAgentAutoOpen: (workspaceKey, agentId) => {
          const normalizedWorkspaceKey = trimNonEmpty(workspaceKey);
          const normalizedAgentId = trimNonEmpty(agentId);
          if (!normalizedWorkspaceKey || !normalizedAgentId) {
            return;
          }

          set((state) => {
            const nextSuppressedAutoOpenAgentIdsByWorkspace = addIdToWorkspaceSet(
              state.suppressedAutoOpenAgentIdsByWorkspace,
              normalizedWorkspaceKey,
              normalizedAgentId,
            );
            if (
              nextSuppressedAutoOpenAgentIdsByWorkspace ===
              state.suppressedAutoOpenAgentIdsByWorkspace
            ) {
              return state;
            }

            return {
              suppressedAutoOpenAgentIdsByWorkspace: nextSuppressedAutoOpenAgentIdsByWorkspace,
            };
          });
        },
        unsuppressAgentAutoOpen: (workspaceKey, agentId) => {
          const normalizedWorkspaceKey = trimNonEmpty(workspaceKey);
          const normalizedAgentId = trimNonEmpty(agentId);
          if (!normalizedWorkspaceKey || !normalizedAgentId) {
            return;
          }

          set((state) => {
            const nextSuppressedAutoOpenAgentIdsByWorkspace = removeIdFromWorkspaceSet(
              state.suppressedAutoOpenAgentIdsByWorkspace,
              normalizedWorkspaceKey,
              normalizedAgentId,
            );
            if (
              nextSuppressedAutoOpenAgentIdsByWorkspace ===
              state.suppressedAutoOpenAgentIdsByWorkspace
            ) {
              return state;
            }

            return {
              suppressedAutoOpenAgentIdsByWorkspace: nextSuppressedAutoOpenAgentIdsByWorkspace,
            };
          });
        },
        suppressTerminalAutoOpen: (workspaceKey, terminalId) => {
          const normalizedWorkspaceKey = trimNonEmpty(workspaceKey);
          const normalizedTerminalId = trimNonEmpty(terminalId);
          if (!normalizedWorkspaceKey || !normalizedTerminalId) {
            return;
          }

          set((state) => {
            const nextSuppressedAutoOpenTerminalIdsByWorkspace = addIdToWorkspaceSet(
              state.suppressedAutoOpenTerminalIdsByWorkspace,
              normalizedWorkspaceKey,
              normalizedTerminalId,
            );
            if (
              nextSuppressedAutoOpenTerminalIdsByWorkspace ===
              state.suppressedAutoOpenTerminalIdsByWorkspace
            ) {
              return state;
            }

            return {
              suppressedAutoOpenTerminalIdsByWorkspace:
                nextSuppressedAutoOpenTerminalIdsByWorkspace,
            };
          });
        },
        unsuppressTerminalAutoOpen: (workspaceKey, terminalId) => {
          const normalizedWorkspaceKey = trimNonEmpty(workspaceKey);
          const normalizedTerminalId = trimNonEmpty(terminalId);
          if (!normalizedWorkspaceKey || !normalizedTerminalId) {
            return;
          }

          set((state) => {
            const nextSuppressedAutoOpenTerminalIdsByWorkspace = removeIdFromWorkspaceSet(
              state.suppressedAutoOpenTerminalIdsByWorkspace,
              normalizedWorkspaceKey,
              normalizedTerminalId,
            );
            if (
              nextSuppressedAutoOpenTerminalIdsByWorkspace ===
              state.suppressedAutoOpenTerminalIdsByWorkspace
            ) {
              return state;
            }

            return {
              suppressedAutoOpenTerminalIdsByWorkspace:
                nextSuppressedAutoOpenTerminalIdsByWorkspace,
            };
          });
        },
        purgeWorkspace: (workspaceKey) => {
          const normalizedWorkspaceKey = trimNonEmpty(workspaceKey);
          if (!normalizedWorkspaceKey) {
            return;
          }

          set((state) => {
            const hasAny =
              normalizedWorkspaceKey in state.layoutByWorkspace ||
              normalizedWorkspaceKey in state.splitSizesByWorkspace ||
              normalizedWorkspaceKey in state.pinnedAgentIdsByWorkspace ||
              normalizedWorkspaceKey in state.hiddenAgentIdsByWorkspace ||
              normalizedWorkspaceKey in state.suppressedAutoOpenAgentIdsByWorkspace ||
              normalizedWorkspaceKey in state.suppressedAutoOpenTerminalIdsByWorkspace ||
              normalizedWorkspaceKey in state.workspaceAutoOpenSuppressedByWorkspace ||
              normalizedWorkspaceKey in state.focusRestorationByWorkspace;
            if (!hasAny) {
              return state;
            }
            const { [normalizedWorkspaceKey]: _layout, ...layoutByWorkspace } =
              state.layoutByWorkspace;
            const { [normalizedWorkspaceKey]: _splits, ...splitSizesByWorkspace } =
              state.splitSizesByWorkspace;
            const { [normalizedWorkspaceKey]: _pinned, ...pinnedAgentIdsByWorkspace } =
              state.pinnedAgentIdsByWorkspace;
            const { [normalizedWorkspaceKey]: _hidden, ...hiddenAgentIdsByWorkspace } =
              state.hiddenAgentIdsByWorkspace;
            const {
              [normalizedWorkspaceKey]: _suppressedAutoOpen,
              ...suppressedAutoOpenAgentIdsByWorkspace
            } = state.suppressedAutoOpenAgentIdsByWorkspace;
            const {
              [normalizedWorkspaceKey]: _suppressedTerminalAutoOpen,
              ...suppressedAutoOpenTerminalIdsByWorkspace
            } = state.suppressedAutoOpenTerminalIdsByWorkspace;
            const {
              [normalizedWorkspaceKey]: _workspaceAutoOpenSuppressed,
              ...workspaceAutoOpenSuppressedByWorkspace
            } = state.workspaceAutoOpenSuppressedByWorkspace;
            const { [normalizedWorkspaceKey]: _restoration, ...focusRestorationByWorkspace } =
              state.focusRestorationByWorkspace;
            return {
              layoutByWorkspace,
              splitSizesByWorkspace,
              pinnedAgentIdsByWorkspace,
              hiddenAgentIdsByWorkspace,
              suppressedAutoOpenAgentIdsByWorkspace,
              suppressedAutoOpenTerminalIdsByWorkspace,
              workspaceAutoOpenSuppressedByWorkspace,
              focusRestorationByWorkspace,
            };
          });
        },
      }),
      {
        name: "workspace-layout-state",
        version: 1,
        storage: createJSONStorage(() => AsyncStorage),
        partialize: (state) => {
          const layoutByWorkspace: Record<string, WorkspaceLayout> = {};
          for (const key in state.layoutByWorkspace) {
            layoutByWorkspace[key] = normalizeLayout(state.layoutByWorkspace[key]);
          }
          return {
            layoutByWorkspace,
            splitSizesByWorkspace: state.splitSizesByWorkspace,
          };
        },
      },
    ),
  );
}

export const useWorkspaceLayoutStore = createWorkspaceLayoutStore();

export function useWorkspaceLayoutStoreHydrated(): boolean {
  const [hasHydrated, setHasHydrated] = useState(() =>
    useWorkspaceLayoutStore.persist.hasHydrated(),
  );

  useEffect(() => {
    if (useWorkspaceLayoutStore.persist.hasHydrated()) {
      setHasHydrated(true);
      return;
    }

    return useWorkspaceLayoutStore.persist.onFinishHydration(() => {
      setHasHydrated(true);
    });
  }, []);

  return hasHydrated;
}
