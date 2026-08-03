import { resolve } from "node:path";
import { describe, expect, test, vi } from "vitest";

import { createTestLogger } from "../../test-utils/test-logger.js";
import type {
  AgentClient,
  AgentModelDefinition,
  AgentProvider,
  ListModelsOptions,
} from "./agent-sdk-types.js";
import { ProviderSnapshotManager, toErrorMessage } from "./provider-snapshot-manager.js";

const providerToolingMock = vi.hoisted(() => ({
  getProviderToolingDefinition: vi.fn((provider: string) => ({
    binary: provider,
    packageName: `${provider}-package`,
    installArgs: ["install", "-g", `${provider}-package@latest`],
  })),
  getProviderToolingInfo: vi.fn(async (provider: string) => ({
    packageName: `${provider}-package`,
    installedVersion: null,
    latestVersion: null,
    versionStatus: "not-installed" as const,
    checkedAt: "2026-06-10T00:00:00.000Z",
    installAvailable: true,
    updateAvailable: false,
  })),
  runProviderToolingAction: vi.fn(
    async (provider: string, action: "install" | "update" | "reinstall") => ({
      provider,
      action,
      exitCode: 0,
      stdout: "ok",
      stderr: "",
      success: true,
    }),
  ),
}));

vi.mock("./provider-tooling.js", () => providerToolingMock);

const TEST_CAPABILITIES = {
  supportsStreaming: false,
  supportsSessionPersistence: false,
  supportsDynamicModes: false,
  supportsMcpServers: false,
  supportsReasoningStream: false,
  supportsToolInvocations: false,
} as const;

// Builds an AgentClient that can be injected via the public extraClients option.
// extraClients is the only injection surface the manager exposes for tests.
function createExtraClient(
  provider: AgentProvider,
  overrides: Partial<AgentClient> = {},
): AgentClient {
  return {
    provider,
    capabilities: TEST_CAPABILITIES,
    async createSession() {
      throw new Error("not implemented");
    },
    async resumeSession() {
      throw new Error("not implemented");
    },
    async listModels(_options: ListModelsOptions) {
      return [] as AgentModelDefinition[];
    },
    async isAvailable() {
      return false;
    },
    ...overrides,
  } satisfies AgentClient;
}

