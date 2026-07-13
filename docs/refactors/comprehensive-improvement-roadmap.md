# ChisaCode 综合改进路线图

> **状态：活跃维护**（2026-07-04 重启）
>
> 历史执行记录见 [archive/comprehensive-improvement-roadmap-2026-06-28.md](archive/comprehensive-improvement-roadmap-2026-06-28.md)。
> 归档后新增的系统性改进在此登记，作为单一事实源。

---

## 进行中

### 架构/依赖安全/本地质量提升目标（2026-07-12 启动）

- **目标**：继续拆解 client/provider/workspace 超大责任中心；完成 AI SDK、Claude SDK、Expo/EAS major migration；以聚焦本地验证维持可信质量基线，GitHub Actions 仅作为显式发布门禁。
- **执行顺序**：先清理确定性 CI 失败，再迁移高风险依赖，最后按领域拆分大文件；每批独立本地验证和提交，普通开发不再推送触发远端 CI。
- **已完成批次**：修复 workspace authority 稳定错误契约、draft `runtimeProvider` 快照、Generative UI manager queue 兼容测试、异步进程终止断言、ACP cwd 隔离测试、POSIX terminal `vi.waitFor` 误用、CLI 脚本/Vitest 分类、Wrangler 公开入口解析及 Windows `npx.cmd` 启动。
- **App/链路 CI 收敛**：E2E daemon 改为仅监听 `127.0.0.1`，满足无密码 loopback 安全约束；补齐 Vitest 的 `matchMedia`、Unistyles、safe-area、toast 与平台测试边界，修复 i18n 实例缺失、Aemeath 英文资源、Projects 空状态硬编码、provider icon/turn footer/高度缓存过期契约。20 个目标文件 152 个断言通过，`moduleMock` 审计从基线 303 降至 302。
- **CLI CI 收敛**：错误断言改为机器可读 `CONFLICTING_MODEL_OPTIONS` 或显式语言，避免默认中文下依赖英文文案；CLI 测试 helper 改为无 shell 的 Node 直启，移除 Windows WSL/zx 与 `cmd -> npx -> tsx` 生命周期偶合；readiness probe 增加进程退出诊断。开发态 mock provider 支持按基础 JSON Schema 生成确定性 structured output，真实 daemon E2E 不再依赖 CI 机器的 Claude/Codex/OpenCode 登录态。
- **Server/Android CI 收敛**：Android runtime module 补齐 Maven/Gradle version metadata，真实 `:chisacode-android-runtime:tasks` 配置成功；wildcard daemon E2E 保留 `0.0.0.0` 安全意图并统一使用 bcrypt 密码夹具，不启用无认证逃生开关；provider live-preferences 改用与 fake runtime 一致的稳定模型对。
- **认证/MCP 生命周期修复**：WebSocket 密码校验期间暂存并按序重放早到的 hello，修复 bcrypt 异步窗口丢消息导致的永久连接等待；预认证缓冲限制为 4 条/64 KiB，超限按 1008 关闭，避免未认证内存放大。MCP E2E 改用正式 `settings.modeId` 契约并断言运行态模式，后台 agent 的同步 `startTurn` 失败不再被吞成成功；worktree setup/terminal 探针改为跨平台 Node 命令并显式释放终端资源。
- **GitHub Actions 策略**：普通 branch push、PR 和 merge queue 不再自动触发 Actions；CI、Relay、Nix、Nix hash、release notes 改为手动触发，只有显式授权发布时运行。桌面/Android/App 构建仅保留版本 tag 触发；Dependabot 定时更新已关闭。后续优化默认只做本地提交。
- **AI SDK/MCP 迁移**：完成。server 已移除 `ai@5`，改用独立 `@ai-sdk/mcp@2.0.10` 的正式 `createMCPClient` / `callTool(arguments)` API；同步收紧 Zod peer 下限与 Node.js 22 运行时基线。server typecheck、目标 lint 与 MCP 精确场景通过；生产依赖审计中的 AI SDK 通告清零。
- **Claude SDK/Zod 4 安全迁移**：完成。OpenAI SDK 先独立升级到 6.46.0；随后将 protocol/client/app/desktop/server 的直接 Zod 依赖统一到 4.3.6，既有 schema 暂经官方 `zod/v3` 兼容入口保持解析语义，Claude Agent SDK 升至修复版 0.2.141，Anthropic SDK 升至 0.93.0，MCP SDK 下限对齐 1.29.0。严格 npm peer 解析与 `npm ls` 均通过；生产审计从 26 降至 24，Claude/Anthropic 通告清零且维持 0 high/0 critical。protocol/client/server build、六个消费包 typecheck、88 个改动文件 lint 与 148 个聚焦断言通过。
- **Protocol agent extension 消息域拆分**：完成。将 Skills 与 MCP server 管理配置、scope、payload、8 个 inbound 和 8 个 outbound schema 提取到 `agent/extensions.ts`，总 union 改为只读 tuple 聚合；旧 `messages` 入口继续兼容重导出，并新增 `@chisacode/protocol/agent/extensions` 显式子路径。主文件从 2860 降至 2436 行；protocol build/typecheck、3 个目标文件 lint、18 个聚焦断言、子路径运行时导入与五个消费者 typecheck 通过。
- **Protocol daemon 消息域拆分**：完成。将 daemon status/pairing、mutable config、project config、restart/shutdown 的 8 个 inbound、6 个 outbound 与 3 个 status payload 提取到 `daemon/messages.ts`，总 union/status union 均改为只读 tuple 聚合；旧 `messages` 入口继续兼容重导出，并新增 `@chisacode/protocol/daemon/messages` 显式子路径。主文件从 2436 降至 2164 行；protocol build/typecheck、3 个目标文件 lint、32 个聚焦断言、子路径运行时导入与五个消费者 typecheck 通过。
- **App workspace 移动端导航拆分**：完成首个工作台切片。将 mobile tab switcher、presentation fallback、tab menu 与局部样式提取到 `workspace-mobile-tab-switcher.tsx`，主屏仅保留导航数据与命令回调接线，从 5453 降至 4926 行。App typecheck、2 个目标文件 lint 与 15 个 tab menu/layout 聚焦断言通过；本批未声称 native mobile 运行态验证。
- **App workspace 命令路由拆分**：完成。新增 `use-workspace-keyboard-actions.ts`，独立拥有 tab、pane、dock、sidebar 与 command-center 五组 action 注册和路由，并通过 `useStableEvent` 保持 handler 引用稳定；主屏只注入现有 tab/pane/dock 业务回调，不改变持久化格式或 UI。`workspace-screen.tsx` 从 4926 降至 4657 行；App typecheck 与 2 个目标文件 lint 通过，下一步转向 layout/setup persistence 与 hydration 编排。
- **App workspace persistence/hydration 拆分**：完成。新增 `use-workspace-persistence-hydration.ts`，统一拥有 layout tab snapshot reconcile、setup status cache 恢复、空工作区 draft seed 与 setup tab auto-open 四段 effect；主屏只传 agent/terminal/tab 快照和既有 open-tab 回调，Zustand storage schema 与时序保持不变。新 hook 为 268 行，`workspace-screen.tsx` 从 4657 降至 4451 行；App typecheck 与 2 个目标文件 lint 通过。
- **App workspace tab open actions 拆分**：完成。新增 `use-workspace-tab-open-actions.ts`，统一拥有 draft 前台/后台创建、tab focus、imported agent、explorer/chat 文件、side-pane placement、Electron browser、mobile switcher 与 split 后 draft 创建共 12 个 open/create/navigation 回调；主屏继续保留 dock command 仍消费的 browser factory。新 hook 为 300 行，`workspace-screen.tsx` 从 4451 降至 4270 行；App typecheck 与 2 个目标文件 lint 通过，下一步转向 tab close/bulk-close lifecycle。
- **App workspace tab close actions 拆分**：完成。新增 `use-workspace-tab-close-actions.ts`，统一拥有 pending close 防重、terminal 确认/缓存移除/异步 kill、agent 仅关闭 tab、browser partition cleanup、通用 auto-open suppression，以及批量关闭确认和 left/right/other 选择；既有 `workspace-bulk-close.ts` 继续保留纯分类与执行逻辑。新 hook 为 404 行，`workspace-screen.tsx` 从 4270 降至 3970 行；App typecheck、2 个目标文件 lint 与 2 个关闭测试文件 7 个断言通过，下一步评估 pane move/reorder 与 dock orchestration。
- **App workspace pane/dock actions 拆分**：完成。新增 `use-workspace-dock-actions.ts`，独立拥有 dock state transition、browser/terminal/diff/PR placement 路由与 Electron browser gate；新增 `use-workspace-pane-layout-actions.ts`，独立拥有共享 focus suppression ref 和 focus/split/move/resize/reorder 持久化代理。`moveTabToDock` 继续保持既有显式 no-op，不在结构拆分中猜测产品语义。两个 hook 分别为 218/97 行，`workspace-screen.tsx` 从 3970 降至 3809 行；App typecheck、3 个目标文件 lint 与 dock model 18 个断言通过，下一步评估 pane content-model callbacks 与 environment-panel state orchestration。
- **App workspace pane content models 拆分**：完成。新增 `use-workspace-pane-content-models.ts`，统一拥有 child-tab open、current-tab close/retarget、workspace file side/current disposition、desktop focus-before-open、稳定 tab descriptor cache，以及 focused pane 的 3-tab LRU mounted retention；移动端/桌面 content model adapter 共享同一 builder。新 hook 为 213 行，`workspace-screen.tsx` 从 3809 降至 3703 行；App typecheck、2 个目标文件 lint 与 pane-content 2 个断言通过，下一步转向 environment-panel visibility/state orchestration。
- **App workspace environment panel state 拆分**：完成。新增 `use-workspace-environment-panel-state.ts`，统一拥有 responsive width threshold、`auto/forced-open/forced-closed` 恢复、dock 初始状态、panel/explorer 互斥 toggle，以及 changes/files explorer 路由；300px 样式宽度继续由主屏作为单一输入，safe gap/min-content policy 留在 hook。同步移除 environment rail 未使用的 `workspaceDirectory` 假依赖。新 hook 为 151 行，`workspace-screen.tsx` 从 3703 降至 3623 行；App typecheck 与 2 个目标文件 lint 通过，下一步转向 workspace explorer/open-intent orchestration。
- **ACP composition-first 拆分**：核心拆分完成，共十一个 ACP provider 切片。tool/permission、config mapping/state、NDJSON transport、process runtime、terminal/path、session update、foreground turn 与 command catalog 均已分域；`acp/session-lifecycle-controller.ts` 新增 process/connection/capabilities/session identity、new/load/resume、history replay、close 与 diagnostics 所有权。初始化失败现在必终止并清空子进程，load replay 用 `finally` 复位，Session 仅保留 façade、permission、文件/terminal 转发与事件接线；私有 connection/sessionId 访问器仅作既有测试兼容。`acp-agent.ts` 从 2860 降至 926 行；server typecheck、3 个目标文件 lint、4 个生命周期单测与 6 个 Session 接线场景通过。
- **Pi permission 映射拆分**：完成首个 Pi provider 切片。`pi/permission-mapper.ts` 独立拥有 extension UI select/input/editor/confirm、ask_user optional comment/freeform 组合与 permission response 映射，`pi/event-values.ts` 提供 unknown payload 窄解析原语；Session 继续拥有 pending request、runtime response 与事件时序。`pi/agent.ts` 从 1874 降至 1613 行；server typecheck、3 个目标文件 lint 与既有 extension UI/ask_user 6 个聚焦场景通过。
- **Pi history/event routing 拆分**：完成两个后续 Pi provider 切片。`pi/extension-history-controller.ts` 独立拥有 entry capture/index、tree navigation、marker/result promise 与 timeout/关闭清理；`pi/session-event-controller.ts` 独立拥有 active turn、tool lifecycle、extension UI pending、ask_user follow-up、runtime event routing 与 turn completion。`pi/agent.ts` 从 1613 进一步降至 1110 行；server typecheck、2 个目标文件 lint 与 Pi agent 23 个聚焦场景通过。
- **Pi runtime/session lifecycle 拆分**：核心完成。`pi/session-runtime.ts` 独立拥有 state、runtime info、模型/思考配置、usage、持久化与幂等 close；`pi/session-lifecycle.ts` 统一 new/resume、MCP adapter probe、临时 MCP/extension 文件、初始化失败清理和 capability 投影。恢复会话现在继承 launch env、应用 gateway model prefix，并把 prefix 继续传给后续 `setModel`；含 MCP secret 的临时配置以 `0600` 写入，所有 cleanup 幂等且逐项执行。`pi/agent.ts` 降至 581 行；server typecheck、4 个目标文件 lint 与 Pi agent 24 个聚焦场景通过。
- **Claude session identity/runtime cache 拆分**：完成。新增 `claude/session-identity.ts`，独立拥有 session identity、fresh/rebind、persistence handle、query model capture、runtime model、gateway override 与 runtime-info cache；Session 仅负责 mode 接线、history/rewind reset 和事件分发。SDK session ID 切换、mode 切换与 `setModel(null)` 现在都会失效缓存，`run()` 后保留 runtime model 诊断。`claude/session.ts` 从 1225 降至 1057 行；server typecheck、4 个目标文件 lint 与 6 个 session/mode/model/persistence 聚焦场景通过。
- **Claude foreground turn 拆分**：核心完成。新增 `claude/foreground-turn-controller.ts`，独立拥有 prompt/图片/附件转换、foreground turn 启动、取消/interrupt、autonomous turn 收口、`/rewind` 执行和 close 时状态复位；Session 仅保留 provider 事件、配置与各领域控制器接线。控制器为 219 行，`claude/session.ts` 从 1057 降至 873 行；server typecheck、2 个目标文件 lint 与 5 个 interrupt/reuse/stale abort/rewind 聚焦场景通过。Provider 核心拆分主线完成，下一优先级转向 `workspace-screen.tsx` commands/persistence。
- **Client 文件传输状态机拆分**：完成。将 `daemon-client.ts` 内 pending/active/completed 二进制文件读取状态、分片大小校验、结果组装与 legacy base64 解码提取到 `daemon-client-file-transfer.ts`；`DaemonClient` 仅保留 RPC 编排与响应转发，`FileReadResult` 既有导出保持兼容。
- **Client checkout/worktree 命令拆分**：完成。将 commit/merge/pull/push/PR/stash/worktree/branch/GitHub/directory 等 23 个无状态 RPC 命令提取到 `daemon-client-checkout-commands.ts`，`DaemonClient` 保持原公开方法并改为薄委托；checkout status 与 diff subscription 的重连状态继续留在核心类，等待独立生命周期切片。核心文件进一步降至 4893 行。
- **Client checkout 订阅生命周期拆分**：完成。将 checkout status 请求去重、diff compare 归一化、一次性 diff 获取、订阅失败回滚、取消订阅与重连恢复状态提取到 `daemon-client-checkout-subscriptions.ts`；`DaemonClient` 的四个公开方法保持兼容并改为薄委托，重连测试改走真实公开订阅流程，不再修改私有状态。核心文件进一步降至 4752 行。
- **Client 管理类 RPC 分域拆分**：完成。将 provider discovery/diagnostics/presets/model gateway、daemon/project config，以及 agent commands/skills/MCP server 管理共 25 个无状态 RPC 分别提取到三个领域客户端，并用 `daemon-client-command-transport.ts` 统一 correlated request 端口契约；公开方法与 wire shape 保持不变。核心文件进一步降至 4555 行。
- **Client automation RPC 分域拆分**：完成。将 Chat、Schedule、Loop 三个产品域的 21 个无状态 RPC 提取到 `daemon-client-automation-commands.ts`，参数继续兼容 nullable convenience API，并从 protocol request union 派生 wire 类型；`DaemonClient` 保持原公开方法为薄委托。chat wait timeout、schedule nullable update 与 loop string overload 精确契约通过，核心文件降至 4353 行。
- **Client workspace RPC 分域拆分**：完成。将 project open、workspace script/editor/archive/setup、directory listing、download token 与 project icon 九个无状态命令提取到 `daemon-client-workspace-commands.ts`；`fetchWorkspaces` 的分页 selector 与 `readFile` 的 binary transfer state 保留在核心。openProject 60 秒冷启动 timeout 与 listDirectory 错误契约通过，核心文件降至 4284 行。
- **MCP Chat/Loop 产品 parity**：完成。新增 7 个一等 Chat 工具（房间创建/列表/检查/删除、消息投递/读取/等待）和 5 个一等 Loop 工具（启动/列表/检查/日志/停止），由独立 `chat-mcp-tools.ts`、`loop-mcp-tools.ts` 注册并直接注入现有 service。Chat 投递与 WebSocket Session 复用共享命令，保留 `@agent`/`@everyone` fan-out；agent-scoped MCP 禁止伪造其他作者，Loop cwd 继续受 caller scope 约束。server typecheck、目标 lint 与 2 组精确 MCP 契约测试通过。
- **Client terminal 生命周期拆分**：完成。新增 `daemon-client-terminal-client.ts`，独立拥有 terminal 目录订阅及重连恢复、terminal RPC、stream slot、二进制输入/输出路由、exit/断线清理和 event wait；`DaemonClient` 保留公开 façade 与 runtime metrics 分类，`closeItems` 因跨 agent/terminal 领域继续留在核心。公开 `TerminalStreamEvent`、`RenameTerminalInput/Result` 导出保持兼容，核心文件从 4284 降至 4145 行；client typecheck/build、3 个专用测试与 6 个既有集成场景通过。
- **Client voice/dictation 生命周期拆分**：完成。新增 `daemon-client-voice-client.ts`，独立拥有 voice mode/audio 命令和 dictation start ack/error、finish accepted/final/error 竞速、服务端 timeout budget、fallback deadline 与 waiter cancel cleanup；核心仅注入 correlated request、严格/宽松发送和通用 waiter 端口，公开方法保持薄 façade。核心文件从 4145 降至 3920 行，首次低于 4k；client typecheck/build、3 个专用状态机测试与 2 个既有 timeout/final 场景通过。
- **Client agent lifecycle/config 拆分**：完成。新增 `daemon-client-agent-lifecycle.ts`，独立拥有 agent fetch/create/delete/archive/update、project rename、resume/import/refresh、rewind/cancel 和 mode/model/feature/thinking 配置；status 型操作继续复用核心 waiter authority，普通响应复用 correlated transport。公开 `CreateAgentRequestOptions`、`ImportAgentInput`、`FetchAgentResult` 从原入口重导出，wire shape 与业务拒绝错误保持兼容。核心文件从 3920 降至 3471 行；client typecheck/build、3 个专用契约测试与 7 个既有 create/import/model 场景通过。
- **Client agent interaction/query 拆分**：完成。新增 `daemon-client-agent-interaction.ts`，独立拥有 timeline 查询、agent 消息发送与 Generative UI action 的消息构造、超时、能力门禁和业务拒绝语义；`DaemonRpcError` 提取为核心 RPC 与领域客户端共享的内部错误类型。公开 timeline/消息选项类型继续从原入口重导出，`DaemonClient` 保持薄 façade，核心从 3471 降至 3368 行；client typecheck/build、4 个目标文件 lint、3 个专用契约测试与 5 个既有 façade/SDK 场景通过。
- **Client request/waiter authority 拆分**：完成。新增 `daemon-client-request-coordinator.ts`，完整拥有 correlated response 匹配、`rpc_error` 元数据、timeout/cancel waiter、连接中 RPC 排队、连接成功 flush 与断线统一拒绝；所有领域客户端继续通过同一窄 request port 接线。移除核心的两套 pending 集合和 8 个请求辅助方法，并把测试中的私有 `waiters` 状态断言改为无残留 deadline timer 的行为契约；核心从 3368 降至 3040 行。client typecheck/build、4 个目标文件 lint、3 个专用状态机测试与 10 个既有跨 RPC 形态场景通过。
- **Client transport/reconnect 生命周期拆分**：完成。新增 `daemon-client-connection-controller.ts`，完整拥有 transport factory/E2EE 包装、hello 握手、connect promise、状态订阅、错误去抖、退避重连、严格/宽松发送、binary send 与 liveness probe；核心只保留协议解码和三个生命周期回调。公开 `DaemonClientConfig`、`ConnectionState`、`Logger` 继续从原入口重导出，连接重置仍统一清理 request、terminal、file transfer 与 runtime metrics；核心从 3040 降至 2319 行。client typecheck/build、3 个目标文件 lint、3 个专用连接测试与 16 个既有连接/消息/SDK 场景通过。
- **Protocol terminal 消息域拆分**：完成。新增 `terminal/messages.ts`，完整拥有 terminal inbound/outbound schema、状态快照 schema、消息类型及用于总 union 聚合的只读 schema tuple；`messages.ts` 通过 tuple spread 聚合并兼容重导出，`terminal-snapshot.ts` 改为直接依赖领域类型，消除对 god-file 的反向依赖。新增 `@chisacode/protocol/terminal/messages` 显式公开入口，主文件从 5213 降至 4941 行；protocol build/typecheck、5 个目标文件 lint、42 个聚焦断言及 client/server/app/CLI 消费者 typecheck 通过。
- **Protocol checkout 消息域拆分**：完成。新增 `checkout/messages.ts`，完整拥有 checkout status/diff、commit/merge/pull/push、PR/auto-merge/timeline、branch/stash 与 GitHub search 的请求、响应、兼容 default 和消息类型；总 union 通过 22 个 inbound/23 个 outbound schema tuple 聚合，`CheckoutErrorSchema` 作为 worktree 响应的单向共享契约。新增 `@chisacode/protocol/checkout/messages` 显式公开入口，旧 `messages` 入口兼容重导出，主文件从 4941 降至 4142 行；protocol build/typecheck、4 个目标文件 lint、66 个聚焦断言及 client/server/app/CLI 消费者 typecheck 通过。
- **Protocol workspace/attachment 消息域拆分**：完成。新增 `workspace/messages.ts`，完整拥有 workspace/worktree/directory/editor/file explorer/project icon/download token 的 14 个 inbound、18 个 outbound schema，以及 workspace descriptor、project placement、script/setup 状态和消息类型；`agent/attachments.ts` 独立拥有 GitHub/text/review attachment 解析与 legacy 容错归一化，解除 workspace 创建 RPC 对 god-file 的反向依赖。总 union 通过只读 tuple 聚合，旧 `messages` 入口兼容重导出，并新增两个显式 package subpath；主文件从 4142 降至 3339 行。protocol typecheck/build、6 个目标文件 lint、44 个聚焦断言及 client/server/app/CLI 消费者 typecheck 通过。
- **Protocol provider 消息域拆分**：完成。新增 `provider/messages.ts`，完整拥有 provider model/mode/feature discovery、snapshot、diagnostic、tooling、usage、recent sessions 与兼容 diagnostics 的 11 个 inbound、12 个 outbound schema；model normalization、snapshot defaults 和 tooling metadata 保持原契约，总 union 改为只读 tuple 聚合，旧 `messages` 入口继续兼容重导出。`agent-types.ts` 的 attachment 类型改为直接依赖 `agent/attachments.ts`，消除对 god-file 的反向依赖；新增显式 package subpath，主文件从 3339 降至 2860 行。protocol typecheck/build、8 个目标文件 lint、87 个聚焦断言及 client/server/app/CLI 消费者 typecheck 通过。
- **Provider composition-first 拆分启动**：完成 Codex skills、notification parser/router、turn configuration、model catalog、launch/runtime config、client/client runtime、session/thread bootstrap/session metadata/session history、tool/delta/item/turn notification、notification/compaction state、notification timeline、sub-agent tracker、permission state/domain/controller、session event bus、user-message turn state、image attachments、history pipeline 三十二个领域切片；`session-history.ts` 完整拥有 persisted history pending/entries、user-message 索引重建与单次 drain，`session-connection.ts` 完整拥有 client、并发 connect 去重、initialize handshake、失败清理与 close 竞态，`session-commands.ts` 完整拥有 slash-command 解析、custom prompt/skill 展开、命令目录及 `/compact`/`/goal` 编排，`session-runtime.ts` 完整拥有 config/mode/feature/service tier、runtime info cache 与 persistence metadata，`session-turn-execution.ts` 完整拥有 foreground/native turn state、run/start/interrupt、参数构建与启动日志。Session 从 828 降至 715 行，turn execution 223 行。Claude Slice 2 已完成十六个边界：Client、Session、SDK reader、turn routing、foreground turn/input、message translation、query lifecycle、rewind、persisted history、history conversion、tool lifecycle、SDK mapping、permissions、options 与 session identity/runtime cache 均已独立；原 5185 行 `agent.ts` 收敛为 16 行兼容 façade，`session.ts` 为 873 行、`foreground-turn-controller.ts` 为 219 行、`session-identity.ts` 为 258 行、`client.ts` 为 523 行。ACP 已按相同策略提取七个领域模块，session update 的消息/tool 状态与路由已独立；Pi 已完成 permission、event values、extension history、session event、runtime state 与 session lifecycle 六个边界，new/resume 资源所有权、模型/思考配置、usage、持久化和 cleanup 均已独立，主文件从 1874 降至 581 行。各 provider 均未引入基类或 mixin，核心拆分完成。
- **状态**：进行中，直接在 `cn-main` 执行，不创建额外分支或 worktree。

