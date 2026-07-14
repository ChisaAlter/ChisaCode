import { resolve } from "path";
import { existsSync } from "fs";
import { readFile } from "fs/promises";

import type { Logger } from "pino";

import { parseGitHubRepoFromRemote } from "../server/workspace-git-metadata.js";
import {
  createGitHubService,
  resolveGitHubRepo,
  type GitHubService,
} from "../services/github-service.js";
import { resolveGitRevParsePath } from "./git-rev-parse-path.js";
import { runGitCommand } from "./run-git-command.js";
import {
  createCheckoutDiffReader,
  type CheckoutDiffCompare,
  type CheckoutDiffResult,
} from "./checkout-git-diff.js";
import {
  createCheckoutMergeAuthority,
  type MergeFromBaseOptions,
  type MergeToBaseOptions,
} from "./checkout-git-merge.js";
import {
  createCheckoutPullRequestStatusAuthority,
  type PullRequestStatusLookupTarget,
  type PullRequestStatusResult,
} from "./checkout-git-pull-request-status.js";
import {
  createCheckoutShortstatAuthority,
  type CheckoutShortstat,
} from "./checkout-git-shortstat.js";
import { READ_ONLY_GIT_ENV, requireGitRepo } from "./checkout-git-repository.js";
import {
  getChisaCodeWorktreeForCwd,
  getMainRepoRootFromCommonDir,
  getWorktreePathForBranch,
  getWorktreeRoot,
  readChisaCodeWorktreeBaseRef,
  type ChisaCodeWorktreeForCwd,
} from "./checkout-git-worktree-topology.js";

export { NotGitRepoError } from "./checkout-git-repository.js";
export {
  checkoutResolvedBranch,
  listBranchSuggestions,
  resolveBranchCheckout,
  type BranchCheckoutResolution,
  type BranchCheckoutSource,
  type BranchSuggestion,
  type CheckoutExistingBranchResult,
  type CheckoutResolvedBranchInput,
  type LocalBranchCheckoutResolution,
  type NotFoundBranchCheckoutResolution,
  type RemoteOnlyBranchCheckoutResolution,
} from "./checkout-git-branches.js";
export type { CheckoutDiffCompare, CheckoutDiffResult } from "./checkout-git-diff.js";
export {
  MergeConflictError,
  MergeFromBaseConflictError,
  type MergeFromBaseOptions,
  type MergeToBaseOptions,
} from "./checkout-git-merge.js";
export type {
  ChecksStatus,
  PullRequestCheck,
  PullRequestStatus,
  PullRequestStatusResult,
  ReviewDecision,
} from "./checkout-git-pull-request-status.js";
export type { CheckoutShortstat } from "./checkout-git-shortstat.js";
export {
  getMainRepoRoot,
  isChisaCodeWorktreePath,
  isDescendantPath,
  parseWorktreeList,
  type GitWorktreeEntry,
} from "./checkout-git-worktree-topology.js";
const PULL_REQUEST_REMOTE_PREFIXES = ["chisacode-pr-", "chisacode-pr-"] as const;

function isManagedPullRequestRemote(remoteName: string | null | undefined): remoteName is string {
  return (
    remoteName !== null &&
    remoteName !== undefined &&
    PULL_REQUEST_REMOTE_PREFIXES.some((prefix) => remoteName.startsWith(prefix))
  );
}

interface CheckoutReadCacheOptions {
  force?: boolean;
  reason?: string;
}

export interface AheadBehind {
  ahead: number;
  behind: number;
}

export interface CheckoutStatus {
  isGit: false;
}

export interface CheckoutStatusGitNonChisaCode {
  isGit: true;
  repoRoot: string;
  mainRepoRoot: string | null;
  currentBranch: string | null;
  isDirty: boolean;
  baseRef: string | null;
  aheadBehind: AheadBehind | null;
  aheadOfOrigin: number | null;
  behindOfOrigin: number | null;
  hasRemote: boolean;
  remoteUrl: string | null;
  isChisaCodeOwnedWorktree: false;
}

export interface CheckoutStatusGitChisaCode {
  isGit: true;
  repoRoot: string;
  mainRepoRoot: string;
  currentBranch: string | null;
  isDirty: boolean;
  baseRef: string;
  aheadBehind: AheadBehind | null;
  aheadOfOrigin: number | null;
  behindOfOrigin: number | null;
  hasRemote: boolean;
  remoteUrl: string | null;
  isChisaCodeOwnedWorktree: true;
}

export type CheckoutStatusGit = CheckoutStatusGitNonChisaCode | CheckoutStatusGitChisaCode;

export type CheckoutStatusResult = CheckoutStatus | CheckoutStatusGit;

