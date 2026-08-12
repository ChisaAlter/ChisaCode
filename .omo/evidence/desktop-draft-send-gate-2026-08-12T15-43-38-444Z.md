# Desktop draft-send gate — FAILED

- time: 2026-08-12T15:51:08.004Z
- gateway: grok-4-5
- model: grok-4.5
- runs attempted: 8 / 10
- runs passed: 7

| run | flow               | pass | appeared(ms) | selected(ms) | converted(ms) | streaming(ms) | detail                                   |
| --- | ------------------ | ---- | ------------ | ------------ | ------------- | ------------- | ---------------------------------------- |
| 1   | existing-workspace | ✅   | 31994        | 39166        | 68071         | 68789         | all gates passed                         |
| 2   | existing-workspace | ✅   | 18848        | 28839        | 29022         | 29779         | all gates passed                         |
| 3   | existing-workspace | ✅   | 19371        | 20555        | 20644         | 21133         | all gates passed                         |
| 4   | existing-workspace | ✅   | 25476        | 31073        | 32804         | 34036         | all gates passed                         |
| 5   | existing-workspace | ✅   | 56839        | 68091        | 91500         | 92055         | all gates passed                         |
| 6   | existing-workspace | ✅   | 26626        | 28756        | 29227         | 30187         | all gates passed                         |
| 7   | existing-workspace | ✅   | 22073        | 25637        | 26024         | 27258         | all gates passed                         |
| 8   | new-workspace      | ❌   | -            | -            | -             | -             | locator.click: Timeout 15000ms exceeded. |

