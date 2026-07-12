# Task 11 Final Gates Report

## Scope

Task 11 closes the local CI/workflow, package-export, formatting, lockfile, audit, and static security review gates for the comprehensive remediation branch. A follow-up after commit `d3de7b014` resolved the two inherited CI blockers and recorded the remaining test debt in the active roadmap.

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
- The command preserved 42 `registry.npmmirror.com` resolved URLs that were already present at `080e28643`; npm did not rewrite unchanged entries even with an explicit npmjs registry.
- The follow-up parsed the lockfile as JSON and each remote `resolved` value as a URL, replacing only the exact `registry.npmmirror.com` hostname with `registry.npmjs.org`. Package paths, versions, integrity values, and all other entry fields remain unchanged.
- The CI allowlist was not widened. `lockfile-lint --allowed-hosts npm --validate-https --validate-integrity` now exits 0.
- Clean-regeneration experiments produced platform-pruned/incomplete lock metadata and were discarded. Before the follow-up, the retained lockfile change was the normal npm-generated 63-line diff; the follow-up adds only the 42 verified hostname substitutions described above.
- Workspace `node_modules` and all nine workspace package directories were restored and verified after the isolated experiment.

## Test-audit comparison

| Category           | Base `f42694468` | Current | Calibrated baseline | Result                     |
| ------------------ | ---------------: | ------: | ------------------: | -------------------------- |
| moduleMock         |              303 |     303 |                 303 | No increase                |
| spyOn              |               34 |      34 |                  34 | Eight below stale baseline |
| unconditionalSkip  |               11 |      11 |                  11 | No increase                |
| conditionalSkip    |              105 |     105 |                 105 | No increase                |
| weakAssertion      |              349 |     349 |                 349 | No increase                |
| processEnvMutation |              151 |     151 |                 151 | No increase                |
| fixedWait          |              229 |     228 |                 228 | Improved by one            |

The previous baseline predated debt already present at `f42694468`, so the default branch could not pass its own no-new-debt gate. The follow-up regenerated the baseline with the repository-provided `npm run test:audit -- --update`; the audit implementation was not modified. This calibration restores regression detection but does not classify the existing counts as remediated; their reduction remains tracked separately.

## Project gates

| Gate                           | Exit/result                                     |
| ------------------------------ | ----------------------------------------------- |
| `npm.cmd run lint`             | 0; 0 warnings, 0 errors                         |
| `npm.cmd run typecheck`        | 0; all nine workspaces                          |
| `npm.cmd run format:check`     | 0                                               |
| protocol export test           | 0; 35 passed                                    |
| `git diff --check`             | 0                                               |
| workflow legacy-default search | No matches                                      |
| `npm.cmd run test:audit`       | 0; current counts equal the calibrated baseline |
| lockfile-lint allowlist        | 0; no invalid hosts or integrity issues         |

`scripts/ci_monitor.cjs --help` could not run because the repository does not contain that script. No remote workflow was triggered.

## Final static security self-review

- Schedule containment: commit `063cc6685` validates schedule IDs against separators/traversal and resolves schedule files under the schedule directory before access.
- Script proxy credentials: commits `eeb7e8ffc` and `437d7dad3` remove HTTP `Authorization` and daemon WebSocket bearer protocols while preserving negotiated application protocols.
- Packaged smoke isolation: commits `8faa21efd` and `3decd3a59` use one isolated `CHISACODE_HOME` for desktop, CLI, cleanup, and failure paths rather than the default daemon home.
- Relay bounds: commits `2166f0d32`, `013f46c30`, and `6ec62fc58` cap connection IDs, control/data frames, decoded/encrypted payloads, pending sends, and close or terminate excess/stale sockets.
- Old-client GenUI fence: commits `d1bda9b17`, `ed49b015a`, and `3eae591b8` suppress explicit GenUI rows/live events for unsupported clients while retaining compatible assistant-fence history and canonical paging.
- Command cleanup: commits `7725b2240` through `62bb46ae5` require fail-closed ownership/identity checks before signaling and use one absolute cleanup deadline across snapshot, graceful, force, and polling phases.

No Task 11 edit changes these security-sensitive implementations; this was a code/test/commit evidence review, avoiding already-green suites.