### 2026-07-12 深度架构/安全/产品/代码质量审查批次（完成）

- **审查报告**：[deep-code-audit-2026-07-12.md](deep-code-audit-2026-07-12.md)
- **安全修复**：relay server socket 认证增加签发时间与 Durable Object 持久化 nonce 消费记录；默认拒绝过期、未来和重复凭证，且在关闭既有 socket 前完成校验。补重放/过期单测与真实 Wrangler E2E。
- **产品兼容修复**：`ProviderHandler` 拆分时遗留的 `LEGACY_PROVIDER_IDS.has(provider) || true` 永真逻辑已删除，重新委托 Session 版本兼容策略；旧客户端不会收到未知 provider id。
- **代码质量**：Knip CI 收敛为高信号依赖/未声明依赖/unresolved/binary 门禁并清零现有问题；修复失效 import、依赖归属、relay E2E hoist 偶合、异步测试竞态，以及 125 个锁文件镜像来源漂移。
- **依赖安全**：Vitest Browser 升至 4.1.10，Wrangler 升至 4.110.0；AI SDK、Claude SDK 与 Zod 4 迁移已完成，生产依赖维持 0 high/0 critical。剩余 moderate 主要来自 Expo/EAS 工具链，framework major migration 单独追踪，不使用错误的自动降级建议。
- **架构证据**：dependency-cruiser 807 modules / 1888 dependencies / 0 violations。边界健康，但 4k-5k 行责任中心仍是主要扣分项。
- **状态**：完成。本地精确验证通过；推送后由远端 CI 持续复验。

