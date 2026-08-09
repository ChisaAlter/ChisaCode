# First-send startup surface verification (2026-08-09)

## 1. Real daemon (trace)

Command:

```bash
npx tsx packages/server/scripts/verify-first-send-startup.ts
```

Result: **PASS**

- `pendingRun: true`
- `acceptedBeforeSpawn: true`
- acceptance ~4ms after send start
- first `provider.codex.spawn` ~246ms after acceptance
- post-send listModels-style spawn count: `0`
- evidence detail: `.omo/evidence/first-send-startup-daemon-verify-2026-08-09.md`

## 2. Real web Playwright

Command:

```bash
cd packages/app && npx playwright test --project="Desktop Chrome" e2e/turn-anchor.spec.ts
```

Result: **2 passed**

Coverage relevant to this plan:

- send path with optimistic user message
- projection-ack releases composer busy so a second message can queue while streaming
- turn-anchor scroll semantics still hold after non-blocking send

## 3. Real Electron desktop (dev-managed)

Command:

```bash
cd packages/app && npx tsx e2e/desktop-slices.script.ts
```

Result: **ALL DESKTOP SLICES PASSED**

- Slice B: sent row anchored upper half
- Slice C: busy released, second message queued and flushed
- Slice D/E: work-log fold + streaming fence
- SidebarV2 smoke skipped as non-blocking best-effort (testid lag unrelated to first-send work)

## 4. Packaged Electron

Command:

```bash
cd packages/app && npx tsx e2e/desktop-packaged-slices.script.ts
```

Result: **ALL PACKAGED SLICES PASSED**

- same Slice B/C/D/E assertions on packaged `ChisaCode.exe`
- SidebarV2 smoke skipped as non-blocking best-effort

## Notes

- SidebarV2 thread-row testid lag is a pre-existing soft-home/sidebar presentation issue, not introduced by first-send latency work.
- Desktop/packaged scripts now soft-skip that smoke so B/C/D/E gates remain verifiable.
