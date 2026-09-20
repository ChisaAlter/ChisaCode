# T3 Code 全面审计与迁移规划

> 审计日期：2026-09-07
> 对照源：T3 Code Alpha（commit `4e969f373`），ChisaCode `cn-main`
> 审计范围：输入框、悬浮预览窗口、性能优化、操作/编排

---

## 0. 执行摘要

T3 Code 在四个维度上大幅领先 ChisaCode：

| 维度          | 差距等级 | 核心差距                                                                 |
| ------------- | -------- | ------------------------------------------------------------------------ |
| **输入框**    | 🔴 高    | Lexical 富文本 + 双光标模型 + 触发式命令菜单 + 提示历史 + 暂存系统       |
| **预览窗口**  | 🔴 高    | Surface leasing 模式 + Mini Player + 端口扫描 + 自动化宿主               |
| **性能优化**  | 🟡 中    | 稳定行派生 + 服务端 delta 缓冲 + will-change 动态管理 + textContent 直写 |
| **操作/编排** | 🟢 低    | 事件溯源架构（ChisaCode 已有 agent_stream 替代方案）                     |

**已完成的 T3 移植**（先前工作，不在本次范围）：

- 新回合锚定滚动（turn-anchor-controller）
- 投影 ack busy 状态机（use-composer-send-projection-ack）
- 回合折叠 + work-log 折叠
- Sidebar V2 全量移植
- 首次发送启动优化

---

## 1. 输入框（Composer）—— 差距分析与迁移方案

### 1.1 ChisaCode 现状

| 能力              | 状态                                                        | 位置                                         |
| ----------------- | ----------------------------------------------------------- | -------------------------------------------- |
| 文本输入          | ✅ textarea（RN TextInput multiline）                       | `composer/input/input.tsx`                   |
| 高度镜像          | ✅ web: hidden textarea mirror; native: onContentSizeChange | `composer/input/height-mirror.web.ts`        |
| 富文本编辑        | ❌ 无                                                       | —                                            |
| 斜杠命令          | ⚠️ 仅 2 个客户端命令（/exit, /clear）                       | `client-slash-commands/index.ts`             |
| @ 提及            | ⚠️ 仅文件路径提及                                           | `utils/file-mention-autocomplete.ts`         |
| 模型选择器        | ✅ CombinedModelSelector（provider→model→thinking）         | `components/combined-model-selector.tsx`     |
| 附件              | ✅ 图片/工作区/PR/Issue                                     | `composer/attachments/`                      |
| 提交/队列         | ✅ 乐观消息 + 排队 + 投影 ack                               | `composer/submit.ts` + `queue-controller.ts` |
| 草稿持久化        | ✅ Zustand + AsyncStorage                                   | `stores/draft-store/`                        |
| 上下文窗计量器    | ✅ SVG 环形计量器                                           | `components/context-window-meter.tsx`        |
| 提示历史（↑↓）    | ❌ 无                                                       | —                                            |
| 提示暂存（Cmd+S） | ❌ 无                                                       | —                                            |
| 滚动折叠          | ❌ 无                                                       | —                                            |
| 静止布局          | ❌ 无                                                       | —                                            |
| 横幅通知系统      | ❌ 无                                                       | —                                            |
| 任务进度徽章      | ❌ 无                                                       | —                                            |
| 审批操作面板      | ❌ 无                                                       | —                                            |
| 用户输入交互面板  | ❌ 无                                                       | —                                            |
| 待处理上下文条    | ❌ 无                                                       | —                                            |
| 多行检测          | ❌ 无                                                       | —                                            |
| 工具栏控件基元    | ❌ 无                                                       | —                                            |
| 特性选择器        | ⚠️ 有 thinking effort 选择                                  | `agent-controls/mode-control.tsx`            |

### 1.2 T3 架构关键设计

T3 的输入框（`ChatComposer.tsx`，5594 行）围绕以下核心抽象构建：

1. **Lexical 富文本编辑器**（`ComposerPromptEditor.tsx`，2134 行）
   - 4 种自定义 DecoratorNode：文件提及、技能、引用、终端上下文
   - 每个 token chip 渲染为 `contentEditable={false}` 的 React 组件
   - 双光标模型：折叠光标（每 token 算 1 字符，用户交互用） vs 展开光标（完整文本，持久化/触发检测用）
   - 受控编辑器模式：通过 `value` + `cursor` props 驱动，`useLayoutEffect` 同步，`isApplyingControlledUpdateRef` 防反馈环

2. **触发式命令菜单**（`ComposerCommandMenu.tsx`）
   - `detectComposerTrigger()` 每次光标变化时运行
   - 检测 `/`（斜杠命令）、`$`（技能）、`@`（路径）
   - 在 token 旁时抑制触发
   - 键盘导航：↑↓ 循环，Enter/Tab 选择

3. **静止布局 + FLIP 动画**（`ChatComposer` 内）
   - 桌面端：时间线有内容且输入框未聚焦时，压缩为单行
   - 模型选择器 + 模式控件 portal 到父级静止控件宿主
   - 使用 Web Animations API 做 FLIP 过渡（测量源/目标几何 → 动画高度/位置/透明度）
   - 中断安全（飞行动画中可重定向）

4. **滚动折叠**（`composerScrollGesture.ts`）
   - 全局 `wheel` 监听器累积 delta 像素
   - 超过 24px 阈值 + 输入框可折叠 → 折叠
   - 向逻辑末端滚动时抑制
   - 120ms 重置窗口内输入文本时抑制

5. **提示历史**（`composerPromptHistory.ts`）
   - ↑↓ 键调用，模仿 shell 历史
   - 从线程消息构建历史条目
   - 剥离发送时附加的上下文
   - 连续重复合并为最新条目
   - 编辑即退出浏览

6. **提示暂存 Cmd+S**（`ChatComposer` 内）
   - 剥离终端上下文占位符
   - 先写纯文本到暂存存储（持久化）
   - 清空输入框
   - 异步压缩图片（比原件小，适配 localStorage 限制）
   - 恢复时处理去重/容量/过期上传/重附标记

7. **模型选择器**（`ModelPickerContent.tsx`，957 行）
   - 双面板布局：左侧实例图标 + 右侧虚拟化列表
   - `@legendapp/list` 虚拟化（`estimatedItemSize={52}`，`drawDistance={480}`）
   - 搜索时显示所有实例的匹配模型（忽略侧栏过滤）
   - Cmd+1..9 快捷键直接选择
   - 收藏夹虚拟实例分组