export interface CheckoutContext {
  chisacodeHome?: string;
  logger?: Pick<Logger, "trace">;
  facts?: CheckoutSnapshotFacts | null;
}

export type CheckoutSnapshotFacts =
  | {
      isGit: false;
    }
  | {
      isGit: true;
      worktreeRoot: string;
      currentBranch: string | null;
      remoteUrl: string | null;
      absoluteGitDir: string | null;
      gitCommonDir: string | null;
      chisacodeWorktree: ChisaCodeWorktreeForCwd;
      storedBaseRef: string | null;
      resolvedBaseRef: string | null;
      mainRepoRoot: string | null;
      comparisonBaseRef: string | null;
      branchRemoteName: string | null;
      branchMergeRef: string | null;
      trackedOriginBranch: string | null;
      pullRequestLookupTarget: PullRequestStatusLookupTarget | null;
    };

function isGitError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return /not a git repository/i.test(error.message) || /git repository/i.test(error.message);
}

export async function getCurrentBranch(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await runGitCommand(["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd,
      envOverlay: READ_ONLY_GIT_ENV,
    });
    const branch = stdout.trim();
    if (branch === "HEAD") {
      return await getRebaseHeadBranch(cwd);
    }
    return branch.length > 0 ? branch : null;
  } catch {
    return null;
  }
}

async function getRebaseHeadBranch(cwd: string): Promise<string | null> {
  const paths = ["rebase-merge/head-name", "rebase-apply/head-name"];
  const results = await Promise.all(
    paths.map(async (path): Promise<string | null> => {
      try {
        const { stdout } = await runGitCommand(["rev-parse", "--git-path", path], {
          cwd,
          envOverlay: READ_ONLY_GIT_ENV,
        });
        const headName = (await readFile(resolve(cwd, stdout.trim()), "utf8")).trim();
        if (headName.startsWith("refs/heads/")) {
          return headName.slice("refs/heads/".length) || null;
        }
        return headName || null;
      } catch {
        return null;
      }
    }),
  );
  return results.find((result): result is string => result !== null) ?? null;
}

export async function localBranchExists(cwd: string, branchName: string): Promise<boolean> {
  return doesGitRefExist(cwd, `refs/heads/${branchName}`);
}

export async function renameCurrentBranch(
  cwd: string,
  newName: string,
): Promise<{ previousBranch: string | null; currentBranch: string | null }> {
  await requireGitRepo(cwd);

  const previousBranch = await getCurrentBranch(cwd);
  if (!previousBranch || previousBranch === "HEAD") {
    throw new Error("Cannot rename branch in detached HEAD state");
  }

  await runGitCommand(["branch", "-m", newName], {
    cwd,
    timeout: 120_000,
  });

  const currentBranch = await getCurrentBranch(cwd);
  return { previousBranch, currentBranch };
}

async function getStoredBaseRefForCwd(
  cwd: string,
  context?: CheckoutContext,
): Promise<string | null> {
  if (context?.facts?.isGit) {
    return context.facts.storedBaseRef;
  }
  const chisacodeWorktree = await getChisaCodeWorktreeForCwd(cwd, context);
  if (!chisacodeWorktree.isChisaCodeOwnedWorktree) {
    return null;
  }

  return readChisaCodeWorktreeBaseRef(chisacodeWorktree.worktreeRoot);
}

async function getResolvedBaseRefForCwd(
  cwd: string,
  context?: CheckoutContext,
): Promise<string | null> {
  if (context?.facts?.isGit) {
    return context.facts.resolvedBaseRef;
  }
  const { resolvedBaseRef } = await resolveBaseRefForCwd(cwd, context);
  return resolvedBaseRef;
}

interface BaseRefResolution {
  storedBaseRef: string | null;
  resolvedBaseRef: string | null;
}

async function resolveBaseRefForCwd(
  cwd: string,
  context?: CheckoutContext,
): Promise<BaseRefResolution> {
  if (context?.facts?.isGit) {
    return {
      storedBaseRef: context.facts.storedBaseRef,
      resolvedBaseRef: context.facts.resolvedBaseRef,
    };
  }
  const storedBaseRef = await getStoredBaseRefForCwd(cwd, context);
  return {
    storedBaseRef,
    resolvedBaseRef: storedBaseRef ?? (await resolveBaseRef(cwd)),
  };
}

async function isWorkingTreeDirty(cwd: string, context?: CheckoutContext): Promise<boolean> {
  const { stdout } = await runGitCommand(["status", "--porcelain"], {
    cwd,
    envOverlay: READ_ONLY_GIT_ENV,
    logger: context?.logger,
  });
  return stdout.trim().length > 0;
}

