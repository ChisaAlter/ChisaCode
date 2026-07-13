# Provider God-File 拆分计划

> 状态：**进行中**（2026-07-12 开始按 composition-first 策略执行）。
>
> 背景：综合改进路线图归档后，三个 provider agent 实现仍是 god-file，单点修改风险高、
> provider 间重复模式难以验证。本计划采用分阶段、composition-first 的领域拆分策略。

## 2026-07-12 执行修正

- 删除未接线的 `BaseAgentClient` / `BaseAgentSession`。复核发现它们的默认 turn ID、interrupt、close、runtime info 与 persistence 语义会改变现有 provider 行为，不能作为无风险公共基类。
- 拆分策略从“先强制继承基类”调整为 **composition-first**：先提取无状态 helper、transport、event translator、runtime 和领域 handler；只有在至少两个 provider 出现经过测试证明的稳定同构契约后，才重新引入共享基类。
- Codex 已完成三十二个边界切片：`skills.ts`、`notifications.ts`、`notification-router.ts`、`turn-config.ts`、`models.ts`、`launch.ts`、`runtime-config.ts`、`client.ts`、`client-runtime.ts`、`session.ts`、`thread-bootstrap.ts`、`session-metadata.ts`、`session-history.ts`、`session-connection.ts`、`session-commands.ts`、`session-runtime.ts`、`session-turn-execution.ts`、`tool-notification-handler.ts`、`delta-notification-handler.ts`、`item-notification-handler.ts`、`turn-notification-handler.ts`、`notification-stream-state.ts`、`context-compaction-state.ts`、`notification-timeline.ts`、`sub-agent-tracker.ts`、`permission-state.ts`、`permissions.ts`、`permission-controller.ts`、`session-event-bus.ts`、`user-message-turn-state.ts`、`image-attachments.ts` 与 `history.ts`；client/session factory、launch/runtime/router/parser 负责运行与协议入口，controller/state/领域模块负责 handler 生命周期、事件、rewind 索引与映射。
- Claude 已完成十四个边界切片：`timeline-assembler.ts`、`sdk-pump.ts`、`message-router.ts`、`message-translator.ts`、`query-lifecycle.ts`、`rewind-controller.ts`、`history-converter.ts`、`session-history.ts`、`tool-call-handlers.ts`、`sdk-types-mapping.ts`、`permission-controller.ts` 与 `options-builder.ts` 分别拥有 timeline、SDK reader、turn routing、message/usage translation、query/input/pump lifecycle、rewind state/selection、history conversion、persisted replay、tool lifecycle、纯映射、permission 生命周期与 SDK options/env 职责；`client.ts` 独立拥有 Client API、session factory、binary/auth 诊断与 persisted-session scanner；`session.ts` 独立承载 `ClaudeAgentSession`，`agent.ts` 收敛为 16 行兼容 façade。
- OpenCode 已完成 façade、session、client runtime、session runtime、session lifecycle、turn execution、event translator、event values、message translator、permission translator、sub-agent tracking、history、session event bus、permission controller、MCP controller、helpers、catalog、runtime、abort coordinator 与 event-stream controller 二十个边界切片；原入口为 64 行兼容 façade，foreground turn、message、permission、sub-agent、runtime 与 shutdown 资源状态已统一。
- ACP 已完成首个边界切片：`acp/tool-call-mapper.ts` 独立拥有增量 tool snapshot、plan/timeline/detail、permission request/option 与 raw payload 解析；`acp-agent.ts` 继续拥有 Session 状态、事件编排和 terminal 生命周期，并兼容重导出 `ACPToolSnapshot`。

## 现状

三个 provider agent 实现均直接 `implements AgentSession` / `implements AgentClient`，
**无共享基类、无 mixin、无 abstract class**。Codex Session 已收敛到 715 行；Claude Session 为 1225 行、message translator 为 428 行、query lifecycle 为 345 行、rewind controller 为 263 行；OpenCode façade 为 64 行、Session 为 395 行、turn execution 为 433 行、event translator 为 226 行、message translator 为 400 行、permission translator 为 214 行、sub-agent tracking 为 307 行、history 为 298 行、Client runtime 为 507 行；ACP 主文件为 2446 行，tool mapper 为 431 行。OpenCode 主路由已收敛，后续继续拆 ACP、Pi 与 Claude Session 的剩余大职责。