### 1.3 迁移优先级

#### P0 — 提示历史（↑↓ 键）

**体感收益**：高。发送失败后无法恢复已输入文本是用户高频痛点。
**ChisaCode 适配**：纯函数 + hook，不依赖 Lexical。从 `session-stream-reducers` 的 canonical 消息构建历史，剥离发送时上下文。
**风险**：低。纯 UI 层改动，不涉及协议。

**建议切片**：

- A：`buildComposerPromptHistory` 纯函数 + 单测（从 `StreamRenderModel` 提取用户消息）
- B：`useComposerPromptHistory` hook（↑↓ 键处理、位置跟踪、文本匹配）
- C：`MessageInput` 接入（新增 `onPromptHistoryStep` 回调）

#### P1 — 滚动折叠

**体感收益**：中。桌面端阅读长回复时输入框占据空间。
**ChisaCode 适配**：`MessageInput` 已有 `collapsed` 概念（mobile collapsed），扩展为 scroll-based。全局 wheel 监听器在 `agent-panel` 层接入。
**风险**：中。需与 `bottom-anchor-controller` 的脱离检测协调。

**建议切片**：

- A：`composerScrollGesture` 纯函数移植（累积 delta、阈值、抑制逻辑）
- B：`useComposerScrollCollapse` hook + `MessageInput` 接入
- C：桌面端 web 验证（Playwright 定向 spec）

#### P2 — 静止布局

**体感收益**：中。桌面端输入框不聚焦时压缩为单行，腾出更多对话空间。
**ChisaCode 适配**：`ComposerSurface` 无现有对应物。需要新增 `ComposerRestingLayout` 组件 + FLIP 过渡。需与 `agent-panel` 的列布局协调。
**风险**：中高。涉及布局动画、portal 控件、与现有 `ConversationAspectColumn` 的兼容。

**建议切片**：

- A：`ComposerRestingLayout` 纯 CSS 原型（`prototypes/` 先落地）
- B：`useComposerRestingTransition` hook（FLIP via Web Animations API）
- C：控件 portal（`CombinedModelSelector` portal 到静止宿主）
- D：桌面端 web + Electron 验证

#### P3 — 提示暂存（Cmd+S）

**体感收益**：中。长提示可暂存，避免意外丢失。
**ChisaCode 适配**：新增 `promptStashStore`（Zustand + AsyncStorage），与现有 `draft-store` 平行。不恢复模型/提供者选择。
**风险**：低。独立存储，不涉及协议。

#### 不建议移植

- **Lexical 富文本编辑器**：迁移成本极高（~5000 行 Lexical 集成 + 4 种自定义节点），与 ChisaCode 移动端 textarea 体系冲突，编辑丝滑不是当前主差距
- **T3 的双面板模型选择器**：ChisaCode 已有 `CombinedModelSelector`，功能相当
- **T3 的附件上传流程**：ChisaCode 已有图片压缩/粘贴/拖放

---

## 2. 预览窗口（Preview）—— 差距分析与迁移方案

### 2.1 ChisaCode 现状

| 能力                     | 状态                               | 位置                           |
| ------------------------ | ---------------------------------- | ------------------------------ |
| 浏览器预览面板           | ✅ Electron only（webview）        | `browser-pane.electron.tsx`    |
| 浏览器面板（web/native） | ⚠️ Fallback only                   | `browser-pane.tsx`（"仅桌面"） |
| 浏览器存储               | ✅ Zustand + AsyncStorage          | `stores/browser-store/`        |
| 端口扫描                 | ❌ 无                              | —                              |
| Mini Player              | ❌ 无                              | —                              |
| 浏览器 Chrome 行         | ⚠️ 基本（地址栏 + 后退/前进/刷新） | `browser-pane.electron.tsx`    |
| 自动化宿主               | ❌ 无                              | —                              |
| 悬浮预览卡片             | ❌ 无                              | —                              |

### 2.2 T3 架构关键设计

T3 的预览系统（`apps/web/src/components/preview/` + `browser/`）围绕以下核心抽象构建：

1. **Surface Leasing 模式**（`BrowserSurfaceSlot` + `browserSurfaceStore`）
   - DOM 槽声明 webview 位置 → 槽写入 rect/visibility 到 store → webview 宿主跟随 store
   - 多个槽可竞争同一 webview（面板 vs Mini Player vs PiP）
   - 通过 `symbol` 跟踪所有权，防止跨表面干扰
   - 这是 T3 预览系统最核心的架构决策——允许同一个 webview 在多个表面上无缝移动

2. **Mini Player**（`ThreadPreviewMiniPlayer.tsx`）
   - 浮动、可拖拽、可调整大小的覆盖层
   - 默认位置：右上角（`right: 12px, top: 12px`）
   - 默认大小：320×200，最小 240×150
   - 指针事件拖拽（非 drag-and-drop API）
   - 悬停显示控制栏（打开面板/PiP/关闭）
   - 与面板互斥（同一标签页不同时显示）

3. **端口扫描**（`PortScanner.ts`）
   - macOS/Linux：`lsof -iTCP -sTCP:LISTEN`
   - Windows：`Get-NetTCPConnection -State Listen`
   - 回退到探测常用开发端口列表（3000, 5173 等）
   - 仅报告返回 HTML 的端口
   - 引用计数：无客户端订阅时轮询暂停

4. **自动化宿主**（`PreviewAutomationHosts.tsx`）
   - 每个连接的环境一个宿主
   - 处理操作：open, navigate, resize, click, type, press, scroll, evaluate, waitFor
   - 会话同步、标签页创建/复用、视口应用、Mini Player 自动显示
   - 就绪等待：overlay、导航、视口——各自有超时和回退策略

5. **浏览器 Chrome**（`PreviewChromeRow.tsx`）
   - 完整地址栏 + 后退/前进/刷新/更多菜单
   - 加载进度条动画
   - favicon 获取 + 回退链（favicon → BrowserMockup）
   - 缩放指示器（缩放变化时显示 "X%" 药丸，1500ms 后淡出）

6. **空状态/不可达状态**（`PreviewEmptyState.tsx` + `PreviewUnreachable.tsx`）
   - 空状态：最近使用的 URL + 发现的本地服务器
   - 不可达：Chromium 风格错误页（主机名、错误描述、故障排除提示、错误代码）

### 2.3 迁移优先级

#### P0 — 端口扫描 + 本地服务器发现

