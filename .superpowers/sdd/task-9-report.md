# Task 9 Report: DaemonClient Connection Settlement and File-Frame Boundaries

## Outcome

- Exported the documented `MAX_FILE_TRANSFER_BYTES` protocol constant at 64 MiB through the
  existing `@chisacode/protocol/binary-frames/index` subpath.
- Made `close()` reject the current pending `connect()` with `Daemon client closed` before
  clearing its resolver state.
- Scoped transport callbacks to their owning transport so late open, error, close, or message
  events cannot mutate a disposed client or a newer connection attempt.
- Validated file metadata before creating an accumulator and tracked `receivedBytes` before
  retaining chunks.
- Rejected oversize, overflow, over-declared, under-declared, duplicate-start, and pre-start
  frame sequences while clearing retained transfer state.
- Required exact length at `FileEnd`, including successful zero-byte and 64 MiB boundary cases.
- Cleared active binary transfers on disconnect and explicit close.

## TDD Evidence

### RED

- `npx.cmd vitest run packages/client/src/daemon-client-reconnect.test.ts --bail=1`
  failed because the immediate `connect()` then `close()` promise remained unresolved and the
  test timed out after 5000 ms.
- `npx.cmd vitest run packages/client/src/daemon-client-binary-frames.test.ts --bail=1`
  failed because `MAX_FILE_TRANSFER_BYTES` was undefined.

### GREEN

- Reconnect tests: 11 passed.
- Binary-frame boundary tests: 51 passed.
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
- The accumulator is receive-side only (`readFile` downloads); uploads do not share this state.
- Errors contain byte counts and protocol context only, never raw file contents.
- No package export-map change was required because the existing explicit binary-frame index
  subpath already exports `file-transfer.ts`.
