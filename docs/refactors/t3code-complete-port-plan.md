# T3 移植完全计划（对抗审查修订版）

> 状态：已审查修订，待开工
> 依据：`docs/research/t3code-comprehensive-audit-2026-09-07.md`（两轮审计）+ 本文件 §1 实证核查
> 分支：`feature/t3-port`（已建），每模块独立 conventional commit

---

## 1. 对抗审查结论（实证裁决）

审查方法：对计划中所有"实现时核对"的不确定点，开工前用代码证据裁决；对每个模块找降级点、矛盾与遗漏。

| #   | 发现                                         | 证据                                                                                                                                                                                                                                    | 裁决                                                                                                                                                                                                                                                       |
| --- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **M10 数据源不存在**                         | `grep user_input/userInput packages/protocol/src` 零命中——协议层没有 user-input 事件                                                                                                                                                    | **M10 从本期移除**，登记 roadmap 残余（需先做协议层 user-input 事件，独立项）。避免交付一个永远空渲染的组件                                                                                                                                                |
| 2   | **M9 直接照搬 T3 会降级 UX**                 | T3 buffered 模式纯文本回复只在 spill/request-pause/turn-completed 时 flush——短回复"完成前什么都不显示"；ChisaCode 现状是逐 token 流式                                                                                                   | 修订为**时间窗 + 事件边界 + 溢出阀**三取最早（300ms 定时 flush / 非文本事件 flush / 24KB spill）。消息量降 10-50×，保留打字感。已验证 `appendAssistantMessage`（stream.ts:351）是 delta-append（`${last.text}${chunk}`），大块 flush 客户端语义不变        |
| 3   | **M2 复用旧引用会携带过期 index**            | `StreamLayoutItem.index/frameOrder` 每帧可变；复用上一帧对象则 index 过期 → 层叠/定位错乱                                                                                                                                               | 复用条件拆两档：**内容未变 且 index/frameOrder 未变 → 复用引用**；内容未变但位置变了 → 新建对象（该行本需重渲）。追加型更新不移动已有行 index → 收益保留                                                                                                   |
| 4   | **M2 工具组数组每帧重建 → 优化退化为 no-op** | `assignToolSequenceGroups`（layout.ts:198）每帧新建 `toolSequenceGroup` 数组；引用比较恒 false                                                                                                                                          | 组数组按 segment 引用缓存（WeakMap，对齐 model.ts 既有 `orderedTailCache` 模式）。不缓存则整个 M2 无效——这是本优化成立的前提，单测必须覆盖                                                                                                                 |
| 5   | **M3 缺协议兼容机制与 client 接线**          | repo 规则：新特性走 `server_info.features.*` 门禁 + COMPAT tag（模式见 websocket-server.ts:1351/1353）；计划漏了 client 包（protocol→server→`packages/client` 事件→app hook）且误挂 AgentManagerEvent（agent 作用域，端口发现是会话级） | 修订：`server_info.features.discovered_ports` 特性门禁（client 连接时声明支持，daemon 只对声明者发送）+ `COMPAT(discoveredPorts)` 注释（版本+移除日期）+ session 出站联合新增 `discovered_ports` 通知类型 + `packages/client` 事件发射接线。旧客户端零破坏 |
| 6   | **M4 自相矛盾**                              | 计划同时写"移除 turn_changes 过滤"（→独立行）与"关联到 assistant 不新增行"                                                                                                                                                              | 裁决：**保持过滤**（不产生独立行），在 `layoutSegment` 遍历时捕获 turn_changes 附着到前一条 assistant 的 `StreamLayoutItem.turnChanges` 字段（纯派生）                                                                                                     |
| 7   | **M4 "Open diff" 无数据源**                  | `grep diff packages/protocol/src/workspace,agent` 零命中——协议没有 diff 内容 RPC；`DiffViewer` 需要 `DiffLine[]`                                                                                                                        | 点击行为降级为**打开文件预览 tab**（既有 file tab 通道）；"打开 diff" 登记残余（需先增 diff 内容 RPC，独立项，roadmap 记录）                                                                                                                               |
| 8   | **M6 数据源不存在**                          | 协议无 spawn 事件；ChisaCode 无子代理概念；多步骤数据源是 `todo_list`（reducer 产自 tool-call 解析，stream.ts:803/812）                                                                                                                 | **M6 与 M18 合并**：任务/多步骤摘要从 todo_list + task entries（`extractTaskEntriesFromToolCall`）派生。T3 agent-spawn 概念不移植（如实声明）                                                                                                              |
| 9   | **M7 内部/外部横幅未分离**                   | `sendError` 是 Composer 内部 state（index.tsx:277），bannerSlot 是外部 ReactNode——不能混一条通路                                                                                                                                        | `ComposerBannerStack` 接收 items 数组：Composer 合并内部 sendError（transient：输入即清，语义同现状）+ 外部 bannerSlot items（session 持久 dismiss，键 `threadKey:message`）。优先级明确定义：approval > error > warning > provider-status > activity      |
| 10  | **M12 双渲染决策缺失**                       | 现审批卡片在流内（permission 流卡）；banner 再加一份 = 重复 UI（用户长期反对）                                                                                                                                                          | **T3-faithful 全移**：流内 permission 卡移除，banner 面板接管审批；既有 `permission-response` 相关 e2e 同步迁移——列为该模块强制门禁，不是可选项                                                                                                            |
| 11  | **M14 React 节点 reparent 会崩**             | webview host div 由 RNW 渲染（`createElement("div",{ref})`）；手动移动 React 拥有的节点破坏 reconciliation                                                                                                                              | 修订：移动的是 **imperative 创建的 `<webview>` 元素**（document.createElement，非 React 管理），在两个 React 渲染的 host div（面板宿主/mini player 宿主）间迁移；React 节点永不手动移动。位置/尺寸会话内有效（对齐 T3，不持久化）                          |
| 12  | **M1 谓词不可计算 + 剥离逻辑照搬错误**       | ChisaCode 无 Lexical token——`dispatchComposerAgentMessage` 存的 text 就是用户原文，T3 的"剥离发送时上下文"在此是 no-op                                                                                                                  | ① 首行/末行判定改纯函数：`value.slice(0,selectionStart)` 无 `\n` → 首行；`value.slice(selectionEnd)` 无 `\n` → 末行。② 历史构建简化为 trim + 连续去重 + 新到旧。③ 重建时机：仅用户消息数/最新 id 变化时（订阅 selector 签名，非每 delta）                  |
| 13  | **原型门禁覆盖不全**                         | repo 规则"任何 UI 布局工作需先原型"；M4（变更文件树）、M12（审批面板）是新视觉布局但计划未列原型                                                                                                                                        | M4、M12 补 HTML 原型；全量原型清单：M4/M7/M12/M14/M15                                                                                                                                                                                                      |
| 14  | **每模块 roadmap 登记缺失**                  | repo 规则要求开工置 in-progress、完成置 done；计划只在收尾提一次                                                                                                                                                                        | 修订为每模块固定步骤：开工登记 → 完成（含残余）更新                                                                                                                                                                                                        |
| 15  | **M13 clamp 签名错误**                       | 返回 `{min,max}` 不是钳制值                                                                                                                                                                                                             | 改为 `clampBrowserPaneWidth(width, viewportWidth): number`                                                                                                                                                                                                 |
| 16  | **M2 验证口径过软**                          | "React DevTools 提交计数"是手工抽检                                                                                                                                                                                                     | 软化为补充证据；硬门禁 = 既有回归测试（bottom-anchor/web-virtualization/turn-anchor/reducers）+ Playwright 流式 spec 不回归                                                                                                                                |

