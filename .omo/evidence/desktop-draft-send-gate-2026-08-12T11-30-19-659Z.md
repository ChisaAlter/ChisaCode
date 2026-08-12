# Desktop draft-send gate — FAILED

- time: 2026-08-12T11:30:39.587Z
- gateway: grok-4-5
- model: grok-4.5
- runs attempted: 1 / 10
- runs passed: 0

| run | flow               | pass | appeared(ms) | selected(ms) | converted(ms) | streaming(ms) | detail                                                          |
| --- | ------------------ | ---- | ------------ | ------------ | ------------- | ------------- | --------------------------------------------------------------- |
| 1   | existing-workspace | ❌   | -            | -            | -             | -             | locator.evaluateAll: ReferenceError: stripPrefix is not defined |

    at eval (eval at evaluate (:303:30), <anonymous>:1:89)
    at Array.map (<anonymous>)
    at eval (eval at evaluate (:303:30), <anonymous>:1:64)
    at UtilityScript.evaluate (<anonymous>:305:16)
    at UtilityScript.<anonymous> (<anonymous>:1:44) sidebar=[{"testid":"sidebar-session-group-c:/users/48818/appdata/local/temp/draft-send-gate-rr67hi","aria":null},{"testid":"sidebar-session-group-toggle-c:/users/48818/appdata/local/temp/draft-send-gate-rr67hi","aria":null},{"testid":"sidebar-session-group-actions-c:/users/48818/appdata/local/temp/draft-send-gate-rr67hi","aria":null},{"testid":"sidebar-session-group-menu-c:/users/48818/appdata/local/temp/draft-send-gate-rr67hi","aria":null},{"testid":"sidebar-session-group-new-srv_2MlzXy3nR9aN-c:/users/48818/appdata/local/temp/draft-send-gate-rr67hi","aria":null},{"testid":"sidebar-session-container-srv_2MlzXy3nR9aN-4b2c3fc1-573b-4933-96e8-03bb8b7e972a","aria":null},{"testid":"sidebar-v2-thread-4b2c3fc1-573b-4933-96e8-03bb8b7e972a","aria":null},{"testid":"sidebar-session-srv_2MlzXy3nR9aN-4b2c3fc1-573b-4933-96e8-03bb8b7e972a","aria":null},{"testid":"sidebar-session-quick-actions-srv_2MlzXy3nR9aN-4b2c3fc1-573b-4933-96e8-03bb8b7e972a","aria":null},{"testid":"sidebar-session-quick-pin-srv_2MlzXy3nR9aN-4b2c3fc1-573b-4933-96e8-03bb8b7e972a","aria":null},{"testid":"sidebar-session-quick-archive-srv_2MlzXy3nR9aN-4b2c3fc1-573b-4933-96e8-03bb8b7e972a","aria":null}] |

## Shots

- run 1 creating: C:\Users\48818\AppData\Local\Temp\chisacode-gate-home-AxIw3C\shots\run-1-failed.png

## Prompts

- 连续十次门槛验证 第1次 1786534239161
