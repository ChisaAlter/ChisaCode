# G011 residual progress evidence

- recordedAt: 2026-08-10T07-11-32Z
- branch: codex/production-hardening-2026-08-10
- worktree: C:/Ai/ChisaCode-worktrees/production-hardening-2026-08-10
- main isolation: cn-main Gateway dirty files untouched

## Client build fix (this turn)

- Problem: worktree `node_modules/@chisacode/protocol` symlink resolves to main checkout package, so `@chisacode/protocol/relay-device-auth` export was invisible to client tsc even though worktree protocol package.json/dist had it.
- Fix: inline canonical transcript helper + HMAC proof helpers in:
  - `packages/client/src/relay-device-credentials.ts` (includes restored `buildPairingAuth`)
  - `packages/server/src/server/relay-device-auth.ts`
- Protocol package retains schemas/export for wire compatibility; crypto transcript is duplicated intentionally to survive workspace-link skew.
- `npm run build:client` => exit 0
- `npm run build:server-deps` => exit 0
- lint on auth files => 0 warnings / 0 errors

## Verification this turn

- auth unit matrix: client + server + protocol relay-device-auth => 10 passed
- archive disposable drill (temp-repo + coordinator + archive-if-safe): 23 passed
- core targeted matrix (coordinator/git-snapshot/lanes/auth): 39 passed
- expanded matrix attempt includes binary-frames/terminal-stream when present
- `npm run test:audit` => exit 0 (fingerprint baseline v2)
- `node scripts/require-ci-green-for-sha.mjs --sha deadbeef...` => exit 1 fail-closed (expected: no CI runs)
- release helper scripts syntax check => ok
- **Real packaged Electron surface**: `npm run test:desktop-packaged --workspace=@chisacode/app` => **ALL PACKAGED SLICES PASSED**
  - exe: `packages/desktop/release/.unpacked-x64/ChisaCode.exe`
  - daemon status running/desktopManaged true on isolated CHISACODE_HOME
  - slices B/C/D/E + SidebarV2 navigation green

## Residual still UNVERIFIED (do not claim plan complete)

- GitHub Actions `desktop-packaged-electron` job green end-to-end on windows-latest runner
- Mobile emulator/device pairing QA for device-auth v2
- Human UI merge→archive destructive drill on disposable worktree (automated temp-repo drill green only)
- Formal GitHub draft release dry-run with tag/artifacts
- Full pixel-for-pixel pairing prototype comparison on all surfaces
- Daemon device-list revoke admin UI beyond clear-local-credentials
- Transcript `clientPublicKeyB64` still uses daemon public key stand-in when ephemeral E2EE client key is not exposed

## Honest status

- G001–G009 remain complete
- G010 remains review_blocked (integration real-surface incomplete by original criteria)
- G011 progress: local packaged Electron QA + client build unblock + disposable archive automated drill advanced; not complete until remaining residual items verified or explicitly accepted out of scope

## Expanded targeted matrix (this turn)

- 10 files / **113 passed**: coordinator, git-snapshot, lanes, relay-device-auth (server/client/protocol), archive-if-safe + temp-repo, daemon-client-binary-frames, terminal-stream-router
- Does not replace residual real-surface items listed above