export async function getOriginRemoteUrl(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await runGitCommand(["config", "--get", "remote.origin.url"], {
      cwd,
      envOverlay: READ_ONLY_GIT_ENV,
    });
    const url = stdout.trim();
    return url.length > 0 ? url : null;
  } catch {
    return null;
  }
}

export async function hasOriginRemote(cwd: string): Promise<boolean> {
  const url = await getOriginRemoteUrl(cwd);
  return url !== null;
}

async function getGitConfigValue(
  cwd: string,
  key: string,
  context?: CheckoutContext,
): Promise<string | null> {
  try {
    const { stdout } = await runGitCommand(["config", "--get", key], {
      cwd,
      envOverlay: READ_ONLY_GIT_ENV,
      logger: context?.logger,
    });
    const value = stdout.trim();
    return value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

function parseBranchMergeHeadRef(mergeRef: string | null): string | null {
  const prefix = "refs/heads/";
  if (!mergeRef?.startsWith(prefix)) {
    return null;
  }
  const headRef = mergeRef.slice(prefix.length).trim();
  return headRef.length > 0 ? headRef : null;
}

async function resolvePullRequestStatusLookupTarget(
  cwd: string,
  currentBranch: string,
  context?: CheckoutContext,
): Promise<PullRequestStatusLookupTarget> {
  if (context?.facts?.isGit && context.facts.pullRequestLookupTarget) {
    return context.facts.pullRequestLookupTarget;
  }
  const remoteName = await getGitConfigValue(cwd, `branch.${currentBranch}.remote`);
  if (!isManagedPullRequestRemote(remoteName)) {
    return { headRef: currentBranch };
  }

  const mergeRef = await getGitConfigValue(cwd, `branch.${currentBranch}.merge`);
  const trackedHeadRef = parseBranchMergeHeadRef(mergeRef);
  if (!trackedHeadRef) {
    return { headRef: currentBranch };
  }

  const remoteUrl = await getGitConfigValue(cwd, `remote.${remoteName}.url`);
  const remoteRepo = remoteUrl ? parseGitHubRepoFromRemote(remoteUrl) : null;
  const headRepositoryOwner = remoteRepo?.split("/")[0];
  return {
    headRef: trackedHeadRef,
    ...(headRepositoryOwner ? { headRepositoryOwner } : {}),
  };
}

export async function resolveAbsoluteGitDir(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await runGitCommand(["rev-parse", "--absolute-git-dir"], {
      cwd,
      envOverlay: READ_ONLY_GIT_ENV,
    });
    const gitDir = stdout.trim();
    return gitDir.length > 0 ? gitDir : null;
  } catch {
    return null;
  }
}

async function resolveGitCommonDir(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await runGitCommand(["rev-parse", "--git-common-dir"], {
      cwd,
      envOverlay: READ_ONLY_GIT_ENV,
    });
    return resolveGitRevParsePath(cwd, stdout);
  } catch {
    return null;
  }
}

async function abortGitPullConflictState(cwd: string): Promise<void> {
  const gitDir = await resolveAbsoluteGitDir(cwd);
  if (!gitDir) {
    return;
  }

  const mergeHeadPath = resolve(gitDir, "MERGE_HEAD");
  const rebaseMergePath = resolve(gitDir, "rebase-merge");
  const rebaseApplyPath = resolve(gitDir, "rebase-apply");

  if (existsSync(mergeHeadPath)) {
    try {
      await runGitCommand(["merge", "--abort"], { cwd, timeout: 120_000 });
    } catch {
      // ignore
    }
  }

  if (existsSync(rebaseMergePath) || existsSync(rebaseApplyPath)) {
    try {
      await runGitCommand(["rebase", "--abort"], { cwd, timeout: 120_000 });
    } catch {
      // ignore
    }
  }
}

export async function resolveRepositoryDefaultBranch(repoRoot: string): Promise<string | null> {
  try {
    const { stdout } = await runGitCommand(
      ["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"],
      {
        cwd: repoRoot,
        envOverlay: READ_ONLY_GIT_ENV,
      },
    );
    const ref = stdout.trim();
    if (ref) {
      // Prefer a local branch name (e.g. "main") over the remote-tracking ref (e.g. "origin/main")
      // so that status/diff/merge all operate against the same base ref.
      const remoteShort = ref.replace(/^refs\/remotes\//, "");
      const localName = remoteShort.startsWith("origin/")
        ? remoteShort.slice("origin/".length)
        : remoteShort;
      try {
        await runGitCommand(["show-ref", "--verify", "--quiet", `refs/heads/${localName}`], {
          cwd: repoRoot,
          envOverlay: READ_ONLY_GIT_ENV,
        });
        return localName;
      } catch {
        return remoteShort;
      }
    }
  } catch {
    // ignore
  }

  const { stdout } = await runGitCommand(["branch", "--format=%(refname:short)"], {
    cwd: repoRoot,
    envOverlay: READ_ONLY_GIT_ENV,
  });
  const branches = new Set(
    stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0),
  );

  if (branches.has("main")) {
    return "main";
  }
  if (branches.has("master")) {
    return "master";
  }

  return null;
}

