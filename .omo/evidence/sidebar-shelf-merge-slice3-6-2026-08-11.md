# Sidebar shelf merge Slice 3–6 verification

- Date: 2026-08-11
- Branch: cn-main (local WIP)
- Goal: view switcher + search, by-status T3 shelves, multi-select bulk actions, e2e testid alignment

## Implementation surface

- View mode persistence: `packages/app/src/stores/sidebar-order-store.ts` (`sidebarViewMode: by-project | by-status`)
- Top switcher + search: `packages/app/src/components/left-sidebar.tsx`
- Project list + lifecycle marks: `packages/app/src/components/sidebar-session-list.tsx`
- By-status shelves: `packages/app/src/components/sidebar-status-view.tsx`
- Label cache shared path: `packages/app/src/utils/sidebar-agent-label-cache.ts`
- Prototype: `prototypes/sidebar-shelf-merge.html`

## Dual testids for e2e compatibility

| testid                     | purpose                                     |
| -------------------------- | ------------------------------------------- |
| `sidebar-sessions`         | list root / mobile visibility               |
| `sidebar-v2-thread-{id}`   | thread row locator (project + status views) |
| `sidebar-v2-new-project`   | dual on new-conversation CTA                |
| `sidebar-v2-scope-trigger` | dual shim on view switcher                  |
| `sidebar-v2-menu-rename`   | dual on rename menu item                    |

Helpers updated to accept production + dual markers:

- `e2e/helpers/workspace-ui.ts` (`waitForSidebarHydration`)
- `e2e/helpers/new-workspace.ts`
- `e2e/helpers/workspace-setup.ts`
- `e2e/sidebar-workspace.spec.ts`
- `e2e/sidebar-workspace-rename.spec.ts` (modal rename, not inline textbox)

## Automated gates

### Vitest (focused)

```
npx vitest run \
  packages/app/src/components/sidebar-session-list.test.tsx \
  packages/app/src/components/sidebar-status-view.test.tsx \
  packages/app/src/stores/sidebar-order-store.test.ts \
  packages/app/src/utils/sidebar-agent-label-cache.test.ts \
  packages/app/src/sidebar-v2/store.test.ts \
  --bail=1
```

Result: **56+ focused tests green** across the sessions above (session-list 48, status-view 2, order-store 6, plus cache/store tests from earlier slices).

### Lint / typecheck / format

- `npm run lint -- <changed app/e2e paths>` → 0 errors
- `npx tsc -p packages/app --noEmit` filtered to changed paths → 0 errors
- `npm run format:files -- <changed paths>` → clean

### Playwright (web Desktop Chrome, focused)

```
cd packages/app
npx playwright test --project="Desktop Chrome" \
  e2e/sidebar-workspace.spec.ts \
  e2e/sidebar-workspace-rename.spec.ts \
  --reporter=line
```

Result: **4 passed, 1 skipped** (mobile panelState transition remains skipped as before).

## Real-surface status (honest)

| surface                                               | status                              |
| ----------------------------------------------------- | ----------------------------------- |
| Web Playwright (Desktop Chrome) focused sidebar specs | **passed**                          |
| Packaged Electron win-unpacked cold-start matrix      | **passed 2026-08-11** (15/15 gates) |
| Physical mobile native matrix                         | **not claimed**                     |

Packaged gate:

```
npm run build:x64 --workspace=@chisacode/desktop
cd packages/app && npx tsx e2e/desktop-packaged-sidebar-shelf.script.ts
```

Evidence:

- `.omo/evidence/desktop-packaged-sidebar-shelf-2026-08-11T01-06-28-216Z.md`
- screenshots: `.omo/evidence/sidebar-shelf-by-project.png`, `sidebar-shelf-by-status.png`, `sidebar-shelf-final-by-project.png`
- Desktop shortcut refreshed → `packages/desktop/release/win-unpacked/ChisaCode.exe`

Gates covered on packaged Electron:

- cold start + desktop-managed daemon online
- dual hydration testids (`sidebar-v2-new-project`, `sidebar-sessions`)
- view switcher + search input
- by-project thread row dual testid
- context menu rename / settle / snooze
- by-status shelves + thread row
- search match keeps row / non-match hides row (scoped to sidebar shell)

Not exercised on packaged surface in this gate (still unit-covered): multi-select bulk bar click path, snooze auto-wake timer expiry, pin+snooze priority re-shelving.

## Residual edges

1. ~~Packaged Electron real-machine~~ **done** (script + 15/15 gates). Optional follow-up: extend script for multi-select bulk + snooze wake timer.
2. `sidebar-v2/` presentation components remain dead code until a cleanup pass after packaged verification.
3. Mobile compact reuses desktop shelf structure (intentional; not a native mobile redesign).
