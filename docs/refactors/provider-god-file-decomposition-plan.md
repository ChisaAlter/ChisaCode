# Provider God-File 拆分计划

> 状态：**进行中**（2026-07-12 开始按 composition-first 策略执行）。
>
> 背景：综合改进路线图归档后，三个 provider agent 实现仍是 god-file，单点修改风险高、
> provider 间重复模式难以验证。本计划采用分阶段、composition-first 的领域拆分策略。

## 2026-07-12 执行修正

- 删除未接线的 `BaseAgentClient` / `BaseAgentSession`。复核发现它们的默认 turn ID、interrupt、close、runtime info 与 persistence 语义会改变现有 provider 行为，不能作为无风险公共基类。
- 拆分策略从“先强制继承基类”调整为 **composition-first**：先提取无状态 helper、transport、event translator、runtime 和领域 handler；只有在至少两个 provider 出现经过测试证明的稳定同构契约后，才重新引入共享基类。
- Codex 已完成七个边界切片：`skills.ts`、`notifications.ts`、`turn-config.ts`、`models.ts`、`notification-stream-state.ts`、`sub-agent-tracker.ts` 与 `permission-state.ts`；状态对象封装流式通知、child thread 聚合及 permission request/handler 生命周期，session 保留事件发送与跨领域协调。

## 现状

三个 provider agent 实现均直接 `implements AgentSession` / `implements AgentClient`，
**无共享基类、无 mixin、无 abstract class**。各 provider 独立实现 5000+ 行，重复模式风险高。

| 文件                        | 行数 | Session 类                   | Client 类                                     | private 方法数 | import 数 |
| --------------------------- | ---- | ---------------------------- | --------------------------------------------- | -------------- | --------- |
| `codex-app-server-agent.ts` | 5656 | `CodexAppServerAgentSession` | `CodexAppServerAgentClient`                   | ~60            | 28        |
| `claude/agent.ts`           | 5185 | `ClaudeAgentSession`         | `ClaudeAgentClient`                           | ~71            | 24        |
| `opencode-agent.ts`         | 3750 | `OpenCodeAgentSession`       | `OpenCodeAgentClient` + `MimoCodeAgentClient` | ~18            | 21        |

**已存在的共享设施**（仅模块级 helper，无基类）：

- `provider-runner.ts` 的 `runProviderTurn()` —— 三处 `run()` 都调用，唯一共享行为
- `provider-availability.ts` / `provider-image-output.ts` / `tool-call-detail-primitives.ts` /
  `tool-call-mapper-utils.ts` / `diagnostic-utils.ts` —— 模块级工具函数
- 各 provider 子目录内独立的 `tool-call-mapper.ts` / `rewind.ts`（未跨 provider 共享）

## 共享契约分析

三个 Session 类都实现 `AgentSession` 接口的 13 个必填方法；三个 Client 类都实现
`AgentClient` 接口的 4 个必填方法。

### Session 层的表面重复（暂不做基类）

这些方法名称相似，但 turn ownership、事件标记、interrupt、close 与 persistence 语义并不相同。先通过 provider-specific helper/handler 拆分降低复杂度；只有两个以上 provider 在真实测试下形成稳定同构契约时，才提取共享组件：

- `subscribe` / `notifySubscribers` / `emitEvent` —— 事件订阅列表管理
- `createTurnId` —— turn ID 生成
- `getRuntimeInfo` —— runtime 元信息
- `describePersistence` —— 持久化句柄
- `setMode` / `setModel` / `setThinkingOption` / `setFeature` —— setter 透传
- `getPendingPermissions` —— 权限队列读取
- `interrupt` / `close` —— 生命周期终止

### Client 层的候选共享点（composition 优先）

- `createSession` / `resumeSession` —— 保留 provider-specific session 工厂，先抽 spawn/config helper
- `isAvailable` / `getDiagnostic` —— 复用模块级诊断 helper，不强制继承
- `listPersistedAgents` —— 按 native storage/transport 分别提取 scanner

### 不可简单共享的差异点（保留为 provider-specific strategy）

事件路由层差异最大，应保留 provider-specific handler/context port，不定义跨 provider 的 native event 抽象：

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

### Slice 0：移除错误抽象并建立 composition-first 基线（完成）

- 删除从未接线的 `providers/base/`，避免其默认 turn ID、interrupt、close 与 persistence 语义被误当成稳定契约。
- 保留现有 `AgentSession` / `AgentClient` 接口和 provider-specific 生命周期实现。
- 优先提取无状态 helper、transport、runtime、event translator 与领域 handler。
- Codex `skills.ts`、`notifications.ts`、`turn-config.ts`、`models.ts`、`notification-stream-state.ts`、`sub-agent-tracker.ts` 与 `permission-state.ts` 已完成，建立扩展发现、native notification、turn config、model catalog、stream state、sub-agent tracking 和 permission lifecycle 边界。