async function resolveBaseRef(repoRoot: string): Promise<string | null> {
  return resolveRepositoryDefaultBranch(repoRoot);
}

function normalizeLocalBranchRefName(input: string): string {
  if (input.startsWith("refs/remotes/origin/")) {
    return input.slice("refs/remotes/origin/".length);
  }
  if (input.startsWith("refs/heads/")) {
    return input.slice("refs/heads/".length);
  }
  if (input.startsWith("origin/")) {
    return input.slice("origin/".length);
  }
  return input;
}

interface ComparisonBaseRefName {
  localName: string;
  originRef: string;
}

function normalizeComparisonBaseRefName(input: string): ComparisonBaseRefName {
  const localName = normalizeLocalBranchRefName(input);
  return { localName, originRef: `origin/${localName}` };
}

async function doesGitRefExist(
  cwd: string,
  fullRef: string,
  context?: CheckoutContext,
): Promise<boolean> {
  const result = await runGitCommand(["show-ref", "--verify", "--quiet", fullRef], {
    cwd,
    envOverlay: READ_ONLY_GIT_ENV,
    acceptExitCodes: [0, 1],
    logger: context?.logger,
  });
  return result.exitCode === 0;
}

async function resolveBestComparisonBaseRef(
  cwd: string,
  baseRef: string,
  context?: CheckoutContext,
): Promise<string> {
  const normalized = normalizeComparisonBaseRefName(baseRef);
  const [hasLocal, hasOrigin] = await Promise.all([
    doesGitRefExist(cwd, `refs/heads/${normalized.localName}`, context),
    doesGitRefExist(cwd, `refs/remotes/origin/${normalized.localName}`, context),
  ]);

  if (hasOrigin) {
    return normalized.originRef;
  }
  if (hasLocal) {
    return normalized.localName;
  }

  const refName =
    baseRef.startsWith("origin/") || baseRef.startsWith("refs/remotes/origin/")
      ? normalized.originRef
      : normalized.localName;
  throw new Error(`Base branch not found locally or on origin: ${refName}`);
}

async function resolveMostAheadBaseRef(cwd: string, normalizedBaseRef: string): Promise<string> {
  const [hasLocal, hasOrigin] = await Promise.all([
    doesGitRefExist(cwd, `refs/heads/${normalizedBaseRef}`),
    doesGitRefExist(cwd, `refs/remotes/origin/${normalizedBaseRef}`),
  ]);

  if (hasLocal && !hasOrigin) {
    return normalizedBaseRef;
  }
  if (!hasLocal && hasOrigin) {
    return `origin/${normalizedBaseRef}`;
  }
  if (!hasLocal && !hasOrigin) {
    throw new Error(`Base branch not found locally or on origin: ${normalizedBaseRef}`);
  }

  const { stdout } = await runGitCommand(
    ["rev-list", "--left-right", "--count", `${normalizedBaseRef}...origin/${normalizedBaseRef}`],
    { cwd, envOverlay: READ_ONLY_GIT_ENV },
  );
  const [localOnlyRaw, originOnlyRaw] = stdout.trim().split(/\s+/);
  const localOnly = Number.parseInt(localOnlyRaw ?? "0", 10);
  const originOnly = Number.parseInt(originOnlyRaw ?? "0", 10);
  if (Number.isNaN(localOnly) || Number.isNaN(originOnly)) {
    return normalizedBaseRef;
  }
  if (originOnly > localOnly) {
    return `origin/${normalizedBaseRef}`;
  }

  return normalizedBaseRef;
}

async function getAheadBehind(
  cwd: string,
  baseRef: string,
  currentBranch: string,
  context?: CheckoutContext,
): Promise<AheadBehind | null> {
  const normalizedBaseRef = normalizeLocalBranchRefName(baseRef);
  if (!normalizedBaseRef || !currentBranch || normalizedBaseRef === currentBranch) {
    return null;
  }
  const comparisonBaseRef =
    context?.facts?.isGit && context.facts.resolvedBaseRef === baseRef
      ? context.facts.comparisonBaseRef
      : await resolveBestComparisonBaseRef(cwd, baseRef, context);
  if (!comparisonBaseRef) {
    return null;
  }
  const { stdout } = await runGitCommand(
    ["rev-list", "--left-right", "--count", `${comparisonBaseRef}...${currentBranch}`],
    { cwd, envOverlay: READ_ONLY_GIT_ENV, logger: context?.logger },
  );
  const [behindRaw, aheadRaw] = stdout.trim().split(/\s+/);
  const behind = Number.parseInt(behindRaw ?? "0", 10);
  const ahead = Number.parseInt(aheadRaw ?? "0", 10);
  if (Number.isNaN(behind) || Number.isNaN(ahead)) {
    return null;
  }
  return { ahead, behind };
}