**体感收益**：高。Agent 启动 dev server 后用户需手动复制 URL 到浏览器面板。
**ChisaCode 适配**：服务端新增 `PortScanner` 服务（Windows：PowerShell `Get-NetTCPConnection`；macOS/Linux：`lsof`），协议新增 `discovered_ports` 通知。客户端 `BrowserPane` 空状态展示发现的服务器。
**风险**：低。纯服务端新增，客户端被动接收。

**建议切片**：

- A：服务端 `PortScanner`（`packages/server/src/server/preview/port-scanner.ts`）
- B：协议 `server.discovered_ports` 通知类型
- C：`BrowserPane` 空状态 + `useDiscoveredLocalServers` hook
- D：桌面端验证（启动 dev server → 自动出现在浏览器面板）

#### P1 — Mini Player（浮动预览）

**体感收益**：高。Agent 操作浏览器时，用户可同时查看对话和预览。
**ChisaCode 适配**：需要 Surface Leasing 模式或简化版。ChisaCode 的 `BrowserPane` 使用固定 `<webview>` 标签，需重构为可移动的 webview。简化方案：初期用 iframe 近似（仅 web），桌面端再升级为真正的 webview 移动。
**风险**：中高。涉及 webview 生命周期管理、多表面协调。

**建议切片**：

- A：`PreviewMiniPlayer` 纯 CSS 原型（`prototypes/`）
- B：`browserSurfaceStore`（Zustand store：rect, visibility, owner）
- C：`BrowserSurfaceSlot` + `HostedBrowserWebview` 移植
- D：`ThreadPreviewMiniPlayer` 组件 + 拖拽/调整大小
- E：桌面端验证

#### P2 — 浏览器 Chrome 增强

**体感收益**：中。地址栏、加载进度、favicon、缩放指示器。
**ChisaCode 适配**：在现有 `browser-pane.electron.tsx` 基础上增强。大部分是 CSS 组件，不涉及架构变更。
**风险**：低。纯 UI 增强。

**建议切片**：

- A：`PreviewChromeRow` 移植（地址栏 + 导航按钮 + 加载条）
- B：`PreviewFaviconIcon` + `BrowserMockup` 移植
- C：`ZoomIndicator` + `PreviewMoreMenu` 移植
- D：`PreviewUnreachable` 错误页移植

#### 不建议移植

- **自动化宿主**：ChisaCode 的 agent 不直接控制浏览器（无 browser automation provider），宿主无对应后端
- **Surface Leasing 完整模式**：ChisaCode 的 webview 使用模式更简单（固定在一个面板内），完整 leasing 模式过度工程

---

## 3. 性能优化 —— 差距分析与迁移方案

### 3.1 ChisaCode 现状

| 能力                   | 状态                             | 位置                                   |
| ---------------------- | -------------------------------- | -------------------------------------- |
| 底部锚定状态机         | ✅ sticky-bottom + detached      | `bottom-anchor-controller.ts`          |
| 回合锚定控制器         | ✅ 已从 T3 移植                  | `turn-anchor-controller.ts`            |
| Web 虚拟化             | ✅ tanstack virtual + 部分虚拟化 | `strategy-web.tsx`                     |
| Native 虚拟化          | ✅ FlatList inverted             | `strategy-native.tsx`                  |
| 高度估计缓存           | ✅ LRU 缓存                      | `assistant-message-height-estimate.ts` |
| 流事件批处理           | ✅ 48ms 批处理队列               | `session-stream-reducers.ts`           |
| 服务端流合并           | ✅ 60ms 合并窗口                 | `agent-stream-coalescer.ts`            |
| 稳定行派生             | ❌ 无                            | —                                      |
| 服务端 delta 缓冲      | ❌ 无                            | —                                      |
| useDeferredValue       | ❌ 无                            | —                                      |
| will-change 动态管理   | ❌ 无                            | —                                      |
| textContent 直写       | ❌ 无                            | —                                      |
| 持久化防抖（滑动队列） | ❌ 无                            | —                                      |
| afterSequence 续传     | ❌ 无                            | —                                      |
| WebSocket 压缩         | ❌ 无                            | —                                      |

### 3.2 T3 架构关键设计

T3 的性能基础设施围绕以下核心抽象构建：

1. **稳定行派生**（`computeStableMessagesTimelineRows` + `useStableRows`）
   - 每帧重新派生行数组
   - `isRowUnchanged`：按行类型手写浅比较，检查引用相等
   - 未变行复用上一帧对象引用 → React memo 跳过整棵子树
   - 全部未变时返回上一帧状态对象本身
   - 流式文本快速路径：`replaceStreamingMessageRows` 仅替换变化的消息引用

2. **服务端 Delta 缓冲**（`ProviderRuntimeIngestion.ts`）
   - AI 文本增量在服务端聚合（24KB 上限）
   - 仅在以下情况刷新：非文本事件（工具调用）、turn 完成、缓冲区溢出（安全阀）
   - 默认 "buffered" 模式 vs 可选 "streaming" 模式
   - 减少 WebSocket 消息量：~100 token/s → 几次/秒

3. **流式 Markdown 成本控制**（`ChatMarkdown.tsx`）
   - Shiki 高亮 LRU 缓存（500 条 / 50MB），按内容哈希建键
   - 流式期间：读缓存但**不写**缓存（防止半截代码块污染缓存）
   - 流结束后：写入缓存
   - Suspense 边界：代码块加载高亮器时显示 fallback
   - 独立图片占位槽：16:9 占位，防止加载时布局偏移

4. **GPU/CSS 优化**（`visibleAnimation.ts`）
   - `will-change` 通过 CSS 自定义属性动态设置
   - IntersectionObserver：不可见时 `will-change: auto`（释放 GPU 内存）
   - `document.visibilityState`：标签页隐藏时暂停动画
   - `prefers-reduced-motion` 尊重
   - 仅 `transform` 动画（GPU 合成），不动画 `left`/`top`

5. **textContent 直写**（`WorkingTimer`）
   - 每秒更新的计时器直接改 `textContent`（不 setState）
   - 避免每秒触发 React 渲染提交

6. **客户端线程状态机**（`threads.ts`）
   - 滑动队列持久化：capacity 1，debounce 500ms
   - `shouldPersistThread`：仅在非 starting/running 时持久化
   - `afterSequence`：重连时发送最后已知序列号，服务端仅重放缺失事件
   - 快照分页：初始 10 个用户回合，按需加载更多

