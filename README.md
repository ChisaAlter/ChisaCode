<p align="center">
  <img src="packages/desktop/assets/128x128@2x.png" width="72" height="72" alt="ChisaCode icon">
</p>

<h1 align="center">ChisaCode</h1>

<p align="center"><strong>ChisaCode</strong></p>

> Languages: **English** | [简体中文](README.zh-CN.md)

<p align="center">
  <a href="https://github.com/ChisaAlter/ChisaCode/releases">Releases</a>
  ·
  <a href="https://github.com/ChisaAlter/ChisaCode/actions/workflows/ci.yml">CI</a>
  ·
  <a href="README.zh-CN.md">中文文档</a>
</p>

<p align="center">One interface for Claude Code, Codex, Copilot, OpenCode, and Pi agents.</p>

<p align="center">
  <img src="packages/website/public/hero-mockup.png" alt="ChisaCode app screenshot" width="100%">
</p>

<p align="center">
  <img src="packages/website/public/mobile-mockup.png" alt="ChisaCode mobile app" width="100%">
</p>

---

Run agents in parallel on your own machines. Ship from your phone or your desk.

- **Self-hosted:** Agents run on your machine with your full dev environment. Use your tools, your configs, and your skills.
- **Multi-provider:** Claude Code, Codex, Copilot, OpenCode, and Pi through the same interface. Pick the right model for each job.
- **Voice control:** Dictate tasks or talk through problems in voice mode. Hands-free when you need it.
- **Cross-device:** iOS, Android, desktop, web, and CLI. Start work at your desk, check in from your phone, script it from the terminal.
- **Privacy-first:** ChisaCode doesn't have any telemetry, tracking, or forced log-ins.

## Getting Started

ChisaCode runs a local server called the daemon that manages your coding agents. Clients like the desktop app, mobile app, web app, and CLI connect to it.

### Prerequisites

You need at least one agent CLI installed and configured with your credentials:

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code)
- [Codex](https://github.com/openai/codex)
- [GitHub Copilot](https://github.com/features/copilot/cli/)
- [OpenCode](https://github.com/anomalyco/opencode)
- [Pi](https://pi.dev)

### Desktop app (recommended)

Download it from [chisacode.sh/download](https://chisacode.sh/download) or the [GitHub releases page](https://github.com/getchisacode/chisacode/releases). Open the app and the daemon starts automatically. Nothing else to install.

To connect from your phone, scan the QR code shown in Settings.

### CLI / headless

Install the CLI and start ChisaCode:

```bash
npm install -g @chisacode/cli
chisacode
```

This shows a QR code in the terminal. Connect from any client. This path is useful for servers and remote machines.

For full setup and configuration, see:

- [Docs](https://chisacode.sh/docs)
- [Configuration reference](https://chisacode.sh/docs/configuration)

## CLI

Everything you can do in the app, you can do from the terminal.

```bash
chisacode run --provider claude/opus-4.6 "implement user authentication"
chisacode run --provider codex/gpt-5.4 --worktree feature-x "implement feature X"

chisacode ls                           # list running agents
chisacode attach abc123                # stream live output
chisacode send abc123 "also add tests" # follow-up task

# run on a remote daemon
chisacode --host workstation.local:6767 run "run the full test suite"
```

See the [full CLI reference](https://chisacode.sh/docs/cli) for more.

## Skills

Skills teach your agent to use ChisaCode to orchestrate other agents.

```bash
npx skills add getchisacode/chisacode
```

Then use them in any agent conversation:

- `/chisacode-handoff` — hand off work between agents. I use this to plan with Claude and then handoff to Codex to implement.
- `/chisacode-loop` — loop an agent against clear acceptance criteria (aka Ralph loops), optionally with a verifier.
- `/chisacode-advisor` — spin up a single agent as an advisor for a second opinion, without delegating the work itself.
- `/chisacode-committee` — form a committee of two contrasting agents to step back, do root cause analysis, and produce a plan.

## Development

Quick monorepo package map:

- `packages/server`: ChisaCode daemon (agent process orchestration, WebSocket API, MCP server)
- `packages/app`: Expo client (iOS, Android, web)
- `packages/cli`: `chisacode` CLI for daemon and agent workflows
- `packages/desktop`: Electron desktop app
- `packages/relay`: Relay package for remote connectivity
- `packages/website`: Marketing site and documentation (`chisacode.sh`)

Common commands:

```bash
# run all local dev services
npm run dev

# run individual surfaces
npm run dev:server
npm run dev:app
npm run dev:desktop
npm run dev:website

# build the server stack
npm run build:server

# repo-wide checks
npm run typecheck
```

## Community

- [chisacode-relay](https://github.com/zenghongtu/chisacode-relay) — self-hosted relay in Go

### Self-hosted relay TLS

Self-hosted relays use `ws://` unless TLS is opted in. For a relay behind nginx on 443, start the daemon with:

```bash
CHISACODE_RELAY_ENDPOINT=127.0.0.1:8080 \
CHISACODE_RELAY_PUBLIC_ENDPOINT=relay.example.com:443 \
CHISACODE_RELAY_USE_TLS=true \
chisacode daemon start
```

Equivalent config:

```json
{
  "daemon": {
    "relay": {
      "enabled": true,
      "endpoint": "127.0.0.1:8080",
      "publicEndpoint": "relay.example.com:443",
      "useTls": true
    }
  }
}
```

Minimal nginx WebSocket proxy:

```nginx
server {
  listen 443 ssl;
  server_name relay.example.com;

  ssl_certificate /etc/letsencrypt/live/relay.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/relay.example.com/privkey.pem;

  location /ws {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
  }
}
```

---

<p align="center">
  <a href="https://star-history.com/#getchisacode/chisacode&Date">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=getchisacode/chisacode&type=Date&theme=dark">
      <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=getchisacode/chisacode&type=Date">
      <img src="https://api.star-history.com/svg?repos=getchisacode/chisacode&type=Date" alt="Star history chart for getchisacode/chisacode" width="600" style="max-width: 100%;">
    </picture>
  </a>
</p>

## License

AGPL-3.0
