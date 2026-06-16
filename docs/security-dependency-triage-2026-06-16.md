# Security Dependency Triage - 2026-06-16

Audit command:

```bash
npm audit --omit=dev --audit-level=high --registry=https://registry.npmjs.org/
```

## Applied

- Pinned direct workspace `ws` dependencies to `8.21.0`.
- Added root overrides for `ws@8.21.0`, `form-data@4.0.6`, and `shell-quote@1.8.4`.
- Upgraded `@chisacode/server` Express dependency to `^4.22.2`, which brings patched `qs` through the server-local install path.

## Audit Delta

- Before: 47 vulnerabilities, including 6 high and 1 critical.
- After this batch: 41 vulnerabilities, including 4 high and 0 critical.

## Deferred

- `ai@5.0.78` / `@ai-sdk/provider-utils`: npm requires `ai@6`, a runtime major. Handle as a dedicated provider compatibility slice with targeted provider tests.
- `@anthropic-ai/claude-agent-sdk`: patched `0.2.141` resolves the vulnerable SDK path but requires `zod@4`. The repo still uses Zod 3 across protocol/client/server packages, so this needs a Zod migration slice instead of a security patch batch.
- Expo / React Native toolchain advisories (`@xmldom/xmldom`, `node-forge`, `picomatch`, `postcss`, `undici`, `uuid`, `js-yaml`, `tar`): these sit mostly in mobile build/dev tooling and require Expo/RN framework upgrades. Do not force-upgrade Expo major in the security batch.
- `markdown-it`: no direct fix is available through `react-native-markdown-display`. Because user and agent Markdown is rendered in the app, evaluate either replacing the renderer or disabling high-risk Markdown rules in a focused follow-up.

## Notes

- The lockfile update used `--legacy-peer-deps` because the current dependency graph already contains a peer conflict: `@anthropic-ai/claude-agent-sdk@0.2.133` declares `zod@4`, while the repo intentionally remains on Zod 3.
- Do not use `npm audit fix --force` for the remaining advisories.
