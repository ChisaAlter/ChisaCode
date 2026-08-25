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
  encodeFileTransferFrame,
  encodeTerminalStreamFrame,
  FileTransferOpcode,
  TerminalStreamOpcode,
  type FileTransferFrame,
} from "@chisacode/protocol/binary-frames/index";
import type { SessionOutboundMessage } from "@chisacode/protocol/messages";

import { DaemonClientInboundController } from "./daemon-client-inbound-controller.js";

type TerminalFrame = Parameters<
  ConstructorParameters<typeof DaemonClientInboundController>[0]["onTerminalFrame"]
>[0];

function createHarness() {
  const terminalFrames: TerminalFrame[] = [];
  const fileFrames: FileTransferFrame[] = [];
  const sessionMessages: SessionOutboundMessage[] = [];
  const warnLogs: string[] = [];
  let pongCount = 0;
  const controller = new DaemonClientInboundController({
    fileTransfers: {
      handleFrame: (frame) => {
        fileFrames.push(frame);
        return null;
      },
    },
    getRuntimeMetrics: () => null,
    isConnecting: () => false,
    logger: {
      debug: () => {},
      info: () => {},
      warn: (_obj, msg) => warnLogs.push(msg ?? ""),
      error: () => {},
    },
    markConnected: () => {},
    onInboundActivity: () => {},
    onRequestMessage: (message) => sessionMessages.push(message),
    onTerminalFrame: (frame) => terminalFrames.push(frame),
    onTerminalStreamExit: () => {},
    resolvePong: () => {
      pongCount += 1;
    },
  });
  return {
    controller,
    terminalFrames,
    fileFrames,
    sessionMessages,
    warnLogs,
    getPongCount: () => pongCount,
  };
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

  test("routes a file-transfer frame delivered as a UTF-8 string to the file handler", () => {
    const { controller, fileFrames, terminalFrames, sessionMessages } = createHarness();
    const frame = encodeFileTransferFrame({
      opcode: FileTransferOpcode.FileChunk,
      requestId: "relay-file",
      payload: new TextEncoder().encode("chunk body"),
    });

    controller.handle(new TextDecoder("utf-8", { fatal: true }).decode(frame));

    expect(fileFrames).toHaveLength(1);
    expect(fileFrames[0].requestId).toBe("relay-file");
    expect(fileFrames[0].opcode).toBe(FileTransferOpcode.FileChunk);
    expect(terminalFrames).toHaveLength(0);
    expect(sessionMessages).toHaveLength(0);
  });

  test("file-transfer opcodes take precedence over the terminal decoder", () => {
    const { controller, fileFrames, terminalFrames } = createHarness();
    const frame = encodeFileTransferFrame({
      opcode: FileTransferOpcode.FileEnd,
      requestId: "precedence",
    });

    controller.handle(frame);

    expect(fileFrames).toHaveLength(1);
    expect(terminalFrames).toHaveLength(0);
  });

  test("routes JSON delivered as bytes to the JSON path, never to binary", () => {
    const { controller, terminalFrames, fileFrames, sessionMessages } = createHarness();
    const json = JSON.stringify({
      type: "session",
      message: {
        type: "agent_deleted",
        payload: { agentId: "agent-bytes", requestId: "delete-bytes" },
      },
    });

    controller.handle(new TextEncoder().encode(json));

    expect(terminalFrames).toHaveLength(0);
    expect(fileFrames).toHaveLength(0);
    expect(sessionMessages).toHaveLength(1);
    expect(sessionMessages[0].type).toBe("agent_deleted");
  });

  test("undecodable binary bytes are dropped without throwing and the stream keeps flowing", () => {
    const { controller, terminalFrames, fileFrames, sessionMessages } = createHarness();

    // 0xff is outside every opcode space and is not valid JSON either.
    expect(() => controller.handle(new Uint8Array([0xff, 0x00, 0x01, 0x02]))).not.toThrow();
    expect(terminalFrames).toHaveLength(0);
    expect(fileFrames).toHaveLength(0);
    expect(sessionMessages).toHaveLength(0);

    // A subsequent valid message is still processed normally.
    controller.handle(
      JSON.stringify({
        type: "session",
        message: {
          type: "agent_deleted",
          payload: { agentId: "agent-after", requestId: "delete-after" },
        },
      }),
    );
    expect(sessionMessages).toHaveLength(1);
  });

  test("malformed JSON is dropped without throwing", () => {
    const { controller, sessionMessages, terminalFrames } = createHarness();

    expect(() => controller.handle("{not valid json")).not.toThrow();
    expect(sessionMessages).toHaveLength(0);
    expect(terminalFrames).toHaveLength(0);
  });

  test("schema-invalid JSON is dropped with a validation warning", () => {
    const { controller, sessionMessages, warnLogs } = createHarness();

    controller.handle(JSON.stringify({ type: "definitely_not_a_protocol_message" }));

    expect(sessionMessages).toHaveLength(0);
    expect(warnLogs).toContain("Message validation failed");
  });

  test("pong resolves the liveness probe through the demux, including the bytes path", () => {
    const harness = createHarness();

    harness.controller.handle(JSON.stringify({ type: "pong" }));
    expect(harness.getPongCount()).toBe(1);

    harness.controller.handle(new TextEncoder().encode(JSON.stringify({ type: "pong" })));
    expect(harness.getPongCount()).toBe(2);
    expect(harness.sessionMessages).toHaveLength(0);
  });
});
