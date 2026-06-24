import { realpathSync } from "node:fs";
import { resolve, sep } from "path";
import { v4 as uuidv4 } from "uuid";

import type { AgentStorage } from "./agent/agent-storage.js";
import type { AgentSnapshotPayload, ProjectPlacementPayload } from "./messages.js";
import type {
  PersistedProjectRecord,
  PersistedWorkspaceRecord,
  ProjectRegistry,
} from "./workspace-registry.js";
import type { WorkspaceGitRuntimeSnapshot } from "./workspace-git-service.js";

export const WORKSPACE_GIT_WATCH_REMOVED_STATE_KEY = "__removed__";

export const FETCH_AGENTS_SORT_KEYS = [
  "status_priority",
  "created_at",
  "updated_at",
  "title",
] as const;

export type CurrentWorkspacePullRequest = NonNullable<
  WorkspaceGitRuntimeSnapshot["github"]["pullRequest"]
> & {
  number: number;
};

export interface ResolveKnownProjectRootForConfigInput {
  repoRoot: string;
  projectRegistry: Pick<ProjectRegistry, "list">;
}

export async function resolveKnownProjectRootForConfig(
  input: ResolveKnownProjectRootForConfigInput,
): Promise<string | null> {
  const requestedRoot = canonicalizeConfigRoot(input.repoRoot);
  const projects = await input.projectRegistry.list();
  for (const project of projects) {
    if (project.archivedAt !== null) {
      continue;
    }
    const projectRoot = canonicalizeConfigRoot(project.rootPath);
    if (requestedRoot === projectRoot) {
      return projectRoot;
    }
  }
  return null;
}

export function canonicalizeConfigRoot(repoRoot: string): string {
  const resolved = resolve(repoRoot);
  try {
    return stripTrailingPathSeparators(realpathSync(resolved));
  } catch {
    return stripTrailingPathSeparators(resolved);
  }
}

export function stripTrailingPathSeparators(path: string): string {
  let normalized = path;
  while (normalized.length > 1 && normalized.endsWith(sep)) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

export type GitMutationRefreshReason =
  | "commit-changes"
  | "pull"
  | "push"
  | "merge-to-base"
  | "merge-from-base"
  | "merge-pr"
  | "enable-pr-auto-merge"
  | "disable-pr-auto-merge"
  | "create-pr"
  | "switch-branch"
  | "rename-branch"
  | "create-branch"
  | "stash-push"
  | "stash-pop"
  | "create-worktree";

// TODO: Remove once all app store clients are on >=0.1.45 and understand arbitrary provider strings.
// Clients before 0.1.45 validate providers with z.enum(["claude", "codex", "opencode"]) and reject
// the entire session message if they encounter an unknown provider.
export const LEGACY_PROVIDER_IDS = new Set(["claude", "codex", "opencode"]);
// COMPAT(customModeIcons): the only mode icons known to clients before v0.1.84. Any
// other icon name is downgraded to "ShieldCheck" for those clients.
export const LEGACY_MODE_ICONS = new Set<string>([
  "ShieldCheck",
  "ShieldAlert",
  "ShieldOff",
  "ShieldQuestionMark",
]);
export const MIN_VERSION_ALL_PROVIDERS = "0.1.45";
export const MIN_VERSION_FLEXIBLE_EDITOR_IDS = "0.1.50";

export function errorToFriendlyMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

export function resolveSubscriptionId(
  subscribe: unknown,
  requestedSubscriptionId: string | undefined,
): string | null {
  if (!subscribe) return null;
  if (requestedSubscriptionId && requestedSubscriptionId.length > 0) {
    return requestedSubscriptionId;
  }
  return uuidv4();
}

export function diffChangeTypeFor(file: { isNew?: boolean; isDeleted?: boolean }): "A" | "D" | "M" {
  if (file.isNew) return "A";
  if (file.isDeleted) return "D";
  return "M";
}

export function buildWorkspaceCheckout(
  workspace: PersistedWorkspaceRecord,
  project: PersistedProjectRecord,
): ProjectPlacementPayload["checkout"] {
  if (project.kind !== "git") {
    return {
      cwd: workspace.cwd,
      isGit: false,
      currentBranch: null,
      remoteUrl: null,
      worktreeRoot: null,
      isChisaCodeOwnedWorktree: false,
      mainRepoRoot: null,
    };
  }
  if (workspace.kind === "worktree") {
    return {
      cwd: workspace.cwd,
      isGit: true,
      currentBranch: workspace.displayName,
      remoteUrl: null,
      worktreeRoot: workspace.cwd,
      isChisaCodeOwnedWorktree: true,
      mainRepoRoot: project.rootPath,
    };
  }
  return {
    cwd: workspace.cwd,
    isGit: true,
    currentBranch: workspace.displayName,
    remoteUrl: null,
    worktreeRoot: workspace.cwd,
    isChisaCodeOwnedWorktree: false,
    mainRepoRoot: null,
  };
}

export function isAppVersionAtLeast(appVersion: string | null, minVersion: string): boolean {
  if (!appVersion) return false;
  // Strip prerelease suffix: "0.1.45-beta.4" -> "0.1.45"
  const base = appVersion.replace(/-.*$/, "");
  const parts = base.split(".").map(Number);
  const minParts = minVersion.split(".").map(Number);
  for (let i = 0; i < minParts.length; i++) {
    const a = parts[i] ?? 0;
    const b = minParts[i] ?? 0;
    if (a > b) return true;
    if (a < b) return false;
  }
  return true;
}

export function clientSupportsAllProviders(appVersion: string | null): boolean {
  return isAppVersionAtLeast(appVersion, MIN_VERSION_ALL_PROVIDERS);
}

export function clientSupportsFlexibleEditorIds(appVersion: string | null): boolean {
  return isAppVersionAtLeast(appVersion, MIN_VERSION_FLEXIBLE_EDITOR_IDS);
}

export type DeleteFencedAgentStorage = AgentStorage & {
  beginDelete(agentId: string): void;
};

export function beginAgentDeleteIfSupported(agentStorage: AgentStorage, agentId: string): void {
  if ("beginDelete" in agentStorage && typeof agentStorage.beginDelete === "function") {
    (agentStorage as DeleteFencedAgentStorage).beginDelete(agentId);
  }
}

export function resolveWaitForFinishError(options: {
  status: "permission" | "error" | "idle";
  final: AgentSnapshotPayload | null;
}): string | null {
  if (options.status !== "error") {
    return null;
  }
  const message = options.final?.lastError;
  return typeof message === "string" && message.trim().length > 0 ? message : "Agent failed";
}
