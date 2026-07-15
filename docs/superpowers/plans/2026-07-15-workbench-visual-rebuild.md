# 工作台视觉重构实施计划

> **面向执行代理：** 使用 `superpowers:subagent-driven-development` 或
> `superpowers:executing-plans` 按任务执行，所有步骤使用复选框跟踪。

**目标：** 把 Electron 和 Android 的真实产品界面重构为
`design/web3-themes-v2.html` 展示的紧凑工作台，而不是只更换主题颜色。

**架构：** 在现有 LeftSidebar、WorkspaceHeader、SplitContainer、AgentPane、Composer 和
EnvironmentPanel 边界内调整布局与视图，不新建静态壳，不复制业务状态。桌面使用三栏连续布局，
Android 使用紧凑 header、抽屉和原生消息流。

**技术栈：** TypeScript、React Native、Expo 57、Electron、react-native-unistyles、
Reanimated、Vitest、Maestro。

## 全局约束

- 仅支持 Electron 桌面端和 Android，不增加 iOS 工作。
- 默认主题保持 `light`（Blockchain Light）。
- 不使用 Web 预览冒充 Electron 或 Android 验收。
- 不引入静态示例数据；所有面板必须读取现有真实状态。
- 不运行完整测试套件，只运行改动相关 Vitest 文件。
- Reanimated 节点不得直接接收 Unistyles 动态样式。

---

### Task 1：建立紧凑布局常量与侧栏尺寸迁移

**文件：**

- 修改：`packages/app/src/constants/layout.ts`
- 修改：`packages/app/src/stores/panel-store/state.ts`
- 修改：`packages/app/src/stores/panel-store/state.test.ts`
- 修改：`packages/app/src/components/left-sidebar.tsx`
- 修改：`packages/app/src/components/sidebar-session-list.tsx`

- [ ] 新增桌面 header `42px`、tab row `38px`、环境面板 `280px` 等共享常量。
- [ ] 把默认侧栏宽度改为 `200px`，最大宽度改为 `320px`，迁移旧默认 `320px` 到新默认。
- [ ] 先写 panel store 迁移失败测试，再实现迁移。
- [ ] 收紧桌面侧栏顶部、会话行、分组和 footer；Android 抽屉同步收紧但保留触控面积。
- [ ] 运行 `npx vitest run packages/app/src/stores/panel-store/state.test.ts --bail=1`。

### Task 2：重排桌面工作台与双层顶部栏

**文件：**

- 修改：`packages/app/src/screens/workspace/workspace-center-column.tsx`
- 修改：`packages/app/src/screens/workspace/workspace-header.tsx`
- 修改：`packages/app/src/components/headers/screen-header.tsx`
- 检查：`packages/app/src/screens/workspace/workspace-tab-presentation.tsx`

- [ ] 桌面 center column 去掉大圆角悬浮卡片、外部 gap 和 shadow，改为连续平面。
- [ ] 第一层标题栏固定为 `42px`，第二层真实 tab row 固定为 `38px`。
- [ ] 环境面板从绝对定位 rail 改为右侧固定列，不遮挡消息。
- [ ] Android header 使用独立紧凑高度，不改变桌面窗口控制安全区。

### Task 3：实现真实环境面板标签

**文件：**

- 修改：`packages/app/src/screens/workspace/workspace-environment-panel.tsx`
- 修改：`packages/app/src/screens/workspace/workspace-environment-dock-model.ts`
- 修改：`packages/app/src/screens/workspace/workspace-environment-panel-model.test.ts`

- [ ] 使用现有 `dockState.activeTab` 渲染 Git、PR、Tasks、Subagents、Browser 标签。
- [ ] Git 标签展示真实分支、diff stat、查看变更和 commit/push 入口。
- [ ] PR、Tasks、Subagents、Browser 分别消费现有 `githubRuntime`、todo、subagents、browserContext。
- [ ] 保留 branch switch、open changes、open subagent 和 resume command 行为。

### Task 4：收紧 Composer 与新工作区草稿态

**文件：**

- 修改：`packages/app/src/composer/index.tsx`
- 修改：`packages/app/src/composer/input/input.tsx`
- 修改：`packages/app/src/screens/new-workspace-screen.tsx`

- [ ] 桌面 Composer 贴底并降低 padding、圆角和最小高度；Android 保持可触控尺寸。
- [ ] 保留附件、Agent controls、voice、send、queue 和快捷键行为。
- [ ] 新工作区移除超大居中标题，改为工作台内的紧凑草稿提示与 Composer。
- [ ] 导入会话入口改为低权重紧凑动作，不再占据大卡片区域。

### Task 5：同步 Android 设置密度

**文件：**

- 修改：`packages/app/src/screens/settings-screen.tsx`
- 修改：`packages/app/src/styles/settings.ts`

- [ ] Android root/detail header、列表项和卡片间距按设计稿收紧。
- [ ] 桌面设置侧栏改为 `240px` 左右，并保持现有 list/detail 导航。
- [ ] 不改变设置数据、主题目录或平台可见性规则。

### Task 6：验证、真实端验收和快捷方式

- [ ] 对改动文件运行 `npm run format:files -- <paths>`。
- [ ] 对改动文件运行 `npm run lint -- <paths>`。
- [ ] 运行 `npm run typecheck --workspace=@chisacode/app`。
- [ ] 运行所有改动相关 Vitest 文件。
- [ ] 启动真实 Electron，截图对照当前图与设计图并检查控制台错误。
- [ ] 检查 Android 设备/模拟器；可用则运行目标 Maestro/截图，不可用则记录阻塞。
- [ ] 重建 `packages/desktop/release/win-unpacked`，运行 packaged smoke。
- [ ] 刷新 `C:\Users\48818\Desktop\ChisaCode.lnk` 和 `C:\Ai\ChisaCode\ChisaCode.lnk`。
