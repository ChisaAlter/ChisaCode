# ChisaCode 改进方案 - 完整实施指南

## 📊 执行摘要

本文档提供了基于 T3code 最佳实践的完整改进方案，包括 **立即可执行的实施步骤**。

---

## 🎯 快速开始（30 分钟验证）

```bash
# 1. 克隆并进入项目
cd C:\Ai\ChisaCode

# 2. 安装 pnpm（如未安装）
npm install -g pnpm@latest

# 3. 运行迁移脚本
node scripts/migrate-to-pnpm.mjs

# 4. 清理旧依赖
rm -rf node_modules package-lock.json
rm -rf packages/*/node_modules

# 5. 安装依赖（首次会慢，后续很快）
pnpm install

# 6. 验证构建
pnpm run build:client
pnpm run build:server

# 7. 运行新的测试套件
cd packages/server
npx vitest run src/utils/testable-queue.test.ts --bail=1
npx vitest run src/core/di-container.test.ts --bail=1
npx vitest run src/core/event-sourcing.test.ts --bail=1
npx vitest run src/core/errors.test.ts --bail=1

# 8. 检查 Bundle 大小
node scripts/check-bundle-size.mjs --analyze
```

**预期结果**：
- ✅ 依赖安装成功
- ✅ 所有新测试通过
- ✅ Bundle 分析报告生成

---

## 📋 阶段 1：基础设施优化（第 1-3 周）

### 已完成的交付物

| 文件 | 用途 | 状态 |
|------|------|------|
| `pnpm-workspace.yaml` | pnpm workspace + catalog 配置 | ✅ 已创建 |
| `scripts/migrate-to-pnpm.mjs` | 自动迁移脚本 | ✅ 已创建 |
| `packages/app/tsconfig.json` | 源码导入配置 | ✅ 已更新 |
| `packages/app/metro.config.js` | Metro 源码解析 | ✅ 已创建 |
| `packages/server/src/utils/testable-queue.ts` | 可测试队列模式 | ✅ 已创建 |
| `packages/server/src/utils/testable-queue.test.ts` | 测试示例 | ✅ 已创建 |
| `packages/server/src/core/di-container.ts` | 依赖注入容器 | ✅ 已创建 |
| `packages/server/src/core/di-container.test.ts` | DI 测试 | ✅ 已创建 |
| `scripts/bundle-budgets.mjs` | Bundle 预算配置 | ✅ 已创建 |
| `scripts/check-bundle-size.mjs` | Bundle 检查工具 | ✅ 已创建 |

### 第 1 周：pnpm 迁移

**目标**：减少 50-70% 磁盘占用

```bash
# 周一：准备
- 备份当前项目
- 安装 pnpm
- 阅读 pnpm 文档

# 周二-周三：迁移
- 运行 migrate-to-pnpm.mjs
- 清理旧依赖
- pnpm install
- 解决 React 版本冲突（统一到 19.2.3）

# 周四：验证
- 运行所有构建脚本
- 运行测试套件（只运行变更文件）
- 验证 dev 服务器工作

# 周五：文档
- 更新 CONTRIBUTING.md（pnpm 相关）
- 更新 CI/CD 配置
- 团队培训
```

**验证清单**：
- [ ] `pnpm install` 成功
- [ ] `pnpm run build` 成功
- [ ] `pnpm run dev` 正常工作
- [ ] 磁盘占用 < 1.5 GB
- [ ] CI/CD 通过

### 第 2 周：源码导入 + TestableQueue

**目标**：消除构建步骤，测试更稳定

**周一-周二：源码导入**
```bash
# 1. 已更新的文件已就位
# 2. 验证 Metro 配置工作
cd packages/app
npm run dev:app

# 3. 修改 protocol/src/messages.ts
# 观察是否立即 HMR

# 4. 验证类型检查不需要构建
npm run typecheck  # 应该直接读源码
```

**周三-周四：TestableQueue 重构**
```bash
# 1. 找一个使用 setTimeout 的测试
grep -r "setTimeout.*resolve" packages/server/src --include="*.test.ts"

# 2. 重构一个示例测试
# 例如：packages/server/src/server/agent/agent-manager.test.ts

# 修改前：
test('agent completes', async () => {
  agent.run(prompt)
  await new Promise(resolve => setTimeout(resolve, 1000))
  expect(agent.status).toBe('idle')
})

# 修改后：
test('agent completes', async () => {
  const queue = new TestableQueue()
  agent.run(prompt, queue)
  await queue.drain()
  expect(agent.status).toBe('idle')
})

# 3. 验证测试更快且稳定
npx vitest run --reporter=verbose
```

