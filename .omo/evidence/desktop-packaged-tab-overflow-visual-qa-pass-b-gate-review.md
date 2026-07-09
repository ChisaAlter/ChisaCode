# Gate Review: Desktop Packaged Tab Overflow Visual QA Pass B

recommendation: APPROVE

blockers: []

originalIntent:

- The desktop Electron window previously rendered too many top tabs into a horizontal megascroll, making window content not fully visible.
- The current fix should show only an active-neighborhood set of tabs and put hidden tabs into a scrollable overflow menu.

desiredOutcome:

- No page-level horizontal overflow in the packaged Electron desktop app.
- Top tab row is visually bounded and does not render all hidden tabs into the row.
- Overflow menu opens, is scrollable, and is not clipped at the bottom or right edge.
- CJK tab/menu labels remain readable without glyph clipping, unnatural orphan wrapping, or incoherent overlap with the main content/composer.

userOutcomeReview:

- PASS for Pass B visual fidelity and CJK precision.
- Screenshots show the visible tab row constrained to 4 tabs at 1200x800 and 3 tabs at 1000x700, with the overflow button visible.
- Overflow menu content is fully inside the viewport in both menu-open captures. It overlays the main workspace as an expected dropdown and does not collide with the composer or fixed controls.
- Visible CJK strings in the tab row, sidebar, composer, and overflow menu are readable. No tofu glyphs, baseline clipping, one-character orphan lines, or awkward CJK phrase wrapping are visible in the supplied captures.
- The 1000x700 capture has a small internal tabsScroll width delta (464 scrollWidth / 442 clientWidth), but document/body scrollWidth remain equal to viewport width, and the screenshot does not show the old all-tabs megascroll or visible content cutoff.

checkedArtifactPaths:

- C:/Users/48818/AppData/Local/Temp/chisacode-tab-overflow-20260708T043225/evidence/01-default-window.png
- C:/Users/48818/AppData/Local/Temp/chisacode-tab-overflow-20260708T043225/evidence/02-overflow-menu-open.png
- C:/Users/48818/AppData/Local/Temp/chisacode-tab-overflow-20260708T043225/evidence/03-1000x700.png
- C:/Users/48818/AppData/Local/Temp/chisacode-tab-overflow-20260708T043225/evidence/summary.json
- C:/Users/48818/AppData/Local/Temp/chisacode-tab-overflow-20260708T043225/evidence/01-default-window.json
- C:/Users/48818/AppData/Local/Temp/chisacode-tab-overflow-20260708T043225/evidence/02-overflow-menu-open.json
- C:/Users/48818/AppData/Local/Temp/chisacode-tab-overflow-20260708T043225/evidence/03-1000x700.json
- C:/Ai/ChisaCode/packages/app/src/screens/workspace/workspace-desktop-tabs-row.tsx
- C:/Ai/ChisaCode/packages/app/src/screens/workspace/workspace-tab-layout.ts
- C:/Ai/ChisaCode/packages/app/src/screens/workspace/workspace-tab-layout.test.ts
- C:/Ai/ChisaCode/.qa-tmp/desktop-packaged-tab-overflow-qa.mjs
- C:/Ai/ChisaCode/.qa-tmp/desktop-packaged-tab-overflow-after-menu-height-fix-20260708.log

evidenceTrace:

- Freshness: screenshots/log were written at 2026-07-08 12:32:40-12:32:42 local time, after the relevant source and QA script timestamps.
- 1200x800 default: documentElement/body scrollWidth both 1200; tabsScroll 642/642; visibleTabCount 4; overflow menu button visible with aria-label "more 54 tabs" in Chinese.
- 1200x800 menu open: overflowContent rect x=770 y=85 width=220 height=521 right=990 bottom=607 inside 1200x800; itemCount 54.
- 1000x700 menu open: documentElement/body scrollWidth both 1000; tabsScroll 464/442; visibleTabCount 3; overflowContent rect x=770 y=85 width=220 height=521 right=990 bottom=607 inside 1000x700; itemCount 55.
- Source trace: WorkspaceTabsOverflowMenu renders DropdownMenuContent with scrollable maxHeight 520 and TAB_DROPDOWN_WIDTH; useVisibleWorkspaceTabs computes an active-centered visible window; ScrollView has scrollEnabled=false and receives visibleTabs only.
- Tests trace: workspace-tab-layout.test.ts covers readable fallback tab width and center/clamp behavior for computeWorkspaceVisibleTabWindow.

slopAndProgrammingPass:

- No Pass B blocker found from the diff, tests, or production code for the tab overflow visual outcome.
- Tests are not deletion-only or tautological; they pin visible-window and readable-width behavior used by the UI.
- The large pre-existing workspace-desktop-tabs-row.tsx file remains a maintenance risk, but it is outside this Pass B visual acceptance unless a full code-quality gate is requested.
- No evidence that the visual fix relies on hidden test-only paths or loosened assertions for the checked user outcome.

findings: []

exactEvidenceGaps:

- This was a Pass B visual QA package. No separate full code review report, manual QA matrix, or notepad path was supplied for a full release gate review.
- I did not rerun the packaged Electron app; this review used the supplied fresh packaged-run screenshots, JSON captures, log, source, and diff.
