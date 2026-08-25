# Client Test Hardening & E2E Helper Integrity Plan (2026-08-25)

Status: **Phase 1 in progress** (branch `cursor/audit-fixes-2026-08-25-7503`, PR [#33](https://github.com/ChisaAlter/ChisaCode/pull/33)).

This document is the design artifact for the next delivery batch after the cn-main
CI green-up work. It covers four tracks:

1. **M6 Client Test Hardening** — systematic reconnect-state-machine and binary-frame
   boundary tests in `packages/client`.
2. **E2E Helper Integrity** — root cause, full-scan method, fix patterns, and a
   permanent guard against the "helper silently references removed UI" failure class.
3. **Verification Gate Plan** — S1 390px viewport, M5 Electron Provider Settings smoke,
   and the PR #33 merge gate, including preconditions this environment cannot satisfy.
4. **Phased execution plan** with dependencies and exit criteria per phase.

An adversarial-review record is at the end: what was revised and which downgrades were
rejected.

---

## 0. Current state (reviewed before planning)

### 0.1 PR #33 / CI status (as of 2026-08-25 ~13:00 UTC)

- PR #33 is OPEN, mergeable, base `cn-main`, head `cursor/audit-fixes-2026-08-25-7503`.
- Latest full CI run for HEAD~2 (run 32840669563, includes the server-test realign but
  not the e2e-unstick commit): green on lint/typecheck/format/knip/secret-scan/app-tests/
  coverage-server/relay/sdk/cli 1-2; **red** on: server-tests (both OSes, 15 e2e tests),
  desktop-tests (both OSes), cli-tests shard 3/3, desktop-packaged-electron,
  desktop-chain-tests, android-maestro-tests, knowledge-graph-drift, test-audit;
  playwright still running.
- Run 32830518928 (HEAD~3) playwright: **50 failed / 62 passed / 2 flaky**.
- A fresh run for HEAD (32848031030, includes the CI workflow-env fix and the
  archive-tab/sessions/stream-ui unstick) was queued at 12:31 UTC.

### 0.2 Root-cause classification of the 50 Playwright failures

| Class                      | Count (approx.) | Examples                                                                                                                                                                 | Root cause                                                                                                                                                                                                                                                            |
| -------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **zh-CN copy drift**       | ~30+            | `getByText("Connections")`, `getByRole("button", { name: /Select model/ })`, `getByPlaceholder("Search issues and PRs...")`, header `/^(Usage\|用量统计)$/` got `"用量"` | `packages/app/src/i18n/index.ts` exports `createAppI18n("zh-CN")` as the default instance; the suite still asserts English copy. Deliberate product decision (CN fork), tests are stale.                                                                              |
| **testID drift**           | 2 tests         | `settings-host-local-marker` not found                                                                                                                                   | The July redesign (commit 1eaac320) replaced the "Local" text badge with an unlabeled dot `<View style={sidebarStyles.localDot} />` and dropped the testID.                                                                                                           |
| **Product-behavior drift** | ~4              | `host-page-pair-device-row` count 1 (expected 0); `/quit` stays on `/workspace/...` (expected `/sessions`)                                                               | (a) `resolveLocalDaemonServerId` now treats any loopback direct-TCP host as the local daemon, so the seeded 127.0.0.1 e2e host renders local-only rows; (b) the pinned-archived-agent fix (172cb6ad) intentionally keeps the archived agent focused in the workspace. |
| **Races / infra**          | rest            | turn-anchor, workspace-agent-title-handoff timeouts                                                                                                                      | Partially addressed by 172cb6ad; remainder to be re-triaged against the fresh run.                                                                                                                                                                                    |

### 0.3 Existing client test coverage (what NOT to duplicate)

- `daemon-client-reconnect.test.ts` (15 tests): initial-failure retry, drop → auto
  reconnect, close() stops retry, stale-transport Blob, ensureConnected lifecycle,
  exponential backoff schedule, jitter pure-function bounds, injected jitter source,
  reconnect-disabled config, state transitions.
- `daemon-client-binary-frames.test.ts` (~40 tests): file-transfer length/opcode/
  requestId boundaries, declared-size enforcement, terminal frame round-trips,
  transport utf8/decode utilities.
- `daemon-client-inbound-controller.test.ts` (3 tests): terminal frame as UTF-8 string,
  same frame as bytes, JSON not misrouted to binary.
- `daemon-client-connection-controller.test.ts` (3 tests): hello handshake + strict send,
  connect timeout single reset boundary, liveness probe coalescing.
- `daemon-client-request-coordinator.test.ts` (3 tests): correlation, rpc_error
  surfacing, queued-send flush/reject.
- `daemon-client.test.ts` (73 tests) includes: repeated liveness timeout → reconnect,
  relay close reason, checkout-diff resubscribe after reconnect.

---

## 1. M6 Client Test Hardening Design

### 1.1 Gap analysis

The reconnect state machine (`DaemonConnectionController`) has untested edges:

| #   | Edge                                                                                                                                                                                | Risk if broken                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| R1  | **Hello-ack loss**: socket opens, hello sent, `server_info` never arrives → connect timeout → retry → success resolves the _original_ `connect()` promise                           | Client hangs forever on flaky relay handshakes                        |
| R2  | **In-flight RPC across drop**: request sent, transport closes before response → waiter must reject promptly via `onReset` → `coordinator.clear()`, not dangle until its own timeout | Silent 10-30s UI stalls after network blips                           |
| R3  | **Reconnect storm coalescing**: bursts of `onError`+`onClose`+`onError` from one transport must arm exactly one reconnect timer; events from a replaced transport must be ignored   | Thundering-herd reconnects, double transports, duplicated hellos      |
| R4  | **Backoff cap and attempt reset**: delays follow `min(base·2^n, max)`; after a successful connect the attempt counter resets to 0 so the next drop starts at base delay             | Permanent 30s reconnects after one long outage                        |
| R5  | **Runtime reconnect toggle**: `setReconnectEnabled(false)` mid-session stops retries on the next drop; re-enable + `ensureConnected()` recovers                                     | Background/foreground lifecycle leaks connections or goes dead        |
| R6  | **Liveness threshold**: one liveness timeout does NOT reconnect; the second consecutive one does; inbound activity resets the counter                                               | Ping jitter causing spurious reconnects, or dead links never detected |
| R7  | **Generic transport-error debounce**: a bare "Transport error" is held for 250ms; a close arriving within the window must produce a single reset, not two                           | Double reset → duplicated onReset side effects in app stores          |

The binary/demux path (`DaemonClientInboundController.handle`) has untested edges:

| #   | Edge                                                                                                                                                                                    | Risk if broken                                         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| B1  | **Relay string path for file-transfer frames**: binary file frames whose bytes are valid UTF-8 arrive as _strings_ over the relay E2EE codec and must reach `fileTransfers.handleFrame` | File reads over relay corrupt or silently drop         |
| B2  | **Invalid binary bytes fall through to JSON** and are dropped without throwing; the stream keeps processing subsequent messages                                                         | One bad frame poisons the whole connection             |
| B3  | **JSON delivered as bytes** (ArrayBuffer/Uint8Array starting `{` 0x7b) routes to the JSON path, never to binary                                                                         | Session messages over binary websocket transports lost |
| B4  | **Malformed JSON / schema-invalid JSON** dropped with a warn log; waiters unaffected                                                                                                    | Validation failures crash the handler loop             |
| B5  | **Pong routing** resolves the liveness probe through the same demux                                                                                                                     | Liveness false-timeouts                                |
| B6  | **Opcode precedence**: bytes decodable as a file-transfer frame must be consumed before the terminal decoder sees them                                                                  | Cross-protocol frame corruption                        |

### 1.2 Test placement and fake-dependency policy

- R1-R5, R7 → extend **`daemon-client-reconnect.test.ts`** (DaemonClient level, existing
  fake-transport + fake-timer harness) and **`daemon-client-connection-controller.test.ts`**
  (controller level where DaemonClient wiring is irrelevant). R6 controller-level.
- B1-B6 → extend **`daemon-client-inbound-controller.test.ts`** (pure controller harness
  with injected callbacks; no sockets).
- **No `vi.mock` anywhere.** Fakes are injected through the existing seams:
  `transportFactory` (a hand-rolled `DaemonTransport`), `logger`, `reconnect.jitterRandom`,
  and the `DaemonClientInboundControllerOptions` callback object. `vi.useFakeTimers()` is
  used only where timing itself is the subject (backoff, debounce, timeout), matching the
  existing suite style and the AGENTS.md fixed-waits rule.
- Every test must assert observable contract (promise settlement, factory call counts,
  emitted frames, listener payloads) — no private-state peeking.

### 1.3 Acceptance criteria

- All new tests pass with `npx vitest run <file> --bail=1`; zero new lint/type errors.
- Each row in the R/B matrices maps to at least one named test.
- No fixed `setTimeout` sleeps; fake timers or event-driven resolution only.
- CI client suite stays green.

## 2. E2E Helper Integrity Design

### 2.1 Root cause of the failure class

`openSessions` clicked `sidebar-sessions`, which had silently become a list _container_
rather than a navigation control — the click hit a non-interactive element, did nothing,
and downstream assertions timed out with misleading errors. The general class:
**e2e helpers bind to UI contracts (testIDs, copy, routes) with no compile-time or
static link to the app source, so UI refactors rot them silently.** Sub-classes found
by the full scan (2026-08-25):

1. **Removed testIDs still referenced** (loud-but-misattributed failures):
   `settings-host-local-marker` (removed with the July sidebar redesign).
2. **Dead helpers referencing removed testIDs** (rot, no failure yet): in
   `e2e/helpers/app.ts`, the helpers `setWorkingDirectory`, `selectProvider`,
   `selectModel`, `selectMode`, `createAgent`, `createAgentWithConfig`,
   `createAgentInRepo`, `ensureHostSelected`, `preferFastThinkingOption` reference
   `working-directory-select`, `agent-model-selector`, `draft-*-select`,
   `agent-thinking-menu`, `worktree-attach-*` — none exist in `packages/app/src`
   anymore, and no spec imports these helpers.
3. **Copy drift under zh-CN default**: English `getByText`/`getByRole(name)`/
   `getByPlaceholder` assertions against a UI that now renders `zh-CN` by default.
4. **Conditional-skip silent failures**: the
   `if (await x.isVisible().catch(() => false)) { ... } else return;` pattern turns a
   missing element into a silent no-op (e.g. `preferFastThinkingOption`).

### 2.2 Full-scan method (repeatable)

1. Extract every literal testID from `packages/app/e2e` via
   `getByTestId("...")` and `[data-testid="..."]` / `[data-testid^="..."]` patterns.
2. For templated IDs (`foo-${x}`), reduce to the static prefix.
3. Cross-check each against `packages/app/src` + `packages/desktop/src` (`testID=`,
   template testIDs). Report IDs with no source match.
4. For each hit, classify: (a) spec-reachable → real red; (b) helper-only dead code →
   delete; (c) dynamic false positive → allowlist.

Executed 2026-08-25: 186 unique IDs, 19 initially missing, 11 confirmed genuinely
missing after false-positive elimination (see §2.1 items 1-2), 1 of them
(`settings-host-local-marker`) reachable from a live spec and matching an actual CI
failure (`settings-host-page.spec.ts:85`).

### 2.3 Fix patterns

| Pattern                                     | When                                                                                  | Example                                                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Route-direct navigation + URL assertion** | The clicked control was a navigation affordance that no longer exists                 | `openSessions` (already fixed in 172cb6ad)                                                                |
| **Restore semantic testID on the new UI**   | The UI element still exists conceptually (local marker dot) but lost its contract     | Add `testID="settings-host-local-marker"` to the sidebar local dot                                        |
| **Delete dead helpers**                     | No spec imports the helper and the UI it drives is gone                               | `app.ts` draft-composer helpers                                                                           |
| **Localized assertion table**               | Copy assertions under zh-CN default                                                   | Extend `LOCALIZED_TEXT` / `localizedRegex` in `helpers/settings.ts`; longer term assert testIDs over copy |
| **Follow product-behavior change**          | Spec encodes superseded behavior                                                      | pair-device row now legitimately renders for loopback hosts; `/quit` stays in workspace                   |
| **Ban conditional-skip on required steps**  | A helper step that must happen may not be guarded by `isVisible().catch(() => false)` | Assert visibility, then act                                                                               |

### 2.4 Guard against regressions (the anti-fake-green rule)

New unit test `packages/app/src/testing/e2e-testid-integrity.test.ts` (runs in the
normal `app-tests` Vitest project, no browser needed):

- Statically scans `packages/app/e2e/**/*.ts` for literal testID references.
- Asserts every static ID (or template prefix) resolves to a `testID` in
  `packages/app/src` or `packages/desktop/src`.
- Maintains an explicit, commented allowlist for IDs that are constructed dynamically
  in ways the scanner cannot follow. Every allowlist entry needs a justification.
- Failure message names the referencing e2e file so the break is attributable in CI
  **before** a Playwright run burns 90 minutes.

Out of scope for the guard (documented, not silently ignored): copy assertions
(`getByText` with literals) — the fix for those is migrating assertions to testIDs or
`localizedRegex`; a copy-drift lint is Phase 3 material.

### 2.5 Regression case list

- `settings-host-page.spec.ts:85` local-marker → green after testID restore.
- `settings-host-page.spec.ts:51` pair-device on loopback host → assertion updated to
  the loopback-is-local contract.
- `client-slash-commands.spec.ts:112/120` `/quit` navigation → asserts archived-agent
  stays focused in the workspace (the 172cb6ad product contract).
- Settings navigation/host suites under zh-CN copy → `localizedRegex` everywhere the
  spec asserts copy.
- The guard test itself is the regression test for the whole testID class.

## 3. Verification Gate Plan

### 3.1 PR #33 merge gate (Phase 0)

- **Precondition**: fresh CI run on HEAD completes.
- **Pass**: all required checks green → human merges (per prior agreement, no auto-merge).
- **Fail**: classify failures with the §0.2 taxonomy; fix statically-provable classes
  in-branch; re-run. Server e2e timing failures (idle-vs-running races, 5s waitFor
  timeouts under CI load) are re-run once before being treated as real regressions.
- **Known blockers not fixable from this environment**: android-maestro-tests and
  desktop-packaged-electron require emulator/display runners; their failures must be
  triaged from CI artifacts.

### 3.2 S1 — 390px real-viewport verification

- **Preconditions**: local Expo web (`npm run dev:app`) or packaged desktop build;
  Playwright with `viewport: { width: 390, height: 844 }` (or a real device).
- **Steps**: load Soft Home, open a session, open composer, open settings; assert no
  horizontal scroll (`document.documentElement.scrollWidth <= 390`), the compact
  form-factor layout engages (`useIsCompactFormFactor` path: sidebar overlays, single
  panel), and interactive controls remain ≥44px touch targets on the audited screens.
- **Pass**: all screens render without clipped/overflowing primary controls.
- **Not executable in this VM this round** (no packaged build, no display) → labeled
  **unverified**; the step list above is the runbook for whoever holds the environment.

### 3.3 M5 — Electron Provider Settings smoke

- **Preconditions**: `expo export` → `packages/app/dist`, then `tsc` in
  `packages/desktop` (both layers, in that order), `electron-builder` unpacked dir.
- **Steps**: cold-start the unpacked app → Settings → host page → Providers section:
  add/edit a custom provider, toggle enable, verify persistence across an app restart,
  and confirm no renderer-console errors.
- **Pass**: all interactions work and persist; `main.log` free of bridge errors.
- **Not executable in this VM this round** → **unverified**, runbook stands.

## 4. Phased execution plan

| Phase | Content                                                                                                                                                                                | Depends on                   | Exit criteria                                                                |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------- |
| **0** | PR #33 CI green-up: fix statically-provable Playwright classes (testID restore, zh-CN copy in the settings cluster, product-drift specs); re-triage the fresh run                      | Fresh CI results             | All fixable classes committed; remaining reds have named owners/blockers     |
| **1** | M6 first batch: R1-R7 + B1-B6 landed with the §1.2 placement                                                                                                                           | none (parallel with 0)       | Matrices fully mapped to passing tests; typecheck/lint green                 |
| **2** | E2E helper integrity: fixes + dead-code removal + guard test                                                                                                                           | §2 scan (done)               | Guard test green in CI; zero unallowlisted missing IDs                       |
| **3** | Real-surface gates: S1 390px, M5 Electron smoke; zh-CN copy-drift sweep of the remaining specs (desktop-updates, composer-attachments, bottom-sheet, new-workspace, projects-settings) | Packaged env; Phase 0 merged | Runbooks executed and evidenced, or explicitly labeled unverified with owner |

## 5. Adversarial review record

Revisions made after self-review:

1. **Rejected downgrade**: an early draft scoped M6 to "binary boundary tests only"
   because `daemon-client-binary-frames.test.ts` already looked thorough. Review found
   the _demux_ and _reconnect-edge_ layers (inbound controller, controller storm/ack
   paths) are where silent production failures live; codec-level tests alone would have
   been fake completeness. Both matrices are now mandatory.
2. **Rejected downgrade**: fixing only `openSessions`-style navigation helpers. The
   scan proved the wider class (dead helpers, copy drift, removed testIDs) is the actual
   debt; the guard test is the deliverable that prevents recurrence, not any single fix.
3. **Rejected fake green**: marking S1/M5 as "done via web preview". AGENTS.md forbids
   substituting surfaces; they stay explicitly unverified with runbooks.
4. **Corrected assumption**: the plan initially treated the 50 Playwright failures as
   flake. Log forensics showed ~30 are deterministic zh-CN copy drift and several are
   deliberate product-behavior changes — i.e. spec debt, not flake. Phase 0 was
   re-scoped accordingly.
5. **Loophole closed**: the guard test originally asserted only helper files; specs
   also reference testIDs directly, so the scan covers all of `e2e/**/*.ts`.
6. **Scope honesty**: the zh-CN copy sweep across all 16 affected specs is too large to
   land verified in one round; it is explicitly Phase 3 with the settings cluster done
   first (highest failure density), rather than pretending a full sweep.
