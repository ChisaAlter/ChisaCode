import { describe, expect, it } from "vitest";
import {
  createDefaultLayout,
  openTabInLayoutFocused,
  type WorkspaceLayout,
} from "@/stores/workspace-layout-actions";
import {
  collectSidebarDraftSessions,
  resolveLeftSidebarHomeRoute,
  resolveLeftSidebarNewConversationRoute,
} from "./left-sidebar-drafts";

function layoutWithDraft(draftId: string, now: number): WorkspaceLayout {
  return openTabInLayoutFocused({
    layout: createDefaultLayout(),
    target: { kind: "draft", draftId },
    now,
  }).layout;
}

describe("left sidebar drafts", () => {
  it("does not collect unsent workspace draft tabs for the sidebar session list", () => {
    const drafts = collectSidebarDraftSessions({
      activeServerId: "server-1",
      layoutByWorkspace: {
        "server-1:workspace-a": layoutWithDraft("draft-a", 1_781_000_000_000),
        "server-2:workspace-b": layoutWithDraft("draft-b", 1_781_000_001_000),
      },
      workspacesById: {
        "workspace-a": { workspaceDirectory: "/repo/project-a" },
        "workspace-b": { workspaceDirectory: "/repo/project-b" },
      },
    });

    expect(drafts).toEqual([]);
  });

  it("opens the conversation start page when the current route is a workspace", () => {
    expect(
      resolveLeftSidebarNewConversationRoute({
        activeServerId: "server-1",
        pathname: "/h/server-1/workspace/workspace-a",
      }),
    ).toBe("/h/server-1/open-project");
  });

  it("opens the conversation start page outside a workspace route", () => {
    expect(
      resolveLeftSidebarNewConversationRoute({
        activeServerId: "server-1",
        pathname: "/h/server-1/sessions",
      }),
    ).toBe("/h/server-1/open-project");
  });

  it("resolves the sidebar home action to the current host open-project route", () => {
    expect(resolveLeftSidebarHomeRoute("server-1")).toBe("/h/server-1/open-project");
  });

  it("does not resolve a sidebar home action without an active host", () => {
    expect(resolveLeftSidebarHomeRoute(null)).toBeNull();
  });
});
