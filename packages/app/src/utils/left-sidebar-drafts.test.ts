import { describe, expect, it } from "vitest";
import {
  createDefaultLayout,
  openTabInLayoutFocused,
  type WorkspaceLayout,
} from "@/stores/workspace-layout-actions";
import {
  collectSidebarDraftSessions,
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

  it("opens a new draft directly when the current route is a workspace", () => {
    expect(
      resolveLeftSidebarNewConversationRoute({
        activeServerId: "server-1",
        pathname: "/h/server-1/workspace/workspace-a",
      }),
    ).toBe("/h/server-1/workspace/workspace-a?open=draft%3Anew");
  });

  it("falls back to the project picker outside a workspace route", () => {
    expect(
      resolveLeftSidebarNewConversationRoute({
        activeServerId: "server-1",
        pathname: "/h/server-1/sessions",
      }),
    ).toBeNull();
  });
});
