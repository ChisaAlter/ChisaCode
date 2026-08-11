# Desktop first-send + gateway real-surface verification

- time: 2026-08-09T12:54:12.487Z
- exe: C:\Ai\ChisaCode\packages\desktop\release\win-unpacked\ChisaCode.exe
- CHISACODE_HOME: C:\Users\48818\AppData\Local\Temp\chisacode-verify-home-zQw5ge
- serverId: srv_of7dNCht0yNz
- gatewayId: grok-4-5
- modelId: grok-4.5
- chatBaseHost: 38.76.185.154:13001
- keyLength: 20
- prompt: 侧栏即时验证 1786280010746
- screenshot: C:\Users\48818\AppData\Local\Temp\chisacode-verify-home-zQw5ge\shots\after-verify.png

## Gates

- PASS ui-model-select-attempt: attempted gateway model selection in Soft Home composer
- PASS sidebar-optimistic-within-5s (196ms): sidebar reflected first-send title after 196ms
- PASS daemon-create-gateway-face (7439ms): created agent 98263c9a-eb7e-4acc-91ff-3611eacdfe17 provider=grokbuild runtimeRequested=grok-4-5-grokbuild
- FAIL runtime-provider-gateway-face: Creating agent in C:\Users\48818\AppData\Local\Temp\verify-first-send-OWhZtW (grokbuild) :: grokbuild | Created agent 98263c9a-eb7e-4acc-91ff-3611eacdfe17 (grokbuild) :: grokbuild
- PASS managed-grok-config-endpoints: C:\Users\48818\AppData\Local\Temp\chisacode-verify-home-zQw5ge\provider-runtime\grokbuild\xiaomi-grokbuild-e92d49b933\config.toml
- PASS no-xai-key-error-on-gateway-face: no console.x.ai Incorrect API key observed
- PASS ui-error-banner-observation: no xAI/internal error banner visible at capture time

## Summary: pass=6 fail=1 skip=0

## Daemon create providers

- Creating agent in C:\Users\48818\AppData\Local\Temp\verify-first-send-OWhZtW (grokbuild) :: grokbuild
- Created agent 98263c9a-eb7e-4acc-91ff-3611eacdfe17 (grokbuild) :: grokbuild

## Turn failures

- none

## Managed config endpoints: true

- path: C:\Users\48818\AppData\Local\Temp\chisacode-verify-home-zQw5ge\provider-runtime\grokbuild\xiaomi-grokbuild-e92d49b933\config.toml
