# Desktop Daemon Hard-Bind Verification — 2026-08-09

## Summary

Desktop Electron app is now hard-bound to its built-in daemon. Cold start always starts the daemon regardless of `manageBuiltInDaemon` setting; the app never falls back to the welcome route on daemon startup timeout.

## Verification Environment

- Platform: Windows 10 (win32 10.0.26200 x64)
- Build: `packages/desktop/release/win-unpacked/ChisaCode.exe` (1.0.2, Electron 41.2.0)
- Date: 2026-08-09

## Test Results

### Test 1: Normal cold start (manageBuiltInDaemon=true)

- **Result: PASS**
- Port 6767 listening (OwningProcess confirmed)
- `daemon status --json`: `localDaemon=running`, `connectedDaemon=reachable`, `desktopManaged=true`
- Renderer connected: `helloResumed:1, helloNew:2`, `fetch_agents`, `fetch_workspaces`, `checkout_status` requests flowing
- No welcome redirect in main.log

### Test 2: Cold start with manageBuiltInDaemon=false

- **Result: PASS**
- Pre-condition: `desktop-settings.json` set to `manageBuiltInDaemon: false` (no BOM)
- Daemon started successfully despite management disabled:
  - main.log: `initial status check` → `starting detached` → `spawn returned` → `grace period completed` → `polling: running, listen: 127.0.0.1:6767`
  - No "daemon 管理已禁用" error (assert removed from startDaemon)
- `daemon status --json`: `localDaemon=running`, `connectedDaemon=reachable`, `desktopManaged=true`
- Port 6767 listening
- Renderer connected and making requests

### Test 3: No welcome fallback on desktop

- **Result: PASS (by code inspection + log analysis)**
- main.log shows daemon start sequence, no `/welcome` redirect
- `resolveStartupRedirectRoute` with `isDesktop=true` returns null (stays on splash) instead of WELCOME_ROUTE
- `shouldArmStartupGiveUpToWelcome` returns false for desktop → give-up timer not armed
- `index.tsx` hard-escape returns `StartupSplashScreen` instead of `<Redirect href="/welcome" />` for desktop

### Test 4: Connecting timeout + storeReady unlatch (code-verified)

- **Result: PASS (unit test verified)**
- `DaemonStartService` connecting watch: 20s timeout sets `lastError` → `hasSettledWithError()=true` → storeReady unlatches
- Unit test `daemon-start-service.test.ts`: "surfaces a timeout error when the connection does not reach online within the timeout" passes
- Unit test: "clears the timeout when the connection reaches online before the deadline" passes

### Test 5: Retry semantics (code-verified)

- **Result: PASS (unit test verified)**
- `BootstrapProvider.retry`: if `hasEverSucceededCheck() && !online` → calls `service.restart()` (stop+spawn)
- Unit test: "calls restartDesktopDaemon instead of startDesktopDaemon" passes
- Unit test: "reports an error when restart throws" passes

### Test 6: Unit tests

- `host-runtime-bootstrap.test.ts`: 34 tests passed
  - Desktop + giveUp → null (not welcome)
  - Desktop + online → Soft Home
  - Non-desktop + giveUp → welcome (regression)
  - `shouldArmStartupGiveUpToWelcome` all branches
- `daemon-start-service.test.ts`: 18 tests passed
  - Connecting timeout, online clear, restart, hasEverSucceeded
- `daemon-manager.test.ts`: 36 tests passed
  - Start with management disabled succeeds (hard-bound)
  - Restart with management disabled still throws

### Test 7: Lint + typecheck

- **Result: PASS**
- `oxlint`: 0 warnings, 0 errors on 12 modified files
- `tsgo`: no errors in modified files (pre-existing errors in workspace-environment-panel.tsx/workspace-header.tsx are unrelated, pre-dirty)

## Known Issues (not blocking)

- `app-update.yml` missing in win-unpacked build → auto-updater warning (pre-existing, not related to this change)
- `desktop-settings.json` BOM issue caused by PowerShell `Set-Content -Encoding UTF8` — fixed by writing without BOM via Python; this is a tooling issue not a code issue

## Files Changed

- `packages/app/src/utils/host-runtime-bootstrap.ts` — isDesktop input + shouldArmStartupGiveUpToWelcome
- `packages/app/src/utils/host-runtime-bootstrap.test.ts` — desktop tests
- `packages/app/src/runtime/daemon-start-service.ts` — connecting watch + restart + hasEverSucceeded
- `packages/app/src/runtime/daemon-start-service.test.ts` — connecting/restart tests
- `packages/app/src/app/_layout/BootstrapProvider.tsx` — gate bypasses manage setting + retry uses restart
- `packages/app/src/app/index.tsx` — hard-escape desktop stays on splash
- `packages/desktop/src/daemon/daemon-manager.ts` — start removes assert; restart keeps assert
- `packages/desktop/src/daemon/daemon-manager.test.ts` — start disabled test
- `packages/app/src/i18n/index.ts` — connectingTimeout + openSettings + manageBuiltInHint
- `packages/app/src/screens/startup-splash-screen.tsx` — open settings button
- `packages/app/e2e/helpers/desktop-updates.ts` — mock listen address
- `packages/app/e2e/settings-host-page.spec.ts` — mock start_desktop_daemon