async function getAheadOfOrigin(
  cwd: string,
  currentBranch: string,
  baseRef: string | null,
  context?: CheckoutContext,
): Promise<number | null> {
  if (!currentBranch) {
    return null;
  }
  const trackedOriginBranch = await getTrackedOriginBranch(cwd, currentBranch, context);
  const originBranch = trackedOriginBranch ?? currentBranch;
  try {
    const { stdout } = await runGitCommand(
      ["rev-list", "--count", `origin/${originBranch}..${currentBranch}`],
      { cwd, envOverlay: READ_ONLY_GIT_ENV, logger: context?.logger },
    );
    const count = Number.parseInt(stdout.trim(), 10);
    return Number.isNaN(count) ? null : count;
  } catch {
    if (trackedOriginBranch) {
      return null;
    }
    if (!baseRef || normalizeLocalBranchRefName(baseRef) === currentBranch) {
      return null;
    }
    try {
      const comparisonBaseRef = await resolveBestComparisonBaseRef(cwd, baseRef, context);
      const { stdout } = await runGitCommand(
        ["rev-list", "--count", `${comparisonBaseRef}..${currentBranch}`],
        { cwd, envOverlay: READ_ONLY_GIT_ENV, logger: context?.logger },
      );
      const count = Number.parseInt(stdout.trim(), 10);
      return Number.isNaN(count) ? null : count;
    } catch {
      return null;
    }
  }
}

async function getTrackedOriginBranch(
  cwd: string,
  currentBranch: string,
  context?: CheckoutContext,
): Promise<string | null> {
  if (context?.facts?.isGit && context.facts.currentBranch === currentBranch) {
    return context.facts.trackedOriginBranch;
  }
  const remoteName = await getGitConfigValue(cwd, `branch.${currentBranch}.remote`, context);
  if (remoteName !== "origin") {
    return null;
  }

  const mergeRef = await getGitConfigValue(cwd, `branch.${currentBranch}.merge`, context);
  return parseBranchMergeHeadRef(mergeRef);
}

async function getBehindOfOrigin(
  cwd: string,
  currentBranch: string,
  context?: CheckoutContext,
): Promise<number | null> {
  if (!currentBranch) {
    return null;
  }
  try {
    const { stdout } = await runGitCommand(
      ["rev-list", "--count", `${currentBranch}..origin/${currentBranch}`],
      { cwd, envOverlay: READ_ONLY_GIT_ENV, logger: context?.logger },
    );
    const count = Number.parseInt(stdout.trim(), 10);
    return Number.isNaN(count) ? null : count;
  } catch {
    return null;
  }
}

interface CheckoutInspectionContext {
  worktreeRoot: string;
  currentBranch: string | null;
  remoteUrl: string | null;
  absoluteGitDir: string | null;
  gitCommonDir: string | null;
  chisacodeWorktree: ChisaCodeWorktreeForCwd;
}

async function inspectCheckoutContext(
  cwd: string,
  context?: CheckoutContext,
): Promise<CheckoutInspectionContext | null> {
  try {
    const root = await getWorktreeRoot(cwd, context);
    if (!root) {
      return null;
    }

    const [currentBranch, remoteUrl, absoluteGitDir, gitCommonDir, chisacodeWorktree] =
      await Promise.all([
        getCurrentBranch(cwd),
        getOriginRemoteUrl(cwd),
        resolveAbsoluteGitDir(cwd),
        resolveGitCommonDir(cwd),
        getChisaCodeWorktreeForCwd(cwd, context, root),
      ]);

    return {
      worktreeRoot: root,
      currentBranch,
      remoteUrl,
      absoluteGitDir,
      gitCommonDir,
      chisacodeWorktree,
    };
  } catch (error) {
    if (isGitError(error)) {
      return null;
    }
    throw error;
  }
}

function buildPullRequestLookupTargetFromBranchConfig(input: {
  currentBranch: string;
  branchRemoteName: string | null;
  branchMergeRef: string | null;
  branchRemoteUrl: string | null;
}): PullRequestStatusLookupTarget {
  if (!isManagedPullRequestRemote(input.branchRemoteName)) {
    return { headRef: input.currentBranch };
  }

  const trackedHeadRef = parseBranchMergeHeadRef(input.branchMergeRef);
  if (!trackedHeadRef) {
    return { headRef: input.currentBranch };
  }

  const remoteRepo = input.branchRemoteUrl
    ? parseGitHubRepoFromRemote(input.branchRemoteUrl)
    : null;
  const headRepositoryOwner = remoteRepo?.split("/")[0];
  return {
    headRef: trackedHeadRef,
    ...(headRepositoryOwner ? { headRepositoryOwner } : {}),
  };
}

