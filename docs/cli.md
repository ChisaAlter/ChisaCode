# ChisaCode CLI

The ChisaCode CLI lets you control the same local daemon used by the desktop,
web, and mobile apps. Use it when you want a terminal workflow, a headless
machine, or scripts that can start agents and inspect their progress.

## What It Does

- Starts and checks the local daemon.
- Creates, lists, inspects, stops, archives, and resumes agents.
- Sends follow-up prompts to running or completed agents.
- Streams logs and waits for agent completion.
- Creates worktrees and scheduled agent runs.
- Targets a remote daemon when you pass a host.

The CLI is a client. Agent state, credentials, logs, and workspaces stay on the
machine where the daemon is running.

## Install

The desktop app can install the bundled CLI from Settings > Integrations. That
is the recommended path for desktop users because it matches the app version.

For a standalone install, use npm:

```bash
npm install -g @chisacode/cli
```

Check that the command is available:

```bash
chisacode --help
chisacode daemon status
```

## Common Commands

List agents:

```bash
chisacode ls
chisacode ls -a -g
chisacode ls -a -g --json
```

Start an agent:

```bash
chisacode run --provider codex/gpt-5.4 "fix the failing login test"
chisacode run --provider claude/opus --cwd ./my-project "review this design"
```

Inspect and follow an agent:

```bash
chisacode inspect <agent-id>
chisacode logs <agent-id>
chisacode attach <agent-id>
```

Send a follow-up:

```bash
chisacode send <agent-id> "also add a regression test"
```

Wait for completion:

```bash
chisacode wait <agent-id>
```

Daemon operations:

```bash
chisacode daemon status
chisacode daemon start
chisacode daemon stop
```

Use a different daemon:

```bash
chisacode --host workstation.local:6767 ls -a
```

## Worktrees

Use worktrees when you want an agent to make isolated code changes:

```bash
chisacode worktree ls
chisacode run --worktree fix-login --provider codex/gpt-5.4 "fix login"
```

Project-level setup and teardown scripts can prepare dependencies for new
worktrees. Keep these scripts idempotent so repeated agent runs are predictable.

## Scheduling

Schedules create recurring agent runs:

```bash
chisacode schedule create --every 5m "check whether the build is still green"
chisacode schedule ls
chisacode schedule pause <schedule-id>
chisacode schedule resume <schedule-id>
chisacode schedule delete <schedule-id>
```

Use schedules for periodic checks and maintenance. Use a loop skill when one
agent should retry a task until explicit acceptance criteria are met.

## Troubleshooting

If the CLI cannot connect, check the daemon first:

```bash
chisacode daemon status
```

If the desktop app is running, avoid restarting the daemon unless you are sure
no important agents are active. Restarting the daemon interrupts running agents.

If a command behaves differently from the desktop app, make sure both are
targeting the same daemon host.