---

## 2. 原则（全模块通用）

- 每模块完整交付：实现 → 聚焦 vitest（`--bail=1`，无固定 sleep）→ 改动文件 typecheck → lint → **对抗审查** → 下一模块
- **每模块 roadmap 登记**：开工置 in-progress（链接分支），完成置 done（含残余说明），残余边界如实命名
- UI 布局模块先 `prototypes/*.html` → 用户批准 → 实现 → 像素对齐验证（原型清单：M4/M7/M12/M14/M15）
- 桌面验证：打包 win-unpacked（先停运行中 app 防 exe 锁；`expo export` → desktop `tsc` → electron-builder 顺序）；native 未改动模块如实声明"未验证 native"
- 每模块 i18n：en + zh 全键（`i18n/index.ts`）
- 协议新增一律走 `server_info.features.*` 门禁 + `COMPAT(name)` 注释（版本 + 移除日期）

---

## 3. 模块规格

### 模块 1：提示历史（↑↓ 键）— P0

**目标**：输入框 ↑ 键向上浏览历史提示、↓ 向下，编辑即退出，发送失败后可快速恢复。

**新文件** `packages/app/src/composer/input/composer-prompt-history.ts`（纯函数）：

```typescript
export interface PromptHistoryEntry {
  id: string;
  text: string;
  createdAt: number;
}
// ChisaCode 无 Lexical token：user message text 即用户原文。
// 仅 trim + 连续重复合并 + 时间新→旧。附件不参与（非文本）。
export function buildComposerPromptHistory(
  messages: readonly UserMessageItem[],
): PromptHistoryEntry[];
export type PromptHistoryDirection = "back" | "forward";
export interface PromptHistoryStepInput {
  entries: readonly PromptHistoryEntry[];
  direction: PromptHistoryDirection;
  position: number | null; // null = 未在浏览态
  currentText: string;
  recalledText: string | null; // 浏览中上一次回填文本
}
export interface PromptHistoryStepResult {
  text: string;
  position: number | null;
}
// back：position===null 从 0 开始（当前文本非空且不等于 entries[0] 时仍从 0，T3 同语义）；
// forward：position+1 超出最新 → 清空文本 + position=null（回到编辑态）；
// 编辑检测：currentText !== recalledText 且 position!==null → 重置 position=null（退出浏览）由 hook 层调用方先判
export function stepComposerPromptHistory(
  input: PromptHistoryStepInput,
): PromptHistoryStepResult | null;
export function isCursorOnFirstLine(value: string, selectionStart: number): boolean; // value.slice(0,start) 无 "\n"
export function isCursorOnLastLine(value: string, selectionEnd: number): boolean; // value.slice(end) 无 "\n"
```

**接线**：

- `MessageInputProps` 新增：`promptHistoryEntries?: PromptHistoryEntry[]`、`onRecallPrompt?: (text: string) => void`（回填走 onChangeText，不清附件）
- `input.tsx` `handleDesktopKeyPressImpl`（line 411）：autocomplete 的 `onKeyPressCallback` 先行（既有顺序天然保证弹层打开时 ↑↓ 归补全）——之后新增 `ArrowUp`：`isCursorOnFirstLine` 且 entries 非空 → step back + `preventDefault`；`ArrowDown`：浏览态且 `isCursorOnLastLine` → step forward + preventDefault
- 新 hook `useComposerPromptHistory` 挂 `ActiveAgentComposer`（agent-panel.tsx）——**不挂 Composer 内部**：hook 以 `buildAgentStateSelector` 同模式订阅 session store tail+head，selector 签名 = 用户消息数 + 最新 user message id（delta 不触发重建）；draft composer（Soft Home /new）无历史，不接线
- 编辑退出：`onChangeText` 包装——`text !== recalledTextRef.current && position!==null` → reset

**测试** `composer-prompt-history.test.ts` ≥14：构建（新→旧/连续去重/trim/空）/step back 起点与推进/forward 清空回编辑态/编辑退出/首末行谓词（单行/多行/换行边界）

**验证**：vitest → web Playwright 定向 spec（发送→↑ 恢复→↑↑ 再前→编辑→↑ 重头开始→↓ 到底清空）；打包 Electron 实机同链路
**残余**：native 键盘无 ↑↓（RN 限制），仅 web/Electron，如实声明

---

### 模块 2：稳定行派生 — P0

**目标**：流式期间未变行复用对象引用，让 memo/tanstack 跳过整行重渲（M2 是性能主收益）。

**新文件** `packages/app/src/agent-stream/stable-layout.ts`：

```typescript
import type { StreamLayoutItem } from "./layout";
export interface StableStreamLayoutState {
  byId: Map<string, StreamLayoutItem>;
  result: StreamLayoutItem[];
}
export function computeStableStreamLayoutItems(
  items: readonly StreamLayoutItem[],
  prev: StableStreamLayoutState | null,
): StableStreamLayoutState;
// 复用两档判定（见审查 #3）：
//  isContentUnchanged(a,b) && a.index===b.index && a.frameOrder===b.frameOrder → 复用 prev 引用
//  仅内容未变但 index/frameOrder 变 → 新对象（行需重渲）
// 全部未变 → 返回 prev 对象本身（引用相等 → 上游 useMemo 全跳过）
export function isStreamLayoutItemContentUnchanged(
  a: StreamLayoutItem,
  b: StreamLayoutItem,
): boolean;
// 比较：item 引用、aboveItem/belowItem 引用、gapBelow、assistantSpacing、completedFooter、
// toolSequence、toolSequenceGroup 引用、isFirstInUserGroup/isLastInUserGroup/isLastInToolSequence、
// turnChanges（M4 后）。显式不比较：index、frameOrder（由外层两档判定处理）
```

**前置（本模块内完成，非外部依赖）**：`layout.ts` `assignToolSequenceGroups` 的组数组按 segment 引用做 WeakMap 缓存（对齐 model.ts `orderedTailCache` 模式，键 = 输入数组引用 + 长度）——不缓存则 M2 无效（审查 #4）
**新 hook** `useStableStreamLayout`（useRef 持 prev + useMemo 包 compute）
**接线**：`view.tsx` `streamLayout` useMemo 结果包一层 stable；`strategy-web.tsx` getItemKey 不变。view 层在 web/native 共享——**native 同步受益**（自动，声明）

**测试** `stable-layout.test.ts` ≥18：各 layoutItem 类型内容未变矩阵/流式 assistant 新引用（delta-append 证据 stream.ts:385）/tool_call 状态变化/index 变化不复制用/全未变返回同对象/追加新行（前一行 belowItem 变 → 新引用，其余复用）/删除行/空列表/组数组缓存命中
**验证**：既有 `web-virtualization`/`bottom-anchor-controller`/`turn-anchor-controller`/`session-stream-reducers` 测试回归；Playwright 既有流式 spec 不回归；打包 Electron 实机 DevTools 提交计数抽检（补充证据，非硬门禁）
**残余**：turnChanges 字段 M4 落地后纳入比较器（M4 内完成）

