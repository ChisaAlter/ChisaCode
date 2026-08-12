# Desktop draft-send gate — FAILED

- time: 2026-08-12T11:27:35.893Z
- gateway: grok-4-5
- model: grok-4.5
- runs attempted: 1 / 10
- runs passed: 0

| run | flow               | pass | appeared(ms) | selected(ms) | converted(ms) | streaming(ms) | detail                                                          |
| --- | ------------------ | ---- | ------------ | ------------ | ------------- | ------------- | --------------------------------------------------------------- |
| 1   | existing-workspace | ❌   | -            | -            | -             | -             | locator.evaluateAll: ReferenceError: uuidPattern is not defined |

    at eval (eval at evaluate (:303:30), <anonymous>:1:136)
    at Array.filter (<anonymous>)
    at eval (eval at evaluate (:303:30), <anonymous>:1:110)
    at UtilityScript.evaluate (<anonymous>:305:16)
    at UtilityScript.<anonymous> (<anonymous>:1:44) sidebar=[{"testid":"sidebar-session-group-c:/users/48818/appdata/local/temp/draft-send-gate-x53zzm","aria":null},{"testid":"sidebar-session-group-toggle-c:/users/48818/appdata/local/temp/draft-send-gate-x53zzm","aria":null},{"testid":"sidebar-session-group-actions-c:/users/48818/appdata/local/temp/draft-send-gate-x53zzm","aria":null},{"testid":"sidebar-session-group-menu-c:/users/48818/appdata/local/temp/draft-send-gate-x53zzm","aria":null},{"testid":"sidebar-session-group-new-srv_t6Esj3J2KdRr-c:/users/48818/appdata/local/temp/draft-send-gate-x53zzm","aria":null},{"testid":"sidebar-session-container-srv_t6Esj3J2KdRr-89ae4ac4-abab-42ac-ab03-de5044c13690","aria":null},{"testid":"sidebar-v2-thread-89ae4ac4-abab-42ac-ab03-de5044c13690","aria":null},{"testid":"sidebar-session-srv_t6Esj3J2KdRr-89ae4ac4-abab-42ac-ab03-de5044c13690","aria":null},{"testid":"sidebar-session-quick-actions-srv_t6Esj3J2KdRr-89ae4ac4-abab-42ac-ab03-de5044c13690","aria":null},{"testid":"sidebar-session-quick-pin-srv_t6Esj3J2KdRr-89ae4ac4-abab-42ac-ab03-de5044c13690","aria":null},{"testid":"sidebar-session-quick-archive-srv_t6Esj3J2KdRr-89ae4ac4-abab-42ac-ab03-de5044c13690","aria":null}] |

## Shots

- run 1 creating: C:\Users\48818\AppData\Local\Temp\chisacode-gate-home-sSCZPz\shots\run-1-failed.png

## Prompts

- 连续十次门槛验证 第1次 1786534055301
