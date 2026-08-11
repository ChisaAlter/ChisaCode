# Production hardening security follow-up evidence

This is a pre-commit evidence snapshot captured at the timestamp in the filename. For current branch status, use the PR head SHA and `docs/security/production-hardening-current-state-2026-08-10.md`; do not treat the commit/push fields below as live status.

- recordedAt: 2026-08-10T12:17:09Z
- branch: `codex/production-hardening-2026-08-10`
- committed HEAD: `d6ab2d44f713ac35f7a3addcb23e6984ea174859`
- remote PR: #32, remote head equals committed HEAD
- follow-up state: uncommitted and unpushed
- isolation: dirty `cn-main` Model Gateway worktree was not modified

## Why this evidence exists

Earlier phase/closeout evidence describes the implementation at its recording time. In particular, it records a force-delete archive fallback, default legacy Relay acceptance, and a daemon-public-key stand-in for `clientPublicKeyB64`. Those statements are historical and are superseded by this follow-up plus the current-state security document.

## Documentation map

- `docs/security/production-hardening-current-state-2026-08-10.md` is the authoritative dated implementation, operations, verification, and release-readiness snapshot.
- `docs/security/relay-auth-handshake-v2-threat-model.md` records the current Relay client-auth trust model, channel binding, compatibility, and credential lifecycle.
- `SECURITY.md` is the durable operator-facing security boundary and recovery-policy entry point.
- `.omc/plans/chisacode-production-hardening-plan.md` and `docs/refactors/comprehensive-improvement-roadmap.md` retain planning history and point readers back to the current-state snapshot when historical claims differ.
- `README.md` links the current-state snapshot, security policy, and Relay threat-model ADR from the repository documentation index.

## Follow-up implementation

### Archive and workspace writes

- Normal archive uses only non-force `git worktree remove`; refusal or unknown residual data preserves the path.
- Setup failure cleanup never force-removes or recursively deletes unknown output; it enters `setup_failed_recovery` and reports the recovery path.
- The process-wide mutation coordinator now tracks queued holders, write leases, drain waiters, descendant path blocking, and post-delete finalize state.
- Agent registration/run/resume and worker terminal create/input paths participate in the write gate.
- Archive resolves the canonical worktree root before taking the lock, quiesces new writes, waits for admitted writes to drain, and retains `delete_complete_pending_finalize` after a post-delete metadata failure.

### Relay authentication

- Daemon E2EE ready frames carry a fresh per-channel auth challenge.
- The encrypted channel exposes the actual client ephemeral public key to the client and daemon transports.
- Client hello proof is generated after the E2EE channel opens and binds the daemon challenge plus actual client public key.
- Server compares hello binding fields with channel metadata before consuming a pairing token or verifying HMAC.
- Missing auth is rejected by default. Emergency compatibility requires `CHISACODE_RELAY_ALLOW_UNAUTHENTICATED_RECOVERY=1` and emits a high-severity startup log.
- Incomplete/invalid auth is rejected even in recovery mode and never attaches an authenticated device id.
- New client -> old daemon remains compatible because old E2EE ready has no auth challenge and the client omits the new auth envelope.

### Client secret storage

- `deviceSecret` is removed from serialized host registry data.
- Native uses Expo SecureStore; Electron uses sender-validated privileged IPC and `safeStorage`; Linux `basic_text` is rejected; Web is session-only.
- Existing plaintext registry secrets migrate on load and are stripped on the next registry write.
- Credential/host/connection deletion removes the platform secret before ordinary metadata.
- `expo-secure-store` `~57.0.1` and its config plugin were added for Expo SDK 57.

## Verification performed before the user stopped over-testing

These targeted checks apply primarily to archive/write-gate changes. They do not validate the later Relay/storage follow-up:

| Target                          | Result                                                                                                                      |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| workspace mutation coordinator  | 7 passed                                                                                                                    |
| worktree utility                | 19 passed                                                                                                                   |
| archive temp repository         | 3 passed                                                                                                                    |
| auto archive safety             | 15 passed                                                                                                                   |
| worker terminal manager         | 10 passed                                                                                                                   |
| worktree session                | 27 passed, 1 Windows skip                                                                                                   |
| agent manager                   | 116 passed; one pre-existing slow accounting test exceeded the default timeout and passed when isolated with a 30 s timeout |
| POSIX worktree suite on Windows | 39 skipped, not verified on POSIX                                                                                           |

No full workspace/package test suite was run.

## Verification after the stop instruction

No additional Vitest file or compatibility matrix was added or run.

- Relay package build: passed.
- Client typecheck after rebuilding Relay dist: passed.
- Server typecheck after rebuilding Relay dist: passed.
- App typecheck after secure-store integration: passed.
- Desktop typecheck after safeStorage IPC integration: passed.
- Targeted lint on the 22 archive/Relay source and test files: 0 warnings, 0 errors.
- Targeted lint on the 9 app/desktop secure-store files: 0 warnings, 0 errors.
- Formatting and `git diff --check`: passed.
- `package-lock.json` parses as valid JSON; unrelated npm lockfile normalization churn was restored, leaving only the SecureStore dependency additions.

## Remote CI snapshot

PR #32 run `31380923830` is bound to `d6ab2d44f`, not to the uncommitted follow-up.

Succeeded: format, lint, typecheck, test-audit, sdk-tests, relay-tests, all CLI shards, knip, secret-scan.

Failed: server tests on Ubuntu/Windows, desktop tests on Ubuntu/Windows, app tests, desktop-chain tests, Android Maestro, desktop-packaged Electron, coverage-server, knowledge-graph drift.

Playwright completed with failure at `2026-08-10T12:27:34Z`. The run is not full green and cannot satisfy the release exact-SHA gate.

## Unverified release blockers

- New/old Relay client-daemon compatibility and rejection matrix.
- Key-substitution and challenge-replay behavior on a real Relay connection.
- Electron safeStorage on a packaged build and Android/iOS SecureStore on real target surfaces.
- Web reload/re-pair UX.
- Human merge-to-archive drill.
- Full device revoke UI, pixel QA, formal draft release, and exact-SHA CI for the follow-up commit.

## Claim boundary

At capture time, the follow-up was code-complete in the isolated working tree and statically checked. It had not yet been committed, pushed, CI-validated, real-surface verified, or approved for a stable production release.
