# Changelog

All notable changes to ChisaCode will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Codex image attachments written to `os.tmpdir()` now use private permissions (file `0o600`, directory `0o700`) via `private-files.ts` helpers instead of the umask default, preventing other local users from reading user-supplied image content
- Stale Codex image attachments (older than 1h TTL) in `os.tmpdir()` are now cleaned up on session close, preventing unbounded temp file growth on long-lived daemons
- `assertTransportPathAllowed` socket branch now uses `path.relative` + `path.isAbsolute` instead of a case-sensitive `startsWith` prefix check, so legitimate Windows socket paths with mixed-case drive letters are no longer misrejected (mirrors the ACP `resolvePathInsideBase` guard)
- CLI `uncaughtException` handler now calls `process.exit(1)` instead of only setting `process.exitCode`, per Node's guidance that a process is in an undefined state after an uncaught exception and must not keep running
- `writeFileAtomic` now fsyncs the parent directory after the rename so the rename's directory-entry update is durable across crashes (POSIX only; best-effort on filesystems that do not support directory fsync)
- `EncryptedChannel.setState("open")` now calls `ensurePrng()` before generating the per-direction salt, so the salt is always produced with a configured PRNG even on runtimes without a default tweetnacl PRNG
- atomic-write mock test factory now imports `node:path` inside the `vi.mock` factory instead of closing over the outer `path` binding, removing a fragile dependency on vitest's hoist timing
- atomic-write 0o600 mode test now uses `test.skipIf` so Windows runs report the POSIX-mode assertion as skipped rather than an empty pass
- `cleanupStaleCodexImageAttachments` is now annotated `@internal` to make its test-only export status explicit
- Desktop transport path tests now include Windows same-drive case-insensitivity and cross-drive rejection regression locks using `path.win32`
- Relay no longer accepts unauthenticated v1 WebSocket upgrades by default. The v1 protocol has no E2EE and no relay-layer authentication, so anyone who knew a `serverId` could read/write all session traffic. `resolveRelayVersion` now defaults a missing/empty `v` to v2 (the current protocol) and rejects an explicit `v=1` unless `RELAY_ALLOW_V1=1` is set on the Worker (compat opt-in for staged rollouts). Current client and daemon source always emit `v=2`, so no active caller is affected; only legacy `< v0.1.76` deployments that omit `v` are now routed to v2 instead of v1.
- Relay v2 server sockets now require daemon relay-auth signatures by default. Daemons persist an Ed25519 signing key, include nonce/signature parameters on server-control and server-data WebSocket URLs, and the relay rejects unsigned or mismatched-key server sockets before replacing any existing daemon socket. Legacy unsigned server sockets require `RELAY_ALLOW_UNSIGNED_SERVER_AUTH=1`.
- Daemon wildcard bind (`0.0.0.0` / `::`) without a password is now fail-closed by default again. `assertWildcardAuth` once again throws and refuses to start, restoring the `95400d5bf` semantics that `d1dcd2d3c` had weakened to a warning for patch compatibility. Operators who need the legacy warn-and-continue behavior can set `CHISACODE_ALLOW_WILDCARD_NO_AUTH=1` (intended only for staged rollouts / self-hosted deployments that accept the LAN-exposure risk). The default is safe-by-default; compat and safety are no longer mutually exclusive. Tests restored to assert both fail-closed (default) and opt-in (warn) semantics.

- File explorer pane no longer crashes on initial load (`useTranslation` was called without destructuring `t`)
- Toast dismiss callback type mismatch (`string` vs `number` id) that could leave toasts stuck and leak timers
- `synthetic-models-section` referenced an undeclared `toast` in `useMemo` dependencies, blocking the app typecheck/build
- `.dockerignore` excluded entire package directories, breaking `COPY packages/*/package.json` in the Dockerfile
- `helpers.ts` could not name the `ToolCallBase` return type; `ToolCallBase` is now exported from `agent-sdk-types`
- `vitest.config.ts` `define: { __DEV__: "true" }` conflicted with the repo-wide `__DEV__ === false` convention
- Binary-frame 0xffff boundary test was a no-op (payload under the threshold, assertion guarded by an always-false `if`)
- `connect()` dedup test only asserted `instanceof Promise`; now verifies a concurrent connect creates no extra transport
- Reconnect test did not verify `lastError` is cleared after a successful reconnect
- `settings.usage.shareUnavailable` i18n key was missing (referenced but only defined under `settings.feedback`)
- `docker-compose.yml` exposed port 6767 on all interfaces by default; now binds to `127.0.0.1` only
- `knip.json` listed a non-existent `src/index.ts` entry for the protocol package
- Hardcoded Chinese strings in `sectionLabel`, accessibility labels, and `agent-status-dot` bypassed i18n; all now route through `t()`
- Toast animate-out callback could fire `onDismiss` after `ToastItem` unmount; animation is now stopped in cleanup
- Reconnect test could leak a pending connect timeout across the fake→real timer boundary; `vi.clearAllTimers()` added

