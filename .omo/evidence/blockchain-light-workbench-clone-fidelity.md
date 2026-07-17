# Blockchain Light Workbench Clone Fidelity Review

recommendation: REQUEST_CHANGES

reportPath: C:\Ai\ChisaCode\.omo\evidence\blockchain-light-workbench-clone-fidelity.md

## Evidence Inspected

- C:\Ai\ChisaCode\design\web3-themes-v2.html
- C:\Ai\ChisaCode\.qa-tmp\visual-fidelity\output\blockchain-light-workbench-reference.png
- C:\Ai\ChisaCode\.qa-tmp\visual-fidelity\output\blockchain-light-workbench-fixed-state.png
- C:\Ai\ChisaCode\.qa-tmp\visual-fidelity\output\blockchain-light-workbench-current-metrics.json
- C:\Ai\ChisaCode\.qa-tmp\visual-fidelity\seed-workbench-qa.mjs
- C:\Ai\ChisaCode\.qa-tmp\visual-fidelity\prepare-workbench-state.mjs
- C:\Ai\ChisaCode\packages\app\src\constants\layout.ts
- C:\Ai\ChisaCode\packages\app\src\components\left-sidebar.tsx
- C:\Ai\ChisaCode\packages\app\src\components\sidebar-session-list.tsx
- C:\Ai\ChisaCode\packages\app\src\screens\workspace\workspace-screen.tsx
- C:\Ai\ChisaCode\packages\app\src\screens\workspace\workspace-center-column.tsx
- C:\Ai\ChisaCode\packages\app\src\screens\workspace\workspace-desktop-tabs-row.tsx
- C:\Ai\ChisaCode\packages\app\src\screens\workspace\workspace-environment-panel.tsx
- C:\Ai\ChisaCode\packages\app\src\agent-stream\view.tsx
- C:\Ai\ChisaCode\packages\app\src\components\message.tsx
- C:\Ai\ChisaCode\packages\app\src\components\message-compaction-label.ts
- C:\Ai\ChisaCode\packages\app\src\composer\index.tsx
- C:\Ai\ChisaCode\packages\app\src\composer\input\input.tsx
- C:\Ai\ChisaCode\packages\app\src\composer\agent-controls\agent-control-styles.ts

## Gate Result

Failed. Existing metrics report `mad: 7.507` and `overThresholdPercent: 9.5715` against limits `mad <= 3` and `overThresholdPercent <= 3`. A fresh channel-level check measured `MAD_all_channels: 7.507`, `channel error >12: 7.672%`, and `pixels with any channel >12: 9.572%`.

Region metrics from the fresh pass:

- environment panel: MAD 10.935, channel error >12 10.744%, pixel-any >12 14.004%
- composer: MAD 5.520, channel error >12 9.217%, pixel-any >12 10.058%
- left sidebar: MAD 6.915, channel error >12 7.928%, pixel-any >12 11.427%
- main stream: MAD 7.274, channel error >12 6.073%, pixel-any >12 7.203%

The broad frame is real DOM/component output, not a pasted PNG. I found no production import or use of the workbench screenshots under `packages/app/src`; the rendered surfaces map to live React Native components. There are legitimate web `backgroundImage` usages for gradients and shimmers, not static screenshots.

## CRITICAL

None found for static-image substitution. The current screen appears to be rendered from live components and live/seeded state, not from a raster screenshot standing in for DOM.

## HIGH

1. Main message stream is vertically out of position and uses mismatched compaction copy.

Reference assistant turn dark-text top is around y=261 PNG / 174 CSS. Current assistant turn starts around y=337-338 PNG / 225 CSS, about +77 PNG / +51 CSS px too low. The reference `design\web3-themes-v2.html:586-593` sets the message stack at `padding: 14px 16px 10px` with `gap: 10px`, and the exact reference markup is at `design\web3-themes-v2.html:2017-2038`.

Likely production owners:

- C:\Ai\ChisaCode\packages\app\src\agent-stream\view.tsx:1147-1168 controls list padding.
- C:\Ai\ChisaCode\packages\app\src\agent-stream\spacing.ts:36-63 controls inter-item gaps.
- C:\Ai\ChisaCode\packages\app\src\components\message.tsx:184-229 controls user bubble spacing and max width.
- C:\Ai\ChisaCode\packages\app\src\components\message.tsx:672-688 controls assistant header.
- C:\Ai\ChisaCode\packages\app\src\components\message-compaction-label.ts:7-17 returns English `Context compacted`, while the reference chip says `已压缩早期上下文`.

Recommended adjustment: align the live stream spacing to the reference stack instead of relying on generic stream gaps. The compaction marker needs locale-aware/reference-compatible Chinese copy for this zh-CN QA state. Recheck user-message group margins and tool-sequence grouping because the user bubble and assistant turn are separated too far in the current shot.

