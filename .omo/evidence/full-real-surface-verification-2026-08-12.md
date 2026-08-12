# Full real-surface verification — conversation switch + AI T3 alignment

Date: 2026-08-12 (local)

## Scope under test

1. Same-workspace conversation switch must not flash column width/x.
2. AI assistant prose must be T3-aligned: 14px / ~23 line-height / foreground@80% color token.
3. Terminal surface must stay full-width (not capped by conversation column).

## What was rebuilt

- `npm run build:x64 --workspace=@chisacode/desktop` (fresh win-unpacked before gates)

## Packaged Electron gate (desktop only)

Command (from `packages/app`):

```bash
npx tsx e2e/desktop-conversation-switch-width.script.ts
```

Result: **ALL GATES PASSED**

Evidence:

- `.omo/evidence/desktop-conversation-switch-width-2026-08-12T00-04-08-550Z.md`
- shots: `.omo/evidence/conversation-switch-width-shots/`
  - `panel-before-a.png`
  - `panel-after-b.png`
  - `panel-after-a.png`
  - `window-before-a.png`
  - `window-after-b.png`
  - `window-after-a.png`
  - `conv-switch-final.png`

Measured:

- baseline column: width=751, x=354.5
- switch A→B: Δw=0.000, Δx=0.000
- switch B→A: Δw=0.000, Δx=0.000
- AI prose sample: fontSize=14px, lineHeight=23px, color=rgba(20, 23, 31, 0.8), opacity=1

## Web Playwright e2e

Command:

```bash
npx playwright test e2e/workspace-navigation-regression.spec.ts --project="Desktop Chrome" --grep "same-workspace|terminal surface stays"
```

Result: **2 passed**

- same-workspace agent switches keep conversation column width stable
- terminal surface stays full-width of the main panel

Note: web e2e is not a substitute for desktop packaging; it is an additional gate.

## Unit gates (focused)

Result: **32 passed** across:

- workbench-fidelity-style-boundaries.test.ts (12)
- theme.test.ts (15)
- workspace-pane-content.test.tsx (2)
- markdown-styles.test.ts (3)

## Shortcut / launch hygiene

- Desktop + repo `ChisaCode.lnk` refreshed to:
  - Target: `packages/desktop/release/win-unpacked/ChisaCode.exe`
  - WorkDir: `C:\Ai\ChisaCode`
- Packaged app launched after gates (`ChisaCode.exe` process present)

## Explicitly NOT claimed

- Human eyeball confirmation on the user's own long-lived sessions (must be done by user).
- Full Playwright suite (only the two targeted specs above).
- Mobile/native verification (out of this change's desktop-first scope).
- Pixel-diff of every frame during switch (geometry sampling + before/after screenshots used instead).

## Residual risk

If residual horizontal flash is still seen by the user on real sessions, treat user observation as authoritative residual and continue diagnosis — do not re-assert pass from this report alone.
