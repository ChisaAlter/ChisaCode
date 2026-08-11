# G008 packaged Electron CI wiring evidence

- recordedAt: 2026-08-10T06-44-40Z
- workflow job: desktop-packaged-electron (windows-latest)
- script: packages/app test:desktop-packaged -> e2e/desktop-packaged-slices.script.ts
- build chain: build:server + build:app-deps + expo export electron + desktop build:main/build:x64
- isolation env: CHISACODE_ENABLE_DEV_PROVIDERS=1, dictation/voice/relay disabled
- status: wired in ci.yml; full green depends on package artifact availability in CI runners
- residual: first CI run may need electron-builder arg tuning if build:x64 output path differs
