# Workspace Environment Panel Redesign

**Status:** pending approval
**Scope:** `packages/app/src/screens/workspace/workspace-screen.tsx` (panel only) + `packages/app/src/i18n/index.ts`
**Estimated effort:** ~2-3 hours implementation, typecheck + build verification, desktop rebuild

---

## Requirements Summary

The current `WorkspaceEnvironmentPanel` is a flat list of rows (changes, location, locality, branch, PR, commit/push, source) followed by conditional subagent and todo sections. The user wants the panel reorganized to mirror the reference screenshot:

- **Always-shown (常驻):** changes count (+/-), branch, commit/push button, source
- **On-demand (触发后):** subagents, todo progress
- A clean three-section visual rhythm: "环境信息" header section, "子智能体" collapsible section, "来源" section

Visual reference (from user screenshot): The panel has a stacked-card layout where each group of related rows is visually grouped, and the subagent/todo sections are fully hidden until the related events fire (subagent created, todo list received).

## Acceptance Criteria

| #   | Criterion                                                                                                                                                                                                                | How to verify                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| AC1 | Panel renders an "环境信息" header card on top with: 变更(+/-), 本地, 仓库/分支, 提交或推送 (in a row). When `isGitCheckout=false`, the branch + commit-or-push rows are omitted; the source row stays.                  | Manual desktop test: open a git repo workspace and a non-git workspace, compare rows.                            |
| AC2 | The subagents section is **not rendered at all** when `subagents.length === 0` and no todo items. When either appears, the section is collapsed by default and labeled "子智能体 N个" or "任务 X/Y 完成" with a chevron. | Manual: no subagent run → section absent. Spawn a subagent → section appears collapsed. Click chevron → expands. |
| AC3 | The source row stays as the closing static row at the bottom of the always-shown area.                                                                                                                                   | Visual diff vs. screenshot.                                                                                      |
| AC4 | All added/changed strings exist in BOTH `zh-CN` and `en` locale blocks.                                                                                                                                                  | `grep` both locale blocks for each new key.                                                                      |
| AC5 | Panel still works on mobile (existing behavior preserved) — only desktop layout in the screenshot is the new design; mobile rail is unchanged.                                                                           | Manual mobile check (or screenshot if dev server up).                                                            |
| AC6 | `npm run typecheck` passes; `npm run build:web` succeeds; desktop rebuild produces a working shortcut.                                                                                                                   | Run commands.                                                                                                    |

## Current Code Inventory (file:line)

- `WorkspaceEnvironmentPanel` — `packages/app/src/screens/workspace/workspace-screen.tsx:1265-1341`
- `WorkspaceEnvironmentPanelRail` — `packages/app/src/screens/workspace/workspace-screen.tsx:1949-2013`
- `EnvironmentActionRow` (pressable) — `workspace-screen.tsx:1750-1784`
- `EnvironmentDisplayRow` (static) — `workspace-screen.tsx:1786-1802`
- `EnvironmentSectionHeader` (collapsible) — `workspace-screen.tsx:1654-1694`
- `WorkspaceSubagentsSection` — `workspace-screen.tsx:1466-1505` (already `useState(false)`)
- `WorkspaceTodoProgressSection` — `workspace-screen.tsx:1575-1627` (currently `useState(true)` — **must change to `false`**)
- `WorkspacePullRequestRow` — `workspace-screen.tsx:1343-1385`
- `WorkspaceGitActions` — `packages/app/src/git/workspace-actions.tsx` (already used, no change)
- i18n `workspace.environment` — `packages/app/src/i18n/index.ts:92-140` (zh-CN) / `:1173-1221` (en)
- Constants: `WORKSPACE_ENVIRONMENT_PANEL_WIDTH = 300` (line 251), `ENVIRONMENT_SUBAGENT_ROW_LIMIT = 5`, `ENVIRONMENT_TODO_ROW_LIMIT = 6`

## Design Decisions

### Always-shown rows (环境信息 section)

Keep these as flat rows in the top card, in this order:

1. **变更** (changes) — `EnvironmentActionRow` → `onOpenChanges` with `DiffStat` trailing. Existing, no change.
2. **本地** / **远程** — `EnvironmentDisplayRow` with locality icon. Existing, no change.
3. **分支** (branch) — only when `isGitCheckout`. Existing, no change.
4. **提交或推送** (commit or push) — only when `isGitCheckout`. Existing, no change.
5. **来源** (source) — closing static row. Existing, no change.

