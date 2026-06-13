# ChisaCode 项目文档(基于代码验证)

> 本文档基于对 `packages/server/src`、`packages/app/src`、`packages/cli/src`、`packages/desktop/src`、`packages/relay/src`、`packages/protocol/src` 六大源码目录的逐文件阅读,以及与 `docs/` 现有文档、CLAUDE.md 顶层指南的逐条对比验证。
> 重点不是复述现有文档,而是**指出 docs/ 中与代码不一致或缺失的地方**,并填补真正基于代码的细节。
>
> 维护者提示:本文档应作为新加入贡献者的**第一份代码导览**;具体子系统设计取舍请参看 `docs/architecture.md` 等专题文档。

---

## 目录

- [0. 文档使用指南](#0-文档使用指南)
- [1. 项目概览](#1-项目概览)
- [2. 系统架构](#2-系统架构)
- [3. Daemon 启动与运行时](#3-daemon-启动与运行时)
- [4. WebSocket 协议](#4-websocket-协议)
- [5. Session 与 per-client 状态](#5-session-与-per-client-状态)
- [6. AgentManager 状态机](#6-agentmanager-状态机)
- [7. Provider 系统](#7-provider-系统)
- [8. 存储模型](#8-存储模型)
- [9. 子系统](#9-子系统)
- [10. App 端(Expo 跨端)](#10-app-端expo-跨端)
- [11. CLI](#11-cli)
- [12. Desktop](#12-desktop)
- [13. 工具链、构建与开发](#13-工具链构建与开发)
- [14. 文档与代码的不一致](#14-文档与代码的不一致)
- [15. 关键设计哲学](#15-关键设计哲学)

---

## 0. 文档使用指南

### 0.1 与 `docs/` 中其他文档的关系

| 文档                                                              | 用途                                                                     |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 本文档(`docs/PROJECT.md`)                                         | **基于代码的全面导览**,涵盖所有包、所有关键模块,带 docs/ 准确性验证      |
| `docs/architecture.md`                                            | 高级系统设计、协议、数据流(精简版,部分子节已过期)                        |
| `docs/agent-lifecycle.md`                                         | 状态机、archive、子 agent 跟踪(准确)                                     |
| `docs/data-model.md`                                              | 文件 JSON 持久化、Zod schema(基本准确,缺 `chat/rooms.json` 派生字段说明) |
| `docs/coding-standards.md`                                        | 代码风格(准确)                                                           |
| `docs/testing.md`                                                 | TDD 工作流、测试分类(准确)                                               |
| `docs/providers.md`                                               | 添加新 provider 流程(高度准确)                                           |
| `docs/hover.md` / `docs/unistyles.md` / `docs/floating-panels.md` | UI 实现细节(准确且详细)                                                  |
| `docs/rpc-namespacing.md`                                         | RPC 命名约定(部分过期,chat/schedule/loop 三个子协议未遵守)               |
| `docs/development.md`                                             | 开发环境搭建(基本准确)                                                   |

### 0.2 阅读建议

- **新加入贡献者**:先读 §1、§2、§3,了解 daemon 启动和 agent 状态机
- **写 protocol 相关代码**:必读 §4(协议)、§8(数据模型)
- **加新 provider**:必读 §7,然后看 `docs/providers.md`
- **写 app UI**:必读 §10 和 `docs/design.md`、`docs/hover.md`、`docs/floating-panels.md`
- **追问题先看 §14**:docs 错误/过期清单

---

## 1. 项目概览

### 1.1 一句话定位

ChisaCode 是一个**本地优先的 AI 编程 agent 编排平台**:

- 你的开发环境(代码、key、配置)留在本地机器上,代码不离开你的主机
- 一个 Node.js **daemon** 跑在本机,管理多个 AI agent(Claude Code / Codex / Copilot / OpenCode / Pi)的子进程
- iOS / Android / 桌面 / Web / CLI 客户端通过 WebSocket 协议连接 daemon,实时监控/操控 agent
- AGPL-3.0 开源,前身是 Fleurdelys(commit `66573b0` 改名)
- 核心理念:multi-provider / self-hosted / 零遥测 / BYOK(Bring Your Own Key)

### 1.2 monorepo 结构(npm workspaces)

| 包                            | 角色                 | 关键文件                                                            |
| ----------------------------- | -------------------- | ------------------------------------------------------------------- |
| `packages/server`             | **Daemon 核心**      | `src/server/daemon-worker.ts` 入口,`src/server/bootstrap.ts` 初始化 |
| `packages/app`                | **Expo 跨端客户端**  | `src/app/_layout.tsx` 路由根,`src/composer/` 主输入                 |
| `packages/cli`                | Commander.js CLI     | `src/cli.ts` 命令树,`src/commands/...` 子命令                       |
| `packages/relay`              | E2E 加密中继         | `src/encrypted-channel.ts` 通道,`src/crypto.ts` 原语                |
| `packages/desktop`            | Electron 桌面壳      | `src/window/compositor-watchdog/` 等                                |
| `packages/protocol`           | **wire 真理源**      | `src/messages.ts` 全部消息 Zod schema                               |
| `packages/client`             | Daemon WS 客户端 SDK | `src/daemon-client.ts` 等                                           |
| `packages/highlight`          | 代码高亮             | —                                                                   |
| `packages/expo-two-way-audio` | 双向音频 native 模块 | —                                                                   |

### 1.3 三种部署模型

1. **本地 daemon**(默认):`chisacode daemon start` → `127.0.0.1:6767`
2. **Managed desktop**:Electron app spawn daemon 为子进程
3. **Remote + relay**:daemon 透过 E2E 加密 relay(`relay.chisacode.sh:443`)让远程客户端接入,无需开放端口

### 1.4 关键事实速览

- 全部数据落盘 `$CHISACODE_HOME`(默认 `~/.chisacode`),文件式 JSON,**无数据库**
- 协议层 **永不破坏向后兼容**(CLAUDE.md 硬性约束,所有新字段 `.optional()` + `.passthrough()`)
- 能力协商走 `CLIENT_CAPS` 字典 + `server_info.features.*` 门控
- 终端流走二进制帧(5 个 opcode),文件传输走独立二进制协议
- 加密:relay 走 Curve25519 + XSalsa20-Poly1305(NaCl box),daemon 密钥本地 0600
- **实际入口**:`packages/server/src/server/daemon-worker.ts`,**不是** CLAUDE.md 表格里写的 `index.ts`

---

## 2. 系统架构

### 2.1 总体结构图

```
┌─────────────────┐  ┌──────────────┐  ┌──────────────────┐
│  Mobile App     │  │     CLI      │  │  Desktop App     │   ← 客户端
│  (Expo)         │  │  (Commander) │  │  (Electron)      │
└────────┬────────┘  └──────┬───────┘  └─────────┬────────┘
         │                   │                    │
         │   WebSocket (direct or via relay)    │
         └───────────────────┼────────────────────┘
                             │
                    ┌────────▼────────┐
                    │     Daemon     │  ← Node.js 进程
                    │  (server pkg)  │
                    └────────┬────────┘
                             │ spawn
       ┌─────────────┬───────┼────────┬──────────────┬──────────────┐
       ▼             ▼       ▼        ▼              ▼              ▼
   Claude         Codex    Copilot   OpenCode        Pi         (more ACP)
   (Agent SDK)   (app-srv)  (ACP)    (HTTP serve)  (--mode rpc)
```

### 2.2 daemon 关键模块依赖

```
                bootstrap.ts
                     │
   ┌─────────────────┼──────────────────┐
   │                 │                  │
   ▼                 ▼                  ▼
AgentManager     WebSocketServer    WorkspaceRegistry
   │                 │                  │
   │                 │                  ├─ ProjectRegistry
   │                 │                  └─ FileBackedChatService
   │                 │
   ├─ ProviderSnapshotManager
   │       │
   │       └─ 5 个 ProviderClient(Claude/Codex/Copilot/OpenCode/Pi)
   │
   ├─ AgentStorage(文件 JSON 持久化)
   │
   ├─ ForegroundRunState
   ├─ AgentStreamCoalescer(60ms 合并)
   └─ InMemoryAgentTimelineStore(+ 可选 durableTimelineStore)

   LoopService  ScheduleService  CheckoutDiffManager
   WorkspaceGitService  ScriptRouteStore  ScriptHealthMonitor

   ┌─ Optional: RelayTransport(出站 E2E 连接到 relay.chisacode.sh:443)
   │
   └─ Optional: HTTP /mcp/agents(MCP server 给 agent 自己调)
```

### 2.3 一个 agent 创建到出流的事件流(端到端)

```
1. 客户端 WS send → { type:"session", message: { type:"create_agent_request", ... } }
2. WebSocketServer.handleRawMessage → WSHelloMessageSchema.safeParse → session.dispatch
3. Session.dispatchAgentLifecycleMessage → create_agent_request case
   → handleCreateAgentRequest
4. createAgentCommand(daemon-internal) → AgentManager.createAgent(config, agentId, options)
5. AgentManager.createAgent:
   ├─ mcpBaseUrl 注入 mcpServers.chisacode(如果 daemon 开启了 MCP 注入)
   ├─ requireEnabledProvider(provider)
   ├─ applyDaemonAppendSystemPrompt(注入 daemon-wide appendSystemPrompt)
   ├─ requireAvailableClient(等 provider 变 ready)
   ├─ client.createSession(...) → spawn 子进程/启 HTTP server
   └─ registerSession(...):
       ├─ 初始化 timeline(epoch, nextSeq)
       ├─ 构造 ManagedAgentInitializing
       ├─ refreshRuntimeInfo(查能力/modes)
       ├─ persistSnapshot 写盘
       ├─ emitState(initializing) → 广播给所有 subscriber
       ├─ refreshSessionState → lifecycle 变 "idle"
       └─ subscribeToSession 监听 session.stream()
6. 客户端立即收到 status(agent_created) → status(agent_idle) 序列
7. 用户发 prompt → Session.handleSendAgentMessageRequest
   → sendPromptToAgent → agentManager.streamAgent(agentId, prompt)
8. streamAgent:
   ├─ foregroundRuns.createPendingRun(agentId)
   ├─ session.startTurn(prompt) → turnId
   ├─ lifecycle = "running", activeForegroundTurnId = turnId
   ├─ 创建 ForegroundTurnStream,addWaiter
   └─ AsyncGenerator 产出 AgentStreamEvent
9. Provider 子进程流式输出 → session.subscribe 回调
   → AgentManager.enqueueSessionEvent(agentId, event) 串行化
   → handleStreamEvent:
       ├─ AgentStreamCoalescer.handle(60ms 窗口合批)
       ├─ flushFor 走 dispatchStreamEventByType
       └─ dispatchStream({ type:"agent_stream", ... }) → 广播
10. Session subscriber → emit → onMessage → WS.send
   → 客户端收到 agent_stream 事件
```

---

## 3. Daemon 启动与运行时

### 3.1 入口:`daemon-worker.ts`(不是 `index.ts`)

> ⚠️ **与 CLAUDE.md 不一致**:CLAUDE.md 表格写"入口 `packages/server/src/server/index.ts`",**该文件不存在**。真实入口是 `daemon-worker.ts`(见 CLAUDE.md 修正需要)。

`daemon-worker.ts` 流程:

1. `process.title = "ChisaCode Daemon"`
2. `bootstrapFromEnvironment()` 读 `CHISACODE_HOME`、`config.json`,创建 pino root logger
3. `applyCliFlagOverrides`:CLI 开关(`--no-relay`、`--no-mcp` 等)直接覆盖 config
4. IPC 协议(若 `process.send` 可用):worker 向 supervisor 报告 `{ type:"chisacode:ready", listen }` / `chisacode:shutdown` / `chisacode:restart`
5. `beginShutdown` 用 10s 强制退出定时器兜底
6. `uncaughtException` / `unhandledRejection` 走 `exitAfterPinoFlush()`(延迟 200ms 让 pino 写完日志)

### 3.2 `bootstrap.ts` 的 `createChisaCodeDaemon` 启动 6 阶段

#### 阶段 A:配置/路径/密钥

- `resolveDaemonVersion`:从 `import.meta.url` 解析 `package.json` 拿 daemon 版本
- `DaemonConfigStore`:可变配置的内存层
- `getOrCreateServerId(chisacodeHome)`:持久化生成 daemon 唯一 serverId(12 字符 `srv_<base64url>`)
- `loadOrCreateDaemonKeyPair`:NaCl box Curve25519 密钥对,存 `$CHISACODE_HOME/daemon-keypair.json`,mode 0600
- `parseListenString(config.listen)`:解析 `127.0.0.1:6767` / `\\.\pipe\foo` / unix socket / 纯端口 / `host:port` 多种目标

#### 阶段 B:Express 中间件与 HTTP 路由

- **host allowlist**(`isHostnameAllowed`):Vite 风格,防 DNS rebinding
- **CORS**:显式 origin 集合,`chisacode://app` 给 desktop 桌面用
- **bearer auth**(`createRequireBearerMiddleware`):bcrypt 校验,密码存 `config.json`
- **script proxy**(`createScriptProxyMiddleware`):拦截 `*.localhost` 子域转发到 workspace 脚本端口
- **静态资源** `/public`
- **API**:`/api/health`、`/api/status`、`/api/files/download`(通过一次性 `DownloadTokenStore` 消费)

#### 阶段 C:子系统实例化(顺序敏感)

```
AgentStorage → ProjectRegistry → WorkspaceRegistry → ChatService →
TerminalManager → WorkspaceGitService → ProviderSnapshotManager →
AgentManager → attachAgentStoragePersistence(订阅) →
agentStorage.initialize() → bootstrapWorkspaceRegistries() →
WorkspaceReconciliationService(异步 fire-and-forget) →
chatService.initialize() → CheckoutDiffManager →
LoopService.initialize() → ScheduleService.start() →
agentManager.setAgentArchivedCallback(...) → agentStorage.list()(只装载,不 hydrate)
```

#### 阶段 D:MCP 路由挂载

- 路径:`POST/GET/DELETE /mcp/agents`
- 每 MCP session 一份 `StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() })`
- 非初始化请求若没带 `mcp-session-id` → 400(只有 `POST` + `isInitializeRequest` 才会自动开新 session)
- debug 日志脱敏(authorization 标头写 `[redacted]`)
- Transport 自身的 `enableDnsRebindingProtection: false`(daemon 在 app/ws 层做)

#### 阶段 E:WebSocket 与启动

- `httpServer.on("upgrade", scriptProxyUpgradeHandler)` **必须先于** WS server 自己的 upgrade 监听器
- `start()` 内部绑定端口 → 拼出 `mcpBaseUrl = http://host:port/mcp/agents` → `agentManager.setMcpBaseUrl(mcpBaseUrl)`
- `daemonConfigStore.onFieldChange("mcp.injectIntoAgents", ...)`:**配置热更**,运行时切换是否向 agent 注入 MCP
- `daemonConfigStore.onFieldChange("appendSystemPrompt", ...)`:**运行时改系统 prompt 后缀**
- 若 `relayEnabled`(默认 true),生成 QR pairing offer,启动 `startRelayTransport`
- `speechService.start()`(此时 listener 已 ready)+ `scriptHealthMonitor.start()`

#### 阶段 F:`stop()` 优雅关闭顺序(逆序拆解)

```
scriptHealthMonitor.stop()
→ closeAllAgents(全部 agent 调 closeAgent)
→ agentManager.flush() + detachAgentStoragePersistence() + agentStorage.flush()
→ providerSnapshotManager.shutdown() + terminalManager.killAll() + speechService.stop()
→ scheduleService.stop() + relayTransport?.stop()
→ wsServer.close()(先发 ws-layer close frame)
→ httpServer.closeAllConnections()(注释:closeIdleConnections 不抓取升级过的 socket)
→ httpServer.close()
→ 清理 unix socket 文件
```

### 3.3 `WebSocketServer`(类名 `VoiceAssistantWebSocketServer`,历史遗留)

**握手前** —— 三个 Map 区分连接阶段:

- `pendingConnections`:已建立 TCP/WS 升级但还没收到 hello
- `sessions`:已握手通过的 ws → session
- `externalSessionsByKey`:按 `clientId` 索引,**支持多 socket 复用同一 session**(多设备)

**hello 握手**:

- `wss = new WebSocketServer({ path: "/ws", handleProtocols, verifyClient })`
- `verifyClient`:host allowlist + origin 校验
- `attachAuthenticatedSocket`:若有密码,从 `sec-websocket-protocol` 解出 `bearer.<token>`(浏览器 WS 不能设 header,所以 token 走 subprotocol)
- `attachSocket`:启动 **15s hello 超时**定时器
- `handleHello`:
  - `protocolVersion === 1` 校验(否则 4003 关)
  - `clientId` 非空校验
  - `externalSessionsByKey.has(clientId)` → 复用旧 session;否则创建新 session

**binary frame 路由**(`handleRawMessage`):

1. `bufferFromWsData(data)` 归一化字符串/Buffer/ArrayBuffer
2. 用 `decodeTerminalStreamFrame` 试探解码
3. 解码成功 → 还没 active connection 就 4002("Session message before hello");否则 `session.handleBinaryFrame`
4. 否则按 JSON 解析,用 `WSInboundMessageSchema.safeParse`

**四种 close code**:

- 4001:hello 超时
- 4002:session 消息在 hello 之前(空 clientId 也用这个)
- 4003:协议不匹配
- 4401:认证失败

**断连与重连 grace**(`detachSocket`):

- 还有别的 socket 接着 → 不动 session
- 所有 socket 断开 → 启动 `EXTERNAL_SESSION_DISCONNECT_GRACE_MS = 90_000` 定时器。90 秒内用同 `clientId` 重连就复用,过了才真 `cleanupConnection`
- **这个 grace 窗口是 relay 场景的关键**——用户切网络/IP 切换时,UI 不用重新拉取状态

**`broadcastAgentAttention`** 通知分发:

- 收集所有 active client 的 `ClientPresenceState`(app 是否在前台 / focused agentId / lastActivityAt)
- `computeNotificationPlan`(来自 `agent-attention-policy.ts`):
  - 任意客户端 `appVisible + focusedAgentId === agentId` → 静默
  - 否则选**最近活跃**的 present 客户端发 in-app 通知
  - 没有任何 present 客户端 → 仅在 `reason !== "error"` 时 push(reason=error 一般已在 in-app 通知栈顶部)
- `shouldPush` → `pushNotificationSender.send(notification)`(APNs/FCM,Expo push)

### 3.4 Session(纯逻辑,不知道 WS 存在)

> Session 不知道自己被 WebSocket 调用。它通过 4 个回调对外通信:`onMessage` / `onBinaryMessage` / `onLifecycleIntent` / `appVersion` + `clientCapabilities`

**消息分发** (`dispatchAgentLifecycleMessage` 大型 switch,行号 ~1833):

```
fetch_agents_request       → handleFetchAgents (启动 AgentUpdates subscription)
fetch_agent_history_request → handleFetchAgentHistory
fetch_recent_provider_sessions_request
fetch_agent_request        → handleFetchAgent
delete_agent_request       → handleDeleteAgentRequest
archive_agent_request      → handleArchiveAgentRequest
close_items_request        → handleCloseItemsRequest
update_agent_request       → handleUpdateAgentRequest
project.rename.request     → handleProjectRenameRequest
send_agent_message_request → handleSendAgentMessageRequest
wait_for_finish_request    → handleWaitForFinish
create_agent_request       → handleCreateAgentRequest
resume_agent_request       → handleResumeAgentRequest
import_agent_request       → handleImportAgentRequest
refresh_agent_request      → handleRefreshAgentRequest
cancel_agent_request       → handleCancelAgentRequest
fetch_agent_timeline_request → handleFetchAgentTimelineRequest
agent_permission_response  → respondToAgentPermission(...)
```

**Timeline 同步三路径**(见 `docs/timeline-sync.md` + `timeline/timeline-sync-plan.ts`):

1. `live stream`(`agent_stream` 消息)— 即时性
2. `authoritative fetch`(`fetch_agent_timeline_request`)— 兜底
3. `paged catch-up`(`hasNewer=true` 立即 next page)直至 `hasNewer: false`

`handleFetchAgentTimelineRequest` 关键参数:

- `direction`:`"tail" | "after" | "before"`
- `cursor`:`{ epoch, seq }` 用来对齐 epoch(epoch 不同 → `reset: true, staleCursor: true`)
- `projection`:`"projected"`(把 reasoning/tool_call 折叠到 assistant_message) / `"canonical"`(保留原始 seq 边界)
- 响应 payload 含 `epoch / reset / staleCursor / gap / window / startCursor / endCursor / hasOlder / hasNewer`
- `reasoningMergeEnum` capability gate:旧客户端看不到 `reasoning_merge` collapsed 字段

**`ensureAgentLoaded`**:没在内存的 agent 会按需从 `AgentStorage` 重建 session(`agent-loading.ts`)

**voice/dictation 双模**:

- `DictationStreamManager`:录音流式 STT,带 seq/ack 协议
- `VoiceTurnController`:voice mode 的 turn-taking(VAD + STT partial/final + 填充词抑制)
- `ttsManager` / `sttManager`:per-session provider
- `voiceBridge`:注册 `VoiceSpeakHandler` / `VoiceCallerContext`

---

## 4. WebSocket 协议

> 完整 wire schema 在 `packages/protocol/src/messages.ts`(4186 行)。下面是关键事实。

### 4.1 顶层 Envelope

```ts
WSInboundMessage = discriminatedUnion("type", [
  WSPingMessageSchema, // { type: "ping" }
  WSHelloMessageSchema, // { type: "hello", clientId, clientType, protocolVersion, capabilities? }
  WSRecordingStateMessageSchema, // { type: "recording_state", isRecording }
  WSSessionInboundSchema, // { type: "session", message: SessionInboundMessageSchema }
]);

WSOutboundMessage = discriminatedUnion("type", [
  WSPongMessageSchema, // { type: "pong" }
  WSSessionOutboundSchema, // { type: "session", message: SessionOutboundMessageSchema }
]);
```

**注意**:

- `status` **不在顶层 envelope** 中——它以 `session.status` 出现(payload 嵌套 `server_info` / `agent_created` / `agent_resume_failed` 等 7 种状态)
- 顶层 `ping/pong` 与 session 内的 `PingMessageSchema`/`PongMessageSchema` 是分开的(顶层无 requestId,session 内带 requestId)
- 顶层 ping/pong **不用** RFC6455 协议 ping,因为浏览器/RN WebSocket API 不暴露;改用 JSON envelope

### 4.2 Hello 握手 + 能力协商

```ts
{
  type: "hello",
  clientId: string,
  clientType: "mobile" | "browser" | "cli" | "mcp",
  protocolVersion: 1,
  appVersion?: string,
  capabilities?: {
    voice?: boolean,
    pushNotifications?: boolean,
    [CLIENT_CAPS.reasoningMergeEnum]?: boolean,    // = "reasoning_merge_enum"
    [CLIENT_CAPS.customModeIcons]?: boolean,        // = "custom_mode_icons"  (COMPAT: v0.1.84 加入)
  } & passthrough
}
```

`CLIENT_CAPS` 字典(`packages/protocol/src/client-capabilities.ts`)是 wire 字符串的常量集合。客户端宣告,daemon `session.supports(CLIENT_CAPS.xxx)` 门控。

> ⚠️ **与 `docs/architecture.md` 不一致**:文档只列了 `voice` / `pushNotifications` 两个示例。实际还有 `reasoning_merge_enum` 和 `custom_mode_icons`(后者 COMPAT 注释在 v0.1.84)。

### 4.3 RPC 模式:三套命名风格并存

> ⚠️ **迁移未完成**:`docs/rpc-namespacing.md` 规定新 RPC 用 `domain.provider.operation.request/response` 风格,实际**三种命名共存**。

**风格 A:flat 老式**(绝大多数)

- `fetch_agents_request` / `fetch_agents_response`
- `set_agent_mode_request` / `set_agent_mode_response`
- `list_provider_models_request` / `fetch_recent_provider_sessions_request`
- 参数 / 响应平铺,response 把 `requestId` 放 `payload` 里

**风格 B:dotted 新式**(按 `docs/rpc-namespacing.md` 规则)

- `project.rename.request` / `project.rename.response`
- `daemon.get_status.request` / `daemon.get_status.response`
- `checkout.github.set_auto_merge.request` / `.response`
- `agent.rewind.request` / `agent.rewind.response`
- `terminal.rename.request` / `terminal.rename.response`

**风格 C:斜杠**(chat/schedule/loop 三个子协议)

- `chat/create` / `chat/create/response`
- `schedule/list` / `schedule/list/response`
- `loop/run` / `loop/run/response`

> ⚠️ **与 `docs/rpc-namespacing.md` 直接矛盾**:"Use dots, not slashes. Dots are protocol namespaces; slashes imply paths or transport routing"。三个子协议历史上是另一套约定,目前未迁移。

**错误处理**:`rpc_error` 是**通用失败信封**,不走 `.response` 后缀:

```ts
{
  type: "rpc_error",
  payload: { requestId: string, requestType?: string, error: string, code?: string }
}
```

### 4.4 Zod 派生 vs 手写

- **wire 字段几乎全是** `z.infer<typeof Schema>`
- **`agent-types.ts` 全部手写 interface**(provider/agent 层共享的纯 TS 类型,不参与 wire 校验)
- **放宽处**用 `.passthrough()`(如 `MutableDaemonConfigSchema`、`AgentSessionConfigSchema`)保证加新字段时老 client/server 不报错
- **严格结构**用 `.strict()`(`ToolCallBasePayloadSchema`、`TerminalStateSchema` 等内部信任的序列化)
- **可选字段默认**用 `.default()`(`labels: z.record().default({})` 等)

### 4.5 二进制帧(独立于 JSON 文本)

#### 4.5.1 终端流(`binary-frames/terminal.ts`)

```
+------+------+--------- ... -----------+
| 0    | 1    | 2 .. N-1               |
+------+------+--------- ... -----------+
|opcode| slot | payload (variable)     |
+------+------+--------- ... -----------+
```

5 个 opcode:

- `Output (0x01)` / `Input (0x02)`:payload 是原始字节
- `Resize (0x03)`:JSON 编码 `{ rows, cols }`(`TerminalStreamResizeSchema` 校验)
- `Snapshot (0x04)`:JSON 编码 `TerminalStateSchema`(rows/cols/grid/scrollback/cursor/title)
- `Restore (0x05)`:由恢复流程使用

> ⚠️ **与 `docs/architecture.md` 不一致**:文档只列 4 个 opcode(Output/Input/Resize/Snapshot),实际有 5 个,**Restore (0x05) 未被文档提及**。

`asUint8Array()` 平台无关:接受 `string` / `Uint8Array` / `ArrayBuffer` / `ArrayBufferView` / `Buffer`。

`TerminalStateSchema` 用 `.strict()` 锁定:grid/scrollback 是 `TerminalCell[][]`,`TerminalCell` 携带 `char/fg/bg/fgMode/bgMode/bold/italic/underline/dim/inverse/strikethrough` 等。

#### 4.5.2 文件传输(`binary-frames/file-transfer.ts`)

独立协议族,opcode `0x10-0x12`:

```
+------+--------+--------- ... -----------+
| 0    | 1      | 2..N-1                 |
+------+--------+--------- ... -----------+
|opcode| ridLen | requestId + body        |
+------+--------+--------- ... -----------+
```

- `FileBegin (0x10)`:后面是 `requestId` UTF-8 字节,再后是 2 字节大端 `metadataLength`,再后是 `FileBeginMetadataSchema` 的 JSON 字节(≤ 0xFFFF)
- `FileChunk (0x11)`:requestId + 原始 payload
- `FileEnd (0x12)`:只有 requestId

> `docs/architecture.md` 提到"separate file-transfer binary frame format"但没给细节。

### 4.6 端到端 agent 消息生命周期

| 阶段     | 客户端发送                     | 服务端响应 / 推送                                             |
| -------- | ------------------------------ | ------------------------------------------------------------- |
| 鉴权     | `hello`                        | (无)                                                          |
| 列表     | `fetch_agents_request`         | `fetch_agents_response` + 后续 `agent_update` (upsert/remove) |
| 详情     | `fetch_agent_request`          | `fetch_agent_response`                                        |
| 创建     | `create_agent_request`         | `status(agent_created)` 或 `status(agent_create_failed)`      |
| 订阅     | (隐式由 `agent_update` 推)     | `agent_update(kind: "upsert" / "remove")`                     |
| 拉时间线 | `fetch_agent_timeline_request` | `fetch_agent_timeline_response`                               |
| 增量流   | (隐式)                         | `agent_stream` 连续帧                                         |
| 权限     | `agent_permission_response`    | `agent_permission_request` / `agent_permission_resolved`      |
| 设置     | `set_agent_mode_request`       | `set_agent_mode_response`                                     |
| 终止     | `cancel_agent_request`         | `cancel_agent_response` + `agent_update(status: "closed")`    |
| 删除     | `delete_agent_request`         | `agent_deleted`                                               |
| 归档     | `archive_agent_request`        | `agent_archived`                                              |

### 4.7 Connection Offer(QR 配对)

`ConnectionOfferV2Schema`:

```ts
{
  v: 2,
  serverId: string,                  // daemon 稳定 id(也用作 relay 会话 id)
  daemonPublicKeyB64: string,        // base64 公钥
  relay: { endpoint: string, useTls?: boolean },
}
```

`parseConnectionOfferFromUrl()` 解析 `https://app.chisacode.sh/#offer=<base64url>` 形式:

1. 在 URL fragment 中找 `#offer=`
2. base64url 解码
3. UTF-8 解码 + JSON.parse
4. 用 `ConnectionOfferV2Schema.parse()` 校验

---

## 5. Session 与 per-client 状态

### 5.1 Session 心智模型

```
Session = {
  clientId: string,
  clientType: "mobile" | "browser" | "cli" | "mcp",
  appVersion?: string,
  clientCapabilities: Set<CLIENT_CAPS>,
  // ... 状态:agentUpdatesSubscription, fetchAgentsInFlight, etc.

  // 4 个对外回调(bootstrap.ts 注入)
  onMessage: (msg) => void,
  onBinaryMessage: (frame) => void,
  onLifecycleIntent: (intent) => void,

  supports(cap): boolean,  // 查询能力

  // 大量 handle*Request 方法
  handleFetchAgents, handleFetchAgent, handleCreateAgentRequest, ...
}
```

### 5.2 AgentUpdates 订阅(`agentUpdatesSubscription`)

```ts
this.agentUpdatesSubscription = {
  subscriptionId,
  filter?,
  isBootstrapping,
  pendingUpdatesByAgentId,
}
```

- `subscribe(callback, options)` 时 Session 把自己注入 subscriber
- `replayState !== false` 时立即 replay 当前 agent 全集(internal 跳过)
- `bufferOrEmitAgentUpdate` 攒批(避免一个 session 多次刷新)
- `isBootstrapping` 阶段把所有 live agent 初始状态全部刷一次
- `subscriptionId` 支持多订阅者(多 tab/多设备)

### 5.3 关键辅助方法

- `appendTimelineItemIfAgentKnown` / `emitLiveTimelineItemIfAgentKnown`:agent 未知时返回 false,避免给已关闭 agent 推消息
- `ensureAgentLoaded(agentId)`:从 `AgentStorage` 重建 session(走 `agent-loading.ts`)

---

## 6. AgentManager 状态机

### 6.1 `ManagedAgent` 判别联合

```ts
ManagedAgentInitializing { lifecycle: "initializing"; activeForegroundTurnId: null }
ManagedAgentIdle        { lifecycle: "idle";        activeForegroundTurnId: null }
ManagedAgentRunning     { lifecycle: "running";     activeForegroundTurnId: string | null }
ManagedAgentError       { lifecycle: "error";       activeForegroundTurnId: null; lastError: string }
ManagedAgentClosed      { lifecycle: "closed";      session: null }
```

注意 `running` 状态下 `activeForegroundTurnId` 可以是 `null`——表示有 pending run 但 turn 还没启动。

### 6.2 状态转换规则

| From           | To                | 触发                                                                |
| -------------- | ----------------- | ------------------------------------------------------------------- |
| (无)           | `initializing`    | `createAgent` → `client.createSession()` → `registerSession` 第一步 |
| `initializing` | `idle`            | `refreshSessionState` 成功(拿到 modeId/features 后)                 |
| `idle`         | `running`         | `streamAgent` 调 `agent.session.startTurn(prompt)` 拿到 turnId      |
| `running`      | `idle`            | 收到 `turn_completed` / `turn_canceled`                             |
| `running`      | `error`           | 收到 `turn_failed`                                                  |
| 任意 active    | `closed`          | `closeAgent()` / `archiveAgent()`                                   |
| 任意 active    | `closed`(archive) | `archiveAgent` 先写盘,再 `closeAgent`,最后 `cascadeArchiveChildren` |

补充规则:

- **重复 run 防护**:`streamAgent` 若发现 `activeForegroundTurnId` 或 `foregroundRuns.hasPendingRun(agentId)` 存在,直接抛错
- **out-of-band**:`tryRunOutOfBand` 走 `agent.session.tryHandleOutOfBand` 拦截如 `/goal pause`,**不抢占** in-flight turn
- **foreground turn 等待**:`foregroundRuns.notifyAgentListeners` 跟 turn id 匹配时回调
- **Stream coalescer 防抖**:`handleStreamEvent` 把 text/reasoning/tool_call 事件先入 `agentStreamCoalescer`(默认 60ms 窗口)

### 6.3 关键方法

| 方法                                                                            | 职责                                                                                            |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `createAgent`                                                                   | 主入口,见 §2.3                                                                                  |
| `subscribe`                                                                     | 注册 listener,可选 replay                                                                       |
| `streamAgent`                                                                   | AsyncGenerator 包装 ForegroundTurnStream                                                        |
| `replaceAgentRun`                                                               | 已有 in-flight run 时中断重启                                                                   |
| `cancelAgentRun`                                                                | 调 `agent.session.cancelTurn` 或 abort signal                                                   |
| `closeAgent`                                                                    | 走 `prepareAgentForClosure` + `session.close()` + `timelineStore.delete`                        |
| `archiveAgent`                                                                  | 写 archived record + closeAgent + cascadeArchiveChildren                                        |
| `setAgentMode` / `setAgentModel` / `setAgentThinkingOption` / `setAgentFeature` | 委托 provider session                                                                           |
| `waitForAgentEvent`                                                             | 等到 `permission_requested` 或 turn 终态。Promise 内**先注册 abort 监听再 subscribe** 规避 race |
| `reloadAgentSession`                                                            | 热重载 session,可选 `rehydrateFromDisk` 重新从 provider 拉历史                                  |
| `respondToPermission`                                                           | 转发到 provider session                                                                         |
| `rehydrateTimelineFromProvider`                                                 | 从 provider history 重新填充 timeline                                                           |
| `rewind`                                                                        | 调用 provider rewind 能力                                                                       |

### 6.4 关键数据结构

- `InMemoryAgentTimelineStore`:每个 agent 一份 `AgentTimelineState { epoch, rows: AgentTimelineRow[], nextSeq }`
- `AgentTimelineRow = { seq, timestamp, item }`,`seq` 单调递增,`timestamp` 是 daemon 权威时间戳
- `foregroundRuns: ForegroundRunState` 管 pending run 和 turn waiter
- `previousStatuses`:状态历史(用于状态转换判断)
- `agentStreamCoalescer: AgentStreamCoalescer`(60ms 窗口)

### 6.5 `subscribe` 模式

```ts
subscribe(callback, { agentId?, replayState? = true }): unsubscribe
```

- `agentId` 不传 → 全局订阅
- `replayState !== false` 时:若有 `agentId`,立即 callback 一次当前 snapshot;全局订阅则跳过 internal agent 一次推完所有 live agent
- `unsubscribe` 只做 `this.subscribers.delete(record)`

### 6.6 session event tail 串行化(防事件乱序)

`enqueueSessionEvent` 关键设计:每个 agent 的事件用 promise 链串行处理:

```ts
this.sessionEventTails.get(agentId) ??
  Promise.resolve().then(async () => {
    /* 真正处理 */
  });
this.sessionEventTails.set(agentId, next);
```

这保证 `turn_completed` 一定在最后一个 `timeline` 事件之后处理。

---

## 7. Provider 系统

### 7.1 双模式架构

| 模式           | Provider                            | 通信方式                                                    |
| -------------- | ----------------------------------- | ----------------------------------------------------------- |
| **ACP** (推荐) | `copilot`, `cursor`, `generic-acp`  | JSON-RPC over stdio(NDJSON),基于 `@agentclientprotocol/sdk` |
| **Direct**     | `claude`, `codex`, `opencode`, `pi` | 各自实现 `AgentClient` / `AgentSession` 接口                |

`ACPAgentClient` 基类承担"凡是 ACP 兼容 agent 都需要的"几乎所有 boilerplate:启动、初始化、prompt、模式/模型/思考、tool call 跟踪、权限、终端、文件 IO、历史回放、turn 生命周期。子类只需要提供 `defaultCommand / defaultModes / capabilities` 和(可选)transformer / writer / probe override。

### 7.2 关键抽象

`AgentClient / AgentSession / AgentStreamEvent` 三件套定义在 `agent-sdk-types.ts`:

```ts
interface AgentClient {
  readonly provider: AgentProvider;
  readonly capabilities: AgentCapabilityFlags;
  createSession(config, launchContext?, options?): Promise<AgentSession>;
  resumeSession(handle, overrides?, launchContext?): Promise<AgentSession>;
  listModels(options): Promise<AgentModelDefinition[]>;
  isAvailable(): Promise<boolean>;
  listModes?(options): Promise<AgentMode[]>;
  listPersistedAgents?(options?): Promise<PersistedAgentDescriptor[]>;
  getDiagnostic?(): Promise<{ diagnostic: string }>;
}

interface AgentSession {
  readonly provider: AgentProvider;
  readonly id: string | null;
  readonly capabilities: AgentCapabilityFlags;
  readonly features?: AgentFeature[];
  run(prompt, options?): Promise<AgentRunResult>;
  startTurn(prompt, options?): Promise<{ turnId: string }>;
  subscribe(callback): () => void;
  streamHistory(): AsyncGenerator<AgentStreamEvent>;
  getRuntimeInfo(): Promise<AgentRuntimeInfo>;
  getAvailableModes(): Promise<AgentMode[]>;
  getCurrentMode(): Promise<string | null>;
  setMode(modeId): Promise<void>;
  getPendingPermissions(): AgentPermissionRequest[];
  respondToPermission(requestId, response): Promise<...>;
  describePersistence(): AgentPersistenceHandle | null;
  interrupt(): Promise<void>;
  close(): Promise<void>;
  // 可选
  listCommands?(): Promise<AgentSlashCommand[]>;
  setModel?(modelId): Promise<void>;
  setThinkingOption?(thinkingOptionId): Promise<void>;
  setFeature?(featureId, value): Promise<void>;
  tryHandleOutOfBand?(prompt): { run({ emit }): Promise<void> } | null;
}
```

### 7.3 Provider Manifest(静态元数据)

`packages/protocol/src/provider-manifest.ts` 是 provider 元数据的**唯一事实源**:

- `AGENT_PROVIDER_DEFINITIONS`:5 个内置 provider(claude/codex/copilot/opencode/pi)+ dev-only `mock` / `mock-slow`
- `AgentProviderModeDefinition`:在 `AgentMode` 上扩展 `icon / colorTier / isUnattended`
- `isUnattended`:标记"无人值守" mode(bypassPermissions / full-access / allow-all)
- 文件顶部 TODO:`modes` 应当从 provider 运行时动态获取而非静态定义;运行时由 ACP/probe 提供是真相源

**各 provider 模式**:

- `claude`:5 种 mode(`default / auto / acceptEdits / plan / bypassPermissions`),`bypassPermissions` 标 unattended
- `codex`:3 种 mode(`auto / auto-review / full-access`),`full-access` unattended
- `copilot`:3 种 mode(URI `#agent` / `#plan` / 字符串 `allow-all`)
- `opencode`:2 种 mode(`build / plan`);`auto_accept` 是 toggle feature
- `pi`:`modes: []`,Pi 不暴露可切换 mode

### 7.4 Provider Registry(`provider-registry.ts`)

`PROVIDER_CLIENT_FACTORIES` 字典,内置 `claude / codex / copilot / cursor / opencode / pi / mock / mock-slow`。

`addDerivedProviders` 处理两种"派生" provider:

- `extends: "acp"` → `CursorACPAgentClient` 或 `GenericACPAgentClient`
- `extends: "<builtin>"`(如 Z.AI 风格)→ 复用 base factory + customProvider metadata

`wrapClientProvider / wrapSessionProvider` 在派生场景下用 `mapPersistenceHandle / mapStreamEvent / mapRuntimeInfo / mapPersistedAgentDescriptor / mapModel` 给所有事件重写 `provider` 字段(派生 provider 拥有自己的 ID,但底层 client 用 base ID)。

### 7.5 Provider Launch Config(`provider-launch-config.ts`)

`resolveProviderLaunch({ commandConfig, defaultBinary })` 把 runtime settings 解析为可执行 argv:

- `commandConfig.mode === "replace"` → 用 override argv
- `mode === "append"` → 用 `defaultBinary` + 叠加 `args`

**关键**:`createProviderEnv` / `createProviderEnvSpec` **剥离** `CLAUDECODE / CLAUDE_CODE_ENTRYPOINT / CLAUDE_CODE_SSE_PORT / CLAUDE_AGENT_SDK_VERSION` 这几个父会话环境变量,防止 daemon(若由 Claude Code 内启动)污染子进程(防 "cannot be launched inside another session" 错误)。

### 7.6 Provider Snapshot Manager(`provider-snapshot-manager.ts`)

**职责**:按 cwd 维护 provider 快照的冷热状态,把"探测 provider / 列模型 / 列 mode"IO-heavy 操作隔离开。

状态机:

- `Map<cwd, Map<provider, ProviderSnapshotEntry>>`(`snapshots`)
- `Map<cwd, Map<provider, ProviderLoad>>`(`providerLoads`)记录 in-flight promise(保证同 cwd 同 provider 不会并发触发重复加载)
- 通过 `EventEmitter` 发 `change` 事件

`ProviderSnapshotEntry.status` 判别联合:`loading / ready / error / unavailable`。

**关键流程**:

- `getSnapshot(cwd)`:cold 走 warmUp,同 cwd 同 provider in-flight 复用 promise
- `warmUpSnapshotForCwd({cwd, providers})`:force=false 走"已 in-flight 返回现有 promise"去重
- `refreshSnapshotForCwd`:force=true,先重置 loading entries 再 `refreshProviders`
- `refreshSettingsSnapshot`:**settings 刷新**——清掉所有 cwd 的 `providerLoads`,立即对 home directory 重新刷新
- `applyMutableProviderConfig`:重新构造 registry,但**不**主动 spawn 进程,只让 `reconcileSnapshotForRegistry` 把 snapshot 状态按新 manifest 调成 `unavailable` 或保留 `current`
- `loadProvider` 用 `withTimeout(30s)` 包可用性 + 模型/模式拉取

`resolveSnapshotCwd(cwd)`:空或空白 → `homedir()`;`~` 展开;`resolve()` 规范化。

**测试合同**(对应 `docs/providers.md`):

- cold 才会真正探活
- warm 永远稳定(无 TTL,无 focus-driven refresh,无 selector-open refresh,无 config-reload refresh)
- explicit refresh 仅影响一个 cwd
- settings refresh 清空所有 cwd 但只立刻刷 home
- registry 替换不会 spawn

### 7.7 各 Provider 详解

#### 7.7.1 Claude(`packages/server/src/server/agent/providers/claude/agent.ts`,5036 行)

最大文件。`ClaudeAgentClient implements AgentClient`,`ClaudeAgentSession implements AgentSession`。**Direct 模式中最特殊**:不直接 spawn CLI,而是调用 `@anthropic-ai/claude-agent-sdk` 的 `query()` 工厂。`claudeQuery` 与 `query.ts` 中的 `applyRuntimeSettingsToClaudeOptions` 负责包装 SDK 的 `spawnClaudeCodeProcess` 回调,在那里才真正 `spawnProcess(command, args, { stdio: 'pipe', shell: false })`(Windows 下特意 `shell: false` 避开 `.cmd` / `--mcp-config` 含双引号被 cmd.exe 吃掉的问题)。

**关键能力位**:`supportsStreaming / SessionPersistence / McpServers / ReasoningStream / ToolInvocations / RewindConversation`,无 `RewindFiles` / `RewindBoth`。

**持久化**:`~/.claude/projects/{cwd-with-dashes}/{session-id}.jsonl`,`nativeHandle = sessionId`。

`ClaudeAgentSession` 内置 `queryPumpPromise / queryRestartNeeded`,实现"在同一 session 内可中断/重启 query 但保留 `claudeSessionId` 续接历史"。

**Rewind**:通过 `rewind.ts` 处理;支持 conversation 级别 rewind(不支持 file rewind)。

#### 7.7.2 Codex(`packages/server/src/server/agent/providers/codex/codex-app-server-agent.ts`,5734 行)

`codex app-server` 子进程 + 自研 `CodexAppServerClient`(JSON-RPC over stdio,见 `codex/app-server-transport.ts`)。

**版本门**:`CODEX_GOALS_MIN_VERSION = [0,128,0]` 与 `CODEX_AUTO_REVIEW_MIN_VERSION = [0,115,0]`,在 `resolveGoalsEnabled / resolveAutoReviewEnabled` 中用 `codex --version` + `parseCodexVersion` 比较。旧二进制自动跳过 `--enable goals` 与 `auto-review` mode。

**spawn**:`codex ... app-server` + 可选 `--enable goals`,`detached: process.platform !== 'win32'`(Windows 不 detached)。

**MODE_PRESETS**:把 mode ID 映射到 `{ approvalPolicy, sandbox, networkAccess?, approvalsReviewer? }`(`read-only / auto / auto-review / full-access`)。

**持久化**:`~/.codex/sessions/{YYYY}/{MM}/{DD}/rollout-{timestamp}-{session-id}.jsonl`,`nativeHandle = threadId`。

#### 7.7.3 Copilot(`packages/server/src/server/agent/providers/copilot-acp-agent.ts`)

`CopilotACPAgentClient extends ACPAgentClient`,ACP 模式。

**`defaultCommand: ["copilot", "--acp"]`** — 让 Copilot CLI 跑 ACP 模式。

**四组 transformer 配合**:

1. `transformCopilotSessionResponse`:`autopilot` 与 `allow-all` 过滤掉再追加
2. `transformCopilotConfigOptions`:`allow-all` 是 `config_option` 不是 mode
3. `modeIdTransformer`(`transformCopilotModeId`):把老 `autopilot` URI 翻译成新的 `agent` URI(`COMPAT(copilotAutopilotMode)`)
4. `providerModeWriter`(`writeCopilotProviderMode`):当目标 mode 是 `allow-all` 或 `autopilot`,直接 `setSessionConfigOption({configId: 'allow_all', value: 'on'})`,绕过 `setSessionMode`

- `beforeModeWriter`:从 `allow-all` 切换到非 `allow-all` 时先发 `allow_all=off`

> **Mode IDs can be URIs**:ACP providers 像 Copilot 用完整 URI 作为 mode IDs(`https://agentclientprotocol.com/protocol/session-modes#agent`)。永远别假设 mode ID 是简单字符串。

#### 7.7.4 OpenCode(`packages/server/src/server/agent/providers/opencode/opencode-agent.ts`,3703 行)

**唯一走 HTTP 通信的 provider**。`OpencodeClient` 指向长寿命 `opencode serve` 的 `127.0.0.1:<port>`。

**能力位**:`supportsRewindBoth: true`,`RewindConversation / RewindFiles: false`(整体回滚)。

**`OpenCodeServerManager`** 单例,以 `JSON.stringify(runtimeSettings)` 为 key:

- `acquire({force: false})` 复用 in-flight `startPromise` 或 alive `currentServer`
- `acquire({force: true})` 走 `getForcedRefreshServer` 旋转 server
- `acquire({env})` 启专用 server(临时 env 场景)
- 跨 cwd 共享 server,client 自身在 HTTP 调用时携带 `directory`

**MCP 注入(关键踩坑)**:docs 明确"OpenCode MCP 注入是动态 session-scoped,只调 `mcp.add` 不跟 `mcp.connect`"。`ensureMcpServersConfigured` 在 turn 开头执行,`registerMcpServer` 调 `client.mcp.add({directory, name, config})`(`OpenCodeMcpConfig` 把 stdio → `local` + command+args+env,http → `remote` + url+headers),`runMcpOperation` 用 `isAlreadyPresentMcpError` 忽略 `already/exists/connected` 之类已存在错误。

**`mcp.connect` 行为差异**:1.x 老版本对未在 config 中存在的 server 静默吞掉,新版本返回 `McpServerNotFoundError`/404。

**OpenCode owns user message IDs**:不要把 ChisaCode 生成的 ID 传给 OpenCode prompt APIs;让 OpenCode 自己创建 `msg*` ID,从 `message.updated` 事件中记录 user timeline item。

#### 7.7.5 Pi(`packages/server/src/server/agent/providers/pi/agent.ts`,1836 行)

直连 `pi --mode rpc`(进程-backed)。

**`PI_BINARY_COMMAND`** 来自 `process.env.PI_COMMAND ?? process.env.PI_ACP_PI_COMMAND ?? 'pi'`。

**`PI_THINKING_OPTIONS`** 提供 6 档思考强度(`off / minimal / low / medium / high / xhigh`),`medium` 是默认,`defaultThinkingOptionId` 只在模型有 `reasoning` 时出现。

**MCP 注入**:docs "Pi MCP 支持依赖 pi-mcp-adapter"。`createPiMcpConfigFile` 在 `tmpdir()` 下建临时目录,写 `{ mcpServers: { ... } }` 格式 mcp.json;`toPiMcpConfig` 把 stdio 透传,http/sse 转 `{ url, headers, auth: false, oauth: false }`(显式禁用 OAuth,因为 Pi adapter 对本地 HTTP 服务会触发 OAuth 流程);`detectMcpAdapter(cwd)` 通过启动一个 probe session 调 `getCommands`,扫 `name === 'mcp'` 之类、且 `sourceInfo.source` 含 `pi-mcp-adapter` 的命令。

**ChisaCode 集成 extension**:`createPiChisaCodeExtensionFile` 写一段 `chisacode-integration.mjs` 到临时目录,挂两条内部 command:`chisacode_capture_entries`(`ui.notify(CHISACODE_PI_ENTRY_CAPTURE_MARKER ...)`)和 `chisacode_tree`(`ctx.navigateTree(targetId, { summarize: false })` 实现 Pi rewind)。

**Extension UI 桥接**:Pi 扩展的 UI dialog(`select / input / editor / confirm`)被转成 `AgentPermissionRequest`(`kind: 'question'`);`notify` 类型(被动通知)被静默忽略,除非承载了 entry capture 或 command result marker。

**`ask_user` 工具调用特殊处理**:`ActiveAskUserDialog` 跟踪 `allowComment / allowFreeform / allowMultiple`,当 `allowComment: true` 且 `select` 时,合成为"select + optional comment"复合 permission,首个 `select` 用用户答案,自动用 comment 答 follow-up `input`。

**System prompt**:`--append-system-prompt` 拼 `composeSystemPromptParts(config.systemPrompt, config.daemonAppendSystemPrompt)`,让 Pi 保留自己的 coding prompt,只追加 ChisaCode 的部分。

**Import discovery**:Pi RPC 不暴露 session listing,`PiRpcAgentClient.listPersistedAgents` 返回 `[]`,实际列表从 `history-mapper.ts`(读 JSONL)拼;`streamHistory` 调 `runtimeSession.getMessages()` + `requestEntryCapture('history')`。

### 7.8 Provider 启动 spawn 总结

| Provider      | 通信                            | spawn 方式                                                                                       | 进程寿命                             |
| ------------- | ------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------ |
| `claude`      | stdio(SDK)                      | SDK + ChisaCode 包装的 `spawnClaudeCodeProcess`,Windows `shell: false`                           | 每个 session 一个,query 可中断/重建  |
| `codex`       | stdio(自研 transport)           | `codex ... app-server`,非 Windows detached                                                       | 每个 session 一个(`connect()` 启动)  |
| `copilot`     | stdio(NDJSON)                   | `copilot --acp`                                                                                  | 每个 session 一个,probe 单独启       |
| `cursor`      | stdio(NDJSON)                   | `cursor-agent acp`(或 override)                                                                  | 同上                                 |
| `generic-acp` | stdio(NDJSON)                   | `override.command`                                                                               | 同上                                 |
| `opencode`    | HTTP(`http://127.0.0.1:<port>`) | `opencode serve --port <port>`,detached;`OpenCodeServerManager` 单例持 refCount                  | 长寿命 server,多 session/多 cwd 共享 |
| `pi`          | stdio(NDJSON RPC)               | `pi --mode rpc` + `--model/--thinking/--session/--append-system-prompt/--mcp-config/--extension` | 每个 session 一个                    |

---

## 8. 存储模型

### 8.1 目录布局(`$CHISACODE_HOME`,默认 `~/.chisacode`)

```
$CHISACODE_HOME/
├── config.json                          # Daemon 配置(非原子写)
├── server-id                            # 纯文本,9 字节 base64url + "srv_" 前缀
├── daemon-keypair.json                  # E2EE keypair(mode 0600,非原子)
├── chisacode.pid                        # JSON {pid, startedAt, hostname, uid, listen, desktopManaged?}
├── daemon.log                           # Pino 日志
├── agents/
│   └── {cwd-with-dashes}/
│       └── {agentId}.json               # 每 agent 一份(原子写)
├── schedules/
│   └── {scheduleId}.json                # 每 schedule 一份(非原子)
├── chat/
│   └── rooms.json                       # 所有 rooms + messages(原子写)
├── loops/
│   └── loops.json                       # 所有 loop records(非原子,串行化)
├── projects/
│   ├── projects.json                    # Project registry
│   └── workspaces.json                  # Workspace registry
└── push-tokens.json                     # Expo push tokens(原子写)
```

### 8.2 Agent Record(`agents/{cwd-with-dashes}/{id}.json`)

完整字段(从 `STORED_AGENT_SCHEMA`):

| 字段                                                               | 类型                                                           | 含义                                                                      |
| ------------------------------------------------------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `id`                                                               | string                                                         | UUID                                                                      |
| `provider`                                                         | string                                                         | `claude` / `codex` 等                                                     |
| `cwd`                                                              | string                                                         | 工作目录                                                                  |
| `createdAt` / `updatedAt` / `lastActivityAt` / `lastUserMessageAt` | string(ISO 8601)                                               |                                                                           |
| `title`                                                            | string?                                                        |                                                                           |
| `labels`                                                           | Record<string, string>                                         | `chisacode.parent-agent-id` 是自动设置的                                  |
| `lastStatus`                                                       | `"initializing" \| "idle" \| "running" \| "error" \| "closed"` |                                                                           |
| `lastModeId`                                                       | string?                                                        |                                                                           |
| `config`                                                           | SerializableConfig?                                            | modeId/model/thinkingOptionId/featureValues/extra/systemPrompt/mcpServers |
| `runtimeInfo`                                                      | RuntimeInfo?                                                   | 实时 session 信息                                                         |
| `features`                                                         | AgentFeature[]?                                                | provider 报告的 features                                                  |
| `persistence`                                                      | PersistenceHandle?                                             | resume 用                                                                 |
| `lastError`                                                        | string?                                                        |                                                                           |
| `requiresAttention` / `attentionReason` / `attentionTimestamp`     |                                                                | 通知路由                                                                  |
| `internal`                                                         | boolean?                                                       | 内部 agent(loop worker/verifier 等)隐藏                                   |
| `archivedAt`                                                       | string?                                                        | 软删除时间戳                                                              |

> ⚠️ **与 `docs/data-model.md` 表述**:`docs/data-model.md` 写"`agents/{cwd-with-dashes}/{agent-id}.json` # Agent record + persisted timeline rows"。**实际 timeline rows 不在 record JSON 内**——`durableTimelineStore` 是可选注入的独立存储。`applySnapshot` 只写 record。

### 8.3 Agent Storage 实现(`agent-storage.ts`)

- **目录布局**:`projectDirNameFromCwd` 用 `path.win32.parse` 跨平台处理(Windows `C:\` → `C`,POSIX `/` → ``),把分隔符归一为 `-`
- `scanDisk` 扫根目录 + 每个子目录,加载所有 `*.json`,通过 `STORED_AGENT_SCHEMA`(zod)校验,失败的记录 warn + 跳过
- **原子写**:`writeFileAtomically` 写到 `.agent.tmp-${pid}-${ts}-${uuid}` 再 `rename`
- **写入串行化**:`pendingWrites` map 串行同一 agentId 的写;`deleting` set 防止删除过程中还在 write
- `applySnapshot(agent, options?)`:把当前 ManagedAgent 通过 `toStoredAgentRecord` 投影成 StoredAgentRecord,**保留**已有 `title` / `createdAt` / `archivedAt`(`ManagedAgent` 没有这些字段,投影会丢)
- `setGeneratedTitle`:不走 ManagedAgent,直接改存储(用于 metadata-generator 异步生成标题时不阻塞 stream)
- `flush()` / `remove()`:全部 pending write 等齐 + 批量 unlink

### 8.4 Timeline 存储(双层)

**内存层**(`InMemoryAgentTimelineStore`):只服务 live agent

- `AgentTimelineState { epoch, rows: AgentTimelineRow[], nextSeq }`
- `AgentTimelineRow = { seq, timestamp, item }`
- `fetch(agentId, options)`:`direction = "tail" / "after" / "before"`,带 `hasOlder` / `hasNewer` / `window` / `epoch` / `reset` / `staleCursor` / `gap`
- 默认分页 200 行

**持久化层**(`durableTimelineStore`,可选注入):`getCommittedRows(agentId)`,`getLatestCommittedSeq(agentId)`,在 `loadCommittedTimelineSeed` 时拉一次决定 nextSeq

### 8.5 Daemon 配置(`config.json` + `DaemonConfigStore`)

`PersistedConfigSchema`(zod)严格定义 `config.json` schema,带 `version: 1` 标记;启动时 `loadPersistedConfig` 若文件不存在就写默认值(`127.0.0.1:6767`、CORS 允许 `app.chisacode.sh`)。

`DaemonConfigStore` 是运行时的可变配置层:

- `current` 用 `MutableDaemonConfigSchema.parse(initial)` 验证
- `patch(partial)` 用 `deepMerge` + Zod 重新 parse,**先持久化再更新内存**(注释:"持久化失败时 runtime 和 disk 仍一致")
- `onFieldChange(path, handler)` 精确订阅某个字段;`onChange(listener)` 订阅整体变更
- 可变字段:`mcp.injectIntoAgents` / `autoArchiveAfterMerge` / `appendSystemPrompt` / `agents.providers` / `agents.metadataGeneration`

`MutableDaemonConfigSchema` 用 `.passthrough()` 保证加新字段时老 client/server 不报错。

---

## 9. 子系统

### 9.1 Loop Service(`loop-service.ts`)

**Worker / Verifier 双 agent 迭代模式**(类似 Ralph loop)。

**存储**:`$CHISACODE_HOME/loops/loops.json`,单文件数组,**非原子写**,但 `persistQueue` 严格串行化。

**ID**:8 字符 UUID 前缀。

**启动恢复**:`initialize()` 扫描所有记录,凡是 `status === "running"` 的,**全部强制转为 `"stopped"`**,附加日志,并把最后那个 `running` iteration 标记为 `"stopped"`、附带 `failureReason="Daemon restarted"`。保守的"灾难恢复"。

**迭代架构**:

```ts
for (let index = 1; ; index += 1) {
  if (signal.aborted) throw "Loop aborted"
  if (maxIterations && index > maxIterations) finishLoop(failed, "Reached max iterations")
  if (deadline && Date.now() > deadline) finishLoop(failed, "Reached max time")

  new iteration record
  workerPassed = await runWorkerIteration(loop, iteration, signal)
  if (workerPassed) verificationPassed = await runVerification(loop, iteration, signal)

  if (sleepMs > 0) sleepWithAbort(sleepMs, signal)
}
```

**Worker**(`runWorkerIteration`):

1. `agentManager.createAgent(buildWorkerConfig(loop, iteration))` —— 内部配置 `internal: true`,`modeId` 默认来自 `getUnattendedModeId(provider)`(无人值守)
2. 订阅 `agent_manager.subscribe`,把 `agent_stream` 事件用 `formatStreamLog` 过滤后追加到 `loop.logs`,`source: "worker"`
3. `agentManager.runAgent(agent.id, prompt)` 同步等待结果
4. finally 中取消订阅、清 `activeWorkerAgentId`、根据 `archive` 选择 archive 或 close

**Verifier**(`runVerification`):

- 先跑 shell checks(`verifyChecks` 数组),`platformShell()` 调用,`maxBuffer: 64 * 1024`,**任一失败立即返回 false**
- 然后跑 LLM verifier,创建 `internal: true` verifier agent,调 `getStructuredAgentResponse({caller, prompt, schema, maxRetries: 2})` 拿到 `passed: boolean, reason: string`

**退出条件**:

- 成功:某次 iteration 的 `runVerification` 返回 true
- 失败:`maxIterations` / `maxTimeMs` / verifier 失败 / 抛错
- 停止:`stopLoop(id)` 设 `stopRequestedAt`,调 `abortController.abort(...)` 并尝试 `cancelAgentRun`

### 9.2 Schedule Service(`schedule/`)

**Cron 引擎**(`cron.ts`):

- 5 字段格式:`minute hour dayOfMonth month dayOfWeek`(注意是 **UTC**)
- 简化版:不支持秒级粒度、不支持 `@yearly` 别名、不支持 `?`/`L`/`#`
- `computeNextRunAt(cadence, after)`:`every` 直接加 `everyMs`;`cron` 从 `startOfNextMinute(after)` 开始,每分钟跳 60_000ms,逐字段比对,**最多迭代 366 天**

**存储**(`store.ts`):`$CHISACODE_HOME/schedules/{id}.json`,每 schedule 一份,8 字符 hex ID。

**Service**(`service.ts`):

- Tick 循环:`setInterval(1000)` 触发 `tick()`,timer `unref()` 不阻塞退出
- 状态:`active | paused | completed`
- 创建时 `runOnCreate = input.runOnCreate ?? cadence.type === "every"`:**every 任务立即触发,cron 默认等下次**
- `pause()` 强制 `nextRunAt = null`;`resume()` 用 `computeNextRunAt` 重算
- 完成条件:过期(`expiresAt` 已到)或 `maxRuns` 已用完

**`runSchedule`**:

- target `type: "agent"`:`ensureAgentLoaded` + 拒 in-flight run + `runAgent(agent.id, wrappedPrompt)`,prompt 用 `formatSystemNotificationPrompt` 包成系统消息
- target `type: "new-agent"`:为每次运行**临时** `createAgent` 一个 `internal: false` agent,labels 注入 `chisacode.schedule-id` / `chisacode.schedule-run`,运行后**总是 archive**

**Daemon 启动恢复**:`recoverInterruptedRuns` 把任何 `running` run 标 `failed` + `"Daemon restarted..."`,并把过期的 `nextRunAt` 链式向前推进。

### 9.3 Chat Service(`chat/`)

**存储**:`$CHISACODE_HOME/chat/rooms.json`,单文件含 `{rooms, messages}` 数组。**写原子**。

**Room 字段**:UUID `id`、唯一 `name`(case-insensitive:`normalizeRoomName` 用 `toLocaleLowerCase` 归一化)、可选 `purpose`、`createdAt/updatedAt`。

**Message 字段**:UUID `id`、`roomId`、`authorAgentId`、`body`、可选 `replyToMessageId`、`mentionAgentIds`(写入时已从 body 抽取)、`createdAt`。

**@mention 解析**(`chat-mentions.ts`):

- 模式:`/(?:^|[\s(])@([A-Za-z0-9][A-Za-z0-9._-]*)/g`
- `@everyone` 特殊 ID,fanout 限制 `CHAT_MENTION_FANOUT_LIMIT = 25`,防误操作向 1000 个 agent 群发

**等待消息**(`waitForMessages`):`waitersByRoomId: Map<roomId, Set<Waiter>>`,每个 waiter 持 `afterMessageId` cursor;`chat_message_not_found` 错误防卡死。

**房间删除**:`rejectWaiters("chat_room_deleted")` 拒绝所有 active waiters。

### 9.4 Voice Service 与 Dictation

**关键差别**:

| 维度     | Voice(对话模式)                        | Dictation(听写)                                                |
| -------- | -------------------------------------- | -------------------------------------------------------------- |
| 用途     | 实时对话 agent                         | 把语音转成文本注入编辑器                                       |
| 音频处理 | VAD 决定说话起止                       | 不做 VAD,逐 chunk 转写,客户端控制 start/finish                 |
| 顺序保障 | 一次只处理一个 turn,部分部分拼回 final | **带 seq 序号** + `ackSeq` 回执                                |
| 结果消费 | 进入 agent prompt buffer,触发 LLM turn | 通过 `dictation_stream_final` 注入 composer 草稿               |
| 调试     | 默认无                                 | 启用 `CHISACODE_DICTATION_DEBUG` 保存 WAV 到 `$CHISACODE_HOME` |

**Voice Turn Controller**(`voice-turn-controller.ts`):

- 状态机:`idle → listening → capturing → listening → ...`
- VAD 触发 `speech_started` → `state = capturing`,生成 `utteranceId`
- STT 持续推 `transcript {isFinal: false}`,只有第一个非填充词(`uh/um/...` 之外)触发 `onPartialTranscript`
- VAD 触发 `speech_stopped` → `FinalizingVoiceTurn`,`VOICE_FINAL_TRANSCRIPT_TIMEOUT_MS = 10_000` 超时
- 调 `sttSession.commit()`,等所有 committed segment 都收到 `isFinal: true`
- 满足 `allCommittedSegmentsFinal` 时 `fireFinalTranscript(turn, "complete")`
- 填充词抑制:`FILLER_PARTIAL_WORDS = {uh,um,ah,eh,er,hmm,mm,mmm,mhm,huh,uhhuh,uh-huh,oh}`

**Dictation Stream Manager**(`dictation-stream-manager.ts`):

- 协议:`dictation_stream_start` / `dictation_stream_chunk` (带 `seq`) / `dictation_stream_finish` (`finalSeq`) / `dictation_stream_cancel`;出站:`dictation_stream_ack` / `finish_accepted` / `partial` / `final` / `error`
- **顺序与 ack**:`nextSeqToForward` 从 0;`receivedChunks: Map<seq, Buffer>` 暂存乱序;循环 `while (receivedChunks.has(nextSeqToForward))` 取出按顺序喂给 STT
- **Auto-commit**:`autoCommitBytes = autoCommitSeconds * outputRate * 2`,超过阈值时若静音则 `stt.clear()` 丢弃;否则 `stt.commit()`
- **Finish 静音 tail**:若最后一段是静音,直接 `clear()` 丢弃未 commit 的非 final transcript,避免把麦克风关闭后残余的"噼啪"算成内容
- **智能超时**:`min(MAX, base + pendingSegments*15s + pendingAudioSeconds*1.5s + missingSeq*0.25s)`,MAX=5min,base=10s

**Speech Provider 抽象**(`speech-provider.ts`):

- `SpeechToTextProvider.createSession`:返回 `StreamingTranscriptionSession`
- `TextToSpeechProvider.synthesizeSpeech(text)`:返回 `Readable` 流 + format
- `TurnDetectionProvider`:VAD 接口,`speech_started` / `speech_stopped` 事件

**OpenAI 实现**(`providers/openai/`):

- `OpenAiSpeechProviderConfig` 含 `apiKey` / `stt` / `tts` / `realtimeTranscriptionModel`
- 优先级链:`env → persisted provider (openai) → persisted feature (voiceMode/dictation) → default`
- STT 默认 `whisper-1`;Realtime Dictation 用 `gpt-4o-transcribe` 连 `wss://api.openai.com/v1/realtime?intent=transcription`,**关闭 server VAD** 由 daemon 自己 VAD 决定 commit

**Local 实现**(`providers/local/`):

- **Sherpa-onnx 进程**:worker 子进程(`process.title = "ChisaCode Voice"`),通过 `process.send/process.on('message')` IPC
- 模型:STT `parakeet-tdt-0.6b-v2-int8`、TTS `kokoro-en-v0_19`、VAD Silero(bundled)
- 引擎按 `${modelsDir}:${modelId}` 缓存

### 9.5 Workspace / Worktree / Checkout 模型

#### 9.5.1 Workspace Registry

`PersistedProjectRecord`:`projectId` / `rootPath` / `kind: "git" | "non_git"` / `displayName` / `customName` / `createdAt/updatedAt/archivedAt`。

`PersistedWorkspaceRecord`:`workspaceId` / `projectId` / `cwd` / `kind: "local_checkout" | "worktree" | "directory"` / `displayName` / `createdAt/updatedAt/archivedAt`。

`FileBackedRegistry<T>` 模板化 CRUD,`enqueuePersist` 单链串行化写,`persist()` 用 `tempFile + rename` 原子化。

**关键派生**(`workspace-registry-model.ts`):

- `normalizeWorkspaceId(cwd)`:用绝对路径作主键
- `deriveWorkspaceId(cwd, checkout)`:**worktree 优先用 worktreeRoot**,否则 normalize cwd
- `deriveProjectGroupingKey({cwd, remoteUrl, mainRepoRoot})`:**remote URL 优先**(派生 `remote:github.com/owner/repo`),否则 `mainRepoRoot`,否则 `cwd`

#### 9.5.2 Workspace Git Service

最复杂组件,承担"持续观察 git 状态"的责任:

**三张表**:

- `workspaceTargets: Map<cwd, target>` —— 每个被订阅的 cwd 一个观察目标
- `repoTargets: Map<repoGitRoot, target>` —— 跨多个 worktree 共享同一 repo
- `workingTreeWatchTargets: Map<cwd, target>` —— 工作区文件 watcher

**观察设置**:

- Linux 上 `inotify` 不能递归整个工作树,`ensureLinuxRepoTreeWatchers` 走 BFS(默认 16 并发,`p-limit`),跳过 `.git`、按 gitignore 跳过,最多 5000 个目录
- 其他平台直接尝试 recursive watch,失败则回退到非 recursive,再失败就 5s 兜底

**刷新请求合并**:`WorkspaceGitRefreshState` 是 `idle | in-flight`(带 `queued`)。新请求 `force=true` 且当前 `!force` → 升级 queued。

**Throttle**:`now - lastShellOutAtMs < 2000ms` 时,非 force 请求直接返回缓存。

**多级缓存**(`LRUCache`,256 上限):`branchValidationCache` / `localBranchCache` / `branchSuggestionsCache` / `stashListCache` / `worktreeListCache` / `defaultBranchCache`;`checkoutDiffCache` 64 上限。`readAuxiliaryCache` TTL 15s,`force: true` 必须带 `reason`。

**后台 fetch**:`ensureRepoTarget` 每 3 分钟 `git fetch origin --prune` 一次。

**Self-heal**:每个 workspace target 有 60s 间隔的 self-heal timer,用于"观察者失灵"恢复。

#### 9.5.3 Worktree 创建

`createChisaCodeWorktree` 流程:

1. `createWorktreeCore`:解析 repo root,决定 `intent`(`checkout-branch` / `checkout-github-pr` / `branch-off`),检查同名 worktree,否则真正创建
2. `maybeMarkFirstAgentBranchAutoNameEligible`:如果是 `branch-off` 且 `created=true`,写 first-agent-branch-auto-name 标记,等 agent 第一次跑后基于 prompt 自动重命名 branch
3. `upsertWorkspaceForWorktree`:复用 existing project,或新建 `kind: "worktree"` workspace
4. `createChisaCodeWorktreeWorkflow`:`setTimeout(0)` 异步任务,触发 `autoNameWorkspaceBranchForFirstAgent` / `warmWorkspaceGitData` / `runWorktreeSetupInBackground`

**First-agent 自动命名**:agent 第一次跑完后,后端尝试基于 firstAgentContext 让 LLM 生成一个 branch 名,验证 slug 合法、不等于占位名,再 `git branch -m <new>`。若 50 次尝试内都撞名,放弃。

**Worktree 归档**(`chisacode-worktree-archive-service.ts`):

1. 找出所有 cwd ⊂ targetPath 的 live agents + stored records
2. 标 `markWorkspaceArchiving` + emit update
3. 并行 `archiveAgent` / `archiveSnapshot` / `killTerminalsUnderPath`
4. `git worktree remove --force`
5. github 缓存 invalidate
6. `archiveWorkspaceRecord` 软删
7. `clearWorkspaceArchiving` 收尾

### 9.6 Script Proxy(`script-proxy.ts`)

**路由模型**:`ScriptRouteStore` 维护 `routes: Map<hostname, ...>` 和 `workspaceHostnames: Map<workspaceId, Set<hostname>>`。

`findRoute(host)`:

- 去掉端口后缀(支持 IPv6 `[::1]:6767`)
- 精确匹配
- 否则从左到右逐层剥 subdomain:`my-app.dev.chisacode.localhost → dev.chisacode.localhost → chisacode.localhost`

**`*.localhost` 设计**:Chrome/Safari/Firefox 等现代浏览器把 `*.localhost` 自动解析为 `127.0.0.1`,无需 `/etc/hosts`。daemon 在 `req.headers.host` 拿到 host 后:

1. `routeStore.findRoute(hostHeader)` 找到 `{port, ...}`
2. 用 `http.request({hostname: "127.0.0.1", port, ...})` 转发到实际本地服务进程
3. 透传几乎所有 header(过滤 hop-by-hop:`Connection / Transfer-Encoding / Keep-Alive / Upgrade / Proxy-* / TE / Trailer`),强制加 `x-forwarded-for` / `x-forwarded-host` / `x-forwarded-proto`
4. WebSocket upgrade:重建 HTTP 头(显式追加 `Connection: Upgrade` + `Upgrade: websocket`),用 raw TCP socket 做双向 pipe

### 9.7 Auto-archive-on-merge(`auto-archive-on-merge/`)

**触发**:`setupAutoArchiveOnMerge` 订阅 `workspaceGitService.onSnapshotUpdated`,每当 workspace snapshot 更新时,异步调 `archiveIfSafe`。

**安全检查链**:

1. `pullRequest?.isMerged` 必须 true
2. `daemonConfigStore.get().autoArchiveAfterMerge === true` —— 用户显式开启
3. `inFlight.has(cwd)` —— 同 cwd 已在 archive 流程中
4. 工作区必须 clean:`snapshot.git.isDirty !== true` 且 `aheadOfOrigin === 0`
5. **`isChisaCodeOwnedWorktreeCwd`** —— cwd 必须位于 ChisaCode 管理的 worktree 路径下(硬安全闸)
6. 通过后调 `archiveChisaCodeWorktree`

设计意图:PR 合并后自动清理 ChisaCode worktree,避免无人看管时遗留大量无用 worktree。**所有破坏性操作都被多层 guard 包住**。

### 9.8 Pairing Flow

**三个核心组件**:

- `daemon-keypair.ts`:加载或创建 daemon 静态 Curve25519 密钥对(libsodium box),保存到 `$CHISACODE_HOME/daemon-keypair.json`,**mode 0600**
- `server-id.ts`:daemon 稳定 ID,12 字符 `srv_<base64url>`,可被 `CHISACODE_SERVER_ID` 环境变量覆盖
- `connection-offer.ts`:构造 v2 ConnectionOffer 对象(包含 `serverId / daemonPublicKeyB64 / relay`),并用 **base64url** 编码为 URL fragment

**流程**:

1. `generateLocalPairingOffer`(`pairing-offer.ts`):默认 `relayEnabled=true`,否则返回 `{relayEnabled:false}`;默认 relay endpoint = `relay.chisacode.sh:443`,useTls 默认 true
2. `createConnectionOfferV2` 构造 offer,`encodeOfferToFragmentUrl` 生成 `${appBaseUrl}/#offer=<base64url(json)>`
3. `renderPairingQr` / `printPairingQrIfEnabled`(`pairing-qr.ts`):用 `qrcode` 包渲染,优先 `terminal small`,失败回退 `utf8`
4. 客户端扫码:`app.chisacode.sh/#offer=<base64url>` 解析后得到 `{serverId, daemonPublicKeyB64, relay}`;客户端用 `createClientChannel(transport, daemonPublicKeyB64, ...)` 完成握手

**关键安全点**:relay 看到的仅是密文;daemon 私钥**永不出 daemon 主机**;`#offer=...` 走 HTTPS + URL fragment(浏览器不会发到 server)。

### 9.9 Relay E2E 加密(`packages/relay/src/`)

#### 9.9.1 加密原语(`crypto.ts`)

- **依赖**:`tweetnacl` + `base64-js`
- **密钥交换**:Curve25519 ECDH,通过 `nacl.box.before(peerPublicKey, ourSecretKey)` 派生 32 字节共享密钥
- **对称加密**:XSalsa20-Poly1305
- **二进制 bundle**:`[nonce 24 字节][ciphertext...]`
- **PRNG**:`ensurePrng()` 优先 `nacl.randomBytes(1)`,失败时回退到 `globalThis.crypto.getRandomValues`

#### 9.9.2 加密通道(`encrypted-channel.ts`)

**协议完全对称**:用同一份代码既做发起方(client)也做响应方(daemon)。

两种握手消息:

- `{type:"e2ee_hello", key:<client_public_key_b64>}`
- `{type:"e2ee_ready"}`

**Client 端**(`createClientChannel`):

1. 接收 `daemonPublicKeyB64`(由 QR 码带来)
2. 调用 `generateKeyPair()` 生成客户端临时密钥对
3. 派生共享密钥、构造 channel、发送 `e2ee_hello`
4. 启动 `setInterval` 定时重发 hello(1s 一次),以应对 daemon 端尚未观察到客户端 hello 的场景

**Daemon 端**(`createDaemonChannel`):

1. daemon 持有预生成的密钥对
2. 收到 hello 后,先**重置 `transport.onmessage = bufferNext`**,把此后的消息缓存到 `bufferedMessages`(因为 WebCrypto 派生共享密钥是异步的)
3. 派生共享密钥、构造 channel、发送 `e2ee_ready`
4. 把 `bufferedMessages` 中非 hello/ready 的消息透传给 transport.onmessage

> **关键不变量**:`rehello` 场景下若客户端重新发送 hello 但用的是**相同公钥**,daemon 仅重发 `e2ee_ready` 而**不重新派生密钥**;若客户端尝试用不同公钥冒充,**`close(1008, "E2EE re-handshake key mismatch")`** 直接关闭(防 relay 替换密钥的中间人切换攻击)。

**接收处理**:

- `handshaking` 状态时只识别 `e2ee_ready`,置 `state="open"`、触发 `onopen` 与 flush
- 进入 open 后,先尝试把数据当作 JSON 解析,以**优雅降级处理"漏网"的 hello/ready**,遇到非 hello/ready 的 JSON 帧时主动抛 `"Received plaintext frame on encrypted channel"` 并 `close(1011, msg)`,迫使对端走完整的 reconnect + re-handshake

#### 9.9.3 中继传输(`relay-transport.ts`)

**两路 WebSocket**:

- `control` 通道(无 `connectionId`)负责注册/同步
- `data` 通道为每个客户端连接单独建立(`connectionId` 在 URL 路径里)

**控制帧协议**:`sync` / `connected` / `disconnected` / `ping` / `pong`。

**重连退避**:`scheduleReconnect` 用 `Math.min(30000, 1000 * reconnectAttempt)` 线性退避封顶 30 秒。

**半开死链检测**:`CONTROL_PING_INTERVAL_MS=10s` 触发 `socket.ping()`(WS 协议帧);若 `now - controlLastSeenAt > CONTROL_STALE_TIMEOUT_MS=30s`,强制 `terminate()`。Cloudflare 边缘层会对协议 ping 自动响应而**不唤醒 hibernated Durable Object**,因此不会产生 DO CPU 计费。

**E2E 接入**:

1. 把 `ws` 包成 `RelayTransport` 适配器
2. 调 `createDaemonChannel` 派生共享密钥,得到 `EncryptedChannel`
3. `createEncryptedSocket(channel, emitter)` 把 `channel` 包成 `RelaySocketLike`,交由既有的 `attachSocket(...)` 流程当成"本地 socket"处理

**发送失败防御**:`relay_transport.send` 用 try/catch 吞掉同步抛错。

### 9.10 Daemon Auth(`auth.ts`)

**Bearer Token**:

- **无密码时**:`isBearerTokenValid` 直接返回 true
- **有密码时**:`isBearerTokenValidSync` 用 `bcrypt.compareSync(token, passwordHash)` 校验

**协议解析**:

- **HTTP**:`Authorization: Bearer <token>`
- **WebSocket**:`Sec-WebSocket-Protocol: chisacode.bearer.<token>`(浏览器 WS 不能设 header,走 subprotocol)

**中间件**:`createRequireBearerMiddleware`:`OPTIONS` 与 `/api/health` 永远 bypass;其他请求必须带正确 token。

**bcrypt cost = 12**(`DAEMON_PASSWORD_BCRYPT_COST=12`)。

### 9.11 Push Notifications(`push/`)

`PushTokenStore`:内存 `Set<string>` + JSON 持久化(原子写)。`addToken / removeToken / getAllTokens`;`DeviceNotRegistered / InvalidCredentials` 时自动清理失效 token。

`PushService`:`fetch(https://exp.host/--/api/v2/push/send)` 批量发送(`MAX_BATCH_SIZE=100`)。

### 9.12 File Explorer(`file-explorer/service.ts`)

**安全模型**:

- `resolveScopedPath` 同时校验 `path.relative(root, requested)` 和 `fs.realpath` 后的版本,**双层 symlink 防御**
- 任何 `..` 越界或 absolute 路径都抛 `"Access outside of workspace is not allowed"`
- `readFile` 在 Windows 上加 `O_NOFOLLOW`,POSIX 上两者都加
- `isLikelyBinary`:扫前 8KB,空字节即 binary;控制字符(除 `\t\n\r`) 比例 > 30% 即 binary
- 单个目录里 dangling symlink 优雅跳过(`isMissingEntryError`)

### 9.13 Agent Attention Policy(`agent-attention-policy.ts`)

`PRESENCE_THRESHOLD_MS = 180_000`(3 分钟):客户端在最近 3 分钟内有活动,视为 "present"。

`computeNotificationPlan({allStates, agentId, reason, nowMs})`:

1. 任意客户端 `appVisible + focusedAgentId === agentId` → 静默
2. 否则选**最近活跃**的 present 客户端发 in-app 通知
3. 没有任何 present 客户端 → 仅在 `reason !== "error"` 时 push

`clampedActivityAtMs = Math.min(state.lastActivityAtMs, nowMs)`:防止客户端时钟漂移导致永远 present。

### 9.14 File Download Token(`file-download/token-store.ts`)

`Map<token, {path, absolutePath, fileName, mimeType, size, expiresAt}>`:

- `issueToken`:UUID 作为 token,`expiresAt = now + ttlMs`,issue 时顺手 prune 过期
- `consumeToken`:一次性消费,过期返回 null
- 典型用法:web UI 请求下载 → 后端签发 token → 浏览器 GET `/api/files/download?token=...` → 服务端解析

### 9.15 Editor Targets(`editor-targets.ts`)

6 个内置 target:

- `cursor` / `vscode` / `webstorm` / `zed` (跨平台)
- `finder`(`open`,仅 darwin)
- `explorer`(`explorer`,仅 win32)
- `file-manager`(`xdg-open`,排除 darwin/win32)

`listAvailableEditorTargets`:用 `findExecutable` 探测命令是否在 PATH,只返回实际可用的。

`openInEditorTarget`:路径必须绝对,用 `existsSync` 校验;`spawnProcess(command, [path], {detached: true, env, stdio: "ignore"})`,`child.once("spawn")` 后 `unref()`,不阻塞 daemon。

### 9.16 Hostnames(`hostnames.ts`)

Vite 风格 host allowlist,防 DNS rebinding。

支持:`true`(放行所有) / `string[]` / `undefined`(默认 localhost + IP) / `'.example.com'` 通配。

> `docs/architecture.md` 仅一笔带过"allowedHosts"。实际配置语义与 Vite dev server 保持一致。

### 9.17 PID Lock(`pid-lock.ts`)

`$CHISACODE_HOME/chisacode.pid`:`{pid, startedAt, hostname, uid, listen, desktopManaged?}`。

`acquirePidLock`:

1. 读旧 lock,`process.kill(pid, 0)` 判断是否还活着
2. 旧 pid 仍活且不是自己 → 抛 `PidLockError`
3. 旧 pid 已死 → `unlink` 旧文件
4. `open(path, 'wx')` 原子创建

`releasePidLock`:**只删属于自己的 lock**(PID 校验)。

---

## 10. App 端(Expo 跨端)

### 10.1 包基础

- **包名**:`@chisacode/app`
- **依赖**:Expo SDK 54.x、React 19.1.0、React Native 0.81.5、`expo-router` 6.0.13、`react-native-unistyles` 3.2.4、`@tanstack/react-query` 5.90.11、`zustand` 5.0.9、`@gorhom/bottom-sheet` / `@gorhom/portal`、`@floating-ui/react-native`、`@dnd-kit/*`、i18next(zh-CN + en)
- **构建**:`web` / `ios` / `android` 三端启动命令;`build:web` 调用 `expo export`;`deploy:web` 部署到 Cloudflare Pages

### 10.2 Provider 嵌套顺序(`app/_layout.tsx`)

```
GestureHandlerRootView
  └─ SafeAreaProvider
       └─ KeyboardProvider(react-native-keyboard-controller)
            └─ PortalProvider(@gorhom/portal)
                 └─ HostRuntimeBootstrapProvider
                      └─ PushNotificationRouter
                      └─ SidebarCalloutProvider
                           └─ ToastProvider
                                └─ ProvidersWrapper (i18n + voice + 桌面集成)
                                     └─ AppShell
                                          └─ AppWithSidebar
                                               └─ RootStack
```

> **设计原则**:`PortalProvider` 必须保持在最内层全局 Provider,因为 `@gorhom/portal` 把 portal 内容渲染在 host 位置,任何 portal sheet 可能消费的上下文(QueryClient、theme、auth、settings)都必须包裹 PortalProvider。

### 10.3 路由结构(Expo Router)

| 路由路径                                | 文件                                            | 作用                                                                                                                      |
| --------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `/`                                     | `index.tsx`                                     | 启动入口,读取 `useEarliestOnlineHostServerId()` 与 `useLastWorkspaceSelection()`,否则 `StartupSplashScreen`,否则 redirect |
| `/welcome`                              | `welcome.tsx`                                   | 欢迎页,QR / 粘贴链接 / 重连                                                                                               |
| `/pair-scan`                            | `pair-scan.tsx`                                 | QR 扫描,`expo-camera` 的 `CameraView`                                                                                     |
| `/settings`                             | `settings/index.tsx`                            | 设置根                                                                                                                    |
| `/settings/[section]`                   | `settings/[section].tsx`                        | 设置详情                                                                                                                  |
| `/settings/projects`                    | `settings/projects/index.tsx`                   | 项目列表                                                                                                                  |
| `/settings/projects/[projectKey]`       | 项目详情                                        |
| `/settings/hosts/[serverId]`            | 单主机详情                                      |
| `/h/[serverId]/index`                   | 主机根,redirect 到 `/h/[serverId]/open-project` |
| `/h/[serverId]/sessions`                | 会话历史                                        |
| `/h/[serverId]/open-project`            | 打开项目                                        |
| `/h/[serverId]/new`                     | 新建 workspace                                  |
| `/h/[serverId]/agent/[agentId]`         | agent 路由,做 cwd → workspaceId 解析,redirect   |
| `/h/[serverId]/workspace/[workspaceId]` | 核心工作区                                      |

> **不要在 workspace 路由加 `getId` 或 `dangerouslySingular`** —— Expo Router 会将其映射到 React Navigation 的 `getId`,会反复破坏 Android native-stack/Fabric 的已挂载 workspace 屏顺序。

### 10.4 启动与 Bootstrap

`HostRuntimeBootstrapProvider` 启动后台 daemon,`useEarliestOnlineHostServerId()` 用 `useSyncExternalStore` 监听 store。若 5 秒内没有任何主机 online / daemon 启动错误 / 用户放弃等待,则设置 `hasGivenUpWaitingForHost = true`。

### 10.5 关键 UI 原语(`components/ui/`)

#### 10.5.1 `<Button>`

5 种变体(`docs/design.md` 严格规定):

- `default` — 主操作,filled `accent`,每页最多 1 个
- `secondary` — 配对操作,filled `surface3`,默认
- `outline` — 低频行内操作,transparent + `borderAccent`
- `ghost` — 结构性、非决定性,无边框无背景
- `destructive` — filled `destructive`,**只在 confirm dialog 内部出现**

Sizes:`xs` (28px) / `sm` / `md`(默认) / `lg`。

> 设计文档明确说"`<Pressable>` 包 `<Text>` 是第六种 variant,错误"。

#### 10.5.2 `<DropdownMenu>`

"小而固定的菜单集合 + 锚定到 trigger"。自研定位系统(`measureInWindow` + `computePosition`)。

#### 10.5.3 `<Combobox>`

最大且最复杂的下拉组件(53.8KB,千余行),"大型或可搜索列表"(30+ hosts、模型选择器、branch 切换、GitHub issue/PR 搜索)。`options` / `searchable` / `placeholder` / `allowCustomValue` / `header` / `desktopPlacement` / `customValueKind` / `renderOption` / `keepOpenOnSelect`。

#### 10.5.4 `<AdaptiveModalSheet>`

"集中任务的容器":多字段表单、详情确认。**Compact 走 BottomSheet,Desktop 走居中卡片**。

#### 10.5.5 `<ContextMenu>`

长按 / 右键菜单,行即 trigger,无可见 affordance。

#### 10.5.6 `confirmDialog`(**函数,不是组件**)

Promise-based API:`await confirmDialog({ title, message, destructive: true })`。执行路径分级:isNative → `Alert.alert`;否则 Desktop bridge `getDesktopHost().dialog.ask`;否则 `globalThis.confirm()`。

#### 10.5.7 其他 UI 原语

- `<Alert>`(页面级静态通知)
- `<StatusBadge>`(状态 pill)
- `<Switch>` / `<SegmentedControl>`
- `<Tooltip>`(Floating UI)
- `<Autocomplete>` + `<AutocompletePopover>`(命令 / @mention)
- `<LoadingSpinner>` / `<Shortcut>`(键盘快捷键和弦)
- `<Floating>` / `<FloatingPanelPortalHost>`

### 10.6 主题 Token

`packages/app/src/styles/theme.ts` 是所有颜色、字体、间距、圆角、iconSize 的来源。Unistyles 3 用 `StyleSheet.create((theme) => ...)` 模式。

> **重要**:`useUnistyles()` **禁用** —— 会触发周期性 lockstep re-render,confirmed in profiling(见 `docs/unistyles.md`)。

### 10.7 Hover / Floating Panel / Unistyles

这三个领域有详细的"踩坑文档":

- `docs/hover.md`:canonical pattern 是 plain View + onPointerEnter/Leave + separate inner Pressable
- `docs/floating-panels.md`:Android touch hit-test by parent bounds、Portal escape 陷阱
- `docs/unistyles.md`:`useUnistyles()` 禁用、wrapper-`View` 模式

### 10.8 Composer(`packages/app/src/composer/`)

主输入区是整个 app 最重要的部分。`Composer` 提供完整的 prompt 提交逻辑、附件、voice 控制、provider/model 切换。

`docs/architecture.md` 提到"Composer UI and submit/draft behavior live in `packages/app/src/composer/`; screens and panels should integrate it from there instead of dropping composer internals into `components/`, `hooks/`, or `screens/workspace/`"。

### 10.9 Timeline Reducers

`packages/app/src/timeline/session-stream-reducers.ts` 处理:

- **compaction**(折叠 reasoning/tool_call 到 assistant_message)
- **gap detection**(seq 跳号)
- **sequence-based deduplication**(seq+epoch)

`docs/timeline-sync.md` 描述了 sync 正确性保证。

### 10.10 Subagents Track

`packages/app/src/subagents/track.tsx` 是 collapsible track,above composer in agent pane。Membership:`parentAgentId === thisAgent.id AND !archivedAt`。`handleCloseAgentTab` 在 `workspace-screen.tsx` 中:

- 根 agent:close tab 仍 archive
- 子 agent:close tab 只清布局(归档需显式按 archive 按钮)

### 10.11 Host Runtime Controller

`HostRuntimeBootstrapProvider` + `HostProfile`(client-side connection profile pointing at a daemon)。`getOrCreateCliClientId` 持久化 `cli-client-id`。

### 10.12 Session Context

`SessionContext` wraps the daemon client for the active session,通过 React Context 暴露给所有需要 ws 通信的组件。

### 10.13 React Query

`@tanstack/react-query` 5.90.11 用于 server state(agent 列表、provider snapshots、workspace git status 等)。绝大多数远端数据走 React Query。

### 10.14 i18n

双语支持:`zh-CN`(默认) + `en`。`CHISACODE_LANG=en` 可切。

### 10.15 App web deploys

`packages/app` 导出 SPA,`npm run deploy:web` 部署到 Cloudflare Pages。PWA `manifest.json` 在 `packages/app/public/manifest.json`。

> **不要加 service-worker caching** —— ChisaCode 是 agent live control surface,激进的 SW 会让用户卡在 stale web code。

### 10.16 已知关键修复

- `welcome-screen.tsx` 的 unistyles 主题 split 修复(`contentContainerStyle` 模式)
- iOS sidebar Reanimated + Unistyles 冲突修复
- ScrollView `contentContainerStyle` theme 更新 bug

---

## 11. CLI

### 11.1 入口与基础架构

| 文件              | 职责                                                                    |
| ----------------- | ----------------------------------------------------------------------- |
| `src/index.ts`    | Node.js ESM 入口                                                        |
| `src/cli.ts`      | `createCli()` 用 Commander.js 构建完整命令树                            |
| `src/run.ts`      | `runCli()` 真正执行                                                     |
| `src/classify.ts` | 启发式判断第一个参数是已知子命令还是现存目录(若是目录则 `open-project`) |
| `src/i18n.ts`     | `tCli(key, vars)` 双语字典                                              |
| `src/version.ts`  | 通过 `createRequire` 读 `package.json` 解析版本号                       |

### 11.2 全局选项

`-o, --format <table|json|yaml>` / `--json` / `-q, --quiet` / `--no-headers` / `--no-color`。

输出层(`src/output/`)独立子系统:

- `types.ts` — `OutputSchema<T>` / `SingleResult<T>` / `ListResult<T>` / `CommandError`
- `with-output.ts` — `withOutput(handler)` 包装器
- `render.ts` — `render()` 主调度,根据 `format` 分发到 `renderTable` / `renderJson` / `renderYaml`
- `table.ts` — 计算列宽时区分 ANSI 颜色(用 ANSI 正则剥离后再 `visibleLength`)
- `json.ts` / `yaml.ts` / `quiet.ts`

### 11.3 CLI 与 daemon 的 WebSocket 通信(`src/utils/client.ts`)

**`getDaemonHost(options)` 候选解析顺序**:

1. `options.host` 或 `CHISACODE_HOST`
2. 显式 `host` 形如 `https://...?serverId=...&pk=...` pairing offer → 解析为 ConnectionOffer,通过 relay 连接
3. IPC socket/pipe(从 `CHISACODE_LISTEN` / `chisacode.pid` / `config.json`)
4. 非默认 TCP host
5. 默认 `localhost:6767`

**`connectToDaemon(options)`**:

- 用 `getOrCreateCliClientId()` 持久化 `~/.chisacode/cli-client-id`(0o600 写盘),`cid_<32hex>`
- 构造 `DaemonClient`(`@chisacode/client/internal/daemon-client`),`clientType: "cli"`
- 重连禁用(`reconnect: { enabled: false }`)— CLI 命令是一次性的

### 11.4 顶级子命令

| 类别     | 子命令                                                                                                         |
| -------- | -------------------------------------------------------------------------------------------------------------- |
| Agent    | `ls` `run` `import` `attach` `logs` `stop` `delete` `send` `inspect` `wait` `archive` `mode` `reload` `update` |
| Daemon   | `start` `status` `stop` `restart` `pair` `set-password`                                                        |
| Chat     | `ls` `create` `inspect` `post` `read` `wait` `delete`                                                          |
| Terminal | `ls` `create` `capture` `send-keys` `kill`                                                                     |
| Loop     | `run` `ls` `inspect` `logs` `stop`                                                                             |
| Schedule | `create` `ls` `inspect` `update` `pause` `resume` `delete` `run-once` `logs`                                   |
| Permit   | `ls` `allow` `deny`                                                                                            |
| Provider | `ls` `models`                                                                                                  |
| Worktree | `ls` `create` `archive`                                                                                        |
| 顶级别名 | `ls`/`run`/`import`/`attach`/`logs`/`stop`/`delete`/`send`/`inspect`/`wait`/`archive`/`status`/`restart`       |

### 11.5 Daemon 子命令深度

**`daemon start`**:选项 `--listen` / `--port` / `--home` / `--foreground` / `--no-relay` / `--relay-use-tls` / `--no-mcp` / `--no-inject-mcp`。detached 模式 `runtime.spawnDetached` → `spawnProcess(process.execPath, ...)`;1.2s grace 期(`DETACHED_STARTUP_GRACE_MS`);--foreground 走 `spawnSync` 同步。

**`daemon stop`**:选项 `--timeout` (15s) / `--force` / `--kill-timeout` (3s);优先 `tryConnectToDaemon` + `client.shutdownServer()`;失败回退 `signalProcessTreeOrOwnerSafely` 递归杀进程组;`waitForPidExit` 100ms 轮询;超时 `SIGKILL`。

**`daemon restart`**:stop → start。若 stop 抛 "Timed out" 且非 force,会用 `force: true` 重试一次。

**`daemon status`**:同时 `resolveLocalDaemonState` + WebSocket 探测。`getLastServerInfoMessage()?.features?.daemonStatusRpc === true` 判断新 RPC 可用性;回退到 `checkProviderBinaries()` 跑 `binary --version`。

**`daemon pair`**:生成 QR 配对码。

**`daemon set-password`**:用 `hashDaemonPassword` 存 bcrypt 哈希到 `config.json`。

---

## 12. Desktop

### 12.1 概述

`packages/desktop` 是 Electron 桌面壳,管理自己的 daemon 子进程。macOS / Linux / Windows 三平台支持。

### 12.2 子进程管理

- Electron app spawn daemon 为 managed subprocess(`desktopManaged: true` 标记在 `chisacode.pid`)
- 通过 `process.send` IPC 协议交换 `{type: "chisacode:ready", listen}` / `chisacode:shutdown` / `chisacode:restart`
- 桌面模式下 daemon 的 lifecycle intent 由 Electron 处理(用户按"重启"按钮)

### 12.3 macOS 合成器 watchdog(`packages/desktop/src/window/compositor-watchdog/index.ts`)

macOS display sleep 会让 Chromium GPU process 的 display link 卡在 stale display。`setupDarwinCompositorWatchdog`:

- 轮询 renderer 帧生产(每几秒)
- 持续 stall 时(window visible + unlocked)重启 GPU process,让 Chromium 重建 display link
- 屏幕锁定 / window hidden / minimized 时跳过

### 12.4 Desktop 远程调试

`npm run dev:desktop` 启动 Chromium remote debugging 端口 `9223`,可通过 CDP 抓取 renderer CPU profile。`CHISACODE_ELECTRON_REMOTE_DEBUGGING_PORT` 可覆盖。

### 12.5 Custom Protocol

`chisacode://app` 是 desktop renderer 用的自定义 scheme(在 `app.use(CORS)` 中显式 allow)。

### 12.6 跨平台构建

`electron-builder.yml` 配置三平台;`packages/desktop/scripts/` 包含平台特定构建逻辑。

---

## 13. 工具链、构建与开发

### 13.1 TypeScript 严格模式

- **Fully strict** —— no `any`, no implicit `any`
- `interface` 优先于 `type`(当两者皆可时)
- `function` 声明优先于 arrow
- `z.infer<typeof schema>`(不手写并行 type)
- `noUnusedLocals: true`、`noUnusedParameters: true`、`noFallthroughCasesInSwitch: true`

### 13.2 Biome(oxfmt + oxlint)

```json
{
  "indentStyle": "space",
  "indentWidth": 2,
  "lineWidth": 100,
  "quoteStyle": "double",
  "trailingCommas": "all",
  "semicolons": "always"
}
```

- `npm run format` — 格式化
- `npm run lint` — lint
- **`npm run format` before committing**(CLAUDE.md 硬性约束)
- **始终用 npm script**,不要直接 `npx eslint`、`npx oxfmt`、`npx oxlint`

### 13.3 构建命令(`package.json`)

```bash
npm run build:client       # protocol -> client
npm run build:server-deps  # highlight -> relay -> protocol -> client
npm run build:server       # server-deps -> server -> cli
npm run build:app-deps     # highlight -> protocol -> client -> expo-two-way-audio
```

**关键规则**(CLAUDE.md 硬性约束):跨包类型错误时,先 build workspace 让 dist 声明最新。

### 13.4 Watch 模式

`dev:server` 用 `concurrently` 启三个 watch:`watch:protocol` / `watch:client` / `dev:server:raw`。改了 `protocol/src/*` 或 `client/src/*`,watch 会自动重新编译。

### 13.5 测试

按后缀分类:

| 后缀                  | 类型                      | 跑法                             |
| --------------------- | ------------------------- | -------------------------------- |
| `*.test.ts(x)`        | Unit                      | `npm run test:unit`              |
| `*.posix.test.ts`     | Unit,POSIX-only           | skipped on Windows               |
| `*.browser.test.ts`   | App,需要真浏览器          | `npm run test:browser`           |
| `*.e2e.test.ts`       | E2E against real daemon   | `npm run test:e2e`               |
| `*.real.e2e.test.ts`  | E2E hitting real provider | `npm run test:integration:real`  |
| `*.local.e2e.test.ts` | E2E local-only            | `npm run test:integration:local` |

> **CLAUDE.md 硬性约束**:
>
> - 永不跑完整测试套件(会冻机器)
> - 只跑改过的文件:`npx vitest run <file> --bail=1`
> - 不要 `npm run test` 跑整个 workspace(除非被明确要求)
> - 永远不在测试里加 auth 检查(provider 自己处理)
> - 信任另一个 agent 已经报告的 green 结果
> - 整套验证靠 push 到 CI + GitHub Actions

### 13.6 开发服务器

`npm run dev` → `./scripts/dev.sh`(macOS/Linux)或 `./scripts/dev.ps1`(Windows):

- macOS/Linux:`concurrently` + `portless`,每个服务稳定 URL(`https://daemon.localhost`、`https://app.localhost`)
- Windows:daemon 绑 `localhost:6767`,Expo 走默认端口

**`CHISACODE_HOME`**:

- `npm run dev` 从 worktree 启动 → 派生 `~/.chisacode-<worktree-name>`,首次运行从 `~/.chisacode` 拷贝种子
- `npm run dev` 从 main checkout 启动 → 临时 mktemp 目录
- 显式:`CHISACODE_HOME=~/.chisacode-blue npm run dev`

### 13.7 关键 env 变量

- `CHISACODE_HOME` — 运行时状态目录
- `CHISACODE_LISTEN` — listen 目标
- `CHISACODE_PASSWORD` — daemon 密码(明文)
- `CHISACODE_HOSTNAMES` — 逗号分隔的 hostname 列表
- `CHISACODE_RELAY_USE_TLS` / `CHISACODE_RELAY_PUBLIC_USE_TLS` — relay TLS
- `CHISACODE_LOG_LEVEL` — `trace` 拿完整 provider / session / agent-manager traces
- `CHISACODE_DICTATION_DEBUG` — 启用 dictation WAV 调试
- `CHISACODE_DICTATION_AUTO_COMMIT_SECONDS` — auto-commit 阈值
- `CHISACODE_LANG` — CLI/UI 语言(`zh-CN` / `en`)
- `CHISACODE_PAIRING_QR` — 强制 QR 码打印(`1/true/yes/y/on`)
- `CHISACODE_DESKTOP_MANAGED=1` — 标记 desktop managed mode
- `CHISACODE_SERVER_ID` — 覆盖 server id(测试用)
- `CHISACODE_ELECTRON_REMOTE_DEBUGGING_PORT` — Electron CDP 端口覆盖

### 13.8 关键限制

- **永不重启主 ChisaCode daemon on port 6767** —— 它管理所有 agent,自己重启会自杀
- **永不假设超时需要重启** —— 超常常是瞬时的
- **build 顺序错的话,跨包类型会报假错** —— 先 build dependencies

### 13.9 性能与限制

- Default timeline fetch page = 200 items
- Stream coalescer 60ms 窗口
- Provider snapshot 加载 30s timeout
- Schedule tick 1s
- Workspace git fetch 3 分钟
- Workspace git self-heal 60s
- dictation auto-commit 15s 默认
- dictation finalization max 5min
- attention presence 3 min
- voice final transcript timeout 10s
- External session disconnect grace 90s
- Hello timeout 15s
- Pcm16 mono resample 默认 client → detector/stt rates
- Chat @everyone fanout limit 25
- Push batch size 100
- bcrypt cost 12
- Lookup caches: 256 (default) / 64 (checkout diff)
- LRU TTL 15s
- Linux watcher 最多 5000 目录
- Throttle 2s non-forced refresh
- Bcrypt cost 12
- Watcher BFS 并发 16

---

## 14. 文档与代码的不一致

> 本节汇总所有发现的不一致,按子系统组织。每条都标注了"文档说"vs"代码实际"。

### 14.1 入口与基础

| 项   | 文档说                                                | 代码实际                                                         |
| ---- | ----------------------------------------------------- | ---------------------------------------------------------------- |
| 入口 | `packages/server/src/server/index.ts`(CLAUDE.md 表格) | `packages/server/src/server/daemon-worker.ts`(`index.ts` 不存在) |

### 14.2 WebSocket 协议

| 项                      | 文档说                                                      | 代码实际                                                                                                                                                                                                                 |
| ----------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ |
| Hello capabilities 示例 | `voice?`, `pushNotifications?`                              | 实际还有 `reasoning_merge_enum` + `custom_mode_icons`(COMPAT: v0.1.84)                                                                                                                                                   |
| 终端流 opcode           | 4 个:Output(0x01)/Input(0x02)/Resize(0x03)/Snapshot(0x04)   | 实际 5 个:**Restore (0x05)** 未被文档提及                                                                                                                                                                                |
| File transfer 帧格式    | "separate format"无细节                                     | 实际是完整协议:opcode 0x10/0x11/0x12 + `requestId` 1 字节长度前缀                                                                                                                                                        |
| AgentUpdate kind        | "Agent state changed"                                       | 实际 `kind: "upsert"                                                                                                                                                                                                     | "remove"` 判别联合 |
| RPC 命名迁移            | 文档规定"Use dots, not slashes";`Do not add new flat names` | chat/schedule/loop 三个子协议**全部使用斜杠**;新增的 RPC 仍大量使用 flat 命名(`list_provider_models_request`、`fetch_recent_provider_sessions_request`、`file_explorer_request`、`create_chisacode_worktree_request` 等) |
| Relay 协议版本          | v1                                                          | 实际 `CURRENT_RELAY_PROTOCOL_VERSION = "2"`,`normalizeRelayProtocolVersion` 接受 "1"/"2"                                                                                                                                 |
| agent_status substate   | (未提)                                                      | `server_info` 嵌套在 `status.payload.status` 内,`KnownStatusPayloadSchema` 统一 7 种状态                                                                                                                                 |

### 14.3 数据流与状态机

| 项              | 文档说                                                                                | 代码实际                                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 数据流 step 1-7 | "create → status(agent_created) → agent_update → agent_stream → fetch_timeline"       | 正确,但**未提**:`mcpServers.chisacode` 注入、`applyDaemonAppendSystemPrompt`、`cascadeArchiveChildren`、`tryRunOutOfBand` |
| Timeline 持久化 | "default fetch page is 200 items" + "Storage uses sequence numbers"                   | 正确,但**未提**:timeline rows 走 `durableTimelineStore` 独立存储,`applySnapshot` 只写 record 不写 rows                    |
| 存储位置        | "`agents/{cwd-with-dashes}/{agent-id}.json` # Agent record + persisted timeline rows" | rows 与 record **不在一起**,`STORED_AGENT_SCHEMA` 不含 timeline rows 字段                                                 |

### 14.4 Provider 系统

| 项                        | 文档说                                     | 代码实际                                                                                                                 |
| ------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| 5 个 provider             | claude/codex/copilot/opencode/pi           | 加上 `mock` / `mock-slow`(dev-only) 共 7 个;`cursor` 实际是 `CursorACPAgentClient extends GenericACPAgentClient`(走 ACP) |
| Pi modes                  | "Pi 不暴露可切换 mode"                     | 一致(`modes: []`)                                                                                                        |
| OpenCode modes            | "build / plan"                             | 一致,但 `isUnattended` 通过 `featureValues.auto_accept === true` 实现,不是 mode                                          |
| Codex version gate        | "0.128+ for goals, 0.115+ for auto-review" | 完全一致(`CODEX_GOALS_MIN_VERSION` / `CODEX_AUTO_REVIEW_MIN_VERSION`)                                                    |
| OpenCode MCP              | "用 mcp.add,不要 mcp.connect"              | 完全一致;`registerMcpServer` 调 `mcp.add`,`isAlreadyPresentMcpError` 容错 `already/exists/connected`                     |
| OpenCode user message IDs | "OpenCode owns user message IDs"           | 完全一致,`emittedUserMessageIds / messageRoles` 仅做去重                                                                 |

### 14.5 子系统

| 子系统                                                                                        | 文档状态                                                   | 实际情况                                                                                                         |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `script-proxy.ts`                                                                             | **完全未提**                                               | `*.localhost` 路由 + Vite 风格 subdomain fallback + WS upgrade 透传,ChisaCode 给本地 dev server 提供 host 服务   |
| `hostnames.ts`                                                                                | 仅 `architecture.md` 一笔带过(allowedHosts)                | 实际是 Vite 风格 allowlist:支持 `true` / `string[]` / `undefined` / `'.example.com'` 通配                        |
| `auto-archive-on-merge/`                                                                      | **完全未提**                                               | PR 合并后自动清理 ChisaCode worktree,有完整 safety check                                                         |
| `agent-attention-policy.ts`                                                                   | **完全未提**                                               | "agent 失焦"通知路由策略,`PRESENCE_THRESHOLD_MS = 180_000`                                                       |
| `editor-targets.ts`                                                                           | **完全未提**                                               | 6 个内置 IDE target,带可用性探测                                                                                 |
| `file-explorer/`                                                                              | **完全未提**                                               | 沙箱化目录/文件浏览,带双层 realpath 防御 + dangling symlink 优雅跳过                                             |
| `file-download/token-store.ts`                                                                | **完全未提**                                               | 一次性下载 token                                                                                                 |
| `chat-mentions.ts`                                                                            | 仅 `chat/` 子目录提了一句                                  | 实际含 fanout 上限(@everyone 限 25)、二次资格校验、resolveAgentIdentifier                                        |
| `dictation-stream-manager.ts`                                                                 | 仅在 `architecture.md` 列了 RPC 名                         | 实际是带 seq/ack/auto-commit/静音检测/智能超时的复杂流式协议                                                     |
| `voice-turn-controller.ts`                                                                    | 仅一句"voice features"                                     | 实际是 VAD + STT partial/final + 填充词抑制 + STT 重连 + 10s timeout 的完整 turn 模型                            |
| `script-health-monitor.ts` / `script-status-projection.ts` / `script-route-branch-handler.ts` | **完全未提**                                               | 三个并行文件,实际承担脚本生命周期的不同切面                                                                      |
| `provider-snapshot-manager`                                                                   | **完全未提**                                               | 实际是 `createAgent` 的关键依赖(`requireAvailableClient` 阻塞等待 provider ready)                                |
| `reconnect grace 90s`                                                                         | **完全未提**                                               | `EXTERNAL_SESSION_DISCONNECT_GRACE_MS = 90_000` —— WS server 一大特性                                            |
| `push 通知 + attention policy`                                                                | **完全未提**                                               | `agent-attention-policy.ts` + `push/notifications.ts` + `PushTokenStore`                                         |
| `mcpBaseUrl` 注入 mcpServers.chisacode                                                        | **完全未提**                                               | `createAgent` 必经路径                                                                                           |
| `daemon-config-store` 运行时改 appendSystemPrompt/mcp injectIntoAgents                        | **完全未提**                                               | 通过 `onFieldChange` 实时热更                                                                                    |
| `MCP server 工具列表`                                                                         | "MCP server for sub-agent creation, permissions, timeouts" | 实际暴露约 30 个工具,分 5 类(agent/terminal/schedule/provider/worktree)                                          |
| `chisacode.pid` 字段                                                                          | "`{ pid, startedAt, ... }`"                                | 实际含 `pid / startedAt / hostname / uid / listen / desktopManaged?`                                             |
| `workspace-archive-service`                                                                   | "soft-delete"                                              | 实际还有"项目下所有 active workspace 都 archive 时自动 archive 整个 project"的级联                               |
| Loop verifier 失败                                                                            | "retry until an exit condition"                            | 一致,但**未提** verifier 既可跑 shell(`verifyChecks`)也可跑 LLM(`verifyPrompt`),顺序是 "先 checks 都过 → 再 LLM" |
| Schedule runOnCreate                                                                          | **未提**                                                   | every 默认立即跑,cron 默认等下次                                                                                 |

### 14.6 文档风格建议

1. 补全 `auto-archive-on-merge/`
2. 补全 `script-proxy.ts` + `script-health-monitor.ts`
3. 补全 `hostnames.ts` 单列
4. 补全 `dictation-stream-manager.ts` + `voice-turn-controller.ts`
5. 补全 `agent-attention-policy.ts`
6. `docs/architecture.md` 列出 6 个模块,实际 `packages/server/src/server/` 顶层有 140+ 文件
7. 修 `docs/architecture.md` 终端流 opcode 列表(加 Restore 0x05)
8. 修 `docs/architecture.md` Hello 能力示例(加 `reasoning_merge_enum` + `custom_mode_icons`)
9. 修 CLAUDE.md 入口文件路径(`daemon-worker.ts` 替代不存在的 `index.ts`)
10. 在 `docs/rpc-namespacing.md` 中明确 chat/schedule/loop 三个子协议使用斜杠的迁移债
11. 修 `docs/data-model.md` 关于 `agents/.../record.json` 包含 timeline rows 的描述
12. 修 `docs/architecture.md` 关于 relay 协议 v1 的描述(当前 v2)

---

## 15. 关键设计哲学

### 15.1 核心原则

- **零复杂度预算**:每个抽象必须证明自己有当下价值
- **YAGNI**:build features and abstractions only when needed
- **不要 drive-by 改动**
- **Functional and declarative** over object-oriented
- **`function` 声明** over arrow function assignments
- **`interface` 优先** over `type`
- **没有 `index.ts` barrel re-export** —— 创造间接性和循环依赖风险
- **强类型判别联合** > `{isLoading, error?, data?}` 袋子

### 15.2 类型与 schema

- Zod 是 wire 真理源,`z.infer<typeof schema>` 派生所有 wire type
- `.passthrough()` 用在外部输入(允许新字段)
- `.strict()` 用在内部信任结构(任何未知字段直接抛错)
- `.default()` 给可选字段默认值
- 手写 interface 只在不上 wire 的纯 TS 类型(agent-types.ts)
- 命名:`z.string().uuid()` 而不是手写 UUID 校验

### 15.3 错误处理

- 抛 typed error classes
- 区分"catching for handling" vs "letting it bubble up"
- Fail explicitly —— throw 不要 silent substitute
- 几乎所有副作用路径都用 catch + warn 兜底(auto-archive、token 删除、terminal kill 都是 Promise.allSettled)
- 一次性消费 token / atomic write 防半写

### 15.4 持久化哲学

- **零数据库、零迁移框架**:全文件 JSON + Zod 校验,新字段一律 optional + default
- 原子性分两类:temp+rename 走严格(registry、chat、push-tokens、agent);plain writeFile + persistQueue 串行化(schedules、loops);其余 0600 + 极少改写
- `pendingWrites` map 串行同一 agentId 的写
- `deleting` set 防止删除过程中还在 write
- `applySnapshot` 保留已有 `title` / `createdAt` / `archivedAt`

### 15.5 协议可演进性

- **协议层永不破坏向后兼容**(CLAUDE.md 硬性约束)
- 新字段一律 `.optional()` + `.passthrough()`
- 删字段保留读取
- 收窄类型(enum 收紧)禁止
- 能力门控:新枚举值用 `CLIENT_CAPS.xxx` + `session.supports(...)` gate
- 一次性 compat 注释:`COMPAT(name): added in v0.1.X, drop when floor >= v0.1.X`
- 一行 grep `rg "COMPAT\("` 应该出完整清理清单

### 15.6 测试即规格

- 真实依赖 > mocks(数据库、CLI 进程、文件系统用真实)
- 端口和适配器模式 + in-memory fakes
- 没有 `vi.mock`、`JSDOM`、`@testing-library`、fake-server fixtures
- 端到端 = 真 daemon + 真浏览器(Playwright)
- 单元测试 = production code 接受注入的依赖

### 15.7 状态管理

- 状态机优先于 bag of booleans
- `ManagedAgent` 是 5 态判别联合
- discriminated union over `{ isLoading; error?; data? }` bags
- React `useReducer` 处理多状态交互
- React Query 用于 server state
- Zustand 用于本地状态
- 服务端事件流:`session event tail` 串行化(provider 异步事件防乱序)

### 15.8 性能

- Stream coalescer 60ms 窗口(防 WS 消息风暴)
- Provider snapshot 缓存(cold/warm 转换,无 TTL)
- LRU 多级缓存 + 15s TTL + in-flight 合并
- Workspace git throttle 2s(防 watcher 触发风暴)
- Timeline 默认分页 200
- dictation auto-commit 智能超时补偿
- AsyncGenerator stream + waiter Promise 模型(代替手动 callback hell)

### 15.9 安全

- Curve25519 + XSalsa20-Poly1305(relay E2EE,zero-knowledge)
- daemon 私钥 0600(Windows 跳过)
- bcrypt 密码哈希(cost 12)
- WS token 走 `Sec-WebSocket-Protocol`,不走 query(避免被日志记录)
- DNS rebinding 防护(Vite 风格 hostname allowlist)
- CORS 显式 origin 集合
- File Explorer 沙箱:双层 realpath + O_NOFOLLOW
- Worktree 所有权校验:任何破坏性操作都先 `isChisaCodeOwnedWorktreeCwd`
- Auto-archive-on-merge:多层 guard(feature flag → ownership → git clean → error log)
- chat @everyone fanout 限 25(防误触发)
- loop/verifier/schedule 内部 agent 标 `internal: true`,默认不展示
- pino redact 屏蔽 `authorization` 与 `Sec-WebSocket-Protocol` 变体

### 15.10 跨平台

- Windows + POSIX 跨平台:`path.win32.parse` / `path.posix.parse` 分支
- Windows 下 `shell: false`(避开 `.cmd` / `--mcp-config` 引号问题)
- Codex 在非 Windows 上 detached,Windows 不 detached
- O_NOFOLLOW 在 Windows 上是 noop(Windows 语义不同)
- `*.localhost` 浏览器自动解析(无需 /etc/hosts)
- 跨平台渲染:React Native + react-native-web + Electron + Expo

### 15.11 多 provider 抽象

- **provider 抽象优先,具体后填** —— `AgentClient / AgentSession / AgentStreamEvent` 三件套构成抽象边界
- 选 ACP 还是 Direct 看各家 CLI 能力,而不是统一模式
- ACP 基类承担 boilerplate,子类只填 transformer / writer
- Provider 自己处理 auth,ChisaCode 不管 key
- Mode 是 UI 概念 + provider 实现的合并,运行时是真相源
- Capability 协商(static)与 runtime 探测(dynamic)结合

### 15.12 UX 一致性

- 5 种 picker (`<DropdownMenu>` / `<Combobox>` / `<ContextMenu>` / `<AdaptiveModalSheet>` / `confirmDialog`) 各自一个工作
- 5 种 button 变体
- 唯一 `<Button>` 优于 `<Pressable><Text>`
- 主题 token 一处定义,StyleSheet.create((theme) => ...) 模式
- 层级靠 weight 和 color,不靠 size
- 白空间是设计

### 15.13 失败恢复策略

- 启动恢复:启动时把 status: "running" 的 loop/schedule 强制标 stopped
- Crash recovery 不"自愈"重跑 —— 保守策略
- Provider snapshot 不 TTL,只能显式 refresh(settings 刷新)
- Auto-archive-on-merge 失败仅 warn,不抛
- Daemon 重连 grace 90s(网络切换无感)
- 错误捕获几乎所有路径都是 catch + warn(不阻断主流程)