describe("ProviderSnapshotManager public surface", () => {
  test("listRegisteredProviderIds includes the built-in providers", () => {
    const manager = new ProviderSnapshotManager({ logger: createTestLogger() });
    try {
      const ids = manager.listRegisteredProviderIds();
      expect(ids).toEqual(["claude", "codex", "opencode", "mimocode", "pi", "kimi", "grokbuild"]);
    } finally {
      manager.destroy();
    }
  });

  test("hasProvider includes custom providerOverrides additions", () => {
    const manager = new ProviderSnapshotManager({
      logger: createTestLogger(),
      providerOverrides: {
        "zai-claude": { extends: "claude", label: "ZAI", enabled: true },
      },
    });
    try {
      expect(manager.hasProvider("claude")).toBe(true);
      expect(manager.hasProvider("zai-claude")).toBe(true);
      expect(manager.hasProvider("not-a-provider" as AgentProvider)).toBe(false);
    } finally {
      manager.destroy();
    }
  });

  test("getProviderLabel returns built-in override labels only", () => {
    const manager = new ProviderSnapshotManager({
      logger: createTestLogger(),
      providerOverrides: {
        codex: { label: "Qwen Code", enabled: true },
      },
    });
    try {
      expect(manager.getProviderLabel("codex")).toBe("Qwen Code");
      expect(manager.getProviderLabel("claude")).toBe("Claude");
    } finally {
      manager.destroy();
    }
  });

  test("getSnapshot returns loading entries for built-in providers before warmup", () => {
    const manager = new ProviderSnapshotManager({ logger: createTestLogger() });
    try {
      const snapshot = manager.getSnapshot("/tmp/project");
      const claude = snapshot.find((entry) => entry.provider === "claude");
      expect(claude?.status).toBe("loading");
      expect(claude?.label).toBe("Claude");
      expect(claude?.defaultModeId).toBe("default");
    } finally {
      manager.destroy();
    }
  });

  test("providerOverrides with enabled:false marks the provider as unavailable without probing", async () => {
    const isAvailable = vi.fn(async () => true);
    const fetchModels = vi.fn(async () => [] as AgentModelDefinition[]);
    const manager = new ProviderSnapshotManager({
      logger: createTestLogger(),
      providerOverrides: {
        claude: { enabled: false },
        codex: { enabled: false },
        opencode: { enabled: false },
        mimocode: { enabled: false },
        pi: { enabled: false },
        kimi: { enabled: false },
        grokbuild: { enabled: false },
      },
      extraClients: {
        codex: createExtraClient("codex", { isAvailable, listModels: fetchModels }),
      },
    });
    try {
      const entries = await manager.listProviders({ cwd: "/tmp/project", wait: true });
      const codex = entries.find((entry) => entry.provider === "codex");
      expect(codex).toMatchObject({ provider: "codex", enabled: false, status: "unavailable" });
      expect(isAvailable).not.toHaveBeenCalled();
      expect(fetchModels).not.toHaveBeenCalled();
    } finally {
      manager.destroy();
    }
  });

  test("extraClients with isAvailable=false routes to unavailable without fetching", async () => {
    const isAvailable = vi.fn().mockResolvedValue(false);
    const manager = new ProviderSnapshotManager({
      logger: createTestLogger(),
      providerOverrides: {
        claude: { enabled: false },
        opencode: { enabled: false },
        mimocode: { enabled: false },
        pi: { enabled: false },
        kimi: { enabled: false },
        grokbuild: { enabled: false },
      },
      extraClients: { codex: createExtraClient("codex", { isAvailable }) },
    });
    try {
      const entry = await manager.getProvider({
        cwd: "/tmp/project",
        provider: "codex",
        wait: true,
      });
      expect(entry.provider).toBe("codex");
      expect(entry.status).toBe("unavailable");
      expect(isAvailable).toHaveBeenCalledTimes(1);
    } finally {
      manager.destroy();
    }
  });

  test("toErrorMessage preserves JSON-RPC object messages", () => {
    expect(toErrorMessage({ message: "Authentication required", code: -32000 })).toBe(
      "Authentication required",
    );
  });

  test("listProviders returns an entry per registered provider", async () => {
    const manager = new ProviderSnapshotManager({
      logger: createTestLogger(),
      providerOverrides: {
        claude: { enabled: false },
        codex: { enabled: false },
        opencode: { enabled: false },
        mimocode: { enabled: false },
        pi: { enabled: false },
        kimi: { enabled: false },
        grokbuild: { enabled: false },
      },
    });
    try {
      const entries = await manager.listProviders({ cwd: "/tmp/project", wait: true });
      const providers = entries.map((entry) => entry.provider).sort();
      expect(providers).toEqual([
        "claude",
        "codex",
        "grokbuild",
        "kimi",
        "mimocode",
        "opencode",
        "pi",
      ]);
      for (const entry of entries) {
        expect(entry.enabled).toBe(false);
        expect(entry.status).toBe("unavailable");
      }
    } finally {
      manager.destroy();
    }
  });

  test("getProvider throws when the provider is not configured", async () => {
    const manager = new ProviderSnapshotManager({
      logger: createTestLogger(),
      providerOverrides: { codex: { enabled: false } },
    });
    try {
      await expect(
        manager.getProvider({
          cwd: "/tmp/project",
          provider: "not-a-provider" as AgentProvider,
          wait: true,
        }),
      ).rejects.toThrow(/not configured/);
    } finally {
      manager.destroy();
    }
  });

  test("listModels rejects when the provider is disabled", async () => {
    const manager = new ProviderSnapshotManager({
      logger: createTestLogger(),
      providerOverrides: { codex: { enabled: false } },
    });
    try {
      await expect(
        manager.listModels({ cwd: "/tmp/project", provider: "codex", wait: true }),
      ).rejects.toThrow(/disabled/);
    } finally {
      manager.destroy();
    }
  });

  test("listModes rejects when the provider is disabled", async () => {
    const manager = new ProviderSnapshotManager({
      logger: createTestLogger(),
      providerOverrides: { codex: { enabled: false } },
    });
    try {
      await expect(
        manager.listModes({ cwd: "/tmp/project", provider: "codex", wait: true }),
      ).rejects.toThrow(/disabled/);
    } finally {
      manager.destroy();
    }
  });

  test("resolveDefaultModel returns the requested model verbatim when provided", async () => {
    const manager = new ProviderSnapshotManager({
      logger: createTestLogger(),
      providerOverrides: { codex: { enabled: false } },
    });
    try {
      const id = await manager.resolveDefaultModel({
        provider: "codex",
        requestedModel: "gpt-5.4",
        cwd: "/tmp/project",
      });
      expect(id).toBe("gpt-5.4");
    } finally {
      manager.destroy();
    }
  });

  test("resolveDefaultModel returns undefined when the provider is disabled and no override is given", async () => {
    const manager = new ProviderSnapshotManager({
      logger: createTestLogger(),
      providerOverrides: { codex: { enabled: false } },
    });
    try {
      const id = await manager.resolveDefaultModel({ provider: "codex", cwd: "/tmp/project" });
      expect(id).toBeUndefined();
    } finally {
      manager.destroy();
    }
  });

  test("getProviderDiagnostic returns the diagnostic from the injected client", async () => {
    const getDiagnostic = vi.fn(async () => ({ diagnostic: "codex is ready" }));
    const client = createExtraClient("codex", { getDiagnostic });
    const manager = new ProviderSnapshotManager({
      logger: createTestLogger(),
      extraClients: { codex: client },
    });
    try {
      const result = await manager.getProviderDiagnostic("codex");
      expect(result.provider).toBe("codex");
      expect(result.diagnostic).toContain("Provider: Codex");
      expect(result.diagnostic).toContain("codex is ready");
      expect(result.details.mcpInjection.supported).toBe(false);
      expect(getDiagnostic).toHaveBeenCalledTimes(1);
    } finally {
      manager.destroy();
    }
  }, 15_000);

  test("getProviderDiagnostic falls back to a default message when the client has no getDiagnostic", async () => {
    const manager = new ProviderSnapshotManager({
      logger: createTestLogger(),
      extraClients: { codex: createExtraClient("codex", { getDiagnostic: undefined }) },
    });
    try {
      const result = await manager.getProviderDiagnostic("codex");
      expect(result.provider).toBe("codex");
      expect(result.diagnostic).toMatch(/no provider-specific diagnostic/i);
      expect(result.details.env.some((entry) => entry.name === "OPENAI_API_KEY")).toBe(true);
    } finally {
      manager.destroy();
    }
  }, 15_000);

  test("getProviderDiagnostic throws when the provider is not configured", async () => {
    const manager = new ProviderSnapshotManager({ logger: createTestLogger() });
    try {
      await expect(
        manager.getProviderDiagnostic("not-a-provider" as AgentProvider),
      ).rejects.toThrow(/not configured/);
    } finally {
      manager.destroy();
    }
  });

  test("getProviderDiagnostic redacts provider env values and explains MCP injection", async () => {
    const manager = new ProviderSnapshotManager({
      logger: createTestLogger(),
      providerOverrides: {
        codex: {
          env: {
            OPENAI_API_KEY: "secret-key",
            OPENAI_BASE_URL: "https://example.test",
          },
          command: ["provider-cli", "--api-key", "command-secret", "--mode", "safe"],
        },
      },
      extraClients: {
        codex: createExtraClient("codex", {
          capabilities: { ...TEST_CAPABILITIES, supportsMcpServers: true },
          getDiagnostic: async () => ({ diagnostic: "provider ok" }),
        }),
      },
    });
    manager.setMcpInjectionState({ enabled: true, baseUrl: "http://127.0.0.1:6767/mcp/agents" });
    try {
      const result = await manager.getProviderDiagnostic("codex");
      expect(result.details.env).toEqual(
        expect.arrayContaining([
          { name: "OPENAI_API_KEY", present: true, source: "provider-config" },
          { name: "OPENAI_BASE_URL", present: true, source: "provider-config" },
        ]),
      );
      expect(result.diagnostic).toContain("OPENAI_API_KEY=present");
      expect(result.diagnostic).not.toContain("secret-key");
      expect(result.diagnostic).not.toContain("https://example.test");
      expect(result.details.effectiveCommand?.argv).toEqual([
        "provider-cli",
        "--api-key",
        "[redacted]",
        "--mode",
        "safe",
      ]);
      expect(result.diagnostic).not.toContain("command-secret");
      expect(result.details.mcpInjection).toMatchObject({ supported: true, enabled: true });
    } finally {
      manager.destroy();
    }
  });

  test("getAgentManagerProviderState exposes extraClients verbatim", () => {
    const codexClient = createExtraClient("codex");
    const claudeClient = createExtraClient("claude");
    const manager = new ProviderSnapshotManager({
      logger: createTestLogger(),
      providerOverrides: { opencode: { enabled: false }, copilot: { enabled: false } },
      extraClients: { codex: codexClient, claude: claudeClient },
    });
    try {
      const state = manager.getAgentManagerProviderState();
      expect(state.clients.codex).toBe(codexClient);
      expect(state.clients.claude).toBe(claudeClient);
      expect(state.providerDefinitions.opencode).toMatchObject({ enabled: false });
      expect(state.providerDefinitions.codex).toMatchObject({ enabled: true });
    } finally {
      manager.destroy();
    }
  });
});