7. **WebSocket 数据减少**
   - `afterSequence` 续传（delta 而非完整快照）
   - 服务端文本缓冲（减少消息数）
   - permessage-deflate 压缩（Bun：dedicated compressor；Node：标准）
   - 快照分页（窗口化读取）

### 3.3 迁移优先级

#### P0 — 稳定行派生

**体感收益**：高。流式期间每帧重渲整表是最大性能瓶颈——稳定行派生让 React memo 真正生效。
**ChisaCode 适配**：在 `agent-stream/model.ts` 的 `BUILD_STREAM_RENDER_MODEL` 后新增 `computeStableStreamLayoutItems` 函数，在 `view.tsx` 的 `useMemo` 中接入。不依赖 LegendList，与现有 tanstack virtual 兼容。
**风险**：低。纯函数 + 单测，不改变渲染行为。

**建议切片**：

- A：`computeStableStreamLayoutItems` 纯函数 + 单测（按 StreamLayoutItem 类型手写 `isRowUnchanged`）
- B：`useStableStreamItems` hook（useRef + useMemo）
- C：`strategy-web.tsx` 接入（data 引用稳定后 tanstack virtual 自动跳过未变行）
- D：性能回归测试（行重渲计数断言）

#### P1 — 服务端 Delta 缓冲

**体感收益**：中。减少 WebSocket 消息量和客户端 reducer 压力。
**ChisaCode 适配**：在 `agent-stream-coalescer.ts` 前新增缓冲层。流式文本 delta 追加到内存缓存，非文本事件（tool_call、turn_completed）时刷新。24KB 安全阀。
**风险**：中。涉及协议变更（新增 `assistant_text_buffered` 事件类型或修改现有 delta 语义）。需与 `useDeferredValue` 策略协调。

**建议切片**：

- A：服务端 `AssistantTextBuffer`（`packages/server/src/server/agent/assistant-text-buffer.ts`）
- B：`agent-stream-coalescer` 集成（缓冲 → 合并 → 下发）
- C：协议扩展（可选 `buffered_text` 字段标记）
- D：服务端单测 + 客户端集成测试

#### P2 — 流式高亮不写缓存 + 内容哈希键

**体感收益**：中。长代码块流式期间反复高亮浪费 CPU。
**ChisaCode 适配**：`highlight-cache.ts` 已支持 `cacheable: false`（上次 T3 移植），但键仍是完整内容。改为内容哈希（fnv1a32）键，允许完成块缓存命中。
**风险**：低。纯缓存策略变更，不改变渲染。

**建议切片**：

- A：`highlight-cache.ts` 键改为 `hash:language:theme`（fnv1a32）
- B：流式期间 `cacheable: false` 不变（已有），完成后 `cacheable: true` 写入哈希键
- C：缓存驱逐策略对齐 T3（500 条 / 50MB LRU，按估计内存大小驱逐）

#### P3 — textContent 直写计时器

**体感收益**：低。消除每秒一次的不必要渲染提交。
**ChisaCode 适配**：`LiveElapsed` 组件（`message.tsx` 内）改为 `useRef` + `setInterval` + `textContent` 直接写入。
**风险**：极低。单组件改动，不涉及架构。

#### P4 — will-change 动态管理

**体感收益**：低。减少 GPU 内存浪费，在大量动画时更明显。
**ChisaCode 适配**：新增 `useVisibleAnimation` hook（IntersectionObserver + visibilityState + prefers-reduced-motion）。在 `RunningTurnFooter` 的 shimmer 动画上接入。
**风险**：极低。渐进增强，不影响现有行为。

#### 不建议移植

- **LegendList 替换 tanstack virtual**：ChisaCode 已有 web/native 两套 strategy，切换成本高
- **React Compiler**：需 Babel 插件 + React 19，ChisaCode 用 Expo + RNW，编译器兼容性未知
- **View Transition API + flushSync**：ChisaCode 无移动端路由过渡需求
- **afterSequence 续传**：ChisaCode 的 tail/head 模型已有 cursor/epoch/seq 门控，等效于 T3 的事件流续传

---

## 4. 操作/编排（Operations）—— 差距分析

### 4.1 架构对比

| 维度       | T3                                                      | ChisaCode                                    |
| ---------- | ------------------------------------------------------- | -------------------------------------------- |
| 核心模式   | 事件溯源（ES）                                          | 事件流（agent_stream）                       |
| 命令处理   | Decider → Events → Projector → Read Model               | sendAgentMessage → agent_stream events       |
| 持久化     | SQLite projections（threads/messages/turns/activities） | 文件-backed state（JSON）                    |
| 消息原子性 | 单命令产出多事件（message-sent + turn-start-requested） | 单命令产出单事件流                           |
| 客户端状态 | makeEnvironmentThreadState（SubscriptionRef）           | session-context.tsx（React state + Zustand） |
| 多设备续传 | afterSequence + 事件流                                  | tail/head 分离 + epoch/seq 门控              |

### 4.2 结论

**不需要移植 T3 的 ES 架构**。ChisaCode 的 agent_stream 事件流模型已经提供了等效能力：

- T3 的 decider → projector → read model 链路 = ChisaCode 的 `sendAgentMessage` → agent_stream → `session-stream-reducers`
- T3 的 afterSequence 续传 = ChisaCode 的 tail/head + epoch/seq 门控
- T3 的 SQLite projections = ChisaCode 的文件-backed state（JSON）

**ChisaCode 的 tail/head 分离**对"历史与 live 同时显示"更灵活；**T3 的单事件流**对"多设备续传"更简单。两者各有千秋，不建议互相替换。

**一个值得借鉴的 T3 模式**：`thread.message-sent` 与 `thread.turn-start-requested` 作为同一命令的原子产出——消除"消息已发但 turn 未开始"的中间态。ChisaCode 目前通过 `hasQueuedTurnStart` 处理这个边界，可以借鉴原子性模式。

---

## 5. 横幅通知系统（Banner）—— 差距分析与迁移方案

### 5.1 ChisaCode 现状

ChisaCode 目前**没有统一的横幅通知系统**。错误/状态/警告信息散落在各处：composer 错误提示（`ComposerPromptLengthValidation`）、agent 面板内的错误展示、toast 通知等。没有统一的优先级排序、堆叠、附着式玻璃态表面。

### 5.2 T3 架构关键设计

T3 的横幅系统由以下组件构成：

