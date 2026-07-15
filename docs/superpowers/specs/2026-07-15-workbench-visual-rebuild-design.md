# 工作台视觉重构设计

## 背景

上一轮只完成了主题目录、默认值、旧值迁移和颜色 token 收口，没有实现
`design/web3-themes-v2.html` 中的工作台结构。实际 Electron 仍然是宽侧栏、大面积新工作区空态和
大尺寸 Composer，因此用户看不到实质变化。

## 目标

- Electron 默认以 Blockchain Light 呈现紧凑三栏工作台。
- Android 使用同一套视觉 token，采用紧凑聊天、抽屉侧栏和移动设置页。
- 所有界面继续消费真实会话、Agent、workspace、Git、PR、Tasks、Subagents 和 Browser 数据。
- 保留现有导航、持久化、快捷键、拖拽、菜单、语音、附件和 Agent 控制行为。

## 桌面布局

桌面工作台采用连续平面，而不是多个悬浮大卡片：

1. 左侧会话栏默认宽度 `200px`，允许在 `200-320px` 内调整。顶部是“所有会话”、搜索和紧凑的
   “新对话”按钮；中部继续渲染真实分组会话；底部保留 Host 状态和入口按钮。
2. 中央顶部第一行高度 `42px`，显示当前标签标题和右侧工作台控制。
3. 第二行标签栏高度 `38px`，继续使用真实 workspace tab、关闭、创建、分屏和菜单行为。
4. 消息流占满顶部栏与 Composer 之间的空间。已有 Agent tab 直接显示真实聊天；新工作区页改为紧凑
   草稿态，不再使用居中的超大标题和大面积留白。
5. Composer 贴底，桌面输入面板改为紧凑双层结构：上层文本/附件，下层 Agent 控制、语音和发送。
6. 环境面板作为右侧固定列，宽度 `280px`，不再悬浮覆盖消息。顶部展示 Git、PR、Tasks、
   Subagents、Browser 标签；各标签读取现有 `dockState` 和真实聚合数据。

## Android 布局

1. 顶部保留菜单、分支、workspace 副标题和操作菜单，但压缩垂直高度。
2. MobileTabSwitcher 作为第二层紧凑标签，不把桌面环境面板硬塞到手机屏幕。
3. 消息流继续使用原生 inverted stream；仅调整外围间距和 Composer 密度。
4. 抽屉侧栏复用真实会话分组、provider 图标、状态点、当前聚焦快捷操作和 Host footer。
5. 设置页继续使用 compact list/detail 导航，但行高、标题和卡片间距跟随设计稿收紧。

## 组件边界

- `left-sidebar.tsx` 负责桌面/Android 侧栏外壳和尺寸。
- `sidebar-session-list.tsx` 负责会话行与分组密度。
- `workspace-center-column.tsx` 负责连续工作台框架和环境面板列布局。
- `workspace-header.tsx` 与既有 tab presentation 负责双层顶部栏。
- `workspace-environment-panel.tsx` 负责真实环境标签和各标签内容。
- `composer/index.tsx`、`composer/input/input.tsx` 负责贴底紧凑 Composer。
- `new-workspace-screen.tsx` 负责紧凑草稿态。
- `settings-screen.tsx` 负责桌面和 Android 设置密度。

## 验收

- 目标测试锁定侧栏默认/迁移尺寸、桌面环境面板标签模型和关键布局常量。
- 运行 App typecheck、目标 lint、目标格式化和相关 Vitest 文件。
- 使用真实 Electron 启动并保存截图，确认工作区不是旧的大空态布局。
- Android 只在真实设备或模拟器上声明通过；若本机无设备，明确记录未完成，Web 不替代。
- 完成后重建 `packages/desktop/release/win-unpacked/ChisaCode.exe`，刷新桌面与仓库内两个快捷方式，
  并运行 packaged smoke。
