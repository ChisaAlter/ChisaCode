import { z } from "zod/v3";
import type pino from "pino";

import { findExecutable } from "../utils/executable.js";
import { resolveGitHubRemote } from "../utils/github-remote.js";
import { runGitCommand } from "../utils/run-git-command.js";
import { execCommand } from "../utils/spawn.js";
import { GitHubCurrentPullRequestPoller } from "./github-current-pr-poller.js";
import {
  computePullRequestChecksStatus,
  parseStatusCheckRollup,
  type PullRequestCheck,
  type PullRequestChecksStatus,
} from "./github-pr-checks.js";
import {
  loadGitHubPullRequestTimeline,
  type GitHubPullRequestTimeline,
  type GitHubPullRequestTimelineFailure,
} from "./github-pr-timeline.js";
import {
  searchGitHubIssuesAndPrs,
  type GitHubReadOptions,
  type GitHubSearchResult,
  type SearchGitHubIssuesAndPrsOptions,
} from "./github-search.js";

export type {
  GitHubReadOptions,
  GitHubSearchResult,
  SearchGitHubIssuesAndPrsOptions,
} from "./github-search.js";
export { parseStatusCheckRollup } from "./github-pr-checks.js";
export type {
  PullRequestCheck,
  PullRequestChecksStatus,
  PullRequestCheckStatus,
} from "./github-pr-checks.js";
export type {
  GitHubPullRequestTimeline,
  GitHubPullRequestTimelineError,
  GitHubPullRequestTimelineErrorKind,
  PullRequestTimelineItem,
  PullRequestTimelineReviewState,
} from "./github-pr-timeline.js";

const DEFAULT_GITHUB_CACHE_TTL_MS = 30_000;
export const GITHUB_POLL_FAST_INTERVAL_MS = 20_000;
export const GITHUB_POLL_SLOW_INTERVAL_MS = 120_000;
export const GITHUB_POLL_ERROR_BACKOFF_CAP_MS = 300_000;
const GITHUB_ENV = {
  GIT_TERMINAL_PROMPT: "0",
} as const;

const LabelSchema = z.object({
  name: z.string().optional(),
});

const GitHubIssueSummarySchema = z.object({
  number: z.number(),
  title: z.string().catch(""),
  url: z.string().catch(""),
  state: z.string().catch(""),
  body: z.string().nullable().catch(null),
  labels: z.array(LabelSchema).catch([]),
  updatedAt: z.string().catch(""),
});

const GitHubPullRequestSummarySchema = z.object({
  number: z.number(),
  title: z.string().catch(""),
  url: z.string().catch(""),
  state: z.string().catch(""),
  body: z.string().nullable().catch(null),
  baseRefName: z.string().catch(""),
  headRefName: z.string().catch(""),
  labels: z.array(LabelSchema).catch([]),
  updatedAt: z.string().catch(""),
});

const PullRequestReviewDecisionSchema = z
  .enum(["APPROVED", "CHANGES_REQUESTED", "REVIEW_REQUIRED"])
  .nullable()
  .catch(null);

const HeadRepositoryOwnerSchema = z
  .object({
    login: z.string().optional(),
  })
  .nullable()
  .optional();

const PullRequestMergeableSchema = z.enum(["MERGEABLE", "CONFLICTING", "UNKNOWN"]).catch("UNKNOWN");

const GitHubAutoMergeRequestSchema = z
  .object({
    enabledAt: z.string().nullable().optional().catch(null),
    mergeMethod: z.string().nullable().optional().catch(null),
    enabledBy: z
      .object({
        login: z.string().nullable().optional().catch(null),
      })
      .nullable()
      .optional()
      .catch(null),
  })
  .nullable()
  .optional()
  .catch(null);

const GitHubPullRequestFactsGraphqlSchema = z.object({
  data: z.object({
    repository: z
      .object({
        autoMergeAllowed: z.boolean().optional().catch(false),
        mergeCommitAllowed: z.boolean().optional().catch(false),
        squashMergeAllowed: z.boolean().optional().catch(false),
        rebaseMergeAllowed: z.boolean().optional().catch(false),
        viewerDefaultMergeMethod: z.string().nullable().optional().catch(null),
        pullRequest: z
          .object({
            mergeStateStatus: z.string().nullable().optional().catch(null),
            autoMergeRequest: GitHubAutoMergeRequestSchema,
            viewerCanEnableAutoMerge: z.boolean().optional().catch(false),
            viewerCanDisableAutoMerge: z.boolean().optional().catch(false),
            viewerCanMergeAsAdmin: z.boolean().optional().catch(false),
            viewerCanUpdateBranch: z.boolean().optional().catch(false),
            isMergeQueueEnabled: z.boolean().optional().catch(false),
            isInMergeQueue: z.boolean().optional().catch(false),
          })
          .nullable()
          .optional()
          .catch(null),
      })
      .nullable()
      .optional()
      .catch(null),
  }),
});

const CurrentPullRequestStatusSchema = z.object({
  number: z.number().optional(),
  url: z.string().catch(""),
  title: z.string().catch(""),
  state: z.string().catch(""),
  isDraft: z.boolean().optional().catch(false),
  baseRefName: z.string().catch(""),
  headRefName: z.string().catch(""),
  mergedAt: z.string().nullable().optional(),
  statusCheckRollup: z.unknown().optional(),
  reviewDecision: z.unknown().optional(),
  mergeable: PullRequestMergeableSchema.optional().default("UNKNOWN"),
  headRepositoryOwner: HeadRepositoryOwnerSchema,
});

const GitHubRepoViewSchema = z.object({
  owner: z
    .object({
      login: z.string().optional(),
    })
    .nullable()
    .optional(),
  name: z.string().optional(),
  parent: z
    .object({
      owner: z
        .object({
          login: z.string().optional(),
        })
        .nullable()
        .optional(),
      name: z.string().optional(),
    })
    .nullable()
    .optional(),
});

