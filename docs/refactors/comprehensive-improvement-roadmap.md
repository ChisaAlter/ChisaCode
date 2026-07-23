# ChisaCode 综合改进路线图

> **状态：活跃维护**（2026-07-04 重启）
>
> 历史执行记录见 [archive/comprehensive-improvement-roadmap-2026-06-28.md](archive/comprehensive-improvement-roadmap-2026-06-28.md)。
> 归档后新增的系统性改进在此登记，作为单一事实源。

---

## 进行中

### 自定义模型协议 / 思考强度 / 识图副模型（2026-07-22 启动）

- **问题**：Models 设置页结构混乱；自定义模型（含 Grok）在 Codex 等 agent 下无思考强度；不存在识图副模型管线。
- **影响范围**：`packages/app` Models 设置与 Soft thinking UI、`packages/protocol` modelGateway schema、`packages/server` provider-registry materialize、send-prompt 入口 vision fallback。
- **方案**：`protocolPreset` + 按 preset 生成 agent faces；自定义模型思考档位 `off|single|levels(low/medium/high)`；运行中 thinking 控件 `length > 0` 显示；全局 `visionFallbackModel` + turn 前描述注入。
- **状态**：PR1/PR2 已落地并通过聚焦测试与 lint；PR3 识图副模型 MVP（配置 + prompt 预处理 + unit）已接好，待端到端手动验收（重存 grok 思考档位 + Codex 强度 + 非 vision 主模型附图）。

### Electron / Android 工作台视觉重构（2026-07-15 启动）

- **问题**：主题系统已经统一，但真实产品仍保留宽侧栏、大面积新工作区空态、悬浮环境卡片和宽松 Composer，和 `design/web3-themes-v2.html` 的紧凑工作台差异明显，用户无法感知实质视觉变化。
- **影响范围**：`packages/app` 的 LeftSidebar、workspace header/center column/environment panel、Composer、新工作区和设置页；Electron 与 Android 共同受影响。
- **方案**：复用现有真实状态和交互边界，把 Electron 重排为 200px 会话栏、42px 标题栏、38px 标签栏、贴底 Composer 和设计稿中的 240px 悬浮环境面板；Android 同步收紧 header、抽屉、Composer 与设置列表，不增加 iOS 工作。
- **状态**：Electron 视觉重构已通过真实 packaged app 的 1200×800 阻断式对照验收。四轮截图修复了空 workspace 路由、标题栏空隙、侧栏/header/tab/Composer 密度、消息卡片化和环境面板节奏；2026-07-16 又完成五主题全桌面页面字体/UI 尺寸收口和 Codex 风格侧栏层级重构。最终验证覆盖 5 套主题 x 21 个 Electron 可访问页面，共 105 个组合，`tinyText=0`、`lowLineHeight=0`、页面横向溢出 0、连接态运行时错误 0，`design-qa.md` 结论为 passed。2026-07-17 追加真实 packaged Electron 回归，修复顶部标签过早截断、原生窗口控制区下方分割线中断，以及会话因点击/活跃时间自动改序；现仅手动拖动会改变持久顺序。2026-07-18 修复视觉重构造成的交互回退：新对话目录/分支控件回到输入框上方并支持输入新分支，会话行恢复 hover 置顶/归档双快捷操作，项目菜单恢复置顶、资源管理器、重命名、全部已读、批量归档和移除；根因是 `1eaac3205` 在压缩侧栏时以单个三点菜单替换了既有快捷动作，后续 `f15ef6427` 又只给项目菜单接了复制路径，视觉验收没有覆盖行为保真。新增组件、排序持久化、分支意图和受信 Electron 本地路径 IPC 的聚焦测试作为防回归门禁。2026-07-22 落地 Compact Soft 代码切片（共享 RN 路径，Android 为主）：单会话隐藏 mobile tab 墙、`.m-header` 会话标题 + soft-pill 分支、Soft Home compact 紧凑居中 mini-hero 与单一水平 inset、composer 原生 elevation、抽屉 quick actions 密度微调；聚焦 Vitest/typecheck/lint 门禁，**不以 Web 代替 Android**。Android 原生视觉矩阵（真机/模拟器 + Maestro）仍待，总项继续保留在进行中。

### Reanimated 4.5 / Unistyles 样式边界修复（2026-07-15 启动）