**周五：集成到真实服务**
- 在 AgentManager 中集成 TestableQueue
- 运行完整测试套件
- 性能对比

**验证清单**：
- [ ] HMR 延迟 < 1 秒
- [ ] 无需手动 `build:client`
- [ ] 至少 5 个测试重构完成
- [ ] 测试时间减少 30%+

### 第 3 周：DI 容器 + Bundle 监控

**周一-周三：DI 重构**
```typescript
// 1. 选择一个服务重构（如 AgentStorage）
// packages/server/src/server/agent/agent-storage.ts

// 修改前：
export class AgentManager {
  private storage = new AgentStorage()
  
  async createAgent(config: AgentConfig) {
    await this.storage.save(...)
  }
}

// 修改后：
export class AgentManager {
  constructor(private deps: {
    storage: AgentStorage
    websocket: WebSocketService
  }) {}
  
  static create(deps: AgentManagerDeps) {
    return new AgentManager(deps)
  }
}

// 2. 在 bootstrap.ts 设置容器
const container = new DIContainer()
  .register('storage', () => new AgentStorage(config.dataDir))
  .register('agents', c => AgentManager.create({
    storage: c.get('storage'),
    websocket: c.get('websocket')
  }))

// 3. 测试中使用 mock
const mockStorage = { save: vi.fn(), load: vi.fn() }
const manager = AgentManager.create({ storage: mockStorage, ... })
```

**周四-周五：Bundle 监控**
```bash
# 1. 运行 Bundle 分析
node scripts/check-bundle-size.mjs --analyze

# 2. 识别最大依赖（输出前 20）
# 评估每个：
# - 是否必需？
# - 有更轻量的替代品吗？
# - 可以延迟加载吗？

# 3. 添加到 CI
# .github/workflows/ci.yml
jobs:
  bundle-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: pnpm install
      - run: pnpm run build
      - run: node scripts/check-bundle-size.mjs

# 4. 设置预算（根据当前大小 +10%）
# 编辑 scripts/bundle-budgets.mjs
```

**验证清单**：
- [ ] 至少 2 个服务用 DI 重构
- [ ] 测试速度提升 2-3x
- [ ] Bundle 检查在 CI 中运行
- [ ] 依赖大小趋势可追踪

---

## 📋 阶段 2：架构改进（第 4-7 周）

### 已完成的交付物

| 文件 | 用途 | 状态 |
|------|------|------|
| `packages/server/src/core/event-sourcing.ts` | 事件溯源核心 | ✅ 已创建 |
| `packages/server/src/core/event-sourcing.test.ts` | 事件溯源测试 | ✅ 已创建 |
| `packages/server/src/core/errors.ts` | 统一错误处理 | ✅ 已创建 |
| `packages/server/src/core/errors.test.ts` | 错误处理测试 | ✅ 已创建 |

### 第 4-5 周：事件溯源试点（可选）

**目标**：为一个新功能引入事件溯源

**推荐试点**：Schedule Service（计划任务）

```typescript
// Week 4: 实现 Decider 和 Projector
// packages/server/src/server/schedule/schedule-events.ts

type ScheduleEvent =
  | { type: 'schedule_created'; id: string; cron: string; prompt: string }
  | { type: 'schedule_paused'; timestamp: number }
  | { type: 'schedule_resumed'; timestamp: number }
  | { type: 'schedule_executed'; runId: string; result: any }

// Week 5: 集成到现有 Schedule Service
// 保持向后兼容：
// 1. 事件存储到 .events.json
// 2. 现有 JSON 存储继续工作
// 3. 新功能使用事件溯源
```

**收益验证**：
- 审计日志：所有调度操作可追溯
- 调试：可重放任意时间点
- 测试：确定性事件重放

### 第 6-7 周：错误处理标准化

**目标**：统一错误类型和处理模式

**Week 6：重构现有错误**
```bash
# 1. 搜索所有 throw 语句
grep -r "throw new Error" packages/server/src --include="*.ts" | wc -l

# 2. 分类错误：
# - NotFoundError（资源不存在）
# - ValidationError（输入验证）
# - OperationError（操作失败）
# - TimeoutError（超时）
# - ProviderError（Provider 相关）

# 3. 重构示例
# 修改前：
throw new Error('Agent not found')

# 修改后：
throw new NotFoundError('Agent', agentId)
```