const PullRequestCheckoutTargetSchema = z.object({
  data: z.object({
    repository: z.object({
      pullRequest: z
        .object({
          number: z.number(),
          baseRefName: z.string().catch(""),
          headRefName: z.string().catch(""),
          isCrossRepository: z.boolean().catch(false),
          headRepositoryOwner: z
            .object({
              login: z.string().catch(""),
            })
            .nullable()
            .optional(),
          headRepository: z
            .object({
              sshUrl: z.string().nullable().optional(),
              url: z.string().nullable().optional(),
            })
            .nullable()
            .optional(),
        })
        .nullable(),
    }),
  }),
});

const PULL_REQUEST_CHECKOUT_TARGET_QUERY = `
query PullRequestCheckoutTarget($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      number
      baseRefName
      headRefName
      isCrossRepository
      headRepositoryOwner {
        login
      }
      headRepository {
        sshUrl
        url
      }
    }
  }
}`;

const CURRENT_PR_STATUS_BASE_FIELDS =
  "number,url,title,state,isDraft,baseRefName,headRefName,mergedAt,reviewDecision,mergeable,headRepositoryOwner";
const CURRENT_PR_STATUS_FIELDS = `${CURRENT_PR_STATUS_BASE_FIELDS},statusCheckRollup`;

const PULL_REQUEST_STATUS_FACTS_QUERY = `
query PullRequestStatusFacts($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    autoMergeAllowed
    mergeCommitAllowed
    squashMergeAllowed
    rebaseMergeAllowed
    viewerDefaultMergeMethod
    pullRequest(number: $number) {
      mergeStateStatus
      autoMergeRequest {
        enabledAt
        mergeMethod
        enabledBy {
          login
        }
      }
      viewerCanEnableAutoMerge
      viewerCanDisableAutoMerge
      viewerCanMergeAsAdmin
      viewerCanUpdateBranch
      isMergeQueueEnabled
      isInMergeQueue
    }
  }
}`;

interface CacheEntry {
  value: unknown;
  expiresAt: number;
  cwd: string;
}

interface GitHubServiceDependencies {
  runner: GitHubCommandRunner;
  resolveGhPath: () => Promise<string | null>;
  now: () => number;
}

export interface GitHubCommandRunnerOptions {
  cwd: string;
  envOverlay?: Record<string, string>;
}

export interface GitHubCommandResult {
  stdout: string;
  stderr: string;
}

export type GitHubCommandRunner = (
  args: string[],
  options: GitHubCommandRunnerOptions,
) => Promise<GitHubCommandResult>;

export interface GitHubPullRequestSummary {
  number: number;
  title: string;
  url: string;
  state: string;
  body: string | null;
  baseRefName: string;
  headRefName: string;
  labels: string[];
  updatedAt: string;
}

export interface GitHubPullRequestCheckoutTarget {
  number: number;
  baseRefName: string;
  headRefName: string;
  headOwnerLogin: string | null;
  headRepositorySshUrl: string | null;
  headRepositoryUrl: string | null;
  isCrossRepository: boolean;
}

export interface GitHubIssueSummary {
  number: number;
  title: string;
  url: string;
  state: string;
  body: string | null;
  labels: string[];
  updatedAt: string;
}

export type PullRequestReviewDecision = "approved" | "changes_requested" | "pending" | null;
export type PullRequestMergeable = "MERGEABLE" | "CONFLICTING" | "UNKNOWN";

export interface GitHubPullRequestStatusFacts {
  mergeStateStatus: string | null;
  autoMergeRequest: {
    enabledAt: string | null;
    mergeMethod: string | null;
    enabledBy: string | null;
  } | null;
  viewerCanEnableAutoMerge: boolean;
  viewerCanDisableAutoMerge: boolean;
  viewerCanMergeAsAdmin: boolean;
  viewerCanUpdateBranch: boolean;
  repository: {
    autoMergeAllowed: boolean;
    mergeCommitAllowed: boolean;
    squashMergeAllowed: boolean;
    rebaseMergeAllowed: boolean;
    viewerDefaultMergeMethod: string | null;
  };
  isMergeQueueEnabled: boolean;
  isInMergeQueue: boolean;
}

export interface GitHubCurrentPullRequestStatus {
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
  mergeable: PullRequestMergeable;
  checks: PullRequestCheck[];
  checksStatus: PullRequestChecksStatus;
  reviewDecision: PullRequestReviewDecision;
  github?: GitHubPullRequestStatusFacts;
}

export interface GitHubPullRequestCreateResult {
  url: string;
  number: number;
}

export type GitHubPullRequestMergeMethod = "merge" | "squash" | "rebase";
const DIRECT_PULL_REQUEST_MERGE_STATE_ALLOWLIST = new Set(["CLEAN", "HAS_HOOKS"]);

export interface GitHubPullRequestCommandStatus {
  mergeable?: PullRequestMergeable;
  github?: GitHubPullRequestStatusFacts;
}

export interface MergeGitHubPullRequestOptions {
  cwd: string;
  prNumber: number;
  mergeMethod: GitHubPullRequestMergeMethod;
  status?: GitHubPullRequestCommandStatus | null;
}

export interface EnableGitHubPullRequestAutoMergeOptions {
  cwd: string;
  prNumber: number;
  mergeMethod: GitHubPullRequestMergeMethod;
  status?: GitHubPullRequestCommandStatus | null;
}

export interface DisableGitHubPullRequestAutoMergeOptions {
  cwd: string;
  prNumber: number;
  status?: GitHubPullRequestCommandStatus | null;
}

export interface GitHubPullRequestMergeResult {
  success: true;
}

export interface GitHubPullRequestAutoMergeResult {
  success: true;
}

export type ListGitHubPullRequestsOptions = {
  cwd: string;
  query?: string;
  limit?: number;
} & GitHubReadOptions;

export type ListGitHubIssuesOptions = {
  cwd: string;
  query?: string;
  limit?: number;
} & GitHubReadOptions;

export type GetGitHubPullRequestOptions = {
  cwd: string;
  number: number;
} & GitHubReadOptions;

export type GetGitHubPullRequestTimelineOptions = {
  cwd: string;
  prNumber: number;
  repoOwner: string;
  repoName: string;
} & GitHubReadOptions;

export interface CreateGitHubPullRequestOptions {
  cwd: string;
  repo: string;
  title: string;
  head: string;
  base: string;
  body?: string;
}