### 综合审查 CI 门禁收尾（2026-07-12 完成）

- **问题**：`scripts/test-audit-baseline.json` 早于默认分支既有测试债，导致基线提交本身无法通过 `npm run test:audit`；`package-lock.json` 同时保留 42 个 npm 镜像 tarball URL，与 CI 的 npmjs-only host 策略冲突。
- **影响范围**：`scripts/test-audit-baseline.json`、`package-lock.json`、`.github/workflows/ci.yml` 的 test-audit 与 lockfile-lint 门禁。
- **解决**：使用仓库审计脚本按默认分支真实计数重新校准 no-new-debt 基线；以 JSON/URL 结构化转换把 42 个 `registry.npmmirror.com` hostname 规范化为 `registry.npmjs.org`，保持包版本、路径和 integrity 不变。CI allowlist 未放宽。
- **后续**：当前基线仍包含 moduleMock 303、conditionalSkip 105、weakAssertion 349、processEnvMutation 151 等历史债；后续改动不得增加，并应按包拆成独立减债批次逐步下调基线。
- **远端复核**：首次实际触发 `cn-main` CI 后发现 npm 11 生成的 lockfile 删除了 desktop 精确依赖 `@types/node@24.6.0` / `undici-types@7.13.0`，导致 Node 22/npm 10 的所有 `npm ci` job 在测试前失败；同时 TruffleHog 重复传入 `--no-update`，Nix hash workflow 在 GitHub App secret 缺失时直接失败。
- **解决补充**：使用 CI 同代 npm 10 重新生成完整跨平台 lockfile；移除重复 TruffleHog 参数；Nix workflow 在 App secret 未配置时回退到具备最小 `contents: write` 权限的 `GITHUB_TOKEN`。
- **状态**：修复中；本地 npm 10 `ci --dry-run`、test-audit、lockfile-lint 和 workflow YAML 解析均退出 0，等待远端 CI 复验后关闭。

