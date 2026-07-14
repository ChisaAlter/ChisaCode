import { watch, type FSWatcher } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import type pino from "pino";
import type { ProjectCheckoutLitePayload } from "@chisacode/protocol/messages";
import type { CheckoutContext } from "../utils/checkout-git.js";
import {
  type CheckoutSnapshotFacts,
  type CheckoutDiffCompare,
  type CheckoutDiffResult,
  getCheckoutDiff,
  getCheckoutSnapshotFacts,
  getCheckoutShortstat,
  getCheckoutStatus,
  getPullRequestStatus,
  hasOriginRemote,
  listBranchSuggestions,
  resolveRepositoryDefaultBranch,
  resolveBranchCheckout,
  resolveAbsoluteGitDir,
} from "../utils/checkout-git.js";
import {
  createGitHubService,
  type GitHubPullRequestStatusFacts,
  type GitHubService,
  type PullRequestMergeable,
} from "../services/github-service.js";
import { runGitCommand } from "../utils/run-git-command.js";
import { resolveGitHubRemote, type GitHubRemoteIdentity } from "../utils/github-remote.js";
import { listChisaCodeWorktrees } from "../utils/worktree.js";
import {
  WorkspaceGitAuxiliaryReadAuthority,
  type WorkspaceGitBranchSuggestion,
  type WorkspaceGitBranchSuggestionsOptions,
  type WorkspaceGitBranchValidationResult,
  type WorkspaceGitReadOptions,
  type WorkspaceGitStashEntry,
  type WorkspaceGitStashListOptions,
  type WorkspaceGitWorktreeInfo,
} from "./workspace-git-auxiliary-read-authority.js";
import { WorkspaceGitHubPollBinding } from "./workspace-git-github-poll-binding.js";
import { WorkspaceGitRepositoryFetchAuthority } from "./workspace-git-repository-fetch-authority.js";
import { WorkspaceGitWorkingTreeObserver } from "./workspace-git-working-tree-observer.js";
import type { WorkspaceGitMetadata } from "./workspace-git-metadata.js";
import { checkoutLiteFromGitSnapshot, normalizeWorkspaceId } from "./workspace-registry-model.js";

const WORKSPACE_GIT_WATCH_DEBOUNCE_MS = 500;
export const WORKSPACE_GIT_SELF_HEAL_INTERVAL_MS = 60_000;

// Non-forced snapshot refresh triggers share this minimum gap to absorb watcher/self-heal bursts.
const WORKSPACE_GIT_INTERNAL_MIN_GAP_MS = 2_000;
const WORKSPACE_GIT_FACTS_REUSE_TTL_MS = 1_000;

export interface WorkspaceGitRuntimeSnapshot {
  cwd: string;
  git: {
    isGit: boolean;
    repoRoot: string | null;
    mainRepoRoot: string | null;
    currentBranch: string | null;
    remoteUrl: string | null;
    isChisaCodeOwnedWorktree: boolean;
    isDirty: boolean | null;
    baseRef: string | null;
    aheadBehind: { ahead: number; behind: number } | null;
    aheadOfOrigin: number | null;
    behindOfOrigin: number | null;
    hasRemote: boolean;
    diffStat: { additions: number; deletions: number } | null;
  };
  github: {
    featuresEnabled: boolean;
    pullRequest: {
      number?: number;
      repoOwner?: string;
      repoName?: string;
      url: string;
      title: string;
      state: string;
      baseRefName: string;
      headRefName: string;
      isMerged: boolean;
      isDraft?: boolean;
      mergeable?: PullRequestMergeable;
      checks?: Array<{
        name: string;
        status: "success" | "failure" | "pending" | "skipped" | "cancelled";
        url: string | null;
        workflow?: string;
        duration?: string;
      }>;
      checksStatus?: "none" | "pending" | "success" | "failure";
      reviewDecision?: "approved" | "changes_requested" | "pending" | null;
      github?: GitHubPullRequestStatusFacts;
    } | null;
    error: { message: string } | null;
  };
}

export interface WorkspaceGitService {
  registerWorkspace(
    params: { cwd: string },
    listener: WorkspaceGitListener,
  ): WorkspaceGitSubscription;

  onSnapshotUpdated(listener: WorkspaceGitSnapshotUpdatedListener): WorkspaceGitSubscription;
  peekSnapshot(cwd: string): WorkspaceGitRuntimeSnapshot | null;
  getCheckout(cwd: string): Promise<ProjectCheckoutLitePayload>;
  getSnapshot(
    cwd: string,
    options?: WorkspaceGitSnapshotOptions,
  ): Promise<WorkspaceGitRuntimeSnapshot>;
  getCheckoutDiff(
    cwd: string,
    options: CheckoutDiffCompare,
    readOptions?: WorkspaceGitReadOptions,
  ): Promise<CheckoutDiffResult>;
  validateBranchRef(
    cwd: string,
    ref: string,
    options?: WorkspaceGitReadOptions,
  ): Promise<WorkspaceGitBranchValidationResult>;
  hasLocalBranch(cwd: string, branch: string, options?: WorkspaceGitReadOptions): Promise<boolean>;
  suggestBranchesForCwd(
    cwd: string,
    options?: WorkspaceGitBranchSuggestionsOptions,
    readOptions?: WorkspaceGitReadOptions,
  ): Promise<WorkspaceGitBranchSuggestion[]>;
  listStashes(
    cwd: string,
    options?: WorkspaceGitStashListOptions,
    readOptions?: WorkspaceGitReadOptions,
  ): Promise<WorkspaceGitStashEntry[]>;
  listWorktrees(
    cwdOrRepoRoot: string,
    options?: WorkspaceGitReadOptions,
  ): Promise<WorkspaceGitWorktreeInfo[]>;
  getWorkspaceGitMetadata(
    cwd: string,
    options?: WorkspaceGitReadOptions & { directoryName?: string },
  ): Promise<WorkspaceGitMetadata>;
  resolveRepoRoot(cwd: string, options?: WorkspaceGitReadOptions): Promise<string>;
  resolveDefaultBranch(cwdOrRepoRoot: string, options?: WorkspaceGitReadOptions): Promise<string>;
  resolveRepoRemoteUrl(cwd: string, options?: WorkspaceGitReadOptions): Promise<string | null>;
  refresh(cwd: string, options?: { priority?: "normal" | "high" }): Promise<void>;
  requestWorkingTreeWatch(
    cwd: string,
    onChange: () => void,
  ): Promise<{ repoRoot: string | null; unsubscribe: () => void }>;
  scheduleRefreshForCwd(cwd: string): void;
  dispose(): void;
}

