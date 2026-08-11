# Production hardening final closeout

- recordedAt: 2026-08-10T10-47-50Z
- branch: `codex/production-hardening-2026-08-10` @ `49b5c18a5` (pushed, PR #32)
- main isolation: cn-main Gateway dirty files untouched

## Final delivery inventory (landed + locally verified)

| Phase | Deliverable                                                                                                            | Evidence                          |
| ----- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| 0     | Isolation worktree from e9534e8df; Gateway dirt untouched                                                              | phase0-baseline / phase0-progress |
| 1A    | Archive safety: mutation coordinator, force-refresh gate, awaited teardown, probe+force delete                         | phase1a + coordinator tests       |
| 1B    | git-snapshot leaf filtering + HEAD read-tree baseline + unborn handling                                                | phase1b + git-snapshot tests      |
| 2     | Relay device-auth v2: protocol/server/client/app + approved prototype UI + threat model                                | phase2-\* + auth tests            |
| 3     | WS message lanes (bounded keyed FIFO + preempt)                                                                        | phase3 + lanes tests              |
| 4A    | File transfer: 1MB chunk loop, size guard, 15m timeout, idle timer                                                     | phase4a + binary frames tests     |
| 4B    | Terminal stream subscription intents + reconnect resubscribe                                                           | phase4b + router tests            |
| 5     | Audit fingerprint baseline v2 green; CI push/PR; exact-SHA gate; checkout_ref close; coverage + packaged electron jobs | phase5-\*                         |
| 6     | Docs/security claims + knowledge graphs + roadmap calibration                                                          | phase6-docs                       |
| 7     | Local integration: typecheck/lint/audit green, packaged desktop ALL SLICES PASSED                                      | simplify-closeout + this file     |

## Bugs fixed during CI enablement (attached, not scope creep)

- lockfile `registry.npmmirror.com` -> npmjs.org (CI lockfile-lint)
- knowledge graph drift regenerated
- knip: babel-preset-expo declared; electron ignore; zx-path-compat self-import removed
- format: pre-existing prototype html oxfmt'd
- coverage-server builds server-deps first
- daemon-client hello/providers expectations aligned to shipped capabilities (cindy_modules, grokbuild)
- renderer crash: node:crypto -> pure-JS HMAC-SHA256 (sha256-hmac.ts), parity-tested

## Explicitly not done (user simplification)

- Pre-existing CI test failures (host-runtime stale, codex resume, synthetic-models, opener, maestro) not fixed
- CI full-green run not chased; run 31373942201 result recorded as-is
- Plan section 9 not claimed complete; G010 stays review_blocked

## Residual acceptance summary (see g011-residual-acceptance for detail)

- Actions `desktop-packaged-electron` green on hardening SHA: UNVERIFIED (local packaged gate passed as substitute)
- Formal draft release dry-run: UNVERIFIED
- Mobile pairing QA: UNVERIFIED
- Human merge->archive surface drill: UNVERIFIED (automated drill green)
- Full pixel QA vs pairing prototype: UNVERIFIED
- Device-list revoke admin UI: partial
- `clientPublicKeyB64` ephemeral E2EE client key stand-in: named follow-up

## Verification honesty

- No claim of plan section 9 completion
- All local gates above were executed this session with outputs recorded
- Everything else explicitly labeled UNVERIFIED
