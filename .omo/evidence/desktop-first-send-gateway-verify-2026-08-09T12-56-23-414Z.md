# Desktop first-send + gateway real-surface verification

- time: 2026-08-09T12:57:06.784Z
- exe: C:\Ai\ChisaCode\packages\desktop\release\win-unpacked\ChisaCode.exe
- CHISACODE_HOME: C:\Users\48818\AppData\Local\Temp\chisacode-verify-home-3VmVr2
- serverId: srv_Ykh4ygj0guRF
- gatewayId: grok-4-5
- modelId: grok-4.5
- chatBaseHost: 38.76.185.154:13001
- keyLength: 20
- prompt: 侧栏即时验证 1786280183415
- screenshot: C:\Users\48818\AppData\Local\Temp\chisacode-verify-home-3VmVr2\shots\after-verify.png

## Gates

- PASS ui-model-select-attempt: attempted gateway model selection in Soft Home composer
- PASS sidebar-optimistic-within-5s (170ms): sidebar reflected first-send title after 170ms
- PASS daemon-create-gateway-face (9541ms): created agent 6d1a3fc1-fdd0-4877-96d8-d2973c92b3d2 provider=grokbuild runtimeRequested=grok-4-5-grokbuild
- PASS runtime-provider-gateway-face: 6d1a3fc1-fdd0-4877-96d8-d2973c92b3d2.json :: grok-4-5-grokbuild model=grok-4.5
- PASS managed-grok-config-endpoints: C:\Users\48818\AppData\Local\Temp\chisacode-verify-home-3VmVr2\provider-runtime\grokbuild\grok-4-5-grokbuild-c850fca0e0\config.toml
- PASS no-xai-key-error-on-gateway-face: no console.x.ai Incorrect API key observed
- PASS ui-error-banner-observation: no xAI/internal error banner visible at capture time

## Summary: pass=7 fail=0 skip=0

## Daemon create providers (base provider log only)

- Creating agent in C:\Users\48818\AppData\Local\Temp\verify-first-send-qcadoM (grokbuild) :: grokbuild
- Created agent 6d1a3fc1-fdd0-4877-96d8-d2973c92b3d2 (grokbuild) :: grokbuild

## Persisted runtimeProvider

- 6d1a3fc1-fdd0-4877-96d8-d2973c92b3d2.json :: grok-4-5-grokbuild model=grok-4.5

## Turn failures

- none

## Gateway managed config endpoints: true

- path: C:\Users\48818\AppData\Local\Temp\chisacode-verify-home-3VmVr2\provider-runtime\grokbuild\grok-4-5-grokbuild-c850fca0e0\config.toml

## All managed grok configs

- grok-4-5-grokbuild-c850fca0e0: endpoints=true
- xiaomi-grokbuild-e92d49b933: endpoints=true
