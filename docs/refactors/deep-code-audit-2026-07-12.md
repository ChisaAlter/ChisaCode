# 2026-07-12 深度代码审查

## 结论与评分

| 维度     | 当前评分 | 主要证据                                                                                                  | 距离 10 分的核心差距                                                                            |
| -------- | -------: | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 架构设计 |      9.8 | dependency-cruiser 0 违规；protocol 2164 行；workspace 3623 行；Claude 873 行；ACP 926 行；Pi 581 行      | workspace explorer/open-intent orchestration 仍集中在主屏                                       |
| 安全设计 |      9.3 | relay E2EE 单调 nonce；Ed25519 socket 认证；AI/Claude SDK 与 Zod 4 迁移后生产依赖 0 high/0 critical       | Expo/EAS 工具链仍有 moderate 通告；relay 认证升级需要持续兼容性发布管理                         |
| 产品能力 |      9.4 | app、CLI、MCP 已覆盖 agents、terminals、schedules、worktrees、providers、permissions、chat 与 loop        | diagnostics/update 等平台相关能力的暴露深度仍不完全一致                                         |
| 代码质量 |      9.7 | typecheck/lint/format/test-audit/高信号 Knip/依赖边界均有门禁；daemon 17 个 schema 具备独立契约与聚合测试 | 历史 test debt 高，核心测试文件超过 5k 行，完整 Knip unused-export 结果仍有大量噪声与真实债混合 |
| 综合     |  **9.6** | 核心安全、主要产品域 parity、依赖迁移与持续领域拆分均有代码级实现和精确验证                               | 继续提升需要完成 Expo/EAS、provider adapters 与 App 工作台拆分                                  |

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
- 2026-07-13：voice/dictation 的 ack/error/final 竞速、服务端 timeout budget 和 waiter cleanup 提取到独立领域客户端；核心降至 3920 行，连接断开仍由共享 waiter authority 统一拒绝。
- 2026-07-13：agent lifecycle/config 的 CRUD、persistence、rewind/cancel 与 runtime settings 提取到独立领域客户端；公开创建/导入/查询类型重导出兼容，核心进一步降至 3471 行。
- 2026-07-13：agent timeline、消息发送与 Generative UI action 提取到独立 interaction/query 客户端；能力门禁、60 秒冷启动预算、messageId/附件映射与 `DaemonRpcError` 元数据保持兼容，核心降至 3368 行。
- 2026-07-13：correlated RPC、waiter timeout/cancel、连接中请求队列、flush 和断线拒绝提取到统一 request coordinator；领域客户端共享同一 authority，核心降至 3040 行，私有 waiter 状态测试改为 deadline 行为测试。
- 2026-07-13：transport factory/E2EE、hello、connect/reconnect、连接状态订阅、发送与 liveness 提取到独立 connection controller；核心只接收 active transport 数据和生命周期回调，降至 2319 行，公开连接配置与状态类型兼容。
- 2026-07-13：protocol terminal inbound/outbound schema、snapshot 类型与 union tuple 提取到 `terminal/messages.ts`；旧 `messages` 入口兼容重导出，并新增显式 package subpath，主文件从 5213 降至 4941 行。
- 2026-07-13：checkout status/diff、Git 操作、PR/timeline、branch/stash 与 GitHub search 提取到 `checkout/messages.ts`；22 个 inbound/23 个 outbound schema 由 tuple 聚合，主文件降至 4142 行。
- 2026-07-13：workspace/worktree/directory/editor/file explorer 等 14 个 inbound、18 个 outbound schema 与 descriptor/setup 状态提取到 `workspace/messages.ts`；附件归一化独立到 `agent/attachments.ts`，旧入口保持兼容，主文件降至 3339 行。
- 2026-07-13：provider discovery/snapshot/diagnostic/tooling/usage/recent sessions 的 11 个 inbound、12 个 outbound schema 与 model/mode/feature 基础契约提取到 `provider/messages.ts`；`agent-types.ts` 解除对 god-file 的附件类型反向依赖，主文件降至 2860 行。
- 2026-07-13：OpenAI SDK 升至 6.46.0；Zod 直接依赖统一到 4.3.6，既有 schema 通过 `zod/v3` 保持语义；Claude Agent SDK 0.2.141、Anthropic SDK 0.93.0 与 MCP SDK 1.29.0 peer 对齐，Claude/Anthropic 生产通告清零。
- 2026-07-13：Skills 与 MCP server 管理的配置、scope、payload 及 8 个 inbound/8 个 outbound schema 提取到 `agent/extensions.ts`；总 union 改由只读 tuple 聚合，旧 `messages` 入口兼容重导出并新增显式 package subpath，主文件降至 2436 行。
- 2026-07-13：daemon status/pairing/config/project config/lifecycle 的 8 个 inbound、6 个 outbound、3 个 status payload 与 mutable config 提取到 `daemon/messages.ts`；旧入口兼容重导出并新增显式 package subpath，主文件降至 2164 行。
- 2026-07-13：移动端 workspace tab switcher、presentation fallback、tab menu 与全部局部样式提取到 `workspace-mobile-tab-switcher.tsx`；主屏保持 props/行为兼容并从 5453 降至 4926 行。
- 2026-07-13：tab、pane、dock、sidebar 与 command-center 五组 workspace action 注册/路由提取到 `use-workspace-keyboard-actions.ts`；handler 改用 `useStableEvent`，避免屏幕重渲染时重复注册，主屏降至 4657 行。
- 2026-07-13：layout tab reconcile、setup cache 恢复、空 workspace draft seed 与 setup tab auto-open 提取到 `use-workspace-persistence-hydration.ts`；storage schema 与 effect 顺序保持不变，主屏降至 4451 行。
- 2026-07-13：draft 创建、tab focus、imported agent、文件/side-pane/browser 打开、mobile switcher 与 split 后创建提取到 `use-workspace-tab-open-actions.ts`；移动端切回 agent、后台 draft、Electron gate 与 pane placement 语义保持不变，主屏降至 4270 行。
- 2026-07-13：pending close 防重、terminal 确认/kill、agent 本地 tab close、browser cleanup、auto-open suppression 与 bulk-close 选择/确认提取到 `use-workspace-tab-close-actions.ts`；既有纯 helper 保持复用，主屏降至 3970 行。
- 2026-07-13：dock state/command/placement 路由提取到 `use-workspace-dock-actions.ts`，pane focus suppression 与 split/move/resize/reorder 提取到 `use-workspace-pane-layout-actions.ts`；命令可用性、Electron gate 和 keyboard suppression 语义保持不变，主屏降至 3809 行。
- 2026-07-13：pane child open/close/retarget、file disposition、descriptor identity cache、3-tab mounted retention 与 mobile/desktop adapter 提取到 `use-workspace-pane-content-models.ts`；desktop focus-before-open 与 side-pane parent/source 语义保持不变，主屏降至 3703 行。
- 2026-07-13：environment panel responsive threshold、visibility mode 恢复、dock state、panel/explorer toggle 与 changes explorer transition 提取到 `use-workspace-environment-panel-state.ts`；样式宽度继续作为单一输入，主屏降至 3623 行。
- 2026-07-13：ACP tool/config/transport/process 分域后，新增 `acp/terminal-controller.ts` 独立拥有 terminal 子进程、输出截断、exit waiter 与关闭清理；`acp/workspace-path.ts` 统一 fs/terminal 意图边界，越界仍 fail-closed，同时只匹配真实 `..` 路径段，不再误拒 `..cache`。主文件从 2860 降至 1866 行，原公开入口继续兼容重导出。
- 2026-07-13：ACP message assembly、tool snapshot 生命周期、user echo suppression、session update 路由与 running tool 取消态合成提取到 `acp/session-update-controller.ts`；mode/config/session-info/commands 继续通过窄回调由 Session 持有，原私有 `translateSessionUpdate` 保留委托；wrapper smoke 的 tool snapshot 证据改为统计公开 timeline 事件，不再读取 Session 私有 map。主文件进一步降至 1752 行。
- 2026-07-13：ACP foreground prompt 派发、active turn、usage、user echo suppression、bootstrap thread 事件、canceled tool 合成、终态与 process-exit failure 提取到 `acp/foreground-turn-controller.ts`；每回合 usage 显式重置，进程退出/关闭/替换后的迟到 prompt resolve/reject 被忽略，JSON-RPC code/data 继续进入诊断。测试以重叠回合拒绝及完成/失败后可重试证明公开行为，不再读取私有 active turn。主文件进一步降至 1575 行。
- 2026-07-13：ACP slash-command snapshot、首次异步 `available_commands_update` 等待、timeout 与 close 唤醒提取到 `acp/command-catalog.ts`；Session 的 listCommands() 与 update callback 收敛为薄委托，原立即返回和等待异步目录行为保持一致。主文件进一步降至 1517 行。
- 2026-07-13：ACP mode/model/thinking 状态、启动 override、provider writer、config response 规范化、current-mode/config-option update 提取到 `acp/session-config-controller.ts`；Session 配置 API 全部变为薄委托，`SessionStateResponse` 从原入口兼容重导出。控制器新增 mode 目录来源跟踪，config-derived mode 走 `setSessionConfigOption`，不再误用原生 `setSessionMode`；测试配置改通过控制器 state API 建立，不再直接修改 Session 配置字段。主文件进一步降至 1070 行。
- 2026-07-13：ACP child/connection/capabilities/session identity、new/load/resume、history replay、close/terminate 与 diagnostics 提取到 `acp/session-lifecycle-controller.ts`；初始化失败会终止并清空进程状态，load replay 在失败时也通过 `finally` 复位，close 统一 cancel/close/terminal/terminate 且幂等。Session 仅保留 façade 与领域控制器接线，主文件降至 926 行，ACP 核心 god-file 拆分完成。
- 2026-07-13：Pi extension UI/ask_user permission 映射提取到 `pi/permission-mapper.ts`，unknown record/string/boolean/string-array 读取提取到 `pi/event-values.ts`；Session 保留 pending request、runtime response 与事件时序，主文件从 1874 降至 1613 行。
- 2026-07-13：Pi captured entry/index、live user-message 对齐、entry capture/tree navigation 命令、marker/result promise 与 close/process-exit 清理提取到 `pi/extension-history-controller.ts`；脚本生成器与控制器复用同一命令/marker 常量，prompt 失败只撤销 pending result，避免额外未处理拒绝。主文件进一步降至 1423 行。
- 2026-07-13：Pi active turn、tool lifecycle、extension UI pending、ask_user follow-up、runtime event routing、process-exit failure 与 turn completion 提取到 `pi/session-event-controller.ts`；Session 只保留启动/配置/持久化/状态刷新编排，主文件进一步降至 1110 行。
- 2026-07-13：Pi state/runtime info、模型/思考配置、usage、持久化与幂等 close 提取到 `pi/session-runtime.ts`；new/resume、MCP probe、临时配置/extension、初始化失败清理与 capability 投影提取到 `pi/session-lifecycle.ts`。恢复会话补齐 launch env 与 gateway model prefix，MCP secret 配置文件显式使用 `0600`；主文件降至 581 行，Pi 核心 god-file 拆分完成。
- 2026-07-13：Claude session identity、fresh/rebind、persistence、query/runtime model、gateway override 与 runtime-info cache 提取到 `claude/session-identity.ts`。SDK session ID 变化、mode 切换和清空 model 后不再返回陈旧 runtime info，run completion 继续保留原生 runtime model 诊断；Session 降至 1057 行。
- 2026-07-13：Claude prompt/图片/附件转换、foreground turn 启动/取消、autonomous turn 收口、`/rewind` 与 close reset 提取到 `claude/foreground-turn-controller.ts`；Session 降至 873 行，provider 核心拆分完成。

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

