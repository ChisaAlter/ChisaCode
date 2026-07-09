/**
 * @vitest-environment jsdom
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceDescriptor } from "@/stores/session-store";
import {
  useWorkspaceRouteLoadingTimedOut,
  WORKSPACE_ROUTE_LOADING_TIMEOUT_MS,
} from "./use-workspace-route-loading-timeout";

function createWorkspaceDescriptor(): WorkspaceDescriptor {
  return {
    id: "workspace-1",
    projectId: "project-1",
    projectDisplayName: "Project",
    projectRootPath: "/repo/project",
    workspaceDirectory: "/repo/project",
    projectKind: "git",
    workspaceKind: "local_checkout",
    name: "main",
    status: "running",
    diffStat: null,
    scripts: [],
    archivingAt: null,
  };
}

describe("useWorkspaceRouteLoadingTimedOut", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("times out unresolved online workspace routes and resets when the descriptor arrives", () => {
    vi.useFakeTimers();

    const { result, rerender } = renderHook(
      (input: Parameters<typeof useWorkspaceRouteLoadingTimedOut>[0]) =>
        useWorkspaceRouteLoadingTimedOut(input),
      {
        initialProps: {
          routeKey: "srv:workspace-1",
          connectionStatus: "online",
          workspace: null,
          hasHydratedWorkspaces: false,
        },
      },
    );

    expect(result.current).toBe(false);

    act(() => {
      vi.advanceTimersByTime(WORKSPACE_ROUTE_LOADING_TIMEOUT_MS);
    });

    expect(result.current).toBe(true);

    rerender({
      routeKey: "srv:workspace-1",
      connectionStatus: "online",
      workspace: createWorkspaceDescriptor(),
      hasHydratedWorkspaces: false,
    });

    expect(result.current).toBe(false);
  });

  it("does not arm the timeout while the host is still connecting", () => {
    vi.useFakeTimers();

    const { result } = renderHook(() =>
      useWorkspaceRouteLoadingTimedOut({
        routeKey: "srv:workspace-1",
        connectionStatus: "connecting",
        workspace: null,
        hasHydratedWorkspaces: false,
      }),
    );

    act(() => {
      vi.advanceTimersByTime(WORKSPACE_ROUTE_LOADING_TIMEOUT_MS);
    });

    expect(result.current).toBe(false);
  });
});