- **问题**：Expo 57 升级后的 Reanimated 4.5 会把传入 `Animated.View` 的 Unistyles 注册哈希解析为普通样式属性，桌面端在 Agent 状态点和设置页 Switch 渲染时因哈希值为空对象直接崩溃；同类边界还存在于 Composer、终端、文件拖放、消息流与原生 shimmer。
- **影响范围**：`packages/app` 中所有 Reanimated 节点与 `react-native-unistyles` / `inlineUnistylesStyle` 的交叉使用。
- **方案**：Animated 节点只接收 React Native 静态样式、普通内联主题值和 Reanimated 动画样式；主题化内容优先下沉到普通 `View`；增加源码边界回归测试，并用真实 Electron 设置页和日志验证。
- **状态**：完成。Agent 状态点、Switch、音量计、文件拖放、Composer/终端/Agent 面板键盘动画、消息流滚动按钮、原生 shimmer 与浮动面板均已迁出冲突边界；19 个源码边界断言、Switch/Composer/message 聚焦测试、App/全仓 typecheck 与 lint、Electron renderer export、真实设置页全分区巡检及错误日志检查通过。2026-07-17 追加修复 `SyncedLoader` 的 worklet 回调访问 JS 模块变量导致的发送后崩溃，改为实例级 SharedValue 与无回调的时间对齐动画，并在真实 Electron 中完成消息发送、加载态和回复回归。

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
- **App workspace utility actions authority 拆分**：完成。新增 `use-workspace-utility-actions.ts`，统一拥有 Agent ID/resume 命令、workspace path/branch 复制，以及 reload 后携带旧 timeline cursor 触发新 epoch reset 的时序；`workspace-utility-actions.ts` 独立保留 provider-native resume command 解析与“session 不可用 / command 不可用”错误分类。`workspace-screen.tsx` 从 1541 降至 1441 行，新 hook/纯逻辑模块分别为 142/26 行；App typecheck、4 个目标文件 lint/format 与 3 个恢复命令聚焦断言通过。
- **CLI Provider 工具管理 parity**：完成。新增 `chisacode provider install/update/reinstall <provider>`，直接复用 daemon 的 provider tooling authority 与 120 秒执行预算；CLI 对 `success:false` 返回稳定 `PROVIDER_TOOLING_FAILED` 并保留 stderr/stdout/exit code，成功结果支持 human/JSON/YAML/quiet 输出。App 与 CLI 现在均可显式管理全局 provider CLI；agent-scoped MCP 继续只读，避免 agent 触发全局 npm 安装。首批 CLI typecheck、4 个目标文件 lint、2 个 runner 聚焦场景与真实 `provider --help` / `provider install --help` 入口通过。`provider ls` 进一步投影已安装/最新版本与 `install` / `update` / `current` / `unknown` / `not-checked` 下一步状态；断连或 snapshot 失败时回退 manifest 并标记 `not-checked`，不伪造版本结论。列表批次的 CLI typecheck/build、2 个目标文件 lint、2 个状态/降级聚焦场景与真实 `provider ls --help` 入口通过。
- **Provider tooling 只读状态 parity**：完成。protocol 新增统一 `resolveProviderToolingStatus`，把 daemon snapshot 的版本元数据稳定投影为 `install/update/current/unknown/not-checked`，CLI 与 MCP 不再各自复制判断。`chisacode provider ls --refresh` 可显式要求 daemon 刷新 provider 可用性和工具版本后再读取列表；MCP `list_providers` / `inspect_provider` 同步返回已安装版本、最新版本、tooling 状态与检查时间，但仍不注册 refresh/install/update/reinstall，保持 agent-scoped MCP 只读安全边界。protocol/CLI/server build、CLI/server typecheck、8 个目标文件 lint、10 个目标文件 format、CLI 3 个与 MCP 2 个聚焦场景及真实 `provider ls --help` 入口通过。
- **App message ExpandableBadge 跨平台视图拆分**：完成。新增 `expandable-badge.tsx`，统一拥有 message outer-spacing context、ToolCall/Todo 共用的 expandable row、web/native shimmer、detail wheel 传播、open-file/hover/press 状态、memo comparator 与专用样式；`message.tsx` 继续拥有 User/Assistant/Activity/Todo/ToolCall 业务组装，并通过显式 re-export 保持 `MessageOuterSpacingProvider` 调用兼容。主文件从 3271 降至 2135 行，新跨平台视图为 1168 行。App typecheck、2 个目标文件 lint/format 与 `message.test.tsx` 6 个布局/预处理契约通过；本批为结构迁移，未以 JSDOM 结果声称 desktop/native 运行态验证。
- **App sidebar PR badge 依赖环拆分**：完成。新增 `pr-badge.tsx`，独立拥有 PR 状态配色、hover/open-link 交互与专用样式；`sidebar-workspace-list.tsx` 和 `workspace-hover-card.tsx` 改为共同依赖该叶子组件，解除两者原有的双向模块依赖。sidebar 主文件从 3019 降至 2932 行，新组件为 103 行；App typecheck 与 3 个目标文件 lint 通过。
- **App sidebar 长按拖拽手势状态机拆分**：完成。新增 `use-sidebar-long-press-drag.ts`，独立拥有移动端 drag/context-menu 双计时器、scroll/swipe/drag 位移仲裁、haptic、Android status-bar anchor 修正与卸载清理；hook 仅消费 `drag()` 和最小菜单控制端口，sidebar 行视图只接线 Pressable 事件。计时器依赖由整对象收紧为稳定字段，阈值提升为模块常量；`sidebar-workspace-list.tsx` 从 2932 降至 2712 行，新 hook 为 231 行。App typecheck、2 个目标文件 lint 与 gesture arbitration 8 个聚焦断言通过。
- **App sidebar project/workspace 操作菜单拆分**：完成。新增 `sidebar-workspace-menus.tsx`，独立拥有 project settings/remove 与 workspace copy/rename/archive 菜单、状态图标、快捷键尾缀、native accessibility role 和 trigger 样式；sidebar 主视图只决定显示时机并传入既有命令回调，archive/remove 执行 authority 保持原位。`sidebar-workspace-list.tsx` 从 2712 降至 2516 行，新菜单模块为 217 行；App typecheck 与 2 个目标文件 lint 通过。
- **App sidebar workspace/project 状态展示拆分**：完成。新增 `sidebar-workspace-status-visuals.tsx`，统一拥有 workspace kind/loading/synced/needs-input leading visual、强调状态点、project icon/active-workspace 状态投影与 hover chevron；主列表继续拥有 workspace 数据、选择、排序和归档 authority，仅复用稳定的 14px leading-slot 常量。`sidebar-workspace-list.tsx` 从 2516 降至 2170 行，新展示模块为 361 行；App typecheck、2 个目标文件 lint 与 status-loader 聚焦断言通过。
- **App sidebar 普通 workspace 隐藏 authority 拆分**：完成。新增 `use-sidebar-workspace-hide.ts`，统一拥有隐藏确认、同步 in-flight 防重、host 连接检查、乐观隐藏/失败提示与 active workspace 重定向；workspace 行、目录项目行和键盘归档入口复用同一 hook，worktree 风险确认继续独立。同步删除目录项目菜单的 `Hiding...` / `Hide from sidebar` 英文硬编码，改用既有 i18n。`sidebar-workspace-list.tsx` 从 2170 降至 2070 行，新 hook 为 76 行；App typecheck、2 个目标文件 lint 与 workspace archive/navigation 11 个聚焦断言通过。
- **App diff pane 控制层拆分**：完成。新增 `diff-pane-controls.tsx`，统一拥有 diff mode menu、unified/split、ignore whitespace、wrap/scroll long lines、expand/collapse all、refresh，以及 review summary/compact Git actions；`GitDiffPane` 只保留 preference/query 状态和命令回调，diff 行渲染、虚拟化与滚动锚定未改。原有 testID、accessibility label 与移动端尺寸保持兼容。`diff-pane.tsx` 从 2808 降至 2230 行，新控制模块为 640 行；App typecheck、2 个目标文件 lint/format 与 changes preference/review summary 13 个聚焦断言通过。
- **App diff pane body shell 拆分**：完成。新增 `diff-pane-body.tsx`，独立拥有 repository checking、status/diff error、non-git/empty 状态与 mixed-height FlatList 配置，并公开稳定的 header/body row 与 layout getter 类型；`GitDiffPane` 继续计算 flat items、sticky indices、动态行高和滚动回调。既有 clipping/window 参数与 testID 保持不变。`diff-pane.tsx` 从 2230 降至 2074 行，新 body shell 为 181 行；App typecheck、2 个目标文件 lint/format 与 diff order/scroll 8 个聚焦断言通过。
- **App diff file body/line renderer 拆分**：完成。新增 `diff-file-body.tsx`，完整拥有 unified/split 行绘制、syntax token、gutter、长按/hover、inline review thread、horizontal DiffScroll、binary/too-large 状态及文件 body 尺寸上报；`diff-pane.tsx` 只保留 file header、query/preference、展开集合、mixed-height 估算和 virtual list orchestration。所有 renderer 专用样式与常量随 ownership 迁移，不建立反向依赖。主文件从 2074 降至 1036 行，新 renderer 为 1045 行；App typecheck、2 个目标文件 lint/format、diff layout/highlighter 35 个聚焦断言与 diff hygiene 通过，未以 web 结果声称 native/desktop 运行态验证。
- **App agent controls 模型 authority / 能力提示拆分**：完成。新增 `running-agent-model-controls.ts`，统一拥有运行中 agent 的 provider snapshot 选择、runtime provider 模型目录、selector 分组/过滤、loading、active model 与 thinking 选项派生，并以纯 resolver 锁定模型网关归属与 runtime 过滤契约；新增 `provider-capability-hints.tsx`，独立拥有能力徽标、tooltip、i18n、无障碍摘要、testID 与专用样式。`agent-controls/index.tsx` 只消费派生结果并从 2199 降至 1864 行，新模块分别为 192/164 行；App typecheck、4 个目标文件 lint/format、5 个聚焦测试文件 34 个断言与 diff hygiene 通过，未声称 desktop/native 视觉运行态验证。
- **App agent controls feature renderer / 共享样式拆分**：完成。新增 `feature-controls.tsx`，独立拥有 desktop/sheet toggle 与 select renderer、图标/高亮、dropdown、tooltip、i18n、无障碍标签和稳定 testID；`feature-control-model.ts` 以无 UI 依赖的纯模型统一 selector 与选中标签回退，`agent-control-styles.ts` 收口主控件与 feature renderer 共用的稳定尺寸/交互样式。重复的 feature selector、toggle/select 回调已合并为模块内 hook，且无反向依赖。`agent-controls/index.tsx` 从 1864 降至 1471 行，新模块分别为 303/14/93 行；App typecheck、5 个目标文件 lint/format、6 个聚焦测试文件 35 个断言与 diff hygiene 通过，未声称 desktop/native 视觉运行态验证。
- **App agent controls desktop/compact renderer shell 拆分**：完成。新增 `agent-control-renderers.tsx`，完整拥有 desktop provider/model/thinking controls、compact model/thinking/features controls、tooltip、Combobox option、sheet 与 pressable 状态样式；新增 `agent-control-types.ts` 统一 option/selector/active-sheet 叶子类型，主文件只保留 live/draft 状态、选择事件与 renderer 接线。compact 模型标签规则迁入纯 `formatCompactModelLabel` 并先红后绿；同步删除 desktop renderer 从未读取的 `modelOptions` prop 与从未使用的 `_modelAnchorRef`。`agent-controls/index.tsx` 从 1471 降至 933 行，新 renderer/type 模块分别为 520/15 行且无反向依赖；App typecheck、5 个目标文件 lint/format、6 个聚焦测试文件 36 个断言与 diff hygiene 通过，未声称 desktop/native 视觉运行态验证。
- **App Composer attachment/queue renderer 拆分**：完成。新增 `attachment-queue-renderers.tsx`，独立拥有 queued message row、编辑/立即发送动作、图片附件缩略图/胶囊、GitHub issue/PR 胶囊与 picker option，以及 attachment tray/queue track 渲染和专用样式；`attachment-queue-model.ts` 以纯函数锁定 GitHub kind/label 展示契约。既有 testID、i18n、accessibility label、workspace attachment renderer 与附件打开/删除行为保持兼容，且新模块不反向依赖 Composer 主入口。`composer/index.tsx` 从 2195 降至 1833 行，新 renderer/model 分别为 382/7 行；App typecheck、4 个目标文件 lint/format、3 个聚焦测试文件与 diff hygiene 通过，未声称 desktop/native 视觉运行态验证。
- **App Composer GitHub picker authority 拆分**：完成。新增 `github/picker.tsx`，统一拥有 picker 开关/搜索状态、checkout remote 查询、引用自动附件、搜索 option、已选判断、toggle/remove suppression 与 Combobox 渲染；主 Composer 只消费 picker node、打开动作和附件移除通知三个窄接口，不再直接协调 GitHub query 与 auto-attach。既有搜索启用门禁、query reset、option testID、i18n、选中态和手动移除抑制语义保持兼容，且新 authority 不反向依赖 Composer 主入口。`composer/index.tsx` 从 1833 降至 1712 行，新 authority 为 166 行；App typecheck、2 个目标文件 lint/format、3 个聚焦测试文件与 diff hygiene 通过，未声称 desktop/native 视觉运行态验证。
- **App Composer runtime controls authority 拆分**：完成。新增 `runtime-controls.tsx`，统一拥有实时语音启动门禁/错误提示、voice/cancel 可见性、处理中状态、快捷键 tooltip、platform icon size、上下文窗口计量与 compact/desktop placement，以及全部专用样式；主 Composer 只传入运行态 facts 并消费 `beforeVoiceContent`、`rightContent`、`footerRight` 三个渲染槽。既有语音防重、连接/agent 门禁、compact 输入隐藏规则、取消按钮条件、accessibility label 与 shortcut 展示保持兼容；同步删除从未被引用的 `realtimeVoiceButtonActive` 样式，且新 authority 不反向依赖 Composer 主入口。`composer/index.tsx` 从 1712 降至 1310 行，新 authority 为 456 行；App typecheck、2 个目标文件 lint/format、2 个聚焦测试文件与 diff hygiene 通过，未声称 desktop/native 视觉运行态验证。
- **App Composer attachment/feature menu authority 拆分**：完成。新增 `attachment-menu.tsx`，统一拥有图片选择、GitHub picker 打开、feature descriptor/toggle、draft/live feature 写入、失败提示、Codex `/goal` 注入，以及 menu icon/switch renderer 与专用样式；主 Composer 只传入 agent facts 和动作端口并消费最终 `attachmentMenuItems`。既有 draft `onSetFeature` 优先级、live client fallback、switch stopPropagation、disabled/accessibility/testID、菜单保持打开和 Codex-only goal 语义保持兼容，且新 authority 不反向依赖 Composer 主入口。`composer/index.tsx` 从 1310 降至 1108 行，新 authority 为 217 行；App typecheck、2 个目标文件 lint/format、2 个聚焦测试文件与 diff hygiene 通过，未声称 desktop/native 视觉运行态验证。
- **App Composer keyboard/input authority 拆分**：完成。新增 `keyboard-controller.ts`，统一拥有 keyboard handler identity/registration、focused priority、dictation cancel 优先中断、send/dictation/voice passthrough、跨平台输入聚焦、agent mode cycle 与 attention focus 通知；主 Composer 只传入 pane/runtime facts 和 cancel 端口并消费 `handleFocusChange`。既有 inactive pane 拒绝、cancel 连接/运行态门禁、send/confirm 返回值、native 直接 focus、web retry focus、mode cycle 顺序与错误日志保持兼容，且新 authority 不反向依赖 Composer 主入口。`composer/index.tsx` 从 1108 降至 948 行，新 authority 为 214 行；App typecheck、2 个目标文件 lint/format、2 个聚焦测试文件与 diff hygiene 通过，未声称 desktop/native 运行态快捷键验证。
- **App Composer queue authority 拆分**：完成。新增 `queue-controller.ts`，统一拥有 queuedMessages store selector/writer、普通排队、编辑回填、立即发送/失败恢复、send error 投影，以及 queue path 的 client slash-command 分流；主 Composer 只消费 queue state/actions，并向提交链暴露窄 `queueMessage` 端口。既有空消息拒绝、trim、附件清理、workspace suppression reset、send-now 前置可提交门禁、失败头部恢复和 queue slash 优先级保持兼容，且新 authority 不反向依赖 Composer 主入口。`composer/index.tsx` 从 948 降至 879 行，新 authority 为 144 行；App typecheck、2 个目标文件 lint/format、2 个聚焦测试文件与 diff hygiene 通过。
- **App Composer delivery authority 拆分**：完成。新增 `delivery-controller.ts`，统一拥有 current agent/onSubmit refs、direct daemon transport、optimistic stream writer、图片编码、parent-managed submit、可提交判断，以及 immediate client slash-command 的 draft/reset/loading/error 生命周期；主 Composer 仅消费 `runClientSlashCommand`、`submitMessage`、`canSubmitMessage` 三个窄端口。既有 parent submit 优先级、断连错误、message-sent/attention 回调、slash blur/清空/失败提示和 stream head/tail 投影保持兼容；cancel 路径改为直接依赖当前 `agentId`，消除跨 authority 遗留 ref。`composer/index.tsx` 从 879 降至 799 行，新 authority 为 163 行；App typecheck、2 个目标文件 lint/format、2 个聚焦测试文件与 diff hygiene 通过，且无主入口反向依赖。
- **App Composer submission authority 拆分**：完成。新增 `submission-controller.ts`，统一拥有 submit path 的 immediate client slash-command 分流、可选输入 blur、queue/direct submit 决策、可提交门禁、draft/input/attachment/error/loading 生命周期，以及 workspace attachment 的 `completeSubmit` 收口；主 Composer 只注入 delivery/queue/attachment 端口并消费 `handleSubmit`。既有 parent-managed submit 断连可用性、running agent 排队、force-send、preserve-and-lock、失败回填和仅回写用户附件语义保持兼容，且新 authority 不反向依赖 Composer 主入口。`composer/index.tsx` 从 799 降至 740 行，新 authority 为 141 行；App typecheck、2 个目标文件 lint/format 与 2 个聚焦测试文件 10 个断言通过。
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
- **MCP Schedule authority/parity**：完成。将 Schedule 的创建、列表、检查、暂停、恢复、删除、更新、日志与即时执行 9 个工具提取到独立 `schedule-mcp-tools.ts`，新增 `run_schedule` 对齐既有 `ScheduleService.runOnce` 产品能力，并把 provider/model 解析提升为共享 MCP helper。agent-scoped 的延迟新 Agent 创建和后续 schedule cwd 更新现在统一经过 caller scope authority，`lockedCwd`/`allowCustomCwd` 不再可被 Schedule 绕过；相对路径按 caller cwd 解析。`mcp-server.ts` 从 2459 行降至 1932 行，新模块 471 行；server typecheck、4 个目标文件 lint 与 `mcp-server.test.ts` 88 个断言通过。
- **MCP 本地用量汇总 parity**：完成。新增 `usage-mcp-tools.ts` 和只读 `get_usage_summary`，复用既有 `UsageStore`、180 天 retention 与 7/30/180 天汇总口径，使 App 已有的本地 token 用量看板能力可被 MCP 安全查询。全局 MCP 可读取全局聚合；agent-scoped MCP 必须具备 `lockedCwd`，并只统计该目录及子目录，否则工具不注册。输出仅含 daily/model/totals 聚合，不暴露原始 agentId、cwd、turnId 或逐条事件，也不向 MCP 暴露 destructive clear/raw export。新模块 52 行且无反向依赖，`mcp-server.ts` 仅增加 10 行接线。server typecheck、4 个目标文件 lint/format、2 个 caller scope/output schema 聚焦场景与 server package build 通过，88 个无关场景未运行。
- **MCP terminal authority / workspace scope 隔离**：完成。新增 `terminal-mcp-tools.ts`，统一拥有 list/create/kill/capture/send-keys 五个 terminal 工具、输入输出 schema、特殊按键映射、manager guard 与 caller scope authority；`mcp-server.ts` 仅注入 `resolveScopedCwd` 和动态 scope root。修复 agent-scoped MCP 即使具备 `lockedCwd`，仍可通过 `list_terminals(all:true)` 枚举其他工作区 terminal ID，并进一步按 ID capture/send/kill 外部终端的能力越界；现在 locked workspace 或 `allowCustomCwd:false` 会约束目录枚举及所有 ID 操作，top-level MCP 的全局能力保持不变。主文件从 1942 降至 1725 行，新 authority 为 245 行且无反向依赖。两个安全缺口场景先红后绿；server typecheck、3 个目标文件 lint/format、`mcp-server.test.ts` 92 个场景与 server package build 通过。
- **MCP worktree authority / workspace scope 隔离**：完成。新增 `worktree-mcp-tools.ts`，统一拥有 list/create/archive 三个 worktree 工具、schema、command 适配、归档依赖与 caller scope authority；`mcp-server.ts` 只注入共享 cwd/scope resolver 和领域依赖。修复受限 agent 可枚举同仓库兄弟 worktree、创建 scope 外 worktree，以及按 path/slug 归档兄弟 worktree 的能力越界；现在列表只返回包含 caller cwd 的 worktree，受限 caller 禁止创建新 worktree，归档先解析真实 worktree 根且只允许归档自身，top-level 与允许 custom cwd 的 caller 保持兼容。主文件从 1725 降至 1485 行，新 authority 为 293 行。三个 scope 场景先红后绿；14 个 worktree 聚焦场景与 1 个真实 self-archive E2E、server typecheck、4 个目标文件 lint/format 及 server package build 通过。
- **MCP Agent control authority / workspace scope 隔离**：完成。新增 `agent-control-mcp-tools.ts`，统一拥有 wait/prompt/status/list、cancel/archive/kill/update、activity/mode 与 permission list/respond 共 12 个 Agent MCP 工具及其 schema、排序、持久化恢复和 wait tracker；`mcp-server.ts` 只注入共享 cwd/scope resolver 与领域依赖。修复受限 agent 可通过显式 `list_agents.cwd` 枚举其他工作区 Agent、按已知 Agent ID 跨工作区读取/驱动生命周期和响应权限，以及 `list_pending_permissions` 泄露其他工作区请求的 IDOR/越权面；现在 live/stored Agent 均在任何按 ID 操作前校验 workspace scope，internal Agent 继续按 not found 隐藏，top-level MCP 与允许 custom cwd 的 caller 保持全局兼容。主文件从 1485 降至 863 行，新 authority 为 680 行。4 个 workspace scope 安全场景、`mcp-server.test.ts` 99 个场景、3 个真实 daemon parity E2E、server typecheck、3 个目标文件 lint/format 与 server package build 通过。
- **MCP `create_agent` registration / adapter authority 拆分**：完成。新增 `create-agent-mcp-tool.ts`，独立拥有 top-level 与 agent-scoped 输入 schema、provider/model 校验、worktree intent 投影、初始 prompt 等待及 MCP 响应组装；cwd/locked scope、parent relation、labels、provider config、Agent 创建与 worktree 生命周期继续统一委托既有 `createAgentCommand`，不复制业务或安全策略。`mcp-server.ts` 仅注入依赖并从 863 降至 606 行，新 adapter 为 300 行。`create_agent` 聚焦单测 34 个场景、3 个真实 daemon top-level/agent-scoped E2E、server typecheck、2 个目标文件 lint/format 与 server package build 通过。
- **MCP provider discovery / inspection authority 拆分**：完成。新增 `provider-mcp-tools.ts`，统一拥有 `list_providers`、`list_models`、`inspect_provider` 三个工具及 provider/model 校验、summary 投影、draft feature 查询和输入输出 schema；`mcp-server.ts` 仅注入 snapshot manager、`listDraftFeatures` 与共享 cwd resolver，从 606 降至 428 行，新 authority 为 202 行。provider 聚焦单测 7 个场景、3 个真实 daemon discovery/inspection E2E、server typecheck、2 个目标文件 lint/format 与 server package build 通过。
- **CLI Provider 诊断 parity**：完成。新增 `chisacode provider inspect <provider>`，复用 client 既有 `getProviderDiagnostic` 与 daemon `provider_diagnostic_request`，把 App 已有的脱敏 Provider 排障能力补齐到无 UI、远程 daemon 和脚本场景；默认人类输出为可复制报告，JSON/YAML 保留 provider、diagnostic 与结构化 details，`--host`/`--quiet` 继续沿用统一输出契约。输入在连接前 trim/lowercase，client 在成功和失败后均关闭；不复制 server 诊断/脱敏逻辑，也不向 CLI 扩张 install/update 等变更能力。命令模块 86 行；CLI typecheck/build、4 个代码文件 lint、5 个目标文件 format、2 个测试文件 6 个断言与两个 help 入口通过。
- **Assistant presets App/CLI/MCP parity**：完成。新增 `chisacode preset ls`，复用既有 `agent.presets.list` RPC，在默认表格中仅展示 id/label/provider/mode/model/description，显式 JSON/YAML 保留完整 preset 定义；新增顶层 MCP 只读 `list_agent_presets`，直接读取 daemon 的 built-in + `$CHISACODE_HOME/presets/*.json` catalog。App 新增按 host 隔离的 daemon catalog query 与 workspace draft preset picker，可应用 provider/mode/model/system prompt/sample prompt，并把 system prompt 真实送入 `createAgent` config；不可用 provider/mode/model 保留现有草稿选择，`skillIds`/`mcpServerIds` 在缺少 draft resolver 前明确显示为未应用，不伪造成功。安全边界上，agent-scoped/companion MCP 不注册该工具，避免把用户 preset 中的 private system prompt、skill ids 与 MCP server ids 暴露给 provider agent；preset 始终只填充 draft，不自动创建或启动 Agent。未新增协议。CLI/server/App typecheck、`build:server`（覆盖 protocol/client/server/CLI 产物）、19 个代码文件 lint、目标文件 format、6 个聚焦测试文件 11 个断言及两个 CLI help 入口通过。
- **CLI 本地用量汇总 parity**：完成。新增 `chisacode usage summary` 命令组，复用 client `fetchUsageSummary` RPC，与 App/MCP 共享 7/30/180 天本地 token 汇总口径；支持 daemon host 和既有 table/json/yaml 输出，默认人类视图展示 token breakdown、turn/message、active days/streak、top model 与生成时间，结构化输出保留完整 daily/model 数据。无效 `--range` 在建立 daemon 连接前拒绝，client 始终在成功或失败后关闭；CLI 不新增 destructive clear 或 raw event export。命令模块共 119 行。CLI typecheck、5 个目标文件 lint/format、2 个命令入口/参数场景、3 个 i18n 对称性场景、checkout CLI help 与 CLI build 通过。
- **CLI 本地用量导出/清理 parity**：完成。在既有 `usage summary` 之上补齐 `usage export` 与 `usage clear`。导出仅写入显式 `--output`，支持 JSON/CSV，默认 exclusive create，只有 `--force` 才覆盖，并在新建或覆盖后统一收紧到 `0600`；清理必须显式 `--yes`，缺失确认时在连接 daemon 前拒绝。两个命令复用 client usage RPC、daemon host 与 table/json/yaml 输出，并保证 client 在成功或失败后关闭。CLI typecheck、5 个目标文件 lint/format、2 个测试文件 8 个断言、两个 help 入口与 CLI build 通过。
- **Client terminal 生命周期拆分**：完成。新增 `daemon-client-terminal-client.ts`，独立拥有 terminal 目录订阅及重连恢复、terminal RPC、stream slot、二进制输入/输出路由、exit/断线清理和 event wait；`DaemonClient` 保留公开 façade 与 runtime metrics 分类，`closeItems` 因跨 agent/terminal 领域继续留在核心。公开 `TerminalStreamEvent`、`RenameTerminalInput/Result` 导出保持兼容，核心文件从 4284 降至 4145 行；client typecheck/build、3 个专用测试与 6 个既有集成场景通过。
- **Client voice/dictation 生命周期拆分**：完成。新增 `daemon-client-voice-client.ts`，独立拥有 voice mode/audio 命令和 dictation start ack/error、finish accepted/final/error 竞速、服务端 timeout budget、fallback deadline 与 waiter cancel cleanup；核心仅注入 correlated request、严格/宽松发送和通用 waiter 端口，公开方法保持薄 façade。核心文件从 4145 降至 3920 行，首次低于 4k；client typecheck/build、3 个专用状态机测试与 2 个既有 timeout/final 场景通过。
- **Client agent lifecycle/config 拆分**：完成。新增 `daemon-client-agent-lifecycle.ts`，独立拥有 agent fetch/create/delete/archive/update、project rename、resume/import/refresh、rewind/cancel 和 mode/model/feature/thinking 配置；status 型操作继续复用核心 waiter authority，普通响应复用 correlated transport。公开 `CreateAgentRequestOptions`、`ImportAgentInput`、`FetchAgentResult` 从原入口重导出，wire shape 与业务拒绝错误保持兼容。核心文件从 3920 降至 3471 行；client typecheck/build、3 个专用契约测试与 7 个既有 create/import/model 场景通过。
- **Client agent interaction/query 拆分**：完成。新增 `daemon-client-agent-interaction.ts`，独立拥有 timeline 查询、agent 消息发送与 Generative UI action 的消息构造、超时、能力门禁和业务拒绝语义；`DaemonRpcError` 提取为核心 RPC 与领域客户端共享的内部错误类型。公开 timeline/消息选项类型继续从原入口重导出，`DaemonClient` 保持薄 façade，核心从 3471 降至 3368 行；client typecheck/build、4 个目标文件 lint、3 个专用契约测试与 5 个既有 façade/SDK 场景通过。
- **Client request/waiter authority 拆分**：完成。新增 `daemon-client-request-coordinator.ts`，完整拥有 correlated response 匹配、`rpc_error` 元数据、timeout/cancel waiter、连接中 RPC 排队、连接成功 flush 与断线统一拒绝；所有领域客户端继续通过同一窄 request port 接线。移除核心的两套 pending 集合和 8 个请求辅助方法，并把测试中的私有 `waiters` 状态断言改为无残留 deadline timer 的行为契约；核心从 3368 降至 3040 行。client typecheck/build、4 个目标文件 lint、3 个专用状态机测试与 10 个既有跨 RPC 形态场景通过。
- **Client transport/reconnect 生命周期拆分**：完成。新增 `daemon-client-connection-controller.ts`，完整拥有 transport factory/E2EE 包装、hello 握手、connect promise、状态订阅、错误去抖、退避重连、严格/宽松发送、binary send 与 liveness probe；核心只保留协议解码和三个生命周期回调。公开 `DaemonClientConfig`、`ConnectionState`、`Logger` 继续从原入口重导出，连接重置仍统一清理 request、terminal、file transfer 与 runtime metrics；核心从 3040 降至 2319 行。client typecheck/build、3 个目标文件 lint、3 个专用连接测试与 16 个既有连接/消息/SDK 场景通过。
- **Client inbound message/event authority 拆分**：完成。新增 `daemon-client-inbound-controller.ts`，统一拥有 JSON/binary transport 解码、outbound schema 校验、server-info capability 状态、raw/type/event subscriber、DaemonEvent 投影、pong/inbound activity、terminal/file-transfer frame 路由与 runtime metrics 记录；`DaemonEvent`/`DaemonEventHandler` 继续从原入口兼容重导出。修复单个 daemon event subscriber 抛错会中断后续 subscriber 的可靠性缺陷，失败现在隔离并记录 event type。核心从 2330 降至 2057 行，新 controller 为 368 行；client typecheck/build、3 个目标文件 lint、3 个测试文件的 17 个 inbound/binary/validation/capability/public-export 聚焦场景通过。
- **Client agent synchronization authority 拆分**：完成。新增 `daemon-client-agent-waits.ts`，统一拥有 permission response 发送/精确 agent+request correlation、`waitForAgentUpsert` 的 initial fetch、agent_update 订阅、fallback polling、deadline 与资源清理，以及 `waitForFinish` RPC timeout 投影；公开方法和 `WaitForFinishResult` 继续从原入口兼容。修复异步 agent update 到达时 predicate 抛错会被 subscriber 隔离并最终伪装成 timeout 的缺陷：现在立即 reject 原始错误并清理订阅/timer。核心从 2057 降至 1925 行，新 authority 为 209 行；client typecheck/build、3 个目标文件 lint 与 3 个 predicate cleanup/permission correlation/wait-for-finish 聚焦场景通过。
- **Client directory/usage query authority 拆分**：完成。新增 `daemon-client-query-commands.ts`，统一拥有 active agent directory、agent history、recent provider sessions、workspace directory 与 usage summary/export/clear 七个查询 RPC 的分页、订阅、requestId correlation、skip-queue 和 10 秒 timeout 契约；所有命令复用 `DaemonCommandTransport`，不再在核心重复手写 selector。公开 options/entry/page/usage payload 类型继续从 `daemon-client.ts` 兼容重导出，App、CLI 与 SDK 走同一 wire mapping。核心从 1925 降至 1793 行，新 authority 为 156 行；client typecheck/build、3 个目标文件 lint、3 个专用 mapping 场景、5 个既有真实 DaemonClient 查询场景及 19 个 public API/index 场景通过。
- **Session voice/dictation authority 拆分**：完成。新增 `voice-dictation-handler.ts`，独立拥有 voice mode、分片音频缓冲、STT 转写、dictation stream 接线与 teardown；`Session` 仅保留一个 dispatch façade，核心从 2867 降至 2676 行，并删除已无消费者的 `session-audio.ts`。修复 `dictation_stream_cancel` / `audio_played` 返回 `undefined` 导致继续穿透整条分发链的问题；voice 音频在 base64 解码前后执行 16 MiB 会话上限检查，超限立即释放缓冲并向客户端发出错误 activity，避免连接端通过未结束分片形成无界内存保留。server typecheck、5 个目标文件 lint 与 2 个聚焦测试文件 22 个断言通过。
- **Session agent directory/read-model authority 拆分**：完成。新增 `agent-directory-handler.ts`，独立拥有 agent detail/list/history/recent-provider-session/timeline 查询、可见行分页、active workspace placement、订阅 bootstrap 与 live update 投影；`AgentLifecycleHandler` 只保留交互、生命周期 mutation、运行时配置和 usage，核心从 2522 降至 1454 行，新 directory handler 为 941 行。`Session` 的 AgentManager state event、archive close 和 create cleanup removal 统一委托 directory authority，删除 lifecycle 内第二套 payload/filter/subscription/forward 实现，`Session` 同步从 2676 降至 2612 行；构造顺序改为 handler 就绪后再订阅事件，并修复 context adapter 吞掉 placement fallback options 的潜在未注册 workspace update 丢失。两个 handler context 均收窄到实际端口。server typecheck、6 个目标文件 lint 与 5 个聚焦测试文件 27 个断言通过。
- **Session workspace Git observer authority 拆分**：完成。新增 `workspace-git-observer-controller.ts`，独立拥有 per-session watch target、workspace Git registration/subscription、branch transition、descriptor state dedupe、workspace/checkout 双 fan-out 与幂等 teardown；`Session` 仅保留供既有 context 使用的薄 façade，核心从 2612 降至 2487 行，新 controller 为 181 行。构造时直接注入 `onBranchChanged`，cleanup 统一按 controller 持有的 cwd keys 释放 watcher/fetch/general subscription；同时修复 archive/reconciliation 以 `workspaceId` 取消按 cwd 建立的订阅导致非同值 workspace 残留，以及先删 watch target 后遗漏 fetch unsubscribe 的资源泄漏。server typecheck、4 个目标文件 lint 与 2 个聚焦测试文件 7 个断言通过。
- **Session workspace update/subscription authority 拆分**：完成。新增 `workspace-update-controller.ts`，独立拥有 per-session subscription 生命周期、bootstrap 增量缓冲、fetch snapshot baseline、filter、descriptor 去重、workspace id/cwd fan-out 与后台 reconciliation 调度；`Session` 从 2487 降至 2335 行，`WorkspaceProjectHandler` 从 797 降至 739 行，新 controller 为 244 行。handler context 删除 6 个 `unknown` 状态机接口，收窄为 start/complete/cancel 三个 typed 操作。修复初始 `fetch_workspaces_response` 未建立去重基线导致 observer 首次推送重复 workspace，以及跨层重复 `SessionRequestError` class 令无效 cursor 丢失稳定 `invalid_cursor` code 的错误契约问题。server typecheck、6 个目标文件 lint、controller/observer 8 个断言与 5 个 workspace 订阅/错误契约聚焦场景通过。
- **Session workspace record authority 拆分**：完成。新增 `workspace-record-controller.ts`，独立拥有 cwd canonicalization、exact/prefix lookup、project/workspace 创建、Git/directory 重分类、archive sticky policy、project/workspace 反归档、归档资源清理与同 cwd 首次打开并发 coalescing；`Session` 从 2335 降至 2143 行，新 controller 为 264 行。移除重分类前一次从未参与决策的旧 project registry 读取，同一 cwd 并发首次打开共享单个 mutation promise，避免重复 project/workspace 写入。既有归档子目录、nested Git、exact reopen 与 archived ancestor 规则保持不变。server typecheck、3 个目标文件 lint、3 个 controller 场景、13 个 workspace resolution invariants 与 4 个 open/import/archive/create-agent 集成场景通过。
- **Session workspace descriptor/read-model authority 拆分**：完成。新增 `workspace-descriptor-builder.ts`，以只读 project registry、passive Git snapshot 与 script projection 端口统一构建 project placement、baseline workspace descriptor、Git/GitHub runtime descriptor 和新建 worktree response；该 authority 无任何 registry mutation 权限。`Session` 从 2143 降至 2052 行，新 builder 为 137 行，保留既有 façade 以维持 handler 与测试 seam。Git 数据继续只读 `peekSnapshot`，不会在列表/响应路径触发冷加载；worktree 初始响应不依赖后台 snapshot warmup。server typecheck、3 个目标文件 lint 与 7 个 builder/Session/workspace fetch 聚焦场景通过。
- **Session Git metadata generation authority 拆分**：完成。新增 `git-metadata-generator.ts`，统一拥有 commit message / pull request title+body 的 diff 获取、project instructions、provider policy、Zod schema、structured fallback 与稳定默认文案；`Session` 从 2052 降至 1906 行，新 generator 为 218 行。补齐此前缺失的 prompt 资源与结构边界：最多投影 500 个 changed files、单路径 512 字符、控制字符转义，commit/PR patch 分别维持 120k/200k 字符预算；普通 diff prompt 保持字节级兼容。该能力继续由 checkout handler 统一供 App/CLI/MCP 调用。server typecheck、3 个目标文件 lint、2 个输入预算场景与 22 个 commit/PR prompt/schema/fallback 聚焦场景通过。
- **Session AgentManager event forwarding authority 拆分**：完成。新增 `agent-event-forwarder.ts`，独立拥有 AgentManager subscription、state update projection、stream serialization、Generative UI capability filtering、permission compatibility fan-out、trace metadata 与 teardown；`Session` 从 1906 降至 1813 行，新 forwarder 为 119 行。修复 `void forwardAgentUpdate(...)` rejection 未处理导致 workspace placement/registry 异常升级为进程级 unhandled rejection 的可靠性缺陷：同步抛错与异步 rejection 现在均按 agent/provider 隔离记录，后续事件流不受影响。server typecheck、3 个目标文件 lint、3 个 forwarder 场景、2 个 wire compatibility 场景与 3 个 agent_update placement/archive 集成场景通过。
- **Session MCP client lifecycle authority 拆分**：完成。新增 `session-mcp-client-controller.ts`，独立拥有 daemon HTTP MCP client 异步创建、tools handshake、generation guard、late-client 回收、失败清理与幂等 dispose；`Session` 从 1813 降至 1783 行，新 controller 为 86 行。修复 session cleanup 发生在 `createMCPClient()` 或 `tools()` 完成前时迟到 client 重新挂回已销毁 Session 的连接泄漏，以及 tools handshake 失败后 client 未 close 的资源泄漏；close 自身失败继续隔离记录。server typecheck、3 个目标文件 lint、3 个 lifecycle 竞态/失败场景与 4 个既有 voice/MCP config 场景通过。
- **Workspace Git working-tree observation authority 拆分**：完成。新增 `workspace-git-working-tree-observer.ts`，独立拥有规范化 cwd target、并发 setup coalescing、递归/逐目录 watcher、Git ignore 目录缓存、fallback refresh timer、订阅 fan-out 与幂等 dispose；`WorkspaceGitService` 仅保留公开委托和 snapshot/repo refresh 编排，核心从 1979 降至 1631 行，新 observer 为 519 行。修复 dispose 发生在 watcher setup 或 Linux 目录补监听期间时迟到任务重新创建并泄漏 watcher、单个 working-tree/workspace listener 抛错中断后续订阅者，以及最后一次 unsubscribe 与新订阅并发时新订阅挂到已关闭 target 的可靠性缺陷。server typecheck、3 个目标文件 lint 与 22 个目标场景通过，1 个平台条件场景按预期跳过。
- **Workspace Git auxiliary read authority 拆分**：完成。新增 `workspace-git-auxiliary-read-authority.ts`，统一拥有 checkout diff、branch validation/local lookup/suggestions、stash/worktree/default-branch、repo root/remote URL/metadata 的 7 组 LRU、15 秒 TTL、in-flight coalescing、forced-read reason 与失败后的 internal min-gap；`WorkspaceGitService` 保留原 public API/type 兼容重导出并改为 10 个薄委托，主文件从 1631 降至 1382 行，新 authority 为 400 行且无反向依赖。重复的 ChisaCode stash prefix 收敛为单一常量，行为保持兼容。server typecheck、2 个目标文件 lint/format、16 个 D2 auxiliary read 聚焦场景与 server package build 通过，28 个无关场景未运行。
- **Workspace Git repository fetch authority 拆分**：完成。新增 `workspace-git-repository-fetch-authority.ts`，独立拥有 repo common-dir 级 workspace membership、共享 3 分钟 fetch interval、in-flight 去重、失败隔离、refresh fan-out 与 dispose/detach teardown；每次 fetch 动态选择当前仍注册的 workspace cwd，不再永久绑定首个成员。修复首个 workspace 退订或路径删除后，同仓库剩余 workspace 的后台 fetch 持续使用失效 cwd 的可靠性缺陷；迟到 fetch 在 target 关闭后不再触发 refresh。`workspace-git-service.ts` 从 1382 降至 1315 行，新 authority 为 149 行且无反向依赖。server typecheck、3 个目标文件 lint/format、2 个 repo-level fetch 聚焦场景与 server package build 通过，22 个无关场景未运行。
- **Workspace Git GitHub poll binding authority 拆分**：完成。新增 `workspace-git-github-poll-binding.ts`，独立拥有 workspace cwd 到 GitHub current-PR poll 的 remote/head identity、订阅替换、迟到 callback guard、handler/retain/invalidate 错误隔离与 dispose/remove teardown；相同 binding 仅更新 callback，branch 变化立即重绑，remote 变化先失效该 cwd 的 GitHub cache 再重绑。修复底层 poll/cache key 只有 `cwd + headRef`，导致同一分支切换到另一个 GitHub remote 后继续复用旧仓库 PR 状态的问题。`workspace-git-service.ts` 从 1315 降至 1295 行，新 authority 为 168 行且无反向依赖。server typecheck、3 个目标文件 lint/format、4 个 GitHub poll 生命周期聚焦场景与 server package build 通过，41 个无关场景未运行。
- **Workspace Git checkout observation authority 拆分**：完成。新增 `workspace-git-checkout-observation-authority.ts`，独立拥有 checkout facts 1 秒复用、并发读取 coalescing、Git HEAD/branch refs watcher、setup 失败重试、repository-fetch membership 与幂等 teardown；迟到 facts completion 通过 generation guard 无法回写已关闭或同 cwd 重建后的 target。`WorkspaceGitService` 移除 watcher/facts/repo root/setup 状态和相关方法，从 1295 降至 1130 行，新 authority 为 292 行且无反向依赖；同时删除多余 origin 探针，维持既有 Git 命令预算。server typecheck、2 个目标文件 lint、5 个 observation/facts/repo 聚焦场景与 server package build 通过，64 个无关场景未运行。
- **Workspace Git refresh coordinator 拆分**：完成。新增 `workspace-git-refresh-coordinator.ts`，独立拥有 force/includeGitHub/notify 请求规范化、2 秒 internal min-gap、in-flight coalescing、能力升级、queued rerun 与 refresh state cleanup；快照加载和 listener fan-out 继续由主服务通过窄回调注入。修复冷启动后台 Git-only refresh 与普通 GitHub-inclusive `getSnapshot()` 并发时，后者因能力升级错误地要求 `force` 而返回 `featuresEnabled: false` 的真实契约缺口。`workspace-git-service.ts` 从 1130 降至 1004 行，新 coordinator 为 178 行且无反向依赖。缺口经 1 个场景先红后绿；server typecheck、3 个目标文件 lint/format、16 个 refresh state 聚焦场景与 server package build 通过，30 个无关场景未运行。
- **Workspace Git snapshot materialization authority 拆分**：完成。新增 `workspace-git-snapshot-materializer.ts`，统一拥有 runtime snapshot 类型、Git status/shortstat 投影、GitHub remote identity、认证与 PR 状态读取、poll target 计算、poll status 应用及 unavailable/error 降级；`workspace-git-service.ts` 继续兼容重导出 snapshot 类型，只保留订阅、调度和 listener fan-out。修复 `GitHubService.isAuthenticated()` 合法返回 `false` 时仍继续读取 PR、错误投影为 GitHub 可用的契约缺口；同时删除 latest Git/GitHub/snapshot loaded-at 三组从未读取的死状态。主服务从 1004 降至 706 行，新 materializer 为 329 行且无反向依赖。缺口经 1 个场景先红后绿；server typecheck、3 个目标文件 lint/format、2 个测试文件 12 个 materializer/poll 聚焦场景与 server package build 通过，59 个无关场景未运行。
- **GitHub current PR polling authority 拆分**：完成。新增 `github-current-pr-poller.ts`，独立拥有 current-PR poll target、adaptive timer、error backoff、唯一订阅 token、成功/失败 fan-out 与幂等 dispose；`github-service.ts` 仅保留 gh command/cache 与状态读取编排，核心从 2287 降至 2155 行，新 poller 为 234 行。修复单个 status subscriber 抛错被误判为 GitHub 请求失败、单个 error subscriber 抛错导致 `void` poll rejection 外溢并停止后续轮询，以及相同 callback 多次 retain 时一次 unsubscribe 提前移除共享 callback 的可靠性缺陷；workspace 默认 GitHub service 接入现有 logger 记录隔离错误。server typecheck、4 个目标文件 lint 与 88 个目标场景通过，1 个平台条件场景按预期跳过。
- **GitHub search aggregation authority 拆分**：完成。新增 `github-search.ts`，独立拥有 issue/PR kind 选择、URL 编号归一化、双源并发、gh/认证不可用降级、跨来源更新时间排序与最终响应上限；`github-service.ts` 只注入既有缓存 list readers 和错误分类，并继续兼容重导出公开 search/read 类型。修复 `github_search_request.limit` 被分别应用到 issue 与 PR、合并响应最多返回 `2 × limit` 的产品契约缺口；现在各来源可并行读取候选，但最终统一截断到请求上限。主服务从 2155 降至 2043 行，新 authority 为 174 行。server typecheck、3 个目标文件 lint/format、`github-service.test.ts` 67 个场景与 server package build 通过。
- **GitHub PR check-rollup authority 拆分**：完成。新增 `github-pr-checks.ts`，独立拥有 current/legacy `statusCheckRollup` schema、check run/status context 规范化、状态与 duration 映射、rerun recency 选择及 aggregate checks status；`github-service.ts` 只消费规范化 checks，并继续兼容重导出既有公开类型与 `parseStatusCheckRollup`。修复不同 workflow 中同名 job 仅按 `check.name` 去重、导致 PR 面板丢失检查项的产品缺口：现在以 `workflow + check name` 作为 CheckRun 身份，同一 workflow rerun 仍只保留最新一次，无 workflow 的 legacy 兼容语义保持不变。主服务从 2043 降至 1859 行，新 authority 为 230 行。server typecheck、3 个目标文件 lint/format、`github-service.test.ts` 68 个场景与 server package build 通过。
- **GitHub PR timeline authority 拆分**：完成。新增 `github-pr-timeline.ts`，独立拥有 bounded GraphQL query、review/comment schema、repository identity、timeline 映射与排序、100+100 分页截断、not-found/forbidden/unknown 错误分类及稳定 payload；`github-service.ts` 只保留 cached 调用、命令执行和既有错误类到领域 failure 的窄归一化，公开 timeline 类型继续兼容重导出。修复 GitHub `PENDING` review（尚未提交的 review 草稿）只要 body 非空就被映射为公开 `commented` 活动的产品/隐私语义缺口；现在 PENDING 始终不进入 timeline，已提交 COMMENTED/APPROVED/CHANGES_REQUESTED 及既有 DISMISSED 兼容映射保持不变。主服务从 1859 降至 1585 行，新 authority 为 335 行。server typecheck、3 个目标文件 lint/format、`github-service.test.ts` 69 个场景与 server package build 通过。
- **GitHub PR timeline cache identity 隔离**：完成。`getPullRequestTimeline` 的 cache/in-flight key 从仅 `cwd + prNumber` 补齐为 `cwd + repoOwner + repoName + prNumber`，修复同一 checkout 在 parent/fork 或远端 repository identity 切换后、相同 PR 编号在 TTL 内复用旧仓库 timeline payload 的跨仓库陈旧数据缺口。既有同仓库缓存命中、cwd invalidation 和迟到请求不回填语义保持不变；同时审查其余 GitHub cached 方法，显式身份字段均已纳入各自 key。server typecheck、2 个目标文件 lint/format、`github-service.test.ts` 70 个场景与 server package build 通过。
- **GitHub current PR resolution authority 拆分**：完成。新增 `github-current-pr.ts`，统一拥有 current-PR CLI/schema、direct view、fork/parent fallback、候选解析与选择、`statusCheckRollup` 权限降级、状态/check/review 规范化和 GitHub merge facts GraphQL 合并；`github-service.ts` 只保留缓存、命令执行、错误分类与 poller 接线，公开 current-PR 类型继续兼容重导出。修复 closed PR 只因残留 `isDraft: true` 就被排在 merged PR 前面的候选排序缺陷，优先级现在稳定为 open > merged > closed。主服务从 1589 降至 1038 行，新 authority 为 625 行且无反向依赖。缺口经 1 个场景先红后绿；server typecheck、4 个目标文件 lint/format、`github-service.test.ts` 71 个场景与 server package build 通过。
- **GitHub PR mutation authority 拆分**：完成。新增 `github-pr-mutations.ts`，统一拥有 PR 创建、直接 merge、auto-merge enable/disable 命令，merge method policy、GitHub facts 门禁与公开 mutation 类型；`github-service.ts` 仅通过统一 `run` 端口委托，并继续兼容重导出 checkout handler 依赖的 policy API。修复 auto-merge 仅接受 `BLOCKED`、错误拒绝 `BEHIND` 与 `UNSTABLE` 等合法等待态的产品缺口；等待态现在显式收敛为 `BLOCKED | BEHIND | UNSTABLE`，不会放开可立即合并、冲突、draft 或未知状态。主服务从 1038 降至 904 行，新 authority 为 253 行且无反向依赖。缺口经 2 个参数化场景先红后绿；server typecheck、3 个目标文件 lint/format、`github-service.test.ts` 73 个场景与 server package build 通过。
- **Checkout Git branch authority 拆分**：完成。新增 `checkout-git-repository.ts`，统一拥有只读 Git 环境、仓库 guard 与稳定 `NotGitRepoError`；新增 `checkout-git-branches.ts`，独立拥有 local/origin branch discovery、query/recency 排序、checkout resolution 与 mutation。原 `checkout-git.ts` 保持兼容重导出并从 2788 降至 2525 行，新模块分别为 266/31 行。branch suggestion 现在用一次 `for-each-ref` 同时读取 `refs/heads` 与 `refs/remotes/origin`，每次冷读取减少一个 Git 子进程；性能契约已先红后绿。server typecheck、4 个目标文件 lint 与 `checkout-git.test.ts` 100 个真实临时仓库场景通过。
- **Checkout Git diff authority 拆分**：完成。新增 `checkout-git-diff.ts`，独立拥有 tracked/untracked 文件发现、rename/numstat 归一化、merge-base 选择、单文件/总 diff 字节预算、binary/超大文件占位、structured highlight 与 unborn HEAD fallback；新增 `checkout-git-file-inspection.ts` 共享有界二进制前缀探测。`checkout-git.ts` 仅通过两个 base-ref resolver 注入并保留原 `getCheckoutDiff` façade，核心从 2525 降至 1858 行，新 diff authority 为 693 行且无反向依赖。server typecheck、3 个目标文件 lint/format 与 101 个真实 Git/diff batching 场景通过。
- **Checkout Git shortstat authority 拆分**：完成。新增 `checkout-git-shortstat.ts`，独立拥有 comparison-ref 选择、tracked shortstat 解析、最多 500 个 untracked 文本文件的有界行数统计、binary/超大文件跳过、TTL cache、并发读取去重与后台 warmup；仅通过 facts selector、base/current branch 与 ref resolver 窄端口接入。`checkout-git.ts` 保留原 shortstat/cache façade 并从 1858 降至 1662 行，新 authority 为 300 行且无反向依赖。server typecheck、2 个目标文件 lint/format 与 12 个 shortstat 聚焦真实 Git 场景通过，88 个无关场景未运行。
- **Checkout Git PR status authority 拆分**：完成。新增 `checkout-git-pull-request-status.ts`，独立拥有 GitHub feature availability、forced read reason 校验、TTL cache、并发 in-flight 去重、last-successful stale fallback、CLI/auth 降级与 transient command error 语义；仅通过 facts selector、current branch 与 lookup-target resolver 窄端口接入。`checkout-git.ts` 保留原类型重导出及 get/reset/set façade，并从 1662 降至 1515 行，新 authority 为 262 行且无反向依赖。server typecheck、2 个目标文件 lint/format、13 个 PR status 聚焦真实 Git 场景与完整 server build 通过，87 个无关场景未运行。
- **Checkout Git merge authority 拆分**：完成。新增 `checkout-git-merge.ts`，独立拥有 merge-to-base / merge-from-base、stored base override 校验、clean-target gate、base worktree 选择、squash commit、共享冲突文件聚合、merge abort 与原 checkout 恢复；两套重复冲突探测收敛为单一 authority。`checkout-git.ts` 保留错误类/选项重导出及双向 merge façade，并从 1515 降至 1272 行，新 authority 为 287 行且无反向依赖。修复显式 base 与 worktree metadata 不匹配时 merge 与 PR 创建路径把 expected/got 打成同一值的问题。server typecheck、3 个目标文件 lint/format、8 个 merge 聚焦真实 Git 场景与 server package build 通过，93 个无关场景未运行。
- **Checkout Git worktree topology authority 拆分**：完成。新增 `checkout-git-worktree-topology.ts`，独立拥有 checkout root、Git common-dir / bare repository 主 checkout 选择、porcelain worktree projection、branch-to-worktree lookup、跨平台 descendant/path policy、ChisaCode ownership 与 stored base metadata 读取；snapshot 与 merge 仅消费明确拓扑接口，并移除机械重复的 `chisacode|chisacode` path regex 分支。`checkout-git.ts` 保留既有 public worktree helper 重导出，并从 1272 降至 1126 行，新 authority 为 218 行且无反向依赖。server typecheck、2 个目标文件 lint/format、18 个 worktree 聚焦真实 Git/路径场景与 server package build 通过，83 个无关场景未运行。
- **Checkout Git base-ref authority 拆分**：完成。新增 `checkout-git-base-ref.ts`，统一拥有 managed worktree stored base、origin HEAD/main/master 默认分支、local/origin ref normalization/existence、comparison ref 与 most-ahead base 选择；snapshot 通过 known-worktree projection 委托完整决策，diff、shortstat、merge、branch existence 和 PR 创建复用同一 authority。`checkout-git.ts` 保留 `resolveRepositoryDefaultBranch` 兼容重导出，并从 1126 降至 936 行，新 authority 为 249 行且无反向依赖。server typecheck、2 个目标文件 lint/format、15 个 base-ref 聚焦真实 Git 场景与 server package build 通过，86 个无关场景未运行。
- **Checkout Git snapshot/status authority 拆分**：完成。新增 `checkout-git-snapshot.ts`，统一拥有 current/rebase branch、origin/config/Git dir 读取、可复用 checkout facts、managed worktree/base projection、tracked origin/fork PR lookup，以及 dirty/ahead/behind/unpushed 状态投影；`checkout-git.ts` 保留 snapshot/status API 与类型的兼容重导出，并从 936 降至 389 行，新 authority 为 606 行且无反向依赖。重复的 PR remote prefix 收敛为单一常量，行为保持兼容。server typecheck、2 个目标文件 lint/format、18 个 snapshot/status 与 rev-parse 聚焦真实 Git 场景及 server package build 通过，85 个无关场景未运行。
- **Protocol terminal 消息域拆分**：完成。新增 `terminal/messages.ts`，完整拥有 terminal inbound/outbound schema、状态快照 schema、消息类型及用于总 union 聚合的只读 schema tuple；`messages.ts` 通过 tuple spread 聚合并兼容重导出，`terminal-snapshot.ts` 改为直接依赖领域类型，消除对 god-file 的反向依赖。新增 `@chisacode/protocol/terminal/messages` 显式公开入口，主文件从 5213 降至 4941 行；protocol build/typecheck、5 个目标文件 lint、42 个聚焦断言及 client/server/app/CLI 消费者 typecheck 通过。
- **Protocol checkout 消息域拆分**：完成。新增 `checkout/messages.ts`，完整拥有 checkout status/diff、commit/merge/pull/push、PR/auto-merge/timeline、branch/stash 与 GitHub search 的请求、响应、兼容 default 和消息类型；总 union 通过 22 个 inbound/23 个 outbound schema tuple 聚合，`CheckoutErrorSchema` 作为 worktree 响应的单向共享契约。新增 `@chisacode/protocol/checkout/messages` 显式公开入口，旧 `messages` 入口兼容重导出，主文件从 4941 降至 4142 行；protocol build/typecheck、4 个目标文件 lint、66 个聚焦断言及 client/server/app/CLI 消费者 typecheck 通过。
- **Protocol workspace/attachment 消息域拆分**：完成。新增 `workspace/messages.ts`，完整拥有 workspace/worktree/directory/editor/file explorer/project icon/download token 的 14 个 inbound、18 个 outbound schema，以及 workspace descriptor、project placement、script/setup 状态和消息类型；`agent/attachments.ts` 独立拥有 GitHub/text/review attachment 解析与 legacy 容错归一化，解除 workspace 创建 RPC 对 god-file 的反向依赖。总 union 通过只读 tuple 聚合，旧 `messages` 入口兼容重导出，并新增两个显式 package subpath；主文件从 4142 降至 3339 行。protocol typecheck/build、6 个目标文件 lint、44 个聚焦断言及 client/server/app/CLI 消费者 typecheck 通过。
- **Protocol provider 消息域拆分**：完成。新增 `provider/messages.ts`，完整拥有 provider model/mode/feature discovery、snapshot、diagnostic、tooling、usage、recent sessions 与兼容 diagnostics 的 11 个 inbound、12 个 outbound schema；model normalization、snapshot defaults 和 tooling metadata 保持原契约，总 union 改为只读 tuple 聚合，旧 `messages` 入口继续兼容重导出。`agent-types.ts` 的 attachment 类型改为直接依赖 `agent/attachments.ts`，消除对 god-file 的反向依赖；新增显式 package subpath，主文件从 3339 降至 2860 行。protocol typecheck/build、8 个目标文件 lint、87 个聚焦断言及 client/server/app/CLI 消费者 typecheck 通过。
- **应用更新产品边界复核**：完成。桌面 App 的检查、后台下载与退出安装由 Electron `autoUpdater` 和受信 IPC sender authority 共同拥有，属于平台生命周期能力；非桌面 App 已通过 GitHub Release 提供只读版本/APK 查询。CLI/MCP 不复制安装行为，避免制造无法兑现的平台假 parity；后续只有出现可复用 daemon 发布状态 authority 时才扩展只读查询。
- **Protocol automation 消息域拆分**：完成。新增 `automation/messages.ts`，以 21 个 inbound/21 个 outbound 只读 schema tuple 聚合 Chat、Schedule、Loop RPC，并兼容重导出既有 schema 与 request/response 类型；总 `messages.ts` 不再逐条持有 42 个自动化 schema，主文件从 721 降至 577 行。新增 `@chisacode/protocol/automation/messages` 显式公开入口；protocol build/typecheck、4 个目标文件 lint、47 个聚焦断言及 client/server/app/CLI 消费者 typecheck 通过。
- **Provider composition-first 拆分启动**：完成 Codex skills、notification parser/router、turn configuration、model catalog、launch/runtime config、client/client runtime、session/thread bootstrap/session metadata/session history、tool/delta/item/turn notification、notification/compaction state、notification timeline、sub-agent tracker、permission state/domain/controller、session event bus、user-message turn state、image attachments、history pipeline 三十二个领域切片；`session-history.ts` 完整拥有 persisted history pending/entries、user-message 索引重建与单次 drain，`session-connection.ts` 完整拥有 client、并发 connect 去重、initialize handshake、失败清理与 close 竞态，`session-commands.ts` 完整拥有 slash-command 解析、custom prompt/skill 展开、命令目录及 `/compact`/`/goal` 编排，`session-runtime.ts` 完整拥有 config/mode/feature/service tier、runtime info cache 与 persistence metadata，`session-turn-execution.ts` 完整拥有 foreground/native turn state、run/start/interrupt、参数构建与启动日志。Session 从 828 降至 715 行，turn execution 223 行。Claude Slice 2 已完成十六个边界：Client、Session、SDK reader、turn routing、foreground turn/input、message translation、query lifecycle、rewind、persisted history、history conversion、tool lifecycle、SDK mapping、permissions、options 与 session identity/runtime cache 均已独立；原 5185 行 `agent.ts` 收敛为 16 行兼容 façade，`session.ts` 为 873 行、`foreground-turn-controller.ts` 为 219 行、`session-identity.ts` 为 258 行、`client.ts` 为 523 行。ACP 已按相同策略提取七个领域模块，session update 的消息/tool 状态与路由已独立；Pi 已完成 permission、event values、extension history、session event、runtime state 与 session lifecycle 六个边界，new/resume 资源所有权、模型/思考配置、usage、持久化和 cleanup 均已独立，主文件从 1874 降至 581 行。各 provider 均未引入基类或 mixin，核心拆分完成。
- **全量优化审查收口（2026-07-15）**：完成。修复 agent-scoped MCP provider discovery 错用 home snapshot，同时保留顶层 MCP 的 home fallback 兼容契约；provider tooling RPC 客户端预算覆盖 120 秒命令、两段 30 秒刷新、8 秒版本元数据和响应余量；删除遗留 `ai/internal` 调试脚本并按真实 peer 关系收紧 Knip 配置；通过 logger/adapter 端口把 test-audit 恢复到既有基线内且未抬高基线；新增 `.gitattributes` 固定文本 LF，消除 Windows `core.autocrlf=true` 下的格式检查假失败。
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
- [x] 审查批次 A 遗留: LOW #3（`hostnames.ts` IP 字面量默认放行）— 默认 authority 收紧为仅允许 `localhost`、`*.localhost`、`127.0.0.0/8`、`::1` 与 IPv4-mapped loopback；LAN/VPN/公网 IP 必须显式配置。Host parser 现在拒绝无效端口、bracket/suffix 夹带、控制字符及缺失 Host，`hostnames: true` 仅关闭 allowlist 而不关闭语法校验；HTTP、主 WebSocket 与 script proxy 复用同一 fail-closed authority。`hostnames.test.ts` 15 个场景、`bootstrap-auth.test.ts` 12 个场景、server typecheck 与 4 个目标文件 lint 通过。
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