1. **P1 依赖安全迁移（部分完成）**：AI SDK、Claude SDK、OpenAI SDK 与 Zod 4 已完成；剩余 Expo/EAS framework major 迁移继续按 native/runtime 专项验证，不与结构拆分混做。
2. **P1 provider 文件拆分（核心完成）**：`providers/base/` 错误抽象已删除，Codex/OpenCode/ACP/Pi/Claude 均已完成 composition-first 核心拆分；后续只在真实复杂度或缺陷证明收益时继续分域，不再按行数做低收益碎片化拆分。
3. **P1 client/protocol 拆分（进行中）**：`daemon-client.ts` 已完成主要领域、request 与 connection 分域并降至 2319 行；protocol `messages.ts` 已完成 terminal/checkout/workspace/provider/attachment/agent-extension/daemon 域提取并降至 2164 行，下一步评估 usage/voice 分域并保留 agent core 的聚合职责。
4. **P2 app 工作台拆分（进行中）**：移动端 navigation、workspace command routing、layout/setup persistence/hydration、tab open/close、pane/dock/content models 与 environment-panel state 已提取，`workspace-screen.tsx` 从 5453 降至 3623 行；下一步拆分 workspace explorer/open-intent orchestration，保持 native/web/electron surface 测试分离。
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
- 2026-07-13 Client voice/dictation 批次：client typecheck/build、3 个目标文件 lint、3 个专用状态机测试与 2 个既有 timeout/final 场景通过
- 2026-07-13 Client agent lifecycle 批次：client typecheck/build、3 个目标文件 lint、3 个专用契约测试与 7 个既有 create/import/model 场景通过
- 2026-07-13 Client agent interaction 批次：client typecheck/build、4 个目标文件 lint、3 个专用契约测试与 5 个既有 timeline/Generative UI/SDK façade 场景通过
- 2026-07-13 Client request coordinator 批次：client typecheck/build、4 个目标文件 lint、3 个专用状态机测试与 10 个既有 timeout/send-failure/status/namespaced/close 场景通过
- 2026-07-13 Client connection controller 批次：client typecheck/build、3 个目标文件 lint、3 个专用连接测试与 16 个既有 connect/reconnect/liveness/binary/terminal/dictation/SDK 场景通过
- 2026-07-13 Protocol terminal messages 批次：protocol typecheck/build、5 个目标文件 lint、42 个聚焦断言及 client/server/app/CLI 消费者 typecheck 通过
- 2026-07-13 Protocol checkout messages 批次：protocol typecheck/build、4 个目标文件 lint、66 个聚焦断言及 client/server/app/CLI 消费者 typecheck 通过
- 2026-07-13 Protocol workspace/attachment messages 批次：protocol typecheck/build、6 个目标文件 lint、44 个聚焦断言及 client/server/app/CLI 消费者 typecheck 通过
- 2026-07-13 Protocol provider messages 批次：protocol typecheck/build、8 个目标文件 lint、87 个聚焦断言及 client/server/app/CLI 消费者 typecheck 通过
- 2026-07-13 Claude SDK/Zod 4 批次：严格 npm peer 解析及 `npm ls` 通过；protocol/client/server build、protocol/client/server/app/desktop/CLI typecheck、88 个改动文件 lint、148 个聚焦断言通过；生产审计 24 项且 0 high/0 critical，Claude/Anthropic 通告为 0
- 2026-07-13 Protocol agent extension 批次：protocol typecheck/build、3 个目标文件 lint、18 个聚焦断言、显式 package subpath 运行时导入及 client/server/app/desktop/CLI 消费者 typecheck 通过
- 2026-07-13 Protocol daemon messages 批次：protocol typecheck/build、3 个目标文件 lint、32 个聚焦断言、显式 package subpath 运行时导入及 client/server/app/desktop/CLI 消费者 typecheck 通过
- 2026-07-13 App workspace mobile navigation 批次：App typecheck、2 个目标文件 lint 与 15 个 tab menu/layout 聚焦断言通过；未以 web 预览替代 native mobile 验证
- 2026-07-13 App workspace command routing 批次：App typecheck 与 2 个目标文件 lint 通过；未运行全量 App/Playwright 测试
- 2026-07-13 App workspace persistence/hydration 批次：App typecheck 与 2 个目标文件 lint 通过；未运行全量 App/Playwright 测试
- 2026-07-13 App workspace tab open actions 批次：App typecheck 与 2 个目标文件 lint 通过；未运行全量 App/Playwright 测试
- 2026-07-13 App workspace tab close actions 批次：App typecheck、2 个目标文件 lint 与 2 个关闭测试文件 7 个断言通过；未运行全量 App/Playwright 测试
- 2026-07-13 App workspace pane/dock actions 批次：App typecheck、3 个目标文件 lint 与 dock model 18 个断言通过；未运行全量 App/Playwright 测试
- 2026-07-13 App workspace pane content models 批次：App typecheck、2 个目标文件 lint 与 pane-content 2 个断言通过；未运行全量 App/Playwright 测试
- 2026-07-13 App workspace environment panel state 批次：App typecheck 与 2 个目标文件 lint 通过；未运行全量 App/Playwright 测试
- 2026-07-13 ACP tool mapper 批次：server typecheck、3 个目标文件 lint、新 mapper 5 个断言与既有 generic permission 透传场景通过
- 2026-07-13 ACP session config 批次：server typecheck、2 个目标文件 lint 与既有 mode/model/config 7 个聚焦断言通过
- 2026-07-13 ACP NDJSON transport 批次：server typecheck、2 个目标文件 lint 与既有 stream/compat 3 个聚焦断言通过
- 2026-07-13 ACP process runtime 批次：server typecheck、3 个目标文件 lint 与 initialize timeout fail-cleanup 聚焦测试通过
- 2026-07-13 ACP terminal/path 批次：server typecheck、4 个目标文件 lint、既有 terminal 3 个与 workspace path 1 个聚焦场景通过
- 2026-07-13 ACP session update controller 批次：server typecheck、3 个目标文件 lint 与 7 个 mode/config/permission/commands/message 聚焦场景通过
- 2026-07-13 ACP foreground turn controller 批次：server typecheck、3 个目标文件 lint 与 3 个 prompt completion/failure/JSON-RPC diagnostic 聚焦场景通过
- 2026-07-13 ACP command catalog 批次：server typecheck、2 个目标文件 lint 与 2 个立即返回/异步 update 命令发现聚焦场景通过
- 2026-07-13 ACP session config controller 批次：server typecheck、3 个目标文件 lint 与 11 个配置初始化、stored override、mode provenance、config update、canonical response 聚焦场景通过；真实 provider wrapper smoke 因凭据门禁未在本地运行
- 2026-07-13 ACP session lifecycle controller 批次：server typecheck、3 个目标文件 lint、4 个 new-session/fail-cleanup/load-replay/close 单测与 6 个配置/turn/command Session 接线场景通过
- 2026-07-13 Pi permission mapper 批次：server typecheck、3 个目标文件 lint 与既有 extension UI/ask_user 6 个聚焦场景通过
- 2026-07-13 Pi extension history 批次：server typecheck、2 个目标文件 lint 与既有 live user entry ID/rewind tree navigation 2 个聚焦场景通过
- 2026-07-13 Pi session event controller 批次：server typecheck、2 个目标文件 lint 与 Pi agent 23 个 permission/tool/message/turn/process-exit 聚焦场景通过
- 2026-07-13 Pi runtime/session lifecycle 批次：server typecheck、4 个目标文件 lint 与 Pi agent 24 个 create/resume/env/model/MCP/permission/tool/message/turn 聚焦场景通过
- 2026-07-13 Claude session identity 批次：server typecheck、4 个目标文件 lint 与 6 个 mode/session/model/persistence/session-switch 聚焦场景通过
- 2026-07-13 Claude foreground turn 批次：server typecheck、2 个目标文件 lint 与 5 个 interrupt/reuse/stale abort/rewind 聚焦场景通过

未在本地运行全仓测试或全量 Playwright/Maestro；按仓库规则只做改动对应的聚焦验证，普通开发不触发远端 CI。