### 全项目代码审查修复批次（2026-07-05 起执行）

**背景**：对整个 monorepo 做三方向并行审查（安全敏感面 / 性能 bug / 测试覆盖），发现 2 CRITICAL + 7 HIGH + 12 MEDIUM（含 9 测试覆盖）+ 8 LOW。本批次逐项走完整周期：审查分析→计划→执行→测试→文档→提交归档，防止"修了又回滚"（根因 A/D：wildcard 硬语义曾被 `d1dcd2d3c fix(release): preserve patch compatibility` 有意撤回，测试同步降级为 `not.toThrow()`，绿测试掩护回归）。

**根因诊断**：

- **根因 A**：硬性安全修复被"patch 兼容"有意回滚（`95400d5bf` 真修 → `d1dcd2d3c` 撤回），名实不符（`assertWildcardAuth` 不再 assert）。
- **根因 B**：单点修复未触及通用代码路径（docker-compose 端口映射修了，daemon bootstrap.ts body limit / wildcard / loop verify-check 从未修）。
- **根因 C**：声称修复范畴与实际代码不匹配（`bf0a8e9a1` "2 CRITICAL" 指的是 E2EE 重放 + serverId 字符集，非 relay 路由鉴权）。
- **根因 D**：安全测试被改成断言不安全行为（`bootstrap-auth.test.ts` 从 `toThrow` 改 `not.toThrow`），CI 绿反而掩盖回归。