**Week 7：集成到 API 和日志**
```typescript
// 1. HTTP handler 中使用
app.get('/api/agents/:id', async (req, res) => {
  try {
    const agent = await agentManager.getAgent(req.params.id)
    res.json(agent)
  } catch (error) {
    const response = ErrorHandler.toHTTPResponse(error)
    res.status(response.statusCode).json(response.body)
  }
})

// 2. 日志集成
try {
  await operation()
} catch (error) {
  ErrorHandler.log(error, logger)
  throw error
}

// 3. Retry 包装
const result = await withRetry(
  () => provider.callAPI(),
  { maxAttempts: 3, baseDelayMs: 1000, logger }
)
```

**验证清单**：
- [ ] 50%+ 错误使用新类型
- [ ] HTTP 响应统一
- [ ] 错误日志结构化
- [ ] Retry 逻辑自动应用

---

## 📋 阶段 3：开发体验提升（第 8-10 周）

### 计划交付物

1. **Vite for Web**（替代 Webpack）
2. **TypeScript paths 优化**
3. **热重载改进**
4. **开发者文档更新**

### 第 8 周：Vite 集成（Web only）

```bash
# 1. 为 packages/app 添加 Vite 配置（web 专用）
# packages/app/vite.config.web.ts

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'react-native': 'react-native-web',
      '@chisacode/protocol': '../protocol/src',
      '@chisacode/client': '../client/src'
    }
  },
  server: {
    port: 8081
  }
})

# 2. 添加 package.json script
"dev:web:vite": "vite --config vite.config.web.ts"

# 3. 验证 HMR
npm run dev:web:vite
# 修改组件 → 应该即时刷新
```

### 第 9 周：类型安全增强

**减少 `any` 使用**（当前 317 处）

```bash
# 1. 审计 any 使用
grep -r ": any" packages --include="*.ts" | wc -l

# 2. 优先修复高频文件
grep -r ": any" packages --include="*.ts" | cut -d: -f1 | uniq -c | sort -rn | head -20

# 3. 替换策略
# 修改前：
function process(data: any) { }

# 修改后：
function process<T>(data: T) { }
// 或
function process(data: unknown) {
  if (isAgentConfig(data)) { ... }
}
```

### 第 10 周：文档更新

```markdown
# docs/development-experience.md

## 快速开始

\`\`\`bash
pnpm install
pnpm run dev  # 启动所有服务
\`\`\`

## HMR 工作原理

- 修改 protocol → 即时反映到 app 和 server
- 无需手动构建步骤
- Metro（mobile）和 Vite（web）并行运行

## 测试最佳实践

- 使用 TestableQueue 代替 setTimeout
- 使用 DI mock 依赖
- 只运行变更文件：\`npx vitest run <file> --bail=1\`

## 错误处理

- 抛出类型化错误（NotFoundError, ValidationError 等）
- 使用 withRetry 包装可重试操作
- ErrorHandler.log 记录错误
\`\`\`
```

---

## 📋 阶段 4：可选高级特性（第 11+ 周）

### Effect 迁移（高级，可选）

**仅在团队熟悉 FP 时考虑**

```typescript
// 1. 引入 Effect 依赖
pnpm add effect @effect/schema

// 2. 试点一个新服务用 Effect
// packages/server/src/services/analytics-service.ts

import { Effect, Layer } from 'effect'

class AnalyticsService extends Effect.Service<AnalyticsService>()('Analytics', {
  effect: Effect.gen(function* () {
    const storage = yield* StorageService
    return {
      track: (event: Event) => Effect.gen(function* () {
        yield* storage.save(`event-${event.id}`, event)
      })
    }
  })
}) 

// 3. 与现有服务并存
// 不需要全部重写
```

**收益评估**：
- ✅ 类型安全的错误处理
- ✅ 资源自动清理
- ✅ 测试更容易
- ⚠️ 学习曲线陡峭
- ⚠️ 生态较小

**决策点**：
- 团队是否熟悉 FP？
- 是否值得引入新范式？
- 是否有足够时间培训？

---

## 📊 成功指标

### 关键绩效指标（KPI）

