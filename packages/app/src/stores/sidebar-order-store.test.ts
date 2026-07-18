import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSidebarOrderStore } from "./sidebar-order-store";

const storage = new Map<string, string>();

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      storage.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => {
      storage.delete(key);
    }),
  },
}));

describe("sidebar order store project group state", () => {
  beforeEach(() => {
    storage.clear();
    useSidebarOrderStore.setState({
      projectOrderByServerId: {},
      workspaceOrderByServerAndProject: {},
      sessionGroupOrderByServerId: {},
      sessionOrderByServerAndGroup: {},
      pinnedSessionGroupKeysByServerId: {},
      hiddenSessionGroupKeysByServerId: {},
    });
  });

  it("pins and unpins project groups without duplicating keys", () => {
    const store = useSidebarOrderStore.getState();

    store.setSessionGroupPinned("server-1", "/repo/project", true);
    store.setSessionGroupPinned("server-1", "/repo/project", true);

    expect(useSidebarOrderStore.getState().getPinnedSessionGroupKeys("server-1")).toEqual([
      "/repo/project",
    ]);

    useSidebarOrderStore.getState().setSessionGroupPinned("server-1", "/repo/project", false);
    expect(useSidebarOrderStore.getState().getPinnedSessionGroupKeys("server-1")).toEqual([]);
  });

  it("persists project group removal independently for each host", () => {
    const store = useSidebarOrderStore.getState();

    store.setSessionGroupHidden("server-1", "/repo/project", true);
    store.setSessionGroupHidden("server-2", "/repo/other", true);

    expect(useSidebarOrderStore.getState().getHiddenSessionGroupKeys("server-1")).toEqual([
      "/repo/project",
    ]);
    expect(useSidebarOrderStore.getState().getHiddenSessionGroupKeys("server-2")).toEqual([
      "/repo/other",
    ]);

    useSidebarOrderStore.getState().setSessionGroupHidden("server-1", "/repo/project", false);
    expect(useSidebarOrderStore.getState().getHiddenSessionGroupKeys("server-1")).toEqual([]);
    expect(useSidebarOrderStore.getState().getHiddenSessionGroupKeys("server-2")).toEqual([
      "/repo/other",
    ]);
  });
});