**进度**：

- [x] CRITICAL #2: relay v1 生产禁用 — `resolveRelayVersion` 缺省改 v2，显式 `v=1` 需 `RELAY_ALLOW_V1=1` opt-in（commit 待提交）
- [x] CRITICAL 根因 A/D: wildcard 硬语义恢复 — `assertWildcardAuth` 改回 fail-closed，`CHISACODE_ALLOW_WILDCARD_NO_AUTH=1` opt-in 兼容，测试恢复双语义（commit 待提交）
- [x] CRITICAL #1: relay v2 role=server 无鉴权 — daemon key bundle 增加持久化 Ed25519 relay-auth signing key；server-control/server-data URL 带 `relayAuthPublicKeyB64`/nonce/signature；relay 默认拒绝无签名 server socket，并在同一 DO 内把已验签 public key 绑定到 serverId，后续不同 key 不能替换既有 server socket。`RELAY_ALLOW_UNSIGNED_SERVER_AUTH=1` 为显式兼容逃生舱。覆盖 `cloudflare-adapter.test.ts`、`relay-transport.test.ts`、`connection-offer.test.ts`
- [x] 审查批次 A（2026-07-05）— HIGH #1: 每 IP 限流可被 `X-Forwarded-For` 伪造击穿。默认不信任 XFF（直连 daemon 无可信前置代理），新增 `CHISACODE_TRUST_FORWARD_HEADERS=1` opt-in 逃生舱供反向代理部署用。`bootstrap.ts:rateLimitKey`
- [x] 审查批次 A（2026-07-05）— HIGH #2: `handleFileDownload` 的 `Content-Disposition` 文件名注入残留。改 RFC 6266 `filename*=UTF-8''<percent-encoded>` 主形 + ASCII fallback 剥 `"`/`\`/控制字符/`;`，消除头注入/解析歧义。`bootstrap.ts:handleFileDownload`
- [x] 审查批次 A（2026-07-05）— MEDIUM #1: `extractWsBearerToken` 对 `chisacode.bearer.` 后段无长度/字符校验直接进 bcrypt `compare`。判空 + 长度上限 1024，避免空 token 触发 bcrypt CPU 放大。`auth.ts:extractWsBearerToken`
- [x] 审查批次 A（2026-07-05）— MEDIUM #2: `shouldBypassBearerAuth` 路由匹配用字符串全等而非前缀，未来子路径会误拒。改 `path === X || path.startsWith(X+"/")` 前缀匹配。`auth.ts:shouldBypassBearerAuth`
- [x] 审查批次 A（2026-07-05）— MEDIUM #3: `isBearerTokenValidSync` 与 async 版并存，sync 版 export 但无 caller，误在请求路径用会阻塞事件循环。补 JSDoc 标注「仅限启动期/CLI，禁用于请求处理」。`auth.ts`
- [x] 审查批次 A（2026-07-05）— LOW #2: `SECURITY.md` 第 47 行仍称「replay protection is not yet implemented」，与 `bf0a8e9a1` 的 salt+seq 单调计数器 + fatal close 语义矛盾。更新文档对齐代码现状。
- [x] 审查批次 A（2026-07-05）— LOW #1 复核: `DOWNLOAD_OPEN_FLAGS` 在 POSIX 含 `O_NOFOLLOW`，Windows 仅 `O_RDONLY`（Windows 不支持 `O_NOFOLLOW`，路径已由 realpath 规范化），无 bug，归档不再追踪。
- [x] 审查批次 A 遗留: MEDIUM #4（relay `webSocketMessage` 抢占无抖动退避，DoS 放大）— server-control/server-data 替换路径已先验签再 close 旧 socket，错误/无签名 server socket 不能再抢占既有 daemon socket
- [ ] 审查批次 A 遗留: LOW #3（`hostnames.ts` IP 字面量默认放行 = DNS rebinding 到公网 IP 可绕过 Host 检查）属 Vite 原始语义取舍，非 ChisaCode 引入，待在 SECURITY.md 注明取舍，后续专项
- [ ] HIGH #3/#5/#6/#7/#8/#9/#10/#11 + MEDIUM #12-#20 + 测试覆盖 M-TC1-9 + LOW #1-8（归档批次历史编号，未在本批次执行）

**防回滚机制**：每项修复提交时在 commit message 引用根因诊断；安全测试不得改 `not.toThrow`，硬语义降级必须经 opt-in flag 而非默认。

### CLI fallback stop 的 PID verify-to-signal 残余竞态（pending）

- **问题**：`packages/cli/src/commands/daemon/local-daemon.ts` 的 fallback stop 只能按数值 PID
  发送进程信号。PID owner 校验完成后、SIGTERM 或 SIGKILL 发出前，目标进程仍可能退出且 PID
  被复用，因此 identity verification 与 tree signaling 之间存在无法原子绑定的 TOCTOU 窗口。
- **当前缓解**：CLI 在 SIGTERM 前校验一次 `getPidLockOwnerStatus`，进入 force fallback
  SIGKILL 前再校验一次；`mismatch`、`unknown`、`not_running` 均 fail closed，不发送对应信号。
  这两次 verifier 会缩小误杀窗口，但不能消除 verify-to-signal 竞态。
- **候选方案**：评估跨平台 stable process-handle 抽象（Linux pidfd、Windows process handle、其他
  POSIX 等价机制），或把 fallback termination 收口到持有稳定 owner identity 的 supervisor control
  通道。不得以新增 native 依赖或删除既有 fallback stop 行为作为未经专项设计的临时修复。
- **状态**：pending，等待最终审查分流为独立架构任务。

### Server 进程树 ownership / query / deadline 编排拆分（pending）

- **问题**：`packages/server/src/utils/tree-kill.ts` 当前在同一实现中承担 Windows CIM
  ownership 查询与 CreationDate 复核、POSIX/Linux 进程身份跟踪、child-first signaling，及
  cleanup absolute deadline / cancellation 编排。Task 4 已补齐 fail-closed、snapshot churn 和
  deadline 语义，但继续在单文件内扩展会放大跨平台状态机的审查与回归成本。
- **影响范围**：`packages/server/src/utils/tree-kill.ts`、`packages/server/src/utils/spawn.ts`，以及
  server 内所有通过 `terminateWithTreeKill` 清理 provider / shell 命令树的调用点。
- **建议方案**：在不改变现有 public entry point `terminateWithTreeKill` 的前提下，提取私有
  Windows ownership/query adapter、POSIX identity tracker、以及共享 cleanup-deadline
  orchestrator；由现有入口组合这些模块并继续统一返回
  `already-exited | terminated | killed | kill-timeout`。专项迁移必须保留当前 typed operations
  tests、CreationDate/starttime signal-time identity revalidation、保守 polling 与严格 signaling
  的错误语义区分、fail-closed fallback 与单一 absolute deadline。
