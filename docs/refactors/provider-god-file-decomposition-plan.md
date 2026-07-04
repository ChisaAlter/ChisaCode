# Provider God-File 拆分计划

> 状态：**草案**（2026-07-03 起草）。本批次未执行，留作下一阶段工作。
>
> 背景：综合改进路线图归档后，三个 provider agent 实现仍是 god-file，单点修改风险高、
> provider 间重复模式无法共享。本计划提出分阶段拆分与基类下沉策略。

## 现状

三个 provider agent 实现均直接 `implements AgentSession` / `implements AgentClient`，
**无共享基类、无 mixin、无 abstract class**。各 provider 独立实现 5000+ 行，重复模式风险高。

| 文件                        | 行数 | Session 类                             | Client 类                                                        | private 方法数 | import 数 |
| --------------------------- | ---- | -------------------------------------- | ---------------------------------------------------------------- | -------------- | --------- |
| `codex-app-server-agent.ts` | 5944 | `CodexAppServerAgentSession` (2485 行) | `CodexAppServerAgentClient` (422 行)                             | ~60            | 28        |
| `claude/agent.ts`           | 5182 | `ClaudeAgentSession` (3532 行)         | `ClaudeAgentClient` (290 行)                                     | ~71            | 24        |
| `opencode-agent.ts`         | 3782 | `OpenCodeAgentSession` (1055 行)       | `OpenCodeAgentClient` (387 行) + `MimoCodeAgentClient` (1111 行) | ~18            | 21        |

**已存在的共享设施**（仅模块级 helper，无基类）：

- `provider-runner.ts` 的 `runProviderTurn()` —— 三处 `run()` 都调用，唯一共享行为
- `provider-availability.ts` / `provider-image-output.ts` / `tool-call-detail-primitives.ts` /
  `tool-call-mapper-utils.ts` / `diagnostic-utils.ts` —— 模块级工具函数
- 各 provider 子目录内独立的 `tool-call-mapper.ts` / `rewind.ts`（未跨 provider 共享）

## 共享契约分析

三个 Session 类都实现 `AgentSession` 接口的 13 个必填方法；三个 Client 类都实现
`AgentClient` 接口的 4 个必填方法。

### 可下沉到 BaseAgentSession 的强重复

这些方法在三处结构高度相似，差异主要在内部状态字段名，适合做模板方法（hooks 化）：

- `subscribe` / `notifySubscribers` / `emitEvent` —— 事件订阅列表管理
- `createTurnId` —— turn ID 生成
- `getRuntimeInfo` —— runtime 元信息
- `describePersistence` —— 持久化句柄
- `setMode` / `setModel` / `setThinkingOption` / `setFeature` —— setter 透传
- `getPendingPermissions` —— 权限队列读取
- `interrupt` / `close` —— 生命周期终止

### 可下沉到 BaseAgentClient 的强重复

- `createSession` / `resumeSession` —— session 工厂
- `isAvailable` / `getDiagnostic` —— 可用性探测
- `listPersistedAgents` —— 持久化扫描

### 不可简单共享的差异点（保留为 provider-specific strategy）

事件路由层差异最大，基类只暴露 `protected abstract dispatchNativeEvent(...)`：

| Provider | 事件机制              | 路由方法                                                                                |
| -------- | --------------------- | --------------------------------------------------------------------------------------- |
| Codex    | JSON-RPC notification | `handleNotification` / `handleCodexDeltaNotification` / `handleThreadStateNotification` |
| Claude   | SDK pump              | `routeSdkMessageFromPump` / `handleToolUseStart` / `handleToolResult` / `runQueryPump`  |
| Opencode | SSE event stream      | `translateEvent` / `ensureEventStreamReady`                                             |

### 最大单方法（拆分时优先抽取成独立 handler 模块）

| 方法                                  | 文件                           | 行数 |
| ------------------------------------- | ------------------------------ | ---- |
| `awaitPendingAbortBeforeStartingTurn` | opencode-agent.ts:2902         | ~220 |
| `handleToolResult`                    | claude/agent.ts:4300           | ~197 |
| `respondToPermission`                 | codex-app-server-agent.ts:3851 | ~157 |
| `ensureEventStreamReady`              | opencode-agent.ts:3135         | ~188 |
| `handleCodexDeltaNotification`        | codex-app-server-agent.ts:4647 | ~128 |
| `convertHistoryEntry`                 | claude/agent.ts:4144           | ~135 |
| `routeSdkMessageFromPump`             | claude/agent.ts:3208           | ~121 |
| `buildTurnStartParams`                | codex-app-server-agent.ts:3537 | ~76  |

## 拆分策略

### Slice 0：提取共享基类（基础设施）

新增 `packages/server/src/server/agent/providers/base/`：