export interface GitHubService {
  listPullRequests(options: ListGitHubPullRequestsOptions): Promise<GitHubPullRequestSummary[]>;
  listIssues(options: ListGitHubIssuesOptions): Promise<GitHubIssueSummary[]>;
  getPullRequest(options: GetGitHubPullRequestOptions): Promise<GitHubPullRequestSummary>;
  getPullRequestHeadRef(options: GetGitHubPullRequestOptions): Promise<string>;
  getPullRequestCheckoutTarget?(
    options: GetGitHubPullRequestOptions,
  ): Promise<GitHubPullRequestCheckoutTarget>;
  getCurrentPullRequestStatus(
    options: {
      cwd: string;
      headRef: string;
      headRepositoryOwner?: string;
    } & GitHubReadOptions,
  ): Promise<GitHubCurrentPullRequestStatus | null>;
  getPullRequestTimeline(
    options: GetGitHubPullRequestTimelineOptions,
  ): Promise<GitHubPullRequestTimeline>;
  searchIssuesAndPrs(options: SearchGitHubIssuesAndPrsOptions): Promise<GitHubSearchResult>;
  createPullRequest(
    options: CreateGitHubPullRequestOptions,
  ): Promise<GitHubPullRequestCreateResult>;
  mergePullRequest(options: MergeGitHubPullRequestOptions): Promise<GitHubPullRequestMergeResult>;
  enablePullRequestAutoMerge(
    options: EnableGitHubPullRequestAutoMergeOptions,
  ): Promise<GitHubPullRequestAutoMergeResult>;
  disablePullRequestAutoMerge(
    options: DisableGitHubPullRequestAutoMergeOptions,
  ): Promise<GitHubPullRequestAutoMergeResult>;
  isAuthenticated(options: { cwd: string } & GitHubReadOptions): Promise<boolean>;
  retainCurrentPullRequestStatusPoll?(options: {
    cwd: string;
    headRef: string;
    onStatus?: (status: GitHubCurrentPullRequestStatus | null) => void;
    onError?: (error: unknown) => void;
  }): { unsubscribe: () => void };
  invalidate(options: { cwd: string }): void;
  dispose?(): void;
}

export class GitHubCliMissingError extends Error {
  readonly kind = "missing-cli";

  constructor() {
    super("GitHub CLI (gh) is not installed or not in PATH");
    this.name = "GitHubCliMissingError";
  }
}

export class GitHubAuthenticationError extends Error {
  readonly kind = "auth-failure";
  readonly stderr: string;

  constructor(params: { stderr: string }) {
    super("GitHub CLI authentication failed");
    this.name = "GitHubAuthenticationError";
    this.stderr = params.stderr;
  }
}

export class GitHubCommandError extends Error {
  readonly kind = "command-error";
  readonly args: string[];
  readonly cwd: string;
  readonly exitCode: number | null;
  readonly stderr: string;

  constructor(params: { args: string[]; cwd: string; exitCode: number | null; stderr: string }) {
    super(`GitHub CLI command failed: gh ${params.args.join(" ")}`);
    this.name = "GitHubCommandError";
    this.args = [...params.args];
    this.cwd = params.cwd;
    this.exitCode = params.exitCode;
    this.stderr = params.stderr;
  }
}

interface CreateGitHubServiceOptions {
  ttlMs?: number;
  runner?: GitHubCommandRunner;
  resolveGhPath?: () => Promise<string | null>;
  now?: () => number;
  logger?: Pick<pino.Logger, "warn">;
}

interface CommandFailureLike {
  code?: string | number | null;
  stderr?: string | Buffer;
  stdout?: string | Buffer;
  message?: string;
}

type CurrentPullRequestStatusItem = z.infer<typeof CurrentPullRequestStatusSchema>;
type GitHubPullRequestFactsGraphql = z.infer<typeof GitHubPullRequestFactsGraphqlSchema>;
type GitHubPullRequestFactsRepository = NonNullable<
  GitHubPullRequestFactsGraphql["data"]["repository"]
>;
type GitHubPullRequestFactsPullRequest = NonNullable<
  GitHubPullRequestFactsRepository["pullRequest"]
>;

interface InFlightCacheEntry {
  cwd: string;
  promise: Promise<unknown>;
  force: boolean;
}

interface ResolvedPullRequestCandidate {
  status: GitHubCurrentPullRequestStatus;
  headRepositoryOwner?: string;
}