1. **ComposerBanner（358 行）**—— 复合组件系统，18 个子组件
   - `Surface`：玻璃态背景（`backdrop-blur` + `backdrop-saturate`），通过 CSS 自定义属性控制
   - `Root`：5 种变体（default/error/info/success/warning），density/width 属性
   - `Row`：grid 布局行，响应式操作包装
   - `Attachment`：附着缝——横幅与输入框视觉融合（`clip-path: shape(...)` 实现连续玻璃表面）
   - `Dismiss`：关闭按钮，`Peek`：折叠预览标签
   - 这是整个通知系统的基础 UI 基元

2. **ComposerBannerStack（332 行）**—— 优先级多通知堆叠
   - 三个优先级层：`activity`（spinner，始终附着）> `urgent`/`error`/`warning` > `notice`
   - 最高优先级项附着显示；其余折叠在 peek 标签后
   - 悬停展开堆叠；Escape 折叠；开/关焦点管理
   - 动画关闭（220ms 过渡延迟）

3. **ComposerTasksBadge（231 行）**—— 任务进度显示
   - 彩色步骤段（完成=绿色，进行中=主色，待定=静音）
   - 计数徽章（"3/7 complete"）
   - 可展开任务列表，带状态图标和每步耗时
   - 内联和附着抽屉两种变体

4. **ComposerActivityStatus（24 行）**—— 操作阶段状态
   - 简单 spinner + 文本行
   - 读取 `ThreadSyncPhase` 枚举映射到人类可读标签

5. **ThreadErrorBanner（72 行）**—— 错误横幅
   - 会话级关闭跟踪：关闭按 `threadKey + 错误消息` 记住
   - 模块级 `Set` 实现会话范围持久化（ChatView 重挂载后仍保留）
   - 不同错误仍会显示

6. **ProviderStatusBanner（131 行）**—— 提供者状态横幅
   - `getProviderStatusMessage` 函数从提供者状态派生人类可读消息
   - 处理多种状态：未认证、不可用、警告、未安装

### 5.3 迁移优先级

#### P1 — ComposerBanner + ComposerBannerStack（基础 UI 基元）

**体感收益**：高。统一所有输入框通知（错误、警告、活动状态、提供者状态）。
**ChisaCode 适配**：移植 `ComposerBanner` 复合组件系统（18 个子组件），CSS 自定义属性驱动玻璃态。`ComposerBannerStack` 优先级堆叠逻辑。
**风险**：中高。358+332 行，涉及 CSS `clip-path: shape(...)` 浏览器兼容性（需回退方案）。

**建议切片**：

- A：`ComposerBanner` 纯 CSS 原型（`prototypes/`）
- B：`ComposerBanner` 复合组件移植（`Surface`/`Root`/`Row`/`Icon`/`Content`/`Actions`/`Dismiss`）
- C：`ComposerBannerStack` 移植（优先级排序/堆叠/动画）
- D：现有错误/状态迁移到新横幅系统

#### P2 — ComposerTasksBadge + ComposerActivityStatus

**体感收益**：中。Agent 多任务时显示进度。
**风险**：低。独立组件，无架构依赖。

#### P3 — ThreadErrorBanner + ProviderStatusBanner

**体感收益**：中。改进错误和提供者状态的 UX。
**风险**：低。主要是消息派生逻辑。

---

## 6. 审批与待处理上下文 —— 差距分析与迁移方案

### 6.1 ChisaCode 现状

ChisaCode 有权限请求系统（`permission-response.ts`），但审批 UI 嵌入在消息流中，**不在输入框区域**。没有统一的"待处理上下文条"（显示用户已附加到当前消息的终端上下文、元素上下文、审查评论等）。

### 6.2 T3 架构关键设计

1. **ComposerPendingUserInputPanel（295 行）**—— 交互式问答面板
   - 多选和单选问题类型
   - 单选自动前进（200ms 定时器）
   - 键盘快捷键（1-9 选择选项）
   - 可折叠问题，持久化折叠状态
   - 进度指示器（"1/3"）
   - 可关闭问题，乐观选择状态
   - **这是第二轮审计中最令人印象深刻的组件**

2. **ComposerPendingApprovalActions（76 行）**—— 审批操作按钮
   - 取消、拒绝、本会话始终允许、批准
   - 按操作类型的上下文样式（拒绝=红色，批准=前景色）
   - 风险选项的警告工具提示（如"始终允许"的提示注入警告）

3. **ComposerPendingApprovalPanel（60 行）**—— 审批详情
   - 应用名称、命令/文件详情（可滚动 `<code>` 块）
   - 待处理计数徽章（"1/3"）
   - 支持多种审批类型（mcp-elicitation、command、file-read、file-change）

4. **ComposerPendingElementContexts（96 行）**—— DOM 元素上下文
   - 内联芯片 + 关闭按钮
   - 工具提示含选择器、URL、HTML 预览（最多 600 字符）

5. **ComposerPendingReviewComments（61 行）**—— 代码审查评论
   - 内联芯片 + 文件路径和范围标签
   - 工具提示含完整评论文本

### 6.3 迁移优先级

#### P1 — ComposerPendingUserInputPanel

**体感收益**：高。Agent 提问时直接在输入框区域交互，无需滚动到消息流中。
**ChisaCode 适配**：独立组件，从 `agent_stream` 的 `user-input.requested` 事件驱动。需要会话级折叠状态持久化。
**风险**：中。295 行，需与现有 `permission-response` 系统协调。

**建议切片**：

- A：`ComposerPendingUserInputPanel` 纯 CSS 原型
- B：组件移植（单选/多选/键盘导航/进度/折叠）
- C：接入 `agent_stream` 的 `user-input.requested` 事件
- D：桌面端验证

#### P2 — ComposerPendingApprovalActions + Panel

**体感收益**：中。审批操作直接显示在输入框上方。
**风险**：低。主要是 UI 组件。

---

## 7. 消息内 UI 元素 —— 差距分析与迁移方案

### 7.1 ChisaCode 现状

ChisaCode 的消息渲染（`message.tsx`）聚焦于 markdown 文本和代码块。缺少以下 UI 增强：

| 能力                   | 状态                     |
| ---------------------- | ------------------------ |
| 差异统计（+X -Y）      | ❌ 无                    |
| 变更文件树             | ❌ 无                    |
| 选择文本引用到输入框   | ❌ 无                    |
| Agent 生成摘要         | ❌ 无                    |
| 计划卡片               | ❌ 无                    |
| 技能内联芯片           | ❌ 无                    |
| 图片/视频全屏预览      | ⚠️ 有 AttachmentLightbox |
| 复制按钮（锚定 toast） | ⚠️ 有基本复制            |