- `base-agent-session.ts` —— `BaseAgentSession` abstract class
  - 实现 `subscribe` / `notifySubscribers` / `emitEvent` / `createTurnId`
  - 实现 `getRuntimeInfo` / `describePersistence` / `setMode` / `setModel` /
    `setThinkingOption` / `setFeature` / `getPendingPermissions` / `interrupt` / `close`
  - 模板方法：`run()` 默认调 `runProviderTurn(this, ...)`（已有 helper）
  - `protected abstract dispatchNativeEvent(event): Promise<void>` —— provider 实现事件路由
  - `protected abstract buildTurnStartParams(...): Promise<unknown>` —— provider 实现参数构造

- `base-agent-client.ts` —— `BaseAgentClient` abstract class
  - 实现 `isAvailable` / `getDiagnostic` / `listPersistedAgents` 通用骨架
  - `protected abstract assertConfig(config): Promise<void>`
  - `protected abstract instantiateSession(handle, launchContext): AgentSession`

**验收**：基类单独 typecheck 通过；三个 provider 仍各自 implements，行为不变。

### Slice 1：Codex 拆分（最大文件先做，收益最高）

把 `codex-app-server-agent.ts` 5944 行拆为：

- `codex/session.ts` —— `CodexAppServerAgentSession extends BaseAgentSession`
- `codex/client.ts` —— `CodexAppServerAgentClient extends BaseAgentClient`
- `codex/json-rpc-client.ts` —— 模块级 `CodexAppServerClient`（已在文件头）
- `codex/notification-handlers.ts` —— `handleCodexDeltaNotification` /
  `handleThreadStateNotification` / `respondToPermission` 等大方法
- `codex/front-matter-parser.ts` —— 文件头 front-matter 解析
- `codex/build-turn-params.ts` —— `buildTurnStartParams`

**验收**：原文件删除；typecheck + 全部 codex 相关测试通过；行为不变（靠现有测试守护）。

### Slice 2：Claude 拆分

把 `claude/agent.ts` 5182 行拆为：

- `claude/session.ts` —— `ClaudeAgentSession extends BaseAgentSession`
- `claude/client.ts` —— `ClaudeAgentClient extends BaseAgentClient`
- `claude/timeline-assembler.ts` —— `TimelineAssembler` helper 类（已在文件头）
- `claude/sdk-pump.ts` —— `runQueryPump` / `routeSdkMessageFromPump`
- `claude/tool-call-handlers.ts` —— `handleToolUseStart` / `handleToolResult`
- `claude/history-converter.ts` —— `convertHistoryEntry`
- `claude/sdk-types-mapping.ts` —— 文件头 SDK 类型映射

**验收**：同 Slice 1。

### Slice 3：Opencode 拆分

把 `opencode-agent.ts` 3782 行拆为：

- `opencode/session.ts` —— `OpenCodeAgentSession extends BaseAgentSession`
- `opencode/client.ts` —— `OpenCodeAgentClient extends BaseAgentClient`
- `opencode/runtime.ts` —— `ProductionOpenCodeRuntime`
- `opencode/mimocode-client.ts` —— `MimoCodeAgentClient`
- `opencode/event-stream.ts` —— `ensureEventStreamReady` / `translateEvent` /
  `awaitPendingAbortBeforeStartingTurn`
- `opencode/sub-agent-tracking.ts` —— 模块级 sub-agent 跟踪 helper 函数集合

**验收**：同 Slice 1。

### Slice 4：跨 provider 共享 rewind / tool-call-mapper

各 provider 子目录现有独立的 `tool-call-mapper.ts` / `rewind.ts`，评估能否提取共享版本
到 `providers/shared/`。差异点保留为 provider-specific strategy。

**验收**：至少一个 provider 改用共享版本；其他保持不变不算阻塞。

## 风险与缓解

| 风险                            | 缓解                                                                                |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| Session/Client 接口契约破坏     | 每个 Slice 单独验证，靠现有 provider 测试套件守护（codex/claude/opencode 各有测试） |
| 事件路由差异大，基类抽象泄漏    | `dispatchNativeEvent` 抽象方法不规定事件类型，provider 自定义 event payload         |
| private 方���状态耦合深，难外移 | Slice 0 先做基类，Slice 1-3 逐个 provider 拆，每 Slice 独立提交可回滚               |
| 测试覆盖薄弱点放大风险          | 拆分前先补 client 测试（本批次 workflow 已在做）                                    |

## 执行顺序与依赖

```
Slice 0（基类）─┬─→ Slice 1（Codex）
               ├─→ Slice 2（Claude）
               └─→ Slice 3（Opencode）
                              ↓
                        Slice 4（共享 rewind/mapper）
```

Slice 1/2/3 互相独立，可并行；Slice 4 依赖前面三 Slice 完成。

## 不做项

- 不改 `AgentSession` / `AgentClient` 接口本身（协议只增不减原则）
- 不引入 mixin（TypeScript mixin 与 strict 模式 + 复杂泛型组合易踩坑，用 abstract class）
- 不一次性重命名 provider 内部事件方法（保持现有命名，仅改文件位置）

## 参考

- `comprehensive-improvement-roadmap.md` —— 已归档路线图，未追踪此项
- `session-decomposition-plan.md` —— session.ts 拆分的成功模式（handler-per-domain）
- `agent-sdk-types.ts:629/681` —— AgentSession / AgentClient 契约定义