export function createGitHubService(options: CreateGitHubServiceOptions = {}): GitHubService {
  const ttlMs = options.ttlMs ?? DEFAULT_GITHUB_CACHE_TTL_MS;
  const deps: GitHubServiceDependencies = {
    runner: options.runner ?? runGhCommand,
    resolveGhPath: options.resolveGhPath ?? resolveGhPath,
    now: options.now ?? Date.now,
  };
  const cache = new Map<string, CacheEntry>();
  const inFlight = new Map<string, InFlightCacheEntry>();
  let api!: GitHubService;
  const currentPullRequestPoller = new GitHubCurrentPullRequestPoller({
    loadStatus: (input) => api.getCurrentPullRequestStatus(input),
    computeNextInterval: computeGithubNextInterval,
    onSubscriberError: (error, context) => {
      options.logger?.warn(
        { err: error, ...context },
        "GitHub current pull request poll subscriber threw",
      );
    },
  });

  async function cached<T>(params: {
    cwd: string;
    method: string;
    args: unknown;
    readOptions?: GitHubReadOptions;
    load: () => Promise<T>;
  }): Promise<T> {
    if (params.readOptions?.force && !params.readOptions.reason) {
      throw new Error("GitHubService forced read requires a reason");
    }

    const key = buildCacheKey({
      cwd: params.cwd,
      method: params.method,
      args: params.args,
    });
    const cachedEntry = cache.get(key);
    const now = deps.now();
    if (!params.readOptions?.force && cachedEntry && cachedEntry.expiresAt > now) {
      return cachedEntry.value as T;
    }

    const existing = inFlight.get(key);
    if (existing && (!params.readOptions?.force || existing.force)) {
      return existing.promise as Promise<T>;
    }

    const request = params
      .load()
      .then((value) => {
        if (inFlight.get(key)?.promise === request) {
          cache.set(key, {
            value,
            cwd: params.cwd,
            expiresAt: deps.now() + ttlMs,
          });
        }
        return value;
      })
      .finally(() => {
        if (inFlight.get(key)?.promise === request) {
          inFlight.delete(key);
        }
      });
    inFlight.set(key, {
      cwd: params.cwd,
      promise: request,
      force: params.readOptions?.force === true,
    });
    return request;
  }

  async function run(args: string[], runOptions: GitHubCommandRunnerOptions): Promise<string> {
    const ghPath = await deps.resolveGhPath();
    if (!ghPath) {
      throw new GitHubCliMissingError();
    }
    try {
      const result = await deps.runner(args, runOptions);
      return result.stdout.trim();
    } catch (error) {
      throw normalizeGitHubCommandError(error, {
        args,
        cwd: runOptions.cwd,
      });
    }
  }

  api = {
    listPullRequests(input) {
      return cached({
        cwd: input.cwd,
        method: "listPullRequests",
        args: { query: input.query ?? "", limit: input.limit ?? 20 },
        readOptions: input,
        load: async () => {
          const stdout = await run(
            [
              "pr",
              "list",
              "--search",
              input.query ?? "",
              "--json",
              "number,title,url,state,body,labels,baseRefName,headRefName,updatedAt",
              "--limit",
              String(input.limit ?? 20),
            ],
            { cwd: input.cwd },
          );
          return parsePullRequestSummaries(stdout);
        },
      });
    },

    listIssues(input) {
      return cached({
        cwd: input.cwd,
        method: "listIssues",
        args: { query: input.query ?? "", limit: input.limit ?? 20 },
        readOptions: input,
        load: async () => {
          const stdout = await run(
            [
              "issue",
              "list",
              "--search",
              input.query ?? "",
              "--json",
              "number,title,url,state,body,labels,updatedAt",
              "--limit",
              String(input.limit ?? 20),
            ],
            { cwd: input.cwd },
          );
          return parseIssueSummaries(stdout);
        },
      });
    },

    getPullRequest(input) {
      return cached({
        cwd: input.cwd,
        method: "getPullRequest",
        args: { number: input.number },
        readOptions: input,
        load: async () => {
          const stdout = await run(
            [
              "pr",
              "view",
              String(input.number),
              "--json",
              "number,title,url,state,body,labels,baseRefName,headRefName,updatedAt",
            ],
            { cwd: input.cwd },
          );
          return parsePullRequestSummary(stdout);
        },
      });
    },

    async getPullRequestHeadRef(input) {
      const pullRequest = await this.getPullRequest(input);
      return pullRequest.headRefName;
    },

    getPullRequestCheckoutTarget(input) {
      return cached({
        cwd: input.cwd,
        method: "getPullRequestCheckoutTarget",
        args: { number: input.number },
        readOptions: input,
        load: async () => {
          const repo = await getGitHubRepoView({ cwd: input.cwd, run });
          const owner = repo?.owner?.login;
          const name = repo?.name;
          if (!owner || !name) {
            throw new Error("Unable to resolve GitHub repository for pull request checkout");
          }

          const stdout = await run(
            [
              "api",
              "graphql",
              "-f",
              `query=${PULL_REQUEST_CHECKOUT_TARGET_QUERY}`,
              "-F",
              `owner=${owner}`,
              "-F",
              `name=${name}`,
              "-F",
              `number=${input.number}`,
            ],
            { cwd: input.cwd },
          );
          return parsePullRequestCheckoutTarget(stdout);
        },
      });
    },

    getCurrentPullRequestStatus(input) {
      return cached({
        cwd: input.cwd,
        method: "getCurrentPullRequestStatus",
        args: {
          headRef: input.headRef,
          headRepositoryOwner: input.headRepositoryOwner,
        },
        readOptions: input,
        load: async () => {
          const status = await resolveCurrentPullRequestView({
            cwd: input.cwd,
            headRef: input.headRef,
            headRepositoryOwner: input.headRepositoryOwner,
            run,
          });
          return addCurrentPullRequestGithubFacts({ cwd: input.cwd, status, run });
        },
      }).then((status) => {
        currentPullRequestPoller.acceptStatus({
          cwd: input.cwd,
          headRef: input.headRef,
          status,
          notify: input.reason === "self-heal-github",
        });
        return status;
      });
    },

    getPullRequestTimeline(input) {
      return cached({
        cwd: input.cwd,
        method: "getPullRequestTimeline",
        args: { prNumber: input.prNumber },
        readOptions: input,
        load: () =>
          loadGitHubPullRequestTimeline(input, {
            run,
            normalizeFailure: normalizeGitHubPullRequestTimelineFailure,
          }),
      });
    },

    searchIssuesAndPrs(input) {
      return searchGitHubIssuesAndPrs(input, {
        listIssues: (readOptions) => api.listIssues(readOptions),
        listPullRequests: (readOptions) => api.listPullRequests(readOptions),
        isFeatureUnavailableError: (error) =>
          error instanceof GitHubCliMissingError || error instanceof GitHubAuthenticationError,
      });
    },

    async createPullRequest(input) {
      const args = ["api", "-X", "POST", `repos/${input.repo}/pulls`, "-f", `title=${input.title}`];
      args.push("-f", `head=${input.head}`);
      args.push("-f", `base=${input.base}`);
      if (input.body) {
        args.push("-f", `body=${input.body}`);
      }
      const stdout = await run(args, { cwd: input.cwd });
      const parsed = z
        .object({
          url: z.string(),
          number: z.number(),
        })
        .parse(JSON.parse(stdout || "{}"));
      return parsed;
    },

    async mergePullRequest(input) {
      assertDirectPullRequestMergeReady(input);
      await run(["pr", "merge", String(input.prNumber), `--${input.mergeMethod}`], {
        cwd: input.cwd,
        envOverlay: { GH_PROMPT_DISABLED: "1" },
      });
      return { success: true };
    },

    async enablePullRequestAutoMerge(input) {
      assertPullRequestAutoMergeEnableReady(input);
      await run(["pr", "merge", String(input.prNumber), "--auto", `--${input.mergeMethod}`], {
        cwd: input.cwd,
        envOverlay: { GH_PROMPT_DISABLED: "1" },
      });
      return { success: true };
    },

    async disablePullRequestAutoMerge(input) {
      assertPullRequestAutoMergeDisableReady(input);
      await run(["pr", "merge", String(input.prNumber), "--disable-auto"], {
        cwd: input.cwd,
        envOverlay: { GH_PROMPT_DISABLED: "1" },
      });
      return { success: true };
    },

    isAuthenticated(input) {
      return cached({
        cwd: input.cwd,
        method: "isAuthenticated",
        args: {},
        readOptions: input,
        load: async () => {
          try {
            await run(["auth", "status"], { cwd: input.cwd });
            return true;
          } catch (error) {
            if (isGitHubAuthenticationError(error)) {
              throw error;
            }
            if (error instanceof GitHubCommandError && isAuthFailureText(error.stderr)) {
              throw new GitHubAuthenticationError({ stderr: error.stderr });
            }
            throw error;
          }
        },
      });
    },

    retainCurrentPullRequestStatusPoll(input) {
      return currentPullRequestPoller.retain(input);
    },

    invalidate(input) {
      // Local checkout mutations that can alter the current PR identity or PR status
      // must call this with the affected cwd before broadcasting fresh git state.
      for (const [key, entry] of cache.entries()) {
        if (entry.cwd === input.cwd) {
          cache.delete(key);
        }
      }
      for (const [key, entry] of inFlight.entries()) {
        if (entry.cwd === input.cwd) {
          inFlight.delete(key);
        }
      }
    },

    dispose() {
      currentPullRequestPoller.dispose();
    },
  };

  return api;
}

