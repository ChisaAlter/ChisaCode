# ChisaCode 代理收束与版本管理增强计划

## 概述

将 ChisaCode 的代理支持收束为 5 个核心代理（Claude Code、Codex、OpenCode、Pi、KimiCode），移除其他代理支持；在设置页面的代理列表中直接展示版本信息并提供安装/更新操作。

## 当前状态分析

### 现有代理体系

- **5 个内置代理**（在 `AGENT_PROVIDER_DEFINITIONS` 中定义）：claude、codex、opencode、pi、kimi — 已是核心集合
- **2 个 ACP 特化实现**：`copilot-acp-agent.ts`、`cursor-acp-agent.ts` — 需删除
- **ACP 基础设施**：`acp-agent.ts`（基类）、`generic-acp-agent.ts`（通用 ACP 客户端，KimiCode 依赖它）— 保留
- **ACP 供应商目录**：`acp-provider-catalog.ts` 含 40 个第三方代理条目 — 需清空
- **AddProviderModal**：完整实现但未接入生产 UI — 需删除

### 现有版本管理

- **服务端**：`provider-tooling.ts` 已实现版本检测和安装更新，5 个核心代理均已支持
- **协议层**：`ProviderSnapshotEntry` 已含 `installedVersion`、`latestVersion`、`versionStatus`、`installAvailable`、`updateAvailable` 字段
- **客户端**：`ProviderDiagnosticSheet` 已有版本显示和安装/更新按钮，但需点击弹窗才能操作
- **设置页**：`ProviderRow` 显示版本标签，但操作按钮隐藏在诊断面板中

---

## 变更方案

### 第一部分：移除非核心代理（Server 端）

#### 1.1 删除 Copilot ACP 代理文件

**删除文件：**

- `packages/server/src/server/agent/providers/copilot-acp-agent.ts`

**修改文件：**

- `packages/server/src/server/agent/providers/acp-agent.test.ts` — 移除对 `copilot-acp-agent.js` 的 `vi.mock` 和 CopilotACPAgentClient 相关代码
- `packages/server/src/server/agent/provider-registry.test.ts` — 移除 CopilotACPAgentClient mock 及相关测试

#### 1.2 删除 Cursor ACP 代理文件

**删除文件：**

- `packages/server/src/server/agent/providers/cursor-acp-agent.ts`
- `packages/server/src/server/agent/providers/cursor-acp-agent.test.ts`
- `packages/server/src/server/agent/providers/cursor-acp-smoke.test.ts`

**修改文件：**

- `packages/server/src/server/agent/provider-registry.test.ts` — 移除 CursorACPAgentClient mock 及 "cursor provider extending acp" 测试用例

#### 1.3 清理 E2E 测试中的 Copilot 引用

**修改文件：**

- `packages/server/src/server/daemon-e2e/agent-configs.ts` — 移除 `copilot` 配置块、`case "copilot"` 可用性检查、从 `allProviders` 数组移除 `"copilot"`

#### 1.4 保留 ACP 基础设施

**保留文件：**

- `packages/server/src/server/agent/providers/acp-agent.ts`（ACP 基类）
- `packages/server/src/server/agent/providers/generic-acp-agent.ts`（KimiCode 依赖）
- `packages/server/src/server/agent/providers/generic-acp-agent.diagnostic.test.ts`
- `packages/server/src/server/agent/providers/kimi-code-agent.ts`（KimiCode 实现）

**原因：** KimiCode 通过 `GenericACPAgentClient` 实现，删除基类会破坏 KimiCode 功能。

---

### 第二部分：移除非核心代理（App 端）

#### 2.1 清空 ACP 供应商目录

**修改文件：**

- `packages/app/src/data/acp-provider-catalog.ts` — 将 `CATALOG_DATA` 清空为 `[] as const`，保留 `AcpProviderCatalogEntry` 接口和 `ACP_PROVIDER_CATALOG` 导出
- `packages/app/src/assets/acp-provider-icons.ts` — 清空 SVG 图标映射，保留类型定义

