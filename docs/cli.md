# ChisaCode CLI

> Languages: [English](#english) | [简体中文](#简体中文)

## English

The ChisaCode CLI lets you control the same local daemon used by the desktop,
web, and mobile apps. Use it when you want a terminal workflow, a headless
machine, or scripts that can start agents and inspect their progress.

### What It Does

- Starts and checks the local daemon.
- Creates, lists, inspects, stops, archives, and resumes agents.
- Sends follow-up prompts to running or completed agents.
- Streams logs and waits for agent completion.
- Creates worktrees and scheduled agent runs.
- Targets a remote daemon when you pass a host.

The CLI is a client. Agent state, credentials, logs, and workspaces stay on the
machine where the daemon is running.

### Install

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

### Common Commands

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

### Worktrees

Use worktrees when you want an agent to make isolated code changes:

```bash
chisacode worktree ls
chisacode run --worktree fix-login --provider codex/gpt-5.4 "fix login"
```

Project-level setup and teardown scripts can prepare dependencies for new
worktrees. Keep these scripts idempotent so repeated agent runs are predictable.

### Scheduling

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

### Troubleshooting

If the CLI cannot connect, check the daemon first:

```bash
chisacode daemon status
```

If the desktop app is running, avoid restarting the daemon unless you are sure
no important agents are active. Restarting the daemon interrupts running agents.

If a command behaves differently from the desktop app, make sure both are
targeting the same daemon host.

## 简体中文

ChisaCode CLI 可以控制桌面端、网页端和移动端共用的本地 daemon。适合在终端里操作、
在无桌面环境的机器上使用，或者把 agent 创建、状态检查和日志读取接入脚本。

### 能做什么

- 启动和检查本地 daemon。
- 创建、列出、查看、停止、归档和恢复 agent。
- 给运行中或已完成的 agent 发送后续提示。
- 查看日志、附加到实时输出、等待 agent 完成。
- 创建 worktree 和定时 agent 任务。
- 通过 host 参数连接另一台机器上的 daemon。

CLI 本身只是客户端。agent 状态、凭据、日志和工作目录都留在 daemon 所在的机器上。

### 安装

桌面端用户推荐在 Settings > Integrations 里安装内置 CLI。这样 CLI 版本会和桌面端版本一致。

如果只想独立安装，可以用 npm：

```bash
npm install -g @chisacode/cli
```

检查命令是否可用：

```bash
chisacode --help
chisacode daemon status
```

### 常用命令

列出 agent：

```bash
chisacode ls
chisacode ls -a -g
chisacode ls -a -g --json
```

启动 agent：

```bash
chisacode run --provider codex/gpt-5.4 "修复失败的登录测试"
chisacode run --provider claude/opus --cwd ./my-project "评审这个设计"
```

查看和跟进 agent：

```bash
chisacode inspect <agent-id>
chisacode logs <agent-id>
chisacode attach <agent-id>
```

发送后续提示：

```bash
chisacode send <agent-id> "顺手加一个回归测试"
```

等待 agent 完成：

```bash
chisacode wait <agent-id>
```

daemon 操作：

```bash
chisacode daemon status
chisacode daemon start
chisacode daemon stop
```

连接另一台 daemon：

```bash
chisacode --host workstation.local:6767 ls -a
```

### Worktree

当你希望 agent 在隔离的代码分支里修改文件时，使用 worktree：

```bash
chisacode worktree ls
chisacode run --worktree fix-login --provider codex/gpt-5.4 "修复登录问题"
```

项目级 setup 和 teardown 脚本可以为新 worktree 准备依赖。脚本应保持可重复执行，
这样多次 agent 运行才可预测。

### 定时任务

schedule 会创建周期性 agent 任务：

```bash
chisacode schedule create --every 5m "检查构建是否仍然通过"
chisacode schedule ls
chisacode schedule pause <schedule-id>
chisacode schedule resume <schedule-id>
chisacode schedule delete <schedule-id>
```

周期性检查和维护任务适合用 schedule。如果是同一个 agent 围绕明确验收条件反复尝试，
更适合使用 loop 技能。

### 排障

如果 CLI 连接不上，先检查 daemon：

```bash
chisacode daemon status
```

如果桌面端正在运行，不要随意重启 daemon，除非你确认没有重要 agent 正在跑。
重启 daemon 会中断正在运行的 agent。

如果某个命令和桌面端表现不一致，先确认它们是否连接到了同一个 daemon host。