| 指标 | 当前 | 目标（3 个月） | 测量方法 |
|------|------|----------------|----------|
| **代码库大小** | 3.2 GB | < 1.2 GB | `du -sh .` |
| **依赖安装时间** | ~5 分钟 | < 2 分钟 | `time pnpm install` |
| **HMR 延迟** | 5-10 秒 | < 1 秒 | 手动测试 |
| **测试运行时间** | ~15 分钟 | < 8 分钟 | CI 时间 |
| **Flaky 测试率** | ~20% | < 5% | CI 重试率 |
| **`any` 使用** | 317 处 | < 150 处 | `grep -r ": any"` |
| **Bundle 大小** | 未测量 | 在预算内 | Bundle checker |

### 定性指标

- [ ] 开发者满意度提升
- [ ] Onboarding 时间减少
- [ ] Bug 修复速度提升
- [ ] Code review 速度提升

---

## 🚨 风险管理

### 主要风险

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| pnpm 不兼容某些依赖 | 中 | 高 | 保留 npm fallback，逐步迁移 |
| 源码导入破坏构建 | 低 | 高 | 保持 dist/ 构建并行，验证后切换 |
| DI 重构引入 bug | 中 | 中 | 增量重构，完整测试覆盖 |
| 事件溯源复杂度 | 低 | 中 | 仅用于新功能，可选特性 |
| 团队学习曲线 | 中 | 中 | 文档培训，Pair programming |

### 回滚计划

```bash
# 如果 pnpm 出现问题
git checkout HEAD -- pnpm-workspace.yaml
rm -rf node_modules pnpm-lock.yaml
npm install  # 回退到 npm

# 如果源码导入有问题
git checkout HEAD -- packages/app/tsconfig.json
git checkout HEAD -- packages/app/metro.config.js
npm run build:client  # 恢复构建步骤

# 如果 DI 引入 bug
git revert <commit-sha>  # 回退特定重构
```

---

## 📚 延伸阅读

### 内部文档
- `docs/improvement-plan.md` - 本文档
- `docs/architecture.md` - 系统架构
- `docs/testing.md` - 测试策略

### 外部资源
- [pnpm 文档](https://pnpm.io/)
- [Vite 文档](https://vitejs.dev/)
- [Effect 文档](https://effect.website/) - 可选
- [T3code 仓库](https://github.com/t3-oss/t3code) - 参考实现

---

## ✅ 每周检查清单

复制此清单到你的项目管理工具（Jira/Linear/GitHub Issues）

### Week 1: pnpm 迁移
- [ ] 运行 migrate-to-pnpm.mjs
- [ ] pnpm install 成功
- [ ] 所有构建通过
- [ ] 磁盘占用 < 1.5 GB
- [ ] CI/CD 更新
- [ ] 团队培训完成

### Week 2: 源码导入 + TestableQueue
- [ ] Metro 配置更新
- [ ] HMR < 1 秒验证
- [ ] 5+ 测试重构
- [ ] 测试时间减少 30%
- [ ] 文档更新

### Week 3: DI + Bundle
- [ ] 2+ 服务 DI 重构
- [ ] Bundle checker 运行
- [ ] CI 集成
- [ ] 依赖审计完成

### Week 4-5: 事件溯源（可选）
- [ ] Schedule service 试点
- [ ] 测试通过
- [ ] 审计日志验证
- [ ] 文档编写

### Week 6-7: 错误处理
- [ ] 50%+ 错误重构
- [ ] HTTP 统一响应
- [ ] Retry 逻辑集成
- [ ] 日志结构化

### Week 8-10: DX 提升
- [ ] Vite 集成（web）
- [ ] `any` 减少 50%
- [ ] 开发者文档更新
- [ ] 团队反馈收集

---

## 🎉 完成标志

当以下所有条件满足时，改进方案视为成功完成：

1. ✅ 代码库 < 1.2 GB
2. ✅ 所有 KPI 达标
3. ✅ CI/CD 稳定运行
4. ✅ 团队熟悉新模式
5. ✅ 文档完整更新
6. ✅ 无关键 bug 引入
7. ✅ 开发体验提升（团队反馈）

---

## 📞 获取帮助

如果在实施过程中遇到问题：

1. 检查 `docs/troubleshooting.md`（待创建）
2. 搜索相关错误信息
3. 询问团队中熟悉的成员
4. 查看 T3code 实现参考

**记住**：这是一个**渐进式改进**，不是推倒重来。每一步都应该是可验证、可回滚的。

---

*最后更新：2026-09-04*
*版本：1.0.0*