---

### 模块 3：端口扫描 + 本地服务器发现 — P0

**目标**：daemon 主机上运行中的本地 dev server 自动出现在浏览器面板空状态，点击即开。

**协议（先行，含兼容门禁）**：

- `packages/protocol/src/messages.ts` `features`（line 269）新增 `discoveredPorts: z.boolean().optional()`——client 连接时声明支持
- 新增会话级出站通知（**非 AgentManagerEvent**，审查 #5）：`SessionOutboundMessageSchema` 联合新增

```typescript
export const DiscoveredPortSchema = z.object({ host: z.string(); port: z.number(); processName: z.string().optional() });
export const DiscoveredPortsNoticeSchema = z.object({
  type: z.literal("discovered_ports"),
  ports: z.array(DiscoveredPortSchema),
});
```

- daemon 侧发送前查连接的 features 声明；`COMPAT(discoveredPorts): added in v<当前版本>, remove gate after <1年后>` 注释
- `packages/client`：出站消息解析（新类型入联合）+ 事件发射 `client.on("discovered_ports", ...)`

**服务端**：

- 新 `packages/server/src/server/preview/port-scanner.ts`

```typescript
export interface DiscoveredPort { host: string; port: number; processName?: string }
export async function scanListeningPorts(platform: NodeJS.Platform, execFn): Promise<DiscoveredPort[]>
// Win: powershell Get-NetTCPConnection -State Listen（固定命令串，零用户输入，无 shell 插值）
// macOS/Linux: lsof -iTCP -sTCP:LISTEN -P -n -F pcn
// 失败回退 COMMON_DEV_PORTS 逐个 HTTP GET，仅 text/html / xhtml / HTML 重定向入选
export class PortScannerController {
  // 扫描节流：实际系统扫描至多每 cacheTtlMs(15s) 一次；订阅通知每 scanIntervalMs(3s) 检查缓存是否变化
  retain()/release()   // 引用计数，零订阅停止轮询
  subscribe(fn: (ports: DiscoveredPort[]) => void): () => void
  getPorts(): DiscoveredPort[]
}
```

- 接入 session 层：面板打开（客户端发 `discovered_ports.subscribe` 入站通知 or 复用现有订阅模型——实现时按既有 session 订阅模式对齐）→ retain；关闭 → release；变化 → 推送

**客户端**：

- 新 `packages/app/src/hooks/use-discovered-servers.ts`：订阅 client 事件，返回 `DiscoveredPort[]`
- `browser-pane.electron.tsx` 空状态新 `DiscoveredServersSection`：卡片（进程名/host:port/favicon 占位）→ 点击 `handleOpenUrlInBrowserTab` 打开
- i18n `browser.discoveredServers/empty`（en+zh）

**测试**：`port-scanner.test.ts` ≥14（mock exec 输出/HTML 判定/回退探测/引用计数/节流 15s）；协议 schema 测试；`packages/client` 事件测试；server 集成（fake HTTP server 起端口 → 订阅收到）
**验证**：打包 Electron 实机：`npx http-server -p 9000` → 面板空状态卡片出现 → 点击打开
**残余**：UDP/非 HTTP 不报告；remote daemon 端口属 daemon 主机（如实显示）

---

### 模块 4：Turn Changes 渲染（变更文件树）— P0

**原型**：`prototypes/changed-files-tree.html`（树/折叠/DiffStat 行布局）→ 用户批准

**数据（已存在）**：`TurnChangesItem`（stream.ts:169-176 + reducer 产出于 825-838）；`DiffStat` 组件（`components/diff-stat.tsx`）复用。

**实现**：

- `layout.ts`：`isVisibleLayoutItem` **保持**过滤 turn_changes（不产生独立行，审查 #6）；`layoutSegment` 遍历时捕获 turn_changes，附着到其前一条 assistant 的 `StreamLayoutItem.turnChanges: TurnChangesItem | null`（新字段，纯派生）
- 新 `packages/app/src/components/changed-files-tree.tsx`

```typescript
export interface DiffTreeNode {
  name: string;
  isDir: boolean;
  children?: DiffTreeNode[];
  file?: ChangedFileEntry;
}
export function buildTurnDiffTree(files: readonly ChangedFileEntry[]): DiffTreeNode[]; // 按路径分组，叶挂 file
```

组件：目录头（折叠箭头/路径/聚合 DiffStat）+ 文件行（basename/消歧父路径/DiffStat）；展开状态 `expandedAll` + 每节点 override Set（纯函数 + 单测）；点击文件行 → **打开文件预览 tab**（既有 file tab 通道；"打开 diff" 无数据源，登记残余，审查 #7）

- `view.tsx` `renderAssistantMessageItem`：`layoutItem.turnChanges` 非空且回合 completed → assistant 文本下方渲染树
- `web-virtualization.ts`：assistant 项高度估计 + changedFiles 附加段
- `stable-layout.ts` 比较器补 `turnChanges` 引用比较（模块 2 残余闭合）
- i18n `stream.changedFiles/expand/collapse`

**测试**：`changed-files-tree.test.ts` ≥12（树构建/聚合统计/展开覆盖语义/空列表）；`layout.test.ts` 更新（附着断言）；`stable-layout.test.ts` 补 turnChanges 用例
**验证**：原型批准 → web Playwright 定向 spec（mock 尾置 turn_changes → 树渲染 → 展开 → 点击文件开预览）；打包 Electron 实机
**残余**："打开 diff" 待 diff 内容 RPC（roadmap 独立项）；`changeSummary` 文本不展示（树更直观）

---

### 模块 5：Webview 崩溃恢复 — P0

**新文件** `packages/app/src/components/webview-crash-recovery.ts`：

```typescript
export interface WebviewCrashRecovery {
  onCrash(): { reloadAfterMs: number } | null;
  reset(): void;
}
export function createWebviewCrashRecovery(opts?: {
  delays?: number[]; // 默认 [250, 500, 1000]
  windowMs?: number; // 默认 30_000
  maxAttempts?: number; // 默认 3
}): WebviewCrashRecovery;
// 窗口过期自动重置计数；超上限返回 null（停手动）
```

**接线**：`browser-pane.electron.tsx` webview effect（line 379-524）新增 `render-process-gone` 监听：覆盖层（图标 + `browser.crashedTitle/Body` + `details.reason` + 手动重载按钮）；`onCrash()` 非 null → setTimeout 重建（同一创建函数，幂等）；覆盖层与手动重载共用重建路径
**测试** `webview-crash-recovery.test.ts` ≥8（退避序列/窗口重置/上限 null/reset）
**验证**：vitest → 打包 Electron 实机：taskkill webview renderer → 覆盖层 → 自动恢复；连续 3 次后停手动
**残余**：崩溃原因枚举映射 Chromium error 字符串（只映射常见，其余显示原始 reason）

---

### 模块 6+18（合并）：任务/多步骤进度徽章 — P1

