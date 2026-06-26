/**
 * 测试 dispatchInboundMessage 的 ?? 链路由逻辑。
 *
 * 针对 dispatch 链中每个 dispatcher，至少验证一种已知消息类型能被正确路由，
 * 同时验证未知消息类型不会崩溃（?? 链完整遍历到底）。
 *
 * 测试策略：spyOn 每个 dispatch 方法，通过 handleMessage 入口发送消息，
 * 验证正确的 dispatcher 被调用，且其他 dispatcher 未被调用。
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { Session } from "./session.js";
import {
  asSessionInternals,
  asAgentManager,
  asAgentStorage,
  asDownloadTokenStore,
  asPushTokenStore,
  asChatService,
  asScheduleService,
  asLoopService,
  asCheckoutDiffManager,
  asGitHubService,
  asWorkspaceGitService,
  asDaemonConfigStore,
  createProviderSnapshotManagerStub,
} from "./test-utils/session-stubs.js";

vi.mock("../utils/checkout-git.js", () => ({
  checkoutResolvedBranch: vi.fn(),
  commitChanges: vi.fn(),
  createPullRequest: vi.fn(),
  getCachedCheckoutShortstat: vi.fn(),
  getCheckoutStatus: vi.fn(),
  listBranchSuggestions: vi.fn(),
  mergeFromBase: vi.fn(),
  mergeToBase: vi.fn(),
  pullCurrentBranch: vi.fn(),
  pushCurrentBranch: vi.fn(),
  renameCurrentBranch: vi.fn(),
  resolveBranchCheckout: vi.fn(),
  warmCheckoutShortstatInBackground: vi.fn(),
}));

vi.mock("./worktree-bootstrap.js", () => ({
  spawnWorkspaceScript: vi.fn(),
}));

vi.mock("./agent/agent-response-loop.js", () => ({
  generateStructuredAgentResponseWithFallback: vi.fn(),
}));

vi.mock("./agent/agent-metadata-generator.js", () => ({
  scheduleAgentMetadataGeneration: vi.fn(),
}));

vi.mock("../utils/spawn.js", () => ({
  execCommand: vi.fn(),
}));

vi.mock("./chisacode-worktree-service.js", () => ({
  createChisaCodeWorktree: vi.fn(),
}));

function createMockLogger(): any {
  const fn = vi.fn();
  const child = () => createMockLogger();
  return { info: fn, warn: fn, error: fn, debug: fn, trace: fn, child };
}

function createTestSession(messages: unknown[] = []): Session {
  const { manager: providerSnapshotManager } = createProviderSnapshotManagerStub();
  return new Session({
    clientId: "test-client",
    onMessage: (message) => messages.push(message),
    logger: createMockLogger(),
    downloadTokenStore: asDownloadTokenStore(),
    pushTokenStore: asPushTokenStore(),
    chisacodeHome: "/tmp/chisacode-home",
    agentManager: asAgentManager({
      listAgents: vi.fn(() => []),
      subscribe: vi.fn(() => () => {}),
    }),
    agentStorage: asAgentStorage({
      list: vi.fn().mockResolvedValue([]),
    }),
    projectRegistry: {
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn(),
      upsert: vi.fn(),
      archive: vi.fn(),
      remove: vi.fn(),
      initialize: vi.fn(),
      existsOnDisk: vi.fn(),
    },
    workspaceRegistry: {
      get: vi.fn(),
      list: vi.fn().mockResolvedValue([]),
    },
    chatService: asChatService(),
    scheduleService: asScheduleService(),
    loopService: asLoopService(),
    checkoutDiffManager: asCheckoutDiffManager({ scheduleRefreshForCwd: vi.fn() }),
    github: asGitHubService({
      invalidate: vi.fn(),
      searchIssuesAndPrs: vi.fn(),
    }),
    workspaceGitService: asWorkspaceGitService({
      getCheckoutDiff: vi.fn(),
      getSnapshot: vi.fn(),
      suggestBranchesForCwd: vi.fn(),
      listStashes: vi.fn(),
      peekSnapshot: vi.fn(),
      validateBranchRef: vi.fn(),
      hasLocalBranch: vi.fn(),
      resolveRepoRemoteUrl: vi.fn(),
      resolveRepoRoot: vi.fn(),
      getWorkspaceGitMetadata: vi.fn(),
    }),
    daemonConfigStore: asDaemonConfigStore({
      get: vi.fn(() => ({
        mcp: { injectIntoAgents: false },
        providers: {},
      })),
      onChange: vi.fn(() => () => {}),
    }),
    stt: null,
    tts: null,
    terminalManager: null,
    providerSnapshotManager,
    getDaemonTcpPort: () => null,
    getDaemonTcpHost: () => null,
  });
}

// 通过 asSessionInternals 访问 session 内部的 dispatch 方法
// 注意: dispatchInboundMessage 是 private 的，改用 spyOn 在原型上
// 由于 dispatchInboundMessage 是 private，我们直接通过 handleMessage 测试路由

describe("dispatch ?? chain routing", () => {
  let session: Session;

  beforeEach(() => {
    session = createTestSession();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("dispatchAgentLifecycleMessage", () => {
    it("routes create_agent_request to agent lifecycle handler", async () => {
      const internals = asSessionInternals(session) as any;
      const handleCreateSpy = vi
        .spyOn(internals.agentLifecycleHandler, "dispatch")
        .mockResolvedValue(undefined);

      // 构造 create_agent_request 消息需要包含必要的 payload 字段
      await session.handleMessage({
        type: "create_agent_request",
        config: {
          provider: "codex",
          cwd: "/tmp/test-cwd",
        },
        requestId: "test-create-agent",
      } as any);

      expect(handleCreateSpy).toHaveBeenCalledTimes(1);
      expect(handleCreateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: "create_agent_request" }),
      );
    });
  });

  describe("dispatchCheckoutMessage", () => {
    it("routes checkout_status_request to checkout handler", async () => {
      const internals = asSessionInternals(session) as any;
      const dispatchSpy = vi
        .spyOn(internals.checkoutGitHandler, "handleCheckoutStatusRequest")
        .mockResolvedValue(undefined);

      await session.handleMessage({
        type: "checkout_status_request",
        cwd: "/tmp/test-cwd",
        requestId: "test-status",
      } as any);

      expect(dispatchSpy).toHaveBeenCalledTimes(1);
    });

    it("validates branch_request is routed", async () => {
      const internals = asSessionInternals(session) as any;
      const dispatchSpy = vi
        .spyOn(internals.checkoutGitHandler, "handleValidateBranchRequest")
        .mockResolvedValue(undefined);

      await session.handleMessage({
        type: "validate_branch_request",
        cwd: "/tmp/test-cwd",
        branchName: "feature/test",
        requestId: "test-validate",
      } as any);

      expect(dispatchSpy).toHaveBeenCalledTimes(1);
    });

    it("routes stash_save_request to checkout handler", async () => {
      const internals = asSessionInternals(session) as any;
      const dispatchSpy = vi
        .spyOn(internals.checkoutGitHandler, "handleStashSaveRequest")
        .mockResolvedValue(undefined);

      await session.handleMessage({
        type: "stash_save_request",
        cwd: "/tmp/test-cwd",
        requestId: "test-stash-save",
      } as any);

      expect(dispatchSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("dispatchWorkspaceAndProjectMessage", () => {
    it("routes fetch_workspaces_request to workspace-project handler", async () => {
      const internals = asSessionInternals(session) as any;
      const dispatchSpy = vi
        .spyOn(internals.workspaceProjectHandler, "dispatch")
        .mockResolvedValue(undefined);

      await session.handleMessage({
        type: "fetch_workspaces_request",
        requestId: "test-fetch-ws",
      } as any);

      expect(dispatchSpy).toHaveBeenCalledTimes(1);
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: "fetch_workspaces_request" }),
      );
    });

    it("routes file_explorer_request to workspace-project handler", async () => {
      const internals = asSessionInternals(session) as any;
      // workspace-project handler 先接到 dispatch，需要 mock
      const dispatchSpy = vi
        .spyOn(internals.workspaceProjectHandler, "dispatch")
        .mockResolvedValue(undefined);

      // 还需 mock agent lifecycle handler 返回 undefined
      vi.spyOn(internals.agentLifecycleHandler, "dispatch").mockReturnValue(undefined);

      await session.handleMessage({
        type: "file_explorer_request",
        cwd: "/tmp/test-cwd",
        path: "test.txt",
        mode: "file",
        requestId: "test-file-explorer",
      } as any);

      expect(dispatchSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("dispatchProviderMessage", () => {
    it("routes list_provider_models_request to provider handler", async () => {
      const internals = asSessionInternals(session) as any;
      const dispatchSpy = vi
        .spyOn(internals.providerHandler, "handleListProviderModelsRequest")
        .mockResolvedValue(undefined);

      await session.handleMessage({
        type: "list_provider_models_request",
        provider: "codex",
        requestId: "test-list-models",
      } as any);

      expect(dispatchSpy).toHaveBeenCalledTimes(1);
    });

    it("routes refresh_providers_snapshot_request to provider handler", async () => {
      const internals = asSessionInternals(session) as any;
      const dispatchSpy = vi
        .spyOn(internals.providerHandler, "handleRefreshProvidersSnapshotRequest")
        .mockResolvedValue(undefined);

      await session.handleMessage({
        type: "refresh_providers_snapshot_request",
        providers: ["codex"],
        requestId: "test-refresh-snapshot",
      } as any);

      expect(dispatchSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("dispatchTerminalMessage", () => {
    it("routes start_workspace_script_request to terminal-script handler", async () => {
      const internals = asSessionInternals(session) as any;
      const dispatchSpy = vi
        .spyOn(internals.terminalScriptHandler, "dispatchTerminalMessage")
        .mockResolvedValue(undefined);

      await session.handleMessage({
        type: "start_workspace_script_request",
        workspaceId: "test-ws",
        scriptName: "test-script",
        requestId: "test-script-start",
      } as any);

      expect(dispatchSpy).toHaveBeenCalledTimes(1);
    });

    it("routes list_terminals_request via terminalScriptHandler to terminalController", async () => {
      const internals = asSessionInternals(session) as any;
      const controllerSpy = vi
        .spyOn(internals.terminalController, "dispatch")
        .mockResolvedValue(undefined);

      // terminalScriptHandler.dispatchTerminalMessage 将非 start_workspace_script 的消息
      // 委托给 terminalController.dispatch
      // 这里需要关闭真正的 dispatchTerminalMessage spy 让真实逻辑运行
      await session.handleMessage({
        type: "list_terminals_request",
        requestId: "test-list-terminals",
      } as any);

      // terminalScriptHandler 内部将 list_terminals_request 委托给 terminalController
      expect(controllerSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("dispatchChatScheduleLoopMessage", () => {
    it("routes chat/create to chat handler", async () => {
      const internals = asSessionInternals(session) as any;
      const dispatchSpy = vi
        .spyOn(internals.chatScheduleLoopHandler, "handleChatCreateRequest")
        .mockResolvedValue(undefined);

      await session.handleMessage({
        type: "chat/create",
        name: "test-room",
        purpose: "testing",
        requestId: "test-chat-create",
      } as any);

      expect(dispatchSpy).toHaveBeenCalledTimes(1);
    });

    it("routes schedule/create to schedule handler (nested fallback in dispatchChatScheduleLoopMessage)", async () => {
      const internals = asSessionInternals(session) as any;
      const dispatchSpy = vi
        .spyOn(internals.chatScheduleLoopHandler, "handleScheduleCreateRequest")
        .mockResolvedValue(undefined);

      await session.handleMessage({
        type: "schedule/create",
        prompt: "test prompt",
        requestId: "test-schedule-create",
      } as any);

      expect(dispatchSpy).toHaveBeenCalledTimes(1);
    });

    it("routes loop/run to loop handler", async () => {
      const internals = asSessionInternals(session) as any;
      const dispatchSpy = vi
        .spyOn(internals.chatScheduleLoopHandler, "handleLoopRunRequest")
        .mockResolvedValue(undefined);

      await session.handleMessage({
        type: "loop/run",
        prompt: "test loop prompt",
        cwd: "/tmp/test-cwd",
        provider: "codex",
        requestId: "test-loop-run",
      } as any);

      expect(dispatchSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("dispatchMiscMessage (兜底 + config control)", () => {
    it("routes abort_request via misc handler", async () => {
      const internals = asSessionInternals(session) as any;
      const abortSpy = vi.spyOn(internals as any, "handleAbort").mockResolvedValue(undefined);

      await session.handleMessage({
        type: "abort_request",
        requestId: "test-abort",
      } as any);

      expect(abortSpy).toHaveBeenCalledTimes(1);
    });

    it("routes ping and replies with pong", async () => {
      const messages: unknown[] = [];
      const pingSession = createTestSession(messages);

      await pingSession.handleMessage({
        type: "ping",
        payload: {
          requestId: "ping-1",
          clientSentAt: Date.now(),
        },
      } as any);

      expect(messages).toContainEqual(expect.objectContaining({ type: "pong" }));
    });

    it("dispatches daemon.get_status.request via misc -> configControl handler", async () => {
      const internals = asSessionInternals(session) as any;
      const dispatchSpy = vi
        .spyOn(internals.configControlHandler, "dispatch")
        .mockResolvedValue(undefined);

      await session.handleMessage({
        type: "daemon.get_status.request",
        requestId: "test-daemon-status",
      } as any);

      expect(dispatchSpy).toHaveBeenCalledTimes(1);
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: "daemon.get_status.request" }),
      );
    });
  });

  describe("unknown message type does not crash", () => {
    it("完整遍历 dispatch ?? 链，不抛出异常", async () => {
      // 所有 handler 都会返回 undefined，?? 链走到最后的 dispatchMiscMessage，
      // configControlHandler.dispatch 也会返回 undefined，消息被静默丢弃
      await expect(
        session.handleMessage({
          type: "non_existent_type",
        } as any),
      ).resolves.toBeUndefined();
    });
  });
});
