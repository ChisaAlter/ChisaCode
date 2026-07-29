/**
 * Git Snapshot — automatic before/after edit snapshots with rewind support.
 *
 * Creates lightweight git commits on a dedicated snapshot branch
 * (chisacode-snapshots) to capture workspace state before and after agent
 * edits. Sensitive files are excluded via detectSensitivePath. Snapshot
 * commits carry XDT-style trailer metadata for identification.
 *
 * Design adapted from Cindy's git-snapshot/ (Apache-2.0).
 */
import { existsSync } from "node:fs";

import type { Logger } from "pino";

import { detectSensitivePath } from "../utils/sensitive-path.js";
import { runGitCommand } from "../utils/run-git-command.js";

// ── Types ──────────────────────────────────────────────────────────────────

export type SnapshotKind =
  | "before-edit"
  | "after-edit"
  | "manual"
  | "pre-rollback"
  | "rewind-blocked";

export interface SnapshotMeta {
  kind: SnapshotKind;
  sessionId?: string;
  agentId?: string;
  label?: string;
}

export interface SnapshotResult {
  ok: boolean;
  commitHash?: string;
  /** Reason when ok=false. */
  reason?: string;
  /** Files excluded from the snapshot due to sensitivity. */
  excludedFiles?: string[];
}

export interface SnapshotBlockedState {
  reason: "merge" | "rebase" | "cherry-pick" | "revert" | "conflict";
}

export interface RewindResult {
  ok: boolean;
  restoredFiles?: string[];
  reason?: string;
}

const TRAILER_PREFIX = "XDT";
const SNAPSHOT_BRANCH = "chisacode-snapshots";

// ── Blocking state detection ───────────────────────────────────────────────

/**
 * Check if the repository is in a state where snapshot commits must not run
 * (because `git commit` would finish or interfere with the operation).
 */
export async function detectBlockedGitState(
  cwd: string,
  _logger: Logger,
): Promise<SnapshotBlockedState | null> {
  const checks: Array<{ file: string; reason: SnapshotBlockedState["reason"] }> = [
    { file: "MERGE_HEAD", reason: "merge" },
    { file: "rebase-merge", reason: "rebase" },
    { file: "rebase-apply", reason: "rebase" },
    { file: "CHERRY_PICK_HEAD", reason: "cherry-pick" },
    { file: "REVERT_HEAD", reason: "revert" },
  ];

  for (const { file, reason } of checks) {
    try {
      const result = await runGitCommand(["rev-parse", "--git-path", file], { cwd });
      const gitPath = result.stdout?.trim();
      if (!gitPath) continue;

      if (existsSync(gitPath)) {
        return { reason };
      }
    } catch {
      // Non-fatal — skip this check
    }
  }

  return null;
}

// ── Snapshot creation ──────────────────────────────────────────────────────

/**
 * Build the commit message with XDT trailer metadata.
 */
export function buildSnapshotCommitMessage(meta: SnapshotMeta): string {
  const label = meta.label ?? meta.kind;
  const lines = [`chisacode: ${label}`];
  lines.push("");
  lines.push(`${TRAILER_PREFIX}-Snapshot-Kind: ${meta.kind}`);
  if (meta.sessionId) lines.push(`${TRAILER_PREFIX}-Session-Id: ${meta.sessionId}`);
  if (meta.agentId) lines.push(`${TRAILER_PREFIX}-Agent-Id: ${meta.agentId}`);
  return lines.join("\n");
}

/**
 * Parse snapshot metadata from a commit message's trailers.
 */
export function parseSnapshotTrailers(message: string): {
  kind?: string;
  sessionId?: string;
  agentId?: string;
} {
  const kind = message.match(new RegExp(`${TRAILER_PREFIX}-Snapshot-Kind: (.+)`))?.[1];
  const sessionId = message.match(new RegExp(`${TRAILER_PREFIX}-Session-Id: (.+)`))?.[1];
  const agentId = message.match(new RegExp(`${TRAILER_PREFIX}-Agent-Id: (.+)`))?.[1];
  return { kind, sessionId, agentId };
}

/**
 * Create a git snapshot of the current workspace state.
 *
 * Uses git plumbing commands (write-tree + commit-tree + update-ref) to
 * create a snapshot commit without touching HEAD, the current branch, or
 * the staging area. The snapshot is stored under refs/chisacode-snapshots/
 * and can be listed/rewound later.
 */
