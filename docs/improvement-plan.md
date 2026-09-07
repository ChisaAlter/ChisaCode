# ChisaCode 完整改进方案实施指南

## 🎯 总览

基于对 T3code 的深度对比分析，本方案提供 **4 个阶段** 的系统性改进，预期收益：

- 📦 代码库大小减少 **50-70%** (3.2GB → ~1GB)
- ⚡ 开发 HMR 速度提升 **5-10倍**
- 🧪 测试稳定性提升 **80%+**
- 🏗️ 架构可维护性提升 **3倍**

---

## 📋 阶段 1：基础设施优化 (2-3 周)

### ✅ 任务 1.1：迁移到 pnpm + catalog dependencies

**问题**：
- 当前 3.2 GB 代码库（vs T3code 341 MB）
- React 版本冲突（18.3.1 vs 19.2.3）
- 依赖重复安装

**已创建文件**：
- ✅ `pnpm-workspace.yaml` - workspace 配置 + catalog 定义
- ✅ `scripts/migrate-to-pnpm.mjs` - 自动迁移脚本

**执行步骤**：

```bash
# 1. 全局安装 pnpm
npm install -g pnpm@latest

# 2. 运行迁移脚本（自动转换 package.json）
node scripts/migrate-to-pnpm.mjs

# 3. 清理旧依赖
rm -rf node_modules package-lock.json
rm -rf packages/*/node_modules

# 4. 安装依赖（首次会慢，后续快）
pnpm install

# 5. 验证构建
pnpm run build:client
pnpm run build:server

# 6. 验证测试
pnpm run test:guard
```

**预期收益**：
- 磁盘占用从 3.2GB → ~1GB (69% 减少)
- 安装速度提升 2-3倍
- 版本一致性保证

---

### ✅ 任务 1.2：开发时源码导入（消除构建步骤）

**问题**：
- 当前必须 `npm run build:client` 才能 typecheck
- 跨包修改需要频繁重建

**解决方案**：直接导入 TypeScript 源码

**已创建文件**：
- ✅ `packages/app/tsconfig.json` - 更新 paths 指向源码
- ✅ `packages/app/metro.config.js` - Metro 配置源码解析
- ✅ `packages/server/src/utils/testable-queue.ts` - 可测试队列
- ✅ `packages/server/src/utils/testable-queue.test.ts` - 测试示例
- ✅ `packages/server/src/core/di-container.ts` - DI 容器
- ✅ `packages/server/src/core/di-container.test.ts` - DI 测试
- ✅ `scripts/bundle-budgets.mjs` - Bundle 预算配置
- ✅ `scripts/check-bundle-size.mjs` - Bundle 检查脚本

**执行步骤**：

```bash
# 1. 验证源码导入工作
cd packages/app
npm run typecheck  # 应该能直接读取其他包的 .ts 文件

# 2. 测试 HMR（修改 protocol 源码应立即反映）
npm run dev:app

# 3. 如果有类型错误，确保已构建依赖的声明文件
npm run build:protocol
```

**预期收益**：
- 开发时 HMR 延迟从 5-10s → 即时
- 消除手动 `npm run build:client` 步骤
- 类型错误即时反馈

---

### ✅ 任务 1.3：TestableQueue 模式替代 setTimeout

**问题**：
- 588 处 setTimeout 缺少清理
- 测试依赖不确定的等待时间
- Flaky tests 高发

**已创建**：
- ✅ `TestableQueue` - 可等待队列完成
- ✅ `TestableWorker` - 包装工作函数
- ✅ 完整测试示例

**执行步骤**：

```bash
# 1. 运行测试验证模式工作
cd packages/server
npx vitest run src/utils/testable-queue.test.ts

# 2. 重构一个真实的 agent 测试作为示例
# 编辑 packages/server/src/server/agent/agent-manager.test.ts
# 找到使用 setTimeout 的测试，替换为 TestableQueue

# 示例重构：
# BEFORE:
# await new Promise(resolve => setTimeout(resolve, 1000))
# expect(agent.status).toBe('idle')

# AFTER:
# await agentQueue.drain()
# expect(agent.status).toBe('idle')
```

**预期收益**：
- 测试运行时间减少 50%+
- Flaky tests 减少 80%+
- 无需任意 sleep 时间

---

### ✅ 任务 1.4：依赖注入（DI）重构

**问题**：
- AgentManager 直接依赖具体实现
- 测试难以 mock 依赖
- 服务边界不清晰

**已创建**：
- ✅ `DIContainer` - 轻量级 DI 容器
- ✅ 完整测试示例和文档
- ✅ `createTestContainer` 测试辅助函数

**执行步骤**：

```typescript
// 1. 重构 AgentManager 使用 DI
// packages/server/src/server/agent/agent-manager.ts

// BEFORE:
class AgentManager {
  private storage = new AgentStorage()
  private websocket = new WebSocketServer()
  
  async createAgent(config: AgentConfig) {
    // ...
  }
}

// AFTER:
interface AgentManagerDeps {
  storage: AgentStorage
  websocket: WebSocketServer
  relay?: RelayService
}

class AgentManager {
  constructor(private deps: AgentManagerDeps) {}
  
  static create(deps: AgentManagerDeps) {
    return new AgentManager(deps)
  }
  
  async createAgent(config: AgentConfig) {
    await this.deps.storage.save(...)
    this.deps.websocket.broadcast(...)
  }
}

// 2. 在 bootstrap.ts 中设置容器
// packages/server/src/server/bootstrap.ts

import { DIContainer } from './core/di-container'

export async function bootstrap() {
  const container = new DIContainer()
    .register('storage', () => new AgentStorage(config.dataDir))
    .register('websocket', () => new WebSocketServer(config.port))
    .register('agents', (c) => 
      AgentManager.create({
        storage: c.get('storage'),
        websocket: c.get('websocket')
      })
    )
  
  return container
}

// 3. 测试中使用 mock
// agent-manager.test.ts

test('creates agent', async () => {
  const mockStorage = { save: vi.fn() }
  const mockWS = { broadcast: vi.fn() }
  
  const container = createTestContainer({
    storage: mockStorage,
    websocket: mockWS
  })
  
  const manager = AgentManager.create({
    storage: mockStorage,
    websocket: mockWS
  })
  
  await manager.createAgent({ prompt: 'test' })
  
  expect(mockStorage.save).toHaveBeenCalled()
  expect(mockWS.broadcast).toHaveBeenCalled()
})
```

