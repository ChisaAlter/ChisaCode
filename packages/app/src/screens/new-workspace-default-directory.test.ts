import { describe, expect, it } from "vitest";
import { resolveNewWorkspaceDefaultDirectory } from "./new-workspace-default-directory";

describe("resolveNewWorkspaceDefaultDirectory", () => {
  it("uses the explicit route directory before active workspace context", () => {
    expect(
      resolveNewWorkspaceDefaultDirectory({
        routeDirectory: "  /repo/from-project  ",
        activeWorkspace: {
          projectRootPath: "/repo/active-root",
          workspaceDirectory: "/repo/active-workspace",
        },
      }),
    ).toBe("/repo/from-project");
  });

  it("uses the active project root when no route directory is provided", () => {
    expect(
      resolveNewWorkspaceDefaultDirectory({
        routeDirectory: "",
        activeWorkspace: {
          projectRootPath: "/repo/active-root",
          workspaceDirectory: "/repo/active-workspace",
        },
      }),
    ).toBe("/repo/active-root");
  });

  it("falls back to the active workspace directory without a project root", () => {
    expect(
      resolveNewWorkspaceDefaultDirectory({
        routeDirectory: null,
        activeWorkspace: {
          projectRootPath: "",
          workspaceDirectory: "/repo/active-workspace",
        },
      }),
    ).toBe("/repo/active-workspace");
  });

  it("leaves the directory unset when no route or active workspace is available", () => {
    expect(
      resolveNewWorkspaceDefaultDirectory({
        routeDirectory: undefined,
        activeWorkspace: null,
      }),
    ).toBeNull();
  });
});