### 错误提示机制统一（执行中，2026-07-15 启动）

- **计划**：[error-handling-unification-plan.md](error-handling-unification-plan.md)
- **代码真值校准**：Toast 队列已在历史批次完成，非测试 App 代码中的 `Alert.alert` 已从旧草案记录的 35 处降到 9 处；剩余调用主要承担确认、权限或立即处理职责，不再按旧清单机械替换。
- **首个代码切片**：新增跨平台 `useUserVisibleErrorReporter`，统一保留原始错误日志、规范化 fallback 消息和错误 Toast；既有 Desktop IPC helper 改为委托该 authority，避免重复实现。
- **产品修复**：Host 设置的删除连接、重启 daemon、保存附加系统提示词、删除主机已迁移；其中系统提示词保存失败从“仅控制台可见”修复为中英文用户提示。
- **边界保护**：异步操作在组件卸载后仍记录 late rejection，但可抑制 Toast，避免向已销毁页面投递反馈。
- **Skills / MCP 切片**：加载、策略保存、安装/卸载、删除和表单保存共 8 条失败路径已迁移；真实 daemon 错误优先展示，不透明错误使用现有中英文本地化 fallback，并补齐稳定日志标签。
- **模型 / Provider 切片**：自定义模型、Provider、自定义 Provider 与合成模型已按操作 Toast、表单 inline、测试结果 inline 和后台 warning 分层；Provider tooling action 的 RPC rejection / `success: false` 静默失败与自定义 Provider 测试的未处理 rejection 已修复，纯错误 authority 支持注入 presenter。
- **生产交互 Slice C1**：解归档与权限响应失败接入统一错误 authority 和中英文本地化 fallback；权限与解归档按钮在失败后恢复可重试。同步删除 `SessionContext` 中 9 个从未接线的 legacy 操作回调、闲置 timeout ref 和死路径 refetch helper，减少 150 余行不可达代码。
- **状态**：进行中；下一批继续生产路径分层，只迁移真实用户操作失败或连接中断，内部诊断日志继续保留。

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

