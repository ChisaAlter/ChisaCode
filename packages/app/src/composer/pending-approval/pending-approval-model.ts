import type { AgentPermissionAction, ToolCallDetail } from "@chisacode/protocol/agent-types";
import type { PendingPermission } from "@/types/shared";

/** Display kind for the M12 approval panel (matches the HTML prototype). */
export type PendingApprovalKind =
  | "command"
  | "file-read"
  | "file-change"
  | "plan"
  | "question"
  | "other";

export interface PendingApprovalView {
  id: string;
  kind: PendingApprovalKind;
  title: string;
  detail: string;
  /** 1-based index into the current queue. */
  index: number;
  /** Total pending approvals for this agent. */
  count: number;
  permissionKey: string;
}

export const ALLOW_ALWAYS_ACTION_ID = "allow_always";

/**
 * Maps a tool-call detail (or request kind) onto the prototype's approval kinds.
 */
export function resolvePendingApprovalKind(input: {
  requestKind: PendingPermission["request"]["kind"];
  detail?: ToolCallDetail | null;
}): PendingApprovalKind {
  if (input.requestKind === "plan") {
    return "plan";
  }
  if (input.requestKind === "question") {
    return "question";
  }
  const type = input.detail?.type;
  if (type === "shell") {
    return "command";
  }
  if (type === "read") {
    return "file-read";
  }
  if (type === "edit" || type === "write") {
    return "file-change";
  }
  return "other";
}

/**
 * Builds a short monospace detail string for the approval body (tests / labels).
 */
export function formatPendingApprovalDetail(input: {
  description?: string;
  detail?: ToolCallDetail | null;
  fallback?: string;
}): string {
  const detail = input.detail;
  if (detail?.type === "shell") {
    const cwd = detail.cwd ? `\n# cwd: ${detail.cwd}` : "";
    return `${detail.command}${cwd}`;
  }
  if (detail?.type === "read") {
    return detail.filePath;
  }
  if (detail?.type === "edit") {
    if (detail.unifiedDiff) {
      return `${detail.filePath}\n${detail.unifiedDiff}`;
    }
    return detail.filePath;
  }
  if (detail?.type === "write") {
    return detail.filePath;
  }
  if (input.description?.trim()) {
    return input.description.trim();
  }
  return input.fallback ?? "";
}

/**
 * Builds the visible approval view for the selected permission in a queue.
 */
export function buildPendingApprovalView(input: {
  permissions: readonly PendingPermission[];
  selectedIndex: number;
  titleFallback: string;
}): PendingApprovalView | null {
  if (input.permissions.length === 0) {
    return null;
  }
  const clamped = Math.max(0, Math.min(input.selectedIndex, input.permissions.length - 1));
  const permission = input.permissions[clamped]!;
  const { request } = permission;
  const resolvedDetail = request.detail ?? null;
  const kind = resolvePendingApprovalKind({
    requestKind: request.kind,
    detail: resolvedDetail,
  });
  const title =
    request.kind === "plan"
      ? (request.title ?? input.titleFallback)
      : (request.title ?? request.name ?? input.titleFallback);
  return {
    id: request.id,
    kind,
    title,
    detail: formatPendingApprovalDetail({
      description: request.description,
      detail: resolvedDetail,
      fallback: request.name,
    }),
    index: clamped + 1,
    count: input.permissions.length,
    permissionKey: permission.key,
  };
}

/**
 * Clamps the selected index after the queue shrinks (respond / resolve).
 */
export function clampPendingApprovalIndex(selectedIndex: number, count: number): number {
  if (count <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(selectedIndex, count - 1));
}

/**
 * Resolves reject / accept / always-allow actions for the panel.
 * Preserves provider-supplied actions when present; otherwise synthesizes the
 * T3 trio (reject, accept, always-allow for tool requests).
 */
export function resolvePendingApprovalActions(input: {
  request: PendingPermission["request"];
  labels: {
    reject: string;
    accept: string;
    execute: string;
    alwaysAllow: string;
  };
}): {
  reject: AgentPermissionAction | null;
  accept: AgentPermissionAction | null;
  alwaysAllow: AgentPermissionAction | null;
  extras: AgentPermissionAction[];
} {
  const { request, labels } = input;
  if (request.kind === "question") {
    return { reject: null, accept: null, alwaysAllow: null, extras: [] };
  }

  const provided = Array.isArray(request.actions) ? request.actions : [];
  if (provided.length > 0) {
    const reject =
      provided.find((action) => action.behavior === "deny") ??
      provided.find((action) => action.id === "reject" || action.id === "deny") ??
      null;
    const alwaysAllow =
      provided.find((action) => action.id === ALLOW_ALWAYS_ACTION_ID) ??
      provided.find((action) => /always/i.test(action.id) || /always/i.test(action.label)) ??
      null;
    const accept =
      provided.find(
        (action) =>
          action.behavior === "allow" &&
          action.id !== alwaysAllow?.id &&
          (action.variant === "primary" ||
            action.id === "accept" ||
            action.id === "allow_once" ||
            action.id === "implement"),
      ) ??
      provided.find((action) => action.behavior === "allow" && action.id !== alwaysAllow?.id) ??
      null;
    const used = new Set(
      [reject?.id, accept?.id, alwaysAllow?.id].filter((id): id is string => Boolean(id)),
    );
    const extras = provided.filter((action) => !used.has(action.id));
    return { reject, accept, alwaysAllow, extras };
  }

  const isPlan = request.kind === "plan";
  return {
    reject: {
      id: "reject",
      label: labels.reject,
      behavior: "deny",
      variant: "danger",
      intent: "dismiss",
    },
    accept: {
      id: "accept",
      label: isPlan ? labels.execute : labels.accept,
      behavior: "allow",
      variant: "primary",
    },
    alwaysAllow: isPlan
      ? null
      : {
          id: ALLOW_ALWAYS_ACTION_ID,
          label: labels.alwaysAllow,
          behavior: "allow",
          variant: "secondary",
        },
    extras: [],
  };
}