export type {
  WorkspaceGitBranchSuggestion,
  WorkspaceGitBranchSuggestionsOptions,
  WorkspaceGitBranchValidationResult,
  WorkspaceGitReadOptions,
  WorkspaceGitStashEntry,
  WorkspaceGitStashListOptions,
  WorkspaceGitWorktreeInfo,
} from "./workspace-git-auxiliary-read-authority.js";
export type WorkspaceGitListener = (snapshot: WorkspaceGitRuntimeSnapshot) => void;
export type WorkspaceGitSnapshotUpdatedListener = (snapshot: WorkspaceGitRuntimeSnapshot) => void;

export interface WorkspaceGitSubscription {
  unsubscribe: () => void;
}

export type WorkspaceGitSnapshotOptions =
  | {
      force?: false;
      includeGitHub?: boolean;
      reason?: string;
    }
  | {
      force: true;
      includeGitHub?: boolean;
      reason: string;
    };

interface WorkspaceGitRefreshRequest {
  force: boolean;
  includeGitHub: boolean;
  reason: string;
  notify: boolean;
}

interface QueuedWorkspaceGitRefresh {
  force: boolean;
  includeGitHub: boolean;
  reason: string;
  notify: boolean;
}

type WorkspaceGitRefreshState =
  | {
      status: "idle";
    }
  | {
      status: "in-flight";
      promise: Promise<WorkspaceGitRuntimeSnapshot>;
      force: boolean;
      includeGitHub: boolean;
      queued: QueuedWorkspaceGitRefresh | null;
    };

interface WorkspaceGitServiceDependencies {
  watch: typeof watch;
  readdir: typeof readdir;
  getCheckoutSnapshotFacts: typeof getCheckoutSnapshotFacts;
  getCheckoutStatus: typeof getCheckoutStatus;
  getCheckoutShortstat: typeof getCheckoutShortstat;
  getCheckoutDiff: typeof getCheckoutDiff;
  getPullRequestStatus: typeof getPullRequestStatus;
  resolveBranchCheckout: typeof resolveBranchCheckout;
  resolveRepositoryDefaultBranch: typeof resolveRepositoryDefaultBranch;
  listBranchSuggestions: typeof listBranchSuggestions;
  listChisaCodeWorktrees: typeof listChisaCodeWorktrees;
  github: GitHubService;
  resolveAbsoluteGitDir: (cwd: string) => Promise<string | null>;
  hasOriginRemote: (cwd: string) => Promise<boolean>;
  runGitFetch: (cwd: string) => Promise<void>;
  runGitCommand: typeof runGitCommand;
  now: () => Date;
}

interface WorkspaceGitServiceOptions {
  logger: pino.Logger;
  chisacodeHome: string;
  deps?: Partial<WorkspaceGitServiceDependencies>;
}

interface WorkspaceGitTarget {
  cwd: string;
  listeners: Set<WorkspaceGitListener>;
  watchers: FSWatcher[];
  debounceTimer: NodeJS.Timeout | null;
  selfHealTimer: NodeJS.Timeout | null;
  refreshState: WorkspaceGitRefreshState;
  latestGit: WorkspaceGitRuntimeSnapshot["git"] | null;
  latestGitLoadedAtMs: number | null;
  latestGithub: WorkspaceGitRuntimeSnapshot["github"] | null;
  latestGithubLoadedAtMs: number | null;
  latestSnapshot: WorkspaceGitRuntimeSnapshot | null;
  latestSnapshotLoadedAtMs: number | null;
  latestFacts: CheckoutSnapshotFacts | null;
  latestFactsLoadedAtMs: number | null;
  factsPromise: Promise<CheckoutSnapshotFacts> | null;
  latestFingerprint: string | null;
  lastShellOutAtMs: number | null;
  repoGitRoot: string | null;
  cachedGitHubRemote: { remoteUrl: string; identity: GitHubRemoteIdentity | null } | null;
  observationSetupPromise: Promise<void> | null;
  observationSetupComplete: boolean;
  closed: boolean;
}

function buildDefaultWorkspaceGitServiceDeps(logger: pino.Logger): WorkspaceGitServiceDependencies {
  return {
    watch,
    readdir,
    getCheckoutSnapshotFacts,
    getCheckoutStatus,
    getCheckoutShortstat,
    getCheckoutDiff,
    getPullRequestStatus,
    resolveBranchCheckout,
    resolveRepositoryDefaultBranch,
    listBranchSuggestions,
    listChisaCodeWorktrees,
    github: createGitHubService({ logger }),
    resolveAbsoluteGitDir,
    hasOriginRemote,
    runGitFetch,
    runGitCommand,
    now: () => new Date(),
  };
}