function assertDirectPullRequestMergeReady(input: MergeGitHubPullRequestOptions): void {
  const github = input.status?.github;
  if (!github) {
    throw new Error("GitHub merge facts are unavailable for this pull request");
  }

  if (!DIRECT_PULL_REQUEST_MERGE_STATE_ALLOWLIST.has(github.mergeStateStatus ?? "")) {
    throw new Error("GitHub does not report this pull request as ready for direct merge");
  }
  if (github.isMergeQueueEnabled || github.isInMergeQueue) {
    throw new Error("Direct merge is not available because this repository uses a merge queue");
  }
  if (github.autoMergeRequest !== null) {
    throw new Error("Direct merge is not available because auto-merge is already enabled");
  }
  if (!isPullRequestMergeMethodAllowed(github.repository, input.mergeMethod)) {
    throw new Error(`Direct merge is not available because ${input.mergeMethod} is disabled`);
  }
}

export function assertPullRequestAutoMergeEnableReady(
  input: Pick<EnableGitHubPullRequestAutoMergeOptions, "mergeMethod" | "status">,
): void {
  const github = input.status?.github;
  if (!github) {
    throw new Error("GitHub auto-merge facts are unavailable for this pull request");
  }

  if (github.mergeStateStatus !== "BLOCKED") {
    throw new Error("GitHub does not report this pull request as blocked for auto-merge");
  }
  if (!github.viewerCanEnableAutoMerge) {
    throw new Error("GitHub does not allow this viewer to enable auto-merge");
  }
  if (!github.repository.autoMergeAllowed) {
    throw new Error("Auto-merge is disabled for this repository");
  }
  if (!isPullRequestMergeMethodAllowed(github.repository, input.mergeMethod)) {
    throw new Error(`Auto-merge is not available because ${input.mergeMethod} is disabled`);
  }
  if (github.autoMergeRequest !== null) {
    throw new Error("Auto-merge is already enabled for this pull request");
  }
  if (github.isMergeQueueEnabled || github.isInMergeQueue) {
    throw new Error("Auto-merge is not available because this repository uses a merge queue");
  }
  if (input.status?.mergeable === "CONFLICTING") {
    throw new Error("Auto-merge is not available because this pull request has conflicts");
  }
}

export function assertPullRequestAutoMergeDisableReady(
  input: Pick<DisableGitHubPullRequestAutoMergeOptions, "status">,
): void {
  const github = input.status?.github;
  if (!github) {
    throw new Error("GitHub auto-merge facts are unavailable for this pull request");
  }

  if (github.autoMergeRequest === null) {
    throw new Error("Auto-merge is not enabled for this pull request");
  }
  if (!github.viewerCanDisableAutoMerge) {
    throw new Error("GitHub does not allow this viewer to disable auto-merge");
  }
  if (github.isMergeQueueEnabled || github.isInMergeQueue) {
    throw new Error("Auto-merge is not available because this repository uses a merge queue");
  }
}

export function isPullRequestMergeMethodAllowed(
  repository: GitHubPullRequestStatusFacts["repository"],
  method: GitHubPullRequestMergeMethod,
): boolean {
  if (method === "squash") {
    return repository.squashMergeAllowed;
  }
  if (method === "merge") {
    return repository.mergeCommitAllowed;
  }
  return repository.rebaseMergeAllowed;
}

export function computeGithubNextInterval(
  status: GitHubCurrentPullRequestStatus | null,
  consecutiveErrors: number,
): number {
  const baseInterval = isGitHubStatusPending(status)
    ? GITHUB_POLL_FAST_INTERVAL_MS
    : GITHUB_POLL_SLOW_INTERVAL_MS;
  if (consecutiveErrors <= 1) {
    return baseInterval;
  }

  return Math.min(baseInterval * 2 ** (consecutiveErrors - 1), GITHUB_POLL_ERROR_BACKOFF_CAP_MS);
}

function isGitHubStatusPending(status: GitHubCurrentPullRequestStatus | null): boolean {
  if (!status) {
    return false;
  }
  if (status.checksStatus === "pending") {
    return true;
  }
  return status.checks.some((check) => check.status === "pending");
}

async function resolveGhPath(): Promise<string | null> {
  return findExecutable("gh");
}

async function runGhCommand(
  args: string[],
  options: GitHubCommandRunnerOptions,
): Promise<GitHubCommandResult> {
  return execCommand("gh", args, {
    cwd: options.cwd,
    envOverlay: { ...GITHUB_ENV, ...options.envOverlay },
    maxBuffer: 10 * 1024 * 1024,
  });
}