describe("ProviderSnapshotManager applyMutableProviderConfig", () => {
  test("applyMutableProviderConfig includes custom provider additions", async () => {
    const manager = new ProviderSnapshotManager({
      logger: createTestLogger(),
      providerOverrides: {
        claude: { enabled: false },
        codex: { enabled: false },
        opencode: { enabled: false },
        mimocode: { enabled: false },
        pi: { enabled: false },
        kimi: { enabled: false },
        grokbuild: { enabled: false },
      },
    });
    try {
      expect(manager.hasProvider("zai-claude" as AgentProvider)).toBe(false);

      const state = manager.applyMutableProviderConfig({
        "zai-claude": { extends: "claude", label: "ZAI", enabled: true },
      });

      expect(manager.hasProvider("zai-claude" as AgentProvider)).toBe(true);
      expect(state.providerDefinitions["zai-claude" as AgentProvider]).toMatchObject({
        enabled: true,
        derivedFromProviderId: "claude",
      });
      expect(manager.listRegisteredProviderIds()).toContain("zai-claude" as AgentProvider);
    } finally {
      manager.destroy();
    }
  });

  test("drops disabled built-in providers from clients while preserving providerDefinitions", () => {
    const manager = new ProviderSnapshotManager({
      logger: createTestLogger(),
      providerOverrides: {
        claude: { enabled: true },
        codex: { enabled: true },
        opencode: { enabled: false },
        mimocode: { enabled: false },
        pi: { enabled: false },
        kimi: { enabled: false },
        grokbuild: { enabled: false },
      },
    });
    try {
      const before = manager.getAgentManagerProviderState();
      expect(before.providerDefinitions.kimi).toMatchObject({ enabled: false });
      expect(before.clients.kimi).toBeUndefined();

      const state = manager.applyMutableProviderConfig({ codex: { enabled: false } });
      expect(state.providerDefinitions.codex).toMatchObject({ enabled: false });
      expect(state.clients.codex).toBeUndefined();
      expect(state.providerDefinitions.kimi).toMatchObject({ enabled: false });
      expect(state.clients.kimi).toBeUndefined();
    } finally {
      manager.destroy();
    }
  });

  test("fires a change event on every primed snapshot cwd after applyMutableProviderConfig", () => {
    const manager = new ProviderSnapshotManager({
      logger: createTestLogger(),
      providerOverrides: {
        claude: { enabled: false },
        codex: { enabled: false },
        opencode: { enabled: false },
        mimocode: { enabled: false },
        pi: { enabled: false },
        kimi: { enabled: false },
        grokbuild: { enabled: false },
      },
    });
    try {
      const listener = vi.fn();
      manager.on("change", listener);

      // Prime two distinct cwd snapshots. resolve() makes the keys platform-
      // native so Windows ("D:\\tmp\\...") matches the assertion below.
      const cwdA = resolve("/tmp/project-a");
      const cwdB = resolve("/tmp/project-b");
      manager.getSnapshot(cwdA);
      manager.getSnapshot(cwdB);

      listener.mockClear();
      manager.applyMutableProviderConfig({
        kimi: { enabled: true },
      });

      const cwds = listener.mock.calls.map((call) => call[1]).sort();
      expect(cwds).toEqual([cwdA, cwdB].sort());
    } finally {
      manager.destroy();
    }
  });
});