| 文件                                | 行数 | Session 类                    | Client 类                          | private 方法数 | import 数 |
| ----------------------------------- | ---- | ----------------------------- | ---------------------------------- | -------------- | --------- |
| `codex-app-server-agent.ts`         | 55   | compatibility façade          | public wrapper → `codex/client.ts` | 0              | 4         |
| `codex/session.ts`                  | 715  | `CodexAppServerAgentSession`  | —                                  | 15             | 29        |
| `claude/agent.ts`                   | 16   | compatibility façade          | wrapper → `claude/client.ts`       | 0              | 2         |
| `claude/session.ts`                 | 1225 | `ClaudeAgentSession`          | —                                  | 53             | 23        |
| `claude/message-translator.ts`      | 428  | SDK message/usage translation | —                                  | 9              | 5         |
| `claude/query-lifecycle.ts`         | 345  | query/input/pump lifecycle    | —                                  | 5              | 7         |
| `claude/rewind-controller.ts`       | 263  | rewind state/checkpoint logic | —                                  | 2              | 3         |
| `claude/options-builder.ts`         | 468  | SDK options/env construction  | —                                  | 5              | 9         |
| `claude/session-history.ts`         | 329  | persisted replay/block map    | —                                  | 5              | 8         |
| `claude/permission-controller.ts`   | 278  | permission lifecycle          | —                                  | 3              | 5         |
| `opencode-agent.ts`                 | 64   | compatibility façade          | compatibility wrappers             | 0              | 4         |
| `opencode/session.ts`               | 395  | `OpenCodeAgentSession`        | —                                  | 1              | 18        |
| `opencode/turn-execution.ts`        | 433  | foreground turn orchestration | —                                  | 5              | 15        |
| `opencode/event-translator.ts`      | 226  | event router/session mapping  | —                                  | 0              | 8         |
| `opencode/message-translator.ts`    | 400  | message/part/usage mapping    | —                                  | 0              | 6         |
| `opencode/permission-translator.ts` | 214  | permission/question mapping   | —                                  | 0              | 4         |
| `opencode/event-values.ts`          | 11   | event value parsing           | —                                  | 0              | 0         |
| `opencode/sub-agent-tracking.ts`    | 307  | sub-agent state/actions       | —                                  | 0              | 4         |
| `opencode/history.ts`               | 298  | history pipeline              | —                                  | 0              | 8         |
| `opencode/permission-controller.ts` | 108  | permission state              | —                                  | 2              | 5         |
| `opencode/mcp-controller.ts`        | 73   | MCP setup state               | —                                  | 2              | 5         |
| `opencode/session-event-bus.ts`     | 134  | turn/event state              | —                                  | 1              | 1         |
| `opencode/session-runtime.ts`       | 186  | runtime/catalog state         | —                                  | 2              | 5         |
| `opencode/session-lifecycle.ts`     | 108  | shutdown/resource state       | —                                  | 1              | 4         |
| `opencode/client.ts`                | 507  | —                             | `OpenCodeAgentClientRuntime`       | 2              | 13        |
| `acp-agent.ts`                      | 2446 | `ACPAgentSession`             | `ACPAgentClient`                   | —              | —         |
| `acp/tool-call-mapper.ts`           | 431  | tool/permission projection    | —                                  | 0              | 2         |

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
| Opencode | SSE event stream      | `OpenCodeEventStreamController` / `translateEvent`                                      |

### 最大单方法（拆分时优先抽取成独立 handler 模块）

| 方法                      | 文件                             | 行数          |
| ------------------------- | -------------------------------- | ------------- |
| `awaitPendingBeforeStart` | opencode/abort-coordinator.ts:44 | ~20（已提取） |
| `consume`                 | opencode/event-stream.ts:130     | ~70（已提取） |
| `routeMessage`            | claude/message-router.ts:290     | ~80（已提取） |

## 拆分策略

### Slice 0：移除错误抽象并建立 composition-first 基线（完成）