### 7.2 T3 架构关键设计

1. **DiffStatLabel（54 行）**—— 紧凑差异统计
   - `+additions -deletions`，紧凑数字格式化（"1.2k", "3.5m"）
   - 对齐和内联两种布局，可选括号
   - `hasNonZeroStat` 工具函数
   - **投入产出比最高的组件——54 行，零依赖，普适**

2. **ChangedFilesTree（251 行）**—— 变更文件树
   - 目录分组 + 展开/折叠全部
   - 每节点差异统计
   - 展开状态管理：全部展开 + 单独覆盖模式
   - "Open diff" 操作

3. **AssistantSelectionToolbar（155 行）**—— 选择文本引用工具栏
   - 在 assistant 消息中选择文本时出现浮动工具栏
   - "Cite" 按钮捕获选择并发送到输入框
   - portal 渲染 + `observeSelectionActions` 选择跟踪
   - 键盘导航（Tab 聚焦，Escape 关闭）
   - 选择过长时禁用
   - **第二轮审计中最令人兴奋的 UX 特性**

4. **agentSpawnSummary（65 行）**—— Agent 状态摘要
   - 纯函数：从 agent/subagent 状态派生人类可读摘要
   - 计数 working/failed/idle/stopped agents
   - 生成引导文本（"Kicked off 3 subagents"）和状态文本
   - 语调检测（working/failed/completed/inactive）

5. **ProposedPlanCard（257 行）**—— 计划卡片
   - 展开/折叠（折叠时渐变淡出）
   - 复制到剪贴板、下载为 markdown、保存到工作区
   - 使用 ChatMarkdown 渲染，省略号菜单

6. **SkillInlineText（97 行）**—— 技能内联芯片
   - 正则扫描文本，用彩色芯片替换 `$skillName` 标记
   - 递归 markdown 节点处理（跳过代码和链接节点）
   - 模式普适：可复用于任何内联引用

7. **ExpandedImageDialog（211 行）**—— 全屏图片/视频预览
   - 前/后导航 + 键盘支持（Escape/←/→）
   - 错误状态 + portal 渲染 + 关闭时焦点恢复
   - 焦点恢复模式：记住打开元素，卸载时重聚焦

8. **MessageCopyButton（55 行）**—— 增强复制按钮
   - 工具提示 + 复制确认勾号图标
   - 锚定 toast（出现在按钮附近，非屏幕边缘）

### 7.3 迁移优先级

#### P1 — DiffStatLabel + AssistantSelectionToolbar

**体感收益**：高。DiffStatLabel 投入极低（54 行），AssistantSelectionToolbar 是核心 UX 增强。
**ChisaCode 适配**：DiffStatLabel 零依赖移植。AssistantSelectionToolbar 需要 `observeSelectionActions` 移植 + 输入框 `insertTextAtEnd` 接口。
**风险**：低（DiffStatLabel）/ 中（SelectionToolbar）。

#### P2 — ChangedFilesTree + agentSpawnSummary

**体感收益**：中。Agent 修改文件时展示变更树，多 agent 时展示摘要。
**风险**：中（ChangedFilesTree 251 行）/ 低（agentSpawnSummary 65 行纯函数）。

#### P3 — ProposedPlanCard + SkillInlineText + ExpandedImageDialog + MessageCopyButton

**体感收益**：中低。打磨而非核心功能。
**风险**：低-中。

---

## 8. 输入框工具栏与控件 —— 差距分析与迁移方案

### 8.1 ChisaCode 现状

输入框工具栏（`MessageInput`）有基本控件（附件、语音、发送），但缺少统一的控件基元系统、响应式溢出测量、多行检测。

### 8.2 T3 架构关键设计

1. **ComposerControl（126 行）**—— 基础按钮组件
   - `sm`/`xs` 尺寸，`ghost` 变体
   - `ComposerControlIcon`（图标包装器）、`ComposerControlChevron`（下拉箭头）
   - `ComposerControlSeparator`（垂直分隔线）、`ComposerSelectControl`（选择触发器）
   - xs 尺寸使用 "resting" 样式（静音、紧凑），sm 为展开样式
   - **输入框工具栏的基础 UI 基元**

2. **restingComposerControlsMeasurement（82 行）**—— 静止控件宽度测量
   - 测量每个控件的自然宽度，确定哪些溢出到紧凑菜单
   - 使用 DOM 测量（`getBoundingClientRect`、`getComputedStyle`）
   - 处理隐藏块、弹性模型选择器（从截断标签恢复自然宽度）
   - 响应式输入框工具栏的核心逻辑

3. **useComposerMultilinePrompt（47 行）**—— 多行检测 hook
   - `ResizeObserver` + `MutationObserver` 测量内容高度 vs 行高
   - 驱动输入框布局决策（如将操作移到新行）

4. **CompactComposerControlsMenu（88 行）**—— 紧凑溢出菜单
   - 省略号图标，容纳放不下的控件
   - 菜单脱离流挂载，触发器隐藏时关闭

5. **TraitsPicker（667 行）**—— 特性选择器
   - 模型选项/特性（effort、thinking、fast mode、context window、agent 选择）
   - 描述符驱动的选项系统（支持 select 和 boolean 类型）
   - 提示注入值检测（如 prompt 中的 "ultrathink"）
   - "Default" 徽章，每选项描述，提示注入值活跃时禁用

### 8.3 迁移优先级

#### P2 — ComposerControl + restingComposerControlsMeasurement + useComposerMultilinePrompt

**体感收益**：中。为输入框工具栏提供统一基元，为静止布局做准备。
**ChisaCode 适配**：`ComposerControl` 替代现有工具栏按钮样式。`useComposerMultilinePrompt` 直接可用。
**风险**：低。纯 UI 组件。

#### P3 — TraitsPicker

**体感收益**：中。增强模型选项选择 UX。
**ChisaCode 适配**：ChisaCode 已有 `mode-control.tsx` 和 `CombinedModelSelector`。TraitsPicker 的描述符驱动模式可借鉴，但完整移植与现有控件重叠。
**风险**：中高。667 行，与现有控件可能冲突。

---

## 9. 面板布局与调整大小 —— 差距分析与迁移方案

### 9.1 ChisaCode 现状

浏览器面板（`browser-pane.electron.tsx`）固定宽度，无调整大小手柄。面板布局切换按钮分散在 `PanelLayoutControls` 等效位置。