**裁决**（审查 #8）：T3 agent-spawn 概念不移植（ChisaCode 无子代理事件）；本模块从**既有数据源** `todo_list`（reducer 产自 tool-call 解析）+ task entries 派生。

**新文件** `packages/app/src/composer/tasks-badge.tsx`

```typescript
export interface ComposerTask {
  id: string;
  title: string;
  status: "completed" | "in_progress" | "pending";
  durationMs?: number;
}
export function deriveComposerTasks(items: readonly StreamItem[]): ComposerTask[] | null;
// 从最新 todo_list + task entries 派生；无任务返回 null
```

组件：分段彩条（completed=成功色/in_progress=主色/pending=静音）+ "3/7" 计数 + 可展开列表（状态图标/每步耗时）；inline 与 drawer（附着）两变体
**接线**：`ComposerProps.bannerSlot`（activity 层优先级最低）；数据订阅 `ActiveAgentComposer` 以 selector 拿 tail 最新 todo_list
**测试** `tasks-badge.test.tsx` ≥12（派生/分段/展开/耗时/空态）
**验证**：打包 Electron 实机（mock 多阶段 todo → 徽章推进 → 展开）；i18n `composer.tasks`
**残余**：任务时长口径 = 首事件到 completed 的差（非精确逐秒）

---

### 模块 7：横幅系统 — P1

**原型**：`prototypes/composer-banner.html` → 用户批准

**新目录** `packages/app/src/composer/banner/`：

- `composer-banner.tsx`：复合组件 `Root`（变体 default/error/info/success/warning；density compact/default；width full/content）→ `Row`/`Icon`/`Content`/`Actions`/`Dismiss`；Unistyles；附着模式背景衔接（web CSS 连续表面；native 平铺半透明）
- `composer-banner-logic.ts`

```typescript
export type ComposerBannerPriority =
  | "approval"
  | "error"
  | "warning"
  | "provider-status"
  | "activity";
export interface ComposerBannerItem {
  key: string;
  priority: ComposerBannerPriority;
  variant: "default" | "error" | "info" | "success" | "warning";
  message: string;
  icon?: ComponentType;
  actions?: ComposerBannerAction[];
  dismissal: "transient" | "session"; // transient 输入即清；session 按 key 持久 dismiss
}
export function resolveBannerStackVisible(
  items: readonly ComposerBannerItem[],
  dismissals: ReadonlySet<string>,
): { attached: ComposerBannerItem; peekItems: ComposerBannerItem[] };
// 最高优先级附着，其余 peek；同优先级取最新
export function bannerDismissalKey(threadKey: string, message: string): string;
```

- `composer-banner-stack.tsx`：附着 + peek 标签（"还有 N 条"）；hover 展开（web）/点击（native）；Escape 收起；关闭动画 220ms；session dismiss 存 module 级 `Set`（重挂载保留、不同 key 再现——T3 ThreadErrorBanner 语义）

**接线（审查 #9）**：

- `ComposerProps` 新 `bannerSlot?: ComposerBannerItem[]`（结构化 items，非裸 ReactNode）
- Composer 内部合并：内部 sendError → transient error item（`onChangeText` 清除，语义同现状）；外部 items 经 stack
- `agent-panel.tsx`：agent error（原 HistorySyncErrorBanner 的 agent 分支）迁移为外部 item；history-sync 分支保留原位
- 渲染位置：queueList 上方、输入框上方

**测试**：`composer-banner-logic.test.ts` ≥10（优先级/peek/dismiss key/同优先级最新）；`composer-banner.test.tsx` ≥12（变体/dismiss/attach）；`composer-banner-stack.test.tsx` ≥14（展开收起/Escape/transient vs session）
**验证**：原型批准 → 打包 Electron 实机：错误注入 → 堆叠 → dismiss → 不同错误再现 → 同错误不再现；sendError 输入即清
**残余**：玻璃态模糊 native 无（平铺）；`clip-path` web 回退

---

### 模块 8：滚动折叠 — P1

**新文件** `packages/app/src/composer/input/composer-scroll-gesture.ts`：

```typescript
export interface ComposerScrollGestureState {
  accumulatedDeltaPx: number;
  lastEventAt: number;
  collapsed: boolean;
}
export function createComposerScrollGestureState(): ComposerScrollGestureState;
export function recordComposerScrollGestureEvent(
  state: ComposerScrollGestureState,
  input: { deltaPx: number; towardEnd: boolean; now: number; typingWithinResetMs?: boolean },
): ComposerScrollGestureState;
// 向逻辑末端滚动 → 累计清零；≥24px 促折叠；返回新 state（纯函数）
export function suppressActiveComposerScrollGesture(state, now): ComposerScrollGestureState; // 120ms 窗口内输入抑制
```

**新 hook** `useComposerScrollCollapse`：web 全局 `wheel`；折叠条件追加 **无附件**（附件存在不折叠，对齐 M15 语义）；聚焦/pointerdown/回底恢复（复用 `useComposerFocusState.restoreAfterTimelineReachedEnd` 概念）
**接线**：`MessageInputProps` 新 `scrollCollapsed?: boolean`（单行高 + overflow hidden + 截断）；`agent-panel.tsx` 滚动容器接入
**与 M15 关系**：M8 的 `scrollCollapsed` 是独立折叠维度；M15 落地后统一为单一折叠状态机（M15 内合并，本期注明）
**测试** `composer-scroll-gesture.test.ts` ≥10（阈值/抑制/重置窗口/纯函数性）
**验证**：web Playwright（滚动→折叠→聚焦展开→回底展开）；打包 Electron 实机
**残余**：native 无 wheel，仅 web/Electron

---

### 模块 9：服务端 Delta 缓冲 — P1

**裁决**（审查 #2）：不照搬 T3 纯事件边界 flush（纯文本回复会"卡到完成"）。三取最早：**300ms 时间窗 / 非文本事件边界 / 24KB 溢出**。已验证客户端 delta-append 语义（types/stream.ts:351 `appendAssistantMessage`）——大块 flush 行为不变。

**修订**（2026-09-18 进度审查）：**改扩展现有 `agent-stream-coalescer.ts`，不再新建 `AssistantTextBuffer`**。实证：该 coalescer 已实现三条 flush 路径中的两条——可配置 `windowMs`（默认 60ms，`AGENT_STREAM_COALESCE_DEFAULT_WINDOW_MS`，`agent-manager.ts:561` 接线）与非文本事件边界 flush（`agent-session-event-pipeline-controller.ts:163` 对非可合并事件先 `flushFor`）。独立缓冲层会变成与 coalescer 并存的双定时器/双 flush 体系，排序交互复杂且收益重叠。本模块实际缺口只剩：**① 默认窗 60→300ms；② `maxBufferedChars` 溢出阈值（现有 append 路径无大小上限）；③ `enableAssistantTextBuffering` 逃生门（映射为 coalescer window=0/直通）**。改造量 ~40 行 + 测试；协议零变更不变。

<details><summary>原规格（备查）：新建 assistant-text-buffer.ts 独立缓冲层</summary>

**新文件** `packages/server/src/server/agent/assistant-text-buffer.ts`：