function resolveWorkspaceGitServiceDeps(
  deps: Partial<WorkspaceGitServiceDependencies> | undefined,
  logger: pino.Logger,
): WorkspaceGitServiceDependencies {
  return { ...buildDefaultWorkspaceGitServiceDeps(logger), ...deps };
}

export class WorkspaceGitServiceImpl implements WorkspaceGitService {
  private readonly logger: pino.Logger;
  private readonly chisacodeHome: string;
  private readonly deps: WorkspaceGitServiceDependencies;
  private readonly snapshotUpdatedListeners = new Set<WorkspaceGitSnapshotUpdatedListener>();
  private readonly workspaceTargets = new Map<string, WorkspaceGitTarget>();
  private readonly workingTreeObserver: WorkspaceGitWorkingTreeObserver;
  private readonly auxiliaryReadAuthority: WorkspaceGitAuxiliaryReadAuthority;
  private readonly githubPollBinding: WorkspaceGitHubPollBinding;
  private readonly repositoryFetchAuthority: WorkspaceGitRepositoryFetchAuthority;
  constructor(options: WorkspaceGitServiceOptions) {
    this.logger = options.logger.child({ module: "workspace-git-service" });
    this.chisacodeHome = options.chisacodeHome;
    this.deps = resolveWorkspaceGitServiceDeps(options.deps, this.logger);
    this.auxiliaryReadAuthority = new WorkspaceGitAuxiliaryReadAuthority({
      chisacodeHome: this.chisacodeHome,
      deps: {
        getCheckoutDiff: this.deps.getCheckoutDiff,
        resolveBranchCheckout: this.deps.resolveBranchCheckout,
        resolveRepositoryDefaultBranch: this.deps.resolveRepositoryDefaultBranch,
        listBranchSuggestions: this.deps.listBranchSuggestions,
        listChisaCodeWorktrees: this.deps.listChisaCodeWorktrees,
        runGitCommand: this.deps.runGitCommand,
        getSnapshot: (cwd, readOptions) => this.getSnapshot(cwd, readOptions),
        now: this.deps.now,
      },
    });
    this.repositoryFetchAuthority = new WorkspaceGitRepositoryFetchAuthority({
      logger: this.logger,
      deps: {
        runGitFetch: this.deps.runGitFetch,
        refreshWorkspace: async (cwd) => {
          const target = this.workspaceTargets.get(cwd);
          if (!target) {
            return;
          }
          await this.refreshWorkspaceTarget(target, {
            force: false,
            includeGitHub: false,
            reason: "repo-fetch",
            notify: true,
          });
        },
      },
    });
    this.githubPollBinding = new WorkspaceGitHubPollBinding({
      logger: this.logger,
      github: this.deps.github,
    });
    this.workingTreeObserver = new WorkspaceGitWorkingTreeObserver({
      logger: this.logger,
      deps: {
        watch: this.deps.watch,
        readdir: this.deps.readdir,
        resolveAbsoluteGitDir: this.deps.resolveAbsoluteGitDir,
        runGitCommand: this.deps.runGitCommand,
        now: this.deps.now,
      },
      scheduleRefreshForCwd: (cwd, refreshOptions) => {
        this.scheduleWorkspaceRefresh(cwd, refreshOptions);
      },
    });
  }

  registerWorkspace(
    params: { cwd: string },
    listener: WorkspaceGitListener,
  ): WorkspaceGitSubscription {
    const cwd = normalizeWorkspaceId(params.cwd);
    const target = this.ensureWorkspaceTarget(cwd);
    target.listeners.add(listener);
    if (target.listeners.size === 1) {
      this.startWorkspaceSubscriptionTimers(target);
    }
    if (!target.latestSnapshot) {
      this.scheduleInitialWorkspaceRefresh(target);
    }
    this.scheduleWorkspaceObservationSetup(target);

    return {
      unsubscribe: () => {
        this.removeWorkspaceListener(cwd, listener);
      },
    };
  }

  onSnapshotUpdated(listener: WorkspaceGitSnapshotUpdatedListener): WorkspaceGitSubscription {
    this.snapshotUpdatedListeners.add(listener);
    return {
      unsubscribe: () => {
        this.snapshotUpdatedListeners.delete(listener);
      },
    };
  }

  async getSnapshot(
    cwd: string,
    options?: WorkspaceGitSnapshotOptions,
  ): Promise<WorkspaceGitRuntimeSnapshot> {
    cwd = normalizeWorkspaceId(cwd);
    const request = this.normalizeRefreshRequest(options, "getSnapshot", true);
    const target = this.ensureWorkspaceTarget(cwd);
    if (!request.force && target.latestSnapshot) {
      return target.latestSnapshot;
    }

    return this.requestWorkspaceSnapshot(target, request);
  }

  async getCheckout(cwd: string): Promise<ProjectCheckoutLitePayload> {
    const normalizedCwd = normalizeWorkspaceId(cwd);
    try {
      const status = await this.deps.getCheckoutStatus(normalizedCwd, {
        chisacodeHome: this.chisacodeHome,
        logger: this.logger,
      });
      if (!status.isGit) {
        return checkoutLiteFromGitSnapshot(normalizedCwd, {
          isGit: false,
          currentBranch: null,
          remoteUrl: null,
          repoRoot: null,
          isChisaCodeOwnedWorktree: false,
          mainRepoRoot: null,
        });
      }
      return checkoutLiteFromGitSnapshot(normalizedCwd, {
        isGit: true,
        currentBranch: status.currentBranch,
        remoteUrl: status.remoteUrl,
        repoRoot: status.repoRoot,
        isChisaCodeOwnedWorktree: status.isChisaCodeOwnedWorktree,
        mainRepoRoot: status.mainRepoRoot,
      });
    } catch {
      return checkoutLiteFromGitSnapshot(normalizedCwd, {
        isGit: false,
        currentBranch: null,
        remoteUrl: null,
        repoRoot: null,
        isChisaCodeOwnedWorktree: false,
        mainRepoRoot: null,
      });
    }
  }