- **状态**：pending。Task 4 仅加固既有入口与私有 typed seams，不在本轮执行高风险结构拆分。

### Task 4 第九次规范复审加固（2026-07-11 完成）

- **背景**：第八次修复后的复审发现三个边界问题：Linux/通用 POSIX 在真正发信号前的身份读取
  失败仍可能沿保守 polling 语义继续；`maxBuffer` 清理启动后分片多字节字符无法补全且 retained
  slice 与大源 Buffer 共用 backing allocation；exact deadline 会覆盖更严重的命令树清理超时。
  最终质量复审又确认通用 POSIX parser 会静默跳过 malformed/empty `ps` 输出，把不完整表中缺失
  的 tracked PID 误判为已退出。
- **已修复**：
  - Linux 与通用 POSIX 分离“保守存活轮询”和“严格 signal authorization”。真实消失的 PID
    继续跳过，读取错误或 identity 变化在任何 PID/process-group signal 前 fail closed；轮询阶段
    仍把不可读记录视为存活，避免误报已终止。
  - 通用 POSIX process-table read 现在携带 private completeness 标记。malformed/invalid/empty
    `ps` 输出不能确认 PID 消失：严格 snapshot/signal 路径 fail closed，polling 保留 stale survivor；
    只有 complete table 明确缺失 PID 时才允许判定旧 identity 已退出。
  - 有界输出在首次 raw overflow 时只启动一次清理，并仅继续接收完成边界字符所需的最多三
    个字节；retained slice 复制到独立 Buffer。`hex`/`base64`/`base64url` overflow 前缀与当前
    Node 行为对齐，非 overflow 保留完整编码；未知 encoding 在 spawn 前以
    `ERR_UNKNOWN_ENCODING` 拒绝。
  - Loop verifier 在 exact deadline 同时收到 `ExecCommandKillTimeoutError` 时保留清理超时为 fatal
    根因，不转换为普通 max-time 错误。
- **边界**：未改 relay、未新增 public API，仍保留现有 process-group signaling、bounded cleanup
  deadline 与跨平台 fallback 策略。
- **状态**：已完成；精确 RED/GREEN 与最终验证记录见 Task 4 本地报告第九次及最终质量复审章节。

### 对抗性自审与接线验证（2026-07-05 完成）

- **背景**：对两批改动强制"调用点验证 + 端到端冒烟 + 对抗审查"作为完成标准，主动报告未接线项并修复。
- **调用点验证**（逐项 grep 真实消费）：
  - `writeFileAtomic`：5 处真接线（agent-storage/chat-service/loop-service/pid-lock/usage-store）✅
  - C1 relay `enforceReplayProtection` 在 handleMessage 调用，`sendSalt` 在 setState("open") 初始化，`send` 用 sendSeq++ ✅
  - L3 `cleanupStaleCodexImageAttachments` 在 close() 接线 ✅
  - C3/C4 `resolvePathInsideBase` 三处接线（read/write/createTerminal）✅
  - M11 `setCurrentAssistantMessage` 在重连 effect 接线 ✅
  - L9 三处 i18n t() key 与资源 key 精确匹配 ✅
  - M3/M4 logger.warn 4 处接线 ✅
- **端到端冒烟**（真实 fs/协议，绕过 mock）：
  - atomic-write：真实写盘/读回/覆盖/临时文件清理/mode 0o600 全验证 ✅
  - ACP 路径边界：接受 base 内、拒绝 `..` 越界、拒绝 base 外绝对路径、接受 base 本身 ✅
  - relay 加密往返 + 重放拒绝：既有 8 单测覆盖 ✅
- **对抗审查发现并修复的未接线项**：
  - **L9 new-workspace-screen.tsx 4 处硬编码未补**：`customValuePrefix`/`customValueDescription`/`searchPlaceholder`/`title`（line 384-388）+ `开始使用ChisaCode`（line 1470）。新建 `workspace.directoryPicker.*` + `workspace.startUsingChisaCode` 命名空间（zh+en），全部补 `t()`。这是上一批"留作后续"但用户要求"全部"的遗漏，本轮补齐。
  - **C3/C4 探针路径未接线**：`buildProbeClient` 的 readTextFile/writeTextFile（line 859-866）原本也应加边界检查，但探针路径是死代码占位（探针不发 fs 请求），且 `ACPAgentClient` 无 `config` 字段。尝试加边界检查导致 `this.config` 类型错误。回退探针路径并加注释说明：边界检查只在真实会话路径（ACPAgentSession）接线，探针占位不加。
  - **SEQ_LENGTH 冗余导出**：index.ts/e2ee.ts 导出 SEQ_LENGTH 无外部消费，但保留作协议常量公共 API（与 SALT_LENGTH 配对），非未接线。
- **跨平台对抗**：
  - Windows `path.relative` 大小写不敏感：`C:/Proj/MyRepo` vs `c:/proj/myrepo/src` 返回 `src\file.ts`（不含 `..`），正确接受 ✅
  - Windows 跨盘符 C→D：`path.relative` 返回绝对路径 `D:\evil\file.ts`，`path.isAbsolute` 捕获并拒绝 ✅
  - `fs.open` + `datasync` 在 Windows 工作 ✅
- **验证**：typecheck 9 包全绿 / lint 0 错误 / 59 单测全过。
- **状态**：已完成。

### MEDIUM/LOW 缺陷批量修复（2026-07-05 完成）

- **背景**：在两轮 CRITICAL/HIGH 修复后，清理审查报告中剩余的 11 MEDIUM + 9 LOW + 1 降级 LOW，共 21 项系统性缺陷。
- **已修复**：
  - **M5/M6/M7/L1 原子写统一**：新建 `packages/server/src/utils/atomic-write.ts` 提供 `writeFileAtomic`（临时文件 + fsync + rename，crash-safe）。pid-lock `updatePidLock`、usage-store `replace`/`clear`、loop-service `persist` 三处非原子写改用它；agent-storage、chat-service 两处已有原子写也统一收口并补 fsync；private-files `writePrivateFileAtomicSync` 补 fsync。一次改动修 4 项 + 补 3 处 fsync。
  - **M1** desktop webview `will-attach` 加 `disableDialogs=true`，与 AGENTS.md 声明对齐，阻止恶意页面弹原生 alert/confirm 钓鱼。
  - **M2** lefthook：全量 typecheck 从 pre-commit 移至 pre-push，避免 worktree 并发 commit 的 `tsc --incremental` 竞态与 `--no-verify` 绕过。
  - **M3** client `ensureConnected` 的 `void this.connect()` 加 `.catch` 转发到 logger，避免 unhandled rejection 被静默吞没。
  - **M4** relay e2ee transport `send` 在 channel 未就绪时除 throw 外也记 logger.warn + emitError；fire-and-forget 的 send 失败补 logger.warn，提升可观察性。
  - **M8** `agent-list.tsx` `formatStatusLabel` 的中文兜底改英文，避免 i18n key 缺失时英文环境回退显示中文。
  - **M9** client `attemptConnect` catch 在调 `rejectConnect` 前判空 `connectReject`，消除双重 reject 混乱控制流。
  - **M10** relay `createClientChannel` 把 `setInterval` + return 包进 try/catch，确保任何同步异常都 `clearRetry`，避免握手重试定时器泄漏。
  - **M11** `session-context.tsx` 重连 effect 在"刚断连"分支清空 `currentAssistantMessage`，避免半截流式消息跨重连残留。
  - **L2** skills-management GitHub 归档下载改流式 + `AbortSignal.timeout(60s)` + 256MB 字节上限，防 OOM/挂起。
  - **L3** codex 图像附件：新增 `cleanupStaleCodexImageAttachments`（1 小时 TTL），会话 close 时调用，防 tmpdir 磁盘泄漏。
  - **L4** pi `cli-runtime` stdoutBuffer 加 1MB 上限，与 stderrBuffer 对齐，防异常进程无 `\n` 输出致无界增长。
  - **L5** desktop `chisacode://` 协议 `decodeURIComponent` 包 try/catch，畸形 `%` 序列返回 404 而非抛 URIError。
  - **L6** cli `loadOutputSchema` 加 JSDoc 文档化"任意路径读取"行为（CLI 同用户权限，daemon 侧 Zod 复校验）。
  - **L7** tsconfig.base.json 加 `noFallthroughCasesInSwitch`；`noUnusedLocals`/`noUnusedParameters` 留作单独立项避免大范围破坏。
  - **L8** vitest.config.ts 加 v8 coverage provider 配置（不强制阈值，留作后续调优）。
  - **L9** app 3 处直接 UI 硬编码中文补 i18n：`projects-screen` HostErrorsBanner（`workspace.hostProjectLoadError`）、`split-container` 加载中（`common.loading`）、`sidebar-agent-list-skeleton` a11y label（`sidebar.agentListLoading`）。剩余 5 处（new-workspace 已有 t 的硬编码、question-form-card、archive-subagent、use-built-in-daemon、generative-ui/errors 纯函数）因结构复杂或纯函数性质留作后续 i18n 收尾专项。
  - **C3/C4（降级 LOW）** ACP `readTextFile`/`writeTextFile`/`createTerminal` 加 `resolvePathInsideBase` 边界检查（意图约束，非安全边界——agent 同用户同权限无沙箱）。防 agent 笔误写到项目目录外。
