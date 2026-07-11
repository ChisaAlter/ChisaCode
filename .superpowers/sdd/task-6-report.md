# Task 6 Report — GenUI action queue, validation, and failure recovery

## Status

Implemented on branch `codex/comprehensive-audit-fixes` from base `3eae591b8eacbe8a2a1b0514422e7b2518418502`.

## Contract decisions

- `AgentManager` owns exactly one process-local `GenerativeUiActionQueue`, keyed by agent ID.
- Idle enqueue schedules one next-microtask dispatch so same-tick actions coalesce.
- Running enqueue never interrupts or replaces the active turn. Foreground terminal ownership is the `streamAgent` finalizer after its pending-run token settles; non-foreground terminal events notify after lifecycle handling.
- `change` keeps the newest value per `(instanceId, field)` without changing the field's first-seen order. `submit` closes its batch; later actions enter the next batch.
- A batch receives at most one start attempt. A failed batch is dropped with bounded metadata and is not retried; a later idle batch is scheduled independently so it cannot starve.
- Removed/closed agents clear pending queue state with bounded metadata. Logs never contain raw instance IDs, action names, payloads, or provider error text beyond the already-bounded agent ID and counts/reason.
- Server request limits are 256 characters for `instanceId`, 128 characters for `action`, and 65,536 UTF-8 bytes for serialized JSON payload. Cyclic, non-JSON, non-finite, getter-throwing, or oversized payloads are rejected before enqueue.
- App action dispatch validates the exact rendered component/action schema before calling the sender and preserves `Promise<boolean>` semantics.
- Form submission is a pure editable/submitting/submitted/error reducer flow. Only `true` submits; `false` or rejection produces a retryable error, and late resolutions after unmount are ignored.

## RED evidence

- Queue, action-dispatch, and form-state tests initially failed imports because the new production modules did not exist.
- Removed-agent queue test then failed `expected true to be false`, proving dead queue state was retained.
- Handler test failed `TypeError: this.context.getAgent is not a function`, proving the old Session-owned direct-send seam was still active.
- Running AgentManager test failed `expected startedPrompts length 2, got 1`, proving terminal notification occurred before the foreground pending-run lifecycle fully settled and the follow-up starved.
- Existing registry behavior explicitly expected unknown action names not to throw; the expectation was inverted before implementation.

## GREEN verification

- `generative-ui-action-queue.test.ts`: 6 passed.
- `generative-ui-handler.test.ts`: 8 passed.
- Focused AgentManager `enqueueGenerativeUiAction` tests: 2 passed, 107 skipped by name filter.
- `action-dispatch.test.ts`: 5 passed.
- `generative-form-state.test.ts`: 3 passed.
- `registry.test.ts`: 11 passed.
- Server workspace typecheck passed.
- App workspace typecheck passed.
- Targeted lint across 18 changed TypeScript files reported 0 warnings and 0 errors.
- Targeted formatting completed and `git diff --check` passed.

## Files changed

- Server: manager-owned queue implementation/tests, AgentManager lifecycle integration/tests, bounded handler validation/tests, narrow session context ownership.
- App: exact action dispatcher/tests, strict registry validation, renderer component binding, bounded hook errors, pure form reducer/tests, retry-safe form integration.
- No protocol schema changed; resource ownership remains in the server handler/domain layer and Task 5 wire contracts remain append-only and unchanged.

## Self-review and residual concerns

- No new path references `replaceAgentRun`; active turns are neither canceled nor mutated.
- Duplicate terminal signals cannot double-start because existing finalized-turn tracking suppresses duplicate lifecycle processing and queue scheduled/dispatching flags suppress duplicate dispatch.
- Background start rejection is caught and logged with bounded metadata; no unhandled rejection path remains.
- Queue state is intentionally process-local and is not persisted across daemon restart.
- UI integration was verified by pure tests and app typecheck; per repository rules, no web preview was used as a substitute for desktop/mobile validation.

## Commit

Implementation commit: `69a94a292`.

## Spec-review follow-up

- Fixed terminal `error` retention: unavailable status classification now includes missing, closed, and error agents. Duplicate terminal notifications clear/log once and never start a follow-up.
- Added a synchronous `GenerativeFormSubmissionController`: the first `begin()` locks immediately, false/rejection completion unlocks for retry, and successful completion keeps the submitted lock.
- Strict Effects lifecycle is explicit: effect setup calls `mount()`, cleanup calls `unmount()`, remount accepts a pending completion, and actual-unmount completion is ignored.
- RED evidence: error-status queue test retained state (`expected true to be false`); controller test failed because the factory did not exist.
- GREEN evidence: queue 7 passed; focused AgentManager 3 passed; form state/controller 6 passed; handler 8 passed; action dispatch 5 passed; server/app typechecks passed.
- Follow-up implementation commit: `8a7e18148`.