  peekSnapshot(cwd: string): WorkspaceGitRuntimeSnapshot | null {
    cwd = normalizeWorkspaceId(cwd);
    return this.workspaceTargets.get(cwd)?.latestSnapshot ?? null;
  }

  getCheckoutDiff(
    cwd: string,
    options: CheckoutDiffCompare,
    readOptions?: WorkspaceGitReadOptions,
  ): Promise<CheckoutDiffResult> {
    return this.auxiliaryReadAuthority.getCheckoutDiff(cwd, options, readOptions);
  }

  validateBranchRef(
    cwd: string,
    ref: string,
    options?: WorkspaceGitReadOptions,
  ): Promise<WorkspaceGitBranchValidationResult> {
    return this.auxiliaryReadAuthority.validateBranchRef(cwd, ref, options);
  }

  hasLocalBranch(cwd: string, branch: string, options?: WorkspaceGitReadOptions): Promise<boolean> {
    return this.auxiliaryReadAuthority.hasLocalBranch(cwd, branch, options);
  }

  suggestBranchesForCwd(
    cwd: string,
    options?: WorkspaceGitBranchSuggestionsOptions,
    readOptions?: WorkspaceGitReadOptions,
  ): Promise<WorkspaceGitBranchSuggestion[]> {
    return this.auxiliaryReadAuthority.suggestBranchesForCwd(cwd, options, readOptions);
  }

  listStashes(
    cwd: string,
    options?: WorkspaceGitStashListOptions,
    readOptions?: WorkspaceGitReadOptions,
  ): Promise<WorkspaceGitStashEntry[]> {
    return this.auxiliaryReadAuthority.listStashes(cwd, options, readOptions);
  }

  listWorktrees(
    cwdOrRepoRoot: string,
    options?: WorkspaceGitReadOptions,
  ): Promise<WorkspaceGitWorktreeInfo[]> {
    return this.auxiliaryReadAuthority.listWorktrees(cwdOrRepoRoot, options);
  }

  resolveRepoRoot(cwd: string, options?: WorkspaceGitReadOptions): Promise<string> {
    return this.auxiliaryReadAuthority.resolveRepoRoot(cwd, options);
  }

  resolveDefaultBranch(cwdOrRepoRoot: string, options?: WorkspaceGitReadOptions): Promise<string> {
    return this.auxiliaryReadAuthority.resolveDefaultBranch(cwdOrRepoRoot, options);
  }

  getWorkspaceGitMetadata(
    cwd: string,
    options?: WorkspaceGitReadOptions & { directoryName?: string },
  ): Promise<WorkspaceGitMetadata> {
    return this.auxiliaryReadAuthority.getWorkspaceGitMetadata(cwd, options);
  }

  resolveRepoRemoteUrl(cwd: string, options?: WorkspaceGitReadOptions): Promise<string | null> {
    return this.auxiliaryReadAuthority.resolveRepoRemoteUrl(cwd, options);
  }
  async refresh(cwd: string, _options?: { priority?: "normal" | "high" }): Promise<void> {
    cwd = normalizeWorkspaceId(cwd);
    const target = this.ensureWorkspaceTarget(cwd);
    await this.refreshWorkspaceTarget(target, {
      force: false,
      includeGitHub: false,
      reason: "refresh",
      notify: true,
    });
    this.scheduleWorkspaceObservationSetup(target);
  }

  requestWorkingTreeWatch(
    cwd: string,
    onChange: () => void,
  ): Promise<{ repoRoot: string | null; unsubscribe: () => void }> {
    return this.workingTreeObserver.requestWatch(cwd, onChange);
  }

  scheduleRefreshForCwd(cwd: string): void {
    cwd = normalizeWorkspaceId(cwd);
    const target = this.workspaceTargets.get(cwd);
    if (target) {
      this.scheduleWorkspaceRefresh(target);
    }
  }

  dispose(): void {
    for (const target of this.workspaceTargets.values()) {
      this.closeWorkspaceTarget(target);
    }
    this.workspaceTargets.clear();

    this.repositoryFetchAuthority.dispose();
    this.githubPollBinding.dispose();
    this.workingTreeObserver.dispose();
    this.snapshotUpdatedListeners.clear();
  }

  private ensureWorkspaceTarget(cwd: string): WorkspaceGitTarget {
    const existingTarget = this.workspaceTargets.get(cwd);
    if (existingTarget) {
      return existingTarget;
    }

    return this.createWorkspaceTarget(cwd);
  }

  private createWorkspaceTarget(cwd: string): WorkspaceGitTarget {
    const target: WorkspaceGitTarget = {
      cwd,
      listeners: new Set(),
      watchers: [],
      debounceTimer: null,
      selfHealTimer: null,
      refreshState: { status: "idle" },
      latestGit: null,
      latestGitLoadedAtMs: null,
      latestGithub: null,
      latestGithubLoadedAtMs: null,
      latestSnapshot: null,
      latestSnapshotLoadedAtMs: null,
      latestFacts: null,
      latestFactsLoadedAtMs: null,
      factsPromise: null,
      latestFingerprint: null,
      lastShellOutAtMs: null,
      repoGitRoot: null,
      cachedGitHubRemote: null,
      observationSetupPromise: null,
      observationSetupComplete: false,
      closed: false,
    };

    this.workspaceTargets.set(cwd, target);
    return target;
  }

