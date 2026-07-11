# Task 11 Final Gates Report

## Scope

Task 11 closes the local CI/workflow, package-export, formatting, lockfile, audit, and static security review gates for the comprehensive remediation branch. The archived v2.0 roadmap terminus was not modified.

Review range: `080e28643` through the Task 11 commit, with the cumulative project remediation range rooted at `f42694468`.

Mechanical formatter commit: `49315c1a2`.

## Changes

- Default-branch workflow triggers now use `cn-main` in CI, relay deploy, Nix, Nix hash update, and release-notes sync.
- Server worktree CI fetches `cn-main` into `refs/remotes/origin/cn-main`.
- The CI lint job runs `npm run format:check` using the existing step syntax.
- `packages/protocol/src/package-exports.test.ts` freezes the 35 explicit public subpaths present in tag `v1.0.2` and verifies exact `types` and `default` dist mappings. It does not require or add `./*`.
- The repository formatter mechanically normalized five tracked design/prototype HTML files. Generated, dist, dependency, and vendor directories were not part of the content diff.

## Formatting

- Before: `npm.cmd run format:check` exit 1; oxfmt reported 1,623 files.
- Formatter: `npm.cmd run format` was run exactly once; exit 0; 4,035 files scanned.
- Content rewrite: five design/prototype HTML files, 10,406 insertions and 3,052 deletions before Task 11 source edits are counted.
- After: `npm.cmd run format:check` exit 0; all 1,843 currently matched files formatted.
- A concurrently created untracked `.qa-tmp` script was formatted with the targeted repository script; no permanent formatter-ignore rule was added.
- `git diff --check`: exit 0.

## Protocol export gate

- Authoritative source: local annotated tag `v1.0.2`, `packages/protocol/package.json`.
- Frozen explicit subpaths: 35.
- RED: prior wildcard assertion failed because the current package intentionally has no unrestricted `./*` mapping.
- GREEN/final: `npx.cmd vitest run packages/protocol/src/package-exports.test.ts --bail=1` — 35 passed, exit 0.

## Lockfile

- Required command executed: `npm.cmd install --package-lock-only --ignore-scripts --registry=https://registry.npmjs.org`; exit 0.
- The npm-generated lockfile diff is 43 insertions and 20 deletions. It updates the root Node type resolution and adds workspace-local Node 20 type entries for client, protocol, relay, and server while removing the obsolete desktop Node 24 entry.
- The command preserves 42 `registry.npmmirror.com` resolved URLs that are already present at `080e28643`; no changed resolved URL introduces a mirror host.
- Existing CI command `lockfile-lint --allowed-hosts npm` therefore remains nonzero for those 42 entries.
- No resolved URL was hand-edited and the CI allowlist was not widened.
- Clean-regeneration experiments produced platform-pruned/incomplete lock metadata and were discarded. The final lockfile is the normal npm-generated 63-line diff from the tracked baseline.
- Workspace `node_modules` and all nine workspace package directories were restored and verified after the isolated experiment.

## Test-audit comparison

| Category           | Base `f42694468` | Task 11 | Baseline | Result               |
| ------------------ | ---------------: | ------: | -------: | -------------------- |
| moduleMock         |              303 |     303 |      239 | Pre-existing blocker |
| conditionalSkip    |              105 |     105 |      103 | Pre-existing blocker |
| weakAssertion      |              349 |     349 |      299 | Pre-existing blocker |
| processEnvMutation |              151 |     151 |      133 | Pre-existing blocker |
| fixedWait          |              229 |     228 |      311 | Improved by one      |

`npm.cmd run test:audit` exits 1 because the repository baseline predates the same debt already present at `f42694468`. Task 11 adds no debt in the failing categories. The baseline and audit implementation were not modified.

## Project gates

| Gate                           | Exit/result                                     |
| ------------------------------ | ----------------------------------------------- |
| `npm.cmd run lint`             | 0; 0 warnings, 0 errors                         |
| `npm.cmd run typecheck`        | 0; all nine workspaces                          |
| `npm.cmd run format:check`     | 0                                               |
| protocol export test           | 0; 35 passed                                    |
| `git diff --check`             | 0                                               |
| workflow legacy-default search | No matches                                      |
| `npm.cmd run test:audit`       | 1; pre-existing base-identical blocker above    |
| lockfile-lint allowlist        | 1; 42 pre-existing mirror URLs preserved by npm |

`scripts/ci_monitor.cjs --help` could not run because the repository does not contain that script. No remote workflow was triggered.

## Final static security self-review

- Schedule containment: commit `063cc6685` validates schedule IDs against separators/traversal and resolves schedule files under the schedule directory before access.
- Script proxy credentials: commits `eeb7e8ffc` and `437d7dad3` remove HTTP `Authorization` and daemon WebSocket bearer protocols while preserving negotiated application protocols.
- Packaged smoke isolation: commits `8faa21efd` and `3decd3a59` use one isolated `CHISACODE_HOME` for desktop, CLI, cleanup, and failure paths rather than the default daemon home.
- Relay bounds: commits `2166f0d32`, `013f46c30`, and `6ec62fc58` cap connection IDs, control/data frames, decoded/encrypted payloads, pending sends, and close or terminate excess/stale sockets.
- Old-client GenUI fence: commits `d1bda9b17`, `ed49b015a`, and `3eae591b8` suppress explicit GenUI rows/live events for unsupported clients while retaining compatible assistant-fence history and canonical paging.
- Command cleanup: commits `7725b2240` through `62bb46ae5` require fail-closed ownership/identity checks before signaling and use one absolute cleanup deadline across snapshot, graceful, force, and polling phases.

No Task 11 edit changes these security-sensitive implementations; this was a code/test/commit evidence review, avoiding already-green suites.