- 删除从未接线的 `providers/base/`，避免其默认 turn ID、interrupt、close 与 persistence 语义被误当成稳定契约。
- 保留现有 `AgentSession` / `AgentClient` 接口和 provider-specific 生命周期实现。
- 优先提取无状态 helper、transport、runtime、event translator 与领域 handler。
- Codex `skills.ts`、`notifications.ts`、`notification-router.ts`、`turn-config.ts`、`models.ts`、`launch.ts`、`runtime-config.ts`、`client.ts`、`client-runtime.ts`、`session.ts`、`thread-bootstrap.ts`、`session-metadata.ts`、`session-history.ts`、`session-connection.ts`、`session-commands.ts`、`session-runtime.ts`、`session-turn-execution.ts`、`tool-notification-handler.ts`、`delta-notification-handler.ts`、`item-notification-handler.ts`、`turn-notification-handler.ts`、`notification-stream-state.ts`、`context-compaction-state.ts`、`notification-timeline.ts`、`sub-agent-tracker.ts`、`permission-state.ts`、`permissions.ts`、`permission-controller.ts`、`session-event-bus.ts`、`user-message-turn-state.ts`、`image-attachments.ts` 与 `history.ts` 已完成，建立 client create/resume/session factory、稳定 façade、launch/version/env、initialize/MCP/custom provider、thread model/start/resume bootstrap、collaboration/skills metadata、persisted history state、connection lifecycle、slash-command/out-of-band command orchestration、session runtime/persistence state、foreground turn execution、client feature gate/persistence/models/diagnostics、tool/delta/item/turn notification lifecycle、native notification parse/route、turn config、model catalog、state/timeline、sub-agent、permission handler、event bus、rewind index、image attachment 和 history pipeline 边界。

**验收**：server typecheck/build、目标 lint、Codex skills 精确测试通过。

### Slice 1：Codex 拆分（最大文件先做，收益最高）

把 `codex-app-server-agent.ts` 5944 行拆为：

- `codex/session.ts` —— 移动 `CodexAppServerAgentSession`，保持 `implements AgentSession`；原入口保留 55 行兼容 façade（已完成，Session 内部 handler 继续拆分）
- `codex/client.ts` —— 移动 `CodexAppServerAgentClient`，通过显式 connectable session factory 保持 `implements AgentClient`，主文件仅保留三参数兼容包装（已完成）
- `codex/app-server-transport.ts` —— `CodexAppServerClient`（已完成）
- `codex/launch.ts` —— version gate、binary discovery、launch/env resolution 与 app-server spawn（已完成）
- `codex/runtime-config.ts` —— initialize 参数、MCP config、自定义 provider 与运行时模型身份指令（已完成）
- `codex/client-runtime.ts` —— feature gate、持久会话扫描、模型、归档、可用性与诊断（已完成）
- `codex/thread-bootstrap.ts` —— saved config/model list fallback、thread start/resume、auto-review 与 inner config（已完成）
- `codex/session-metadata.ts` —— collaboration modes、resolved mode、app-server skill cache 与策略过滤（已完成）
- `codex/session-history.ts` —— persisted history pending/entries、user-message 索引重建与 drain（已完成）
- `codex/session-connection.ts` —— client ownership、并发 connect 去重、initialize handshake、失败清理与 close 竞态（已完成）
- `codex/session-commands.ts` —— slash-command 解析、custom prompt/skill 展开、命令目录及 `/compact`/`/goal` 编排（已完成）
- `codex/session-runtime.ts` —— config/mode/feature/service tier、runtime info cache 与 persistence metadata（已完成）
- `codex/session-turn-execution.ts` —— foreground/native turn state、run/start/interrupt、参数构建与启动日志（已完成）
- `codex/notifications.ts` —— notification schema/parser/type guard（已完成）
- `codex/notification-router.ts` —— schema parse、delta 判别、notification kind 分派（已完成）
- `codex/notification-stream-state.ts` —— delta/output 缓冲、生命周期去重、terminal 关联（已完成）
- `codex/context-compaction-state.ts` —— manual trigger、itemId 归因、双通道 completion 去重（已完成）
- `codex/notification-timeline.ts` —— command/patch/terminal timeline 映射与 output delta 解码（已完成）
- `codex/sub-agent-tracker.ts` —— child thread 映射、子时间线排序、父 sub-agent 状态重建（已完成）
- `codex/permission-state.ts` —— permission request/handler 原子登记、消费与关闭清理（已完成）
- `codex/permission-controller.ts` —— command/file/question/plan 请求校验、响应和 timeline 副作用（已完成）
- `codex/session-event-bus.ts` —— turnId 标记、event trace、订阅者隔离与关闭清理（已完成）
- `codex/user-message-turn-state.ts` —— messageId 去重、turn index、rollback 截断与 rewind 契约（已完成）
- `codex/permissions.ts` —— plan/question 规范化、timeline 映射、decision 与 implementation prompt（已完成）
- `codex/image-attachments.ts` —— data URI/base64 归一化、私有临时文件、history materialize 与 TTL 清理（已完成）
- `codex/history.ts` —— item type 兼容、实时/回放 timeline 映射、时间戳与 `thread/read` 展开（已完成）
- `codex/tool-notification-handler.ts` —— exec/terminal/patch 生命周期、缓冲输出关联与 edit 完整性诊断（已完成）
- `codex/delta-notification-handler.ts` —— assistant boundary、主线程/sub-agent 文本 delta 与 command/file 输出缓冲（已完成）
- `codex/item-notification-handler.ts` —— item started/completed、stream suffix、compaction、user-message 与 sub-agent child item（已完成）
- `codex/turn-notification-handler.ts` —— thread/turn/plan/usage/rollback/compaction 通知及 turn-scoped 状态（已完成）
- `codex/skills.ts` —— skills/custom prompts/front matter/策略过滤（已完成）
- `codex/turn-config.ts` —— mode/sandbox/output schema/`turn/start` 参数构建（已完成）
- `codex/models.ts` —— model schema/config defaults/thinking option 映射（已完成）

