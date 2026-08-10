# Production Hardening Phase 0 Baseline

- recordedAt: 2026-08-10T05-34-45Z
- branch: cn-main
- head: e9534e8df762bd95eead83e5562346c13b38b7a3
- shortHead: e9534e8df
- node: v24.15.0
- npm: 11.12.1

## git status --short

```
 M docs/model-gateway-conversion.md
 M docs/refactors/comprehensive-improvement-roadmap.md
 M packages/server/src/server/bootstrap-model-gateway.test.ts
 M packages/server/src/server/bootstrap.ts
 M packages/server/src/server/model-gateway/model-gateway.test.ts
 M packages/server/src/server/model-gateway/model-gateway.ts
?? .omo/evidence/desktop-first-send-gateway-verify-2026-08-09T12-53-30-744Z.md
?? .omo/evidence/desktop-first-send-gateway-verify-2026-08-09T12-56-23-414Z.md
?? .omo/evidence/model-gateway-stream-real-verify-2026-08-10.md
?? .omo/evidence/production-hardening-phase0-baseline-2026-08-10T05-34-45Z.md
?? packages/app/e2e/desktop-first-send-gateway-verify.script.ts
```

## Model Gateway in-flight diff inventory (paths only, no secrets)

```
M	docs/model-gateway-conversion.md
M	docs/refactors/comprehensive-improvement-roadmap.md
M	packages/server/src/server/bootstrap-model-gateway.test.ts
M	packages/server/src/server/bootstrap.ts
M	packages/server/src/server/model-gateway/model-gateway.test.ts
M	packages/server/src/server/model-gateway/model-gateway.ts

 M docs/model-gateway-conversion.md
 M docs/refactors/comprehensive-improvement-roadmap.md
 M packages/server/src/server/bootstrap-model-gateway.test.ts
 M packages/server/src/server/bootstrap.ts
 M packages/server/src/server/model-gateway/model-gateway.test.ts
 M packages/server/src/server/model-gateway/model-gateway.ts
?? .omo/evidence/desktop-first-send-gateway-verify-2026-08-09T12-53-30-744Z.md
?? .omo/evidence/desktop-first-send-gateway-verify-2026-08-09T12-56-23-414Z.md
?? .omo/evidence/model-gateway-stream-real-verify-2026-08-10.md
?? .omo/evidence/production-hardening-phase0-baseline-2026-08-10T05-34-45Z.md
?? packages/app/e2e/desktop-first-send-gateway-verify.script.ts
```

## git diff --stat (tracked only)

```
 docs/model-gateway-conversion.md                   |   7 +
 .../refactors/comprehensive-improvement-roadmap.md |   2 +-
 .../src/server/bootstrap-model-gateway.test.ts     | 327 ++++++++++++++++++++-
 packages/server/src/server/bootstrap.ts            |  87 +++++-
 .../src/server/model-gateway/model-gateway.test.ts |  97 +++++-
 .../src/server/model-gateway/model-gateway.ts      |  31 +-
 6 files changed, 522 insertions(+), 29 deletions(-)
```

## Isolation decisions

- Gateway in-flight work remains on cn-main working tree; NOT staged/committed/formatted by hardening.
- Hardening worktree/branch will be created from confirmed baseline SHA: e9534e8df762bd95eead83e5562346c13b38b7a3
- Merge order: complete/merge Gateway independently first when ready; hardening uses post-merge SHA or this baseline if Gateway remains parked.
- Legacy transition provisional decision (pending explicit user override): new daemon MUST accept released v1.0.x offer-only clients as legacy fallback with old security level UI; force-new-only remains explicit opt-in; COMPAT delete version required.
- Forbidden verify script: packages/app/e2e/desktop-first-send-gateway-verify.script.ts will not be run as-is (port kill + full config copy).