```typescript
export interface AssistantTextBufferOptions {
  maxBufferedChars?: number; // 默认 24_000
  flushIntervalMs?: number; // 默认 300
  timers?: { setTimeout; clearTimeout };
}
export class AssistantTextBuffer {
  appendDelta(turnId: string, messageId: string, delta: string, now: number): { spill: string };
  // Map<messageId,string> 追加；超上限清空并全量返回作溢出块
  takeDueFlushes(now: number): { messageId: string; text: string }[];
  // 300ms 窗到期的缓冲取出下发（时间窗路径）
  flushAllForTurn(turnId: string): { messageId: string; text: string }[];
  // 非文本事件（tool_call/turn_completed/permission）时调用（事件边界路径）
  clear(): void;
}
```

**接线**：`agent-session-event-pipeline-controller.ts` `handle()`（line 141）在 coalescer 之前拦截 `assistant_message` 文本：入 buffer → 时间窗到期/溢出/事件边界三条路径 flush 为普通 `assistant_message` 事件继续走管线；`AgentManagerOptions` 新 `enableAssistantTextBuffering?: boolean`（默认 true，逃生门）
**协议零变更**（仍 `assistant_message`，粒度变粗）
**测试**：`assistant-text-buffer.test.ts` ≥14（追加/时间窗/溢出/事件边界/按 turn 清理/并发消息 id/关停 clear）；`agent-stream-coalescer.test.ts` 回归；server 集成（fake provider 高频 delta → 断言下发次数 ≈ 每 300ms 一次）
**验证**：打包 Electron 实机流式体感对照（开/关 flag，长回复打字感不消失）
**残余**：300ms 首字延迟（对比逐 token；可接受，flag 可关）；真实 provider delta 粒度差异逐 provider 验证（mock 先行，真实列为后续验证）

</details>

**修订后规格**（2026-09-18，替代上方独立缓冲层）：

- `agent-stream-coalescer.ts`：`AgentStreamCoalescerOptions` 新增 `maxBufferedChars?: number`（默认 24_000）。`PendingTextEntry.text` 追加累计长度超限 → 立即 flush 并记溢出路径 trace；`AGENT_STREAM_COALESCE_DEFAULT_WINDOW_MS` 60 → **300**。
- `agent-manager.ts`：`AgentManagerOptions` 新 `enableAssistantTextBuffering?: boolean`（默认 true）→ false 时 coalescer `windowMs=0`（等价直通逐事件下发，逃生门语义不变）。
- **协议零变更**（仍 `assistant_message`，粒度变粗）。
- **测试**：`agent-stream-coalescer.test.ts` 新增 ≥8（300ms 默认窗/溢出阈值立即 flush/非文本事件边界 flush 既有断言保留/flag=off 直通/追加累计长度计数）；server 集成（fake provider 高频 delta → 断言下发次数 ≈ 每 300ms 一次）。
- **验证**：打包 Electron 实机流式体感对照（开/关 flag，长回复打字感不消失）。
- **残余**：300ms 首字延迟（对比 60ms 现状；可接受，flag 可关）；真实 provider delta 粒度差异逐 provider 验证（mock 先行）。

---

### 模块 10：~~交互式用户输入面板~~（移除）

**裁决**（审查 #1）：协议无 user-input 事件（`grep` 零命中）。**本期不做**。登记 roadmap 残余：需先协议层新增 `user-input.requested` 事件形态 + provider 映射（独立项），落地后再启用本模块规格（原型 + 面板设计保留在本文件供届时参考）。

---

### 模块 11：选择文本引用工具栏 — P1

**新文件** `packages/app/src/components/assistant-selection-toolbar.tsx`（web-only）：

```typescript
export function useAssistantSelection(opts: {
  containerRef: RefObject<HTMLElement>;
  maxLength?: number; // 5000
}): { selectedText: string | null; rect: DOMRect | null };
// document.selectionchange → getSelection() anchorNode 属于容器 → 提取文本 + getRangeAt(0).getBoundingClientRect()
// 超长返回 null；jsdom 测试注入 fake selection
```

组件：portal 浮动按钮（复制/引用）；Escape/外部点击关闭；焦点不夺取（`preventDefault` on mousedown）
**接线**：`ComposerProps` 新 `onInsertText?: (text: string) => void`；`agent-panel.tsx` 接 `agentInputDraft.setText(prev => prev + "\n" + quoted)`；`message.tsx` `AssistantMessage` 容器挂 hook（`Platform.OS === "web"` 分支）；i18n `stream.citeSelection/copySelection`
**测试** `assistant-selection-toolbar.test.tsx` ≥10（注入 selection/长度门限/容器外不触发/关闭）
**验证**：web Playwright（双击选中 → 工具栏 → 引用 → 输入框出现文本）；打包 Electron 实机
**残余**：native 系统选择菜单（声明）；跨块选择引用原文本（不做富文本重排）

---

### 模块 12：审批操作面板 — P2

**原型**：`prototypes/pending-approval-panel.html` → 用户批准

**裁决**（审查 #10）：**T3-faithly 全移**——流内 permission 卡移除，banner 接管审批 UI。既有 `permission-response` 相关 e2e 单测同步迁移为该模块**强制门禁**（非可选）。

**新文件** `packages/app/src/composer/pending-approval-panel.tsx`

```typescript
export interface PendingApprovalView {
  id: string;
  kind: "command" | "file-read" | "file-change";
  title: string;
  detail: string;
  count: number; // "1/3"
}
```

组件：详情（应用/命令/文件，可滚动 code 块）+ 计数徽章 + 操作行：拒绝（destructive 色）/批准（主色）/本会话始终允许（危险 tooltip `permission.alwaysAllowWarning`）
**接线**：数据既有 `pendingPermissions`；响应复用 `permission-response.ts` 既有 respond 通道；`bannerSlot`（priority "approval"，最高）；**同模块内移除流内 permission 卡渲染** + 迁移其 e2e
**测试** `pending-approval-panel.test.tsx` ≥10（渲染/计数/操作回调/多审批切换）；迁移后的 permission e2e 全绿
**验证**：原型批准 → 打包 Electron 实机：mock 发 permission → 面板 → 批准 → 流继续；拒绝路径
**残余**：mcp-elicitation 类无事件形态（不做）

---

### 模块 13：浏览器面板调整大小 — P2

**新文件** `packages/app/src/utils/clamp-browser-pane-width.ts`：

```typescript
export const BROWSER_PANE_MIN_WIDTH = 360;
export function clampBrowserPaneWidth(width: number, viewportWidth: number): number;
// clamp(width, 360, Math.floor(viewportWidth * 0.7))
```

**接线**：`browser-pane.electron.tsx` `webviewWrap` 左缘 handle：复用 `explorer-sidebar.tsx:258` 模式（`Gesture.Pan()` + `useSharedValue` + `useAnimatedStyle`；web `cursor: col-resize`）；拖拽结束才写 `browserStore` 新字段 `paneWidth`（非每帧）；rAF 合并；命中 4px/视觉 1px hover 亮起；`role="separator"` aria
**测试** `clamp-browser-pane-width.test.ts` ≥6；拖拽实机验证
**验证**：打包 Electron：拖拽 → 宽度变化 → 重开恢复
**残余**：<720px 视口 min 360 挤压对话列（面板优先，已知行为）

---

### 模块 14：Mini Player — P1

**原型**：`prototypes/mini-player.html` → 用户批准

