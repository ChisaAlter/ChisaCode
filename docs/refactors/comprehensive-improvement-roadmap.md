# ChisaCode 综合改进路线图

> **状态：活跃维护**（2026-07-04 重启）
>
> 历史执行记录见 [archive/comprehensive-improvement-roadmap-2026-06-28.md](archive/comprehensive-improvement-roadmap-2026-06-28.md)。
> 归档后新增的系统性改进在此登记，作为单一事实源。

---

## 进行中

### 架构/依赖安全/本地质量提升目标（2026-07-12 启动）

- **目标**：继续拆解 client/provider/workspace 超大责任中心；完成 AI SDK、Claude SDK 与 Expo/EAS major migration；以聚焦本地验证维持可信质量基线，GitHub Actions 仅作为显式发布门禁。Expo 55/56/57 本地迁移已落地，EAS 云端解析留到具备 Expo 登录的显式发布阶段。
- **执行顺序**：先清理确定性 CI 失败，再迁移高风险依赖，最后按领域拆分大文件；每批独立本地验证和提交，普通开发不再推送触发远端 CI。
- **已完成批次**：修复 workspace authority 稳定错误契约、draft `runtimeProvider` 快照、Generative UI manager queue 兼容测试、异步进程终止断言、ACP cwd 隔离测试、POSIX terminal `vi.waitFor` 误用、CLI 脚本/Vitest 分类、Wrangler 公开入口解析及 Windows `npx.cmd` 启动。
- **App/链路 CI 收敛**：E2E daemon 改为仅监听 `127.0.0.1`，满足无密码 loopback 安全约束；补齐 Vitest 的 `matchMedia`、Unistyles、safe-area、toast 与平台测试边界，修复 i18n 实例缺失、Aemeath 英文资源、Projects 空状态硬编码、provider icon/turn footer/高度缓存过期契约。20 个目标文件 152 个断言通过，`moduleMock` 审计从基线 303 降至 302。
- **CLI CI 收敛**：错误断言改为机器可读 `CONFLICTING_MODEL_OPTIONS` 或显式语言，避免默认中文下依赖英文文案；CLI 测试 helper 改为无 shell 的 Node 直启，移除 Windows WSL/zx 与 `cmd -> npx -> tsx` 生命周期偶合；readiness probe 增加进程退出诊断。开发态 mock provider 支持按基础 JSON Schema 生成确定性 structured output，真实 daemon E2E 不再依赖 CI 机器的 Claude/Codex/OpenCode 登录态。
- **Server/Android CI 收敛**：Android runtime module 补齐 Maven/Gradle version metadata，真实 `:chisacode-android-runtime:tasks` 配置成功；wildcard daemon E2E 保留 `0.0.0.0` 安全意图并统一使用 bcrypt 密码夹具，不启用无认证逃生开关；provider live-preferences 改用与 fake runtime 一致的稳定模型对。
- **认证/MCP 生命周期修复**：WebSocket 密码校验期间暂存并按序重放早到的 hello，修复 bcrypt 异步窗口丢消息导致的永久连接等待；预认证缓冲限制为 4 条/64 KiB，超限按 1008 关闭，避免未认证内存放大。MCP E2E 改用正式 `settings.modeId` 契约并断言运行态模式，后台 agent 的同步 `startTurn` 失败不再被吞成成功；worktree setup/terminal 探针改为跨平台 Node 命令并显式释放终端资源。
- **GitHub Actions 策略**：普通 branch push、PR 和 merge queue 不再自动触发 Actions；CI、Relay、Nix、Nix hash、release notes 改为手动触发，只有显式授权发布时运行。桌面/Android/App 构建仅保留版本 tag 触发；Dependabot 定时更新已关闭。后续优化默认只做本地提交。
- **AI SDK/MCP 迁移**：完成。server 已移除 `ai@5`，改用独立 `@ai-sdk/mcp@2.0.10` 的正式 `createMCPClient` / `callTool(arguments)` API；同步收紧 Zod peer 下限与 Node.js 22 运行时基线。server typecheck、目标 lint 与 MCP 精确场景通过；生产依赖审计中的 AI SDK 通告清零。
- **Claude SDK/Zod 4 安全迁移**：完成。OpenAI SDK 先独立升级到 6.46.0；随后将 protocol/client/app/desktop/server 的直接 Zod 依赖统一到 4.3.6，既有 schema 暂经官方 `zod/v3` 兼容入口保持解析语义，Claude Agent SDK 升至修复版 0.2.141，Anthropic SDK 升至 0.93.0，MCP SDK 下限对齐 1.29.0。严格 npm peer 解析与 `npm ls` 均通过；生产审计从 26 降至 24，Claude/Anthropic 通告清零且维持 0 high/0 critical。protocol/client/server build、六个消费包 typecheck、88 个改动文件 lint 与 148 个聚焦断言通过。
- **兼容型生产依赖安全补丁**：完成。将生产路径中的 `ajv`、`brace-expansion`、`js-yaml`、`postcss` 与 `tar` 提升到兼容修复版，并使用 npm 10.9.4 生成可 clean-install 的跨平台 lockfile。生产审计从 24 降至 19，五类通告清零，继续保持 0 high/0 critical；剩余项集中在 Expo/EAS framework major（含 `xcode` 嵌套 `uuid`）以及暂无 Babel 7 修复版的低危通告。
- **Server UUID 运行时依赖移除**：完成。11 个 server 生产文件统一改用 Node.js 22+ 的 `node:crypto.randomUUID()`，删除直接 `uuid` 与 `@types/uuid` 依赖。生产审计仍为 19 且 0 high/0 critical，因为残余 `uuid` 通告只位于 `@expo/config-plugins -> xcode@3.0.1 -> uuid@7.0.3`；该原生生成链留给 Expo framework major，不做破坏性 override。server typecheck、11 个目标文件 lint、4 个 client message ID 精确断言与 npm 10.9.4 clean-install dry-run 通过。
- **Expo SDK 55 迁移**：完成第一阶段 framework major。App 从 Expo 54 / RN 0.81 / React 19.1 升至 Expo 55.0.27 / RN 0.83.6 / React 19.2.0，全套 Expo 模块、Router、Reanimated、Worklets 与自研 `expo-two-way-audio` 对齐；删除 App 对 `expo-modules-core` 和本地 `eas-cli` 的直接依赖，补齐 `@types/react-dom` 与 renderer 锁步。Gesture Handler 补丁迁移到 2.30.1；Android runtime 移除对 `:expo` 的反向依赖，解除 Expo 55 Gradle 循环。`expo install --check`、Expo Doctor 19/19、依赖树、App/音频模块 typecheck/build、目标 lint、Android prebuild、两个自定义模块及 App `compileDebugKotlin` 均通过。生产审计从 19 降至 11，保持 0 high/0 critical；剩余 11 项仍集中在 Expo CLI/config/prebuild 的 `xcode -> uuid` 工具链。
- **Expo SDK 56 迁移**：完成第二阶段 framework major。App 升至 Expo 56.0.15 / RN 0.85.3 / React 19.2.3，Router 56.2.14、Reanimated 4.3.1、Worklets 0.8.3、Gesture Handler 2.31.2 与本地音频模块同步对齐，并启用 TypeScript 6.0.3。删除 App 对 `@react-navigation/native` 的直接依赖，导航 hooks 统一走 Expo Router；RN 0.85 的原生样式调用迁移到 `StyleSheet.absoluteFill`，音频 hook 使用 type-only event map import。`expo install --check`、Expo Doctor 21/21、依赖栈 build、App typecheck、17 个目标文件 lint、3 个导航相关测试文件 13 个断言、Android clean prebuild、两个自定义模块及 App `compileDebugKotlin` 均通过。生产审计为 12 moderate、0 high、0 critical；残余项仍局限于 Expo CLI/config/prebuild 工具链，下一步进入 Expo 57/EAS。
- **Expo SDK 57 / Bundle Mode 迁移**：完成第三阶段 framework major。App 升至 Expo 57.0.4 / RN 0.86.0 / React 19.2.3，Router 57.0.4、Reanimated 4.5.0、Worklets 0.10.0、Gesture Handler 2.32.0 与本地音频模块同步对齐。针对 Hermes V1 + Reanimated 内存回归启用官方 Worklets Bundle Mode，并接入 Metro/Metro Runtime 0.84.4 官方补丁；既有自定义 Metro overlay/resolver 继续保留，Gesture Handler web pointer-capture 补丁迁移到 2.32.0。npm 10 锁文件、四个 postinstall 补丁、`expo install --check`、Expo Doctor 20/20、App 依赖栈 build/typecheck、目标 lint/format、Android clean prebuild、两个自定义模块及 App `compileDebugKotlin`、Android Hermes bundle export 均通过。生产审计仍为 12 moderate、0 high、0 critical，残余项继续局限于 Expo CLI/config/prebuild 的 `xcode -> uuid`；EAS 20.5.1 云端 config 解析因本机无 Expo 登录而留到发布阶段。
- **Daemon diagnostics 产品能力贯通**：完成。既有 `diagnostics.request/response` 从仅协议 schema 补齐为 server/client/CLI/MCP/App 纵向能力；daemon 报告聚合运行时、非敏感配置、Agent 生命周期计数与 Provider 状态，默认不含日志，显式请求最多 200 行。新增统一凭据、Bearer、URL 凭据、命令参数与用户目录脱敏；MCP `get_diagnostics` 固定禁止日志，CLI 提供 `daemon diagnostics [--logs] [--log-lines]`，App 设置页可显式选择日志后生成并复制。protocol/client build、四个消费包 typecheck、26 个目标文件 lint、16 个聚焦断言与 CLI help 入口通过。
- **AgentManager observer/event bus 拆分**：完成。新增 `agent-manager-event-bus.ts`，独立拥有 subscriber 注册/取消、state replay、按 agentId 路由、internal agent 全局可见性过滤，以及同步抛错和异步 rejection 隔离；`AgentManager.subscribe()` 与内部 dispatch 保持薄 façade。修复单个 subscriber 抛错会中断后续 subscriber、导致 turn 事件链等待超时的可靠性缺陷，并把原本名为“error isolation”却未真实抛错的测试改为有效回归契约。核心文件从约 3971 行降至 3913 行；server typecheck、3 个目标文件 lint 与 4 个 subscribe 聚焦场景通过。
- **AgentManager timeline authority 拆分**：完成。新增 `agent-timeline-controller.ts`，独立拥有内存/durable timeline 初始化与 seed、append 持久化调度、查询/epoch、删除/reset 及最后消息合并；`AgentManager` 仅保留公开 façade 和事件接线。修复 live 行已提交 durable 时最后助手文本重复拼接（如 `hellohello`）的真实缺陷，并保留非助手事件边界；durable 前缀改用有界反向分页，避免长会话整表读取。核心文件从 3913 行降至 3745 行；server typecheck、3 个目标文件 lint 与 5 个 timeline 聚焦场景通过。
- **AgentManager provider authority 拆分**：完成。新增 `agent-provider-controller.ts`，独立拥有 provider client 注册、enabled/derived 状态、availability、importable persistence discovery、draft command/feature 探测、可用 client 选择与 native session archive；`AgentManager` 保留配置归一化和公开 façade，所有 provider map 直接访问均已移除。错误文案、runtime provider 选择、draft session 清理和 best-effort 日志语义保持兼容。核心文件从 3745 行降至 3522 行；server typecheck、2 个目标文件 lint 与 18 个 provider registry/availability/import 聚焦场景通过。
- **AgentManager launch config / MCP credential authority 拆分**：完成。新增 `agent-launch-config-controller.ts`，独立拥有 cwd/model/mode 归一化、runtime provider 投影、launch env、daemon MCP/skills policy/system prompt 注入及 companion token 生命周期；create/resume/reload 统一走同一配置编排。修复 MCP base URL 禁用或轮换后旧 companion token 仍有效的安全缺陷，并在签发与验证时清理过期 token，避免从未连接的 companion 凭据长期积累。核心文件从 3522 行降至 3316 行；server typecheck、3 个目标文件 lint、11 个配置/MCP 聚焦单测与 1 个真实 daemon MCP 开关 E2E 通过。
- **AgentManager archive authority 拆分**：完成。新增 `agent-archive-controller.ts`，独立拥有 live/stored soft-delete、subagent/team-slot 级联策略、原生 provider session best-effort 归档、stored-agent closed-state 投影、unarchive by id/handle 与 archived callback 隔离；`AgentManager` 仅保留 UUID 校验、公开 façade 和 close/state/persistence 依赖注入。核心文件从 3316 行降至 3118 行，新 controller 为 262 行；server typecheck、2 个目标文件 lint 与 11 个 archive snapshot/cascade/runtime/notification/failure 聚焦场景通过。
- **AgentManager metadata / attention authority 拆分**：完成。新增 `agent-metadata-controller.ts`，独立拥有显式/生成标题、标签 merge、live/stored metadata 更新、attention 清理、initial snapshot title 竞态保护与单调 `updatedAt`；`AgentManager` 保留公开 façade，并通过单行 timestamp 代理供其余生命周期路径复用同一 authority。核心文件从 3118 行降至 3043 行，新 controller 为 141 行；server typecheck、2 个目标文件 lint 与 9 个 title/labels/live-stored metadata/attention 聚焦场景通过。
- **AgentManager runtime configuration authority 拆分**：完成。新增 `agent-runtime-configuration-controller.ts`，独立拥有 live mode/model/thinking/feature 更新、runtime provider 切换、provider model catalog 校验、session reload 分流与 runtimeInfo/config 同步；model/thinking 非空 ID 保留原始值，只有 runtime provider 做 trim，兼容既有输入契约。`AgentManager` 仅保留 active-agent 校验与公开 façade。核心文件从 3043 行降至 2965 行，新 controller 为 127 行；server typecheck、2 个目标文件 lint 与 5 个 mode/model/runtime-provider 聚焦场景通过。
- **AgentManager session rescue / deadline authority 拆分**：完成。新增 `agent-session-rescue-controller.ts`，独立拥有 reload 旧 session close 与 cancel provider interrupt 的 bounded race、可配置 timeout、late rejection 隔离和日志分级；foreground cancellation event propagation 继续保留独立的 2 秒 deadline，避免将 provider 调用预算与状态机传播预算误绑定。`AgentManager` 只保留两个调用点和公开 timeout options 类型重导出。核心文件从 2965 行降至 2873 行，新 controller 为 111 行；server typecheck、2 个目标文件 lint 与 3 个 reload-close/interrupt/autonomous-cancel 聚焦场景通过。
- **AgentManager wait authority 拆分**：完成。新增 `agent-wait-controller.ts`，统一拥有 `waitForAgentRunStart` 与 `waitForAgentEvent` 的 pending-run 判定、busy/terminal 状态机、permission 短路、last assistant message 聚合、AbortError 传播和订阅清理；controller 仅获得 agent/pending-run 只读快照、订阅与消息查询端口，不能修改生命周期。公开 options/result 类型继续由 `agent-manager.ts` 兼容重导出。核心文件从 2873 行降至 2599 行，新 controller 为 311 行；server typecheck、2 个目标文件 lint 与 5 个 pending-start/foreground-finalize/replacement/stale-terminal/autonomous-wait 聚焦场景通过。
- **AgentManager foreground execution authority 拆分**：完成。新增 `agent-foreground-execution-controller.ts`，独立拥有 active-run 拒绝、foreground turn 启动、pending-run/waiter 生命周期、start failure 分发、terminal stream 转发、终态 finalize、persistence handle 刷新与 terminal 后 runtime info 刷新；`replaceAgentRun` 和 Generative UI queue 继续留在 manager 做跨领域编排，follow-up 启动统一复用 controller。核心文件从 2599 行降至 2461 行，新 controller 为 189 行；server typecheck、2 个目标文件 lint 与 12 个 start failure/finalize/replacement/runtime/Generative UI 聚焦场景通过。
- **AgentManager run control authority 拆分**：完成。新增 `agent-run-control-controller.ts`，独立拥有 replacement busy 状态、cancel/replace 编排、provider interrupt、foreground terminal 传播总预算、stale turn synthetic cancel、pending-run 收口与遗留 permission deny 清理；manager 的 `replaceAgentRun` / `cancelAgentRun` 保持公开薄 façade，session rescue 与 foreground execution 继续作为窄端口注入。核心文件从 2461 行降至 2341 行，新 controller 为 198 行；server typecheck、2 个目标文件 lint 与 5 个 interrupt timeout/replacement gap/stale terminal/autonomous cancel/forced cancel 聚焦场景通过。
- **AgentManager permission authority 拆分**：完成。新增 `agent-permission-controller.ts`，统一拥有 pending/in-flight/buffered permission 状态、provider response、session event tail 竞态收口、状态刷新与持久化、request/resolution 事件、attention 通知、终态批量 deny 及 interrupt cleanup；run control 改为调用 permission 窄端口，不再直接修改权限状态。核心文件从 2341 行降至 2272 行，新 controller 为 156 行，run control 从 198 行降至 176 行；server typecheck、3 个目标文件 lint、4 个 permission response/事件顺序场景与 5 个 cancel/replace 回归场景通过。
- **AgentManager provider history / rewind authority 拆分**：完成。新增 `agent-history-controller.ts`，统一拥有普通/强制 provider history hydration、system envelope 过滤、coalescer 清空、durable/memory timeline epoch 替换与广播，以及 rewind 的 active-run cancel、pending-run lock、runtime refresh 和 persistence；普通 hydration 保留 provider 流失败前已追加的历史前缀，强制 hydration 继续在完整读取后才替换现有 timeline。核心文件从 2272 行降至 2183 行，新 controller 为 152 行；server typecheck、2 个目标文件 lint 与 12 个 hydration/coalescing/rewind 聚焦场景通过。
- **AgentManager session teardown authority 拆分**：完成。新增 `agent-session-teardown-controller.ts`，统一拥有用户 close 与 reload session swap 的 coalescer、agent registry、session subscription、foreground waiter/pending-run 和旧 session 资源释放；close 路径继续向 waiter 投递 canceled、删除 previous status 并只持久化一次 closed snapshot，reload 路径继续保留 status、静默 settle waiter 并通过 session rescue 的 bounded close 回收旧 session。核心文件从 2183 行降至 2140 行，新 controller 为 95 行；server typecheck、2 个目标文件 lint 与 4 个 close/reload 聚焦场景通过。
- **AgentManager session registration authority 拆分**：完成。新增 `agent-session-registration-controller.ts`，统一拥有 active agent 初始对象、timeline seed、持久化标题来源、initializing/idle 双阶段 snapshot、runtime/session state 刷新和 session event subscription，create/resume/reload 只保留 provider 启动策略。修复 `agentsAwaitingInitialSnapshotPersist` 从未启用导致 runtimeInfo state 的后台无标题 snapshot 可能晚到覆盖 initial prompt title 的真实竞态：registration 现在在首 snapshot 前后维护 guard，`emitState` 在 guard 期间仅广播不排队后台持久化。核心文件从 2140 行降至 2013 行，新 controller 为 200 行；server typecheck、3 个目标文件 lint 与 10 个 create/resume/reload/initial-title-race 聚焦场景通过。
- **AgentManager session lifecycle authority 拆分**：完成。新增 `agent-session-lifecycle-controller.ts`，统一拥有 create/resume/reload 的 agent id、provider enable/availability、daemon launch config/context、persisted metadata merge、resume override、runtimeProvider fresh-session 分流、reload active-run cancel、state preservation 与 rehydrate timeline 编排；registration、teardown、run control、provider 和 launch config 均作为既有窄 authority 复用。`AgentManager` 三个公开方法保持原参数契约并改为薄 façade。核心文件从 2013 行降至 1887 行，新 controller 为 231 行；server typecheck、2 个目标文件 lint 与 20 个 provider launch/create/resume/reload 聚焦场景通过。
- **AgentManager session state authority 拆分**：完成。新增 `agent-session-state-controller.ts`，统一拥有 available/current mode、features、pending permission refresh、runtimeInfo/persistence handle 同步，以及 thread/usage/mode/model/thinking provider 事件投影；manager 事件分支只保留路由和 stream suppression，registration、permission response、foreground completion 与 history rewind 统一调用同一 refresh authority。运行态配置的主动写入继续由 `agent-runtime-configuration-controller.ts` 独立负责。核心文件从 1887 行降至 1810 行，新 controller 为 140 行；server typecheck、2 个目标文件 lint 与 7 个 runtime/config/thread/permission refresh 聚焦场景通过。
- **AgentManager turn event authority 拆分**：完成。新增 `agent-turn-event-controller.ts`，统一拥有 turn started/completed/failed/canceled 的 lifecycle/lastError/lastUsage 投影、usage event 后台写入、runtime refresh、terminal permission deny，以及 provider code/diagnostic 系统错误 timeline 的格式化、去重和广播；history replay 继续禁止 usage 与错误消息副作用，replacement/foreground 生命周期继续由既有 authority 收口。`runAgent` 复用同一 failure formatter，manager 只保留事件归属识别和路由。核心文件从 1810 行降至 1610 行，新 controller 为 231 行；server typecheck、2 个目标文件 lint 与 11 个 start/completion/failure/cancel/attention/Generative UI 聚焦场景通过。
- **AgentManager timeline event authority 拆分**：完成。新增 `agent-timeline-event-controller.ts`，统一拥有 system-injected user message 过滤、history timeline 仅落库语义、live/coalesced timeline 的 canonical row 持久化与 seq/epoch/timestamp 广播，以及 coalescer flush 后的 foreground waiter 通知；user message timestamp/state 更新也收口到同一 authority。manager 只保留事件类型路由，公开 append 与 out-of-band timeline 路径继续复用既有 `recordTimeline` façade。核心文件从 1610 行降至 1541 行，新 controller 为 114 行；server typecheck、2 个目标文件 lint 与 10 个 canonical row/system envelope/coalescing/history/foreground waiter 聚焦场景通过。
- **AgentManager session event pipeline authority 拆分**：完成。新增 `agent-session-event-pipeline-controller.ts`，统一拥有 per-agent session event 串行 tail、队列错误隔离、coalescer intake/flush、session-state/permission/timeline/turn 领域路由、foreground terminal finalize、waiter 快照与通知、无 waiter terminal 的 Generative UI 收口，以及完整 trace；`respondToPermission` 的 event-tail race 现在通过 controller 窄查询保持原时序。registration、foreground execution 与 run control 只保留委托回调，manager 不再直接拥有 provider event 状态机。核心文件从 1541 行降至 1269 行，新 controller 为 328 行；server typecheck、2 个目标文件 lint 与 19 个 config/autonomous/foreground/failure/permission/replacement/Generative UI/coalescing 聚焦场景通过。
- **Protocol agent extension 消息域拆分**：完成。将 Skills 与 MCP server 管理配置、scope、payload、8 个 inbound 和 8 个 outbound schema 提取到 `agent/extensions.ts`，总 union 改为只读 tuple 聚合；旧 `messages` 入口继续兼容重导出，并新增 `@chisacode/protocol/agent/extensions` 显式子路径。主文件从 2860 降至 2436 行；protocol build/typecheck、3 个目标文件 lint、18 个聚焦断言、子路径运行时导入与五个消费者 typecheck 通过。
- **Protocol daemon 消息域拆分**：完成。将 daemon status/pairing、mutable config、project config、restart/shutdown 的 8 个 inbound、6 个 outbound 与 3 个 status payload 提取到 `daemon/messages.ts`，总 union/status union 均改为只读 tuple 聚合；旧 `messages` 入口继续兼容重导出，并新增 `@chisacode/protocol/daemon/messages` 显式子路径。主文件从 2436 降至 2164 行；protocol build/typecheck、3 个目标文件 lint、32 个聚焦断言、子路径运行时导入与五个消费者 typecheck 通过。
- **Protocol usage 消息域拆分**：完成。将本地用量汇总、导出、清理的 3 个 inbound、3 个 outbound schema、默认值与 payload/type 所有权提取到 `usage/messages.ts`；总 union 改为只读 tuple 聚合，旧 `messages` 入口继续兼容重导出，并新增 `@chisacode/protocol/usage/messages` 显式子路径。主文件从 2164 降至 2073 行；protocol build/typecheck、4 个目标文件 lint、44 个聚焦断言、子路径运行时导入与五个消费者 typecheck 通过。
- **Protocol voice/dictation 消息域拆分**：完成。将 voice mode/audio、dictation stream 的 7 个 inbound、9 个 outbound schema、server voice capability 与消息类型提取到 `voice/messages.ts`；总 union 改为只读 tuple 聚合，旧 `messages` 入口继续兼容重导出，并新增 `@chisacode/protocol/voice/messages` 显式子路径。通用 `abort_request` 仍由主会话控制拥有，避免把 chat wait/agent abort 语义误归入 voice。主文件从 2073 降至 1895 行；protocol build/typecheck、4 个目标文件 lint、45 个聚焦断言、子路径运行时导入与五个消费者 typecheck 通过。
- **Protocol agent state 契约拆分**：完成。将 agent status/capability、permission、tool/timeline、stream event、snapshot/list payload 与 relation schema 提取到 `agent/state.ts`，建立 state 契约到 provider/workspace 基础 schema 的单向依赖；旧 `messages` 入口继续兼容重导出，并新增 `@chisacode/protocol/agent/state` 显式子路径。主文件从 1895 降至 1449 行；protocol build/typecheck、4 个目标文件 lint、4 个相关测试文件 59 个断言、七个旧 schema 运行时同一性与五个消费者 typecheck 通过。
- **Protocol agent 消息域拆分**：完成。将 agent lifecycle/config/interaction 的 23 个 inbound、23 个 outbound 与 4 个 lifecycle status payload 提取到 `agent/messages.ts`，总 union/status union 改为只读 tuple 聚合；旧 `messages` 入口继续兼容重导出，并新增 `@chisacode/protocol/agent/messages` 显式子路径。通用 `abort_request`、跨 agent/terminal 的 `close_items_*`、`project.rename.*`、`model_gateway.moa.test.*` 与 session heartbeat/ping/push 控制继续由主聚合域拥有；legacy `send_agent_message` 保持可导入但不误加入 correlated inbound union。主文件从 1449 降至 721 行；protocol build/typecheck、4 个目标文件 lint、6 个聚焦测试文件 66 个断言、子路径运行时导入与五个消费者 typecheck 通过。
- **App workspace 移动端导航拆分**：完成首个工作台切片。将 mobile tab switcher、presentation fallback、tab menu 与局部样式提取到 `workspace-mobile-tab-switcher.tsx`，主屏仅保留导航数据与命令回调接线，从 5453 降至 4926 行。App typecheck、2 个目标文件 lint 与 15 个 tab menu/layout 聚焦断言通过；本批未声称 native mobile 运行态验证。
- **App workspace 命令路由拆分**：完成。新增 `use-workspace-keyboard-actions.ts`，独立拥有 tab、pane、dock、sidebar 与 command-center 五组 action 注册和路由，并通过 `useStableEvent` 保持 handler 引用稳定；主屏只注入现有 tab/pane/dock 业务回调，不改变持久化格式或 UI。`workspace-screen.tsx` 从 4926 降至 4657 行；App typecheck 与 2 个目标文件 lint 通过，下一步转向 layout/setup persistence 与 hydration 编排。
- **App workspace persistence/hydration 拆分**：完成。新增 `use-workspace-persistence-hydration.ts`，统一拥有 layout tab snapshot reconcile、setup status cache 恢复、空工作区 draft seed 与 setup tab auto-open 四段 effect；主屏只传 agent/terminal/tab 快照和既有 open-tab 回调，Zustand storage schema 与时序保持不变。新 hook 为 268 行，`workspace-screen.tsx` 从 4657 降至 4451 行；App typecheck 与 2 个目标文件 lint 通过。
- **App workspace tab open actions 拆分**：完成。新增 `use-workspace-tab-open-actions.ts`，统一拥有 draft 前台/后台创建、tab focus、imported agent、explorer/chat 文件、side-pane placement、Electron browser、mobile switcher 与 split 后 draft 创建共 12 个 open/create/navigation 回调；主屏继续保留 dock command 仍消费的 browser factory。新 hook 为 300 行，`workspace-screen.tsx` 从 4451 降至 4270 行；App typecheck 与 2 个目标文件 lint 通过，下一步转向 tab close/bulk-close lifecycle。
- **App workspace tab close actions 拆分**：完成。新增 `use-workspace-tab-close-actions.ts`，统一拥有 pending close 防重、terminal 确认/缓存移除/异步 kill、agent 仅关闭 tab、browser partition cleanup、通用 auto-open suppression，以及批量关闭确认和 left/right/other 选择；既有 `workspace-bulk-close.ts` 继续保留纯分类与执行逻辑。新 hook 为 404 行，`workspace-screen.tsx` 从 4270 降至 3970 行；App typecheck、2 个目标文件 lint 与 2 个关闭测试文件 7 个断言通过，下一步评估 pane move/reorder 与 dock orchestration。
- **App workspace pane/dock actions 拆分**：完成。新增 `use-workspace-dock-actions.ts`，独立拥有 dock state transition、browser/terminal/diff/PR placement 路由与 Electron browser gate；新增 `use-workspace-pane-layout-actions.ts`，独立拥有共享 focus suppression ref 和 focus/split/move/resize/reorder 持久化代理。`moveTabToDock` 继续保持既有显式 no-op，不在结构拆分中猜测产品语义。两个 hook 分别为 218/97 行，`workspace-screen.tsx` 从 3970 降至 3809 行；App typecheck、3 个目标文件 lint 与 dock model 18 个断言通过，下一步评估 pane content-model callbacks 与 environment-panel state orchestration。
- **App workspace pane content models 拆分**：完成。新增 `use-workspace-pane-content-models.ts`，统一拥有 child-tab open、current-tab close/retarget、workspace file side/current disposition、desktop focus-before-open、稳定 tab descriptor cache，以及 focused pane 的 3-tab LRU mounted retention；移动端/桌面 content model adapter 共享同一 builder。新 hook 为 213 行，`workspace-screen.tsx` 从 3809 降至 3703 行；App typecheck、2 个目标文件 lint 与 pane-content 2 个断言通过，下一步转向 environment-panel visibility/state orchestration。
- **App workspace environment panel state 拆分**：完成。新增 `use-workspace-environment-panel-state.ts`，统一拥有 responsive width threshold、`auto/forced-open/forced-closed` 恢复、dock 初始状态、panel/explorer 互斥 toggle，以及 changes/files explorer 路由；300px 样式宽度继续由主屏作为单一输入，safe gap/min-content policy 留在 hook。同步移除 environment rail 未使用的 `workspaceDirectory` 假依赖。新 hook 为 151 行，`workspace-screen.tsx` 从 3703 降至 3623 行；App typecheck 与 2 个目标文件 lint 通过，下一步转向 workspace explorer/open-intent orchestration。
- **App workspace explorer/open-intent 拆分**：完成。新增 `use-workspace-explorer-actions.ts`，统一拥有 compact/desktop explorer selector、checkout identity、panel-store actions、edge-swipe gesture、a11y expanded state 与 native back；新增 `use-workspace-open-intent.ts`，统一拥有 URL 参数规范化、ready/wait/ignore 一次性消费、web history cleanup 与 native route replacement。两个 hook 分别为 106/102 行，`workspace-screen.tsx` 从 3623 降至 3505 行；App typecheck、3 个目标文件 lint 与 open-intent 9 个断言通过，下一步评估 environment data aggregation 与 screen render shell。
- **App workspace environment data aggregation 拆分**：完成。新增 `use-workspace-environment-data.ts`，统一拥有 focused agent、subagents、todo/turn stream selector、source/status 派生，以及 status strip/activity model 聚合；主屏继续保留 focused pane identity 与 archive action 编排。新 hook 为 133 行，`workspace-screen.tsx` 从 3505 降至 3423 行；App typecheck、2 个目标文件 lint 与 environment panel model 39 个断言通过，下一步评估 screen render shell。
- **App workspace environment panel view 拆分**：完成。新增 `workspace-environment-panel.tsx`，原样迁移 desktop environment rail、inspector、branch switcher、Git popover 与专用样式；主屏只保留数据和命令接线。同步删除 45 个无调用点的历史 environment 样式，视图文件为 618 行，`workspace-screen.tsx` 从 3423 降至 2592 行；App typecheck、2 个目标文件 lint 与 environment panel model 39 个断言通过，下一步评估 header/center-column render shell。
- **App workspace header view 拆分**：完成。新增 `workspace-header.tsx`，统一拥有 workspace menu、responsive title、desktop tab presentation、mobile scripts、explorer/environment toggles、静态 icon 与全部 header 专用样式；同步删除 8 个纯静态 icon 透传 props。新视图文件为 610 行，`workspace-screen.tsx` 从 2592 降至 1959 行；App typecheck 与 2 个目标文件 lint 通过。
- **App workspace center-column render shell 拆分**：完成。新增 `workspace-center-column.tsx`，统一拥有移动端 header/tab switcher、mounted tab content、桌面 split pane、environment rail 与 route gate shell；主屏只组装稳定 view model，并删除 header 拆分后遗留的无调用 tab/content 样式。新视图文件为 508 行，`workspace-screen.tsx` 从 1959 降至 1541 行；App typecheck、2 个目标文件 lint 与目标格式检查通过，未以 web 预览替代 native/desktop 运行态验证。
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
- **Client inbound message/event authority 拆分**：完成。新增 `daemon-client-inbound-controller.ts`，统一拥有 JSON/binary transport 解码、outbound schema 校验、server-info capability 状态、raw/type/event subscriber、DaemonEvent 投影、pong/inbound activity、terminal/file-transfer frame 路由与 runtime metrics 记录；`DaemonEvent`/`DaemonEventHandler` 继续从原入口兼容重导出。修复单个 daemon event subscriber 抛错会中断后续 subscriber 的可靠性缺陷，失败现在隔离并记录 event type。核心从 2330 降至 2057 行，新 controller 为 368 行；client typecheck/build、3 个目标文件 lint、3 个测试文件的 17 个 inbound/binary/validation/capability/public-export 聚焦场景通过。
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
- **依赖安全**：Vitest Browser 升至 4.1.10，Wrangler 升至 4.110.0；AI SDK、Claude SDK、Zod 4、五类兼容型生产补丁、server 直接 UUID 移除及 Expo SDK 55/56/57 迁移均已完成，生产审计当前为 12 moderate、0 high、0 critical。剩余项来自当前 Expo CLI/config/prebuild 的 `xcode` 嵌套 `uuid` 与相关工具链通告；等待上游修复，不使用破坏性 override。
- **架构证据**：dependency-cruiser 807 modules / 1888 dependencies / 0 violations。边界健康，但 4k-5k 行责任中心仍是主要扣分项。
- **状态**：完成。本地精确验证通过；普通开发不触发远端 CI，完整门禁仅在显式版本发布时运行。

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