export async function getCheckoutSnapshotFacts(
  cwd: string,
  context?: CheckoutContext,
): Promise<CheckoutSnapshotFacts> {
  if (context?.facts) {
    return context.facts;
  }

  const inspected = await inspectCheckoutContext(cwd, context);
  if (!inspected) {
    return { isGit: false };
  }

  const storedBaseRef = inspected.chisacodeWorktree.isChisaCodeOwnedWorktree
    ? readChisaCodeWorktreeBaseRef(inspected.chisacodeWorktree.worktreeRoot)
    : null;
  const resolvedBaseRef = storedBaseRef ?? (await resolveBaseRef(cwd));
  const mainRepoRoot = await getMainRepoRootFromCommonDir(
    cwd,
    inspected.gitCommonDir,
    context,
  ).catch(() => null);
  let comparisonBaseRef: string | null = null;
  if (
    resolvedBaseRef &&
    inspected.currentBranch &&
    normalizeLocalBranchRefName(resolvedBaseRef) !== inspected.currentBranch
  ) {
    comparisonBaseRef = await resolveBestComparisonBaseRef(cwd, resolvedBaseRef, context).catch(
      () => null,
    );
  }

  let branchRemoteName: string | null = null;
  let branchMergeRef: string | null = null;
  let branchRemoteUrl: string | null = null;
  if (inspected.remoteUrl && inspected.currentBranch) {
    branchRemoteName = await getGitConfigValue(
      cwd,
      `branch.${inspected.currentBranch}.remote`,
      context,
    );
    if (branchRemoteName) {
      branchMergeRef = await getGitConfigValue(
        cwd,
        `branch.${inspected.currentBranch}.merge`,
        context,
      );
      if (isManagedPullRequestRemote(branchRemoteName)) {
        branchRemoteUrl = await getGitConfigValue(cwd, `remote.${branchRemoteName}.url`, context);
      }
    }
  }
  const trackedOriginBranch =
    branchRemoteName === "origin" ? parseBranchMergeHeadRef(branchMergeRef) : null;
  const pullRequestLookupTarget = inspected.currentBranch
    ? buildPullRequestLookupTargetFromBranchConfig({
        currentBranch: inspected.currentBranch,
        branchRemoteName,
        branchMergeRef,
        branchRemoteUrl,
      })
    : null;

  return {
    isGit: true,
    worktreeRoot: inspected.worktreeRoot,
    currentBranch: inspected.currentBranch,
    remoteUrl: inspected.remoteUrl,
    absoluteGitDir: inspected.absoluteGitDir,
    gitCommonDir: inspected.gitCommonDir,
    chisacodeWorktree: inspected.chisacodeWorktree,
    storedBaseRef,
    resolvedBaseRef,
    mainRepoRoot,
    comparisonBaseRef,
    branchRemoteName,
    branchMergeRef,
    trackedOriginBranch,
    pullRequestLookupTarget,
  };
}

export async function getCheckoutStatus(
  cwd: string,
  context?: CheckoutContext,
): Promise<CheckoutStatusResult> {
  const facts = await getCheckoutSnapshotFacts(cwd, context);
  if (!facts.isGit) {
    return { isGit: false };
  }

  const worktreeRoot = facts.worktreeRoot;
  const currentBranch = facts.currentBranch;
  const remoteUrl = facts.remoteUrl;
  const chisacodeWorktree = facts.chisacodeWorktree;
  const isDirty = await isWorkingTreeDirty(cwd, context);
  const hasRemote = remoteUrl !== null;
  const baseRef = facts.resolvedBaseRef;
  const mainRepoRoot = facts.mainRepoRoot;
  const factsContext = { ...context, facts };
  const [aheadBehind, aheadOfOrigin, behindOfOrigin] = await Promise.all([
    baseRef && currentBranch
      ? getAheadBehind(cwd, baseRef, currentBranch, factsContext)
      : Promise.resolve(null),
    hasRemote && currentBranch
      ? getAheadOfOrigin(cwd, currentBranch, baseRef, factsContext)
      : Promise.resolve(null),
    hasRemote && currentBranch
      ? getBehindOfOrigin(cwd, currentBranch, factsContext)
      : Promise.resolve(null),
  ]);

  if (chisacodeWorktree.isChisaCodeOwnedWorktree && baseRef) {
    return {
      isGit: true,
      repoRoot: worktreeRoot,
      mainRepoRoot: mainRepoRoot ?? worktreeRoot,
      currentBranch,
      isDirty,
      baseRef,
      aheadBehind,
      aheadOfOrigin,
      behindOfOrigin,
      hasRemote,
      remoteUrl,
      isChisaCodeOwnedWorktree: true,
    };
  }

  return {
    isGit: true,
    repoRoot: worktreeRoot,
    mainRepoRoot:
      mainRepoRoot && resolve(mainRepoRoot) !== resolve(worktreeRoot) ? mainRepoRoot : null,
    currentBranch,
    isDirty,
    baseRef,
    aheadBehind,
    aheadOfOrigin,
    behindOfOrigin,
    hasRemote,
    remoteUrl,
    isChisaCodeOwnedWorktree: false,
  };
}