#### 2.2 删除 AddProviderModal 及相关文件

**删除文件：**

- `packages/app/src/components/add-provider-modal.tsx`
- `packages/app/e2e/acp-provider-catalog.spec.ts`

**修改文件：**

- `packages/app/src/hooks/use-acp-provider-catalog.ts` — 简化，catalog 为空但仍导出接口
- `packages/app/src/hooks/use-acp-provider-catalog.test.ts` — 简化测试
- `packages/app/src/screens/settings/providers-section.test.tsx` — 移除 `add-provider-modal` 相关 mock
- `packages/app/e2e/helpers/settings.ts` — 移除 AddProviderModal 相关 helper

#### 2.3 清理 App 端 provider 引用

**修改文件：**

- `packages/app/src/utils/provider-capability-hints.ts` — 移除 `cursor`、`goose`、`cline` 的 overrides 和 aliases（第 52-65 行 goose/cline/cursor 块），仅保留 claude、codex、opencode、pi、kimi
- `packages/app/src/screens/settings/custom-models.test.ts` — 移除 `copilot` 测试 fixture（第 37 行），替换为核心代理如 `kimi`
- `packages/app/src/utils/provider-capability-hints.test.ts` — 如有 copilot/cursor 相关测试则清理

---

### 第三部分：移除非核心代理（Website 端）

#### 3.1 删除非核心代理营销页面路由文件

**保留 5 个核心页面：** `claude-code.tsx`、`codex.tsx`、`opencode.tsx`、`pi.tsx`、`kimi.tsx`

**删除 33 个非核心路由文件：**

- `copilot.tsx`、`cursor.tsx`、`gemini.tsx`、`hermes.tsx`、`qwen-code.tsx`
- `amp.tsx`、`auggie.tsx`、`cline.tsx`、`codebuddy.tsx`、`cortex-code.tsx`
- `corust.tsx`、`crow.tsx`、`deepagents.tsx`、`deepseek-tui.tsx`、`dimcode.tsx`
- `dirac.tsx`、`factory-droid.tsx`、`fast-agent.tsx`、`glm.tsx`、`goose.tsx`
- `grok.tsx`、`junie.tsx`、`kilo.tsx`、`minion-code.tsx`、`mistral-vibe.tsx`
- `nova.tsx`、`poolside.tsx`、`qoder.tsx`、`sigit.tsx`、`stakpak.tsx`
- `vtcode.tsx`、`agoragentic.tsx`、`autohand.tsx`

#### 3.2 更新 agent-pages.ts

**修改文件：**

- `packages/website/src/data/agent-pages.ts` — 仅保留 5 个核心代理的 `AGENT_PAGES` 条目（claude-code、codex、opencode、pi、kimi）

#### 3.3 更新路由树

**修改文件：**

- `packages/website/src/routeTree.gen.ts` — 删除路由文件后会自动重新生成，或需手动清理引用

---

### 第四部分：设置页代理列表行内版本与安装/更新

#### 4.1 增强 ProviderRow 组件

**修改文件：** `packages/app/src/screens/settings/providers-section.tsx`

当前布局：

```
[ChevronRight] [Icon] [Label · ●Ready · 12 models · v1.2.3]   [Switch]
```

新布局：

```
[Icon] [Label]                                    [操作按钮] [Switch]
       [●Ready · 12 models · v1.2.3]
```

具体变更：

1. **移除 ChevronRight 图标**
2. **重构行布局**：左侧图标+文字列，右侧操作按钮+开关
3. **新增版本/操作区域**：
   - 未安装 → 显示 "未安装" + [安装] 按钮
   - 已安装可更新 → 显示 "v1.2.3 → v1.3.0" + [更新] 按钮
   - 已安装最新 → 显示 "v1.2.3 ✓"
   - 版本未知 → 显示 "版本未知"
4. **新增 `onInstall`/`onUpdate` 回调 props**
5. **操作状态**：安装/更新时按钮显示 loading

