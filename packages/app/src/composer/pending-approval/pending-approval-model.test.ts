import { describe, expect, it } from "vitest";
import type { PendingPermission } from "@/types/shared";
import {
  ALLOW_ALWAYS_ACTION_ID,
  buildPendingApprovalView,
  clampPendingApprovalIndex,
  formatPendingApprovalDetail,
  resolvePendingApprovalActions,
  resolvePendingApprovalKind,
} from "./pending-approval-model";

function permission(
  overrides: Partial<PendingPermission["request"]> & { id?: string; key?: string } = {},
): PendingPermission {
  const { id = "req-1", key = "k1", ...request } = overrides;
  return {
    key,
    agentId: "agent-1",
    request: {
      id,
      provider: "mock",
      name: "Bash",
      kind: "tool",
      ...request,
    },
  };
}

describe("resolvePendingApprovalKind", () => {
  it("maps plan and question kinds", () => {
    expect(resolvePendingApprovalKind({ requestKind: "plan" })).toBe("plan");
    expect(resolvePendingApprovalKind({ requestKind: "question" })).toBe("question");
  });

  it("maps shell/read/edit details", () => {
    expect(
      resolvePendingApprovalKind({ requestKind: "tool", detail: { type: "shell", command: "ls" } }),
    ).toBe("command");
    expect(
      resolvePendingApprovalKind({
        requestKind: "tool",
        detail: { type: "read", filePath: "/a" },
      }),
    ).toBe("file-read");
    expect(
      resolvePendingApprovalKind({
        requestKind: "tool",
        detail: { type: "edit", filePath: "/a" },
      }),
    ).toBe("file-change");
    expect(
      resolvePendingApprovalKind({
        requestKind: "tool",
        detail: { type: "write", filePath: "/a" },
      }),
    ).toBe("file-change");
  });

  it("falls back to other", () => {
    expect(resolvePendingApprovalKind({ requestKind: "tool" })).toBe("other");
  });
});

describe("formatPendingApprovalDetail", () => {
  it("formats shell command with cwd", () => {
    expect(
      formatPendingApprovalDetail({
        detail: { type: "shell", command: "pnpm test", cwd: "/repo" },
      }),
    ).toBe("pnpm test\n# cwd: /repo");
  });

  it("formats file paths and diffs", () => {
    expect(formatPendingApprovalDetail({ detail: { type: "read", filePath: "/a.ts" } })).toBe(
      "/a.ts",
    );
    expect(
      formatPendingApprovalDetail({
        detail: { type: "edit", filePath: "/a.ts", unifiedDiff: "-a\n+b" },
      }),
    ).toBe("/a.ts\n-a\n+b");
  });

  it("uses description fallback", () => {
    expect(formatPendingApprovalDetail({ description: "  hello  " })).toBe("hello");
  });
});

describe("buildPendingApprovalView", () => {
  it("returns null for an empty queue", () => {
    expect(
      buildPendingApprovalView({ permissions: [], selectedIndex: 0, titleFallback: "Need" }),
    ).toBeNull();
  });

  it("builds a 1-based count view", () => {
    const view = buildPendingApprovalView({
      permissions: [
        permission({
          id: "a",
          key: "ka",
          title: "Run",
          detail: { type: "shell", command: "ls" },
        }),
        permission({ id: "b", key: "kb", name: "Read" }),
      ],
      selectedIndex: 0,
      titleFallback: "Need",
    });
    expect(view).toMatchObject({
      id: "a",
      kind: "command",
      title: "Run",
      detail: "ls",
      index: 1,
      count: 2,
      permissionKey: "ka",
    });
  });

  it("clamps an out-of-range index", () => {
    const view = buildPendingApprovalView({
      permissions: [permission({ id: "only", key: "k" })],
      selectedIndex: 9,
      titleFallback: "Need",
    });
    expect(view?.index).toBe(1);
    expect(view?.id).toBe("only");
  });
});

describe("clampPendingApprovalIndex", () => {
  it("clamps to the last item when the queue shrinks", () => {
    expect(clampPendingApprovalIndex(2, 2)).toBe(1);
    expect(clampPendingApprovalIndex(0, 0)).toBe(0);
  });
});

describe("resolvePendingApprovalActions", () => {
  const labels = {
    reject: "Reject",
    accept: "Accept",
    execute: "Execute",
    alwaysAllow: "Always allow",
  };

  it("synthesizes reject/accept/always-allow for tools", () => {
    const resolved = resolvePendingApprovalActions({
      request: permission().request,
      labels,
    });
    expect(resolved.reject?.behavior).toBe("deny");
    expect(resolved.accept?.id).toBe("accept");
    expect(resolved.alwaysAllow?.id).toBe(ALLOW_ALWAYS_ACTION_ID);
  });

  it("omits always-allow for plan requests", () => {
    const resolved = resolvePendingApprovalActions({
      request: permission({ kind: "plan" }).request,
      labels,
    });
    expect(resolved.accept?.label).toBe("Execute");
    expect(resolved.alwaysAllow).toBeNull();
  });

  it("returns nothing for question requests", () => {
    const resolved = resolvePendingApprovalActions({
      request: permission({ kind: "question" }).request,
      labels,
    });
    expect(resolved).toEqual({
      reject: null,
      accept: null,
      alwaysAllow: null,
      extras: [],
    });
  });

  it("picks provider actions including allow_always", () => {
    const resolved = resolvePendingApprovalActions({
      request: permission({
        actions: [
          { id: "deny", label: "Deny", behavior: "deny", variant: "danger" },
          {
            id: ALLOW_ALWAYS_ACTION_ID,
            label: "Allow always",
            behavior: "allow",
            variant: "secondary",
          },
          { id: "allow_once", label: "Allow once", behavior: "allow", variant: "primary" },
        ],
      }).request,
      labels,
    });
    expect(resolved.reject?.id).toBe("deny");
    expect(resolved.accept?.id).toBe("allow_once");
    expect(resolved.alwaysAllow?.id).toBe(ALLOW_ALWAYS_ACTION_ID);
    expect(resolved.extras).toEqual([]);
  });
});
