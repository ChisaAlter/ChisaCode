import type { Logger } from "pino";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  archiveIfSafe,
  type ArchiveIfSafeDependencies,
  type AutoArchiveArchiveOptions,
} from "./archive-if-safe.js";
import type { WorkspaceGitRuntimeSnapshot } from "../workspace-git-service.js";

const CWD = "/tmp/chisacode/worktrees/repo/branch";
const CHISACODE_HOME = "/tmp/chisacode";
const WORKTREES_ROOT = "/tmp/chisacode/worktrees/repo";

function createPullRequest(
  overrides?: Partial<NonNullable<WorkspaceGitRuntimeSnapshot["github"]["pullRequest"]>>,
): NonNullable<WorkspaceGitRuntimeSnapshot["github"]["pullRequest"]> {
  return {
    url: "https://github.com/acme/repo/pull/123",
    title: "Merge me",
    state: "open",
    baseRefName: "main",
    headRefName: "feature",
    isMerged: true,
    ...overrides,
  };
}

function createSnapshot(overrides?: {
  git?: Partial<WorkspaceGitRuntimeSnapshot["git"]>;
  pullRequest?: WorkspaceGitRuntimeSnapshot["github"]["pullRequest"];
}): WorkspaceGitRuntimeSnapshot {
  return {
    cwd: CWD,
    git: {
      isGit: true,
      repoRoot: "/tmp/repo",
      mainRepoRoot: "/tmp/repo",
      currentBranch: "feature",
      remoteUrl: "https://github.com/acme/repo.git",
      isChisaCodeOwnedWorktree: true,
      isDirty: false,
      baseRef: "main",
      aheadBehind: { ahead: 0, behind: 0 },
      aheadOfOrigin: 0,
      behindOfOrigin: 0,
      hasRemote: true,
      diffStat: { additions: 0, deletions: 0 },
      ...overrides?.git,
    },
    github: {
      featuresEnabled: true,
      pullRequest:
        overrides && "pullRequest" in overrides
          ? (overrides.pullRequest ?? null)
          : createPullRequest(),
      error: null,
    },
  };
}

function createLogger(): Logger {
  const logger = {
    child: () => logger,
    info: vi.fn(),
    warn: vi.fn(),
  };
  return logger as unknown as Logger;
}

function createHarness(overrides?: {
  autoArchiveAfterMerge?: boolean;
  getSnapshot?: () => Promise<WorkspaceGitRuntimeSnapshot | null>;
  isChisaCodeOwnedWorktreeCwd?: ArchiveIfSafeDependencies["isChisaCodeOwnedWorktreeCwd"];
  archiveChisaCodeWorktree?: ArchiveIfSafeDependencies["archiveChisaCodeWorktree"];
}) {
  const getConfig = vi.fn(() => ({
    autoArchiveAfterMerge: overrides?.autoArchiveAfterMerge ?? true,
  }));
  const getSnapshot = vi.fn(
    overrides?.getSnapshot ?? (async () => createSnapshot()),
  ) as unknown as AutoArchiveArchiveOptions["workspaceGitService"]["getSnapshot"];
  const workspaceGitService = {
    getSnapshot,
  } as unknown as AutoArchiveArchiveOptions["workspaceGitService"];
  const options: AutoArchiveArchiveOptions = {
    chisacodeHome: CHISACODE_HOME,
    daemonConfigStore: {
      get: getConfig,
    } as unknown as AutoArchiveArchiveOptions["daemonConfigStore"],
    workspaceGitService,
    github: {} as AutoArchiveArchiveOptions["github"],
    agentManager: {} as AutoArchiveArchiveOptions["agentManager"],
    agentStorage: {} as AutoArchiveArchiveOptions["agentStorage"],
    terminalManager: {} as AutoArchiveArchiveOptions["terminalManager"],
    archiveWorkspaceRecord: vi.fn(),
    markWorkspaceArchiving: vi.fn(),
    clearWorkspaceArchiving: vi.fn(),
    emitWorkspaceUpdatesForWorkspaceIds: vi.fn(),
  };
  const archiveChisaCodeWorktree = vi.fn(
    overrides?.archiveChisaCodeWorktree ?? (async () => undefined),
  ) as unknown as ArchiveIfSafeDependencies["archiveChisaCodeWorktree"];
  const isChisaCodeOwnedWorktreeCwd = vi.fn(
    overrides?.isChisaCodeOwnedWorktreeCwd ??
      (async () => ({
        allowed: true,
        repoRoot: "/tmp/repo",
        worktreeRoot: WORKTREES_ROOT,
        worktreePath: CWD,
      })),
  ) as unknown as ArchiveIfSafeDependencies["isChisaCodeOwnedWorktreeCwd"];
  const deps: ArchiveIfSafeDependencies = {
    archiveChisaCodeWorktree,
    isChisaCodeOwnedWorktreeCwd,
    killTerminalsUnderPath: vi.fn(),
    isPathWithinRoot: vi.fn(() => true),
  };
  const log = createLogger();
  const inFlight = new Set<string>();

  return {
    deps,
    getConfig,
    getSnapshot,
    inFlight,
    log,
    options,
  };
}

