/**
 * Sidebar V2 UI state: project scope, search query, shelf expansion, settled
 * tail paging, and multi-select. Settled/snooze OVERRIDES live on agent
 * labels (server-synced); this store holds the purely local view state plus
 * the label-mutation helpers the sidebar calls.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  SIDEBAR_LABEL_SETTLED_AT,
  SIDEBAR_LABEL_SETTLED_OVERRIDE,
  SIDEBAR_LABEL_SNOOZED_AT,
  SIDEBAR_LABEL_SNOOZED_UNTIL,
} from "./snooze";

/** Per-server UI state that persists across restarts. */
export interface SidebarV2ServerUiState {
  /** Selected project scope; null = "All projects". */
  scopeProjectKey: string | null;
  settledShelfExpanded: boolean;
  snoozedShelfExpanded: boolean;
  /** Settled tail page size (grows via "Show more"). */
  settledVisibleCount: number;
}

export const DEFAULT_SERVER_UI_STATE: SidebarV2ServerUiState = {
  scopeProjectKey: null,
  settledShelfExpanded: true,
  snoozedShelfExpanded: false,
  settledVisibleCount: 10,
};

interface SidebarV2StoreState {
  serverUiStateByServerId: Record<string, SidebarV2ServerUiState>;
  /** Search query (not persisted). */
  searchQuery: string;
  /** Multi-selected thread keys (not persisted). */
  selectedThreadKeys: string[];
  getServerUiState: (serverId: string) => SidebarV2ServerUiState;
  setScopeProjectKey: (serverId: string, projectKey: string | null) => void;
  setSettledShelfExpanded: (serverId: string, expanded: boolean) => void;
  setSnoozedShelfExpanded: (serverId: string, expanded: boolean) => void;
  setSettledVisibleCount: (serverId: string, count: number) => void;
  resetSettledVisibleCount: (serverId: string) => void;
  setSearchQuery: (query: string) => void;
  clearSearch: () => void;
  toggleThreadSelected: (threadKey: string) => void;
  setThreadsSelected: (threadKeys: string[]) => void;
  clearSelection: () => void;
  /** Builds the next labels map for a settle/snooze mutation. */
  buildSettledLabels: (nowIso: string, pinned: boolean) => Record<string, string>;
  buildSnoozedLabels: (untilIso: string, atIso: string) => Record<string, string>;
  clearSnoozedLabels: () => Record<string, string>;
}

function mergeServerUiState(
  state: SidebarV2ServerUiState,
  patch: Partial<SidebarV2ServerUiState>,
): SidebarV2ServerUiState {
  return { ...state, ...patch };
}

function normalizeThreadKeys(keys: readonly string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const key of keys) {
    const trimmed = key.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized;
}

export const useSidebarV2Store = create<SidebarV2StoreState>()(
  persist(
    (set, get) => ({
      serverUiStateByServerId: {},
      searchQuery: "",
      selectedThreadKeys: [],
      getServerUiState: (serverId) => {
        const key = serverId.trim();
        return key
          ? (get().serverUiStateByServerId[key] ?? DEFAULT_SERVER_UI_STATE)
          : DEFAULT_SERVER_UI_STATE;
      },
      setScopeProjectKey: (serverId, projectKey) => {
        const key = serverId.trim();
        if (!key) {
          return;
        }
        set((state) => ({
          serverUiStateByServerId: {
            ...state.serverUiStateByServerId,
            [key]: mergeServerUiState(
              state.serverUiStateByServerId[key] ?? DEFAULT_SERVER_UI_STATE,
              {
                scopeProjectKey: projectKey?.trim() || null,
              },
            ),
          },
        }));
      },
      setSettledShelfExpanded: (serverId, expanded) => {
        const key = serverId.trim();
        if (!key) {
          return;
        }
        set((state) => ({
          serverUiStateByServerId: {
            ...state.serverUiStateByServerId,
            [key]: mergeServerUiState(
              state.serverUiStateByServerId[key] ?? DEFAULT_SERVER_UI_STATE,
              {
                settledShelfExpanded: expanded,
              },
            ),
          },
        }));
      },
      setSnoozedShelfExpanded: (serverId, expanded) => {
        const key = serverId.trim();
        if (!key) {
          return;
        }
        set((state) => ({
          serverUiStateByServerId: {
            ...state.serverUiStateByServerId,
            [key]: mergeServerUiState(
              state.serverUiStateByServerId[key] ?? DEFAULT_SERVER_UI_STATE,
              {
                snoozedShelfExpanded: expanded,
              },
            ),
          },
        }));
      },
      setSettledVisibleCount: (serverId, count) => {
        const key = serverId.trim();
        if (!key) {
          return;
        }
        set((state) => ({
          serverUiStateByServerId: {
            ...state.serverUiStateByServerId,
            [key]: mergeServerUiState(
              state.serverUiStateByServerId[key] ?? DEFAULT_SERVER_UI_STATE,
              {
                settledVisibleCount: count,
              },
            ),
          },
        }));
      },
      resetSettledVisibleCount: (serverId) => {
        get().setSettledVisibleCount(serverId, DEFAULT_SERVER_UI_STATE.settledVisibleCount);
      },
      setSearchQuery: (query) => {
        set((state) => {
          const nextQuery = query.trim();
          // A changed search collapses multi-selection.
          const selectedThreadKeys =
            state.searchQuery === nextQuery ? state.selectedThreadKeys : [];
          return { searchQuery: nextQuery, selectedThreadKeys };
        });
      },
      clearSearch: () => set({ searchQuery: "" }),
      toggleThreadSelected: (threadKey) => {
        const trimmed = threadKey.trim();
        if (!trimmed) {
          return;
        }
        set((state) => {
          const selected = state.selectedThreadKeys.includes(trimmed)
            ? state.selectedThreadKeys.filter((key) => key !== trimmed)
            : [...state.selectedThreadKeys, trimmed];
          return { selectedThreadKeys: normalizeThreadKeys(selected) };
        });
      },
      setThreadsSelected: (threadKeys) =>
        set({ selectedThreadKeys: normalizeThreadKeys(threadKeys) }),
      clearSelection: () => set({ selectedThreadKeys: [] }),
      buildSettledLabels: (nowIso, pinned) =>
        pinned
          ? {
              [SIDEBAR_LABEL_SETTLED_AT]: nowIso,
              [SIDEBAR_LABEL_SETTLED_OVERRIDE]: "settled",
            }
          : {
              // Empty-string values clear merged labels; the adapter treats
              // them as absent.
              [SIDEBAR_LABEL_SETTLED_AT]: "",
              [SIDEBAR_LABEL_SETTLED_OVERRIDE]: "",
            },
      buildSnoozedLabels: (untilIso, atIso) => ({
        [SIDEBAR_LABEL_SNOOZED_UNTIL]: untilIso,
        [SIDEBAR_LABEL_SNOOZED_AT]: atIso,
      }),
      clearSnoozedLabels: () => ({
        [SIDEBAR_LABEL_SNOOZED_UNTIL]: "",
        [SIDEBAR_LABEL_SNOOZED_AT]: "",
      }),
    }),
    {
      name: "sidebar-v2-ui-state",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        serverUiStateByServerId: state.serverUiStateByServerId,
      }),
    },
  ),
);

/** Selector helper: server UI state for a server id. */
export function selectSidebarV2ServerUiState(
  state: SidebarV2StoreState,
  serverId: string,
): SidebarV2ServerUiState {
  return state.getServerUiState(serverId);
}