  private scheduleInitialWorkspaceRefresh(target: WorkspaceGitTarget): void {
    queueMicrotask(() => {
      if (!this.isActiveObservedWorkspaceTarget(target) || target.latestSnapshot) {
        return;
      }
      void this.refreshWorkspaceTarget(target, {
        force: false,
        includeGitHub: true,
        reason: "initial",
        notify: true,
      });
    });
  }

  private scheduleWorkspaceObservationSetup(target: WorkspaceGitTarget): void {
    if (
      target.observationSetupComplete ||
      target.observationSetupPromise ||
      !this.isActiveObservedWorkspaceTarget(target)
    ) {
      return;
    }

    target.observationSetupPromise = Promise.resolve()
      .then(() => this.setupWorkspaceObservation(target))
      .catch((error) => {
        this.logger.warn(
          { err: error, cwd: target.cwd },
          "Failed to set up workspace git observation",
        );
      })
      .finally(() => {
        target.observationSetupPromise = null;
      });
  }

  private async setupWorkspaceObservation(target: WorkspaceGitTarget): Promise<void> {
    const facts = await this.getFactsForObservation(target);
    const gitDir = facts?.isGit ? facts.absoluteGitDir : null;
    if (!this.isActiveObservedWorkspaceTarget(target)) {
      return;
    }
    if (!gitDir) {
      target.observationSetupComplete = true;
      return;
    }

    const repoGitRoot =
      facts?.isGit && facts.gitCommonDir
        ? facts.gitCommonDir
        : await this.resolveWorkspaceGitRefsRoot(gitDir);
    if (!this.isActiveObservedWorkspaceTarget(target)) {
      return;
    }
    target.repoGitRoot = repoGitRoot;
    this.startWorkspaceWatchers(target, gitDir, repoGitRoot);
    await this.ensureRepoTarget(target);
    if (this.isActiveObservedWorkspaceTarget(target)) {
      target.observationSetupComplete = true;
    }
  }

  private async getFactsForObservation(
    target: WorkspaceGitTarget,
  ): Promise<CheckoutSnapshotFacts | null> {
    return this.loadCheckoutFacts(target, {
      chisacodeHome: this.chisacodeHome,
      logger: this.logger,
      allowRecent: true,
    });
  }

  private loadCheckoutFacts(
    target: WorkspaceGitTarget,
    options: CheckoutContext & { allowRecent: boolean },
  ): Promise<CheckoutSnapshotFacts> {
    if (options.allowRecent && target.latestFacts && target.latestFactsLoadedAtMs !== null) {
      const ageMs = this.deps.now().getTime() - target.latestFactsLoadedAtMs;
      if (ageMs < WORKSPACE_GIT_FACTS_REUSE_TTL_MS) {
        return Promise.resolve(target.latestFacts);
      }
    }

    if (target.factsPromise) {
      return target.factsPromise;
    }

    const { allowRecent: _allowRecent, ...context } = options;
    const promise = this.deps
      .getCheckoutSnapshotFacts(target.cwd, context)
      .then((facts) => {
        target.latestFacts = facts;
        target.latestFactsLoadedAtMs = this.deps.now().getTime();
        return facts;
      })
      .finally(() => {
        if (target.factsPromise === promise) {
          target.factsPromise = null;
        }
      });
    target.factsPromise = promise;
    return promise;
  }

  private isActiveObservedWorkspaceTarget(target: WorkspaceGitTarget): boolean {
    return (
      !target.closed &&
      target.listeners.size > 0 &&
      this.workspaceTargets.get(target.cwd) === target
    );
  }

  private async resolveWorkspaceGitRefsRoot(gitDir: string): Promise<string> {
    try {
      const commonDir = (await readFile(join(gitDir, "commondir"), "utf8")).trim();
      if (commonDir.length > 0) {
        return resolve(gitDir, commonDir);
      }
    } catch {
      return gitDir;
    }

    return gitDir;
  }

  private startWorkspaceWatchers(
    target: WorkspaceGitTarget,
    gitDir: string,
    repoGitRoot: string,
  ): void {
    for (const watchPath of new Set([join(gitDir, "HEAD"), join(repoGitRoot, "refs", "heads")])) {
      let watcher: FSWatcher | null = null;
      try {
        watcher = this.deps.watch(watchPath, { recursive: false }, () => {
          this.scheduleWorkspaceRefresh(target);
        });
      } catch (error) {
        this.logger.warn(
          { err: error, cwd: target.cwd, watchPath },
          "Failed to start workspace git watcher",
        );
      }

      if (!watcher) {
        continue;
      }

      watcher.on("error", (error) => {
        this.logger.warn({ err: error, cwd: target.cwd, watchPath }, "Workspace git watcher error");
      });
      target.watchers.push(watcher);
    }
  }

  private async ensureRepoTarget(workspaceTarget: WorkspaceGitTarget): Promise<void> {
    const repoGitRoot = workspaceTarget.repoGitRoot;
    if (!repoGitRoot || !this.isActiveObservedWorkspaceTarget(workspaceTarget)) {
      return;
    }

    const facts = workspaceTarget.latestFacts;
    const hasOrigin =
      facts?.isGit === true
        ? facts.remoteUrl !== null
        : await this.deps.hasOriginRemote(workspaceTarget.cwd);
    if (!this.isActiveObservedWorkspaceTarget(workspaceTarget) || !hasOrigin) {
      return;
    }

    this.repositoryFetchAuthority.attachWorkspace({
      repoGitRoot,
      cwd: workspaceTarget.cwd,
    });
  }
  private scheduleWorkspaceRefresh(
    targetOrCwd: WorkspaceGitTarget | string,
    options?: { force?: boolean; reason?: string },
  ): void {
    const target =
      typeof targetOrCwd === "string"
        ? this.workspaceTargets.get(normalizeWorkspaceId(targetOrCwd))
        : targetOrCwd;
    if (!target || target.closed || this.workspaceTargets.get(target.cwd) !== target) {
      return;
    }

    if (target.debounceTimer) {
      clearTimeout(target.debounceTimer);
    }

    target.debounceTimer = setTimeout(() => {
      if (target.closed || this.workspaceTargets.get(target.cwd) !== target) {
        return;
      }
      target.debounceTimer = null;
      void this.refreshWorkspaceTarget(target, {
        force: options?.force === true,
        includeGitHub: false,
        reason: options?.reason ?? "watch",
        notify: true,
      });
    }, WORKSPACE_GIT_WATCH_DEBOUNCE_MS);
  }

