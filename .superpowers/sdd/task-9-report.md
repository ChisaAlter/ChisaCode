# Task 9 Report: DaemonClient Connection Settlement and File-Frame Boundaries

## Outcome

- Exported the documented `MAX_FILE_TRANSFER_BYTES` protocol constant at 64 MiB through the
  existing `@chisacode/protocol/binary-frames/index` subpath.
- Made `close()` reject the current pending `connect()` with `Daemon client closed` before
  clearing its resolver state through the shared exactly-once settlement helper.
- Scoped transport callbacks to their owning transport so late open, error, close, or message
  events cannot mutate a disposed client or a newer connection attempt, including after an
  asynchronous Blob conversion completes.
- Validated file metadata before creating an accumulator and tracked `receivedBytes` before
  retaining chunks.
- Rejected oversize, overflow, over-declared, under-declared, duplicate-start, and pre-start
  frame sequences while clearing retained transfer state.
- Required exact length at `FileEnd`, including a successful zero-byte transfer and acceptance of
  64 MiB metadata before exact-length enforcement.
- Copied accepted chunk payloads into accumulator-owned storage so small views cannot retain or
  remain mutable through a much larger transport backing buffer.
- Cleared active binary transfers on disconnect and explicit close.

## TDD Evidence

### RED

- `npx.cmd vitest run packages/client/src/daemon-client-reconnect.test.ts --bail=1`
  failed because the immediate `connect()` then `close()` promise remained unresolved and the
  test timed out after 5000 ms.
- `npx.cmd vitest run packages/client/src/daemon-client-binary-frames.test.ts --bail=1`
  failed because `MAX_FILE_TRANSFER_BYTES` was undefined.
- Follow-up reconnect RED failed because a deferred Blob from the old transport moved the new
  reconnect attempt to `connected`.
- Follow-up binary RED returned byte `99` after the source backing buffer was mutated, instead of
  preserving the accepted byte `7`.

### GREEN

- Reconnect tests: 12 passed.
- Binary-frame boundary tests: 55 passed.
- Existing daemon-client tests: 74 passed.

## Verification

- `npm.cmd run build:client`
- `npm.cmd run typecheck --workspace=@chisacode/protocol`
- `npm.cmd run typecheck --workspace=@chisacode/client`
- `npm.cmd run lint -- packages/protocol/src/binary-frames/file-transfer.ts packages/client/src/daemon-client.ts packages/client/src/daemon-client-reconnect.test.ts packages/client/src/daemon-client-binary-frames.test.ts`
- `npm.cmd run format:files -- packages/protocol/src/binary-frames/file-transfer.ts packages/client/src/daemon-client.ts packages/client/src/daemon-client-reconnect.test.ts packages/client/src/daemon-client-binary-frames.test.ts .superpowers/sdd/task-9-report.md`
- `git diff --check`

## Review Notes

- Diff reviewed against base `eea1e854d`.
- Follow-up spec review confirmed `close()` invokes the pending rejection before clearing all
  connect settlement fields.
- Follow-up quality review confirmed transport identity is rechecked after deferred Blob decoding
  and chunk payloads are copied only after size validation.
- The maximum metadata boundary remains covered without constructing a full 64 MiB transfer,
  avoiding test-only peak memory above the production cap.
- The accumulator is receive-side only (`readFile` downloads); uploads do not share this state.
- Errors contain byte counts and protocol context only, never raw file contents.
- No package export-map change was required because the existing explicit binary-frame index
  subpath already exports `file-transfer.ts`.