### Server 进程树 ownership / query / deadline 编排拆分（done）

- **问题**：`packages/server/src/utils/tree-kill.ts` 原实现在同一文件中承担 Windows CIM
  ownership 查询与 CreationDate 复核、POSIX/Linux 进程身份跟踪、child-first signaling，及
  cleanup absolute deadline / cancellation 编排。Task 4 已补齐 fail-closed、snapshot churn 和
  deadline 语义，但继续在单文件内扩展会放大跨平台状态机的审查与回归成本。
- **影响范围**：`packages/server/src/utils/tree-kill.ts`、`packages/server/src/utils/spawn.ts`，以及
  server 内所有通过 `terminateWithTreeKill` 清理 provider / shell 命令树的调用点。
- **实施方案**：在不改变现有 public entry point `terminateWithTreeKill` 的前提下，提取私有
  Windows ownership/query adapter、POSIX identity tracker、以及共享 cleanup-deadline
  orchestrator；由现有入口组合这些模块并继续统一返回
  `already-exited | terminated | killed | kill-timeout`。专项迁移必须保留当前 typed operations
  tests、CreationDate/starttime signal-time identity revalidation、保守 polling 与严格 signaling
  的错误语义区分、fail-closed fallback 与单一 absolute deadline。
- **Windows adapter 进展（2026-07-14）**：新增 `tree-kill-windows.ts`，完整拥有 CIM 查询、
  CreationDate identity、launch-bound lineage 选择、PID 复用 fail-closed、signal-time identity
  revalidation 与共享 deadline 下的 query timeout；`tree-kill-command.ts` 收口可取消/有界的
  `execFile` 文本查询。原 `tree-kill.ts` 保留兼容重导出并从 1302 行降至 1021 行，21 个 Windows
  ownership/query/signaling 聚焦场景、server typecheck 与目标 lint 通过。
