# ChisaCode 优化计划

**状态**: pending approval  
**日期**: 2026-06-07  
**风险级别**: 中等 — 允许小调整，核心逻辑不变  
**执行方式**: 逐阶段串行，每阶段完成后验证再进入下一阶段

---

## 需求摘要

系统性优化 ChisaCode monorepo，覆盖依赖健康度、测试覆盖率、巨型文件拆分、代码质量与一致性四个方向。每个阶段产出可验证的结果，零回归风险。

---

## 阶段一：依赖与构建健康度

**目标**: 统一依赖版本、升级过时包、优化构建流程

### 1.1 统一 TypeScript 版本

**当前状态**: 6 种不同的 TypeScript 版本声明

- `^5.9.3` (root, website)
- `~5.9.2` (app)
- `5.9.3` (desktop, pinned)
- `^5.9.2` (highlight)
- `^5.2.2` (cli, client, protocol, relay, server) — 落后主版本 7 个 minor
- `^5.1.3` (expo-two-way-audio examples)

**行动**:

- 将所有包的 `typescript` devDependency 统一为 `^5.9.3`
- `desktop/package.json:38` 从 pinned `5.9.3` 改为 `^5.9.3`
- 示例项目同样更新

**文件**: 所有 `packages/*/package.json`, `package.json`

**验证**: `npm run typecheck` 全量通过；`npx tsc --version` 显示 5.9.x

### 1.2 统一 ws 版本

**当前状态**: `^8.14.2` (4 包) vs `^8.20.0` (app)

**行动**: 统一所有包的 `ws` 为 `^8.20.0`

**文件**: `packages/server/package.json`, `packages/cli/package.json`, `packages/client/package.json`, `packages/relay/package.json`

**验证**: `grep -r '"ws"' packages/*/package.json` 只显示 `^8.20.0`

### 1.3 对齐 @types/react 与 react 版本

**当前状态**: `@types/react ~19.2.0` vs `react 19.1.0`

**行动**: 升级 `react` 到 `19.2.x` 或将 `@types/react` 降级匹配；与 Expo 兼容性确认后执行

**文件**: `packages/app/package.json`

**验证**: `npm run typecheck` 通过

### 1.4 升级 markdown-it

**当前状态**: `markdown-it ^10.0.0`（2020 年版本）

**行动**: 升级到 `markdown-it ^14.0.0`，检查 breaking changes（API 变更列表）并适配

**文件**: `packages/app/package.json:85`

**验证**: App 渲染 Markdown 功能正常；typecheck 通过

### 1.5 优化 lefthook pre-commit typecheck

**当前状态**: 每次提交全量 `npm run typecheck`，对 468K LOC 仓库来说过慢

**行动**: 重构 lefthook typecheck job，改为增量检查：

- 在 `lefthook.yml` 中使用 `files` 过滤，只对变更包执行 typecheck
- 或使用 `tsc --incremental` 配合项目引用（project references）

**文件**: `lefthook.yml`

**验证**: 单文件变更后 commit 的 typecheck 时间从全量降至仅受影响包

### 1.6 评估 node-pty beta 依赖

**当前状态**: `node-pty 1.2.0-beta.11` 在生产依赖中

**行动**: 检查 node-pty 是否有稳定版替代；如果没有，在 `docs/development.md` 中添加注释说明使用 beta 的原因

**文件**: `packages/server/package.json:76`

**验证**: 决策记录已添加

---

## 阶段二：测试盲区与巨型文件拆分

**目标**: 填补测试空白、拆分过大文件提升可维护性

### 2.1 为 expo-two-way-audio 添加基础测试

**当前状态**: 5 个源文件，0 个测试

**行动**:

- 为核心导出函数添加单元测试（至少覆盖 `useAudioDevices` hook 和编解码逻辑）
- 创建 `packages/expo-two-way-audio/vitest.config.ts`（如需要）
- Native-only 部分使用 mock

**文件**: 新建 `packages/expo-two-way-audio/src/**/*.test.ts`

**验证**: `npx vitest run packages/expo-two-way-audio` 通过

### 2.2 为 website 添加基础测试

**当前状态**: 83 个源文件，0 个测试

**行动**:

- 为核心逻辑（路由、数据获取）添加单元测试
- 至少覆盖 `src/github-cache.ts`（目前有 silent catch 的关键缓存逻辑）

**文件**: 新建 `packages/website/src/**/*.test.ts`

**验证**: `npx vitest run packages/website` 通过

### 2.3 拆分 server/session.ts（9,116 行）

**当前状态**: 单个 9,116 行巨型文件

**逻辑分区**（基于探索结果）:

1. **常量与辅助函数** (L1-723) → `session-helpers.ts`
2. **Session 类核心** (L724-9095) — 保留构造函数和公共 API
   - 子模块提取：
   - **workspace/git 操作** → `session-workspace.ts`
   - **archiving 逻辑** → `session-archiving.ts`
   - **editor/PR 操作** → `session-editor.ts`
3. **PR timeline 辅助** (L9096-9116) → `pull-request-helpers.ts`

**原则**: 每个提取的模块从 `session.ts` re-export，保持公共 API 不变。不改变外部行为。

**验证**: 全量 typecheck 通过；现有 session 测试全部通过

### 2.4 拆分 codex-app-server-agent.ts（5,734 行）

**逻辑分区**:

1. **常量与能力定义** (L90-393) → `codex-constants.ts`
2. **二进制发现与启动** (L394-484) → `codex-binary.ts`
3. **Prompt/命令解析** (L488-775) → `codex-prompt.ts`
4. **模型/使用/timeline 映射** (L781-1813) → `codex-mapping.ts`
5. **Zod schema** (L1823-2174) → `codex-schemas.ts`
6. **通知解析** (L2174-2670) → `codex-notifications.ts`
7. **`CodexAppServerAgentSession`** (L2878-5312) — 保留在主文件
8. **`CodexAppServerAgentClient`** (L5313-5641) → `codex-client.ts`
9. **模型定义** (L5642-5734) → `codex-models.ts`

**验证**: typecheck 通过；codex 相关测试通过

### 2.5 拆分 claude/agent.ts（5,036 行）

**逻辑分区**:

1. **常量与辅助函数** (L92-899) → `claude-helpers.ts`
2. **`TimelineAssembler`** (L900-1191) → `claude-timeline-assembler.ts`
3. **事件/ID 辅助** (L1192-1273) → `claude-event-ids.ts`
4. **`ClaudeAgentClient`** (L1274-1430) → `claude-client.ts`
5. **二进制/认证** (L1431-1562) → `claude-binary.ts`
6. **`ClaudeAgentSession`** (L1563-4626) — 保留在主文件
7. **历史转换** (L4627-4798) → `claude-history.ts`
8. **消息队列与会话发现** (L4799-5036) → `claude-session-discovery.ts`

**验证**: typecheck 通过；claude agent 测试通过

---

## 阶段三：代码质量与一致性

**目标**: 消除 silent catch、统一错误消息语言、清理 TODO、添加缺失 README

### 3.1 审计并修复 silent error catches（高优先级生产代码）

**当前状态**: 生产代码中约 30+ 处 `.catch(() => undefined)` 或类似静默吞错

**关键位置**（生产代码，非测试）:

- `packages/app/src/app/_layout.tsx`: L691, L738, L755, L773
- `packages/app/src/runtime/host-runtime.ts`: L600, L896, L933, L1021, L1062, L1127, L1715, L1941
- `packages/app/src/voice/audio-engine.web.ts`: L126, L138, L147, L159, L256, L273
- `packages/app/src/voice/voice-runtime.ts`: L557, L558, L806, L815
- `packages/client/src/daemon-client.ts`: L1405, L2547, L2548, L2703, L2769, L3625, L3681
- `packages/server/src/server/session.ts`: multiple
- `packages/server/src/server/bootstrap.ts`: L483, L990, L1031, L1033, L1037, L1038
- `packages/desktop/src/main.ts`: L507

**行动**:

- 对每个 silent catch 做分类：
  - **有意忽略**（如 UI 动画完成回调）：添加 `// intentionally ignored: [reason]` 注释
  - **应该记录**（如网络请求失败）：改为 `.catch((e) => logger.warn("context", { error: e }))`
  - **应该传播**（如关键状态更新）：移除 catch 或改为 toast/通知
- 优先修复 `host-runtime.ts` 和 `daemon-client.ts`（8+ 处 each）

**验证**: `grep -r '\.catch.*=> .*undefined\|\.catch.*=> {}' packages/*/src/` 仅有带注释的有意忽略

### 3.2 统一 desktop 包错误消息语言

**当前状态**: desktop 包中约 30+ 条中文错误消息，与项目其余英文不一致

**关键位置**:

- `packages/desktop/src/i18n.ts:33-51`: 国际化键但只有中文值
- `packages/desktop/src/daemon/package-paths.ts:10`: `` `${input.label} 缺失：${input.filePath}` ``
- `packages/desktop/src/daemon/node-entrypoint-runner.ts:6,9`: 混合语言错误
- `packages/desktop/src/daemon/daemon-manager.ts:613`: `未知桌面命令`
- `packages/desktop/src/daemon/local-transport.ts`: 多条中文错误
- `packages/desktop/src/daemon/cli/external.ts:52,94,103,110`: 中文 CLI 错误
- `packages/desktop/src/daemon/cli/passthrough.ts:45`: 中文错误