### packages/app 全量审查优化（2026-07-22 启动）

- **问题**：对 `packages/app/src` 全量源码（1139 个 `.ts/.tsx` 文件，约 23.7 万行）做四区域并行代码审查，发现 7 个高、13 个中、17 个低共 37 项可执行改进，覆盖运行时竞态/挂死、安全注入面、性能与无界重渲染、i18n 系统性缺失、数据正确性与低影响清理。静态门禁基线：全包 `tsc --noEmit -p packages/app` ✅ 无错误，全包 `oxlint packages/app/src`（1141 文件 / 177 规则）✅ 0 warning / 0 error。
- **影响范围**：`packages/app` 的 `runtime/`、`desktop/`、`terminal/`、`hooks/`、`contexts/`、`composer/`、`stores/`、`utils/`、`attachments/`、`generative-ui/`、`components/`、`screens/`、`i18n/`、`voice/`、`polyfills/`。
- **方案**：按严重度与同性质聚合为 5 个批次，每批列具体 `file:line`、修法、验收。批次 1/2 为 P0（生产可触发的运行时挂死与安全注入面），批次 3/4 为 P1（性能与系统性技术债），批次 5 为 P2（数据正确性与清理）。i18n 与 `useUnistyles` 因规模大，标注为系统性子任务分阶段推进。

  #### 批次 1 — 运行时竞态与挂死（P0，先修）
  1. `runtime/host-runtime.ts:761-776` — `maybeActivateFirstAvailable` 的 `while (!this.snapshot.activeConnectionId)` 在 `switchToConnection` 失败后无限重试，`activeConnectionId` 永为 null 时阻塞该 host 所有后续 probe。修：加次数上限或单次激活失败即 `return false`。
  2. `desktop/daemon/desktop-daemon-transport.ts:97-161` — `listenToEvents` 与 `openSession` 并发无序，`send()` 在 `sessionId === null` 时静默丢帧，早期握手帧丢失致 daemon 永久等待。修：先 `await listenToEvents` 再 `openSession`；`send` 在 session 未就绪时缓冲而非丢弃。
  3. `terminal/runtime/terminal-emulator-runtime.ts:817-819` — `setTimeout(finalizeOperation, 5000)` 可在 `unmount()` 后触发，`onCommitted` 回调触碰已释放 runtime；跨 mount 边界时旧 write callback 可写进新 terminal。修：`finalizeOperation` 内捕获 epoch token，`this.terminal` 变更即 bail；xterm write callback 内 `this.terminal === null` 检查后再 `finalizeOperation`。
  4. `hooks/use-app-visible.ts:30-47` — 全局 `AppState`/`visibilitychange`/`focus`/`blur` 监听按组件订阅/拆，第一个 unmount 拆掉全局监听后第二个快照永久过期，违反 `useSyncExternalStore` 契约。修：监听器模块级单例 + 引用计数，`listeners.size === 0` 才拆。
  5. `terminal/runtime/workspace-terminal-session.ts:66-79` + `hooks/use-workspace-terminal-session-retention.ts:15` — 简单整数 refcount 共享 `scopeKey`，Strict Mode 双触发 effect 时乱序 unmount 会把第二个 mount 指向被删后重建的空会话，丢失 scrollback。修：refcount 归零后短延迟再删，或按组件实例 key 计数。
  6. `runtime/host-runtime.ts:1339-1402` — `runConfiguredOverrideBootstrap` 的 `while (!registryHasConnection(...))` 每 1s 无限重试，override 端点永久不可达时整生命周期循环并每 10 次日志。修：加最大次数/退避上限，永久失败上抛给用户。
  - **验收**：每项配聚焦 Vitest（`npx vitest run <path> --bail=1`）+ App typecheck + 目标 lint；竞态类用 `vi.useFakeTimers` / 事件驱动断言，禁止 `setTimeout` 固定等待（遵循 AGENTS.md 测试规范）。

  #### 批次 2 — 安全注入面（P0）
  1. `utils/open-external-url.ts:17` — 任意 href 透传 `Linking.openURL` / `window.open`，`assistant-file-links` 的 `external` 分类只靠 `isExternalHref`（允许任何非 `file://` scheme）过滤，`javascript:` / `data:` / app deep-link 可达。修：加 `http/https/mailto/tel/sms` 白名单，其余拒绝/忽略。
  2. `generative-ui/generative-ui-html.ts:50-87` — CSP `script-src 'unsafe-inline'` 让 AI 输出 inline `<script>` 可执行，虽 `connect-src 'none'` 阻断外泄，仍可读 DOM、在 Electron 渲染层尝试 bridge 调用。修：默认 `script-src 'none'`，脚本能力改为显式 opt-in flag；至少在文件内注释威胁模型决策。
  3. `terminal/runtime/terminal-emulator-runtime.ts:337` — `window.__chisacodeTerminal = terminal` 调试用全局暴露 live xterm，多 mount 时只保留最后一个。修：dev-only 或 Symbol-keyed 属性。
  4. `desktop/electron/events.ts:18-24` — `listenToDesktopEvent` 解包信任任意含 `payload` 键的对象，合法事件 data 恰为 `{payload:...}` 会被误解包。修：显式 envelope 判别式 `{type:"event";event:string;payload:unknown}`，仅匹配时解包。
  - **验收**：聚焦测试断言白名单/envelope 形状 + 目标 lint；CSP 改动需在真实 Electron generative-ui 渲染回归（遵循「不以 Web 代替 desktop」）。

  #### 批次 3 — 性能与无界重渲染（P1）
  1. `contexts/voice-context.tsx:69-76` — `useVoiceOptional` 每次渲染展开 `...snapshot` + 4 方法合成新对象，破坏下游 `memo` / `useMemo`。修：`useMemo([snapshot, runtime])` 包裹返回值，或 runtime 与 snapshot 分开暴露。
  2. `useUnistyles()` 在 50+ 组件违反 Unistyles 性能规则（`docs/unistyles.md` 禁用，每调用返回新引用、订阅全部 runtime 变更、lockstep 重渲染）。重灾区：`combined-model-selector.tsx`（5 调用）、`adaptive-modal-sheet.tsx`（4）、`command-center.tsx`（3）及大量 panel/sidebar/agent 组件，多数只读 `theme.colors.*`。修：迁移高 churn 子树到 `StyleSheet.create((theme)=>...)` 或 `withUnistyles`，按子树分批独立验收。**系统性子任务**。
  3. `hooks/use-keyboard-action-handler.ts:28` — 依赖 `input.actions`，调用方（`composer/keyboard-controller.ts:186-196`）传内联数组字面量，每渲染身份变化致 handler 反复注销/注册，与 dispatcher.dispatch 竞态。修：调用方 `useMemo` 静态数组，或 hook 按值比较（join 成 key）。
  4. `hooks/use-ios-hardware-keyboard-submit.ts:26` — `controller.setOnSubmit(input.onSubmit)` 在 render 阶段执行副作用，违反 render 纯函数；Strict Mode 双渲染下可能用旧 `onSubmit` 处理两次渲染间到达的事件。修：移到 `useEffect([controller, input.onSubmit])` 或用 ref 存最新回调。
  5. `composer/input/input.tsx:556-606` — `usePasteImagesEffect` deps 含 `isDictating` / `isRealtimeVoiceForCurrentAgent`，内部 guard 已短路这些状态，重订阅无必要且制造短暂无监听窗口。修：deps 去掉这两项，guard 用 ref。
  6. `agent-stream/model.ts:52-61` — `orderedTailCache` 等 4 个 module-level `WeakMap<StreamItem[], Map<string,...>>`，内层 Map 按 platform/breakpoint key 累积从不裁剪；长生命周期 `StreamItem[]` 永久持有所有 cache 条目。修：内层 Map 加 LRU 上限或超阈值清空。
  7. `hooks/use-dictation.ts:185-192` ← `use-dictation-audio-source.web.ts:464-479` — memo 返回对象含 `volume`，volume 每变化改 `audio` 身份，级联到 `start/stop` → `handleVoicePress` 等重建。修：返回 `{start, stop}` 与 `volume` 分离，`start/stop` 身份稳定。
  8. `composer/input/input.tsx:1678-1713` — `handleDesktopKeyPress` / `handleNativeKeyPressEvent` 内联 `function` 声明，每渲染新身份传给 `ThemedTextInput.onKeyPress`，native/web 都重绑。修：`useCallback` 包裹。
  - **验收**：聚焦测试 + App typecheck + 目标 lint；`useUnistyles` 迁移按子树分批，每批独立 typecheck/lint + 聚焦测试。

  #### 批次 4 — i18n 全量化（P1，系统性）
  - 应用在 `i18n/index.ts` 定义了 `en` locale 并大量用 `t()`，但大量用户可见字符串是硬编码中文，`en` 用户看到中文。需全量替换硬编码中文字面量为 `t()` 调用，补齐 `zh` / `en` key。重点文件与行号：
    - `components/file-explorer-pane.tsx:479,558,562,581`（与同文件 `t("fileExplorer.loading")` 并存，半翻译）、`:52-54` 排序标签 `名称`/`修改时间`/`大小`
    - `components/message.tsx:1526,1704,1911,1925,1944`
    - `components/rewind/rewind-menu.tsx:82,98,117`
    - `components/browser-pane.electron.tsx:999`
    - `components/generative-html-preview.tsx:32,36,37,43`
    - `components/workspace-hover-card.tsx:388`
    - `components/left-sidebar.tsx:1420`
    - `components/project-picker-modal.tsx:303,322,324,343,350`
    - `components/question-form-card.tsx:369`
    - `screens/settings/mcp-servers-section.tsx:117,217,224,229,240,241`
    - `screens/settings/usage-statistics-section.tsx:34`
    - `components/diff-viewer.tsx:323`（可见文本 `打开` 但 `accessibilityLabel="Open in DiffPane"` — 可见/辅助文本不一致，需统一同一 key）
  - 建立 lint 级别拦截防回归。**系统性子任务**。
  - **验收**：聚焦测试断言无硬编码中文残留 + App typecheck + 目标 lint；考虑加一条 fidelity 边界测试扫描硬编码 CJK 字面量。

  #### 批次 5 — 数据正确性与低影响清理（P2）
  1. `attachments/utils.ts:120-139` — `pathToFileUri` 不 percent-encode 路径，空格/Unicode 路径产出 `file:///C:/Users/Foo Bar/baz.txt`，与 `fileUriToPath` 的 `decodeURIComponent` 不对称。修：`pathToFileUri` 路径体 `encodeURI`。加往返测试断言。
  2. `attachments/local-file-attachment-store.ts:194-203` — `garbageCollect` 用 `split(".", 1)` 推断 attachment id，id 格式一旦含点或扩展名解析错位会把存活附件当垃圾删。修：按最后一个点切扩展名，或存 id→filename 映射。
  3. `utils/time.ts:34` — `formatTimeAgo` 硬编码 `"en-US"` 月份，`zh-CN` 用户仍看英文月份。修：传活动 i18n locale 或 `undefined`。
  4. `composer/input/input.tsx:1462-1465` — `pointerEvents` 用 `useAnimatedStyle` 驱动，web 走 DOM style 可行，native 上 `pointerEvents` 是 view prop 不能由 style 输出驱动。修：native 用 `useAnimatedProps`，或 `useAnimatedReaction` + `runOnJS` 切 React state。
  5. `generative-ui/registry/registry.ts:66,73` — `validateProps` 的 throw 消息含未截断 `componentId` / zod error，流入错误遥测，而 `validateActionPayload`（`:89,98,104`）已 `slice(0,128)`。修：统一 128 截断。
  6. Barrel `index.ts` re-export 清理（5 处）：`assistant-file-links/index.ts`、`subagents/index.ts`、`review/index.ts`、`components/markdown/index.ts`、`components/drag-reorder/index.ts` — 违反 AGENTS.md「Do not add barrel re-export files just for convenience」。修：合理的加一行 intent 注释，纯便利的迁移消费方深导入后删。
  7. 公共 util 补 JSDoc（AGENTS.md 规则）：`utils/agent-snapshots.ts:19` `normalizeAgentSnapshot`、`attachments/utils.ts` `parseDataUrl`/`pathToFileUri`/`fileUriToPath`、`utils/score-match.ts` `scoreMatch`、`utils/github-refs.ts` `extractGithubRefs` 等。修：补 `/** ... */` + `@param`/`@returns`。
  8. `stores/session-store.ts:491-496` — `areServerCapabilitiesEqual` / `areServerInfoFeaturesEqual` 用 `JSON.stringify` 比较，key 顺序敏感、`undefined` 字段丢失，daemon 发同值不同序误报「变更」触发全 session 消费者重渲染。修：用已导入的 `fast-deep-equal`。
  9. `composer/input/input.tsx:1337-1341` — `useEffect(()=>()=>onFocusChange?.(false),[onFocusChange])`，父组件换 `onFocusChange` 身份即收到假 blur。修：ref 存最新回调，仅 unmount 时 emit。
  10. `components/message.tsx:1914,1928` — Todo 列表 `key={item.text}` 可碰撞，重复/可编辑文本会 key 碰撞致状态错位。修：给 `TodoEntry` 加稳定 `id`。
  11. `polyfills/screen-orientation.ts:1` — 用 `typeof window` 而非 `isWeb` 守卫 DOM，违反 AGENTS.md 约定。修：`if (!isWeb) return;`，import `isWeb` from `@/constants/platform`。
  12. `desktop/host.ts:133-150` — `isElectronRuntime` / `isElectronRuntimeMac` 与 `constants/platform.ts` 的 `getIsElectron` 双检测源可分歧。修：统一到单一 gate。
  13. `utils/download-text-file.ts:24` — `window.setTimeout(() => URL.revokeObjectURL(href), 0)` 慢机下载未开始即撤销。修：延至 ~1000ms 或 anchor 事件 tick。
  14. `utils/extract-tool-call-file-path.ts:44-52` — `extractFromShellCommand` 三 token 分支不认长 flag（`--verbose`）作分隔。修：中位 token 也接受 `^--`。
  15. `voice/voice-runtime.ts:283` — `toPlaybackSource` 返回 `Uint8Array.from(bytes).buffer`，对非零 `byteOffset` 的 `Buffer` 会前置垃圾字节。修：`bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)`。
  16. `utils/os-notifications.ts:163` — `attachWebClickHandler` 的 `Notification` click 监听无移除路径。修：click 内 dispatch 后 `removeEventListener`。
  17. `hooks/use-keyboard-shortcuts.ts:117-129` — command-center 动态 import 无 `.catch`，bridge 未就绪时静默 no-op 且每次重新 import。修：加 catch + 缓存模块。
  18. `hooks/use-keyboard-shortcuts.ts:241-242` — `window.blur` 重置修饰键打断进行中和弦（聚焦 iframe/devtools 时 `altDown` 被清）。修：仅在 `visibilitychange → hidden` 重置，或 visible 时忽略 blur。
  - **验收**：聚焦测试 + App typecheck + 目标 lint；附件/路径类加往返测试断言；`pointerEvents` 改动需在 native 验证（遵循「不以 Web 代替 native」）。