**架构裁决**（审查 #11）：不搬 T3 Surface Leasing。**移动 imperative `<webview>` 元素**（document.createElement 创建、非 React 管理）在两个 React 渲染 host div 间迁移——React 节点永不手动 reparent。同 browserId 同 partition → session 保持。

**新文件** `packages/app/src/components/browser-mini-player.tsx`：

```typescript
export function clampMiniPlayerPosition(
  pos: { x; y },
  container: { w; h },
  bottomInset: number,
): { x; y };
export function clampMiniPlayerSize(size: { w; h }, container: { w; h }): { w; h };
// 常量：EDGE_GAP=12, DEFAULT 320×200, MIN 240×150
```

组件：绝对定位卡片；指针事件拖拽/右下 resize；控制条 hover 显示（打开面板/关闭）；开启时 webview 元素 `miniHost.appendChild(webviewEl)`，关闭 `panelHost.appendChild(webviewEl)`；1 帧 mask 缓解迁移闪帧
**状态**：`browserStore` 新字段 `miniPlayer: { enabled: boolean; position: {x;y}; size: {w;h} } | null`（**会话内有效，不持久化**，对齐 T3）
**接线**：`workspace-screen.tsx` 面板与 Mini Player 同 browserId 互斥渲染；面板 chrome 行新增"弹出 Mini Player"按钮
**测试** `mini-player-layout.test.ts` ≥10（clamp/边界/bottomInset）；DOM 迁移实机验证
**验证**：原型批准 → 打包 Electron：弹出 → 拖拽/缩放 → 移回面板 → 关闭 → webview 状态保持（登录态/滚动位置）
**残余**：PiP 独立窗口不做；native/web 无 Mini Player（声明）

---

### 模块 15：静止布局（Resting Layout）— P2

**原型**：`prototypes/composer-resting-layout.html`（FLIP 过渡示意）→ 用户批准

**新目录** `packages/app/src/composer/resting/`：

- `use-composer-multiline.ts`：`ResizeObserver`+`MutationObserver` 测内容高 vs 行高（web；native 复用 height mirror 数据）→ `isMultiline: boolean | null`
- `use-composer-resting.ts`：`isResting = timelineHasContent && !isFocused && !isMultiline && !hasAttachments && !scrollCollapsed`；**M8 的 scrollCollapsed 并入此状态机**（M15 统一折叠维度，M8 注释指明）
- `resting-transition.web.ts`：FLIP（Web Animations API）测量源/目标几何 → 高度/位置/透明度动画，可中断重定向；`prefers-reduced-motion` 直接跳变；native 静态切换
- `resting-composer-controls-measurement.ts`：DOM 测量各控件自然宽度 + `scrollWidth` 恢复截断标签 → 溢出到紧凑菜单判定
- `compact-composer-controls-menu.tsx`：`…` 菜单收纳溢出控件
  **接线**：`agent-panel.tsx`/`workspace-tab.tsx` 两处 footer 宿主；依赖 M19 基元
  **测试**：`use-composer-multiline.test.ts`、`resting-composer-controls-measurement.test.ts`、`use-composer-resting.test.ts` ≥16 合计
  **验证**：原型批准 → 打包 Electron 实机（滚动有内容→失焦折叠→聚焦展开；动画 60fps 抽查；compact 视口不启用）
  **残余**：附件存在不折叠；compact 视口不启用；native 无动画

---

### 模块 16：浏览器 Chrome 增强 — P2

**修改** `browser-pane.electron.tsx`：

- 加载进度条：chromeRow 底部 2px，`isLoading` 时 `transform` 扫动动画（GPU 合成）
- favicon：新 `browser-favicon-icon.tsx`（faviconUrl → onError 回退 globe）；地址栏前置
- 新 `zoom-indicator.tsx`：缩放变化显示 "X%" 药丸，1.5s 淡出，**首帧抑制**（100% 不闪）；缩放 ± 按钮入 chromeRight；走 webview `getZoomLevel/setZoomLevel`（与窗口级 zoom 独立，注释说明）
- 新 `browser-more-menu.tsx`：三点菜单（重载/devtools/清除数据/缩放复位）；既有 devtools/元素选择器并入菜单，chromeRight 精简
  **测试** `zoom-indicator.test.tsx` ≥6（显示/超时/首帧抑制）
  **验证**：打包 Electron 实机（加载进度可见/缩放指示器/favicon 回退/清除数据生效）
  **残余**：元素选择器保留原行为不动

---

### 模块 17：流式高亮缓存策略 — P2

**实现时先核对**路径（`highlight-cache.ts` 位置——app utils 或 `@chisacode/highlight`），按实际位置改：

- 缓存键改 `{fnv1a32(content)}:{language}:{theme}`（新 `hashHighlightContent` 纯函数，含长度字段防碰撞）
- LRU 双上限驱逐：`MAX_ENTRIES=500` + `MAX_MEMORY_BYTES=50MB`（`estimateHighlightedSize` 估算）
- 流式 `cacheable:false` 不变（既有）；完成后写哈希键
  **测试** `highlight-cache.test.ts` 新增 ≥12（哈希键/双上限驱逐/流式不写/完成后命中/碰撞长度字段）
  **验证**：vitest + 打包 Electron 实机（长代码块流式→完成→重开会话缓存命中，DevTools 计时抽检）
  **残余**：跨主题/语言不命中（键含二者）

---

### 模块 19：工具栏控件基元 — P2

**新文件** `packages/app/src/composer/input/composer-control.tsx`：

```typescript
export function ComposerControl(props: { size: "sm" | "xs"; variant?: "ghost" | "default"; ... }): ReactElement
export function ComposerControlIcon(props: { icon: LucideIcon }): ReactElement
export function ComposerControlChevron(): ReactElement
export function ComposerControlSeparator(): ReactElement
export function ComposerSelectControl(props: {...}): ReactElement
```

**迁移**：`input.tsx` 工具栏按钮（附件/语音/发送）到新基元——**视觉等价迁移**，既有 fidelity 测试断言为门禁；分步 commit
**前置产出**：`resting-composer-controls-measurement.ts`（M15 依赖，本模块先落纯函数+单测）
**测试** `composer-control.test.tsx` ≥8
**验证**：打包 Electron 实机（工具栏视觉回归抽检：字体/间距/图标位）
**残余**：仅样式迁移不改行为

---

### 模块 20：提示暂存（Cmd+S）— P3

**新文件**：

- `packages/app/src/stores/prompt-stash-store.ts`（Zustand + AsyncStorage）

```typescript
export interface PromptStashEntry {
  id: string;
  text: string;
  imageThumbs: { uri: string }[];
  createdAt: number;
}
// 容量 50；写序：先落文本条目（持久化）→ 清输入 → 异步压缩图（≤64KB/张）追加——T3 同序防丢失
// 恢复：与现有条目 text 相同跳过；不恢复模型/提供者选择
```