async function runArchiveIfSafe(
  harness: ReturnType<typeof createHarness>,
  overrides?: {
    cwd?: string;
    pullRequest?: WorkspaceGitRuntimeSnapshot["github"]["pullRequest"];
  },
): Promise<void> {
  await archiveIfSafe({
    cwd: overrides?.cwd ?? CWD,
    pullRequest:
      overrides && "pullRequest" in overrides
        ? (overrides.pullRequest ?? null)
        : createPullRequest(),
    inFlight: harness.inFlight,
    options: harness.options,
    log: harness.log,
    deps: harness.deps,
  });
}

describe("archiveIfSafe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("does nothing when the pull request is not merged", async () => {
    const harness = createHarness();

    await runArchiveIfSafe(harness, { pullRequest: createPullRequest({ isMerged: false }) });

    expect(harness.getConfig).not.toHaveBeenCalled();
    expect(harness.getSnapshot).not.toHaveBeenCalled();
    expect(harness.deps.archiveChisaCodeWorktree).not.toHaveBeenCalled();
  });

  test("does nothing when auto-archive-after-merge is disabled", async () => {
    const harness = createHarness({ autoArchiveAfterMerge: false });

    await runArchiveIfSafe(harness);

    expect(harness.getConfig).toHaveBeenCalledTimes(1);
    expect(harness.getSnapshot).not.toHaveBeenCalled();
    expect(harness.deps.archiveChisaCodeWorktree).not.toHaveBeenCalled();
  });

  test("does nothing when the cwd already has an archive in flight", async () => {
    const harness = createHarness();
    harness.inFlight.add(CWD);

    await runArchiveIfSafe(harness);

    expect(harness.getSnapshot).not.toHaveBeenCalled();
    expect(harness.deps.archiveChisaCodeWorktree).not.toHaveBeenCalled();
    expect(harness.inFlight.has(CWD)).toBe(true);
  });

  test("logs and skips when reading the snapshot fails", async () => {
    const harness = createHarness({
      getSnapshot: async () => {
        throw new Error("snapshot failed");
      },
    });

    await runArchiveIfSafe(harness);

    expect(harness.log.warn).toHaveBeenCalledWith(
      { err: expect.any(Error), cwd: CWD },
      "Failed to read snapshot for auto-archive; skipping",
    );
    expect(harness.deps.archiveChisaCodeWorktree).not.toHaveBeenCalled();
    expect(harness.inFlight.has(CWD)).toBe(false);
  });

  test("does nothing when there is no snapshot", async () => {
    const harness = createHarness({ getSnapshot: async () => null });

    await runArchiveIfSafe(harness);

    expect(harness.deps.isChisaCodeOwnedWorktreeCwd).not.toHaveBeenCalled();
    expect(harness.deps.archiveChisaCodeWorktree).not.toHaveBeenCalled();
  });

  test("does nothing when the worktree is dirty", async () => {
    const harness = createHarness({
      getSnapshot: async () => createSnapshot({ git: { isDirty: true } }),
    });

    await runArchiveIfSafe(harness);

    expect(harness.deps.isChisaCodeOwnedWorktreeCwd).not.toHaveBeenCalled();
    expect(harness.deps.archiveChisaCodeWorktree).not.toHaveBeenCalled();
  });

  test("does nothing when the worktree is ahead of origin", async () => {
    const harness = createHarness({
      getSnapshot: async () => createSnapshot({ git: { aheadOfOrigin: 1 } }),
    });

    await runArchiveIfSafe(harness);

    expect(harness.deps.isChisaCodeOwnedWorktreeCwd).not.toHaveBeenCalled();
    expect(harness.deps.archiveChisaCodeWorktree).not.toHaveBeenCalled();
  });

  test("does nothing when the cwd is not a ChisaCode-owned worktree", async () => {
    const harness = createHarness({
      isChisaCodeOwnedWorktreeCwd: async () => ({ allowed: false, worktreePath: CWD }),
    });

    await runArchiveIfSafe(harness);

    expect(harness.deps.isChisaCodeOwnedWorktreeCwd).toHaveBeenCalledWith(CWD, {
      chisacodeHome: CHISACODE_HOME,
    });
    expect(harness.deps.archiveChisaCodeWorktree).not.toHaveBeenCalled();
  });

  test("logs and does not throw when archiving fails", async () => {
    const harness = createHarness({
      archiveChisaCodeWorktree: async () => {
        throw new Error("archive failed");
      },
    });

    await runArchiveIfSafe(harness);

    expect(harness.log.warn).toHaveBeenCalledWith(
      { err: expect.any(Error), cwd: CWD },
      "Auto-archive after merge failed",
    );
    expect(harness.inFlight.has(CWD)).toBe(false);
  });

  test("archives a clean ChisaCode-owned worktree after merge", async () => {
    const harness = createHarness();

    await runArchiveIfSafe(harness);

    expect(harness.deps.archiveChisaCodeWorktree).toHaveBeenCalledTimes(1);
    expect(harness.deps.archiveChisaCodeWorktree).toHaveBeenCalledWith(
      expect.objectContaining({
        chisacodeHome: CHISACODE_HOME,
        workspaceGitService: harness.options.workspaceGitService,
      }),
      {
        targetPath: CWD,
        repoRoot: "/tmp/repo",
        worktreesRoot: WORKTREES_ROOT,
        requestId: "auto-archive-on-merge",
      },
    );
    expect(harness.log.info).toHaveBeenCalledWith(
      { cwd: CWD },
      "Auto-archived worktree after PR merge",
    );
    expect(harness.inFlight.has(CWD)).toBe(false);
  });
});