- **POSIX tracker 进展（2026-07-14）**：新增 `tree-kill-posix.ts`，统一拥有 Linux `/proc`
  starttime identity、generic POSIX `ps lstart` completeness、child-first ownership、process-group
  signaling、保守 survivor polling 与严格 signal authorization；Linux/POSIX 平台分支仅保留
  adapter 选择。`tree-kill.ts` 进一步从 1021 行降至 541 行，19 个 Linux/POSIX identity、
  completeness、polling 与 signaling 聚焦场景、server typecheck 和目标 lint 通过。
- **Deadline orchestrator 进展（2026-07-14）**：新增 `tree-kill-deadline.ts`，独立拥有单一 absolute
  deadline、父级 abort 传播、异步 operation race、polling wait 与 root exit wait；`tree-kill.ts`
  保留 `TREE_KILL_CLEANUP_TIMEOUT_MS` 兼容重导出和终止编排，平台 adapter 继续共享同一截止时间。
  原入口从 541 行降至 410 行，新模块为 165 行；9 个 deadline/operation race/poll/root-exit 聚焦
  场景、server typecheck 与 2 个目标文件 lint 通过。
- **状态**：done。Windows ownership/query、POSIX identity tracking 与 cleanup deadline 三个责任边界
  均已完成拆分，公开入口和 `already-exited | terminated | killed | kill-timeout` 结果契约保持不变。

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
