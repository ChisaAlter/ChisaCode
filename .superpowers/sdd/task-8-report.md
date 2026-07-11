# Task 8 Report: Android service, notification routing, and status bar theme

## Outcome

- Added a pure foreground-service policy that returns true only for `background` + `connected`.
- Updated client activity tracking to subscribe to both AppState and daemon connection state, avoid
  duplicate start/stop calls, stop on cleanup when active, and report native Promise failures. A
  serialized reconciler rechecks the latest desired state after runtime loading and each native
  operation, preventing stale asynchronous starts or stops from winning.
- Changed the Android service to `START_NOT_STICKY` and added the API 35 foreground-service timeout
  callback, which logs, removes the notification, and stops the timed-out service instance.
- Native foreground-service start failures are logged and rethrown through the existing Expo
  AsyncFunction Promise contract. Android 12 start restrictions and permission failures receive
  specific log messages.
- Android local notifications now use one canonical JSON launch extra,
  `chisacode.notification.data`, with validated `serverId` and `agentId` fields capped at 512
  characters. Values must be actual JSON strings; numeric, boolean, null, missing, blank, and
  oversized values are rejected. Unrelated fields are stripped.
- Cold launches consume and remove the current Activity Intent extra once. Warm/background taps use
  Expo Module `OnNewIntent`, remove the extra in a `finally` block, and atomically store canonical
  data in a bounded one-slot latest-wins pending queue. The event is only a wake signal; pending data
  remains durable until JavaScript drains it. Initial and event-triggered drains are serialized and
  coalesced, and listener cleanup disposes the drain controller. Every native drain atomically
  captures and clears both the pending warm slot and the current Activity cold-launch extra under
  the same lock, returning `pending ?: cold`; this prevents a losing cold extra from replaying after
  a warm notification wins.
- Themes expose `isDark`; the status bar hook reacts to brightness changes rather than theme names.

## TDD evidence

The three focused tests were run separately and observed failing before implementation:

- foreground policy: missing module
- notification routing: missing Android JSON codec
- theme brightness: missing `isDark`

After implementation:

- `android-foreground-service-policy.test.ts`: 1 test passed
- `notification-routing.test.ts`: 14 tests passed
- `theme.test.ts`: 4 tests passed
- `android-foreground-service-reconciler.test.ts`: 5 tests passed
- `android-notification-drain-controller.test.ts`: 3 tests passed

## Android build boundary

`packages/app/android` already exists. Gradle configuration reports compileSdk 36, targetSdk 36,
and minSdk 29, so the API 35 `Service.onTimeout(startId, fgsType)` override is available at compile
time while remaining an optional platform callback on older devices.

The targeted native compile could not be reached because Gradle fails while configuring the
existing `:chisacode-android-runtime` project with:

`'android.defaultConfig.versionName' is not defined`

This occurs before Kotlin compilation and is unrelated to the Task 8 source changes. Android
compile/device verification is therefore unavailable, not passed. No native project was generated
or broad Android suite run.

Warm-notification device verification is also unavailable. Static seam review confirms:

- `Events("onNotificationResponse")` and `OnNewIntent` are registered through the installed Expo
  Modules API; events carry no payload and only wake the drain path.
- Every received Intent removes `chisacode.notification.data` while holding the same lock used by
  the one-slot pending queue and drain operation.
- `consumeInitialNotificationData` clears both native sources on every call regardless of which
  source wins, so a later remount cannot replay a stale cold-launch extra.
- Malformed native JSON and non-string values return null without logging raw payloads.
- The Android TypeScript wrapper returns a typed signal-listener unsubscribe function, and
  `Notifications.tsx` invokes it and disposes the drain controller during effect cleanup.
- Pure controller tests verify durable late drain, simultaneous initial/event drain coalescing,
  repeated null consumption, and cleanup suppression. Reconciler tests verify deferred load/start/
  stop ordering, idempotency, disposal, and bounded retry behavior.

## Final verification commands

- `npx vitest run packages/app/src/native/android-foreground-service-policy.test.ts --bail=1` —
  1 test passed.
- `npx vitest run packages/app/src/utils/notification-routing.test.ts --bail=1` — 14 tests passed.
- `npx vitest run packages/app/src/styles/theme.test.ts --bail=1` — 4 tests passed.
- `npx vitest run packages/app/src/native/android-foreground-service-reconciler.test.ts --bail=1`
  — 5 tests passed.
- `npx vitest run packages/app/src/native/android-notification-drain-controller.test.ts --bail=1`
  — 3 tests passed.
- `npm run typecheck --workspace=@chisacode/app` — exited 0.
- `npm run lint -- packages/app/src/native/android-foreground-service-policy.ts packages/app/src/native/android-foreground-service-policy.test.ts packages/app/src/native/android-foreground-service-reconciler.ts packages/app/src/native/android-foreground-service-reconciler.test.ts packages/app/src/native/android-notification-drain-controller.ts packages/app/src/native/android-notification-drain-controller.test.ts packages/app/src/hooks/use-client-activity.ts packages/app/src/native/android-runtime.android.ts packages/app/src/native/android-runtime.ts packages/app/src/utils/notification-routing.ts packages/app/src/utils/notification-routing.test.ts packages/app/src/hooks/use-status-bar-theme.ts packages/app/src/styles/theme.ts packages/app/src/styles/theme.test.ts packages/app/src/app/_layout/Notifications.tsx` — 0 warnings and 0 errors.
- `git diff --check` — clean.

## Scope notes

- The archived comprehensive roadmap was left unchanged as required by its archival policy.
- No web preview was used as Android verification.
- Task 9 was not started.