  private startWorkspaceSubscriptionTimers(target: WorkspaceGitTarget): void {
    if (!target.selfHealTimer) {
      target.selfHealTimer = setInterval(() => {
        this.scheduleWorkspaceObservationSetup(target);
        this.refreshWorkspaceTarget(target, {
          force: false,
          includeGitHub: false,
          reason: "self-heal-git",
          notify: true,
        }).catch((error) => {
          this.logger.warn(
            { err: error, cwd: target.cwd, reason: "self-heal-git" },
            "Failed to run workspace git self-heal refresh",
          );
        });
      }, WORKSPACE_GIT_SELF_HEAL_INTERVAL_MS);
    }

    this.updateGitHubPollForTarget(target);
  }

  private updateGitHubPollForTarget(target: WorkspaceGitTarget): void {
    const git = target.latestGit;
    const headRef = target.listeners.size > 0 ? (git?.currentBranch ?? null) : null;
    const hasGitHubRemote =
      git !== null &&
      target.cachedGitHubRemote?.remoteUrl === git.remoteUrl &&
      target.cachedGitHubRemote.identity !== null;
    const remoteUrl = hasGitHubRemote ? git.remoteUrl : null;

    this.githubPollBinding.sync({
      cwd: target.cwd,
      remoteUrl,
      headRef,
      onStatus: (status) => {
        if (!this.isActiveObservedWorkspaceTarget(target)) {
          return;
        }
        this.rememberGitHubSnapshot(target, buildGitHubSnapshotFromStatus(status), {
          notify: true,
        });
      },
      onError: (error) => {
        this.logger.warn(
          { err: error, cwd: target.cwd, headRef, reason: "self-heal-github" },
          "Failed to run GitHub self-heal refresh",
        );
      },
    });
  }
  private async refreshWorkspaceTarget(
    target: WorkspaceGitTarget,
    request: WorkspaceGitRefreshRequest,
  ): Promise<void> {
    if (target.closed || this.workspaceTargets.get(target.cwd) !== target) {
      return;
    }
    try {
      await this.requestWorkspaceSnapshot(target, request);
    } catch (error) {
      this.logger.warn(
        { err: error, cwd: target.cwd, reason: request.reason },
        "Failed to refresh workspace git snapshot",
      );
    }
  }

  private requestWorkspaceSnapshot(
    target: WorkspaceGitTarget,
    request: WorkspaceGitRefreshRequest,
  ): Promise<WorkspaceGitRuntimeSnapshot> {
    if (target.refreshState.status === "in-flight") {
      const needsForcedRefresh = request.force && !target.refreshState.force;
      const needsGitHubRefresh =
        request.force && request.includeGitHub && !target.refreshState.includeGitHub;
      if (needsForcedRefresh || needsGitHubRefresh) {
        target.refreshState.queued = this.mergeQueuedRefresh(target.refreshState.queued, request);
      }
      return target.refreshState.promise;
    }

    if (!request.force && this.shouldThrottleNonForcedRefresh(target)) {
      return Promise.resolve(target.latestSnapshot);
    }

    const promise = this.runWorkspaceRefreshLoop(target, request).finally(() => {
      const state = target.refreshState;
      if (state.status === "in-flight" && state.promise === promise) {
        target.refreshState = { status: "idle" };
      }
    });
    target.refreshState = {
      status: "in-flight",
      promise,
      force: request.force,
      includeGitHub: request.includeGitHub,
      queued: null,
    };

    return promise;
  }

  private normalizeRefreshRequest(
    options: WorkspaceGitSnapshotOptions | undefined,
    defaultReason: string,
    notify: boolean,
  ): WorkspaceGitRefreshRequest {
    if (options?.force && !options.reason) {
      throw new Error("WorkspaceGitService.getSnapshot force refresh requires a reason");
    }

    const force = options?.force === true;
    return {
      force,
      includeGitHub: options?.includeGitHub ?? true,
      reason: options?.reason ?? defaultReason,
      notify,
    };
  }

  private async resolveGitHubRemoteForTarget(
    target: WorkspaceGitTarget,
    remoteUrl: string | null,
  ): Promise<GitHubRemoteIdentity | null> {
    if (!remoteUrl) {
      target.cachedGitHubRemote = null;
      return null;
    }
    if (target.cachedGitHubRemote?.remoteUrl === remoteUrl) {
      return target.cachedGitHubRemote.identity;
    }
    const identity = await resolveGitHubRemote({ remoteUrl });
    target.cachedGitHubRemote = { remoteUrl, identity };
    return identity;
  }

  private shouldThrottleNonForcedRefresh(
    target: WorkspaceGitTarget,
  ): target is WorkspaceGitTarget & {
    latestSnapshot: WorkspaceGitRuntimeSnapshot;
  } {
    if (!target.latestSnapshot || target.lastShellOutAtMs === null) {
      return false;
    }

    return this.deps.now().getTime() - target.lastShellOutAtMs < WORKSPACE_GIT_INTERNAL_MIN_GAP_MS;
  }