const checkoutShortstatAuthority = createCheckoutShortstatAuthority<CheckoutContext>({
  getFacts: (context) => context?.facts,
  getResolvedBaseRefForCwd,
  getCurrentBranch,
  resolveBestComparisonBaseRef: (cwd, baseRef) => resolveBestComparisonBaseRef(cwd, baseRef),
  doesGitRefExist: (cwd, fullRef) => doesGitRefExist(cwd, fullRef),
});

/** Resets checkout shortstat cache state for isolated tests. */
export function __resetCheckoutShortstatCacheForTests(): void {
  checkoutShortstatAuthority.resetCacheForTests();
}

/** Overrides checkout shortstat cache TTL for isolated tests. */
export function __setCheckoutShortstatCacheTtlForTests(ttlMs: number): void {
  checkoutShortstatAuthority.setCacheTtlForTests(ttlMs);
}

/**
 * Reads cached or fresh aggregate line changes for a checkout.
 * @param cwd Repository working directory
 * @param context Optional cached checkout facts and logger
 * @param options Cache control options
 * @returns Aggregate additions/deletions, or null when there is no comparison
 */
export async function getCheckoutShortstat(
  cwd: string,
  context?: CheckoutContext,
  options?: CheckoutReadCacheOptions,
): Promise<CheckoutShortstat | null> {
  return checkoutShortstatAuthority.get(cwd, context, options);
}

/** Returns the current cached shortstat without starting Git work. */
export function getCachedCheckoutShortstat(cwd: string): CheckoutShortstat | null | undefined {
  return checkoutShortstatAuthority.getCached(cwd);
}

/** Starts a best-effort shortstat warmup when no cached or in-flight value exists. */
export function warmCheckoutShortstatInBackground(
  cwd: string,
  context?: CheckoutContext,
  onComplete?: () => void,
): void {
  checkoutShortstatAuthority.warm(cwd, context, onComplete);
}
const checkoutDiffReader = createCheckoutDiffReader<CheckoutContext>({
  resolveBaseRefForCwd,
  resolveBestComparisonBaseRef: (cwd, baseRef) => resolveBestComparisonBaseRef(cwd, baseRef),
});

/**
 * Reads a bounded textual or structured diff for a checkout.
 * @param cwd Repository working directory
 * @param compare Comparison mode and rendering options
 * @param context Optional cached checkout facts and logger
 * @returns The bounded checkout diff projection
 * @throws {NotGitRepoError} If the directory is not inside a Git repository
 */
export async function getCheckoutDiff(
  cwd: string,
  compare: CheckoutDiffCompare,
  context?: CheckoutContext,
): Promise<CheckoutDiffResult> {
  return checkoutDiffReader(cwd, compare, context);
}
export async function commitChanges(
  cwd: string,
  options: { message: string; addAll?: boolean },
): Promise<void> {
  await requireGitRepo(cwd);
  if (options.addAll ?? true) {
    await runGitCommand(["add", "-A"], { cwd, timeout: 120_000 });
  }
  await runGitCommand(["-c", "commit.gpgsign=false", "commit", "-m", options.message], {
    cwd,
    timeout: 120_000,
  });
}

export async function commitAll(cwd: string, message: string): Promise<void> {
  await commitChanges(cwd, { message, addAll: true });
}

const checkoutMergeAuthority = createCheckoutMergeAuthority<CheckoutContext>({
  getCurrentBranch,
  getWorktreeRoot: (cwd) => getWorktreeRoot(cwd),
  getWorktreePathForBranch,
  resolveBaseRefForCwd,
  normalizeLocalBranchRefName,
  resolveMostAheadBaseRef,
});

/**
 * Merges the current checkout branch into its configured base branch.
 * @param cwd Repository working directory
 * @param options Merge mode, base override, and optional squash message
 * @param context Optional cached checkout facts and ChisaCode home
 * @returns The checkout directory mutated by the merge
 * @throws {MergeConflictError} If the merge produces conflicts
 */