- `composer-stash-menu.tsx`（~230 行）：列表（片段/时间/缩略）+ 键盘导航（↑↓ 循环/Enter 恢复/Escape/Cmd+Backspace 删除）+ 空态
- `composer-stash-badge.tsx`（~70 行）：计数徽章 + 保存脉冲（`pulseKey` 重挂载重放）
  **接线**：`input.tsx` Cmd+S（web）；native 长按暂存入口；`beforeVoiceContent` 加徽章
  **测试**：`prompt-stash-store.test.ts` ≥12（写序/去重/容量/恢复）、`composer-stash-menu.test.tsx` ≥10
  **验证**：打包 Electron 实机（输入+图 → Cmd+S → 清空 → 恢复 → 缩略完好）
  **残余**：恢复的图片为缩略引用，原附件已删则占位（不做重上传）

---

### 模块 21：textContent 计时器 — P3

**修改** `running-turn-footer.tsx` `RunningElapsed`（line 41）：web 改 `useRef<HTMLSpanElement>` + `setInterval(1000)` 直写 `textContent`（不 setState）；native 保留现有 state 路径（声明）；`tabular-nums` 保留
**删除** `message.tsx:526` `LiveElapsed`（100ms 死代码）——删除前 grep 引用确认
**测试** ≥4（jsdom 断言 DOM 文本更新/interval 清理）
**验证**：打包 Electron 实机（流式期间 React DevTools 提交计数不随秒增长）
**残余**：native 行为不变

---

### 模块 22：错误横幅 — P3

**新文件** `packages/app/src/composer/banner/` 下：

- `thread-error-banner.tsx`（~70 行）：`agentState.status === "error"` → error item；session dismiss 键 `agentId:errorMessage`（module Set，不同错误再现）
- `provider-status-banner.tsx`（~130 行）：`getProviderStatusMessage(providerState)` 纯函数——未认证/不可用/警告 → **中文可操作文案**（遵循既有反馈：never "不是你本地选错了模型"）；"打开提供者设置"操作
  **替换** `agent-panel.tsx` agent error 分支（M7 已建 stack，本模块把 error item 生产迁入）；history-sync 分支保留
  **测试**：`thread-error-banner.test.tsx` ≥6（dismiss 键语义）、`provider-status-banner.test.ts` ≥10（消息派生矩阵）
  **验证**：打包 Electron 实机（断网 provider → 横幅 → 关闭 → 同错不再现 → 异错误再现）
  **残余**：探测层沿用现状（风暴已治理），仅消费层变更

---

### 模块 23：计划卡片 — P3

**新文件** `packages/app/src/components/proposed-plan-card.tsx`（~260 行）：折叠态渐变淡出 + 展开；操作：复制（复用 `TurnCopyButton` 模式）/下载 .md（web Blob；native 无存盘通道则隐藏按钮）/保存到工作区（cwd 路径输入对话框，复用 workspace 附件写文件通道）；渲染复用 `MarkdownRenderer`
**数据源核对（实现时第一步）**：`generative_ui`/assistant fence 中是否存在计划标记——若无计划数据源，本模块交付卡片组件 + 接口，接线列残余
**测试** `proposed-plan-card.test.tsx` ≥10（折叠/操作回调）
**验证**：mock 产出计划 fence → 卡片 → 复制/下载
**残余**：数据源可能缺失（实现时裁决）；native 下载按钮隐藏

---

### 模块 24：技能内联芯片 — P3

**新文件** `packages/app/src/components/markdown/skill-inline-text.tsx`（~100 行）：

```typescript
export function findSkillTokens(text: string): { start: number; end: number; name: string }[]
// 正则 $name；排除 code_inline/fence/link 内
export function SkillInlineMarkdownChildren(props: {...}): ReactElement  // 递归节点处理
```

**接线**：`message.tsx` assistant rules 注入（web+native 同渲染，芯片纯 View/Text）
**测试** `skill-inline-text.test.ts` ≥10（提取/排除/递归）
**验证**：vitest + 打包 Electron 实机（mock 回复含 `$test-skill` → 芯片渲染）
**残余**：芯片不可点击（T3 同）；仅视觉

---

### 模块 25：复制按钮增强 — P3

**修改** `message.tsx` `TurnCopyButton`（line 985）：复制成功 → 图标 1.5s 变勾号 → 锚定 toast（按钮上方 8px 绝对定位）；失败 → error toast；超时恢复原图标。i18n `common.copied/copyFailed`
**测试** `turn-copy-button.test.tsx` ≥6
**验证**：打包 Electron 实机（复制→勾号→toast→恢复）
**残余**：native Clipboard API 同构，toast 锚定逻辑一致

---

### 模块 26：图片全屏预览对话框 — P3

**实现时决策**：比对既有 `AttachmentLightbox` 覆盖度——若已覆盖全屏/导航，本模块降级为**增量**（键盘 ←→/Escape/焦点恢复）；否则新 `expanded-image-dialog.tsx`（~210 行：portal 遮罩/图片+视频/键盘/焦点恢复记住 opener/错误态）
**接线**：`UserMessageImagePreviews` 点击打开
**测试** ≥10（导航/键盘/错误态）
**验证**：打包 Electron 实机（多图→全屏→键盘导航→Escape 焦点回位）
**残余**：与 Lightbox 关系实现时裁决并记录

---

### 模块 27：特性选择器（TraitsPicker）— P3

**新文件** `packages/app/src/composer/agent-controls/traits-picker.tsx`（~600 行分批）：

```typescript
export interface TraitOptionDescriptor {
  kind: "select" | "boolean";
  key: string;
  options?: { id; label }[];
  defaultId?: string;
}
export function buildTraitsTriggerDisplay(options: TraitOptionDescriptor[]): string;
// 提示注入检测：prompt 中 ultrathink 类关键字 → 对应项禁用 + "已在提示中指定"徽章
```

菜单：radio 组/开关 + "Default" 徽章
**与既有关系**：增量替换 `mode-control.tsx`/`feature-controls.tsx` 的 thinking/effort 部分；**冲突字段以 traits-picker 为准**并注释；若 UI 冲突过大则拆两期（先 pure 逻辑+单测，UI 接线次期，命名残余）
**测试** `traits-picker.test.ts` ≥14（display 派生/注入检测/描述符矩阵）
**验证**：打包 Electron 实机（改 thinking → 发送生效；提示注入 → 禁用）
**残余**：与 mode-control 并存期一致性以 fidelity 测试门禁

---

### 模块 28：will-change 动态管理 — P4

**新文件** `packages/app/src/hooks/use-visible-animation.ts`（~40 行）：IntersectionObserver + `document.visibilityState` + `prefers-reduced-motion` → CSS 变量 `--visible-animation-state: running|paused`、`--visible-animation-will-change: transform|auto`
**接线**：`RunningTurnFooter` spinner/shimmer + `tasks-badge` 动画消费变量（web）；native 无此机制（声明）；IO 不支持回退恒 running
**测试** ≥6（jsdom + IO mock：可见/隐藏/标签页/reduced-motion）
**验证**：打包 Electron 实机（DevTools 层数：动画离屏无 GPU 层）
**残余**：仅 web 变量机制

---

## 4. 模块顺序与依赖