### 9.2 T3 架构关键设计

1. **RightPanelResizeHandle（35 行）**—— 调整大小手柄
   - 4px 重叠命中目标（两侧），1px 视觉指示器
   - 悬停时亮起（border），活跃时（primary/60）
   - `role="separator"` + `aria-orientation="vertical"`
   - 命中目标与视觉指示器分离（宽抓取区域，窄视觉线）

2. **PanelLayoutControls（134 行）**—— 面板布局控件
   - 终端抽屉和右侧面板的切换按钮
   - 键盘快捷键标签
   - 实时 agent 计数徽章（绝对定位在切换按钮上）
   - 最大化/恢复控件

### 9.3 迁移优先级

#### P2 — RightPanelResizeHandle

**体感收益**：中。用户可调整浏览器面板宽度。
**ChisaCode 适配**：在 `browser-pane.electron.tsx` 左侧添加手柄。需要 `useResizableWidth` hook（ChisaCode 需新增）。
**风险**：低。35 行纯 UI 组件。

---

## 10. 预览/浏览器工具 —— 差距分析与迁移方案

### 10.1 ChisaCode 现状

浏览器面板（`browser-pane.electron.tsx`）功能基本：地址栏 + 后退/前进/刷新 + dev tools。

### 10.2 T3 架构关键设计

1. **webviewCrashRecovery（39 行）**—— Webview 崩溃恢复
   - 指数退避：250ms → 500ms → 1s
   - 每 30 秒窗口最多 3 次尝试
   - 窗口过期后尝试重置
   - 纯逻辑，零依赖

2. **ZoomIndicator（55 行）**—— 缩放指示器
   - 缩放变化时在右上角显示 "X%" 浮动药丸
   - 1.5s 后自动隐藏
   - 抑制首次渲染（100% 不在挂载时闪烁）
   - CSS 过渡 opacity 和 translate

3. **PreviewFaviconIcon（60 行）**—— Favicon 图标
   - 错误时回退链：试 favicon → 试下一个源 → 回退到 BrowserMockup
   - `FaviconImageAttempt` 按顺序尝试源

### 10.3 迁移优先级

#### P2 — webviewCrashRecovery

**体感收益**：中。Webview 崩溃时自动恢复，而非静默白屏。
**ChisaCode 适配**：在 `browser-pane.electron.tsx` 的 `render-process-gone` 事件中接入。
**风险**：极低。39 行纯逻辑。

#### P3 — ZoomIndicator + PreviewFaviconIcon

**体感收益**：低。打磨细节。
**风险**：极低。独立小组件。

---

## 11. 暂存系统（Stash）—— 差距分析与迁移方案

已在 1.3 节（P3 提示暂存）中涵盖。补充 T3 的 UI 组件：

1. **ComposerStashMenu（228 行）**—— 暂存菜单
   - 已保存提示列表：片段、时间戳、缩略图预览
   - 键盘导航（↑↓ 循环、Enter 恢复、Escape 关闭、Cmd+Backspace 删除）
   - 悬停高亮、滚动到视图、焦点管理
   - 显示待处理图片保存状态和丢弃图片计数

2. **ComposerStashBadge（67 行）**—— 暂存徽章
   - 书签徽章显示暂存计数
   - 保存时脉冲动画（计数升到完全不透明并 tick）
   - 使用 `pulseKey` 重挂载计数以重放过

**迁移优先级**：P3（见 1.3 节）。

---

## 12. 更新后的优先级迁移路线图

### 阶段一：快速可见收益（2-3 周）

| 优先级 | 项                                           | 切片    | 风险 |
| ------ | -------------------------------------------- | ------- | ---- |
| 🔴 P0  | 提示历史（↑↓ 键）                            | A/B/C   | 低   |
| 🔴 P0  | 稳定行派生                                   | A/B/C/D | 低   |
| 🔴 P0  | 端口扫描 + 本地服务器发现                    | A/B/C/D | 低   |
| 🔴 P0  | DiffStatLabel（+X -Y 差异统计）              | A       | 极低 |
| 🟡 P1  | 横幅基础系统（ComposerBanner + BannerStack） | A/B/C/D | 中高 |

### 阶段二：体感增强（3-4 周）

| 优先级 | 项                                              | 切片      | 风险 |
| ------ | ----------------------------------------------- | --------- | ---- |
| 🟡 P1  | 滚动折叠                                        | A/B/C     | 中   |
| 🟡 P1  | Mini Player（浮动预览）                         | A/B/C/D/E | 中高 |
| 🟡 P1  | 服务端 Delta 缓冲                               | A/B/C/D   | 中   |
| 🟡 P1  | 交互式用户输入面板（PendingUserInputPanel）     | A/B/C/D   | 中   |
| 🟡 P1  | 选择文本引用工具栏（AssistantSelectionToolbar） | A/B/C     | 中   |
| 🟡 P1  | 变更文件树（ChangedFilesTree）                  | A/B       | 中   |
| 🟡 P1  | Webview 崩溃恢复（webviewCrashRecovery）        | A         | 极低 |
| 🟢 P2  | 审批操作面板（PendingApprovalActions+Panel）    | A/B       | 低   |
| 🟢 P2  | Agent 状态摘要（agentSpawnSummary）             | A         | 极低 |
| 🟢 P2  | 右侧面板调整大小手柄                            | A         | 低   |

### 阶段三：打磨与完善（2-3 周）

| 优先级 | 项                                                     | 切片    | 风险 |
| ------ | ------------------------------------------------------ | ------- | ---- |
| 🟢 P2  | 静止布局                                               | A/B/C/D | 中高 |
| 🟢 P2  | 浏览器 Chrome 增强（地址栏/加载条/favicon）            | A/B/C/D | 低   |
| 🟢 P2  | 流式高亮缓存策略（哈希键 + LRU 驱逐）                  | A/B/C   | 低   |
| 🟢 P2  | 任务进度徽章（TasksBadge）+ 活动状态（ActivityStatus） | A/B     | 低   |
| 🟢 P2  | 工具栏控件基元（ComposerControl + 测量 + 多行检测）    | A/B/C   | 低   |
| 🟢 P3  | 提示暂存（Cmd+S）+ 暂存菜单 UI                         | A/B     | 低   |
| 🟢 P3  | textContent 计时器（不触发 React 渲染）                | A       | 极低 |
| 🟢 P3  | 横幅通知（ThreadErrorBanner + ProviderStatusBanner）   | A/B     | 低   |
| 🟢 P3  | 计划卡片（ProposedPlanCard）                           | A/B     | 中   |
| 🟢 P3  | 技能内联芯片（SkillInlineText）                        | A       | 低   |
| 🟢 P3  | 增强复制按钮（MessageCopyButton）                      | A       | 极低 |
| 🟢 P3  | 图片/视频全屏预览（ExpandedImageDialog）               | A/B     | 低   |
| 🟢 P3  | 特性选择器（TraitsPicker）                             | A/B     | 中高 |
| 🟢 P4  | will-change 动态管理（GPU 内存优化）                   | A       | 极低 |
| 🟢 P4  | 缩放指示器（ZoomIndicator）+ Favicon 回退              | A       | 极低 |