function buildCacheKey(params: { cwd: string; method: string; args: unknown }): string {
  return `${params.cwd}:${params.method}:${stableStringify(params.args)}`;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
  const sorted: Record<string, unknown> = {};
  for (const [key, entryValue] of entries) {
    sorted[key] = sortJsonValue(entryValue);
  }
  return sorted;
}

function normalizeGitHubCommandError(
  error: unknown,
  context: { args: string[]; cwd: string },
): Error {
  if (error instanceof GitHubAuthenticationError) {
    return error;
  }
  if (error instanceof GitHubCommandError) {
    if (isAuthFailureText(error.stderr)) {
      return new GitHubAuthenticationError({ stderr: error.stderr });
    }
    return error;
  }
  const failure = toCommandFailureLike(error);
  if (failure.code === "ENOENT") {
    return new GitHubCliMissingError();
  }
  const stderr = bufferOrStringToString(failure.stderr);
  const message = failure.message ?? "";
  if (isAuthFailureText(stderr) || isAuthFailureText(message)) {
    return new GitHubAuthenticationError({ stderr });
  }
  return new GitHubCommandError({
    args: context.args,
    cwd: context.cwd,
    exitCode: typeof failure.code === "number" ? failure.code : null,
    stderr: stderr || message,
  });
}

function toCommandFailureLike(error: unknown): CommandFailureLike {
  if (!error || typeof error !== "object") {
    return { message: String(error) };
  }
  const record = error as Record<string, unknown>;
  return {
    code:
      typeof record.code === "string" || typeof record.code === "number" || record.code === null
        ? record.code
        : undefined,
    stderr:
      typeof record.stderr === "string" || Buffer.isBuffer(record.stderr)
        ? record.stderr
        : undefined,
    stdout:
      typeof record.stdout === "string" || Buffer.isBuffer(record.stdout)
        ? record.stdout
        : undefined,
    message: typeof record.message === "string" ? record.message : undefined,
  };
}

function bufferOrStringToString(value: string | Buffer | undefined): string {
  if (Buffer.isBuffer(value)) {
    return value.toString("utf8");
  }
  return value ?? "";
}

function isGitHubAuthenticationError(error: unknown): error is GitHubAuthenticationError {
  return error instanceof GitHubAuthenticationError;
}

function normalizeGitHubPullRequestTimelineFailure(
  error: unknown,
): GitHubPullRequestTimelineFailure {
  if (error instanceof GitHubCommandError) {
    return { kind: "command", stderr: error.stderr, message: error.message };
  }
  if (error instanceof GitHubAuthenticationError) {
    return { kind: "authentication", stderr: error.stderr, message: error.message };
  }
  return {
    kind: "unknown",
    message: error instanceof Error ? error.message : String(error),
  };
}

function isAuthFailureText(text: string): boolean {
  const normalized = text.toLowerCase();
  return (
    normalized.includes("gh auth login") ||
    normalized.includes("not logged into any github hosts") ||
    normalized.includes("authentication failed") ||
    normalized.includes("authentication required") ||
    normalized.includes("bad credentials") ||
    normalized.includes("http 401")
  );
}

function isNoPullRequestFoundError(error: unknown): boolean {
  if (!(error instanceof GitHubCommandError)) {
    return false;
  }
  const text = error.stderr.toLowerCase();
  return text.includes("no pull requests found");
}

function isStatusCheckRollupPermissionError(error: unknown): boolean {
  if (!(error instanceof GitHubCommandError)) {
    return false;
  }
  return error.stderr.toLowerCase().includes("statuscheckrollup");
}

async function resolveCurrentPullRequestView(options: {
  cwd: string;
  headRef: string;
  headRepositoryOwner?: string;
  run: (args: string[], options: GitHubCommandRunnerOptions) => Promise<string>;
}): Promise<GitHubCurrentPullRequestStatus | null> {
  const viewCandidate = await tryCurrentPullRequestView(options);
  const viewMatch = viewCandidate
    ? pickPullRequestCandidate({
        candidates: [viewCandidate],
        headRef: options.headRef,
        headRepositoryOwner: options.headRepositoryOwner,
      })
    : null;
  if (viewMatch) {
    return viewMatch.status;
  }

  let listHeadRef = options.headRef;
  let listRepo: string | undefined;
  let headRepositoryOwner = options.headRepositoryOwner;

  if (!headRepositoryOwner) {
    const repo = await getGitHubRepoView(options);
    const forkOwner = repo?.owner?.login;
    const parentOwner = repo?.parent?.owner?.login;
    const parentName = repo?.parent?.name;
    if (!forkOwner || !parentOwner || !parentName) {
      return null;
    }

    listHeadRef = `${forkOwner}:${options.headRef}`;
    listRepo = `${parentOwner}/${parentName}`;
    headRepositoryOwner = forkOwner;
  }

  const candidates = await listCurrentPullRequestCandidates({
    cwd: options.cwd,
    headRef: listHeadRef,
    run: options.run,
    repo: listRepo,
  });
  const match = pickPullRequestCandidate({
    candidates,
    headRef: options.headRef,
    headRepositoryOwner,
  });
  return match?.status ?? null;
}

async function addCurrentPullRequestGithubFacts(options: {
  cwd: string;
  status: GitHubCurrentPullRequestStatus | null;
  run: (args: string[], options: GitHubCommandRunnerOptions) => Promise<string>;
}): Promise<GitHubCurrentPullRequestStatus | null> {
  const { status } = options;
  if (!status?.repoOwner || !status.repoName || typeof status.number !== "number") {
    return status;
  }

  const facts = await loadPullRequestGithubFacts({
    cwd: options.cwd,
    owner: status.repoOwner,
    name: status.repoName,
    number: status.number,
    run: options.run,
  });
  if (!facts) {
    return status;
  }
  return {
    ...status,
    github: facts,
  };
}