export async function createSnapshot(
  cwd: string,
  meta: SnapshotMeta,
  logger: Logger,
): Promise<SnapshotResult> {
  // 1. Check blocking state
  const blocked = await detectBlockedGitState(cwd, logger);
  if (blocked) {
    return { ok: false, reason: `git ${blocked.reason} in progress` };
  }

  try {
    // 2. Get list of changed files
    const statusResult = await runGitCommand(["status", "--porcelain", "-z"], { cwd });
    const changedFiles = parseStatusPorcelain(statusResult.stdout ?? "");
    if (changedFiles.length === 0) {
      return { ok: false, reason: "no changes to snapshot" };
    }

    // 3. Filter sensitive files
    const excludedFiles: string[] = [];
    const safeFiles = changedFiles.filter((f) => {
      const detector = detectSensitivePath(f);
      if (detector) {
        excludedFiles.push(f);
        return false;
      }
      return true;
    });

    if (safeFiles.length === 0) {
      return { ok: false, reason: "all changed files are sensitive", excludedFiles };
    }

    // 4. Stage safe files (temporarily modifies the index)
    await runGitCommand(["add", "--", ...safeFiles], { cwd });

    // 5. Create a tree object from the current index
    const treeResult = await runGitCommand(["write-tree"], { cwd });
    const treeHash = treeResult.stdout?.trim();

    // 6. Restore the index to HEAD (unstage the files we just added)
    await runGitCommand(["reset", "HEAD", "--"], { cwd });

    if (!treeHash) {
      return { ok: false, reason: "failed to create tree object" };
    }

    // 7. Create a commit object pointing at the tree (does NOT touch HEAD)
    const message = buildSnapshotCommitMessage(meta);
    const headResult = await runGitCommand(["rev-parse", "HEAD"], { cwd });
    const parentHash = headResult.stdout?.trim();

    const commitArgs = parentHash
      ? ["commit-tree", treeHash, "-p", parentHash, "-m", message]
      : ["commit-tree", treeHash, "-m", message];
    const commitResult = await runGitCommand(commitArgs, { cwd });
    const commitHash = commitResult.stdout?.trim();

    if (!commitHash) {
      return { ok: false, reason: "failed to create commit object" };
    }

    // 8. Store the snapshot ref for later listing/rewind
    try {
      await runGitCommand(
        ["update-ref", `refs/${SNAPSHOT_BRANCH}/${commitHash.slice(0, 12)}`, commitHash],
        { cwd },
      );
    } catch (refError) {
      // Non-fatal: commit object exists but isn't easily discoverable
      logger.warn({ err: refError, commitHash }, "failed to store snapshot ref");
    }

    logger.info(
      { commitHash, kind: meta.kind, files: safeFiles.length, excluded: excludedFiles.length },
      "snapshot created",
    );

    return { ok: true, commitHash, excludedFiles };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ err: error }, "snapshot creation failed");
    return { ok: false, reason: message };
  }
}

// ── Rewind ─────────────────────────────────────────────────────────────────

/**
 * Restore specific files from a snapshot commit.
 * Validates that the target commit is actually a snapshot (has XDT trailer).
 */
export async function rewindToSnapshot(
  cwd: string,
  commitHash: string,
  files: string[],
  logger: Logger,
): Promise<RewindResult> {
  try {
    // Defense-in-depth: the protocol schema already restricts commitHash to
    // hex SHA, but reject here too so a direct caller (tests, internal code)
    // cannot perform git argument injection (e.g. --output=<path> writes the
    // log to an arbitrary file).
    if (!/^[0-9a-f]{40,64}$/i.test(commitHash)) {
      return { ok: false, reason: "commitHash must be a 40- or 64-char hex SHA" };
    }
    // Validate that this is actually a snapshot commit
    const logResult = await runGitCommand(["log", "-1", "--format=%B", commitHash], { cwd });
    const trailers = parseSnapshotTrailers(logResult.stdout ?? "");
    if (!trailers.kind) {
      return { ok: false, reason: `commit ${commitHash} is not a snapshot (no XDT trailer)` };
    }

    const targets = files.length > 0 ? files : ["."];
    await runGitCommand(["checkout", commitHash, "--", ...targets], { cwd });

    logger.info({ commitHash, files: targets.length }, "rewind completed");
    return { ok: true, restoredFiles: targets };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ err: error, commitHash }, "rewind failed");
    return { ok: false, reason: message };
  }
}

/**
 * List recent snapshot commits from the refs/chisacode-snapshots/ namespace.
 */
export async function listSnapshots(
  cwd: string,
  _logger: Logger,
  maxCount = 50,
): Promise<Array<{ hash: string; message: string; kind?: string; createdAt: number }>> {
  try {
    // Get the list of snapshot refs with their creation timestamp (unix seconds).
    const refsResult = await runGitCommand(
      [
        "for-each-ref",
        `--count=${maxCount}`,
        "--sort=-creatordate",
        "--format=%(objectname)%09%(creatordate:unix)",
        `refs/${SNAPSHOT_BRANCH}/`,
      ],
      { cwd },
    );
    const lines = (refsResult.stdout ?? "").trim().split("\n").filter(Boolean);
    if (lines.length === 0) return [];

    // Read each commit message individually (avoids git log format parsing issues)
    const results: Array<{ hash: string; message: string; kind?: string; createdAt: number }> = [];
    for (const line of lines) {
      const [rawHash, rawCreatedAt] = line.split("\t");
      const hash = rawHash?.trim();
      if (!hash) continue;
      const createdAt = Number.parseInt(rawCreatedAt ?? "", 10);
      try {
        const msgResult = await runGitCommand(["log", "-1", "--format=%B", hash], { cwd });
        const message = (msgResult.stdout ?? "").trim();
        const trailers = parseSnapshotTrailers(message);
        results.push({
          hash,
          message,
          kind: trailers.kind,
          createdAt: Number.isFinite(createdAt) ? createdAt : 0,
        });
      } catch {
        // Skip unreadable commits
      }
    }
    return results;
  } catch {
    return [];
  }
}

// ── Internals ──────────────────────────────────────────────────────────────

function parseStatusPorcelain(output: string): string[] {
  // -z format: entries separated by NUL, each entry is "XY path".
  // Rename/copy entries (R/C status) have an extra NUL-separated old path
  // immediately after the new path entry — we skip those.
  const entries = output.split("\0").filter(Boolean);
  const files: string[] = [];
  let skipNext = false;
  for (const entry of entries) {
    if (skipNext) {
      skipNext = false;
      continue; // This is the old path of a rename/copy — skip it
    }
    // Format: "XY <path>" where XY is 2 status chars + space
    const status = entry.slice(0, 2);
    const filePath = entry.slice(3).trim();
    if (filePath) files.push(filePath);
    // Rename (R) and copy (C) entries are followed by the original path
    if (status[0] === "R" || status[0] === "C") {
      skipNext = true;
    }
  }
  return files;
}
