# 2026-07-12 深度代码审查

## 结论与评分

| 维度     | 当前评分 | 主要证据                                                                                                 | 距离 10 分的核心差距                                                                             |
| -------- | -------: | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 架构设计 |      8.8 | dependency-cruiser 0 违规；Session 已按领域拆分；DaemonClient terminal 生命周期已独立，核心降至 4145 行  | `daemon-client.ts`、provider adapters、`workspace-screen.tsx`、`messages.ts` 仍是 4k+ 行责任中心 |
| 安全设计 |      9.1 | relay E2EE 单调 nonce；server socket Ed25519 认证；本轮增加签发时间和 Durable Object 持久化 nonce 防重放 | AI SDK/Expo/EAS 工具链仍有上游通告；relay 认证升级需要持续兼容性发布管理                         |
| 产品能力 |      9.4 | app、CLI、MCP 已覆盖 agents、terminals、schedules、worktrees、providers、permissions、chat 与 loop       | diagnostics/update 等平台相关能力的暴露深度仍不完全一致                                          |
| 代码质量 |      8.6 | typecheck/lint/format/test-audit/高信号 Knip/依赖边界均有门禁；新增领域客户端专用契约测试                | 历史 test debt 高，核心测试文件超过 5k 行，完整 Knip unused-export 结果仍有大量噪声与真实债混合  |
| 综合     |  **8.9** | 核心安全、主要产品域 parity 与依赖边界均有代码级实现和精确验证                                           | 继续提升需要多批次结构迁移，不适合一次性重写                                                     |

## 本轮已修

### 安全设计

- Relay server-control/server-data URL 的签名新增 `issuedAt`，并将签发时间纳入 Ed25519 签名消息。
- Relay 默认拒绝缺失、格式错误、过期、未来时间、签名错误和重复使用的认证凭证。
- 已使用 nonce 保存在 Durable Object storage，WebSocket hibernation 或实例恢复后仍保留短期重放窗口。
- 重放检查发生在 `closeExistingServerSockets` 之前；捕获的旧 URL 不能再抢占合法 daemon socket。
- `SECURITY.md` 的 E2EE nonce 描述与实际 `salt(16)+seq(8)` 单调语义对齐。
- Electron 右键菜单外链与 IPC opener 复用同一 `URL` protocol validator。

### 架构与代码质量

- CI typecheck 构建顺序补齐 `@chisacode/expo-two-way-audio`，不再依赖本地残留 build 产物。
- Knip 门禁收敛到高信号类别：依赖、未声明依赖、unresolved import 和 binary；这些类别当前为 0。
- 修复 5 个失效 import 和 12 个直接使用但未声明的依赖归属。
- Relay E2E 显式声明 Wrangler，并通过公开的 `wrangler/package.json` 定位 CLI，不依赖 workspace hoist 或封闭子路径。
- Vitest Browser 升至 4.1.10，移除 4.1.7 及以下 Browser Mode RCE；Wrangler 升至 4.110.0。
- CI 与 app/relay 发布工作流统一阻断 critical advisories；已记录的 high/moderate 通告按 major migration 单独治理。
- 将锁文件中 125 个由本机 npm mirror 写入的 `resolved` URL 规范化回 `registry.npmjs.org`，保持版本与 integrity 不变并恢复 lockfile-lint 门禁。
- 旧客户端 provider 过滤重新接回 Session 的版本兼容策略，避免向不认识新 provider id 的客户端发送 `pi` 等条目。
- 将一条依赖微任务时序的测试断言改为 `vi.waitFor`，消除调度竞态。
- 2026-07-13：MCP 新增完整 Chat/Loop 一等工具；工具注册拆到独立领域模块，Chat WebSocket 与 MCP 复用同一投递/fan-out 命令，避免 surface 语义漂移。
- 2026-07-13：agent-scoped Chat 工具锁定 caller author identity，Loop 启动复用既有 scoped cwd resolver；top-level MCP 仍需显式 author/cwd。
- 2026-07-13：DaemonClient 的 terminal 目录订阅、RPC、stream slot 与 binary 路由提取到独立领域客户端；核心只保留 façade、连接生命周期通知和 metrics 分类，公开类型兼容不变。

