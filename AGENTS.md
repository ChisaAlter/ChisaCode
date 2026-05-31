# Paseo Agent Notes

## Sources Of Truth

- Use Node `22.20.0` from `.tool-versions`; this is an npm workspace monorepo with `package-lock.json`, not pnpm/yarn.
- `docs/` holds repo-specific architecture, workflow, and gotcha docs. For non-trivial work, list it and skim the relevant file before editing.
- `CLAUDE.md` has longer standing guidance; prefer this file for the compact checklist and consult the docs it references for details.

## Package Map

- `packages/server`: local daemon, WebSocket API, MCP server, agent lifecycle, file-backed state under `$PASEO_HOME/agents/`.
- `packages/protocol`: shared WebSocket schemas/types and binary frame codecs; server, app, CLI, and client depend on it.
- `packages/client`: daemon WebSocket driver plus `PaseoClient`; app/CLI may still import internal daemon client paths during migration.
- `packages/app`: Expo app for iOS, Android, browser web, and the desktop renderer UI.
- `packages/cli`: Commander CLI; run the checkout version with `npm run cli -- ...`, not a globally installed `paseo`.
- `packages/desktop`: Electron wrapper that can spawn/manage its own daemon.
- `packages/relay`: E2E encrypted relay; see `SECURITY.md` before changing relay/auth behavior.
- `packages/website`: TanStack/Cloudflare marketing/docs site.

## Commands

- Install with `npm ci`; CI uses Node 22 and npm cache.
- Dev all surfaces: `npm run dev` on macOS/Linux, `npm run dev:win` on Windows.
- Focused dev: `npm run dev:server`, `npm run dev:app`, `npm run dev:desktop`, `npm run dev:website`.
- Build dependency stacks instead of guessing order: `npm run build:client` (`protocol -> client`), `npm run build:server-deps` (`highlight -> relay -> protocol -> client`), `npm run build:server` (`server-deps -> server -> cli`), `npm run build:app-deps` (`highlight -> protocol -> client -> expo-two-way-audio`).
- Verify after edits with `npm run typecheck` and `npm run lint`; format with `npm run format` or targeted `npm run format:files -- <paths>`.
- Targeted lint accepts file paths through the npm script, e.g. `npm run lint -- packages/app/src/file.tsx`; do not call `npx oxlint`/`npx oxfmt` directly for normal checks.

## Build And Runtime Gotchas

- Workspace package exports resolve to compiled `dist/`, not sibling `src/`; rebuild producer packages before diagnosing cross-package type/runtime errors.
- `npm run dev`, `dev:server`, and `dev:app` do initial builds and then watch `protocol` and `client`; outside those workflows, rebuild after changing protocol/client code.
- Do not restart the main daemon on `localhost:6767` without permission; it may be managing the current agent process. Do not assume a timeout means restart is needed.
- On macOS/Linux `npm run dev` uses portless names such as `https://daemon.localhost` / `https://app.localhost` with ephemeral ports; Windows dev binds the daemon to `localhost:6767`.
- Daemon logs are in `$PASEO_HOME/daemon.log`; set `PASEO_LOG_LEVEL=trace` before launch for provider/session/agent-manager traces.

## Testing

- Never run full workspace/package test suites locally unless explicitly asked; they are heavy and can freeze the machine.
- Run the changed Vitest file only: `npx vitest run <path> --bail=1`.
- For broad output, redirect to a file and inspect it afterward: `npx vitest run <path> --bail=1 > /tmp/test-output.txt 2>&1`.
- Do not re-run a suite another agent already reported green; use CI for full-suite confidence.
- Server test categories: `npm run test:unit --workspace=@fleurdelys/server`, `npm run test:e2e --workspace=@fleurdelys/server`, real-provider tests use `*.real.e2e.test.ts` and credentials.
- App Playwright E2E is `npm run test:e2e --workspace=@fleurdelys/app`; do not run the full Playwright suite locally, only targeted specs when needed.
- Tests should be either unit tests with injected real-world ports/fakes or real E2E; avoid `vi.mock`, JSDOM/component mounting, private-state assertions, and auth/env skips in normal tests.

## Protocol And Compatibility

- Wire schemas live in `packages/protocol`; old clients and daemons must still parse new messages.
- Schema additions are optional/defaulted; do not remove fields, make optional fields required, or narrow accepted types.
- New RPCs use dotted names with direction suffixes: `domain.feature.operation.request` paired with `.response`; see `docs/rpc-namespacing.md`.
- New feature support gates live under `server_info.features.*`; tag compatibility shims with `COMPAT(name)` plus added version/removal target.

## App Platform Rules

- App code is cross-platform by default. Import `isWeb`/`isNative` from `@/constants/platform`; use `getIsElectron()` for desktop bridge behavior and `useIsCompactFormFactor()` for layout.
- Prefer `.web.ts(x)`, `.native.ts(x)`, and `.electron.ts(x)` files over large runtime platform branches; Electron sets `PASEO_WEB_PLATFORM=electron`.
- Guard DOM APIs with `isWeb`; raw `document`, `window`, DOM refs, and browser event APIs crash native.
- Hover is web-only; for hover-revealed controls use an always-visible native/compact path. Do not use `onPointerEnter`/`onPointerLeave` for native behavior.

## Style

- Formatting is oxfmt: 2 spaces, double quotes, semicolons, trailing commas, 100-column width; generated `*.gen.ts(x)` files are ignored by formatter config.
- Prefer `function` declarations and `interface` when both work; oxlint enforces no explicit `any`, no array index keys, no nested ternaries, React hook rules, and low nesting/complexity.
- Do not add barrel `index.ts` re-export files just for convenience.
- If a Zod schema exists, derive the type with `z.infer<typeof schema>` instead of hand-writing a parallel type.
