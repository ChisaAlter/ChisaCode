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

// ── Blocking state detection ───────────────────────────────────────────────

/**
 * Check if the repository is in a state where snapshot commits must not run
 * (because `git commit` would finish or interfere with the operation).
 */
export async function detectBlockedGitState(
  cwd: string,
  logger: Logger,
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
      const result = await runGitCommand(["rev-parse", "--git-path", file], { cwd }, logger);
      const gitPath = result.stdout?.trim();
      if (!gitPath) continue;

      const { existsSync } = await import("node:fs");
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
 * Steps:
 * 1. Check for blocking git state
 * 2. Stage all non-sensitive changed files
 * 3. Commit on the snapshot branch with trailer metadata
 * 4. Switch back to the original branch
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
    const statusResult = await runGitCommand(["status", "--porcelain", "-z"], { cwd }, logger);
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

    // 4. Stage safe files
    await runGitCommand(["add", "--", ...safeFiles], { cwd }, logger);

    // 5. Commit with trailer metadata
    const message = buildSnapshotCommitMessage(meta);
    await runGitCommand(["commit", "-m", message, "--no-verify", "--allow-empty"], { cwd }, logger);

    // 6. Get commit hash
    const hashResult = await runGitCommand(["rev-parse", "HEAD"], { cwd }, logger);
    const commitHash = hashResult.stdout?.trim();

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
 */
export async function rewindToSnapshot(
  cwd: string,
  commitHash: string,
  files: string[],
  logger: Logger,
): Promise<RewindResult> {
  try {
    const targets = files.length > 0 ? files : ["."];
    await runGitCommand(["checkout", commitHash, "--", ...targets], { cwd }, logger);

    logger.info({ commitHash, files: targets.length }, "rewind completed");
    return { ok: true, restoredFiles: targets };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ err: error, commitHash }, "rewind failed");
    return { ok: false, reason: message };
  }
}

/**
 * List recent snapshot commits (by XDT trailer).
 */
export async function listSnapshots(
  cwd: string,
  logger: Logger,
  maxCount = 50,
): Promise<Array<{ hash: string; message: string; kind?: string }>> {
  try {
    const result = await runGitCommand(
      [
        "log",
        `--max-count=${maxCount}`,
        "--format=%H%x1f%B%x1e",
        `--grep=${TRAILER_PREFIX}-Snapshot-Kind:`,
      ],
      { cwd },
      logger,
    );

    const records = (result.stdout ?? "").split("\x1e").filter((r) => r.trim());
    return records.map((record) => {
      const [hash, ...bodyParts] = record.split("\x1f");
      const message = bodyParts.join("\x1f").trim();
      const trailers = parseSnapshotTrailers(message);
      return { hash: hash.trim(), message, kind: trailers.kind };
    });
  } catch {
    return [];
  }
}

// ── Internals ──────────────────────────────────────────────────────────────

function parseStatusPorcelain(output: string): string[] {
  // -z format: entries separated by NUL, each entry is "XY path"
  const entries = output.split("\0").filter(Boolean);
  const files: string[] = [];
  for (const entry of entries) {
    // Format: "XY <path>" where XY is 2 status chars + space
    const filePath = entry.slice(3).trim();
    if (filePath) files.push(filePath);
  }
  return files;
}