#### 4.2 新增 ProviderRow Props

```typescript
interface ProviderRowProps {
  def: ProviderDefinition;
  entry: ProviderEntry;
  enabled: boolean;
  isToggling: boolean;
  isFirst: boolean;
  onToggleEnabled: (providerId: string, enabled: boolean) => void;
  onInstall: (providerId: string) => void;
  onUpdate: (providerId: string) => void;
  installingProviderId: string | null;
  updatingProviderId: string | null;
}
```

#### 4.3 ProvidersSection 集成安装/更新逻辑

**修改文件：** `packages/app/src/screens/settings/providers-section.tsx`

在 `ProvidersSection` 中新增：

1. 使用 `useHostRuntimeClient(serverId)` 获取客户端实例
2. `handleInstall` 回调：调用 `client.runProviderToolingAction(providerId, "install")`，成功后 `refresh([providerId])`
3. `handleUpdate` 回调：调用 `client.runProviderToolingAction(providerId, "update")`，成功后 `refresh([providerId])`
4. 跟踪进行中的操作（`installingProviderId`、`updatingProviderId`）
5. 操作失败时显示 Alert

**客户端获取模式**（参考 `provider-diagnostic-sheet.tsx`）：

```typescript
import { useHostRuntimeClient } from "@/runtime/host-runtime";
const client = useHostRuntimeClient(serverId);
```

#### 4.4 保留 ProviderDiagnosticSheet 入口

点击行其他区域仍可打开诊断面板（查看详细版本、自定义模型、诊断信息）。

#### 4.5 i18n 新增翻译键

**修改文件：** `packages/app/src/i18n/index.ts`（唯一翻译文件，zh-CN 和 en 内联在同一文件）

新增键（zh-CN 和 en 各一份）：

- `providers.install` — "安装" / "Install"
- `providers.update` — "更新" / "Update"
- `providers.installing` — "安装中..." / "Installing..."
- `providers.updating` — "更新中..." / "Updating..."
- `providers.versionCurrent` — "最新" / "Up to date"
- `providers.versionOutdated` — "可更新" / "Update available"
- `providers.installFailed` — "安装失败" / "Install failed"
- `providers.updateFailed` — "更新失败" / "Update failed"

---

## 假设与决策

| 决策点                         | 选择                                | 原因                                |
| ------------------------------ | ----------------------------------- | ----------------------------------- |
| ACP 基类是否保留               | 是                                  | KimiCode 依赖 GenericACPAgentClient |
| GenericACPAgentClient 是否保留 | 是                                  | KimiCode 的直接父类                 |
| copilot/cursor 文件处理        | 删除                                | 不再支持，清理代码库                |
| ACP 目录处理                   | 清空数据但保留结构                  | 保留扩展能力，移除第三方代理入口    |
| AddProviderModal               | 删除                                | 无需添加第三方代理的 UI             |
| 版本/安装更新 UI 位置          | 行内直接显示                        | 用户要求在列表中直接操作            |
| 诊断面板是否保留               | 保留                                | 仍有详细查看和自定义模型的价值      |
| Mock provider 是否保留         | 保留                                | 开发/测试用途，不影响用户           |
| 安装/更新实现方式              | 复用现有 `runProviderToolingAction` | 服务端已完整实现                    |
| 网站营销页面                   | 删除非核心页面                      | 与产品定位保持一致                  |

## 验证步骤

1. **类型检查**：`npm run typecheck` 通过
2. **Lint**：`npm run lint` 通过
3. **单元测试**：受影响的测试文件单独运行通过
4. **手动验证**：
   - 设置页面显示 5 个代理，无 Copilot/Cursor
   - 每个代理行显示版本信息
   - 未安装的代理显示"安装"按钮
   - 可更新的代理显示"更新"按钮
   - 安装/更新操作正确触发并刷新状态
   - ACP 目录为空，无法添加第三方代理
   - 网站只显示 5 个核心代理页面
