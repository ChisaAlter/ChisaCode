# Task 3 Code Review: MiMoCode Gateway Face Removal

## Skill-Perspective Check

- `code-review` skill: loaded from `C:/Users/48818/.claude/skills/code-review/SKILL.md`.
- `remove-ai-slops` and `programming` skills: unavailable as loadable skill files. I searched the advertised skill roots for matching skill names/paths and found no `remove-ai-slops` or `programming` skill. I applied the prompt-provided fallback criteria instead.
- Result: no production-code violation of either fallback perspective. Tests contain two low-severity quality concerns: a length-only assertion and a stale/misleading gateway fixture including Grok Build.

## CRITICAL

None.

## HIGH

None.

## MEDIUM

- `packages/app/src/screens/settings/synthetic-models-section.test.tsx` did not execute. The evidence at `.superpowers/sdd/2026-08-07-mimocode-hard-removal/task-3-evidence-green-synthetic-models-section.txt` shows an import-time `SyntaxError: Unexpected token 'typeof'`, and the diagnostic artifact traces through `toast-host` to unmocked `react-native-safe-area-context`. This leaves component-harness coverage unverified for the changed refresh-id expectation at `packages/app/src/screens/settings/synthetic-models-section.test.tsx:555`. I do not consider this load-bearing for Task 3 approval because the production code path uses `buildModelGatewayProviderIdList(gatewayId)` at `packages/app/src/screens/settings/synthetic-models-section.tsx:1208`, and the pure helper test verifies the exact five all-scope ids at `packages/app/src/screens/settings/custom-model-providers.test.ts:797`. Planned real Electron QA should still cover the actual UI surface before final project completion.

## LOW

- `packages/app/src/screens/settings/custom-model-providers-section.test.tsx:600` only checks that refreshed provider ids have length `5`. This would miss wrong ordering or replacing one of the five implemented faces with an unsupported face. The helper test has the stronger exact assertion, so this is not a blocker.
- `packages/app/src/provider-selection/provider-selection.test.ts:169` still names the fixture "every generated agent provider" while including `grokbuild` at `packages/app/src/provider-selection/provider-selection.test.ts:170` and an `opencode-grokbuild` gateway entry at `packages/app/src/provider-selection/provider-selection.test.ts:181`. Production gateway materialization remains limited to claude/codex/opencode/pi/kimi, so this is not a functional Grok Build gateway addition, but the fixture wording is misleading against the "do not add Grok Build gateway support" constraint.

## Spec Compliance

Pass with warnings.

Strengths:

- Strict protocol gateway config now rejects `generatedProviderIds.mimocode` and `generatedModels.mimocode`; the generated face schema is five-face only at `packages/protocol/src/provider-config.ts:219`.
- Server face resolution preserves `supplyScope` precedence and returns the five implemented faces only: `resolveGatewayAgentFaces` handles explicit all/matched before legacy `attachToAllAgents` at `packages/server/src/server/agent/provider-registry.ts:920`, and `allFaces` is claude/codex/opencode/pi/kimi only at `packages/server/src/server/agent/provider-registry.ts:989`.
- Server materialization registers only claude, codex, opencode, pi, and kimi faces at `packages/server/src/server/agent/provider-registry.ts:1096`, `packages/server/src/server/agent/provider-registry.ts:1105`, `packages/server/src/server/agent/provider-registry.ts:1114`, `packages/server/src/server/agent/provider-registry.ts:1126`, and `packages/server/src/server/agent/provider-registry.ts:1138`.
- App generation now emits only the five gateway ids and removes the MiMoCode generated model branch at `packages/app/src/screens/settings/custom-model-providers.ts:220`, `packages/app/src/screens/settings/custom-model-providers.ts:247`, and `packages/app/src/screens/settings/custom-model-providers.ts:1045`.
- Vision fallback no longer parses a `-mimocode` suffix, leaving only the five face suffixes at `packages/server/src/server/agent/vision-fallback.ts:107` and `packages/server/src/server/agent/vision-fallback.ts:323`.
- User-facing copy now names Claude / Codex / OpenCode / Pi / Kimi Code with no MiMoCode gateway copy at `packages/app/src/i18n/index.ts:1003` and `packages/app/src/i18n/index.ts:2956`.
- No Grok Build gateway materialization was added; generic ACP tests and behavior remain separate.
- The residual `api.xiaomimimo.com` string is in model-gateway upstream compatibility rules at `packages/server/src/server/model-gateway/model-gateway.ts:169`, not a generated gateway face path. That aligns with preserving remaining provider behavior.

## Evidence Reviewed

- Diff: `.superpowers/sdd/2026-08-07-mimocode-hard-removal/review-13abe59d2..90ef77ca7.diff`
- Implementer report: `.superpowers/sdd/2026-08-07-mimocode-hard-removal/task-3-report.md`
- Red test evidence: `.superpowers/sdd/2026-08-07-mimocode-hard-removal/task-3-evidence-red-custom-model-providers.txt`
- Green targeted evidence: protocol build, custom model provider helper/section tests, provider-selection tests, provider-snapshot tests, provider-registry test, vision-fallback test, format, and lint artifacts in the same evidence directory.
- Warning evidence: synthetic-models-section import-time failure and workspace typecheck TS2352 artifacts in the same evidence directory.

## Status

- codeQualityStatus: WATCH
- recommendation: APPROVE
- blockers: none