2. Environment panel content is the largest regional visual failure.

The panel frame geometry is mostly right: 240 CSS px wide, 8 CSS px inset, rounded 12 px, matching `design\web3-themes-v2.html:818-832` and `packages\app\src\screens\workspace\workspace-environment-panel.tsx:870-887`. The content diverges:

- Reference branch row displays `origin/cn-main`; current shows `cn-main` plus a dropdown chevron.
- Reference diff stat is `+1,510 -162`; current is `+2255 -677`.
- Reference callout starts near y=285 PNG / 190 CSS and is about 55 PNG / 37 CSS px tall; current callout starts near y=306 PNG / 204 CSS and is about 114 PNG / 76 CSS px tall because it adds `恢复` and different two-line copy.
- Activity rows differ from file paths to status events.

Likely production owners:

- C:\Ai\ChisaCode\packages\app\src\screens\workspace\workspace-screen.tsx:1299-1322 assembles `diffStat`, branch, activity, active agent, and latest turn changes.
- C:\Ai\ChisaCode\packages\app\src\screens\workspace\workspace-environment-panel.tsx:290-371 renders the Git summary, branch chip, diff card, callout, actions, and activity.
- C:\Ai\ChisaCode\packages\app\src\screens\workspace\workspace-environment-panel.tsx:562-668 renders the branch row and inline diff values.
- C:\Ai\ChisaCode\packages\app\src\screens\workspace\workspace-environment-panel.tsx:505-530 selects activity rows from `latestTurnChanges` or fallback items.

Recommended adjustment: make the deterministic real QA state feed the exact branch identity, diff stat, latest changed files, and callout copy expected by the reference, or regenerate the reference to match the live state. Do not hardcode static mock strings in the panel. If the target remains the supplied reference, suppress the resume affordance for this completed-review state and render the branch row as a display row, not a switcher.

3. Sidebar row model does not match the reference component policy.

The left rail width and background are close, but row structure is different. Reference group labels are plain muted text (`置顶`, `pi-desktop`, `最近`) and rows show visible ellipsis actions. Current desktop groups render folder icons and `+` buttons, rows use provider icons from runtime data, and hover/quick actions are pin/archive buttons instead of the reference ellipsis.

Likely production owners:

- C:\Ai\ChisaCode\packages\app\src\components\left-sidebar.tsx:539-603 renders the top actions.
- C:\Ai\ChisaCode\packages\app\src\components\left-sidebar.tsx:689-769 renders the footer host/action block.
- C:\Ai\ChisaCode\packages\app\src\components\sidebar-session-list.tsx:489-652 renders session rows and trailing actions.
- C:\Ai\ChisaCode\packages\app\src\components\sidebar-session-list.tsx:696-749 renders group headers with `Folder` and `Plus`.
- C:\Ai\ChisaCode\packages\app\src\components\sidebar-session-list.tsx:1053-1120 and 1192-1237 define group, row, selected, and quick-action styling.

Recommended adjustment: for the workbench desktop sidebar variant, render group headers as plain labels with no folder icon or group `+`, and use a stable ellipsis menu affordance in the row trailing slot. Keep live provider/status icons only if the exact reference icon set is mapped; otherwise the icon mismatch will continue to dominate left-sidebar error.

4. Composer content and controls diverge from the reference state.

Reference composer attachments are `design/web3-themes-v2.html`, `cn-main`, `/skills`; current shows `Ai/ChisaCode`, `/skills`. Reference controls show `glm-5.1`, `Always ask`, `@files`, a context icon, voice, send, and the hint; current shows `gpt-5.5`, `跳过权限`, a sliders/settings icon, no matching right-side voice/send pair in the empty state, and the placeholder/control text is about +5-11 PNG / +3-7 CSS px lower.

Likely production owners:

- C:\Ai\ChisaCode\packages\app\src\composer\index.tsx:96-102 shortens cwd to the last two path segments.
- C:\Ai\ChisaCode\packages\app\src\composer\index.tsx:592-674 renders the desktop context row and `MessageInput`.
- C:\Ai\ChisaCode\packages\app\src\composer\index.tsx:679-745 controls desktop context row/chip geometry.
- C:\Ai\ChisaCode\packages\app\src\composer\input\input.tsx:1865-1947 renders the input surface and button row.
- C:\Ai\ChisaCode\packages\app\src\composer\input\input.tsx:1974-2096 defines input surface/button geometry.
- C:\Ai\ChisaCode\packages\app\src\composer\agent-controls\agent-control-styles.ts:14-65 controls model/mode preference chip styling.

