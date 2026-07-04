# 错误提示机制统一设计

> 状态：**草案**（2026-07-03 起草）。本批次未执行代码改动，仅设计文档。
>
> 背景：app 包存在五套错误展示机制并存无明确边界规则，是 P2 粗糙点。

## 现状

五套机制并存：

1. **Toast** —— `packages/app/src/contexts/toast-context.tsx` + `toast-host.tsx`
   - 统一 API：`ToastApi.show/.copied/.error`
   - 三种 variant：`default/success/error`
   - **单条不可堆叠**（`toast-host.tsx:52` 单 state）
2. **`Alert.alert`** —— 35 处分布在 14 个文件
   - 集中在 `settings/` 子目录：host-page(7)/skills-section(5)/mcp-servers-section(5)/custom-models(4)/synthetic-models(2)/providers(1)/usage-statistics(1)
   - 其他：pair-scan/add-host-modal/pair-link-modal/desktop-updates(3)/integrations(2)
3. **`console.error`/`console.warn`** —— 70+ 文件 80+ 处，仅本地 daemon.log 可见
4. **`<Alert>` 组件** —— inline 错误提示
5. **`confirmDialog`** —— 确认对话框

## 问题

- **无边界规则**：`Alert.alert` 与 `useToast` 并存，开发者不知道何时用哪个
- **Toast 不可堆叠**：快速连续操作只显示最后一条，与 Cursor/Cline 的多消息 snackbar 体验差距明显
- **`Alert.alert` 滥用**：35 处中多数是"操作成功/失败"提示，本应用 toast，但开发者随手用 `Alert.alert`
- **`console.error` 散落**：80+ 处生产路径错误仅写本地日志，用户无感知

## 设计：边界规则

### 决策矩阵

| 场景                                         | 机制                                | 理由                     |
| -------------------------------------------- | ----------------------------------- | ------------------------ |
| 非阻塞操作反馈（保存成功/失败、复制成功）    | **Toast**                           | 不打断用户，自动消失     |
| 需要用户确认的破坏性操作（删除、重置）       | **confirmDialog**                   | 需要明确 yes/no          |
| 需要用户知悉的阻塞错误（连接失败、配置冲突） | **`<Alert>` inline**                | 错误需可见但不需立即操作 |
| 需要用户立即操作的错误（重试、修正输入）     | **`Alert.alert` with buttons**      | 需要按钮选项             |
| 内部错误（不应发生的状态）                   | **`console.error` + ErrorBoundary** | 用户不需感知，开发者排查 |

### 改造清单

#### 1. Toast 队列化（高优）

`toast-host.tsx:52` 单 state 改为队列：

- 新增 `toast-queue.ts`，维护 `ToastItem[]` 队列
- 同时最多显示 3 条，超出排队
- 每条独立消失计时
- API 不变（`ToastApi.show/.copied/.error`），底层改队列

#### 2. `Alert.alert` 降级为 Toast（中优）

35 处 `Alert.alert` 按"是否需要用户操作"分类：

- **不需操作**（仅告知结果，~25 处）→ 改 `useToast().show(...)`
- **需要操作**（带 buttons，~10 处）→ 保留 `Alert.alert`

重点文件：

- `host-page.tsx` 7 处 → 大部分降级 toast
- `skills-section.tsx` 5 处 → 大部分降级 toast
- `mcp-servers-section.tsx` 5 处 → 大部分降级 toast

#### 3. `console.error` 分层（低优）

80+ 处 `console.error` 分两类：

- **用户可感知的错误**（操作失败、连接中断）→ 加 `useToast().error(...)` 同时保留 console
- **内部错误**（不应发生）→ 保留 `console.error`，靠 ErrorBoundary 兜底

不强行替换所有 `console.error`——本地 daemon.log 仍是开发者排查依据。

## 实施顺序

1. **Slice A：Toast 队列化** —— 改 `toast-host.tsx` + 新增 `toast-queue.ts`，不破坏现有 API
2. **Slice B：Alert.alert 降级** —— 按文件批量替换，每文件单独提���
3. **Slice C：console.error 分层** —— 仅在已加 ErrorBoundary 的区域补 toast

## 不做项

- 不删除 `Alert.alert` / `confirmDialog` / `<Alert>` / `console.error` 任一机制
- 不改 `toast-context.tsx` 公共 API（向后兼容）
- 不引入第三方 toast 库（rn 生态 toast 库维护差，自维护队列足够）

## 参考

- `packages/app/src/contexts/toast-context.tsx` —— 现有 Toast API
- `packages/app/src/components/toast-host.tsx:52` —— 单 state 限制点
- `docs/design.md` §10 —— empty state 规范（与错误提示相关）