  private mergeQueuedRefresh(
    queued: QueuedWorkspaceGitRefresh | null,
    request: WorkspaceGitRefreshRequest,
  ): QueuedWorkspaceGitRefresh {
    if (!queued) {
      return {
        force: request.force,
        includeGitHub: request.includeGitHub,
        reason: request.reason,
        notify: request.notify,
      };
    }

    const force = queued.force || request.force;
    const upgradesForce = request.force && !queued.force;
    const upgradesGitHub = request.includeGitHub && !queued.includeGitHub;
    return {
      force,
      includeGitHub: queued.includeGitHub || request.includeGitHub,
      reason: upgradesForce || upgradesGitHub ? request.reason : queued.reason,
      notify: queued.notify || request.notify,
    };
  }

  private async runWorkspaceRefreshLoop(
    target: WorkspaceGitTarget,
    initialRequest: WorkspaceGitRefreshRequest,
  ): Promise<WorkspaceGitRuntimeSnapshot> {
    let request = initialRequest;
    let snapshot!: WorkspaceGitRuntimeSnapshot;

    while (true) {
      snapshot = await this.refreshSnapshot(target, request);
      this.rememberSnapshot(target, snapshot, {
        notify: request.notify,
        forceEmit: request.force,
      });

      const state = target.refreshState;
      if (state.status !== "in-flight" || !state.queued) {
        break;
      }

      request = state.queued;
      state.queued = null;
      state.force = request.force;
      state.includeGitHub = request.includeGitHub;
    }

    return snapshot;
  }

  private async refreshSnapshot(
    target: WorkspaceGitTarget,
    request: WorkspaceGitRefreshRequest,
  ): Promise<WorkspaceGitRuntimeSnapshot> {
    const facts = await this.refreshGitSnapshot(target, request);
    if (request.includeGitHub) {
      await this.refreshGitHubSnapshot(target, request, facts);
    }

    const snapshot = this.combineSnapshot(target);
    target.latestSnapshotLoadedAtMs = this.deps.now().getTime();
    return snapshot;
  }

  private async refreshGitSnapshot(
    target: WorkspaceGitTarget,
    request: WorkspaceGitRefreshRequest,
  ): Promise<CheckoutSnapshotFacts> {
    const now = this.deps.now();
    target.lastShellOutAtMs = now.getTime();

    const cwd = target.cwd;
    const previousGitHubPollKey = this.getGitHubPollKey(target);
    const baseContext: CheckoutContext = { chisacodeHome: this.chisacodeHome, logger: this.logger };
    const facts = await this.loadCheckoutFacts(target, {
      ...baseContext,
      allowRecent: !request.force,
    });
    const context: CheckoutContext = { ...baseContext, facts };
    const checkoutStatus = await this.deps.getCheckoutStatus(cwd, context);
    if (!checkoutStatus.isGit) {
      target.latestGit = buildNotGitSnapshot(cwd).git;
      target.latestGitLoadedAtMs = this.deps.now().getTime();
      target.cachedGitHubRemote = null;
      target.latestGithub = buildGitHubUnavailableSnapshot();
      target.latestGithubLoadedAtMs = target.latestGitLoadedAtMs;
      return facts;
    }

    await this.resolveGitHubRemoteForTarget(target, checkoutStatus.remoteUrl);
    const diffStat = await this.deps
      .getCheckoutShortstat(cwd, context, { force: request.force })
      .catch(() => null);

    target.latestGit = {
      isGit: true,
      repoRoot: checkoutStatus.repoRoot,
      mainRepoRoot: checkoutStatus.mainRepoRoot,
      currentBranch: checkoutStatus.currentBranch,
      remoteUrl: checkoutStatus.remoteUrl,
      isChisaCodeOwnedWorktree: checkoutStatus.isChisaCodeOwnedWorktree,
      isDirty: checkoutStatus.isDirty,
      baseRef: checkoutStatus.baseRef,
      aheadBehind: checkoutStatus.aheadBehind,
      aheadOfOrigin: checkoutStatus.aheadOfOrigin,
      behindOfOrigin: checkoutStatus.behindOfOrigin,
      hasRemote: checkoutStatus.hasRemote,
      diffStat,
    };
    target.latestGitLoadedAtMs = this.deps.now().getTime();

    if (previousGitHubPollKey !== this.getGitHubPollKey(target)) {
      target.latestGithub = buildGitHubUnavailableSnapshot();
      target.latestGithubLoadedAtMs = target.latestGitLoadedAtMs;
    }
    return facts;
  }

  private async refreshGitHubSnapshot(
    target: WorkspaceGitTarget,
    request: WorkspaceGitRefreshRequest,
    facts: CheckoutSnapshotFacts,
  ): Promise<void> {
    const githubRemote = target.cachedGitHubRemote?.identity ?? null;
    const forceGitHub = request.force && request.includeGitHub;
    if (forceGitHub) {
      this.deps.github.invalidate({ cwd: target.cwd });
    }

    target.latestGithub = await loadGitHubSnapshot({
      cwd: target.cwd,
      githubRemote,
      now: this.deps.now(),
      deps: this.deps,
      force: forceGitHub,
      reason: request.reason,
      facts,
    });
    target.latestGithubLoadedAtMs = this.deps.now().getTime();
  }

  private combineSnapshot(target: WorkspaceGitTarget): WorkspaceGitRuntimeSnapshot {
    if (!target.latestGit) {
      return target.latestSnapshot ?? buildNotGitSnapshot(target.cwd);
    }

    return {
      cwd: target.cwd,
      git: target.latestGit,
      github: target.latestGithub ?? buildGitHubUnavailableSnapshot(),
    };
  }