**验收**：原入口收敛为显式兼容 façade；session/client/transport 分离；typecheck 与对应 Codex 聚焦测试通过；Session 已降至 715 行 orchestrator。`rewind.ts` 已拥有 fork/rollback 核心语义，保留 Session 中的窄接线，不再创建重复 controller。

### Slice 2：Claude 拆分（继续进行）

原 `claude/agent.ts` 从 5185 行收敛为 16 行兼容 façade；Session 主实现迁至 `claude/session.ts`（1225 行）：

- `claude/session.ts` —— `ClaudeAgentSession` orchestration，保持 `implements AgentSession`（已完成，1225 行；继续评估 session identity/runtime orchestration）
- `claude/client.ts` —— Client API、显式 Session factory、binary/auth 诊断与 persisted-session scanner（已完成，523 行；`agent.ts` 保留兼容包装）
- `claude/timeline-assembler.ts` —— assistant/reasoning delta、message identity、去重与 finalize 状态（已完成，325 行）
- `claude/sdk-pump.ts` —— SDK iterator reader、raw logging、interrupt-abort recovery 与 finally cleanup（已完成，124 行）
- `claude/message-router.ts` —— foreground/autonomous turn 状态、事件标识、终态分派与 stale-result 抑制（已完成，397 行）
- `claude/message-translator.ts` —— SDK system/user/assistant/stream/result 翻译、task notification、compaction、用户去重、usage 累积与 missing-resume 识别（已完成，428 行）
- `claude/query-lifecycle.ts` —— query/input、restart、pump 单实例、interrupt/return 超时收敛、close 与 stderr 诊断（已完成，345 行）
- `claude/rewind-controller.ts` —— user-message 索引、turn anchor、`/rewind` 解析、checkpoint 候选回退与结果文案（已完成，263 行）
- `claude/tool-call-handlers.ts` —— tool cache、partial JSON 聚合、运行/完成/失败/取消映射与结构化结果（已完成，651 行）
- `claude/history-converter.ts` —— transcript 噪声过滤、synthetic/tool-result 判定、compaction 元数据与 `convertHistoryEntry`（已完成，327 行）
- `claude/session-history.ts` —— transcript path/load/JSONL ingest、单次 replay、rewind candidate 与 live/history block mapping（已完成，329 行）
- `claude/sdk-types-mapping.ts` —— content/type guards、question/permission/MCP/session ID 与 usage/token 映射（已完成，233 行）
- `claude/permission-controller.ts` —— SDK canUseTool、pending map、abort cleanup、question/plan/tool resolution 与 close rejection（已完成，278 行）
- `claude/options-builder.ts` —— SDK env overlays、Model Gateway override、thinking/ultracode、fast settings、MCP/system prompt 与安全日志摘要（已完成，468 行）