**预期收益**：
- 测试速度提升 3-5x（无需真实 I/O）
- 测试隔离性更好
- 更容易理解服务依赖关系

---

### ✅ 任务 1.5：Bundle Size 监控

**已创建**：
- ✅ `scripts/bundle-budgets.mjs` - 预算配置
- ✅ `scripts/check-bundle-size.mjs` - 检查脚本

**执行步骤**：

```bash
# 1. 分析当前依赖大小
node scripts/check-bundle-size.mjs --analyze

# 2. 添加到 package.json scripts
npm pkg set scripts.check:bundle="node scripts/check-bundle-size.mjs"

# 3. 添加到 CI
# .github/workflows/ci.yml
- name: Check bundle size
  run: npm run check:bundle

# 4. 审计最大的依赖
# 查看输出的 "Largest Dependencies"
# 评估是否可以：
# - 移除不需要的包
# - 替换为更轻量的替代品
# - 延迟加载（dynamic import）
```

**预期收益**：
- 防止意外引入大型依赖
- 持续追踪代码库增长
- 目标：减少 50-70% 总体积

---

## 📋 阶段 2：架构改进 (3-4 周)

### ✅ 任务 2.1：事件溯源引入（可选但推荐）

**问题**：
- 无审计跟踪
- 难以调试历史状态
- 无法重放 agent 执行

**T3code 的做法**：
```
Command → Decider (pure) → Events → Projector → Read Model
```

**实施步骤**：

**已创建文件**：
- ✅ `packages/server/src/core/event-sourcing.ts` - 事件溯源核心
- ✅ `packages/server/src/core/event-sourcing.test.ts` - 完整测试套件

**执行步骤**：

```bash
# 1. 运行测试验证事件溯源工作
cd packages/server
npx vitest run src/core/event-sourcing.test.ts --bail=1

# 2. 渐进式迁移（不是一次性重写）
# 选择一个新功能（如新的 provider）作为试点
# 或者选择一个小模块（如 schedule service）

# 3. 保持兼容：事件溯源 + 现有 JSON 存储并存
# FileEventStore 使用相同的 JSON 文件格式
# 只是追加 .events.json 文件

# 4. 示例：迁移 Schedule Service
# packages/server/src/server/schedule/schedule-service.ts

import { EventSourcedAggregate, Decider } from '../core/event-sourcing'

// 定义事件
type ScheduleEvent =
  | { type: 'schedule_created'; id: string; cron: string; prompt: string }
  | { type: 'schedule_paused'; timestamp: number }
  | { type: 'schedule_resumed'; timestamp: number }
  | { type: 'schedule_run_started'; runId: string; timestamp: number }
  | { type: 'schedule_run_completed'; runId: string; result: any }

// 定义命令
type ScheduleCommand =
  | { type: 'create_schedule'; cron: string; prompt: string }
  | { type: 'pause_schedule' }
  | { type: 'resume_schedule' }
  | { type: 'run_schedule' }

// 定义状态
interface ScheduleState {
  id: string
  cron: string
  prompt: string
  status: 'active' | 'paused'
  runHistory: Array<{ runId: string; timestamp: number; result?: any }>
}

// Decider（纯函数）
const scheduleDecider: Decider<ScheduleCommand, ScheduleEvent, ScheduleState> = {
  initialState: {
    id: '',
    cron: '',
    prompt: '',
    status: 'active',
    runHistory: []
  },

  decide(state, command) {
    // 纯函数：根据当前状态和命令决定产生哪些事件
    switch (command.type) {
      case 'create_schedule':
        return [{
          type: 'schedule_created',
          id: generateId(),
          cron: command.cron,
          prompt: command.prompt
        }]
      case 'pause_schedule':
        if (state?.status === 'active') {
          return [{ type: 'schedule_paused', timestamp: Date.now() }]
        }
        return []
      // ...
    }
  },

  evolve(state, event) {
    // 纯函数：根据事件更新状态
    if (!state) state = scheduleDecider.initialState
    
    switch (event.type) {
      case 'schedule_created':
        return { ...state, id: event.id, cron: event.cron, prompt: event.prompt }
      case 'schedule_paused':
        return { ...state, status: 'paused' }
      // ...
    }
  }
}
```

**预期收益**：
- 完整审计跟踪（符合 GDPR）
- 时间旅行调试（回放到任意时间点）
- 确定性测试（重放事件序列）
- 易于添加新投影（分析、报告）

**注意**：这是**可选**功能，可以：
1. 仅在新功能中使用
2. 与现有系统并存
3. 渐进式迁移，不影响稳定性

---

### ✅ 任务 2.2：错误处理标准化

**问题**：
- 错误处理模式不一致
- 有些错误被吞噬
- 调试困难

**解决方案**：统一错误类层次