  private getGitHubPollKey(target: WorkspaceGitTarget): string | null {
    const git = target.latestGit;
    if (!git?.currentBranch || !git.remoteUrl) {
      return null;
    }

    const githubRemote = target.cachedGitHubRemote;
    if (!githubRemote || githubRemote.remoteUrl !== git.remoteUrl || !githubRemote.identity) {
      return null;
    }

    return JSON.stringify([git.remoteUrl, git.currentBranch]);
  }

  private rememberGitHubSnapshot(
    target: WorkspaceGitTarget,
    github: WorkspaceGitRuntimeSnapshot["github"],
    options?: { notify?: boolean },
  ): void {
    if (target.closed || this.workspaceTargets.get(target.cwd) !== target) {
      return;
    }

    target.latestGithub = github;
    target.latestGithubLoadedAtMs = this.deps.now().getTime();
    this.rememberSnapshot(target, this.combineSnapshot(target), {
      notify: options?.notify,
      forceEmit: false,
    });
  }

  private rememberSnapshot(
    target: WorkspaceGitTarget,
    snapshot: WorkspaceGitRuntimeSnapshot,
    options?: { forceEmit?: boolean; notify?: boolean },
  ): void {
    target.latestSnapshot = snapshot;
    if (target.listeners.size > 0) {
      this.updateGitHubPollForTarget(target);
    }
    const fingerprint = JSON.stringify(snapshot);
    const fingerprintMatches = target.latestFingerprint === fingerprint;
    if (fingerprintMatches && !options?.forceEmit) {
      return;
    }
    target.latestFingerprint = fingerprint;
    if (!options?.notify || target.listeners.size === 0) {
      return;
    }
    for (const listener of target.listeners) {
      try {
        listener(snapshot);
      } catch (error) {
        this.logger.warn({ err: error, cwd: snapshot.cwd }, "Workspace git listener threw");
      }
    }
    for (const listener of this.snapshotUpdatedListeners) {
      try {
        listener(snapshot);
      } catch (error) {
        this.logger.warn(
          { err: error, cwd: snapshot.cwd },
          "Workspace git snapshot listener threw",
        );
      }
    }
  }

  private removeWorkspaceListener(cwd: string, listener: WorkspaceGitListener): void {
    const target = this.workspaceTargets.get(cwd);
    if (!target) {
      return;
    }

    target.listeners.delete(listener);
    if (target.listeners.size > 0) {
      return;
    }

    this.removeWorkspaceTarget(target);
  }

  private removeWorkspaceTarget(target: WorkspaceGitTarget): void {
    if (target.repoGitRoot) {
      this.repositoryFetchAuthority.detachWorkspace(target.repoGitRoot, target.cwd);
    }

    this.closeWorkspaceTarget(target);
    this.workspaceTargets.delete(target.cwd);
  }

  private closeWorkspaceTarget(target: WorkspaceGitTarget): void {
    target.closed = true;
    if (target.debounceTimer) {
      clearTimeout(target.debounceTimer);
      target.debounceTimer = null;
    }
    if (target.selfHealTimer) {
      clearInterval(target.selfHealTimer);
      target.selfHealTimer = null;
    }
    this.githubPollBinding.remove(target.cwd);

    for (const watcher of target.watchers) {
      watcher.close();
    }
    target.watchers = [];
    target.listeners.clear();
  }
}

async function loadGitHubSnapshot(options: {
  cwd: string;
  githubRemote: GitHubRemoteIdentity | null;
  now: Date;
  deps: Pick<WorkspaceGitServiceDependencies, "getPullRequestStatus" | "github">;
  force?: boolean;
  reason?: string;
  facts?: CheckoutSnapshotFacts;
}): Promise<WorkspaceGitRuntimeSnapshot["github"]> {
  if (!options.githubRemote) {
    return {
      featuresEnabled: false,
      pullRequest: null,
      error: null,
    };
  }

  try {
    await options.deps.github.isAuthenticated({ cwd: options.cwd });
  } catch {
    return {
      featuresEnabled: false,
      pullRequest: null,
      error: null,
    };
  }

  try {
    const result = await options.deps.getPullRequestStatus(
      options.cwd,
      options.deps.github,
      {
        force: options.force,
        reason: options.reason,
      },
      { facts: options.facts },
    );
    return {
      featuresEnabled: true,
      pullRequest: result.status,
      error: null,
    };
  } catch (error) {
    return {
      featuresEnabled: true,
      pullRequest: null,
      error: {
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

function buildNotGitSnapshot(cwd: string): WorkspaceGitRuntimeSnapshot {
  return {
    cwd,
    git: {
      isGit: false,
      repoRoot: null,
      mainRepoRoot: null,
      currentBranch: null,
      remoteUrl: null,
      isChisaCodeOwnedWorktree: false,
      isDirty: null,
      baseRef: null,
      aheadBehind: null,
      aheadOfOrigin: null,
      behindOfOrigin: null,
      hasRemote: false,
      diffStat: null,
    },
    github: buildGitHubUnavailableSnapshot(),
  };
}

function buildGitHubUnavailableSnapshot(): WorkspaceGitRuntimeSnapshot["github"] {
  return {
    featuresEnabled: false,
    pullRequest: null,
    error: null,
  };
}

function buildGitHubSnapshotFromStatus(
  status: WorkspaceGitRuntimeSnapshot["github"]["pullRequest"],
): WorkspaceGitRuntimeSnapshot["github"] {
  return {
    featuresEnabled: true,
    pullRequest: status,
    error: null,
  };
}

async function runGitFetch(cwd: string): Promise<void> {
  await runGitCommand(["fetch", "origin", "--prune"], {
    cwd,
    envOverlay: { GIT_TERMINAL_PROMPT: "0" },
    timeout: 120_000,
  });
}