Recommended adjustment: feed the real QA attachment state that includes the file and branch chips, and align the control formatter/state to the reference labels for this QA run. Do not replace this with static mock data; the live `workspaceAttachments`, selected model, permission mode, and feature controls need to produce the reference output.

## MEDIUM

1. Desktop tab row labels and action placement do not match.

Reference tabs are `你好啊`, `终端`, `浏览器`, followed by a right-aligned tool cluster. Current tabs truncate or expose internal labels (`你...`, `C:\...`, `浏...`) and show an inline `+` around x=739 PNG / 493 CSS instead of the reference right-side cluster. Geometry constants are close, so this is mostly presentation/state and action placement.

Likely production owners:

- C:\Ai\ChisaCode\packages\app\src\screens\workspace\workspace-desktop-tabs-row.tsx:198-219 resolves fallback labels.
- C:\Ai\ChisaCode\packages\app\src\screens\workspace\workspace-desktop-tabs-row.tsx:767-825 computes layout.
- C:\Ai\ChisaCode\packages\app\src\screens\workspace\workspace-desktop-tabs-row.tsx:950-1048 renders tabs and action buttons.
- C:\Ai\ChisaCode\packages\app\src\screens\workspace\workspace-desktop-tabs-row.tsx:1207-1350 styles the tab row.
- C:\Ai\ChisaCode\packages\app\src\screens\workspace\workspace-center-column.tsx:258-275 supplies fallback labels.

Recommended adjustment: ensure seeded terminal/browser tab presentation resolves to `终端` and `浏览器`, avoid exposing terminal paths in the tab label for this mode, and move the new-tab/tools affordances to the same right-aligned cluster as the reference.

2. Active sidebar selection color is lighter than the reference.

Sampled selected-row background at x=60,y=215 PNG: reference `(220,233,254)`, current `(238,244,255)`. The current selected row reads as a hover tint rather than the stronger active fill in the reference.

Likely production owners:

- C:\Ai\ChisaCode\packages\app\src\components\sidebar-session-list.tsx:1117-1120 and 1155-1157 selected row styles.
- C:\Ai\ChisaCode\packages\app\src\styles\theme.ts owns the light theme surface/sidebar tokens.

Recommended adjustment: use the reference active fill token for desktop selected sidebar rows, or introduce/route the correct token through the existing theme if `surfaceSidebarHover` is intentionally too pale.

3. QA seed and runtime setup are internally inconsistent with the exact reference.

`seed-workbench-qa.mjs` writes one user message (`把这个主题预览改得更像设计稿，别再只换颜色。`), `prepare-workbench-state.mjs` writes another (`把这个主题预览好好复刻一下，别再只换颜色。`), and the reference HTML uses `把这个主题预览改得更像最新版 ChisaCode 的真实布局结构。`. Tool-call details in the runtime seed use full package paths, while the reference badges display basename-style labels.

Evidence:

- C:\Ai\ChisaCode\.qa-tmp\visual-fidelity\seed-workbench-qa.mjs:138-211
- C:\Ai\ChisaCode\.qa-tmp\visual-fidelity\prepare-workbench-state.mjs:19-59 and 75-145
- C:\Ai\ChisaCode\design\web3-themes-v2.html:2017-2037

Recommended adjustment: make the deterministic real QA state a single source of truth. The production components should render the state faithfully; the state itself should not drift between the HTML reference, seed script, local storage tail cache, and provider history.

## LOW

1. Some fidelity-critical values are literal numbers instead of named workbench tokens.

Most major geometry is token/constant-driven (`WORKBENCH_SIDEBAR_WIDTH=200`, `WORKBENCH_ENVIRONMENT_PANEL_WIDTH=240`, tab widths, message max widths). However, several repeated fidelity values remain literal in components, such as `maxWidth: 580` in `agent-stream/view.tsx:1172-1179`, tool badge `maxWidth: 190` in `agent-stream/view.tsx:1187-1195`, and fixed gaps/paddings in `workspace-desktop-tabs-row.tsx:1227-1241`, `composer/input/input.tsx:2029-2048`, and `workspace-environment-panel.tsx:936-965`.

Recommended adjustment: promote the repeated workbench-specific literal sizes/gaps into named constants or theme tokens where they affect the screenshot gate. This is not the main visual blocker, but it reduces drift across the live components.

## Blockers Before Approval

- The screenshot fails the stated visual gate: MAD 7.507 and over-threshold 9.5715% versus limits 3 and 3%.
- The main stream is roughly +51 CSS px too low at the assistant turn.
- The environment panel content/state does not match the reference and is the worst regional error source.
- The sidebar row/group/action model differs from the reference.
- The composer does not render the reference file/branch chips or control labels from live state.
- The deterministic QA state and reference HTML are inconsistent, so passing the exact screenshot is not currently reproducible without aligning state or regenerating the reference.
