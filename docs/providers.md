# Adding a Provider to ChisaCode

This guide describes the current provider plumbing. Use it when adding a built-in provider or debugging provider registration.

ChisaCode also supports user-defined providers through config. For runtime configuration, see [Custom Provider Configuration](custom-providers.md).

## Current Provider Set

The shared provider manifest currently exposes these user-facing built-ins:

| ID         | Label     | Integration shape                          |
| ---------- | --------- | ------------------------------------------ |
| `claude`   | Claude    | direct provider backed by Claude tooling   |
| `codex`    | Codex     | direct provider backed by Codex app-server |
| `opencode` | OpenCode  | direct provider backed by OpenCode         |
| `mimocode` | MiMoCode  | OpenCode-compatible provider               |
| `pi`       | Pi        | direct provider backed by Pi RPC           |
| `kimi`     | Kimi Code | ACP-backed provider                        |

Development-only providers are `mock` and `mock-slow`.

Custom provider config may derive from any built-in provider ID above, or from the special `acp` value for a generic Agent Client Protocol command.

## Integration Patterns

### Generic ACP Provider

If a runtime speaks the Agent Client Protocol over stdio and does not need a first-class adapter, users can configure it with:

```json
{
  "agents": {
    "providers": {
      "my-agent": {
        "extends": "acp",
        "label": "My Agent",
        "command": ["my-agent", "--acp"]
      }
    }
  }
}
```

The generic ACP client handles process spawning, initialization, session creation, streaming, permissions, model discovery, and mode discovery.

### Built-in ACP Provider

Use a built-in ACP provider when the runtime needs first-class defaults or provider-specific behavior. The current built-in ACP-backed provider is Kimi Code.

Create a provider class that wraps the ACP base client or a specialized ACP client, then register it in the provider registry and shared manifest.

### Direct Provider

Use a direct provider when the runtime does not speak ACP or when ChisaCode must drive provider-specific APIs. The provider implements the `AgentClient` and `AgentSession` contracts directly.

Current direct providers include Claude, Codex, OpenCode, MiMoCode, and Pi.

## Built-in Provider Checklist

### 1. Implement the Provider Client

Create or update a provider implementation under the server provider layer.

The client must expose:

- provider ID
- capabilities
- session creation and resume
- model listing
- availability checks
- optional mode, command, feature, diagnostic, and persisted-session APIs

For direct providers, implement the session lifecycle yourself. For ACP providers, prefer the shared ACP base behavior unless the runtime needs custom handling.

### 2. Add Shared Manifest Metadata

Add the provider to the shared provider manifest with:

- stable provider ID
- label
- description
- default mode ID
- mode metadata with icons and color tiers
- optional voice metadata

The app, CLI, server, and MCP surfaces read provider labels and modes from this shared manifest. Keep this manifest aligned with runtime behavior.

### 3. Register the Provider Factory

Register the provider in the server provider registry. The registry is responsible for:

- creating the provider client
- applying runtime command/env/tool overrides
- resolving derived custom providers
- wrapping derived providers so they keep their custom provider ID
- merging configured models with runtime-discovered models

When a provider can be inherited by custom providers, make sure its factory accepts the custom-provider metadata it needs.

### 4. Add App Catalog and Icon Support

If the provider is user-facing, add it to the app provider catalog with:

- provider ID
- title
- description
- install link
- default command

Register a provider icon if a custom icon exists. Otherwise the app falls back to a generic bot icon.

### 5. Add Config Validation

The provider config schema validates which IDs can be used in `extends`. Add the provider ID there so custom providers can derive from it.

For model gateway support, add generated-provider ID fields only when the gateway can generate a useful profile for that provider.

### 6. Add E2E Provider Config

If the provider participates in server E2E tests, add its real-provider config and availability check. Availability checks should prove the command and required credentials are present; they should not hide failures inside normal tests.

### 7. Verify

Use targeted checks:

```bash
npm run build:server
npm run lint -- <changed-files>
npm run format:files -- <changed-files>
```

Run a changed Vitest file directly when provider behavior changes:

```bash
npx vitest run <path> --bail=1
```

Do not run full test suites locally unless explicitly asked.

## Provider Snapshot Rules

The daemon keeps provider snapshots per resolved working directory. Missing or blank cwd resolves to the user's home directory.

Snapshot reads may probe providers only while the requested cwd scope is cold. Warm entries stay cached until an explicit refresh. Do not add TTL revalidation, focus-triggered refresh, selector-open refresh, or config-reload refresh.

Settings refresh is the user-facing "forget stale provider knowledge everywhere" action. It clears provider snapshot caches and in-flight loads across all cwd scopes, then immediately refreshes only the home-directory snapshot with `force: true`.

Registry/config replacement may update visible metadata such as label, description, default mode, enabled state, and provider membership, but it must not spawn provider processes. Route provider re-probing through explicit refresh paths.

## Custom Provider Behavior

Custom providers can:

- extend a built-in provider
- extend `acp` with a required command
- replace a command
- add environment variables
- disable tools
- replace or augment model lists
- set display label, description, order, and enabled state

Derived providers keep their own provider ID in ChisaCode snapshots and timelines, while delegating runtime behavior to the provider they extend.

## Gotchas

**Provider IDs are strings.** Runtime validation decides whether an ID is registered.

**Models and modes can be dynamic.** ACP providers report modes and models at runtime. Static manifest metadata is for UI scaffolding and default display behavior.

**Mode IDs are opaque.** Do not assume a mode ID is a simple word. Treat it as an exact string from the provider.

**Auth belongs to the provider runtime.** ChisaCode can pass environment variables, but the underlying CLI or SDK owns authentication.

**Command overrides replace the launch command.** A custom `command` array fully replaces the default command for that provider.

**Manifest and runtime modes must stay aligned.** The manifest includes UI metadata; the runtime reports or enforces actual modes. Keep both paths consistent.
