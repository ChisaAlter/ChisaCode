# Phase 1B Git Snapshot Evidence

- recordedAt: 2026-08-10T05-55-37Z
- branch: codex/production-hardening-2026-08-10
- head: e9534e8df762bd95eead83e5562346c13b38b7a3

## Changes

- status uses --porcelain=v1 -z --untracked-files=all (leaf paths)
- temporary index seeded via git read-tree HEAD (full baseline tree)
- unborn/no-HEAD repos skip read-tree and start empty
- sensitive/ambiguous/directory tokens rejected before git add
- safe deletes via update-index --force-remove; adds batched
- skip empty tree-diff snapshots after filtering

## Tests

- npx vitest run packages/server/src/server/git-snapshot.test.ts --bail=1 => 18 passed
- nested vendor-cache/.env excluded while README baseline retained

## Residual

- additional unicode/symlink edge cases can be expanded later if needed
