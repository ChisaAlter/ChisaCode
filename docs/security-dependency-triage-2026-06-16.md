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

- Expo / React Native toolchain advisories that still require framework-level work
  (`postcss`, `uuid`, `js-yaml`, `tar`, and the `expo-*` package advisories): these sit
  mostly in mobile build/dev tooling and require Expo/RN framework upgrades. Do not
  force-upgrade Expo major in the security batch.
- `markdown-it`: no direct fix is available through `react-native-markdown-display`. Because user and agent Markdown is rendered in the app, evaluate either replacing the renderer or disabling high-risk Markdown rules in a focused follow-up.

## Notes

- Do not use `npm audit fix --force` for the remaining advisories.

## Resolved Follow-up - 2026-07-12

- Removed the legacy `ai@5.0.78` dependency entirely; server MCP consumers now use
  `@ai-sdk/mcp@2.0.10` and the stable `createMCPClient` API.
- The migration moves `@ai-sdk/provider-utils` from the vulnerable 3.x line to 5.0.7,
  raises the server Zod peer floor to `^3.25.76`, and establishes Node.js 22 as the minimum runtime.

## Resolved Follow-up - 2026-07-13

- Upgraded OpenAI SDK from 4.x to 6.46.0 as the Zod 4 compatibility prerequisite.
- Unified direct Zod dependencies in protocol, client, app, desktop, and server on 4.3.6. Existing schemas import the official `zod/v3` compatibility API so wire and persistence parsing semantics remain stable while the dependency graph uses one package version.
- Upgraded `@anthropic-ai/claude-agent-sdk` to 0.2.141, `@anthropic-ai/sdk` to 0.93.0, and direct `@modelcontextprotocol/sdk` to 1.29.0 without `--legacy-peer-deps` or `--force`.
- Production audit moved from 26 to 24 findings, remains at 0 high / 0 critical, and no longer reports Claude or Anthropic packages. Remaining moderate findings are primarily Expo/EAS framework-major work.
