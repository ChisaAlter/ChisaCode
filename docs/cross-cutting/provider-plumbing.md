# Provider Plumbing

Use this when adding or changing built-in providers, custom providers, model/mode discovery, provider diagnostics, provider settings, or runtime env/config behavior.

## Modules

- `protocol`: provider config schemas and protocol-visible provider data.
- `server`: provider registry, manifest, launch config, daemon config store, runtime adapters, diagnostics.
- `client`: request/response helpers and daemon transport behavior for provider operations.
- `app`: settings UI, provider selectors, icons, model/mode display, host-scoped refresh flows.
- `cli`: provider list/model commands and daemon-facing command options.

## Existing Docs

- `docs/providers.md`
- `docs/custom-providers.md`
- `docs/development.md`

## Invariants

- Built-in provider work is multi-surface. Do not stop after adding a provider class.
- Provider IDs are runtime-validated strings, not closed TypeScript unions.
- Models and modes may be discovered dynamically; UI metadata and runtime truth are separate.
- Custom provider config is daemon-global and must be visible to all agents that use that daemon.
- Runtime settings replacement must not spawn provider processes unless an explicit refresh path asks for probing.

## Handoff Checklist

1. Read provider docs before editing.
2. Map all touched surfaces: schemas, config store, registry, runtime adapter, app UI, CLI, tests.
3. Decide whether the provider is ACP-based or direct.
4. Check whether the change is built-in provider work, custom profile work, or both.
5. Refresh module graphs after structural changes.
6. Verify with targeted tests or package build chains; do not run broad provider E2E locally unless requested.