```
M1 提示历史 ──┐ ✅ 2026-09-08
M2 稳定行 ────┼─ ✅ 2026-09-08
M5 崩溃恢复 ──┤ ✅ 2026-09-08
M3 端口扫描 ──┘ ✅ 2026-09-08
M4 变更树 ✅ 2026-09-08（依赖 M2 的比较器接入点）
M7 横幅系统 ✅ 2026-09-09（M12/M22 的宿主已就位：bannerSlot prop）
M8 滚动折叠 ✅ 2026-09-09（M15 会并走其状态机——合并指针注释缺失，见 §6）
M9 Delta 缓冲 ✅ 2026-09-18（已重定范围：扩展 coalescer，见模块 9 修订）
M6+18 任务徽章 ✅ 2026-09-09（依赖 M7 bannerSlot；提前于 M9 交付，依赖已满足）
M11 引用工具栏 ✅ 2026-09-18（ComposerInsertTextContext 代替 onInsertText prop，见 roadmap 条目）
M12 审批面板 ⬅ 下一个（依赖 M7；含流内卡移除+e2e 迁移——流内卡实证仍在 view.tsx:128）
M13 面板 resize ✅ 2026-09-18（DOM 事件+rAF 代替 Gesture.Pan，见 roadmap 条目）
M14 Mini Player
M19 控件基元（M15 前置）
M15 静止布局（依赖 M19 + M8 合并）
M16 Chrome 增强 ✅ 2026-09-18（打包门禁顺手修复 pnpm buffer@5.7.1 skipped 残余，见 roadmap 条目）
M17 高亮缓存
M20-M28 按序打磨
```

**进度快照（2026-09-18 复核）**：12/26 完成。P0 全清（M1–M5）；P1 完成 M6+18/M7/M8/M9/M11，剩 M14；P2 完成 M13/M16，剩 M12/M15/M17/M19；P3 未动（M20–M27）；P4 未动（M28）。M10 已按审查 #1 移除。

## 5. 跨模块门禁

- 每模块：roadmap 登记 → 实现 → 聚焦 vitest → typecheck → lint → **对抗审查** → roadmap 更新 → 下一模块
- 原型门禁模块：M4/M7/M12/M14/M15（先原型后实现）
- 核心回归：M2/M4/M7/M8/M12 触碰 agent-stream/composer 核心 → 全量跑既有相关测试
- 桌面验证：停运行中 app → `expo export` → desktop `tsc` → electron-builder → win-unpacked 实机
- 收尾：整体对抗审查 → roadmap 全量登记 → 命名残余汇总

## 6. 进度对抗审查与修订（2026-09-18）

对全部 8 个"已完成"声明做了符号级实证，对全部剩余模块做了前提复核。裁决如下：

| #   | 发现                                                                                            | 证据                                                                                                                                                                                                                                                                                                               | 裁决                                                                                                                                                    |
| --- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **M9 前提已过期** —— 计划开新缓冲层，但 `agent-stream-coalescer.ts` 已实现三 flush 路径中的两条 | `AGENT_STREAM_COALESCE_DEFAULT_WINDOW_MS=60`（可配置，agent-manager.ts:561）；非文本事件边界 flush 已在 pipeline-controller.ts:163（`flushFor`）                                                                                                                                                                   | **M9 重定范围**：扩展 coalescer（window 60→300 + `maxBufferedChars` 溢出 + flag 逃生门），不再新建 `AssistantTextBuffer`。改造量 ~40 行 vs 双缓冲层并存 |
| 2   | **流程违规：M6+18 与 M8 无 roadmap 完成登记**                                                   | roadmap 仅有 M1–M5/M7 条目；§2 铁律"每模块登记"                                                                                                                                                                                                                                                                    | 已补登（roadmap 2026-09-18 条目）。后续模块不得以"已提交"代替登记                                                                                       |
| 3   | **M8 缺 M15 合并指针注释**                                                                      | `use-composer-scroll-collapse.ts` 无任何 M15/resting 字样；M15 规格要求"M8 注释指明"                                                                                                                                                                                                                               | 登记残余；M15 落地时合并并补注释，不单独返工                                                                                                            |
| 4   | **行号引用漂移**（低风险）                                                                      | `running-turn-footer.tsx` 已移至 `agent-stream/`；`stream.ts` → `types/stream.ts`                                                                                                                                                                                                                                  | 计划内行号视为"符号锚点"，实现时以 grep 符号为准；已核对 TurnCopyButton(message.tsx:985)/LiveElapsed(:526)/view.tsx:128 权限卡仍命中                    |
| 5   | **已完成模块证据核验通过**                                                                      | M1 `use-composer-prompt-history.ts`；M2 `stable-layout.test.ts`+组缓存；M3 `use-discovered-servers.ts`+COMPAT v1.0.4 门禁；M4 `build-turn-diff-tree.ts`+TurnChanges；M5 `webview-crash-recovery.ts`；M6+18 `tasks-badge-view.tsx`；M7 `composer-banner-stack.tsx`+bannerSlot；M8 `use-composer-scroll-collapse.ts` | 无注水，全部真实落地                                                                                                                                    |
| 6   | **排序偏差无害** —— M6+18 提前于 M9 交付                                                        | 其唯一依赖 M7 bannerSlot 已满足                                                                                                                                                                                                                                                                                    | 追认；修订后顺序以 §4 快照为准                                                                                                                          |
| 7   | **T3 分支自身新增测试债**                                                                       | `composer-scroll-collapse.spec.ts:60,87` 两处 `waitForTimeout(120)` 已入 test-audit 新基线                                                                                                                                                                                                                         | 登记残余：下一个触碰该 spec 的模块负责改为 `waitForFunction`（断言折叠态 style），不顺延                                                                |
| 8   | **M21 前提复核**                                                                                | `LiveElapsed`（100ms setInterval+setState）全仓零使用，确为死代码                                                                                                                                                                                                                                                  | 计划维持（删除前再 grep 一次）                                                                                                                          |
| 9   | **外部环境已变（利好）**                                                                        | pnpm 迁移收尾完成（CI/lockfile/补丁链全通），M7 期间暴露的 worklets/补丁缺陷已修                                                                                                                                                                                                                                   | "打包 Electron 实机"验证路径恢复可靠——M12/M14/M15 原型+实机门禁按原计划执行，无需降级                                                                   |

**修订后执行序**（更新 §4）：

```
M9（已重定范围：扩展 coalescer ~40 行，先做，P1 性能收益性价比最高）
→ M11 引用工具栏（P1，纯 app 层，无依赖）
→ M12 审批面板（P2，最大 UX 变更：原型 → 流内卡移除 → e2e 迁移；依赖 M7 ✅）
→ M13 面板 resize → M14 Mini Player（原型门禁）→ M19 控件基元
→ M15 静止布局（合并 M8 scrollCollapsed + 补指针注释）
→ M16 Chrome 增强 → M17 高亮缓存 → M20–M28 按序
```

**命名残余汇总（随本期滚动更新）**：

- M10：需协议层 `user-input.requested` 事件（独立项）
- M4："打开 diff" 需 diff 内容 RPC（独立项）；点击走文件预览 tab
- M9 修订：300ms 首字延迟可接受；真实 provider delta 粒度逐 provider 验证
- M8→M15：scrollCollapsed 状态机合并 + 指针注释补登
- M6+18/M8：roadmap 登记已于 2026-09-18 补（见 comprehensive-improvement-roadmap）
- scroll-collapse spec fixedWait×2：下个触碰模块修掉
