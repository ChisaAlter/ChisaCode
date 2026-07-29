import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import pino from "pino";

import {
  buildSnapshotCommitMessage,
  createSnapshot,
  detectBlockedGitState,
  listSnapshots,
  parseSnapshotTrailers,
  rewindToSnapshot,
} from "./git-snapshot.js";

const logger = pino({ level: "silent" });

let tmpDir: string;

function git(args: string): string {
  return execSync(`git ${args}`, { cwd: tmpDir, encoding: "utf8" }).trim();
}

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "git-snapshot-test-"));
  git("init");
  git("config user.email test@test.com");
  git("config user.name Test");
  writeFileSync(path.join(tmpDir, "README.md"), "hello");
  git("add .");
  git("commit -m init");
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("buildSnapshotCommitMessage", () => {
  test("includes kind trailer", () => {
    const msg = buildSnapshotCommitMessage({ kind: "before-edit" });
    expect(msg).toContain("chisacode: before-edit");
    expect(msg).toContain("XDT-Snapshot-Kind: before-edit");
  });

  test("includes session and agent trailers", () => {
    const msg = buildSnapshotCommitMessage({
      kind: "after-edit",
      sessionId: "sess-123",
      agentId: "agent-456",
    });
    expect(msg).toContain("XDT-Session-Id: sess-123");
    expect(msg).toContain("XDT-Agent-Id: agent-456");
  });

  test("uses label when provided", () => {
    const msg = buildSnapshotCommitMessage({ kind: "manual", label: "user checkpoint" });
    expect(msg).toContain("chisacode: user checkpoint");
  });
});

describe("parseSnapshotTrailers", () => {
  test("parses trailers from commit message", () => {
    const msg = buildSnapshotCommitMessage({
      kind: "before-edit",
      sessionId: "s1",
      agentId: "a1",
    });
    const parsed = parseSnapshotTrailers(msg);
    expect(parsed.kind).toBe("before-edit");
    expect(parsed.sessionId).toBe("s1");
    expect(parsed.agentId).toBe("a1");
  });

  test("returns undefined for missing trailers", () => {
    const parsed = parseSnapshotTrailers("regular commit message");
    expect(parsed.kind).toBeUndefined();
    expect(parsed.sessionId).toBeUndefined();
  });
});

describe("detectBlockedGitState", () => {
  test("returns null for clean repo", async () => {
    const result = await detectBlockedGitState(tmpDir, logger);
    expect(result).toBeNull();
  });
});

describe("createSnapshot", () => {
  test("creates snapshot of changed files", async () => {
    writeFileSync(path.join(tmpDir, "new-file.ts"), "export const x = 1;");

    const result = await createSnapshot(
      tmpDir,
      { kind: "before-edit", sessionId: "test-session" },
      logger,
    );

    expect(result.ok).toBe(true);
    expect(result.commitHash).toBeDefined();
    expect(result.excludedFiles).toEqual([]);
  });

  test("returns not-ok when no changes", async () => {
    const result = await createSnapshot(tmpDir, { kind: "manual" }, logger);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("no changes");
  });

  test("excludes sensitive files", async () => {
    writeFileSync(path.join(tmpDir, ".env"), "SECRET=key");
    writeFileSync(path.join(tmpDir, "safe.ts"), "export const y = 2;");

    const result = await createSnapshot(tmpDir, { kind: "before-edit" }, logger);

    expect(result.ok).toBe(true);
    expect(result.excludedFiles).toContain(".env");
  });

  test("fails when all files are sensitive", async () => {
    writeFileSync(path.join(tmpDir, ".env.local"), "SECRET=key");

    const result = await createSnapshot(tmpDir, { kind: "before-edit" }, logger);

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("sensitive");
  });
});

describe("listSnapshots", () => {
  test("lists snapshot commits by trailer", async () => {
    writeFileSync(path.join(tmpDir, "file1.ts"), "a");
    const snap1 = await createSnapshot(tmpDir, { kind: "before-edit" }, logger);
    expect(snap1.ok).toBe(true);

    writeFileSync(path.join(tmpDir, "file1.ts"), "b");
    const snap2 = await createSnapshot(tmpDir, { kind: "after-edit" }, logger);
    expect(snap2.ok).toBe(true);

    const snapshots = await listSnapshots(tmpDir, logger);
    expect(snapshots.length).toBe(2);
    expect(snapshots.some((s) => s.kind === "before-edit")).toBe(true);
    expect(snapshots.some((s) => s.kind === "after-edit")).toBe(true);
  });

  test("returns empty for repo without snapshots", async () => {
    const snapshots = await listSnapshots(tmpDir, logger);
    expect(snapshots).toEqual([]);
  });
});

describe("rewindToSnapshot", () => {
  test("restores files from snapshot", async () => {
    // Create initial state
    writeFileSync(path.join(tmpDir, "code.ts"), "version 1");
    await createSnapshot(tmpDir, { kind: "before-edit" }, logger);
    const snapshots = await listSnapshots(tmpDir, logger);
    const snapshotHash = snapshots[0].hash;

    // Modify the file
    writeFileSync(path.join(tmpDir, "code.ts"), "version 2");
    git("add .");
    git("commit -m 'edit'");

    // Rewind
    const result = await rewindToSnapshot(tmpDir, snapshotHash, ["code.ts"], logger);
    expect(result.ok).toBe(true);
    expect(result.restoredFiles).toContain("code.ts");
  });

  test("rejects non-hex commitHash to prevent git argument injection", async () => {
    // --output=<path> is a valid git log flag; a hostile commitHash must be
    // rejected before any git invocation so it cannot overwrite arbitrary files.
    const hostile = "--output=/tmp/chisacode-injection-test";
    const result = await rewindToSnapshot(tmpDir, hostile, [], logger);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/hex SHA/);
  });

  test("rejects short non-SHA commitHash", async () => {
    const result = await rewindToSnapshot(tmpDir, "not-a-sha", [], logger);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/hex SHA/);
  });
});
