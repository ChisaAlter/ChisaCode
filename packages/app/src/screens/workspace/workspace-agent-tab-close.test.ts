import { describe, expect, it, vi } from "vitest";
import { closeAgentWorkspaceTabOnly } from "./workspace-agent-tab-close";

describe("closeAgentWorkspaceTabOnly", () => {
  it("only removes the agent tab from the workspace layout", () => {
    const closeWorkspaceTabWithCleanup = vi.fn();
    const suppressAgentAutoOpen = vi.fn();
    const unpinAgent = vi.fn();
    const setHoveredTabKey = vi.fn();
    const setHoveredCloseTabKey = vi.fn();

    closeAgentWorkspaceTabOnly({
      tabId: "agent_agent-1",
      agentId: "agent-1",
      persistenceKey: "server-1:workspace-a",
      closeWorkspaceTabWithCleanup,
      suppressAgentAutoOpen,
      unpinAgent,
      setHoveredTabKey,
      setHoveredCloseTabKey,
    });

    expect(setHoveredTabKey.mock.calls[0]?.[0]("agent_agent-1")).toBeNull();
    expect(setHoveredCloseTabKey.mock.calls[0]?.[0]("agent_agent-1")).toBeNull();
    expect(unpinAgent).toHaveBeenCalledWith("server-1:workspace-a", "agent-1");
    expect(suppressAgentAutoOpen).toHaveBeenCalledWith("server-1:workspace-a", "agent-1");
    expect(closeWorkspaceTabWithCleanup).toHaveBeenCalledWith({
      tabId: "agent_agent-1",
    });
  });
});