describe("ProviderSnapshotManager lifecycle", () => {
  test("on/off attaches and detaches change listeners", () => {
    const manager = new ProviderSnapshotManager({
      logger: createTestLogger(),
      providerOverrides: {
        claude: { enabled: false },
        codex: { enabled: false },
        opencode: { enabled: false },
        mimocode: { enabled: false },
        pi: { enabled: false },
        kimi: { enabled: false },
        grokbuild: { enabled: false },
      },
    });
    try {
      const listener = vi.fn();
      manager.on("change", listener);
      manager.getSnapshot("/tmp/project");
      manager.applyMutableProviderConfig({});
      const firstCallCount = listener.mock.calls.length;
      expect(firstCallCount).toBeGreaterThan(0);

      manager.off("change", listener);
      manager.applyMutableProviderConfig({});
      expect(listener.mock.calls.length).toBe(firstCallCount);
    } finally {
      manager.destroy();
    }
  });

  test("destroy clears snapshots and prevents further change emissions", () => {
    const manager = new ProviderSnapshotManager({
      logger: createTestLogger(),
      providerOverrides: {
        claude: { enabled: false },
        codex: { enabled: false },
        opencode: { enabled: false },
        mimocode: { enabled: false },
        pi: { enabled: false },
        kimi: { enabled: false },
        grokbuild: { enabled: false },
      },
    });
    const listener = vi.fn();
    manager.on("change", listener);
    manager.getSnapshot("/tmp/project");
    manager.destroy();

    listener.mockClear();
    manager.applyMutableProviderConfig({});
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("ProviderSnapshotManager cwd routing", () => {
  test("different cwd keys produce independent snapshots", () => {
    const manager = new ProviderSnapshotManager({
      logger: createTestLogger(),
      providerOverrides: {
        claude: { enabled: false },
        codex: { enabled: false },
        opencode: { enabled: false },
        mimocode: { enabled: false },
        pi: { enabled: false },
        kimi: { enabled: false },
        grokbuild: { enabled: false },
      },
    });
    try {
      const a = manager.getSnapshot("/tmp/project-a");
      const b = manager.getSnapshot("/tmp/project-b");
      expect(a).not.toBe(b);
      expect(a.map((entry) => entry.provider).sort()).toEqual(
        b.map((entry) => entry.provider).sort(),
      );
    } finally {
      manager.destroy();
    }
  });

  test("getSnapshot called with no cwd resolves to the home snapshot key", () => {
    const manager = new ProviderSnapshotManager({
      logger: createTestLogger(),
      providerOverrides: {
        claude: { enabled: false },
        codex: { enabled: false },
        opencode: { enabled: false },
        mimocode: { enabled: false },
        pi: { enabled: false },
        kimi: { enabled: false },
        grokbuild: { enabled: false },
      },
    });
    try {
      const listener = vi.fn();
      manager.on("change", listener);
      manager.getSnapshot();
      manager.applyMutableProviderConfig({});
      const cwds = listener.mock.calls.map((call) => call[1]);
      // applyMutableProviderConfig emits change for each primed cwd; the home
      // snapshot must be present.
      expect(cwds.length).toBeGreaterThanOrEqual(1);
      for (const cwd of cwds) {
        expect(typeof cwd).toBe("string");
        expect(cwd.length).toBeGreaterThan(0);
      }
    } finally {
      manager.destroy();
    }
  });
});