**行动**:

- 将所有硬编码中文错误消息翻译为英文
- `i18n.ts` 中的条目改为 `{ zh: "...", en: "..." }` 结构（如已使用 i18n 系统）或统一为英文消息
- 如果项目本身支持中文 UI，通过 i18n 系统提供翻译而非硬编码

**验证**: `grep -rP '[\x{4e00}-\x{9fff}]' packages/desktop/src/` 仅剩 i18n 翻译文件中的条目

### 3.3 清理到期 TODO

**关键位置**:

- `packages/protocol/src/messages.ts:1577` — `// TODO(2026-07): Remove once most clients are on >=0.1.50`
- `packages/server/src/server/session.ts:325` — `// TODO: Remove once all app store clients are on >=0.1.45`

**行动**:

- 评估每个带日期 TODO 的当前状态
- 如果条件已满足（版本已超过阈值），执行清理
- 如果条件未满足，保留但确认日期仍然合理

**验证**: `rg "TODO.*Remove once"` 仅显示仍有效的条目

### 3.4 添加缺失的包级 README

**缺失**: `cli`、`highlight`、`relay`、`website`

**行动**:

- 每个包添加 README.md，包含：包名、用途、主要导出、开发/构建命令
- 格式与现有 README（如 `packages/app/README.md`）保持一致

**验证**: 四个包都有了 README.md

### 3.5 修复 sherpa-onnx 的 `as any`

**当前状态**: `packages/server/src/server/speech/providers/local/sherpa/model-downloader.ts:60`

```typescript
const nodeStream = Readable.fromWeb(res.body as any);
```

**行动**: 使用正确的类型断言，例如：

```typescript
const nodeStream = Readable.fromWeb(res.body as ReadableStream<Uint8Array>);
```

或添加 `@ts-expect-error` 并注释原因（如果 Node 类型定义不完整）

**验证**: `npm run typecheck` 通过；`npm run lint` 通过

### 3.6 desktop 包使用 electron-log 替代 console.warn

**当前状态**: `packages/desktop/src/window/window-manager.ts:183` 使用 `console.warn`

**行动**: 将 desktop 包中的 `console.warn`/`console.error` 替换为已依赖的 `electron-log`

**验证**: `grep -r 'console\.\(warn\|error\)' packages/desktop/src/` 结果为空或只有测试文件

---

## 阶段四：验证与收尾

### 4.1 全量验证

- `npm run typecheck` — 零错误
- `npm run lint` — 零错误
- `npm run format:check` — 通过
- 各包的现有测试全部通过（不运行全量测试套件，按 CLAUDE.md 规定运行受影响包的测试）

### 4.2 文档更新

- 在 `docs/` 中记录：
  - 依赖版本统一策略（阶段一产出）
  - 文件拆分后的模块关系图（阶段二产出）
  - 错误处理准则（阶段三产出）

---

## 风险与缓解

| 风险                                  | 缓解措施                                                  |
| ------------------------------------- | --------------------------------------------------------- |
| TypeScript 版本升级可能引入新类型错误 | 先运行 typecheck 确认现有错误，升级后逐包修复             |
| 文件拆分可能破坏循环导入              | 每次拆分后立即运行 typecheck，使用 re-export 保持公共 API |
| markdown-it v14 有 breaking changes   | 先查 changelog，写迁移脚本                                |
| silent catch 修复可能改变运行时行为   | 分类处理，有意忽略加注释而非删除                          |
| 中文错误消息翻译可能影响 desktop 用户 | 桌面包支持 i18n，通过 i18n 系统提供翻译                   |

---

## 验收标准

- [ ] 所有包 TypeScript 版本统一为 `^5.9.3`
- [ ] `ws` 版本统一为 `^8.20.0`
- [ ] `markdown-it` 升级到 v14+
- [ ] lefthook 支持增量 typecheck
- [ ] `expo-two-way-audio` 有至少 1 个测试文件
- [ ] `website` 核心逻辑有测试覆盖
- [ ] `session.ts` 拆分为 ≤4 个子模块，主文件 ≤3000 行
- [ ] `codex-app-server-agent.ts` 拆分为 ≤8 个子模块
- [ ] `claude/agent.ts` 拆分为 ≤7 个子模块
- [ ] 生产代码 silent catch 全部有注释或有日志
- [ ] desktop 包无硬编码中文错误消息
- [ ] 带 版本 门限的 TODO 已评估或清理
- [ ] 4 个缺失包有 README.md
- [ ] `model-downloader.ts:60` 的 `as any` 已移除
- [ ] desktop 包使用 `electron-log` 替代 `console.warn/error`
- [ ] `npm run typecheck && npm run lint && npm run format:check` 全部通过
