/**
 * Regression tests for the inbound demux's content-based frame detection.
 *
 * Over the relay, binary protocol frames whose bytes are valid UTF-8 arrive
 * as *strings* — the E2EE codec reconstructs frame type via a UTF-8 heuristic
 * (see the frame-type contract note in @chisacode/relay crypto.ts decrypt and
 * the mirror test in packages/relay/src/e2ee-frame-type.test.ts). The inbound
 * controller must therefore route by opcode sniffing after a UTF-8 re-encode,
 * never by the delivered JS type.
 */
import { describe, expect, test } from "vitest";
import {
  encodeTerminalStreamFrame,
  TerminalStreamOpcode,
} from "@chisacode/protocol/binary-frames/index";
import type { SessionOutboundMessage } from "@chisacode/protocol/messages";

import { DaemonClientInboundController } from "./daemon-client-inbound-controller.js";

type TerminalFrame = Parameters<
  ConstructorParameters<typeof DaemonClientInboundController>[0]["onTerminalFrame"]
>[0];

function createHarness() {
  const terminalFrames: TerminalFrame[] = [];
  const sessionMessages: SessionOutboundMessage[] = [];
  const controller = new DaemonClientInboundController({
    fileTransfers: { handleFrame: () => null },
    getRuntimeMetrics: () => null,
    isConnecting: () => false,
    logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    markConnected: () => {},
    onInboundActivity: () => {},
    onRequestMessage: (message) => sessionMessages.push(message),
    onTerminalFrame: (frame) => terminalFrames.push(frame),
    onTerminalStreamExit: () => {},
    resolvePong: () => {},
  });
  return { controller, terminalFrames, sessionMessages };
}

describe("DaemonClientInboundController content-based demux", () => {
  test("routes a terminal frame delivered as a UTF-8 string to the terminal handler", () => {
    const { controller, terminalFrames } = createHarness();
    const payload = new TextEncoder().encode("ls -la\n");
    const frame = encodeTerminalStreamFrame({
      opcode: TerminalStreamOpcode.Output,
      slot: 3,
      payload,
    });

    // Simulate the relay's string delivery of a valid-UTF-8 binary frame.
    controller.handle(new TextDecoder("utf-8", { fatal: true }).decode(frame));

    expect(terminalFrames).toHaveLength(1);
    expect(terminalFrames[0].opcode).toBe(TerminalStreamOpcode.Output);
    expect(terminalFrames[0].slot).toBe(3);
    expect(Array.from(terminalFrames[0].payload)).toEqual(Array.from(payload));
  });

  test("routes the same terminal frame delivered as bytes identically", () => {
    const { controller, terminalFrames } = createHarness();
    const payload = new TextEncoder().encode("ls -la\n");
    const frame = encodeTerminalStreamFrame({
      opcode: TerminalStreamOpcode.Output,
      slot: 3,
      payload,
    });

    controller.handle(frame);

    expect(terminalFrames).toHaveLength(1);
    expect(terminalFrames[0].slot).toBe(3);
    expect(Array.from(terminalFrames[0].payload)).toEqual(Array.from(payload));
  });

  test("does not misroute JSON protocol text into the binary path", () => {
    const { controller, terminalFrames, sessionMessages } = createHarness();

    controller.handle(
      JSON.stringify({
        type: "session",
        message: {
          type: "agent_deleted",
          payload: { agentId: "agent-1", requestId: "delete-1" },
        },
      }),
    );

    expect(terminalFrames).toHaveLength(0);
    expect(sessionMessages).toHaveLength(1);
    expect(sessionMessages[0].type).toBe("agent_deleted");
  });
});