- **验证**：typecheck 9 包全绿 / lint 0 错误 / relay 33 + desktop 30 + cli 3 + pid-lock/usage-store 单测全过。loop-service.test.ts 一项失败（`vi is not defined`）经 git stash 确认为预存测试缺陷，与本批改动无关。
- **遗留**：L9 剩余 5 处 i18n、L7 的 `noUnusedLocals`/`noUnusedParameters`、loop-service.test.ts 的 `vi` import 缺陷，记入后续专项。
- **状态**：已完成。

### 对抗性代码审查修复（2026-07-04 完成）

- **背景**：在上一轮 34 项修复（commit `f673a88bc`）基础上做对抗性重判，确认 2 CRITICAL + 5 HIGH + 2 LOW 真实缺陷并修复。
- **对抗性修正**：上一轮初判的「relay 无认证」「ACP 路径穿越」两项 CRITICAL 经威胁模型复核后**降级**——`serverId` 是 72-bit bearer credential 带外分发，relay 作为无状态转发中继无需额外 HMAC；ACP agent 与 daemon 同用户同权限无沙箱，fs/terminal 边界检查非安全边界。真实 CRITICAL 收敛为 2 项。
- **已修复**：
  - **C1（CRITICAL）** relay 加密消息无重放保护：`crypto.ts` 的 nonce 改为 `salt(16)+seq(8)` 计数器派生（tweetnacl `box.after` 不支持 AAD，序列号必须编码进 nonce），`encrypted-channel.ts` 维护 per-direction send/recv 计数器 + salt，严格单调校验，违反时 fatal close 1011。帧格式不变。新增 8 个重放保护单测。
  - **C2（LOW）** relay serverId 未校验长度/字符集：`cloudflare-adapter.ts` 两个 fetch 入口加 `^[A-Za-z0-9_-]{1,128}$` 校验。纵深防御。
  - **C5（CRITICAL）** CI secret-scan 用 `trufflehog@main`：pin 到 v3.95.8 SHA；`reactivecircus/android-emulator-runner@v2` pin 到 v2.37.0 SHA。
  - **H1** `host-page.tsx` 872 行零 i18n：新建 `settings.hostPage.*` 命名空间（zh+en），覆盖全部硬编码中文。
  - **H2** `open-project-screen.tsx` 4 个 HomeTile 硬编码：新建 `openProject.*` 命名空间。
  - **H4** desktop `isProcessRunning` EPERM 返回 false：改为 true（与 CLI 侧对齐），避免误报 daemon 已死触发重复启动。
  - **H5** desktop 写命令未入特权集：`patch_desktop_settings`/`migrate_legacy_desktop_settings`/`check_app_update` 加入 `PRIVILEGED_COMMANDS`，补测试断言。
  - **H6** CLI 无全局 rejection 处理：`index.ts` 包 try/catch + `process.on(unhandledRejection/uncaughtException)`，用 `getErrorMessage` 过滤输出。
- **验证**：typecheck 9 包全绿 / lint 0 错误 / relay 33 单测 + desktop 30 单测 + cli 3 单测全过。
- **状态**：已完成。

### 错误提示机制统一设计（草案，2026-07-03 起草）

- **计划**：[error-handling-unification-plan.md](error-handling-unification-plan.md)
- **背景**：app 包存在五套错误展示机制并存，无明确边界规则，是 P2 粗糙点。
- **状态**：草案，本批次未执行代码改动，仅设计文档。
- **后续**：待排期执行。

### Provider God-File 拆分（草案 + 部分执行，2026-07-03 起草）

