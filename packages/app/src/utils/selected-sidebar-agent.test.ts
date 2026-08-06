import { describe, expect, it } from "vitest";
import type { WorkspaceTabTarget } from "@/workspace-tabs/identity";
import { resolveSelectedSidebarAgentIdFromWorkspaceLayout } from "./selected-sidebar-agent";

describe("resolveSelectedSidebarAgentIdFromWorkspaceLayout", () => {
  it("returns the active agent id from the workspace content target", () => {
    const target: WorkspaceTabTarget = { kind: "agent", agentId: "agent-2" };

    expect(resolveSelectedSidebarAgentIdFromWorkspaceLayout(target)).toBe("agent-2");
  });

  it("returns null when the active workspace content is not an agent", () => {
    const target: WorkspaceTabTarget = { kind: "terminal", terminalId: "term-1" };

    expect(resolveSelectedSidebarAgentIdFromWorkspaceLayout(target)).toBeNull();
  });

  it("returns null when the workspace has no active content", () => {
    expect(resolveSelectedSidebarAgentIdFromWorkspaceLayout(null)).toBeNull();
    expect(resolveSelectedSidebarAgentIdFromWorkspaceLayout(undefined)).toBeNull();
  });
});