**验收**：server typecheck/build、目标 lint、Codex skills 精确测试通过。

### Slice 1：Codex 拆分（最大文件先做，收益最高）

把 `codex-app-server-agent.ts` 5944 行拆为：

- `codex/session.ts` —— 移动 `CodexAppServerAgentSession`，保持 `implements AgentSession`
- `codex/client.ts` —— 移动 `CodexAppServerAgentClient`，保持 `implements AgentClient`
- `codex/app-server-transport.ts` —— `CodexAppServerClient`（已完成）
- `codex/notifications.ts` —— notification schema/parser/type guard（已完成）
- `codex/notification-stream-state.ts` —— delta/output 缓冲、生命周期去重、terminal 关联（已完成）
- `codex/sub-agent-tracker.ts` —— child thread 映射、子时间线排序、父 sub-agent 状态重建（已完成）
- `codex/permission-state.ts` —— permission request/handler 原子登记、消费与关闭清理（已完成）
- `codex/notification-handlers.ts` —— `handleCodexDeltaNotification` /
  `handleThreadStateNotification` / `respondToPermission` 等状态处理方法
- `codex/skills.ts` —— skills/custom prompts/front matter/策略过滤（已完成）
- `codex/turn-config.ts` —— mode/sandbox/output schema/`turn/start` 参数构建（已完成）
- `codex/models.ts` —— model schema/config defaults/thinking option 映射（已完成）

**验收**：原文件删除；typecheck + 全部 codex 相关测试通过；行为不变（靠现有测试守护）。

### Slice 2：Claude 拆分

把 `claude/agent.ts` 5182 行拆为：

- `claude/session.ts` —— 移动 `ClaudeAgentSession`，保持 `implements AgentSession`
- `claude/client.ts` —— 移动 `ClaudeAgentClient`，保持 `implements AgentClient`
- `claude/timeline-assembler.ts` —— `TimelineAssembler` helper 类（已在文件头）
- `claude/sdk-pump.ts` —— `runQueryPump` / `routeSdkMessageFromPump`
- `claude/tool-call-handlers.ts` —— `handleToolUseStart` / `handleToolResult`
- `claude/history-converter.ts` —— `convertHistoryEntry`
- `claude/sdk-types-mapping.ts` —— 文件头 SDK 类型映射

**验收**：同 Slice 1。

### Slice 3：Opencode 拆分

把 `opencode-agent.ts` 3782 行拆为：

- `opencode/session.ts` —— 移动 `OpenCodeAgentSession`，保持 `implements AgentSession`
- `opencode/client.ts` —— 移动 `OpenCodeAgentClient`，保持 `implements AgentClient`
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

| 风险                              | 缓解                                                                                |
| --------------------------------- | ----------------------------------------------------------------------------------- |
| Session/Client 接口契约破坏       | 每个 Slice 单独验证，靠现有 provider 测试套件守护（codex/claude/opencode 各有测试） |
| 事件路由差异大，共享 context 膨胀 | 每个 provider 先用窄 context port 提取 handler，不统一 native event payload         |
| private 状态耦合深，难外移        | 先抽无状态 helper，再引入窄 context port；每个 Slice 独立提交                       |
| 测试覆盖薄弱点放大风险            | 拆分前先补 client 测试（本批次 workflow 已在做）                                    |

## 执行顺序与依赖

```
Slice 0（composition-first 基线）─┬─→ Slice 1（Codex）
                                 ├─→ Slice 2（Claude）
                                 └─→ Slice 3（Opencode）
                                                ↓
                                          Slice 4（验证后共享）
```

Slice 1/2/3 互相独立；Slice 4 只有在前面切片证明真实同构后才执行，不以制造共享抽象为验收目标。

## 不做项

- 不改 `AgentSession` / `AgentClient` 接口本身（协议只增不减原则）
- 不预设 abstract class/mixin；共享抽象必须由至少两个已拆分 provider 的稳定契约反向证明
- 不一次性重命名 provider 内部事件方法（保持现有命名，仅改文件位置）

## 参考

- `comprehensive-improvement-roadmap.md` —— 主改进路线图，持续记录每个已完成切片
- `session-decomposition-plan.md` —— session.ts 拆分的成功模式（handler-per-domain）
- `agent-sdk-types.ts:629/681` —— AgentSession / AgentClient 契约定义