- **计划**：[provider-god-file-decomposition-plan.md](provider-god-file-decomposition-plan.md)
- **背景**：codex/claude/opencode 三个 provider agent 实现仍是 god-file（5000+ 行），无共享基类。
- **已完成的子步骤**：
  - opencode 常量提取到 `opencode/constants.ts`（`OPENCODE_BUILD_MODE_ID` 等）
  - `ProductionOpenCodeRuntime` 类从 `opencode-agent.ts` 迁移到 `opencode/runtime.ts`
  - `OpenCodeAbortCoordinator` 独立拥有 local turn signal、provider `session.abort` pending 与 next-turn serialization；主文件降至 3698 行
  - `OpenCodeEventStreamController` 独立拥有 SSE readiness、消费循环、stale terminal 抑制、tool tracking 与终态路由；主文件进一步降至 3466 行
  - `opencode/helpers.ts` 已真正接线，统一 create config、权限、MCP、tool schema 与诊断 helper，并改为复用 `constants.ts`；主文件降至 3194 行
  - `opencode/catalog.ts` 独立拥有 mode/model catalog、context-window lookup、runtime model prefix 与 slash-command discovery；主文件降至 2922 行
  - `opencode/client.ts` 独立拥有 Client API、server acquisition、model/mode discovery、诊断与显式 Session factory/persistence collector ports；主文件降至 2514 行
  - `opencode/session.ts` 独立承载 Session 与 history；`opencode-agent.ts` 收敛为 64 行兼容 façade
  - `opencode/event-translator.ts` 独立拥有 native event translation、usage、permission、todo 与 sub-agent timeline 映射；Session 降至 1396 行
  - `opencode/history.ts` 独立拥有 persistence scanner、revert 截断、replay timestamp 与 timeline conversion；Session 降至 1111 行
  - `OpenCodePermissionController` 独立拥有 auto-accept、pending queue、question/tool response；`OpenCodeMcpController` 独立拥有一次性配置、并发去重与失败重试；Session 降至 975 行
  - `OpenCodeSessionEventBus` 独立拥有 active turn、subscriber、turn ID、running tool terminal synthesis 与 close suppression；Session 降至 886 行
  - `OpenCodeSessionRuntime` 独立拥有 mode/model/thinking/feature、catalog cache、context-window selection 与 persistence metadata；Session 降至 792 行
  - `OpenCodeSessionLifecycle` 独立拥有 close ordering、abort/archive reconciliation、ephemeral delete 与 server release；Session 降至 699 行
  - `OpenCodeTurnExecution` 独立拥有 prompt parts、slash command 分流、run/start/interrupt、MCP/SSE 启动顺序与 provider dispatch；Session 降至 395 行，turn execution 为 433 行
  - `opencode/sub-agent-tracking.ts` 独立拥有 child session 绑定、动作日志、乱序 tool part 缓冲与 parent permission 归属；event translator 从 1093 行降至 810 行
  - `opencode/permission-translator.ts` 独立拥有 permission/question 规范化、命令/cwd 提取与共享 permission contract 映射；`event-values.ts` 提供窄 payload 解析原语，MCP controller 不再依赖 translator；event translator 降至 597 行
  - `opencode/message-translator.ts` 独立拥有 message/part/delta、structured output、stream dedupe、usage/context 与 tool/compaction 映射；event translator 降至 226 行兼容路由 façade
  - `ClaudePermissionController` 独立拥有 SDK `canUseTool`、pending request map、abort cleanup、question/plan/tool resolution 与 close rejection；Claude Session 从 3001 行降至 2799 行
  - `ClaudeOptionsBuilder` 独立拥有 SDK env overlays、Model Gateway override、thinking/ultracode、fast settings、MCP/system prompt、session binding 与 credential-safe options summary；Claude Session 降至 2391 行
  - `ClaudeSessionHistory` 独立拥有 transcript path/load/JSONL ingest、单次 replay、rewind candidate 与 live/history block mapping；Claude Session 降至 2099 行
  - `ClaudeMessageTranslator` 独立拥有 SDK system/user/assistant/stream/result 翻译、task notification、compaction、用户去重、usage 累积与 missing-resume 识别；Claude Session 降至 1712 行
  - `ClaudeRewindController` 独立拥有 user-message 索引、turn anchor、`/rewind` 解析、checkpoint 候选回退与结果文案；Claude Session 降至 1462 行
  - `ClaudeQueryLifecycle` 独立拥有 query/input、restart、pump 单实例、interrupt/return 超时收敛、close 与 stderr 诊断；Claude Session 降至 1225 行
  - `ClaudeSessionIdentityController` 独立拥有 session identity、fresh/rebind、persistence、query/runtime model 与 runtime-info cache；修复 SDK session、mode 与 default model 切换后的陈旧诊断，Claude Session 降至 1057 行
  - `ClaudeForegroundTurnController` 独立拥有 prompt/附件转换、foreground turn 启动/取消、autonomous turn 收口、`/rewind` 与 close reset；Claude Session 降至 873 行，Claude 核心拆分完成
  - `ACPSessionUpdateController` 独立拥有 message assembly、tool snapshots、user echo suppression、plan/tool timeline、available commands 路由与 running tool 取消态合成；mode/config/session-info 通过回调保留在 Session，私有 `translateSessionUpdate` 继续作为兼容委托；wrapper smoke 改用 tool timeline 统计。ACP 主文件从 1866 降至 1752 行
  - `PiExtensionHistoryController` 独立拥有 captured entry/index、pending user-message 对齐、entry/tree extension 命令、marker 解析、结果 timeout 与 close/process-exit rejection；命令 prompt 失败时仅撤销未被等待的 pending result，避免额外 unhandled rejection。Pi 主文件从 1613 降至 1423 行
  - `PiSessionEventController` 独立拥有 active turn、tool snapshot、extension UI pending、ask_user optional comment/freeform follow-up、runtime event routing、process-exit failure 与 turn completion；Session 仅通过窄接口启动/结束 turn、查询 permissions 和接收事件。Pi 主文件从 1423 降至 1110 行
  - 未接线的 `providers/base/` speculative 基类已删除；复核确认其默认生命周期语义不适合直接套用到 Codex/Claude/OpenCode
- **状态**：进行中；三个 provider 均已建立稳定 façade/client/session 边界，OpenCode 主事件路由完成收敛；Claude permission/options/history/rewind/query lifecycle 与 Pi extension history/session events 已独立。下一步收敛 ACP 剩余 config/turn/lifecycle 编排、Pi runtime/session lifecycle 和 Claude identity/runtime orchestration。

---

## 归档批次（2026-06-28）

以下为已归档的执行记录摘要，详细见 [archive/comprehensive-improvement-roadmap-2026-06-28.md](archive/comprehensive-improvement-roadmap-2026-06-28.md)。

---

## 最终评分

| 维度       |     起始 |     最终 |     提升 |
| :--------- | -------: | -------: | -------: |
| 代码质量   |      7.0 |      8.5 |     +1.5 |
| 测试体系   |      7.0 |      8.0 |     +1.0 |
| 安全设计   |      8.0 |      8.5 |     +0.5 |
| 文档质量   |      8.0 |      8.5 |     +0.5 |
| 开发者体验 |      7.0 |      7.5 |     +0.5 |
| 架构设计   |      9.0 |      9.3 |     +0.3 |
| **综合**   | **~7.5** | **~8.5** | **+1.0** |

---

## 核心成果

### 架构改进

- **session.ts 拆分** — 9728 → ~2.8k 行 (-71%)，god-file 彻底瓦解
- **SessionContext 领域拆分** — 8 个领域子接口，7 个 handler 使用精确 `Pick<T>` 交叉类型
- **辅助模块提取** — `workspace-core.ts` (233 行) · `agent-session-helpers.ts` (400 行)

### 测试质量

- **消除固定等待** — 4 轮提交覆盖 19 个文件，~90 处 `setTimeout`/`sleep` → `vi.waitFor` / 事件驱动
- **覆盖率基线** — v8 provider，thresholds 设定（branches 30% / functions 35% / lines 40% / statements 40%）
- **依赖审计** — `.dependency-cruiser.js`，5 条禁止规则，0 violations（743 模块 · 1777 依赖）

### 开发者体验

- **Windows DX** — `dev.ps1` 端口冲突自动退避 (6767–6776) · `setup-dev.ps1` 一键设置

### 安全

- Electron 四层防御 · E2E 加密 relay · CI 安全扫描 · AppImage 沙箱决策文档化

---

## 路线图决策

以下 P1/P2 任务经评估后决定不予推进：

| 任务             | 理由                                           |
| ---------------- | ---------------------------------------------- |
| handler E2E 测试 | 已有 session.test.ts 和 dispatch-seam 间接覆盖 |
| vi.mock 替换     | 现有用法稳定，替换仅为哲学一致性               |
| Windows portless | 需上游工具支持，端口退避方案已满足需求         |
| 事件驱动解耦     | checkout→workspace 直接调用零 bug 零性能问题   |

边际收益不足以支撑投入。按现状归档。

---

## 后续维护

新改进点通过 Issue 或 PR 跟踪，不再维护统一路线图。

归档后完成的独立改进（例如 Android 端专项优化）不回填为路线图任务，也不重新打开本路线图；相关背景、验收结果与后续事项以对应 Issue、PR 或提交记录为准。

---

_最后更新 2026-06-28 · 版本 v2.0 — 已归档_