export async function mergeToBase(
  cwd: string,
  options: MergeToBaseOptions = {},
  context?: CheckoutContext,
): Promise<string> {
  return checkoutMergeAuthority.toBase(cwd, options, context);
}

/**
 * Merges the configured base branch into the current checkout branch.
 * @param cwd Repository working directory
 * @param options Base override and clean-target policy
 * @param context Optional cached checkout facts and ChisaCode home
 * @throws {MergeFromBaseConflictError} If the merge produces conflicts
 */
export async function mergeFromBase(
  cwd: string,
  options: MergeFromBaseOptions = {},
  context?: CheckoutContext,
): Promise<void> {
  return checkoutMergeAuthority.fromBase(cwd, options, context);
}
export async function pullCurrentBranch(cwd: string, github?: GitHubService): Promise<void> {
  await requireGitRepo(cwd);
  const currentBranch = await getCurrentBranch(cwd);
  if (!currentBranch || currentBranch === "HEAD") {
    throw new Error("Unable to determine current branch for pull");
  }
  const hasRemote = await hasOriginRemote(cwd);
  if (!hasRemote) {
    throw new Error("Remote 'origin' is not configured.");
  }
  try {
    await runGitCommand(["pull"], { cwd, timeout: 120_000 });
    github?.invalidate({ cwd });
  } catch (error) {
    await abortGitPullConflictState(cwd);
    throw error;
  }
}

export async function pushCurrentBranch(cwd: string, github?: GitHubService): Promise<void> {
  await requireGitRepo(cwd);
  const currentBranch = await getCurrentBranch(cwd);
  if (!currentBranch || currentBranch === "HEAD") {
    throw new Error("Unable to determine current branch for push");
  }
  const hasRemote = await hasOriginRemote(cwd);
  if (!hasRemote) {
    throw new Error("Remote 'origin' is not configured.");
  }
  await runGitCommand(["push", "-u", "origin", currentBranch], { cwd, timeout: 120_000 });
  github?.invalidate({ cwd });
}

export interface CreatePullRequestOptions {
  title: string;
  body?: string;
  base?: string;
  head?: string;
  draft?: boolean;
}

export async function createPullRequest(
  cwd: string,
  options: CreatePullRequestOptions,
  github: GitHubService = createGitHubService(),
  context?: CheckoutContext,
): Promise<{ url: string; number: number }> {
  await requireGitRepo(cwd);
  const repo = await resolveGitHubRepo(cwd);
  if (!repo) {
    throw new Error("Unable to determine GitHub repo from git remote");
  }

  const head = options.head ?? (await getCurrentBranch(cwd));
  const { storedBaseRef, resolvedBaseRef } = await resolveBaseRefForCwd(cwd, context);
  const base = options.base ?? resolvedBaseRef;
  if (!head) {
    throw new Error("Unable to determine head branch for PR");
  }
  if (!base) {
    throw new Error("Unable to determine base branch for PR");
  }
  const normalizedBase = normalizeLocalBranchRefName(base);
  if (storedBaseRef && options.base && options.base !== storedBaseRef) {
    throw new Error(`Base ref mismatch: expected ${storedBaseRef}, got ${options.base}`);
  }

  await runGitCommand(["push", "-u", "origin", head], { cwd, timeout: 120_000 });

  const result = await github.createPullRequest({
    cwd,
    repo,
    title: options.title,
    body: options.body,
    head,
    base: normalizedBase,
  });
  github.invalidate({ cwd });
  return result;
}

const checkoutPullRequestStatusAuthority =
  createCheckoutPullRequestStatusAuthority<CheckoutContext>({
    getFacts: (context) => context?.facts,
    getCurrentBranch,
    resolveLookupTarget: resolvePullRequestStatusLookupTarget,
  });

/** Resets pull request status cache state for isolated tests. */
export function __resetPullRequestStatusCacheForTests(): void {
  checkoutPullRequestStatusAuthority.resetCacheForTests();
}

/** Overrides pull request status cache TTL for isolated tests. */
export function __setPullRequestStatusCacheTtlForTests(ttlMs: number): void {
  checkoutPullRequestStatusAuthority.setCacheTtlForTests(ttlMs);
}

/**
 * Reads cached or fresh pull request status for a checkout.
 * @param cwd Repository working directory
 * @param github GitHub service used for status lookup
 * @param options Cache control and observability options
 * @param context Optional cached checkout facts and logger
 * @returns Pull request status and GitHub feature availability
 */
export async function getPullRequestStatus(
  cwd: string,
  github: GitHubService = createGitHubService(),
  options?: CheckoutReadCacheOptions,
  context?: CheckoutContext,
): Promise<PullRequestStatusResult> {
  return checkoutPullRequestStatusAuthority.get(cwd, github, options, context);
}