async function loadPullRequestGithubFacts(options: {
  cwd: string;
  owner: string;
  name: string;
  number: number;
  run: (args: string[], options: GitHubCommandRunnerOptions) => Promise<string>;
}): Promise<GitHubPullRequestStatusFacts | null> {
  try {
    const stdout = await options.run(
      [
        "api",
        "graphql",
        "-f",
        `query=${PULL_REQUEST_STATUS_FACTS_QUERY}`,
        "-F",
        `owner=${options.owner}`,
        "-F",
        `name=${options.name}`,
        "-F",
        `number=${options.number}`,
      ],
      { cwd: options.cwd },
    );
    return parsePullRequestGithubFacts(stdout);
  } catch (error) {
    if (
      error instanceof GitHubCommandError ||
      error instanceof z.ZodError ||
      error instanceof SyntaxError
    ) {
      return null;
    }
    throw error;
  }
}

async function tryCurrentPullRequestView(options: {
  cwd: string;
  headRef: string;
  run: (args: string[], options: GitHubCommandRunnerOptions) => Promise<string>;
}): Promise<ResolvedPullRequestCandidate | null> {
  try {
    const stdout = await runCurrentPullRequestStatusCommand({
      cwd: options.cwd,
      run: options.run,
      args: ["pr", "view"],
    });
    return parseCurrentPullRequestCandidate(stdout, options.headRef);
  } catch (error) {
    if (isNoPullRequestFoundError(error)) {
      return null;
    }
    throw error;
  }
}

async function listCurrentPullRequestCandidates(options: {
  cwd: string;
  headRef: string;
  run: (args: string[], options: GitHubCommandRunnerOptions) => Promise<string>;
  repo?: string;
}): Promise<ResolvedPullRequestCandidate[]> {
  const args = ["pr", "list"];
  if (options.repo) {
    args.push("--repo", options.repo);
  }
  args.push("--state", "all", "--head", options.headRef, "--limit", "10");
  try {
    const stdout = await runCurrentPullRequestStatusCommand({
      cwd: options.cwd,
      run: options.run,
      args,
    });
    return parseCurrentPullRequestCandidateList(stdout, options.headRef);
  } catch (error) {
    if (isNoPullRequestFoundError(error)) {
      return [];
    }
    throw error;
  }
}

async function runCurrentPullRequestStatusCommand(options: {
  cwd: string;
  run: (args: string[], options: GitHubCommandRunnerOptions) => Promise<string>;
  args: string[];
}): Promise<string> {
  try {
    return await options.run([...options.args, "--json", CURRENT_PR_STATUS_FIELDS], {
      cwd: options.cwd,
    });
  } catch (error) {
    if (!isStatusCheckRollupPermissionError(error)) {
      throw error;
    }
    return options.run([...options.args, "--json", CURRENT_PR_STATUS_BASE_FIELDS], {
      cwd: options.cwd,
    });
  }
}

async function getGitHubRepoView(options: {
  cwd: string;
  run: (args: string[], options: GitHubCommandRunnerOptions) => Promise<string>;
}): Promise<z.infer<typeof GitHubRepoViewSchema> | null> {
  try {
    const stdout = await options.run(["repo", "view", "--json", "owner,name,parent"], {
      cwd: options.cwd,
    });
    return GitHubRepoViewSchema.parse(JSON.parse(stdout || "{}"));
  } catch {
    return null;
  }
}

function parseCurrentPullRequestCandidate(
  stdout: string,
  fallbackHeadRefName: string,
): ResolvedPullRequestCandidate | null {
  const item = CurrentPullRequestStatusSchema.parse(JSON.parse(stdout || "{}"));
  return toCurrentPullRequestCandidate(item, fallbackHeadRefName);
}

function parseCurrentPullRequestCandidateList(
  stdout: string,
  fallbackHeadRefName: string,
): ResolvedPullRequestCandidate[] {
  const items = z.array(CurrentPullRequestStatusSchema).parse(JSON.parse(stdout || "[]"));
  return items
    .map((item) => toCurrentPullRequestCandidate(item, fallbackHeadRefName))
    .filter((candidate): candidate is ResolvedPullRequestCandidate => candidate !== null);
}

function parsePullRequestGithubFacts(stdout: string): GitHubPullRequestStatusFacts | null {
  const parsed = GitHubPullRequestFactsGraphqlSchema.parse(JSON.parse(stdout || "{}"));
  const repository = parsed.data.repository;
  const pullRequest = repository?.pullRequest;
  if (!repository || !pullRequest) {
    return null;
  }

  return {
    mergeStateStatus: pullRequest.mergeStateStatus ?? null,
    autoMergeRequest: toGitHubAutoMergeRequest(pullRequest.autoMergeRequest),
    viewerCanEnableAutoMerge: pullRequest.viewerCanEnableAutoMerge ?? false,
    viewerCanDisableAutoMerge: pullRequest.viewerCanDisableAutoMerge ?? false,
    viewerCanMergeAsAdmin: pullRequest.viewerCanMergeAsAdmin ?? false,
    viewerCanUpdateBranch: pullRequest.viewerCanUpdateBranch ?? false,
    repository: toGitHubRepositoryMergePolicy(repository),
    isMergeQueueEnabled: pullRequest.isMergeQueueEnabled ?? false,
    isInMergeQueue: pullRequest.isInMergeQueue ?? false,
  };
}

function toGitHubAutoMergeRequest(
  request: GitHubPullRequestFactsPullRequest["autoMergeRequest"],
): GitHubPullRequestStatusFacts["autoMergeRequest"] {
  if (!request) {
    return null;
  }
  return {
    enabledAt: request.enabledAt ?? null,
    mergeMethod: request.mergeMethod ?? null,
    enabledBy: request.enabledBy?.login ?? null,
  };
}

function toGitHubRepositoryMergePolicy(
  repository: GitHubPullRequestFactsRepository,
): GitHubPullRequestStatusFacts["repository"] {
  return {
    autoMergeAllowed: repository.autoMergeAllowed ?? false,
    mergeCommitAllowed: repository.mergeCommitAllowed ?? false,
    squashMergeAllowed: repository.squashMergeAllowed ?? false,
    rebaseMergeAllowed: repository.rebaseMergeAllowed ?? false,
    viewerDefaultMergeMethod: repository.viewerDefaultMergeMethod ?? null,
  };
}

function toCurrentPullRequestCandidate(
  item: CurrentPullRequestStatusItem,
  fallbackHeadRefName: string,
): ResolvedPullRequestCandidate | null {
  const status = toCurrentPullRequestStatus(item, fallbackHeadRefName);
  if (!status) {
    return null;
  }
  const headRepositoryOwner = item.headRepositoryOwner?.login;
  return {
    status,
    ...(headRepositoryOwner ? { headRepositoryOwner } : {}),
  };
}

