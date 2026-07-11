# Task 10 Report: Runtime Bounds

## Outcome

- Workspace hydration now stages all requested pages and commits only after every page succeeds for
  the newest server generation. Failures, timeouts, cancellation, and stale generations leave the
  hydrated flag unchanged and cannot overwrite a newer result.
- Direct WebSocket servers use an explicit 64 MiB `maxPayload`, matching the existing binary file
  transfer limit. Each logical session permits at most 64 concurrent async session messages; the
  next correlated request receives a bounded `rpc_error` with code `server_busy`.
- WebSocket validation/processing and Session/chat handler error logs retain bounded metadata only.
  They no longer attach raw payloads, parsed prompts, or raw `Error` objects.
- Chat waits default to 30 seconds, reject deadlines above 5 minutes, settle immediately for an
  explicit zero timeout, and bind to the owning Session `AbortSignal`. Settlement clears the timer,
  abort listener, and waiter entry exactly once.

## TDD Evidence

- Hydration RED: fetch failure wrote `{ hydrated: true }` when the test expected no hydration write.
- Chat RED: a missing timeout and then an explicit zero timeout left the promise pending until the
  Vitest 5-second test deadline.
- WebSocket RED: `WEBSOCKET_MAX_PAYLOAD_BYTES` was undefined when the test required 64 MiB.
- The WebSocket test additionally exercises exact-limit/one-over behavior with deferred Session
  handlers and sink-searches a unique prompt/error secret across all logger calls.

## Constants

- `WEBSOCKET_MAX_PAYLOAD_BYTES = 64 * 1024 * 1024`
- `MAX_SESSION_INFLIGHT_MESSAGES = 64`
- `CHAT_WAIT_DEFAULT_TIMEOUT_MS = 30_000`
- `CHAT_WAIT_MAX_TIMEOUT_MS = 5 * 60 * 1000`

## Verification

- `npx.cmd vitest run packages/app/src/contexts/session-workspace-hydration.test.ts --bail=1`
- `npx.cmd vitest run packages/protocol/src/chat/rpc-schemas.test.ts --bail=1`
- `npx.cmd vitest run packages/server/src/server/chat/chat-service.test.ts --bail=1`
- `npx.cmd vitest run packages/server/src/server/websocket-server.relay-reconnect.test.ts --bail=1`
- `npm.cmd run build:client`
- Protocol, server, and app workspace typechecks
- Targeted lint and formatting for all changed source/test files
- `git diff --check`

## Review Notes

- The overload response reuses the existing protocol-compatible `rpc_error` envelope and does not
  enqueue a secondary error-send queue.
- Inflight accounting lives on `SessionConnection`, so relay reconnect sockets share the same bound.
  The counter increments immediately before handler dispatch and decrements once in `finally`.
- No archived roadmap terminus was modified.

## Specification Review Follow-up

- `abort_request` now aborts only the current operation generation and immediately installs a fresh
  controller for later work. Chat waits resolve the current signal at call time; Session cleanup
  marks the Session disposed and aborts the active generation without renewal.
- Untrusted `clientId` and `requestId` log fields now use a shared `{ length, fingerprint }` summary.
  The SHA-256 fingerprint hashes at most 256 code units plus the full length, bounding CPU and log
  size without retaining raw prefixes or control characters. Malformed hello logs contain only a
  fixed category/code, issue count, and raw byte length.
- Hydration now uses a process-global monotonic generation counter and a map containing active
  generations only. A matching `finally` removes the current entry; stale generations cannot delete
  a newer entry, and generation numbers are never reused after cleanup.

### Follow-up RED/GREEN Evidence

- Same-Session abort RED: wait B registered zero active waiters after wait A was aborted because the
  captured signal remained permanently aborted. GREEN: Session dispatch seam 18/18.
- Logging RED: the sanitizer module was absent and a secret/control/20 KiB identifier appeared raw
  in structured trace/error fields. GREEN: sanitizer 1/1 and WebSocket tests 19/19.
- Hydration ABA behavior remained green before the structural cleanup because the old registry never
  removed entries; the expanded A/B/C regression remains green (hydration 7/7) while the monotonic
  counter plus matching-finally cleanup removes the registry leak without introducing ABA reuse.