**Rationale:** The user's request says "默认在对话中只显示变更文件的数量, 绿色+红色-. 以及git操作按钮, 可以点击提交或者推送. 你看看还有其他合适的常驻展示的内容". The always-shown items match the reference: changes count, branch, commit/push, and source. The "本地/远程" locality row is a natural extension — it tells you which daemon the workspace is bound to (the screenshot's "本地" / "Local" row with a chevron). Including it stays close to the screenshot.

### On-demand sections (子智能体 / 任务)

- **`WorkspaceSubagentsSection`**: render only when `subagents.length > 0`. Currently has `useState(false)` — keep that (matches the screenshot's collapsed state). Section header label is already `formatHeaderLabel(rows)` ("N subagents · M running").
- **`WorkspaceTodoProgressSection`**: render only when `todoItems?.length`. Change `useState(true)` → `useState(false)`. The progress bar is part of the header (always visible when expanded collapses the body), so users still get a quick visual signal via the section header label "X/Y done" (4px bar lives inside body per line 1627).
- Both sections share a `EnvironmentSectionHeader` with chevron, icon, and label.

**Rationale:** The user wants these hidden until something happens. The data sources (`useSubagentsForParent`, `useEnvironmentPanelTodoItems`) already return empty when nothing has fired, so the `length > 0` check is enough — no new data plumbing required.

### What to remove

- **`WorkspacePullRequestRow`** (PR row in the current git block): the screenshot does not show a PR row in the always-shown area, and the user did not call it out. **Decision: keep it where it is** (between branch and commit/push, only when `isGitCheckout && githubRuntime` is loaded). It is conditional on git checkout and the data source already exists, so it costs little. If the user wants it hidden too, that's a follow-up.

  _This is a small interpretation call._ A simpler design would drop it; the more conservative design keeps it. Plan it as a single follow-up question if needed, or default to "keep".

- **打开位置 (open location) row** — the screenshot does not show this. It's not harmful but redundant for the always-shown area. **Decision: keep it**, hidden behind the "changes" row only when desktop, removed on mobile. (Actually the current code shows it on both. Plan: keep on both, since the `WorkspaceOpenInEditorButton` is a useful affordance.) _Mark as a small follow-up for user review._

Actually, re-reading the request: "默认在对话中只显示变更文件的数量, 绿色+红色-. 以及git操作按钮, 可以点击提交或者推送. 你看看还有其他合适的常驻展示的内容" — the user is open to other reasonable always-shown content. So:

- **Keep:** changes, branch, commit/push, source — these are the core.
- **Keep, but optional to hide:** locality, open-location, PR row — present, can be removed in iteration.
- **Hide by default:** subagents, todos.

The most conservative interpretation is to keep all existing rows but change subagent/todo to be hidden+collapsed. That's the lowest-risk first cut. The plan below implements that.

## Implementation Steps

### Step 1: Modify `WorkspaceSubagentsSection` (collapse default already false — no change, but verify)

File: `packages/app/src/screens/workspace/workspace-screen.tsx:1466-1505`

- Verify `useState(false)` (already correct from exploration).
- No code change.

### Step 2: Modify `WorkspaceTodoProgressSection` (change default to collapsed)

File: `packages/app/src/screens/workspace/workspace-screen.tsx:1575-1627`

- Change `useState(true)` → `useState(false)`.

### Step 3: Conditionally render the subagents + todo block

File: `packages/app/src/screens/workspace/workspace-screen.tsx:1326-1332`

- Currently:
  ```tsx
  {
    hasProgressSections ? (
      <>
        <View style={styles.environmentDivider} />
        <WorkspaceSubagentsSection rows={subagents} onOpenSubagent={onOpenSubagent} />
        <WorkspaceTodoProgressSection items={todoItems} />
      </>
    ) : null;
  }
  ```
- Refactor to render each section only when its data is present, with separate dividers:
  ```tsx
  {
    subagents.length > 0 ? (
      <>
        <View style={styles.environmentDivider} />
        <WorkspaceSubagentsSection rows={subagents} onOpenSubagent={onOpenSubagent} />
      </>
    ) : null;
  }
  {
    todoItems && todoItems.length > 0 ? (
      <>
        <View style={styles.environmentDivider} />
        <WorkspaceTodoProgressSection items={todoItems} />
      </>
    ) : null;
  }
  ```
- Remove the `hasProgressSections` local (workspace-screen.tsx:1291) since it's no longer used.

### Step 4: Adjust i18n if any new strings are needed

After the above, the existing keys (`title`, `changes`, `openLocation`, `local`, `remote`, `branch`, `commitOrPush`, `source`, `noSource`, `subagents`, `tasks`, `taskProgress`, `moreSubagents`, `moreTasks`) are all reused. **No new i18n strings required for the minimal plan.**

_Optional_ follow-up: add a `t("workspace.environment.noActivity")` for an explicit "all clear" row when both subagents and todos are empty. Skip for v1.

### Step 5: Typecheck, build, and rebuild desktop

```bash
cd C:/Ai/ChisaCode
npm run typecheck
cd packages/app && npm run build:web
# Kill running ChisaCode, then:
rm -rf packages/desktop/release/win-unpacked
cp -r packages/app/dist packages/desktop/release/win-unpacked/resources/app-dist  # or rebuild via electron-builder
start "" packages/desktop/release/win-unpacked/ChisaCode.exe
```

(Exact rebuild step depends on whether the release dir is locked. If `electron-builder` is too slow or the dir is locked, the `cp -r` shortcut is fine because `electron-builder.yml` `extraResources` already declared this layout in the previous build.)

## Risks and Mitigations

| Risk                                                                | Likelihood | Mitigation                                                                                                                                    |
| ------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Subagent section header re-renders too often, causing visual jitter | Low        | Existing `useState` pattern is stable. No new memoization needed since section is unmounted on `rows=[]`.                                     |
| Removing `hasProgressSections` breaks a downstream call             | Low        | Verified usage via exploration — local const, only used in the one place at line 1326.                                                        |
| Desktop release dir locked (ChisaCode.exe running) prevents rebuild | Medium     | Kill ChisaCode processes with `taskkill //F //IM ChisaCode.exe` first, or copy the new app dist directly into the existing resources/ folder. |
| i18n missing a key causes a runtime warning                         | Low        | Step 4 confirms no new keys needed for the minimal plan. If we add `noActivity` later, add to BOTH locale blocks at the same time.            |
| PR row and open-location row feel noisy in the always-shown area    | Medium     | Plan is conservative: keep them. Iteration 2 can prune if user wants.                                                                         |

## Verification Steps

1. **Typecheck:** `cd C:/Ai/ChisaCode && npm run typecheck` — must complete with no errors in `packages/app`.
2. **Web build:** `cd C:/Ai/ChisaCode/packages/app && npm run build:web` — must produce a new `dist/_expo/static/js/web/index-*.js` (different hash than before).
3. **Desktop rebuild:** kill ChisaCode, copy new `app/dist` into the release resources, relaunch.
4. **Manual visual test on a git workspace:**
   - Open a git repo workspace. Verify: 变更, 本地, 分支, 提交或推送, 拉取请求 (if any), 来源 rows all visible. No subagent/todo section (assuming none active).
   - Trigger a subagent (or simulate via existing data). Section "子智能体 N个" should appear, **collapsed by default**. Click chevron → expands.
5. **Manual visual test on a non-git workspace:**
   - Verify the git-only rows (branch, commit/push, PR) are absent. Locality row shows "本地" or "远程".
6. **Mobile sanity check (optional):** if dev server is reachable from a phone, open the same workspace and confirm the panel still renders (panel width is desktop-only; mobile should fall back to the existing compact rendering via `isMobile` branch in `WorkspaceEnvironmentPanelRail`).

## Out of Scope (follow-ups)

- Removing the PR row and open-location row from always-shown (waiting on user feedback).
- Adding a `noActivity` placeholder when both subagents and todos are empty.
- Making the section header re-render cheaply with `React.memo` (premature).
- A unified "expand/collapse all" toggle for the subagent + todo sections.
- Adding real "file output" / "uploads" / "src" tracking — that requires new daemon data not in the protocol today.

## Notes

- This plan does not touch the pairing-offer / relay code; the earlier `ls pairing-offer.ts` modification is unrelated.
- The plan is a pure UI reorganization. No RPC, no protocol, no daemon changes.
- The plan does not require any package install or new dependency.
