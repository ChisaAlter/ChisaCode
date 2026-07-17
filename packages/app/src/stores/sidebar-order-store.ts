import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface SidebarOrderStoreState {
  projectOrderByServerId: Record<string, string[]>;
  workspaceOrderByServerAndProject: Record<string, string[]>;
  sessionGroupOrderByServerId: Record<string, string[]>;
  sessionOrderByServerAndGroup: Record<string, string[]>;
  getProjectOrder: (serverId: string) => string[];
  setProjectOrder: (serverId: string, keys: string[]) => void;
  getWorkspaceOrder: (serverId: string, projectKey: string) => string[];
  setWorkspaceOrder: (serverId: string, projectKey: string, keys: string[]) => void;
  getSessionGroupOrder: (serverId: string) => string[];
  setSessionGroupOrder: (serverId: string, keys: string[]) => void;
  getSessionOrder: (serverId: string, groupKey: string) => string[];
  setSessionOrder: (serverId: string, groupKey: string, keys: string[]) => void;
}

function normalizeKeys(keys: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const rawKey of keys) {
    const key = rawKey.trim();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push(key);
  }

  return normalized;
}

function buildScopedOrderKey(serverId: string, scopeKey: string): string {
  return `${serverId.trim()}::${scopeKey.trim()}`;
}

export const useSidebarOrderStore = create<SidebarOrderStoreState>()(
  persist(
    (set, get) => ({
      projectOrderByServerId: {},
      workspaceOrderByServerAndProject: {},
      sessionGroupOrderByServerId: {},
      sessionOrderByServerAndGroup: {},
      getProjectOrder: (serverId) => {
        const key = serverId.trim();
        if (!key) {
          return [];
        }
        return get().projectOrderByServerId[key] ?? [];
      },
      setProjectOrder: (serverId, keys) => {
        const key = serverId.trim();
        if (!key) {
          return;
        }
        const normalized = normalizeKeys(keys);
        set((state) => ({
          projectOrderByServerId: {
            ...state.projectOrderByServerId,
            [key]: normalized,
          },
        }));
      },
      getWorkspaceOrder: (serverId, projectKey) => {
        const serverKey = serverId.trim();
        const projectScope = projectKey.trim();
        if (!serverKey || !projectScope) {
          return [];
        }
        const scopeKey = buildScopedOrderKey(serverKey, projectScope);
        return get().workspaceOrderByServerAndProject[scopeKey] ?? [];
      },
      setWorkspaceOrder: (serverId, projectKey, keys) => {
        const serverKey = serverId.trim();
        const projectScope = projectKey.trim();
        if (!serverKey || !projectScope) {
          return;
        }
        const scopeKey = buildScopedOrderKey(serverKey, projectScope);
        const normalized = normalizeKeys(keys);
        set((state) => ({
          workspaceOrderByServerAndProject: {
            ...state.workspaceOrderByServerAndProject,
            [scopeKey]: normalized,
          },
        }));
      },
      getSessionGroupOrder: (serverId) => {
        const key = serverId.trim();
        if (!key) {
          return [];
        }
        return get().sessionGroupOrderByServerId[key] ?? [];
      },
      setSessionGroupOrder: (serverId, keys) => {
        const key = serverId.trim();
        if (!key) {
          return;
        }
        const normalized = normalizeKeys(keys);
        set((state) => ({
          sessionGroupOrderByServerId: {
            ...state.sessionGroupOrderByServerId,
            [key]: normalized,
          },
        }));
      },
      getSessionOrder: (serverId, groupKey) => {
        const serverKey = serverId.trim();
        const groupScope = groupKey.trim();
        if (!serverKey || !groupScope) {
          return [];
        }
        return get().sessionOrderByServerAndGroup[buildScopedOrderKey(serverKey, groupScope)] ?? [];
      },
      setSessionOrder: (serverId, groupKey, keys) => {
        const serverKey = serverId.trim();
        const groupScope = groupKey.trim();
        if (!serverKey || !groupScope) {
          return;
        }
        const scopeKey = buildScopedOrderKey(serverKey, groupScope);
        const normalized = normalizeKeys(keys);
        set((state) => ({
          sessionOrderByServerAndGroup: {
            ...state.sessionOrderByServerAndGroup,
            [scopeKey]: normalized,
          },
        }));
      },
    }),
    {
      name: "sidebar-project-workspace-order",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        projectOrderByServerId: state.projectOrderByServerId,
        workspaceOrderByServerAndProject: state.workspaceOrderByServerAndProject,
        sessionGroupOrderByServerId: state.sessionGroupOrderByServerId,
        sessionOrderByServerAndGroup: state.sessionOrderByServerAndGroup,
      }),
    },
  ),
);
