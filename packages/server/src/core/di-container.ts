/**
 * Dependency Injection Container - Simplified Effect Layer Pattern
 *
 * Provides type-safe dependency injection without Effect framework.
 * Inspired by T3code's Effect Layer system.
 *
 * Benefits:
 * - Testable service boundaries
 * - Type-safe dependencies
 * - Explicit lifecycle management
 * - Easy mocking in tests
 *
 * Usage:
 *
 * ```typescript
 * // Define services
 * class StorageService {
 *   constructor(private dataDir: string) {}
 *   async save(key: string, data: unknown) { ... }
 * }
 *
 * class AgentService {
 *   constructor(private storage: StorageService) {}
 *   async createAgent(config: AgentConfig) {
 *     await this.storage.save(...)
 *   }
 * }
 *
 * // Create container
 * const container = new DIContainer()
 *   .register('storage', () => new StorageService('/data'))
 *   .register('agents', (c) => new AgentService(c.get('storage')))
 *
 * // Use in production
 * const agentService = container.get('agents')
 *
 * // Use in tests
 * const testContainer = new DIContainer()
 *   .register('storage', () => mockStorage)
 *   .register('agents', (c) => new AgentService(c.get('storage')))
 * ```
 */

type Factory<T> = (container: DIContainer) => T;
type ServiceMap = Record<string, unknown>;

export class DIContainer {
  private factories = new Map<string, Factory<unknown>>();
  private instances = new Map<string, unknown>();
  private disposers = new Map<string, () => void | Promise<void>>();

  /**
   * Register a service factory
   */
  register<K extends string, T>(
    key: K,
    factory: Factory<T>,
    options?: {
      singleton?: boolean;
      dispose?: (instance: T) => void | Promise<void>;
    },
  ): this {
    this.factories.set(key, factory);

    if (options?.dispose) {
      this.disposers.set(key, () => {
        const instance = this.instances.get(key);
        if (instance) {
          return options.dispose!(instance);
        }
      });
    }

    return this;
  }

  /**
   * Get a service instance
   */
  get<T>(key: string): T {
    // Return cached instance if exists
    if (this.instances.has(key)) {
      return this.instances.get(key);
    }

    const factory = this.factories.get(key);
    if (!factory) {
      throw new Error(`Service '${key}' not registered in container`);
    }

    // Create and cache instance
    const instance = factory(this);
    this.instances.set(key, instance);

    return instance;
  }

  /**
   * Check if service is registered
   */
  has(key: string): boolean {
    return this.factories.has(key);
  }

  /**
   * Dispose all services (call cleanup functions)
   */
  async dispose(): Promise<void> {
    const disposals = Array.from(this.disposers.values()).map((dispose) =>
      Promise.resolve(dispose()),
    );

    await Promise.all(disposals);

    this.instances.clear();
    this.factories.clear();
    this.disposers.clear();
  }

  /**
   * Create a child container (inherits parent services)
   */
  createChild(): DIContainer {
    const child = new DIContainer();
    child.factories = new Map(this.factories);
    return child;
  }
}

/**
 * Typed DI Container for ChisaCode services
 */
export interface ChisaCodeServices {
  storage: StorageService;
  websocket: WebSocketService;
  agents: AgentManagerService;
  relay: RelayService;
  mcp: MCPService;
}

export type ChisaCodeContainer = DIContainer & {
  get<K extends keyof ChisaCodeServices>(key: K): ChisaCodeServices[K];
};

/**
 * Example service interfaces (to be implemented)
 */
export interface StorageService {
  save(key: string, data: unknown): Promise<void>;
  load(key: string): Promise<unknown>;
  delete(key: string): Promise<void>;
}

export interface WebSocketMessage {
  type: string;
  payload?: unknown;
}

export interface WebSocketService {
  broadcast(message: WebSocketMessage): void;
  send(sessionId: string, message: WebSocketMessage): void;
}

export interface AgentConfig {
  provider: string;
  model?: string;
  prompt?: string;
}

export interface Agent {
  id: string;
  status: "idle" | "running" | "completed" | "error";
  createdAt: number;
}

export interface AgentManagerService {
  createAgent(config: AgentConfig): Promise<{ id: string }>;
  getAgent(id: string): Promise<Agent | null>;
  listAgents(): Promise<Agent[]>;
}

export interface RelayService {
  connect(endpoint: string): Promise<void>;
  disconnect(): Promise<void>;
}

export interface MCPToolHandler {
  (input: unknown): Promise<unknown>;
}

export interface MCPService {
  registerTool(name: string, handler: MCPToolHandler): void;
  callTool(name: string, input: unknown): Promise<unknown>;
}

/**
 * Helper: Create test container with mocks
 */
export function createTestContainer(mocks: Partial<ChisaCodeServices>): ChisaCodeContainer {
  const container = new DIContainer() as ChisaCodeContainer;

  // Register mocks
  Object.entries(mocks).forEach(([key, mock]) => {
    container.register(key, () => mock);
  });

  return container;
}