### 明确不移植（共 16 项）

| 项                                     | 原因                                     |
| -------------------------------------- | ---------------------------------------- |
| Lexical 富文本编辑器                   | 迁移成本极高，与移动端 textarea 体系冲突 |
| T3 双面板模型选择器                    | ChisaCode 已有 CombinedModelSelector     |
| LegendList 替换 tanstack virtual       | 已有 web/native 两套 strategy            |
| 自动化宿主（PreviewAutomationHosts）   | 无 browser automation provider           |
| Surface Leasing 完整模式               | ChisaCode webview 使用模式更简单         |
| 事件溯源架构重写                       | ChisaCode agent_stream 已等效            |
| React Compiler                         | Expo + RNW 兼容性未知                    |
| afterSequence 续传                     | tail/head + epoch/seq 已等效             |
| ComposerServerUpdateStatus             | T3 服务端更新生命周期，ChisaCode 无对应  |
| ComposerFeedback                       | Codex 反馈系统，T3 特定                  |
| ComposerUsageLimits                    | T3 用量限制 API，ChisaCode 无对应        |
| FileTagChip / PierreEntryIcon          | T3 Pierre 图标系统（50+ 品牌图标）       |
| DraftHeroHeadline                      | T3 项目系统，重度耦合                    |
| OpenInPicker / externalLinkContextMenu | T3 编辑器检测 + SSH 逻辑，部分 T3 特定   |
| ExpandedImagePreview                   | T3 asset URL 解析逻辑                    |

---

## 6. 源码摘录索引

### T3 关键文件

```
apps/web/src/
  components/chat/
    ChatComposer.tsx                    # 5594 行 — 输入框编排器
    ComposerSurface.tsx                 # 100 行 — 玻璃态外壳
    ComposerCommandMenu.tsx             # 225 行 — 命令菜单
    ComposerPrimaryActions.tsx          # 284 行 — 发送/停止按钮
    ModelPickerContent.tsx              # 957 行 — 模型选择器
    ModelPickerSidebar.tsx              # 239 行 — 模型选择器侧栏
    composerSubmission.ts               # 51 行 — 提交管线
    composerAttachmentFiles.ts          # 167 行 — 附件分类
    composerPromptHistory.ts            # 212 行 — 提示历史
    composerScrollGesture.ts            # 79 行 — 滚动折叠
    composerSlashCommandSearch.ts       # 114 行 — 斜杠命令搜索
    MessagesTimeline.logic.ts           # 稳定行派生 + 折叠
    MessagesTimeline.tsx                # LegendList 配置 + WorkingTimer
    ChatMarkdown.tsx                    # 流式 Markdown + 高亮缓存
    timelineScrollAnchoring.ts          # 三模式滚动锚定
  components/
    ComposerPromptEditor.tsx            # 2134 行 — Lexical 编辑器
  composer-logic.ts                     # 287 行 — 纯函数（光标/触发）
  previewStateStore.ts                  # 预览状态原子
  previewMiniPlayerStore.ts             # Mini Player 位置/大小
  components/preview/
    PreviewPanel.tsx                    # 顶部面板
    PreviewView.tsx                     # 标签页预览表面
    PreviewChromeRow.tsx                # 浏览器 Chrome
    PreviewEmptyState.tsx               # 空状态
    PreviewUnreachable.tsx              # 不可达错误页
    ThreadPreviewMiniPlayer.tsx         # 浮动 Mini Player
    PreviewAutomationHosts.tsx          # 自动化宿主
    previewMiniPlayerLayout.ts          # Mini Player 布局常量
    AgentBrowserCursor.tsx              # Agent 光标覆盖层
  browser/
    BrowserSurfaceSlot.tsx              # DOM 槽 leasing
    HostedBrowserWebview.tsx            # <webview> 标签 + 视口
    browserSurfaceStore.ts              # 浏览器表面商店
  lib/
    lruCache.ts                         # LRU 缓存实现
    visibleAnimation.ts                 # will-change 动态管理

apps/server/src/
  orchestration/Layers/
    ProviderRuntimeIngestion.ts         # 服务端 delta 缓冲
  preview/
    Manager.ts                          # 预览会话管理
    PortScanner.ts                      # 端口发现

packages/client-runtime/src/state/
  threads.ts                            # 线程状态机（持久化/续传/分页）
```

### ChisaCode 关键文件

```
packages/app/src/
  composer/
    index.tsx                           # 输入框组装
    input/input.tsx                     # MessageInput（textarea）
    input/height-mirror.web.ts          # 高度镜像
    submit.ts                           # 提交逻辑
    submission-controller.ts            # 提交控制器
    queue-controller.ts                 # 队列控制器
    use-composer-send-projection-ack.ts # 投影 ack
    draft/
      input-draft.ts                    # 草稿输入
    agent-controls/
      index.tsx                         # 模型选择器
  components/
    combined-model-selector.tsx         # 合并模型选择器
    browser-pane.electron.tsx           # 浏览器面板（Electron）
    context-window-meter.tsx            # 上下文窗计量器
  agent-stream/
    bottom-anchor-controller.ts         # 底部锚定状态机
    turn-anchor-controller.ts           # 回合锚定控制器
    strategy-web.tsx                    # Web 虚拟化策略
    strategy-native.tsx                 # Native 虚拟化策略
    model.ts                            # 流渲染模型
    view.tsx                            # 流视图
    layout.ts                           # 流布局
  timeline/
    session-stream-reducers.ts          # 流事件处理
  stores/
    draft-store/                        # 草稿商店
    browser-store/                      # 浏览器商店

packages/server/src/server/agent/
  agent-stream-coalescer.ts             # 服务端流合并器
  agent-manager.ts                      # Agent 管理器
```
