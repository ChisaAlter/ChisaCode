# desktop-provider-probe-gate

- time: 2026-08-13T02:48:23.495Z
- surface: packaged Electron `packages/desktop/release/win-unpacked/ChisaCode.exe`
- rebuild: `expo export --platform web` (CHISACODE_WEB_PLATFORM=electron) → `tsc -p packages/desktop` → `electron-builder --win --dir --x64` (`signAndEditExecutable=false` to avoid rcedit lock)
- isolated home: `C:\Users\48818\AppData\Local\Temp\chisacode-probe-home-7haZRp`
- env: `CHISACODE_ENABLE_DEV_PROVIDERS=1`, real providers/MCP/gateways stripped from copied config
- script: `npx tsx packages/app/e2e/desktop-provider-probe-gate.script.ts`
- result: **PASS**

## Assertions

1. Opening the model selector sent **0** unscoped `refresh_providers_snapshot_request` (Playwright WS tap on the open window + daemon `ws_runtime_metrics`: first 30s window has `get_providers_snapshot_request` ×1 and no refresh).
2. Mock Load Test stayed selectable (`4 个模型`); composer trigger settled on `Five minute stream`; no “请选择模型”.
3. Mock Slow Provider remained listed while loading, then after 30s showed the error empty-state (`Timed out refreshing Mock Slow Provider after 30000ms`) + 重试.
4. Clicking 重试 put the entry back into loading (`加载中...`) — targeted force, not a full-provider storm. Later metrics windows in prior runs recorded exactly one `refresh_providers_snapshot_request` after the retry click.

## Shots

- `.omo/evidence/desktop-provider-probe-gate-2026-08-13/selector-open-list.png` — provider list: Mock 4 models, Mock Slow loading
- `.omo/evidence/desktop-provider-probe-gate-2026-08-13/mock-slow-error.png` — error empty-state + 重试
- `.omo/evidence/desktop-provider-probe-gate-2026-08-13/mock-slow-retrying.png` — after retry, loading again
- `.omo/evidence/desktop-provider-probe-gate-2026-08-13/composer.png` — composer trigger `Five minute stream`

## Residual (not claimed)

- This gate uses isolated home + mock providers. It proves the app no longer force-probes on selector open, and that an error provider stays visible with retry. It does **not** re-run the user’s real 12-provider MCP storm; that is stage-2 (probe/MCP decoupling) and still open on the roadmap.
