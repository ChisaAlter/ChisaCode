import { afterEach, describe, expect, it, vi } from "vitest";
import type { DaemonTransport } from "./daemon-client-transport.js";

import { DaemonConnectionController } from "./daemon-client-connection-controller.js";

function createTransportHarness() {
  const sent: Array<string | Uint8Array | ArrayBuffer> = [];
  let openHandler: () => void = () => {};
  let closeHandler: (event?: unknown) => void = () => {};
  let errorHandler: (event?: unknown) => void = () => {};
  let messageHandler: (data: unknown) => void = () => {};
  const close = vi.fn();
  const transport: DaemonTransport = {
    send: (data) => sent.push(data),
    close,
    onOpen: (handler) => {
      openHandler = handler;
      return () => {};
    },
    onClose: (handler) => {
      closeHandler = handler;
      return () => {};
    },
    onError: (handler) => {
      errorHandler = handler;
      return () => {};
    },
    onMessage: (handler) => {
      messageHandler = handler;
      return () => {};
    },
  };
  return {
    transport,
    sent,
    close,
    open: () => openHandler(),
    closeEvent: (event?: unknown) => closeHandler(event),
    error: (event?: unknown) => errorHandler(event),
    message: (data: unknown) => messageHandler(data),
  };
}

function createController(options?: { connectTimeoutMs?: number; reconnectEnabled?: boolean }) {
  const transport = createTransportHarness();
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const callbacks = { onMessage: vi.fn(), onConnected: vi.fn(), onReset: vi.fn() };
  const factory = vi.fn(() => transport.transport);
  const controller = new DaemonConnectionController(
    {
      url: "ws://test",
      clientId: "client-1",
      connectTimeoutMs: options?.connectTimeoutMs,
      reconnect: { enabled: options?.reconnectEnabled ?? false },
      transportFactory: factory,
    },
    logger,
    callbacks,
  );
  return { controller, transport, logger, callbacks, factory };
}

async function connectController(harness: ReturnType<typeof createController>): Promise<void> {
  const pending = harness.controller.connect();
  harness.transport.open();
  harness.controller.markConnected();
  await pending;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("DaemonConnectionController", () => {
  it("owns hello handshake, connection state, and strict session sends", async () => {
    const harness = createController();
    const states: string[] = [];
    const unsubscribe = harness.controller.subscribe((state) => states.push(state.status));

    const pending = harness.controller.connect();
    expect(harness.controller.getState()).toEqual({ status: "connecting", attempt: 0 });
    harness.transport.open();
    expect(JSON.parse(String(harness.transport.sent[0]))).toMatchObject({
      type: "hello",
      clientId: "client-1",
      capabilities: { generative_ui: true },
    });

    harness.controller.markConnected();
    await expect(pending).resolves.toBeUndefined();
    expect(harness.callbacks.onConnected).toHaveBeenCalledOnce();
    harness.controller.sendSessionMessageStrict({ type: "abort_request" });
    expect(JSON.parse(String(harness.transport.sent[1]))).toEqual({
      type: "session",
      message: { type: "abort_request" },
    });
    expect(states).toEqual(["idle", "connecting", "connected"]);

    unsubscribe();
    await harness.controller.close();
  });

  it("rejects a timed-out connect and emits one reset boundary", async () => {
    vi.useFakeTimers();
    const harness = createController({ connectTimeoutMs: 100 });
    const pending = harness.controller.connect();
    const rejection = expect(pending).rejects.toThrow("Connection timed out");

    await vi.advanceTimersByTimeAsync(100);
    await rejection;
    expect(harness.controller.getState()).toEqual({
      status: "disconnected",
      reason: "Connection timed out",
    });
    expect(harness.callbacks.onReset).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Connection timed out" }),
      false,
    );
    expect(harness.transport.close).toHaveBeenCalledWith(1_001, "Connection timed out");
    await harness.controller.close();
  });

  it("reconnects only after two consecutive liveness timeouts; inbound activity resets the counter", async () => {
    vi.useFakeTimers();
    const harness = createController();
    await connectController(harness);

    const failOnce = async () => {
      const probe = harness.controller.checkLiveness({ timeoutMs: 10 });
      const rejection = expect(probe).rejects.toThrow("Liveness check timed out");
      await vi.advanceTimersByTimeAsync(10);
      await rejection;
    };

    // One timeout is tolerated — the connection must stay up.
    await failOnce();
    expect(harness.controller.getState().status).toBe("connected");
    expect(harness.transport.close).not.toHaveBeenCalled();

    // Inbound activity clears the failure streak, so the next single timeout
    // is again tolerated.
    harness.controller.recordInboundActivity();
    await failOnce();
    expect(harness.controller.getState().status).toBe("connected");

    // A second consecutive timeout crosses the threshold and tears down the
    // transport with the liveness reason.
    await failOnce();
    expect(harness.controller.getState()).toMatchObject({
      status: "disconnected",
      reason: expect.stringContaining("Liveness check timed out"),
    });
    expect(harness.transport.close).toHaveBeenCalledWith(1_001, "Liveness check timed out");
    await harness.controller.close();
  });

  it("debounces a bare transport error and emits a single reset when close follows within the window", async () => {
    vi.useFakeTimers();
    const harness = createController();
    await connectController(harness);
    const transitions: string[] = [];
    const unsubscribe = harness.controller.subscribe((state) => transitions.push(state.status));
    transitions.length = 0;

    // A generic error carries no diagnostic value; the controller must hold it
    // for 250ms in case a descriptive close event follows.
    harness.transport.error({});
    expect(harness.controller.getState().status).toBe("connected");
    expect(harness.callbacks.onReset).not.toHaveBeenCalled();

    // The close arrives inside the debounce window: exactly one reset and one
    // disconnected transition, not two.
    harness.transport.closeEvent({ code: 1006, reason: "descriptive close" });
    expect(harness.callbacks.onReset).toHaveBeenCalledTimes(1);
    expect(transitions).toEqual(["disconnected"]);

    // The pending generic-error timer was cancelled — advancing past the
    // window produces no second reset.
    await vi.advanceTimersByTimeAsync(300);
    expect(harness.callbacks.onReset).toHaveBeenCalledTimes(1);
    expect(transitions).toEqual(["disconnected"]);
    unsubscribe();
    await harness.controller.close();
  });

  it("escalates a bare transport error to a reset when no close follows within the window", async () => {
    vi.useFakeTimers();
    const harness = createController();
    await connectController(harness);

    harness.transport.error({});
    expect(harness.controller.getState().status).toBe("connected");
    await vi.advanceTimersByTimeAsync(250);
    expect(harness.controller.getState()).toMatchObject({
      status: "disconnected",
      reason: "Transport error",
    });
    expect(harness.callbacks.onReset).toHaveBeenCalledTimes(1);
    await harness.controller.close();
  });

  it("coalesces liveness probes and resolves them from one pong", async () => {
    const harness = createController();
    await connectController(harness);
    harness.transport.sent.length = 0;

    const first = harness.controller.checkLiveness({ timeoutMs: 1_000 });
    const second = harness.controller.checkLiveness({ timeoutMs: 1_000 });
    expect(first).toBe(second);
    expect(harness.transport.sent).toEqual([JSON.stringify({ type: "ping" })]);

    harness.controller.resolvePong();
    await expect(first).resolves.toMatchObject({ rttMs: expect.any(Number) });
    await expect(second).resolves.toMatchObject({ rttMs: expect.any(Number) });
    await harness.controller.close();
  });
});
