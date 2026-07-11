# Task 8 Report: Android service, notification routing, and status bar theme

## Outcome

- Added a pure foreground-service policy that returns true only for `background` + `connected`.
- Updated client activity tracking to subscribe to both AppState and daemon connection state, avoid
  duplicate start/stop calls, stop on cleanup when active, and report native Promise failures.
- Changed the Android service to `START_NOT_STICKY` and added the API 35 foreground-service timeout
  callback, which logs, removes the notification, and stops the timed-out service instance.
- Native foreground-service start failures are logged and rethrown through the existing Expo
  AsyncFunction Promise contract. Android 12 start restrictions and permission failures receive
  specific log messages.
- Android local notifications now use one canonical JSON launch extra,
  `chisacode.notification.data`, with validated `serverId` and `agentId` fields capped at 512
  characters. The Expo module reads and removes the extra before returning it to JavaScript, so it
  cannot replay from the same Intent.
- Themes expose `isDark`; the status bar hook reacts to brightness changes rather than theme names.

## TDD evidence

The three focused tests were run separately and observed failing before implementation:

- foreground policy: missing module
- notification routing: missing Android JSON codec
- theme brightness: missing `isDark`

After implementation:

- `android-foreground-service-policy.test.ts`: 1 test passed
- `notification-routing.test.ts`: 13 tests passed
- `theme.test.ts`: 4 tests passed

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

## Scope notes

- The archived comprehensive roadmap was left unchanged as required by its archival policy.
- No web preview was used as Android verification.
- Task 9 was not started.
