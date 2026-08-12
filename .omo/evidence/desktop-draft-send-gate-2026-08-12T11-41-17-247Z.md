# Desktop draft-send gate — FAILED

- time: 2026-08-12T11:41:51.544Z
- gateway: grok-4-5
- model: grok-4.5
- runs attempted: 1 / 10
- runs passed: 0

| run | flow               | pass | appeared(ms) | selected(ms) | converted(ms) | streaming(ms) | detail                               |
| --- | ------------------ | ---- | ------------ | ------------ | ------------- | ------------- | ------------------------------------ |
| 1   | existing-workspace | ❌   | -            | -            | -             | -             | expect(locator).toBeVisible() failed |

Locator: getByText('MODEL', { exact: true }).first()
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:

- Expect "to.be.visible" with timeout 5000ms
- waiting for getByText('MODEL', { exact: true }).first()
  sidebar=[{"testid":"sidebar-session-group-c:/users/48818/appdata/local/temp/draft-send-gate-6n1pi0","aria":null},{"testid":"sidebar-session-group-toggle-c:/users/48818/appdata/local/temp/draft-send-gate-6n1pi0","aria":null},{"testid":"sidebar-session-group-actions-c:/users/48818/appdata/local/temp/draft-send-gate-6n1pi0","aria":null},{"testid":"sidebar-session-group-menu-c:/users/48818/appdata/local/temp/draft-send-gate-6n1pi0","aria":null},{"testid":"sidebar-session-group-new-srv_zNqW5xABiGKj-c:/users/48818/appdata/local/temp/draft-send-gate-6n1pi0","aria":null},{"testid":"sidebar-session-container-srv_zNqW5xABiGKj-0914b104-0fd9-4e22-9170-71a0097b9091","aria":null},{"testid":"sidebar-v2-thread-0914b104-0fd9-4e22-9170-71a0097b9091","aria":null},{"testid":"sidebar-session-srv_zNqW5xABiGKj-0914b104-0fd9-4e22-9170-71a0097b9091","aria":null},{"testid":"sidebar-session-quick-actions-srv_zNqW5xABiGKj-0914b104-0fd9-4e22-9170-71a0097b9091","aria":null},{"testid":"sidebar-session-quick-pin-srv_zNqW5xABiGKj-0914b104-0fd9-4e22-9170-71a0097b9091","aria":null},{"testid":"sidebar-session-quick-archive-srv_zNqW5xABiGKj-0914b104-0fd9-4e22-9170-71a0097b9091","aria":null}] |

## Shots

- run 1 creating: C:\Users\48818\AppData\Local\Temp\chisacode-gate-home-fmZKB5\shots\run-1-failed.png

## Prompts

- 连续十次门槛验证 第1次 1786534894232
