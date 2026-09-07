/**
 * DI Container usage examples and tests
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DIContainer, createTestContainer } from "./di-container";

/**
 * Example: Simple services with DI
 */
class DatabaseService {
  constructor(private connectionString: string) {}

  async query(sql: string): Promise<any[]> {
    // Simulate query
    return [];
  }

  close() {
    console.log("Database connection closed");
  }
}

class UserRepository {
  constructor(private db: DatabaseService) {}

  async findUser(id: string) {
    return this.db.query(`SELECT * FROM users WHERE id = '${id}'`);
  }
}

class UserService {
  constructor(private repo: UserRepository) {}

  async getUser(id: string) {
    return this.repo.findUser(id);
  }
}

describe("DIContainer", () => {
  let container: DIContainer;

  beforeEach(() => {
    container = new DIContainer();
  });

  afterEach(async () => {
    await container.dispose();
  });

  it("should register and resolve services", () => {
    container
      .register("db", () => new DatabaseService("postgres://localhost"))
      .register("userRepo", (c) => new UserRepository(c.get("db")))
      .register("userService", (c) => new UserService(c.get("userRepo")));

    const userService = container.get("userService");
    expect(userService).toBeInstanceOf(UserService);
  });

  it("should cache singleton instances", () => {
    container.register("db", () => new DatabaseService("postgres://localhost"));

    const db1 = container.get("db");
    const db2 = container.get("db");

    expect(db1).toBe(db2); // Same instance
  });

  it("should throw on missing service", () => {
    expect(() => container.get("nonexistent")).toThrow("Service 'nonexistent' not registered");
  });

  it("should call dispose functions", async () => {
    let disposed = false;

    container.register("db", () => new DatabaseService("postgres://localhost"), {
      dispose: (db) => {
        db.close();
        disposed = true;
      },
    });

    // Trigger instance creation
    container.get("db");

    await container.dispose();

    expect(disposed).toBe(true);
  });

  it("should create child container with inherited services", () => {
    container.register("db", () => new DatabaseService("postgres://localhost"));

    const child = container.createChild();
    child.register("userRepo", (c) => new UserRepository(c.get("db")));

    const db = child.get("db");
    expect(db).toBeInstanceOf(DatabaseService);
  });
});

/**
 * Example: Testing with mock dependencies
 */
describe("UserService with mocks", () => {
  it("should work with mock database", async () => {
    // Create mock
    const mockDb = {
      query: async (sql: string) => [{ id: "123", name: "Alice" }],
      close: () => {},
    } as DatabaseService;

    // Setup container with mock
    const container = new DIContainer()
      .register("db", () => mockDb)
      .register("userRepo", (c) => new UserRepository(c.get("db")))
      .register("userService", (c) => new UserService(c.get("userRepo")));

    const userService = container.get<UserService>("userService");
    const user = await userService.getUser("123");

    expect(user).toEqual([{ id: "123", name: "Alice" }]);
  });
});

/**
 * Example: Agent manager with DI (real ChisaCode use case)
 */
class MockStorageService {
  private data = new Map<string, any>();

  async save(key: string, data: any) {
    this.data.set(key, data);
  }

  async load(key: string) {
    return this.data.get(key);
  }

  async delete(key: string) {
    this.data.delete(key);
  }
}

class MockWebSocketService {
  sentMessages: any[] = [];

  broadcast(message: any) {
    this.sentMessages.push({ type: "broadcast", message });
  }

  send(sessionId: string, message: any) {
    this.sentMessages.push({ type: "send", sessionId, message });
  }
}

class AgentManager {
  constructor(
    private storage: MockStorageService,
    private websocket: MockWebSocketService,
  ) {}

  async createAgent(config: { prompt: string }) {
    const agent = {
      id: "agent-123",
      status: "idle",
      prompt: config.prompt,
    };

    await this.storage.save(agent.id, agent);
    this.websocket.broadcast({ type: "agent_created", agent });

    return agent;
  }

  async getAgent(id: string) {
    return this.storage.load(id);
  }
}

describe("AgentManager with DI", () => {
  it("should create agent and broadcast", async () => {
    const mockStorage = new MockStorageService();
    const mockWebSocket = new MockWebSocketService();

    const container = new DIContainer()
      .register("storage", () => mockStorage)
      .register("websocket", () => mockWebSocket)
      .register("agents", (c) => new AgentManager(c.get("storage"), c.get("websocket")));

    const agentManager = container.get<AgentManager>("agents");
    const agent = await agentManager.createAgent({ prompt: "test" });

    expect(agent.id).toBe("agent-123");

    // Verify storage was called
    const stored = await agentManager.getAgent("agent-123");
    expect(stored).toEqual(agent);

    // Verify websocket was called
    expect(mockWebSocket.sentMessages).toHaveLength(1);
    expect(mockWebSocket.sentMessages[0]).toMatchObject({
      type: "broadcast",
      message: { type: "agent_created" },
    });
  });
});

/**
 * Example: Using createTestContainer helper
 */
describe("createTestContainer helper", () => {
  it("should create container with mocks easily", () => {
    const mockStorage = new MockStorageService();
    const mockWebSocket = new MockWebSocketService();

    const container = createTestContainer({
      storage: mockStorage,
      websocket: mockWebSocket,
    });

    expect(container.get("storage")).toBe(mockStorage);
    expect(container.get("websocket")).toBe(mockWebSocket);
  });
});