Call log:
[2m - waiting for getByTestId('combined-model-selector').or(getByTestId('agent-controls-model')).first()[22m
[2m - locator resolved to <button tabindex="0" role="button" type="button" aria-label="选择模型（选择模型）" data-testid="combined-model-selector" class="css-g5y9jx r-1loqt21 r-1otgn73 unistyles_1pi2w58rhgd ">…</button>[22m
[2m - attempting click action[22m
[2m - waiting for element to be visible, enabled and stable[22m
sidebar=[{"testid":"sidebar-session-group-c:/users/48818/appdata/local/temp/draft-send-gate-fedeaz","aria":null},{"testid":"sidebar-session-group-toggle-c:/users/48818/appdata/local/temp/draft-send-gate-fedeaz","aria":null},{"testid":"sidebar-session-group-actions-c:/users/48818/appdata/local/temp/draft-send-gate-fedeaz","aria":null},{"testid":"sidebar-session-group-menu-c:/users/48818/appdata/local/temp/draft-send-gate-fedeaz","aria":null},{"testid":"sidebar-session-group-new-srv_UC8__Q0o0tlE-c:/users/48818/appdata/local/temp/draft-send-gate-fedeaz","aria":null},{"testid":"sidebar-session-container-srv_UC8__Q0o0tlE-a8831028-9ae2-4040-b525-e88b2c7a5f68","aria":null},{"testid":"sidebar-v2-thread-a8831028-9ae2-4040-b525-e88b2c7a5f68","aria":null},{"testid":"sidebar-session-srv_UC8__Q0o0tlE-a8831028-9ae2-4040-b525-e88b2c7a5f68","aria":null},{"testid":"sidebar-session-quick-actions-srv_UC8__Q0o0tlE-a8831028-9ae2-4040-b525-e88b2c7a5f68","aria":null},{"testid":"sidebar-session-quick-pin-srv_UC8__Q0o0tlE-a8831028-9ae2-4040-b525-e88b2c7a5f68","aria":null},{"testid":"sidebar-session-quick-archive-srv_UC8__Q0o0tlE-a8831028-9ae2-4040-b525-e88b2c7a5f68","aria":null},{"testid":"sidebar-session-container-srv_UC8__Q0o0tlE-b7c9eb29-9d47-42fc-a85d-77849ff4ed76","aria":null},{"testid":"sidebar-v2-thread-b7c9eb29-9d47-42fc-a85d-77849ff4ed76","aria":null},{"testid":"sidebar-session-srv_UC8__Q0o0tlE-b7c9eb29-9d47-42fc-a85d-77849ff4ed76","aria":null},{"testid":"sidebar-session-quick-actions-srv_UC8__Q0o0tlE-b7c9eb29-9d47-42fc-a85d-77849ff4ed76","aria":null},{"testid":"sidebar-session-quick-pin-srv_UC8__Q0o0tlE-b7c9eb29-9d47-42fc-a85d-77849ff4ed76","aria":null},{"testid":"sidebar-session-quick-archive-srv_UC8__Q0o0tlE-b7c9eb29-9d47-42fc-a85d-77849ff4ed76","aria":null},{"testid":"sidebar-session-container-srv_UC8__Q0o0tlE-42f5e5eb-5068-4a71-9967-eb730e868615","aria":null},{"testid":"sidebar-v2-thread-42f5e5eb-5068-4a71-9967-eb730e868615","aria":null},{"testid":"sidebar-session-srv_UC8__Q0o0tlE-42f5e5eb-5068-4a71-9967-eb730e868615","aria":null},{"testid":"sidebar-session-quick-actions-srv_UC8__Q0o0tlE-42f5e5eb-5068-4a71-9967-eb730e868615","aria":null},{"testid":"sidebar-session-quick-pin-srv_UC8__Q0o0tlE-42f5e5eb-5068-4a71-9967-eb730e868615","aria":null},{"testid":"sidebar-session-quick-archive-srv_UC8__Q0o0tlE-42f5e5eb-5068-4a71-9967-eb730e868615","aria":null},{"testid":"sidebar-session-container-srv_UC8__Q0o0tlE-baad0c0a-9e09-4650-aff2-19f084110ed1","aria":null},{"testid":"sidebar-v2-thread-baad0c0a-9e09-4650-aff2-19f084110ed1","aria":null},{"testid":"sidebar-session-srv_UC8__Q0o0tlE-baad0c0a-9e09-4650-aff2-19f084110ed1","aria":null},{"testid":"sidebar-session-quick-actions-srv_UC8__Q0o0tlE-baad0c0a-9e09-4650-aff2-19f084110ed1","aria":null},{"testid":"sidebar-session-quick-pin-srv_UC8__Q0o0tlE-baad0c0a-9e09-4650-aff2-19f084110ed1","aria":null},{"testid":"sidebar-session-quick-archive-srv_UC8__Q0o0tlE-baad0c0a-9e09-4650-aff2-19f084110ed1","aria":null},{"testid":"sidebar-session-container-srv_UC8__Q0o0tlE-9a515b0f-0413-4612-a066-8694b0ed6475","aria":null}] |

## Shots

- run 1 creating: C:\Users\48818\AppData\Local\Temp\chisacode-gate-home-ghuaLx\shots\run-1-creating.png
- run 1 converted: C:\Users\48818\AppData\Local\Temp\chisacode-gate-home-ghuaLx\shots\run-1-converted.png
- run 2 creating: C:\Users\48818\AppData\Local\Temp\chisacode-gate-home-ghuaLx\shots\run-2-creating.png
- run 2 converted: C:\Users\48818\AppData\Local\Temp\chisacode-gate-home-ghuaLx\shots\run-2-converted.png
- run 3 creating: C:\Users\48818\AppData\Local\Temp\chisacode-gate-home-ghuaLx\shots\run-3-creating.png
- run 3 converted: C:\Users\48818\AppData\Local\Temp\chisacode-gate-home-ghuaLx\shots\run-3-converted.png
- run 4 creating: C:\Users\48818\AppData\Local\Temp\chisacode-gate-home-ghuaLx\shots\run-4-creating.png
- run 4 converted: C:\Users\48818\AppData\Local\Temp\chisacode-gate-home-ghuaLx\shots\run-4-converted.png
- run 5 creating: C:\Users\48818\AppData\Local\Temp\chisacode-gate-home-ghuaLx\shots\run-5-creating.png
- run 5 converted: C:\Users\48818\AppData\Local\Temp\chisacode-gate-home-ghuaLx\shots\run-5-converted.png
- run 6 creating: C:\Users\48818\AppData\Local\Temp\chisacode-gate-home-ghuaLx\shots\run-6-creating.png
- run 6 converted: C:\Users\48818\AppData\Local\Temp\chisacode-gate-home-ghuaLx\shots\run-6-converted.png
- run 7 creating: C:\Users\48818\AppData\Local\Temp\chisacode-gate-home-ghuaLx\shots\run-7-creating.png
- run 7 converted: C:\Users\48818\AppData\Local\Temp\chisacode-gate-home-ghuaLx\shots\run-7-converted.png
- run 8 creating: C:\Users\48818\AppData\Local\Temp\chisacode-gate-home-ghuaLx\shots\run-8-failed.png

## Prompts

- 连续十次门槛验证 第1次 1786549523924
- 连续十次门槛验证 第2次 1786549592714
- 连续十次门槛验证 第3次 1786549622493
- 连续十次门槛验证 第4次 1786549643631
- 连续十次门槛验证 第5次 1786549677667
- 连续十次门槛验证 第6次 1786549769722
- 连续十次门槛验证 第7次 1786549799909
- 连续十次门槛验证 第8次 1786549827183
