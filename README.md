<p align="center">
  <img alt="ChisaCode" src="packages/desktop/assets/128x128@2x.png" width="96" />
</p>

<h1 align="center">ChisaCode</h1>

<p align="center"><strong>用桌面端、移动端、网页端和 CLI 控制本地 AI 编程代理。</strong></p>

> 语言：**简体中文** | [中文镜像](README.zh-CN.md)

<p align="center">
  <a href="https://chisacode.sh">Website</a>
  ·
  <a href="https://github.com/ChisaAlter/ChisaCode/actions/workflows/ci.yml">CI</a>
  ·
  <a href="docs/cli.md">CLI</a>
  ·
  <a href="docs/custom-providers.md">Providers</a>
</p>

---

ChisaCode 是一个本地优先的编程代理控制面。它在你的机器上运行 daemon，
在你自己的开发环境里启动当前支持的 agent CLI，然后让桌面端、移动端、网页端和 CLI
连接并控制同一批任务。

ChisaCode 不提供自己的模型，也不是托管式 coding agent。你需要自己安装并登录底层 agent CLI；
ChisaCode 负责启动、托管、展示和编排。

## 当前 Provider 支持

当前内置 provider ID 以 `packages/protocol/src/provider-manifest.ts` 为准：

| Provider ID | 显示名称  | ChisaCode 期望的运行时                  |
| ----------- | --------- | --------------------------------------- |
| `claude`    | Claude    | `claude` CLI                            |
| `codex`     | Codex     | `codex` CLI                             |
| `opencode`  | OpenCode  | `opencode` CLI / server                 |
| `mimocode`  | MiMoCode  | `mimo` CLI / OpenCode-compatible server |
| `pi`        | Pi        | `pi` CLI                                |
| `kimi`      | Kimi Code | `kimi acp` CLI                          |

自定义 provider 通过 `agents.providers` 配置。自定义 provider 必须继承上面的某个内置
provider ID，或者继承 `acp` 来运行通用 Agent Client Protocol 命令。见
[自定义 provider 文档](docs/custom-providers.md)。

## ChisaCode 做什么

- 通过本地 daemon 启动和托管 agent 进程。
- 向已连接客户端流式同步 agent 输出、工具调用、权限请求和状态。
- 允许多个客户端连接同一个 daemon。
- 创建和归档由 ChisaCode 管理的 git worktree。
- 提供 CLI 命令管理 agent、provider、worktree、schedule、terminal、loop、chat、
  permission、speech model 和 daemon。
- 暴露 MCP 工具，让 agent 自己创建或控制 ChisaCode agent。
- 支持 relay 远程连接，但不会把 ChisaCode 变成托管 agent 服务。

## 快速开始

安装仓库依赖：

```bash
npm ci
```

启动开发环境：

```bash
npm run dev        # macOS/Linux
npm run dev:win    # Windows
```

运行仓库内 CLI：

```bash
npm run cli -- provider ls
npm run cli -- daemon status
npm run cli -- run --provider codex "检查这个仓库"
```

如果使用打包版或全局安装的 CLI：

```bash
chisacode daemon start
chisacode provider ls
chisacode run --provider codex "检查这个仓库"
```

对正在运行的 daemon 执行 `chisacode provider ls`，可以看到当前环境里启用且可用的 provider。

## 常用 CLI 命令

```bash
chisacode ls
chisacode run --provider codex "修复失败的测试"
chisacode attach <agent-id>
chisacode send <agent-id> "顺手更新文档"
chisacode wait <agent-id>

chisacode provider ls
chisacode provider models codex

chisacode worktree ls
chisacode worktree create --mode branch-off --new-branch fix-docs

chisacode schedule create --every 5m "检查 CI 是否仍然通过"
chisacode terminal create --cwd .
```

完整 CLI 说明见 [docs/cli.md](docs/cli.md)。

## 本地开发

本仓库是 npm workspace monorepo。Node 版本以 `.tool-versions` 为准。

常用根命令：

```bash
npm run build:client       # protocol -> client
npm run build:server-deps  # highlight -> relay -> protocol -> client
npm run build:server       # server-deps -> server -> cli
npm run build:app-deps     # highlight -> protocol -> client -> expo-two-way-audio

npm run typecheck
npm run lint
npm run format:check
```

包结构：

| 包                              | 职责                                                      |
| ------------------------------- | --------------------------------------------------------- |
| `@chisacode/protocol`           | 共享协议 schema、provider manifest、wire types            |
| `@chisacode/client`             | daemon client 和 SDK facade                               |
| `@chisacode/server`             | 本地 daemon、provider runtime、存储、MCP、relay、schedule |
| `@chisacode/app`                | Expo app，覆盖 native、web 和桌面 renderer                |
| `@chisacode/desktop`            | Electron 壳和桌面打包集成                                 |
| `@chisacode/cli`                | daemon 和 agent 工作流的命令行入口                        |
| `@chisacode/relay`              | 端到端加密 relay transport                                |
| `@chisacode/highlight`          | 语法高亮                                                  |
| `@chisacode/expo-two-way-audio` | 原生音频桥接                                              |

## 文档

- [开发指南](docs/development.md)
- [架构地图](docs/ARCHITECTURE_MAP.md)
- [Provider 内部说明](docs/providers.md)
- [自定义 Provider](docs/custom-providers.md)
- [发布指南](docs/release.md)
- [安全策略](SECURITY.md)

## 许可证

AGPL-3.0-or-later