## 产品能力矩阵

| 能力域                                    | App/Desktop        | CLI                      | MCP                             | 结论                               |
| ----------------------------------------- | ------------------ | ------------------------ | ------------------------------- | ---------------------------------- |
| Agent 生命周期、发送、等待、归档、终止    | 完整               | 完整                     | 完整                            | 核心能力一致                       |
| Terminal 列表、创建、捕获、输入、终止     | 完整               | 完整                     | 完整                            | 一致                               |
| Schedule 创建、查询、更新、暂停、运行记录 | 完整               | 完整                     | 完整                            | 一致                               |
| Worktree 创建、列表、归档                 | 完整               | 完整                     | 完整                            | 一致                               |
| Provider/model discovery                  | 完整               | 完整                     | 完整                            | 本轮修复旧客户端过滤回归           |
| Permission 查询与响应                     | 完整               | allow/deny/list          | 完整                            | 语义一致，CLI 偏运维表达           |
| Chat                                      | 完整               | 完整                     | 完整：房间、消息、等待、mention | 一致；复用共享投递/fan-out 命令    |
| Loop                                      | 完整               | 完整                     | 完整：启动、查询、日志、停止    | 一致；cwd 继承 caller scope        |
| Diagnostics/update                        | Desktop/App 最完整 | daemon/provider 状态为主 | provider inspect 为主           | surface 深度不一致但有合理平台差异 |

## 最高优先级剩余项

1. **P1 依赖安全迁移（部分完成）**：server 已移除 `ai@5` 并迁移到独立 `@ai-sdk/mcp@2`；剩余 Claude SDK/Zod 与 Expo/EAS major 迁移继续按运行时专项契约验证，不与结构拆分混做。
2. **P1 provider 文件拆分**：先删除或接线当前未使用的 `providers/base/`，再按事件路由、session、client、runtime 拆分 Codex/Claude/OpenCode，避免强行继承错误抽象。
3. **P1 client/protocol 拆分（进行中）**：`daemon-client.ts` 已完成文件传输、checkout、管理命令、automation、workspace 与 terminal 生命周期分域，核心降至 4145 行；继续拆 agent/voice/connection 领域，并按 RPC domain 拆 `messages.ts`。
4. **P2 app 工作台拆分**：`workspace-screen.tsx` 按 navigation、pane orchestration、commands、persistence 拆分；保持 native/web/electron surface 测试分离。
5. **P2 产品 parity（2026-07-13 完成）**：MCP 已补齐一等 chat/loop 工具，并复用现有 service、Chat mention fan-out 与 caller cwd/identity 安全边界。
6. **P2 测试减债**：按包逐步降低 module mock、conditional skip、fixed wait、weak assertion、process.env mutation 基线，不再只维持 no-new-debt。

## 验证证据

- `npm@10.9.4 ci --ignore-scripts --dry-run`
- `npm audit --audit-level=critical`
- `npm run knip -- --include dependencies,unlisted,unresolved,binaries`
- dependency-cruiser：807 modules / 1888 dependencies / 0 violations
- Relay/Protocol/Server/Desktop 精确 Vitest：80 项通过
- `packages/server/src/server/session.test.ts`：92 项通过，1 项跳过
- Relay Wrangler E2E：3 项通过
- Relay、Protocol、Server 受影响包 typecheck 通过
- 2026-07-13 MCP Chat/Loop 批次：server typecheck、7 个目标文件 lint、2 个精确 MCP 契约测试通过
- 2026-07-13 Client terminal 批次：client typecheck/build、3 个目标文件 lint、3 个专用测试与 6 个既有 terminal 集成场景通过

未在本地运行全仓测试或全量 Playwright/Maestro；按仓库规则只做改动对应的聚焦验证，普通开发不触发远端 CI。