function isCandidateForHeadRef(candidate: ResolvedPullRequestCandidate, headRef: string): boolean {
  return candidate.status.headRefName === headRef && hasResolvedRepoIdentity(candidate.status);
}

function hasResolvedRepoIdentity(status: GitHubCurrentPullRequestStatus): boolean {
  return Boolean(status.repoOwner && status.repoName);
}

function pickPullRequestCandidate(options: {
  candidates: ResolvedPullRequestCandidate[];
  headRef: string;
  headRepositoryOwner?: string;
}): ResolvedPullRequestCandidate | null {
  const matching = options.candidates.filter((candidate) => {
    if (!isCandidateForHeadRef(candidate, options.headRef)) {
      return false;
    }
    if (!options.headRepositoryOwner) {
      return true;
    }
    return candidate.headRepositoryOwner === options.headRepositoryOwner;
  });
  matching.sort(comparePullRequestCandidatePreference);
  return matching[0] ?? null;
}

function comparePullRequestCandidatePreference(
  left: ResolvedPullRequestCandidate,
  right: ResolvedPullRequestCandidate,
): number {
  return getPullRequestStateRank(left.status) - getPullRequestStateRank(right.status);
}

function getPullRequestStateRank(status: GitHubCurrentPullRequestStatus): number {
  if (status.state === "open" || status.isDraft) {
    return 0;
  }
  if (status.state === "merged") {
    return 1;
  }
  return 2;
}

function parsePullRequestSummaries(stdout: string): GitHubPullRequestSummary[] {
  const parsed = z.array(GitHubPullRequestSummarySchema).parse(JSON.parse(stdout || "[]"));
  return parsed.map(toPullRequestSummary);
}

function parsePullRequestSummary(stdout: string): GitHubPullRequestSummary {
  return toPullRequestSummary(GitHubPullRequestSummarySchema.parse(JSON.parse(stdout || "{}")));
}

function parsePullRequestCheckoutTarget(stdout: string): GitHubPullRequestCheckoutTarget {
  const parsed = PullRequestCheckoutTargetSchema.parse(JSON.parse(stdout || "{}"));
  const pullRequest = parsed.data.repository.pullRequest;
  if (!pullRequest) {
    throw new Error("Pull request not found");
  }
  return {
    number: pullRequest.number,
    baseRefName: pullRequest.baseRefName,
    headRefName: pullRequest.headRefName,
    headOwnerLogin: pullRequest.headRepositoryOwner?.login || null,
    headRepositorySshUrl: pullRequest.headRepository?.sshUrl || null,
    headRepositoryUrl: pullRequest.headRepository?.url || null,
    isCrossRepository: pullRequest.isCrossRepository,
  };
}

function toPullRequestSummary(
  item: z.infer<typeof GitHubPullRequestSummarySchema>,
): GitHubPullRequestSummary {
  return {
    number: item.number,
    title: item.title,
    url: item.url,
    state: item.state,
    body: item.body,
    baseRefName: item.baseRefName,
    headRefName: item.headRefName,
    labels: item.labels.map((label) => label.name ?? "").filter((name) => name.length > 0),
    updatedAt: item.updatedAt,
  };
}

function parseIssueSummaries(stdout: string): GitHubIssueSummary[] {
  const parsed = z.array(GitHubIssueSummarySchema).parse(JSON.parse(stdout || "[]"));
  return parsed.map((item) => ({
    number: item.number,
    title: item.title,
    url: item.url,
    state: item.state,
    body: item.body,
    labels: item.labels.map((label) => label.name ?? "").filter((name) => name.length > 0),
    updatedAt: item.updatedAt,
  }));
}

function toCurrentPullRequestStatus(
  item: CurrentPullRequestStatusItem,
  fallbackHeadRefName: string,
): GitHubCurrentPullRequestStatus | null {
  if (!item.url || !item.title) {
    return null;
  }
  const repoIdentity = parseGitHubPullRequestRepo(item.url);
  const mergedAt =
    typeof item.mergedAt === "string" && item.mergedAt.trim().length > 0 ? item.mergedAt : null;
  let state: string;
  if (mergedAt !== null) {
    state = "merged";
  } else if (item.state.trim().length > 0) {
    state = item.state.toLowerCase();
  } else {
    state = "";
  }
  const checks = parseStatusCheckRollup(item.statusCheckRollup);
  return {
    ...(typeof item.number === "number" ? { number: item.number } : {}),
    ...(repoIdentity ? { repoOwner: repoIdentity.owner, repoName: repoIdentity.name } : {}),
    url: item.url,
    title: item.title,
    state,
    baseRefName: item.baseRefName,
    headRefName: item.headRefName || fallbackHeadRefName,
    isMerged: mergedAt !== null,
    isDraft: item.isDraft ?? false,
    mergeable: item.mergeable,
    checks,
    checksStatus: computePullRequestChecksStatus(checks),
    reviewDecision: mapReviewDecision(item.reviewDecision),
  };
}

function parseGitHubPullRequestRepo(url: string): { owner: string; name: string } | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "github.com") {
      return null;
    }
    const [owner, name, kind] = parsed.pathname.split("/").filter(Boolean);
    if (!owner || !name || kind !== "pull") {
      return null;
    }
    return { owner, name };
  } catch {
    return null;
  }
}

function mapReviewDecision(value: unknown): PullRequestReviewDecision {
  const reviewDecision = PullRequestReviewDecisionSchema.parse(value);
  if (reviewDecision === "APPROVED") {
    return "approved";
  }
  if (reviewDecision === "CHANGES_REQUESTED") {
    return "changes_requested";
  }
  if (reviewDecision === "REVIEW_REQUIRED") {
    return "pending";
  }
  return null;
}

export async function resolveGitHubRepo(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await runGitCommand(["config", "--get", "remote.origin.url"], {
      cwd,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    });
    const remote = await resolveGitHubRemote({ remoteUrl: stdout.trim() });
    return remote?.repo ?? null;
  } catch {
    return null;
  }
}
