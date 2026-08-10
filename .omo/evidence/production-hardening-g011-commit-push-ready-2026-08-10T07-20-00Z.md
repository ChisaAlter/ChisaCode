# G011 commit/push readiness (blocked on user authorization)

- recordedAt: 2026-08-10T07-20-00Z
- worktree: C:/Ai/ChisaCode-worktrees/production-hardening-2026-08-10
- branch: codex/production-hardening-2026-08-10
- HEAD: e9534e8df762bd95eead83e5562346c13b38b7a3 (pre-hardening baseline; working tree dirty)
- remote branch: absent
- authorization: **not granted** (user did not answer commit/push authorization prompt; plan §11 external-action gate)

## Critical CI trigger fact

`.github/workflows/ci.yml` currently:

```yaml
on:
  workflow_dispatch:
  push:
    branches: [cn-main]
  pull_request:
    branches: [cn-main]
```

Therefore:

- `git push origin codex/production-hardening-2026-08-10` alone does **not** run CI jobs.
- To get `desktop-packaged-electron` + full CI on the hardening SHA, authorized path is one of:
  1. **Open PR** `codex/production-hardening-2026-08-10` → `cn-main` (preferred; `pull_request` trigger), or
  2. `gh workflow run ci.yml --ref <branch-or-sha>` (`workflow_dispatch`), then confirm `head_sha` matches hardening commit.

Local `test:desktop-packaged` remains a substitute only; it does not satisfy plan §9 same-SHA Actions green.

## Staging inventory (exclusive hardening set)

Approx 95 paths. Do **not** stage Gateway dirt from main checkout. Worktree isolation already excludes those.

### Core implementation (must stage)

- Archive safety: `packages/server/src/server/workspace-mutation-coordinator.ts(+test)`, `auto-archive-on-merge/archive-if-safe.ts(+tests)`, `chisacode-worktree-archive-service.ts`, `utils/worktree.ts`, related session/worktree tests
- Git snapshot: `packages/server/src/server/git-snapshot.ts(+test)`
- Relay auth v2: protocol `relay-device-auth.ts(+test)`, connection-offer/messages/exports; server credential store/auth/websocket/pairing/bootstrap/relay-transport; client credentials + connection controller; app host-runtime/host-connection/pair UI/i18n; prototype + threat model
- WS lanes: `websocket-message-lanes.ts(+test)`, `websocket-server.ts`
- File transfer / terminal reconnect: client file-transfer + terminal-client + daemon-client
- CI/release gates: `.github/workflows/ci.yml` (+ release workflow touchups), `scripts/audit-tests.mjs`, `scripts/test-audit-baseline.json`, `scripts/require-ci-green-for-sha.mjs`, `scripts/push-current-release-tag.mjs`, app `test:desktop-packaged`
- Docs/graphs/security claim fixes + roadmap note + evidence under `.omo/evidence/production-hardening-*`

### Explicitly ignore / do not invent

- No secrets in staged auth files (device secrets are runtime-only; no hardcoded keys found in new modules)
- No `packages/protocol/src/relay-device-auth.js*` accidental emit
- No `packages/desktop/release/.unpacked-x64` binaries
- `.omc/` is gitignored (plan/ledger local only); plan residual §13 lives in tracked path only if copied outside `.omc` — current plan under `.omc/plans` will **not** ship unless re-homed. Tracked residual note is in `docs/refactors/comprehensive-improvement-roadmap.md` + `.omo/evidence/*` if evidence is committed.

## Authorized command sequence (do not run without user OK)

```bash
cd /c/Ai/ChisaCode-worktrees/production-hardening-2026-08-10

# 1) exclusive stage (example: add all intended hardening paths; review git status)
git add -A
# or path-scoped adds if any unrelated dirt appears

# 2) pre-commit local gates (already green this session; re-run if more edits)
npm run build:client
npx vitest run \
  packages/server/src/server/workspace-mutation-coordinator.test.ts \
  packages/server/src/server/git-snapshot.test.ts \
  packages/server/src/server/websocket-message-lanes.test.ts \
  packages/server/src/server/relay-device-auth.test.ts \
  packages/server/src/server/auto-archive-on-merge/archive-if-safe.test.ts \
  packages/server/src/server/auto-archive-on-merge/archive-if-safe.temp-repo.test.ts \
  packages/client/src/relay-device-credentials.test.ts \
  packages/protocol/src/relay-device-auth.test.ts \
  packages/client/src/daemon-client-binary-frames.test.ts \
  packages/client/src/terminal-stream-router.test.ts \
  --bail=1
npm run test:audit

# 3) commit
git commit -m "$(cat <<'EOF'
feat: production hardening for archive, relay auth, WS lanes, transfer, CI

Land fail-closed workspace archive coordination, git-snapshot leaf/HEAD baseline,
relay device-auth v2 (protocol/server/client/app + prototype), keyed WS message
lanes, multi-chunk file transfer timeouts, terminal stream resubscribe intents,
audit fingerprint baseline, exact-SHA release gate, and packaged Electron CI job.

Local gates: targeted unit matrix, archive temp-repo drill, desktop-packaged
slices. Residual real-surface items remain labeled in evidence.
EOF
)"

# 4) push branch
git push -u origin codex/production-hardening-2026-08-10

# 5) open PR so CI actually runs against cn-main PR trigger
gh pr create --base cn-main --head codex/production-hardening-2026-08-10 \
  --title "feat: production hardening (archive/auth/lanes/transfer/CI)" \
  --body "See .omo/evidence/production-hardening-* and plan residual acceptance. Does not claim section 9 complete until Actions green + remaining real-surface residuals closed."

# 6) wait for CI including desktop-packaged-electron
SHA=$(git rev-parse HEAD)
gh run list --branch codex/production-hardening-2026-08-10 --limit 5
# or watch PR checks
gh pr checks --watch

# 7) exact-SHA gate
node scripts/require-ci-green-for-sha.mjs --sha "$SHA"
```

## Current blocker

Cannot execute steps 3–7 without explicit user authorization to commit and push (and preferably open PR). Plan §11 + agent safety rules forbid inventing that authorization.

## Status honesty

- Plan section 9: **not complete**
- G010: `review_blocked`
- G011: still needs authorized commit/PR/CI path (or remains residual-accepted)
- Local packaged Electron: already PASSED (proxy only for Actions job)
