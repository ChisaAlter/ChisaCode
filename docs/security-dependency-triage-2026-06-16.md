# Security Dependency Triage - 2026-06-16

Audit command:

```bash
npm audit --omit=dev --audit-level=high --registry=https://registry.npmjs.org/
```

## Applied

- Pinned direct workspace `ws` dependencies to `8.21.0`.
- Added root overrides for `ws@8.21.0`, `form-data@4.0.6`, and `shell-quote@1.8.4`.
- Upgraded `@chisacode/server` Express dependency to `^4.22.2`, which brings patched `qs` through the server-local install path.
- Added root overrides for high-risk Expo/tooling transitive dependencies that can be
  patched without an Expo/RN major upgrade:
  - `@xmldom/xmldom@0.8.13`
  - `node-forge@1.4.0`
  - `picomatch@4.0.4`, with scoped `2.3.2`/`3.0.2` overrides for older callers
  - `undici@6.24.0` under `@expo/cli`
- Added `hono@4.12.25` override for the `@modelcontextprotocol/sdk` server path after
  npm audit raised the `hono <=4.12.24` advisory to high severity.

## Audit Delta

- Before: 47 vulnerabilities, including 6 high and 1 critical.
- After this batch: 36 vulnerabilities, including 0 high and 0 critical.
- `npm ls ai @ai-sdk/provider-utils @anthropic-ai/claude-agent-sdk @anthropic-ai/sdk react-native-markdown-display markdown-it ws form-data shell-quote --all --depth=6` exited cleanly in the local audit environment; the local install tree reflects the `ws`, `form-data`, and `shell-quote` overrides.
- `npm ls @xmldom/xmldom node-forge picomatch undici --all --depth=10` exited cleanly
  in the local audit environment; the high-risk transitive dependency overrides are installed, not just
  declared.
- `npm ls hono --all --depth=10` now exits cleanly with `hono@4.12.25` installed under
  `@modelcontextprotocol/sdk`.

## Deferred

- `ai@5.0.78` / `@ai-sdk/provider-utils`: npm requires `ai@6`, a runtime major. Handle as a dedicated provider compatibility slice with targeted provider tests.
- `@anthropic-ai/claude-agent-sdk`: patched `0.2.141` resolves the vulnerable SDK path but requires `zod@4`. The repo still uses Zod 3 across protocol/client/server packages, so this needs a Zod migration slice instead of a security patch batch.
- Expo / React Native toolchain advisories that still require framework-level work
  (`postcss`, `uuid`, `js-yaml`, `tar`, and the `expo-*` package advisories): these sit
  mostly in mobile build/dev tooling and require Expo/RN framework upgrades. Do not
  force-upgrade Expo major in the security batch.
- `markdown-it`: no direct fix is available through `react-native-markdown-display`. Because user and agent Markdown is rendered in the app, evaluate either replacing the renderer or disabling high-risk Markdown rules in a focused follow-up.

## Notes

- The lockfile update used `--legacy-peer-deps` because the current dependency graph already contains a peer conflict: `@anthropic-ai/claude-agent-sdk@0.2.133` declares `zod@4`, while the repo intentionally remains on Zod 3.
- A non-force `npm audit fix --omit=dev --registry=https://registry.npmjs.org/` attempt fails at the same `@anthropic-ai/claude-agent-sdk@0.2.141` / Zod 4 peer boundary. Do not bypass this with `--force`; handle it in the Zod migration slice.
- Do not use `npm audit fix --force` for the remaining advisories.
