import { describe, expect, it } from "vitest";
import {
  buildBrowserContextSummary,
  buildGitWorkbenchSummary,
  resolveDockStateAfterAction,
  resolveDockTabAvailability,
  resolveWorkspacePaneCommand,
  type WorkspaceEnvironmentDockState,
} from "./workspace-environment-dock-model";

describe("resolveDockStateAfterAction", () => {
  const openGitState: WorkspaceEnvironmentDockState = {
    open: true,
    activeTab: "git-summary",
  };

  it("opens the requested dock tab", () => {
    expect(
      resolveDockStateAfterAction(openGitState, { type: "openDockPane", pane: "tasks" }),
    ).toEqual({
      open: true,
      activeTab: "tasks",
    });
  });

  it("toggles the dock closed when the active tab is requested again", () => {
    expect(
      resolveDockStateAfterAction(openGitState, { type: "toggleDockPane", pane: "git-summary" }),
    ).toEqual({
      open: false,
      activeTab: "git-summary",
    });
  });

  it("uses git summary for the explicit git command", () => {
    expect(resolveDockStateAfterAction(openGitState, { type: "openGitSummary" })).toEqual({
      open: true,
      activeTab: "git-summary",
    });
  });
});

describe("resolveDockTabAvailability", () => {
  it("keeps git and browser tabs visible while hiding empty optional tabs", () => {
    expect(
      resolveDockTabAvailability({
        hasPullRequest: false,
        hasTasks: false,
        hasSubagents: false,
        hasBrowserContext: true,
      }),
    ).toEqual(["git-summary", "browser-context"]);
  });

  it("includes optional tabs when their data exists", () => {
    expect(
      resolveDockTabAvailability({
        hasPullRequest: true,
        hasTasks: true,
        hasSubagents: true,
        hasBrowserContext: false,
      }),
    ).toEqual(["git-summary", "pull-request", "tasks", "subagents"]);
  });
});

describe("buildGitWorkbenchSummary", () => {
  it("summarizes a dirty git checkout", () => {
    expect(
      buildGitWorkbenchSummary({
        isGitCheckout: true,
        branchName: "feature/workbench",
        diffStat: { additions: 7, deletions: 3 },
        pullRequest: { number: 42, title: "Improve workspace", url: "https://example.test/pr/42" },
      }),
    ).toEqual({
      branchLabel: "feature/workbench",
      changeCount: 10,
      hasChanges: true,
      pullRequestLabel: "#42 Improve workspace",
      state: "dirty",
    });
  });

  it("marks non-git workspaces separately", () => {
    expect(
      buildGitWorkbenchSummary({
        isGitCheckout: false,
        branchName: null,
        diffStat: null,
        pullRequest: null,
      }),
    ).toEqual({
      branchLabel: null,
      changeCount: 0,
      hasChanges: false,
      pullRequestLabel: null,
      state: "not-git",
    });
  });
});

describe("buildBrowserContextSummary", () => {
  it("uses title, host, and loading state from the focused browser", () => {
    expect(
      buildBrowserContextSummary({
        browser: {
          title: "Local preview",
          url: "http://localhost:5173/dashboard",
          isLoading: true,
        },
      }),
    ).toEqual({
      title: "Local preview",
      subtitle: "localhost",
      isLoading: true,
      url: "http://localhost:5173/dashboard",
    });
  });

  it("returns null when there is no focused browser", () => {
    expect(buildBrowserContextSummary({ browser: null })).toBeNull();
  });
});

describe("resolveWorkspacePaneCommand", () => {
  it("routes dock commands to dock placement", () => {
    expect(resolveWorkspacePaneCommand({ type: "openDockPane", pane: "git-summary" })).toEqual({
      placement: "dock",
      dockPane: "git-summary",
    });
  });

  it("routes split commands to pane placement", () => {
    expect(
      resolveWorkspacePaneCommand({
        type: "openTarget",
        targetKind: "browser",
        placement: "right",
      }),
    ).toEqual({
      placement: "right",
      targetKind: "browser",
    });
  });

  it("routes all open target pane placements without changing target kind", () => {
    for (const placement of ["current", "new-tab", "right", "down"] as const) {
      expect(
        resolveWorkspacePaneCommand({
          type: "openTarget",
          targetKind: "terminal",
          placement,
        }),
      ).toEqual({
        placement,
        targetKind: "terminal",
      });
    }
  });

  it("routes browser dock targets to the browser context dock", () => {
    expect(
      resolveWorkspacePaneCommand({
        type: "openTarget",
        targetKind: "browser",
        placement: "dock",
      }),
    ).toEqual({
      placement: "dock",
      dockPane: "browser-context",
    });
  });

  it("routes move tab to dock commands to the requested dock pane", () => {
    expect(
      resolveWorkspacePaneCommand({
        type: "moveTabToDock",
        pane: "pull-request",
        tabId: "tab-1",
      }),
    ).toEqual({
      placement: "dock",
      dockPane: "pull-request",
    });
  });
});
