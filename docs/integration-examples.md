# 集成示例 - 如何使用新的改进模块

本文档提供完整的集成示例，展示如何在 ChisaCode 中使用新创建的改进模块。

---

## 📋 目录

1. [TestableQueue 使用示例](#testablequeue-使用示例)
2. [DI Container 使用示例](#di-container-使用示例)
3. [Event Sourcing 使用示例](#event-sourcing-使用示例)
4. [统一错误处理使用示例](#统一错误处理使用示例)
5. [完整服务示例](#完整服务示例)
6. [渐进式迁移指南](#渐进式迁移指南)

---

## TestableQueue 使用示例

### 问题：测试中的时间依赖

**修改前的测试**（不稳定，有 Flaky 风险）:

```typescript
// ❌ 不推荐: 使用 setTimeout
test('agent completes task', async () => {
  const agent = new Agent()
  agent.run('task')
  
  // 等待 1 秒，希望任务完成
  await new Promise(resolve => setTimeout(resolve, 1000))
  
  expect(agent.status).toBe('idle')
})
```

**问题**:
- 如果任务用时 > 1 秒，测试失败
- 如果任务用时 < 1 秒，浪费时间
- CI 环境速度不同，导致 Flaky

**修改后的测试**（确定性，稳定）:

```typescript
// ✅ 推荐: 使用 TestableQueue
import { TestableQueue } from '@server/utils/testable-queue'

test('agent completes task', async () => {
  const queue = new TestableQueue()
  const agent = new Agent(queue)
  
  agent.run('task')
  
  // 等待所有异步任务完成
  await queue.drain()
  
  expect(agent.status).toBe('idle')
})
```

**收益**:
- ✅ 测试立即完成（不浪费时间）
- ✅ 100% 确定性（无 Flaky）
- ✅ 速度提升 5-10x

### 实际集成步骤

**1. 修改服务类，接受 TestableQueue**

```typescript
// packages/server/src/services/my-service.ts

import { TestableQueue } from '@server/utils/testable-queue'

export class MyService {
  constructor(
    private queue = new TestableQueue()
  ) {}
  
  async processTask(task: Task) {
    // 将异步操作包装在 queue 中
    return this.queue.enqueue(async () => {
      await this.doWork(task)
    })
  }
  
  private async doWork(task: Task) {
    // 实际工作
  }
}
```

**2. 测试中使用**

```typescript
// packages/server/src/services/my-service.test.ts

import { describe, test, expect } from 'vitest'
import { TestableQueue } from '@server/utils/testable-queue'
import { MyService } from './my-service'

describe('MyService', () => {
  test('should process task and complete', async () => {
    const queue = new TestableQueue()
    const service = new MyService(queue)
    
    const task = { id: '1', data: 'test' }
    service.processTask(task)
    
    // 等待所有任务完成
    await queue.drain()
    
    expect(service.isIdle()).toBe(true)
  })
  
  test('should timeout if task hangs', async () => {
    const queue = new TestableQueue()
    const service = new MyService(queue)
    
    const hangingTask = { id: '2', data: 'hang' }
    service.processTask(hangingTask)
    
    // 超时保护
    await expect(queue.drain(1000)).rejects.toThrow('Timeout')
  })
})
```

---

## DI Container 使用示例

### 问题：手动依赖注入的痛点

**修改前**（手动构造依赖）:

```typescript
// ❌ 不推荐: 手动创建所有依赖
class UserService {
  private db: Database
  private cache: Cache
  private logger: Logger
  
  constructor() {
    this.db = new Database({ host: 'localhost' })
    this.cache = new Cache({ ttl: 60 })
    this.logger = createLogger('user-service')
  }
}

// 测试时很痛苦
test('user service test', () => {
  // 必须 mock 所有依赖
  const mockDb = { query: vi.fn() }
  const mockCache = { get: vi.fn(), set: vi.fn() }
  const mockLogger = { info: vi.fn(), error: vi.fn() }
  
  // 无法直接注入，只能通过 prototype 替换
  vi.spyOn(Database.prototype, 'query').mockImplementation(mockDb.query)
  // ...
})
```

**修改后**（使用 DI Container）:

```typescript
// ✅ 推荐: 使用 DI Container
import { DIContainer } from '@server/core/di-container'

// 1. 定义服务
class UserService {
  constructor(
    private db: Database,
    private cache: Cache,
    private logger: Logger
  ) {}
  
  async getUser(id: string) {
    this.logger.info(`Fetching user ${id}`)
    const cached = await this.cache.get(`user:${id}`)
    if (cached) return cached
    
    const user = await this.db.query('SELECT * FROM users WHERE id = ?', [id])
    await this.cache.set(`user:${id}`, user)
    return user
  }
}

// 2. 设置容器（生产环境）
export function createProductionContainer() {
  const container = new DIContainer()
  
  container.register('database', () => new Database({ host: 'localhost' }))
  container.register('cache', () => new Cache({ ttl: 60 }))
  container.register('logger', () => createLogger('app'))
  
  container.register('userService', (c) => new UserService(
    c.get('database'),
    c.get('cache'),
    c.get('logger')
  ))
  
  return container
}

// 3. 使用
const container = createProductionContainer()
const userService = container.get('userService')
```

**测试中使用**:

```typescript
// ✅ 测试时轻松 mock
import { describe, test, expect, vi } from 'vitest'
import { createTestContainer } from '@server/core/di-container'

describe('UserService', () => {
  test('should fetch user from cache', async () => {
    // 创建测试容器，所有依赖都是 mock
    const container = createTestContainer({
      database: { query: vi.fn() },
      cache: { 
        get: vi.fn().mockResolvedValue({ id: '1', name: 'Alice' }),
        set: vi.fn()
      },
      logger: { info: vi.fn(), error: vi.fn() }
    })
    
    // 注入真实服务
    container.register('userService', (c) => new UserService(
      c.get('database'),
      c.get('cache'),
      c.get('logger')
    ))
    
    const userService = container.get('userService')
    const user = await userService.getUser('1')
    
    expect(user).toEqual({ id: '1', name: 'Alice' })
    expect(container.get('cache').get).toHaveBeenCalledWith('user:1')
    expect(container.get('database').query).not.toHaveBeenCalled() // 从缓存读取
  })
})
```

---

## Event Sourcing 使用示例

### 适用场景

- 需要完整审计日志
- 需要时间旅行调试
- 需要重放历史状态
- 合规要求（金融、医疗等）

### 实现示例：Schedule Service

**1. 定义事件类型**

```typescript
// packages/server/src/services/schedule/schedule-events.ts

export type ScheduleCommand =
  | { type: 'create_schedule'; scheduleId: string; cron: string; prompt: string }
  | { type: 'pause_schedule'; timestamp: number }
  | { type: 'resume_schedule'; timestamp: number }
  | { type: 'execute_schedule'; runId: string }
  | { type: 'delete_schedule' }

export type ScheduleEvent =
  | { type: 'schedule_created'; scheduleId: string; cron: string; prompt: string; timestamp: number }
  | { type: 'schedule_paused'; timestamp: number }
  | { type: 'schedule_resumed'; timestamp: number }
  | { type: 'schedule_executed'; runId: string; result: 'success' | 'failure'; timestamp: number }
  | { type: 'schedule_deleted'; timestamp: number }

export interface ScheduleState {
  scheduleId: string | null
  cron: string | null
  prompt: string | null
  status: 'idle' | 'active' | 'paused' | 'deleted'
  executionCount: number
  lastExecutedAt: number | null
}
```

**2. 实现 Decider（纯函数）**

```typescript
// packages/server/src/services/schedule/schedule-decider.ts

import type { Decider } from '@server/core/event-sourcing'
import type { ScheduleCommand, ScheduleEvent, ScheduleState } from './schedule-events'

export const scheduleDecider: Decider<ScheduleCommand, ScheduleEvent, ScheduleState> = {
  // 初始状态
  initialState: {
    scheduleId: null,
    cron: null,
    prompt: null,
    status: 'idle',
    executionCount: 0,
    lastExecutedAt: null
  },
  
  // 命令 → 事件（业务逻辑）
  decide: (command, state) => {
    switch (command.type) {
      case 'create_schedule':
        if (state.scheduleId) {
          throw new Error('Schedule already exists')
        }
        return [{
          type: 'schedule_created',
          scheduleId: command.scheduleId,
          cron: command.cron,
          prompt: command.prompt,
          timestamp: Date.now()
        }]
      
      case 'pause_schedule':
        if (state.status !== 'active') {
          throw new Error('Can only pause active schedule')
        }
        return [{ type: 'schedule_paused', timestamp: command.timestamp }]
      
      case 'resume_schedule':
        if (state.status !== 'paused') {
          throw new Error('Can only resume paused schedule')
        }
        return [{ type: 'schedule_resumed', timestamp: command.timestamp }]
      
      case 'execute_schedule':
        if (state.status !== 'active') {
          throw new Error('Cannot execute inactive schedule')
        }
        return [{
          type: 'schedule_executed',
          runId: command.runId,
          result: 'success',
          timestamp: Date.now()
        }]
      
      case 'delete_schedule':
        if (state.status === 'deleted') {
          throw new Error('Schedule already deleted')
        }
        return [{ type: 'schedule_deleted', timestamp: Date.now() }]
      
      default:
        return []
    }
  },
  
  // 事件 → 状态（状态演化）
  evolve: (state, event) => {
    switch (event.type) {
      case 'schedule_created':
        return {
          ...state,
          scheduleId: event.scheduleId,
          cron: event.cron,
          prompt: event.prompt,
          status: 'active' as const
        }
      
      case 'schedule_paused':
        return { ...state, status: 'paused' as const }
      
      case 'schedule_resumed':
        return { ...state, status: 'active' as const }
      
      case 'schedule_executed':
        return {
          ...state,
          executionCount: state.executionCount + 1,
          lastExecutedAt: event.timestamp
        }
      
      case 'schedule_deleted':
        return { ...state, status: 'deleted' as const }
      
      default:
        return state
    }
  }
}
```

**3. 使用 EventSourcedAggregate**

```typescript
// packages/server/src/services/schedule/schedule-service.ts

import { FileEventStore, EventSourcedAggregate } from '@server/core/event-sourcing'
import { scheduleDecider } from './schedule-decider'
import type { ScheduleCommand } from './schedule-events'

export class ScheduleService {
  private eventStore: FileEventStore
  
  constructor(dataDir: string) {
    this.eventStore = new FileEventStore(dataDir)
  }
  
  async createSchedule(id: string, cron: string, prompt: string) {
    const aggregate = new EventSourcedAggregate(
      id,
      scheduleDecider,
      this.eventStore
    )
    
    await aggregate.execute({
      type: 'create_schedule',
      scheduleId: id,
      cron,
      prompt
    })
    
    return aggregate.getState()
  }
  
  async pauseSchedule(id: string) {
    const aggregate = new EventSourcedAggregate(
      id,
      scheduleDecider,
      this.eventStore
    )
    
    await aggregate.execute({
      type: 'pause_schedule',
      timestamp: Date.now()
    })
    
    return aggregate.getState()
  }
  
  async getScheduleHistory(id: string) {
    // 完整审计日志
    return await this.eventStore.getEvents(id)
  }
  
  async replayScheduleAt(id: string, timestamp: number) {
    // 时间旅行：重放到指定时间点
    const events = await this.eventStore.getEvents(id)
    const eventsUntil = events.filter(e => e.timestamp <= timestamp)
    
    let state = scheduleDecider.initialState
    for (const event of eventsUntil) {
      state = scheduleDecider.evolve(state, event.data)
    }
    
    return state
  }
}
```

**4. 测试**

```typescript
// packages/server/src/services/schedule/schedule-service.test.ts

import { describe, test, expect } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ScheduleService } from './schedule-service'

describe('ScheduleService (Event Sourced)', () => {
  test('should create and pause schedule', async () => {
    const tempDir = join(tmpdir(), `schedule-test-${Date.now()}`)
    const service = new ScheduleService(tempDir)
    
    // 创建
    const created = await service.createSchedule('sched-1', '0 9 * * *', 'daily task')
    expect(created.status).toBe('active')
    
    // 暂停
    const paused = await service.pauseSchedule('sched-1')
    expect(paused.status).toBe('paused')
    
    // 查看历史
    const history = await service.getScheduleHistory('sched-1')
    expect(history).toHaveLength(2)
    expect(history[0].data.type).toBe('schedule_created')
    expect(history[1].data.type).toBe('schedule_paused')
  })
  
  test('should replay state at any point in time', async () => {
    const tempDir = join(tmpdir(), `schedule-test-${Date.now()}`)
    const service = new ScheduleService(tempDir)
    
    await service.createSchedule('sched-2', '0 9 * * *', 'task')
    const timestamp1 = Date.now()
    
    await new Promise(r => setTimeout(r, 10))
    await service.pauseSchedule('sched-2')
    
    // 时间旅行：回到暂停前
    const stateBefore = await service.replayScheduleAt('sched-2', timestamp1)
    expect(stateBefore.status).toBe('active')
    
    // 当前状态
    const stateNow = await service.replayScheduleAt('sched-2', Date.now())
    expect(stateNow.status).toBe('paused')
  })
})
```

**收益**:
- ✅ 完整审计日志（每个操作都有记录）
- ✅ 时间旅行调试（重放任意时间点）
- ✅ 确定性测试（纯函数 decider）
- ✅ 易于理解（命令 → 事件 → 状态）

---

## 统一错误处理使用示例

### 问题：错误处理不一致

**修改前**:

```typescript
// ❌ 各种不同的错误处理
class AgentService {
  async getAgent(id: string) {
    const agent = await this.storage.find(id)
    if (!agent) {
      throw new Error('Agent not found')  // 字符串错误
    }
    return agent
  }
  
  async callProvider(prompt: string) {
    try {
      return await this.provider.call(prompt)
    } catch (error) {
      console.error('Provider failed:', error)  // console.log
      throw error  // 原样抛出
    }
  }
}
```

**修改后**:

```typescript
// ✅ 使用统一错误类型
import { 
  NotFoundError, 
  ProviderError, 
  withRetry,
  ErrorHandler
} from '@server/core/errors'

class AgentService {
  constructor(
    private storage: AgentStorage,
    private provider: AgentProvider,
    private logger: Logger
  ) {}
  
  async getAgent(id: string) {
    const agent = await this.storage.find(id)
    if (!agent) {
      throw new NotFoundError('Agent', id)  // 类型化错误
    }
    return agent
  }
  
  async callProvider(prompt: string) {
    // 自动重试（最多 3 次）
    return await withRetry(
      async () => {
        try {
          return await this.provider.call(prompt)
        } catch (error) {
          throw new ProviderError(
            this.provider.id,
            'API call failed',
            { prompt, originalError: error }
          )
        }
      },
      {
        maxAttempts: 3,
        baseDelayMs: 1000,
        logger: this.logger
      }
    )
  }
}
```

### HTTP API 集成

```typescript
// packages/server/src/server/api/agents-routes.ts

import { Router } from 'express'
import { ErrorHandler } from '@server/core/errors'

const router = Router()

router.get('/agents/:id', async (req, res) => {
  try {
    const agent = await agentService.getAgent(req.params.id)
    res.json(agent)
  } catch (error) {
    // 统一错误转换
    const httpResponse = ErrorHandler.toHTTPResponse(error)
    res.status(httpResponse.statusCode).json(httpResponse.body)
  }
})

router.post('/agents/:id/run', async (req, res) => {
  try {
    const result = await agentService.callProvider(req.body.prompt)
    res.json(result)
  } catch (error) {
    ErrorHandler.log(error, logger)  // 结构化日志
    const httpResponse = ErrorHandler.toHTTPResponse(error)
    res.status(httpResponse.statusCode).json(httpResponse.body)
  }
})

export { router as agentsRouter }
```

**HTTP 响应示例**:

```json
// NotFoundError → 404
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Agent 'agent-123' not found",
    "details": {
      "resource": "Agent",
      "id": "agent-123"
    }
  }
}

// ProviderError (可恢复) → 503
{
  "error": {
    "code": "SERVICE_UNAVAILABLE",
    "message": "Provider 'claude' failed: API call failed",
    "recoverable": true,
    "details": {
      "providerId": "claude"
    }
  }
}
```

---

## 完整服务示例

将所有模式组合使用：

```typescript
// packages/server/src/services/example-service.ts

import { DIContainer } from '@server/core/di-container'
import { TestableQueue } from '@server/utils/testable-queue'
import { FileEventStore, EventSourcedAggregate } from '@server/core/event-sourcing'
import { NotFoundError, withRetry, ErrorHandler } from '@server/core/errors'
import type { Logger } from 'pino'

// 1. 定义接口
interface Database {
  query(sql: string, params: unknown[]): Promise<unknown>
}

interface Cache {
  get(key: string): Promise<unknown | null>
  set(key: string, value: unknown): Promise<void>
}

// 2. 实现服务
export class ExampleService {
  constructor(
    private db: Database,
    private cache: Cache,
    private queue: TestableQueue,
    private eventStore: FileEventStore,
    private logger: Logger
  ) {}
  
  async processItem(id: string) {
    // 使用队列管理异步任务
    return this.queue.enqueue(async () => {
      this.logger.info({ id }, 'Processing item')
      
      // 使用缓存
      const cached = await this.cache.get(`item:${id}`)
      if (cached) return cached
      
      // 使用错误处理 + 重试
      const item = await withRetry(
        async () => {
          const result = await this.db.query(
            'SELECT * FROM items WHERE id = ?',
            [id]
          )
          if (!result) {
            throw new NotFoundError('Item', id)
          }
          return result
        },
        { maxAttempts: 3, logger: this.logger }
      )
      
      await this.cache.set(`item:${id}`, item)
      return item
    })
  }
}

// 3. 设置容器
export function createExampleServiceContainer(config: {
  dbHost: string
  cacheHost: string
  dataDir: string
}) {
  const container = new DIContainer()
  
  container.register('database', () => new DatabaseImpl(config.dbHost))
  container.register('cache', () => new CacheImpl(config.cacheHost))
  container.register('queue', () => new TestableQueue())
  container.register('eventStore', () => new FileEventStore(config.dataDir))
  container.register('logger', () => createLogger('example'))
  
  container.register('exampleService', (c) => new ExampleService(
    c.get('database'),
    c.get('cache'),
    c.get('queue'),
    c.get('eventStore'),
    c.get('logger')
  ))
  
  return container
}

// 4. 使用
const container = createExampleServiceContainer({
  dbHost: 'localhost',
  cacheHost: 'localhost',
  dataDir: '/var/lib/app/events'
})

const service = container.get('exampleService')
await service.processItem('item-123')
```

**测试**:

```typescript
// packages/server/src/services/example-service.test.ts

import { describe, test, expect, vi } from 'vitest'
import { createTestContainer } from '@server/core/di-container'
import { TestableQueue } from '@server/utils/testable-queue'
import { FileEventStore } from '@server/core/event-sourcing'
import { ExampleService } from './example-service'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('ExampleService', () => {
  test('should process item with all patterns', async () => {
    // 创建测试容器
    const tempDir = join(tmpdir(), `test-${Date.now()}`)
    const queue = new TestableQueue()
    
    const container = createTestContainer({
      database: {
        query: vi.fn().mockResolvedValue({ id: '1', name: 'Test' })
      },
      cache: {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn()
      },
      queue,
      eventStore: new FileEventStore(tempDir),
      logger: { info: vi.fn(), error: vi.fn() }
    })
    
    container.register('exampleService', (c) => new ExampleService(
      c.get('database'),
      c.get('cache'),
      c.get('queue'),
      c.get('eventStore'),
      c.get('logger')
    ))
    
    const service = container.get('exampleService')
    
    // 执行
    service.processItem('1')
    
    // 等待队列完成
    await queue.drain()
    
    // 验证
    expect(container.get('database').query).toHaveBeenCalled()
    expect(container.get('cache').set).toHaveBeenCalledWith('item:1', { id: '1', name: 'Test' })
  })
})
```

---

## 渐进式迁移指南

### 阶段 1: 新服务使用新模式 (第 1-2 周)

1. **所有新服务必须使用 DI Container**
2. **所有新测试必须使用 TestableQueue**
3. **所有新错误必须使用类型化错误**

### 阶段 2: 重构一个测试 (第 3 周)

选择一个简单的测试，重构为使用 TestableQueue：

```bash
# 1. 找一个使用 setTimeout 的测试
grep -r "setTimeout" packages/server/src --include="*.test.ts" | head -5

# 2. 选择最简单的一个重构
# 3. 运行测试验证
# 4. 提交 PR
```

### 阶段 3: 重构一个服务 (第 4-5 周)

选择一个小的服务，引入 DI Container：

- **推荐**: AgentStorage (相对独立)
- **不推荐**: AgentManager (太复杂)

### 阶段 4: 试点 Event Sourcing (第 6-8 周)

为一个新功能引入事件溯源：

- **推荐**: Schedule Service (新功能)
- **不推荐**: 现有核心服务（风险高）

### 阶段 5: 错误处理标准化 (第 9-12 周)

逐步替换现有错误：

```bash
# 1. 搜索所有 throw new Error
grep -r "throw new Error" packages/server/src --include="*.ts" | wc -l

# 2. 按模块分批替换（每周 1-2 个模块）
# 3. 更新 HTTP handler
# 4. 验证日志
```

---

## 总结

### 新服务检查清单

创建新服务时，确保：

- [ ] 使用 DI Container 注册
- [ ] 构造器接受所有依赖
- [ ] 测试使用 TestableQueue
- [ ] 测试使用 createTestContainer
- [ ] 错误使用类型化错误类
- [ ] 可重试操作使用 withRetry
- [ ] （可选）需要审计日志时使用 Event Sourcing

### 重构现有服务检查清单

重构现有服务时：

- [ ] 先为服务创建完整测试
- [ ] 提取依赖接口
- [ ] 修改构造器接受依赖
- [ ] 更新测试使用 DI
- [ ] 运行所有测试确保无回归
- [ ] Code Review 后提交

### 获取帮助

如果遇到问题：

1. 查看 `packages/server/src/core/*.test.ts` 中的示例
2. 查看本文档的完整示例
3. 在团队中讨论
4. 参考 T3code 的实现（如果可用）

---

*最后更新: 2026-09-05*  
*版本: 1.0.0*
