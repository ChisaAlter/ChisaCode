import { describe, expect, it } from "vitest";
import type { AggregatedAgent } from "@/hooks/use-aggregated-agents";
import {
  getAgentCwdGroupLabel,
  groupAgentsForSidebar,
  normalizeAgentCwdGroupKey,
} from "@/utils/sidebar-session-groups";

function agent(input: {
  id: string;
  cwd: string | null;
  updatedAt: string;
  pinned?: boolean;
}): AggregatedAgent {
  return {
    id: input.id,
    serverId: "server-1",
    serverLabel: "Local",
    title: input.id,
    status: "closed",
    lastActivityAt: new Date(input.updatedAt),
    cwd: input.cwd ?? "",
    provider: "codex",
    pendingPermissionCount: 0,
    requiresAttention: false,
    attentionReason: null,
    attentionTimestamp: null,
    archivedAt: null,
    createdAt: new Date(input.updatedAt),
    labels: input.pinned ? { "chisacode.sidebarPinned": "true" } : {},
  };
}

describe("sidebar session groups", () => {
  it("derives compact labels from Windows and POSIX paths", () => {
    expect(getAgentCwdGroupLabel("C:\\ai\\yuanhangxing")).toBe("yuanhangxing");
    expect(getAgentCwdGroupLabel("/Users/me/project")).toBe("project");
    expect(getAgentCwdGroupLabel("/Users/me/project/")).toBe("project");
  });

  it("falls back for missing cwd", () => {
    expect(getAgentCwdGroupLabel("", "未知工作区")).toBe("未知工作区");
    expect(normalizeAgentCwdGroupKey(null)).toBe("__unknown__");
  });

  it("normalizes separators, trailing slashes, and casing for stable group keys", () => {
    expect(normalizeAgentCwdGroupKey("C:\\AI\\yuanhangxing\\")).toBe("c:/ai/yuanhangxing");
    expect(normalizeAgentCwdGroupKey("c:/ai/yuanhangxing")).toBe("c:/ai/yuanhangxing");
  });

  it("sorts groups and group agents by newest activity", () => {
    const groups = groupAgentsForSidebar([
      agent({ id: "old-a", cwd: "C:\\ai\\a", updatedAt: "2026-01-01T00:00:00.000Z" }),
      agent({ id: "new-b", cwd: "C:\\ai\\b", updatedAt: "2026-01-03T00:00:00.000Z" }),
      agent({ id: "new-a", cwd: "C:\\ai\\a", updatedAt: "2026-01-02T00:00:00.000Z" }),
    ]);

    expect(groups.map((group) => group.label)).toEqual(["b", "a"]);
    expect(groups[1]?.agents.map((entry) => entry.id)).toEqual(["new-a", "old-a"]);
  });

  it("extracts pinned sessions into a global top group", () => {
    const groups = groupAgentsForSidebar(
      [
        agent({ id: "new-a", cwd: "C:\\ai\\a", updatedAt: "2026-01-03T00:00:00.000Z" }),
        agent({
          id: "pinned-b",
          cwd: "C:\\ai\\b",
          updatedAt: "2026-01-01T00:00:00.000Z",
          pinned: true,
        }),
        agent({
          id: "pinned-a",
          cwd: "C:\\ai\\a",
          updatedAt: "2026-01-02T00:00:00.000Z",
          pinned: true,
        }),
      ],
      {
        pinnedGroupLabel: "置顶",
        isPinnedAgent: (entry) => entry.labels["chisacode.sidebarPinned"] === "true",
      },
    );

    expect(groups.map((group) => group.label)).toEqual(["置顶", "a"]);
    expect(groups[0]?.agents.map((entry) => entry.id)).toEqual(["pinned-a", "pinned-b"]);
    expect(groups[1]?.agents.map((entry) => entry.id)).toEqual(["new-a"]);
  });
});
