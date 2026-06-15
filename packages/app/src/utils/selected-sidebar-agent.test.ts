import { describe, expect, it } from "vitest";
import type { WorkspaceTab } from "@/stores/workspace-tabs-store";
import type { SplitNode, SplitPane, WorkspaceLayout } from "@/stores/workspace-layout-store";
import { resolveSelectedSidebarAgentIdFromWorkspaceLayout } from "./selected-sidebar-agent";

function tab(tabId: string, target: WorkspaceTab["target"]): WorkspaceTab {
  return {
    tabId,
    target,
    createdAt: 1,
  };
}

function pane(input: {
  id: string;
  tabs: WorkspaceTab[];
  focusedTabId?: string | null;
}): SplitNode {
  return {
    kind: "pane",
    pane: {
      id: input.id,
      tabIds: input.tabs.map((entry) => entry.tabId),
      tabs: input.tabs,
      focusedTabId: input.focusedTabId ?? input.tabs[0]?.tabId ?? null,
    } as SplitPane,
  };
}

describe("resolveSelectedSidebarAgentIdFromWorkspaceLayout", () => {
  it("returns the focused agent tab id from the focused workspace pane", () => {
    const layout: WorkspaceLayout = {
      root: pane({
        id: "main",
        focusedTabId: "agent_agent-2",
        tabs: [
          tab("agent_agent-1", { kind: "agent", agentId: "agent-1" }),
          tab("agent_agent-2", { kind: "agent", agentId: "agent-2" }),
        ],
      }),
      focusedPaneId: "main",
    };

    expect(resolveSelectedSidebarAgentIdFromWorkspaceLayout(layout)).toBe("agent-2");
  });

  it("returns null when the active workspace tab is not an agent", () => {
    const layout: WorkspaceLayout = {
      root: pane({
        id: "main",
        focusedTabId: "terminal_term-1",
        tabs: [
          tab("agent_agent-1", { kind: "agent", agentId: "agent-1" }),
          tab("terminal_term-1", { kind: "terminal", terminalId: "term-1" }),
        ],
      }),
      focusedPaneId: "main",
    };

    expect(resolveSelectedSidebarAgentIdFromWorkspaceLayout(layout)).toBeNull();
  });

  it("uses the focused split pane instead of the first pane in the tree", () => {
    const layout: WorkspaceLayout = {
      root: {
        kind: "group",
        group: {
          id: "group-root",
          direction: "horizontal",
          sizes: [0.5, 0.5],
          children: [
            pane({
              id: "left",
              tabs: [tab("agent_agent-left", { kind: "agent", agentId: "agent-left" })],
            }),
            pane({
              id: "right",
              tabs: [tab("agent_agent-right", { kind: "agent", agentId: "agent-right" })],
            }),
          ],
        },
      },
      focusedPaneId: "right",
    };

    expect(resolveSelectedSidebarAgentIdFromWorkspaceLayout(layout)).toBe("agent-right");
  });
});