### Changed

- Root `package.json` `overrides` now pins `@types/node` to `^22.10.0` to eliminate cross-package type drift
- `ci.yml` adds a top-level `permissions: { contents: read, actions: read }` block and a `knip` job
- `Dockerfile` adds a `HEALTHCHECK` probing `GET /api/health`
- `.gitignore` covers local agent tooling directories (`.omc/`, `.understand-anything/`, etc.) and `.tmp-*` captures
- `comprehensive-improvement-roadmap.md` reopened as the active improvement source of truth and registers the two draft plans

### Removed

- Tracked debug artifacts (`query.js`, `spawn.js`, `.tmp-*.png`, `ChisaCode.lnk`) and local agent state directories (`.omc/`, `.understand-anything/`, `.workbuddy/`)

## 1.0.2 - 2026-06-28

### Added

- Local usage statistics make recent agent activity and usage history easier to review
- Agent and workspace lists now show running, finished, error, and permission-needed states at a glance

### Changed

- Message, markdown, shortcut, and diff views are easier to scan with clearer spacing and themed colors
- User and assistant messages can be copied from the message context menu
- Windows development startup handles occupied daemon ports more smoothly
- Agent sessions are more reliable across checkout, provider, terminal, schedule, and workspace actions
- Release checks now cover more publishable packages before a version is shipped

### Fixed

- Windows CLI installs handle special characters in npm command shims correctly
- Desktop security checks now reject unsafe Electron flags, untrusted IPC senders, and transport paths outside `CHISACODE_HOME`
- Daemons bound to `0.0.0.0` now warn when access is exposed without a password
- Android uploads use stable version codes to avoid Google Play conflicts
- Voice and audio cleanup is more reliable on iOS and Android
- Desktop drag-and-drop, auto-updates, and local transport cleanup are safer
- Skills sync preserves user-created files in the target directory
- Native resize handles no longer crash non-web app surfaces
- macOS builds include the entitlements needed for notarization

## [1.0.1] - 2026-06-18

### Added

- **Agent delegation P0/P1 foundations**: Scoped companion MCP tools for agent delegation, status tracking, cancellation, and result collection.
- **Synthetic model gateway**: Configuration and lifecycle support for model-of-agents gateways (Claude, Codex, OpenCode, MiMoCode, Pi, Kimi Code).
- **Liquid neon theme** and glass-morphism UI surfaces across desktop and app.
- Built-in provider metadata in the shared protocol manifest covering Claude, Codex, OpenCode, MiMoCode, Pi, and Kimi Code.
- Settings surfaces for skills management, MCP server management, and custom model providers.
- CLI and skills documentation in both English and Chinese.

### Changed

- Provider discovery, snapshots, and registry plumbing unified across daemon, client, app, CLI, and MCP surfaces.
- Workspace draft state, sidebar session state, host routing, and project selection tightened across desktop, web, and mobile.
- Agent lifecycle metadata now distinguishes subagent, handoff, detached, and team-slot relationships.
- Desktop and app UI refreshed with updated theme tokens and glass components.
- Release automation handles desktop signing secrets and Android native project generation more reliably.

### Fixed

- Synthetic model gateway responses return consistently for all supported gateway formats.
- Provider hover and settings code satisfies current typecheck expectations.
- Android APK release builds generate the native project before Gradle packaging.
- Desktop release packaging no longer requires unrelated local secrets for GitHub artifacts.

## [1.0.0] - 2026-06-15

### Added

- **GitHub release update checks** for automatic update notifications.
- **Custom provider configuration** with model gateway settings.
- **Workspace dock commands** for managing agent workspaces.
- Desktop workspace environment panel and home screen refinements.
- Full surface localization for ChisaCode UI.

### Changed

- Project renamed from Fleurdelys to **ChisaCode**.
- Provider settings and sidebar state refined.
- Agent lifecycle handling improved.
- Agent tool versioning and management consolidated.
- Desktop shortcut updates and README refresh (removed demo images, added bilingual README).

### Fixed

- Sidebar navigation redesigned for consistency.
- Desktop workspace layout aligned across surfaces.
- Composer draft agent selector stabilized.
- Turn changes dock state corrected.
- Local desktop runtime fixes synced.

[Unreleased]: https://github.com/ChisaAlter/ChisaCode/compare/v1.0.2...HEAD
[1.0.2]: https://github.com/ChisaAlter/ChisaCode/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/ChisaAlter/ChisaCode/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/ChisaAlter/ChisaCode/releases/tag/v1.0.0
