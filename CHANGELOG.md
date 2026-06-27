# Changelog

All notable changes to ChisaCode will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Local usage statistics settings for tracking agent activity and usage patterns.
- `.nvmrc` and `engines.node` constraint for consistent Node.js versioning across contributors.

### Changed

- **Session handler decomposition**: The god-file `session.ts` has been progressively split into domain-specific handlers under `packages/server/src/server/session-handlers/`. This improves maintainability and test isolation.
  - Extracted pure helper functions to `session-helpers.ts`.
  - Migrated audio functions and internal types out of `session.ts`.
  - Created `SessionContext` interface and handler directory scaffold.
  - Completed `CheckoutGitHandler` migration (15 checkout methods + stash support).
  - Completed `ChatScheduleLoopHandler` split.
  - Completed `ProviderHandler` split.
  - Completed `TerminalScriptHandler` split.
  - Completed `Voice stub`, `ConfigControlHandler`, and `WorkspaceProjectHandler` splits.
  - Completed `AgentLifecycleHandler` split.
  - Removed dead code from `session.ts` after all extractions.
- `@chisacode/client` moved from `dependencies` to `devDependencies` in server package.
- `expo-two-way-audio` package metadata unified under ChisaCode org.
- Protocol package `./*` wildcard export replaced with explicit exports map.
- Improved tool call summaries and archive handling for better agent session context.
- Agent session flow and UI state handling refactored for stability.
- Completed assistant thoughts collapsed into summaries for cleaner timeline display.
- Host bootstrap refactored and assistant spacing tightened in UI.
- Documentation aligned with current codebase state.

### Fixed

- 57 `session.test.ts` failures repaired after handler split refactor.
- CLI install `.cmd` trampoline properly escapes `%` and `"` characters.
- Desktop `CHISACODE_ELECTRON_FLAGS` restricted to whitelist to prevent security flag injection.
- Desktop `browser:open-devtools` and `clear-partition` IPC commands now validate sender frames.
- Server wildcard (`0.0.0.0`) binding enforces password requirement to prevent unauthenticated LAN access.
- Desktop `transportPath` scoped to `CHISACODE_HOME` to prevent IPC endpoint path traversal.
- Android `versionCode` mapped from full version string to prevent Google Play upload conflicts.
- Test `opener.test.ts` no longer fails when Electron desktop-settings module is absent.
- Skills sync no longer deletes user-created files in the target directory.
- Auto-updater retains transient error cache with throttled polling timers.
- Desktop `local-transport` sessions `Map` now has an upper bound to prevent memory leaks.
- Desktop `isMainAppSenderUrl` validation tightened and PID filenames deduplicated.
- iOS `AudioEngine` buffers made dynamic; `setMicrophoneModeIOS` method renamed.
- Android `AudioEngine` tear-down properly closes the playback executor; RMS division-by-zero protected.
- Desktop drag-and-drop uses `webUtils.getPathForFile` to obtain native file paths.
- Voice `AudioEngine` converted to native singleton to prevent duplicate event dispatching.
- App resize handle split by platform to avoid native crashes.
- macOS `entitlements` file added to fix notarized builds.
- Agent lifecycle reconciliation improved for correctness.
- `syntheticModels` added to daemon config store gateway test expectations.

### Removed

- Obsolete Claude skills symbolic links and Trae planning documents.
- Accidentally committed temporary screenshots (`.gitignore` rule added).

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

[Unreleased]: https://github.com/ChisaAlter/ChisaCode/compare/v1.0.0...HEAD
[1.0.1]: https://github.com/ChisaAlter/ChisaCode/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/ChisaAlter/ChisaCode/releases/tag/v1.0.0