**验收**：同 Slice 1。

### Slice 3：Opencode 拆分

把 `opencode-agent.ts` 3782 行拆为：

- `opencode/session.ts` —— `OpenCodeAgentSession` orchestration（已完成，395 行；入口收敛为 64 行兼容 façade）
- `opencode/client.ts` —— Client API、server acquisition、model/mode discovery、诊断与显式 Session factory/persistence collector ports（已完成，507 行；主入口保留兼容 wrappers）
- `opencode/helpers.ts` —— create config、权限、MCP、tool schema 与诊断 helper（已完成，318 行；统一复用 `constants.ts`）
- `opencode/catalog.ts` —— model/mode catalog、context-window lookup、runtime model prefix 与 slash-command discovery（已完成，311 行）
- `opencode/runtime.ts` —— `ProductionOpenCodeRuntime`（已完成）
- `opencode/abort-coordinator.ts` —— local turn signal、provider `session.abort` pending 与 next-turn serialization（已完成，87 行）
- `opencode/mimocode-client.ts` —— `MimoCodeAgentClient`
- `opencode/event-stream.ts` —— SSE readiness、消费循环、stale terminal 抑制与终态路由（已完成，269 行）
- `opencode/event-translator.ts` —— native event routing、todo、session lifecycle/terminal 映射与兼容 re-export façade（已完成，226 行）
- `opencode/history.ts` —— persistence scanner、revert 截断、replay timestamp 与 timeline conversion（已完成，298 行）
- `opencode/permission-controller.ts` —— auto-accept、pending queue 与 question/tool response（已完成，108 行）
- `opencode/mcp-controller.ts` —— 一次性配置、并发去重、already-present 兼容与失败重试（已完成，73 行）
- `opencode/session-event-bus.ts` —— active turn、subscriber、turn ID、running tool terminal synthesis 与 close suppression（已完成，134 行）
- `opencode/session-runtime.ts` —— mode/model/thinking/feature、catalog cache、context-window selection 与 persistence metadata（已完成，186 行）
- `opencode/session-lifecycle.ts` —— close ordering、abort/archive reconciliation、ephemeral delete 与 server release（已完成，108 行）
- `opencode/turn-execution.ts` —— prompt parts、slash command 分流、run/start/interrupt、MCP/SSE 启动顺序与 provider dispatch（已完成，433 行）
- `opencode/event-values.ts` —— SDK payload record/non-empty string 解析原语（已完成，11 行；MCP controller 不再依赖 event translator）
- `opencode/message-translator.ts` —— message/part/delta、structured output、stream dedupe、usage/context 与 tool/compaction 映射（已完成，400 行）
- `opencode/permission-translator.ts` —— permission/question 规范化、命令与 cwd 提取、detail/title/description 映射（已完成，214 行）
- `opencode/sub-agent-tracking.ts` —— child session 绑定、动作日志、乱序 tool part 缓冲与 parent permission 归属（已完成，307 行）

**验收**：同 Slice 1。

### Slice 3.5：ACP 拆分（进行中）

- `acp/tool-call-mapper.ts` —— 增量 tool snapshot、plan/timeline/detail、permission request/option 与 raw payload 解析（已完成，431 行）
- `acp-agent.ts` —— 保留 Client/Session orchestration、terminal ownership、进程与 transport 生命周期（进行中，2446 行；原 `ACPToolSnapshot` 兼容重导出）

**验收**：server typecheck、目标 lint、新 mapper 5 个断言与既有 generic permission 透传场景通过。

### Slice 4：跨 provider 共享 rewind / tool-call-mapper

各 provider 子目录现有独立的 `tool-call-mapper.ts` / `rewind.ts`；ACP 已先建立 provider-specific mapper。等待至少第二个 provider 出现经测试证明的同构契约后，再评估提取共享版本到 `providers/shared/`，差异点继续保留为 provider-specific strategy。

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
