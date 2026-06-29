# ChisaCode

**Local-first, multi-provider agent control surface.** Run, monitor, and interact with coding agents from desktop, mobile, web, and CLI — your code never leaves your machine.

[![License](https://img.shields.io/badge/license-AGPL--3.0--or--later-blue.svg)](LICENSE)

## Features

- **Multi-provider** — Built-in support for Claude, Codex, OpenCode, MiMoCode, Pi, and Kimi Code. Custom providers extend built-in ones or use the ACP (Agent Client Protocol) command interface. Pick the right model for each job, switch freely.
- **Cross-platform** — Desktop (macOS, Linux, Windows via Electron), mobile (iOS, Android via Expo), web, and CLI. Start work at your desk, check progress from your phone, script from the terminal.
- **Local-first** — The daemon runs on your machine. Your code, your keys, your environment. No cloud dependency, no telemetry.
- **E2E encrypted relay** — Remote access via an untrusted relay with Curve25519 + XSalsa20-Poly1305 encryption. The relay routes bytes, cannot read content.
- **BYOK** — Bring your own API keys. Use your subsidized plans and first-party provider pricing. ChisaCode adds zero markup.
- **Agent orchestration** — Launch multiple agents side-by-side in split panes, mix providers, delegate sub-agent tasks, schedule cron-triggered runs.
- **Voice mode** — Dictate prompts or talk through problems hands-free with built-in dictation and voice agent support.
- **MCP integration** — Daemon exposes an MCP server; agents get a scoped companion MCP server for delegation to child agents.
- **Workspaces & worktrees** — Isolated git worktree workspaces so agents can work without affecting your main checkout.

## Quick Start

**Prerequisites:** Node.js >= 20, npm workspaces.

```bash
# Clone and install
git clone https://github.com/ChisaAlter/ChisaCode.git
cd ChisaCode
npm ci

# Start development (daemon + Expo app)
npm run dev          # macOS / Linux
npm run dev:win      # Windows

# Or run focused surfaces
npm run dev:server   # Daemon only
npm run dev:app      # Expo app only
npm run dev:desktop  # Electron desktop app

# CLI from the checkout (not the globally installed binary)
npm run cli -- ls -a -g
npm run cli -- daemon status
```

The daemon logs to `$CHISACODE_HOME/daemon.log`. Set `CHISACODE_LOG_LEVEL=trace` for verbose provider and session traces.

## Project Structure

This is an npm workspace monorepo:

```
packages/
├── protocol/       # Shared WebSocket schemas, provider manifests, protocol types
├── client/         # Daemon WebSocket driver and SDK facade
├── server/         # Daemon: agent lifecycle, WebSocket API, MCP server, relay transport
├── app/            # Expo client for iOS, Android, web, and desktop renderer
├── cli/            # Docker-style CLI (chisacode run/ls/logs/wait)
├── relay/          # E2E encrypted relay for remote access
├── desktop/        # Electron desktop wrapper
├── highlight/      # Shared syntax highlighting engine
└── expo-two-way-audio/  # Native two-way audio module
```

Key build dependency chains:

```bash
npm run build:client       # protocol → client
npm run build:server-deps  # highlight → relay → protocol → client
npm run build:server       # server-deps → server → cli
npm run build:app-deps     # highlight → protocol → client → expo-two-way-audio
```

Package imports resolve through compiled `dist/` output. Rebuild producer packages before diagnosing cross-package type errors.

## Architecture

```
┌──────────┐   ┌──────────┐   ┌──────────┐
│  Mobile   │   │   CLI    │   │ Desktop  │
│  (Expo)   │   │(Commander)│   │(Electron)│
└─────┬─────┘   └─────┬────┘   └─────┬────┘
      │               │              │
      │  WebSocket    │              │  Managed subprocess
      │  (direct or   │              │  + WebSocket
      │   via relay)  │              │
      └───────┬───────┴──────────────┘
              │
       ┌──────▼──────┐
       │   Daemon    │
       │  (Node.js)  │
       └──────┬──────┘
              │
 ┌────────────┼────────────┬────────────┬────────────┬────────────┐
 │            │            │            │            │            │
Claude      Codex     OpenCode     MiMoCode       Pi       Kimi Code
Agent       Agent      Agent        Agent        RPC         ACP
 SDK       Server
```

**Data flow:** Client sends agent creation request → daemon spawns provider process → events stream over WebSocket to all connected clients → tool calls normalized to `ToolCallDetail` → permissions flow through user approval.

Agent state persists to `$CHISACODE_HOME/agents/` as file-backed JSON. Timeline is append-only with epoch-based sequencing. An optional SQLite index accelerates cross-agent queries.

## Development

Key commands for contributors:

```bash
npm run typecheck    # Run after every change
npm run lint         # Lint with oxlint
npm run format       # Auto-format with oxfmt
```

See the `docs/` directory for detailed guides:

| Document                                           | Topic                                                        |
| -------------------------------------------------- | ------------------------------------------------------------ |
| [docs/product.md](docs/product.md)                 | Product philosophy, target user, strategic bets              |
| [docs/architecture.md](docs/architecture.md)       | System design, packages, WebSocket protocol, agent lifecycle |
| [docs/development.md](docs/development.md)         | Dev server, build sync gotchas, CLI reference                |
| [docs/testing.md](docs/testing.md)                 | TDD workflow, test organization                              |
| [docs/providers.md](docs/providers.md)             | Adding a new agent provider                                  |
| [docs/rpc-namespacing.md](docs/rpc-namespacing.md) | WebSocket RPC naming convention                              |
| [docs/design.md](docs/design.md)                   | Theme tokens, colors, fonts, spacing                         |
| [docs/release.md](docs/release.md)                 | Release playbook and checklist                               |

**Important rules for contributors:**

- The WebSocket protocol is append-only. Never remove fields or make optional fields required.
- New features gate on `server_info.features.*` capability flags. No degradation fallbacks.
- Do not run full test suites locally — run only the changed test file: `npx vitest run <file> --bail=1`
- Always format with `npm run format` before committing.

## Security

- **E2E encryption** — Relay traffic is encrypted with Curve25519 ECDH + XSalsa20-Poly1305. The relay is zero-knowledge.
- **DNS rebinding protection** — Host header validation on every HTTP request and WebSocket upgrade.
- **Agent isolation** — Providers handle their own authentication. ChisaCode never stores or transmits API keys.
- **Local trust boundary** — Daemon binds `127.0.0.1` by default. Optional password auth via bearer token for TCP exposure.

See [SECURITY.md](SECURITY.md) for the full threat model and vulnerability reporting.

## License

ChisaCode is licensed under AGPL-3.0-or-later. See [LICENSE](LICENSE) for the
full license text.

ChisaCode is a modified version derived from
[Paseo](https://github.com/getpaseo/paseo). See [NOTICE](NOTICE) for source,
modification, and attribution notices.

When ChisaCode is distributed as binaries or made available for remote network
interaction, publish the corresponding source code for that exact version under
AGPL-3.0-or-later.