- **状态**：批次 1（运行时竞态与挂死，6 项）与批次 2（安全注入面，4 项）已完成并验收（2026-07-22）。批次 1：`maybeActivateFirstAvailable` 加 `PROBE_ACTIVATE_MAX_ATTEMPTS=3` 上限防自旋；`runConfiguredOverrideBootstrap` 加 `CONFIGURED_OVERRIDE_BOOTSTRAP_MAX_ATTEMPTS=30` 上限；desktop daemon transport `send` 改为 open 前缓冲并在 `emitOpen` flush，`close` 清空队列；terminal `finalizeOperation` 捕获 `owningTerminal` 身份，跨 mount/late-callback 不再重入 `processOutputQueue`；`useAppVisible` 全局监听器改模块级单例 + 引用计数；`workspace-terminal-session` release 归零改 `RELEASE_GRACE_MS=5_000` 延迟删除，`get`/`retain` 取消 pending teardown。批次 2：`openExternalUrl` 加 `http/https/mailto/tel/sms` scheme 白名单，非法 scheme 静默忽略（避免 fire-and-forget 调用方 unhandled rejection）；`generative-ui-html` CSP 默认 `script-src 'none'`，新增 `allowScripts` opt-in flag；`terminal-emulator-runtime` `__chisacodeTerminal` 全局暴露加威胁模型注释；`desktop/electron/events` 删除错误的 envelope 解包（经核实 bridge 实际直接透传 raw payload，原 `"payload" in rawEvent` 解包是误判），改为直接透传。验收：全包 `tsc --noEmit -p packages/app` ✅ 无错误，全包 `oxlint packages/app/src` ✅ 0 warning/0 error；批次 1 聚焦测试 4 文件 62 断言全绿（含更新 `workspace-terminal-session` 测试覆盖 grace 复用 + 超时驱逐两条路径），批次 2 `generative-ui-html` 11 断言 + `desktop-daemon-transport` 4 断言全绿。门禁基线保持。批次 3（性能与无界重渲染，8 项）已完成 7 项并验收（2026-07-22）：`useVoiceOptional` 用 `useMemo([snapshot, runtime])` 稳定返回对象；`useKeyboardActionHandler` deps 改用 `actions.join(",")` 按值比较避免内联数组身份抖动；`useIosHardwareKeyboardSubmit` 的 `controller.setOnSubmit` 从 render 阶段移到 `useEffect`；`usePasteImagesEffect` deps 去掉 `isDictating`/`isRealtimeVoice` 改用 ref guard；`agent-stream/model.ts` 四个 WeakMap 内层 Map 加 `CACHE_INNER_MAX_ENTRIES=8` LRU 上限 + `setBoundedCacheEntry` helper；`use-dictation-audio-source.web.ts` 返回对象用 `volumeRef` + getter 使对象引用稳定（deps 仅 start/stop），消除 volume 抖动级联；`input.tsx` 两个 keypress handler 改 `useCallback`、`keyPressHandler` 改 `useMemo`。批次 3 项 2（`useUnistyles()` 50+ 组件系统性迁移）标注为待启动子任务，按子树分批独立验收。验收：typecheck ✅、目标 lint ✅、`agent-stream/model.test.ts` 22 断言 + `input/state.test.ts` 7 断言全绿。批次 4（i18n 全量化）已完成并验收（2026-07-23）：在 `i18n/index.ts` 的 zh/en 双块对称补齐所有缺失 key（`fileExplorer.sortName/sortModified/sortSize/workspaceUnavailable/back/noFiles`、`message.spokenLabel/activityDetails/todoEmpty/todoWorkbenchTitle`、`browser.cancelElementSelector/selectElement`、`review.rewindToMessage/rewindWarning`、`sidebar.dragResizeWidth`、`workspace.generativeHtmlPreviewTitle/Subtitle/Preview/Source/FrameTitle/hoverCardCheck/hoverCardScripts/diffOpenInPane/projectPicker*/questionForm*`、`mcpServers.*`、`usageStatistics.*`）；12 个文件的硬编码中文字面量全部替换为 `t()` 调用——`file-explorer-pane.tsx`（排序标签 + 错误/空态，sort 数组移入 `useMemo` deps 含 `paneT`）、`message.tsx`（已朗读/详情/空态/标题）、`rewind-menu.tsx`（回退提示 + 警告 + a11y label）、`browser-pane.electron.tsx`（元素选择器 a11y label）、`generative-html-preview.tsx`（标题/副标题/模式按钮/框架标题）、`workspace-hover-card.tsx`（检查/脚本 a11y label）、`left-sidebar.tsx`（拖拽宽度 a11y label）、`diff-viewer.tsx`（打开按钮，a11y label 保留英文）、`project-picker-modal.tsx`（搜索/打开中/空态/添加/不使用）、`question-form-card.tsx`（提交/用户已关闭）、`mcp-servers-section.tsx`（系统内置/校验错误 throw/环境变量/请求头）、`usage-statistics-section.tsx`（本地用量/Provider 配额，模块级数组改组件内 `useMemo` 动态 `t()`）。验收：全包 typecheck ✅、目标 lint ✅（0 warning/0 error，含修复 `handleSortCycle` deps 缺 `SORT_OPTIONS`）、16 个聚焦断言全绿（message 6 + question-form + usage-statistics-model + workbench-fidelity）；`mcp-servers-section.test.tsx` 1 个失败为既有 JSDOM 测试问题（baseline 同样失败，`SyntaxError: Unexpected token 'typeof'` + `act(...)` 未配置，非本次引入）。批次 5（数据正确性与清理，18 项）已完成 16 项并验收（2026-07-22）：`pathToFileUri` 路径体加 `encodeURI` 与 `fileUriToPath` 解码对称；`garbageCollect` id 推断改按最后点切扩展名边界；`formatTimeAgo` 月份 locale 从硬编码 `"en-US"` 改 `undefined`（尊重 OS locale）；`input.tsx` overlay `pointerEvents` 从 `useAnimatedStyle` 移到 `useAnimatedReaction`+`runOnJS`+React state 驱动的 view prop（native 兼容）；`registry.ts` `validateProps` 错误消息统一 `slice(0,128)` 截断；3 个 barrel（`subagents/index.ts`、`review/index.ts`、`assistant-file-links/index.ts`）加 intent 注释标明为有意模块公共面；`session-store` `areServerCapabilitiesEqual`/`areServerInfoFeaturesEqual` 从 `JSON.stringify` 改 `fast-deep-equal`（已导入）消除 key 顺序敏感性；`input.tsx` `onFocusChange` 假 blur 改用 ref 存最新回调，仅 unmount emit；`message.tsx` Todo `key={item.text}` 碰撞风险加注释标明需 protocol 层加 `TodoEntry.id`（oxlint 禁 index key，保留 text key + 注释）；`screen-orientation.ts` 加 `isWeb` 守卫；`desktop/host.ts` `isElectronRuntime` 与 `getIsElectron` 语义差异加 JSDoc 说明（readiness gate vs environment detector，有意分离）；`download-text-file.ts` revoke 延迟从 0ms 改 1000ms；`extract-tool-call-file-path.ts` 中位 token 接受 `--` 长 flag；`voice-runtime.ts` `toPlaybackSource` `arrayBuffer` 改 `new Uint8Array(bytes).slice().buffer` 避免非零 byteOffset 前置垃圾字节；`os-notifications.ts` click 监听改用具名函数 + `removeEventListener`（类型扩展加可选 `removeEventListener`）；`use-keyboard-shortcuts.ts` command-center 动态 import 加模块级 promise 缓存 + `.catch` 日志，`handleBlurOrHide` 仅在 `visibilityState==="hidden"` 时重置修饰键。批次 5 项 7（公共 util JSDoc）标注为待启动子任务。验收：全包 typecheck ✅、目标 lint ✅（0 warning/0 error）、49 个聚焦断言全绿（`extract-tool-call-file-path` 15 + `voice-runtime` 17 + `attachments/utils` 9 + `local-file-attachment-store` 1 + `input/state` 7）；`time.test.ts` 1 个断言失败为既有 locale flaky（baseline 同样失败，测试环境 zh-CN 与断言英文 "Monday" 冲突，非本次引入）。批次 3 项 2（`useUnistyles()` 50+ 组件系统性迁移）已完成首批最高 churn 三子树并验收（2026-07-23）：`combined-model-selector.tsx`（5 调用全部移除，icon color/size 改 `withUnistyles` + `uniProps` mapping 函数，新增 `IconColorMapping` 类型，嵌套三元改 if-else）、`adaptive-modal-sheet.tsx`（4 调用全部移除，sheet background/title/handle 改 `StyleSheet.create` factory key，icon color 改 `withUnistyles` + mapping）、`command-center.tsx`（3 调用全部移除，icon color 改 `withUnistyles` + mapping，TextInput placeholderTextColor 改 `withUnistyles`，inline style override 改 factory key）。验收：typecheck ✅、目标 lint ✅（0 warning/0 error）、`combined-model-selector.test.ts` 3 断言全绿。剩余 useUnistyles 调用点（panel/sidebar/agent 等中低 churn 子树）留作后续分批迁移。批次 5 项 7（公共 util JSDoc）已完成首批并验收（2026-07-23）：`agent-snapshots.ts`（`derivePendingPermissionKey`/`normalizeAgentSnapshot`）、`score-match.ts`（`MatchScore`/`scoreMatch`/`compareMatchScores`/`scoreTextFields`）、`github-refs.ts`（`GithubRefKind`/`GithubRemote`/`GithubRef`/`normalizeGithubRemote`/`parseGithubRef`/`extractGithubRefs`）、`attachments/utils.ts`（`generateAttachmentId`/`normalizeMimeType`/`parseDataUrl`/`parseImageDataUrl`/`pathToFileUri`/`fileUriToPath`）。验收：typecheck ✅、lint ✅、`agent-snapshots.test.ts` 4 + `github-refs.test.ts` 17 + `score-match.test.ts` 14 + `attachments/utils.test.ts` 9 断言全绿。批次 3 项 2（useUnistyles 系统性迁移）产品代码已清零：`packages/app/src` 中 `const { theme } = useUnistyles()` 调用点为 0（测试 mock 除外）。分支 `app-audit-optimization` 关键：e8c9a1241（5 批次主体）、cc513afa0（大规模续迁移+utils JSDoc）、c70f3680d（清理临时文件）、69519eb63（roadmap 进度）、908047b7b（settings/new-workspace 收尾）。批次 5 项 7 公共 util JSDoc 已覆盖 utils 目录主体。最新验收：全包 typecheck ✅、oxlint packages/app/src 0/0。 ## 归档批次（2026-06-28）

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
