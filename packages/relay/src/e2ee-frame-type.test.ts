/**
 * Regression tests for the implicit E2EE frame-type contract.
 *
 * The relay wire format carries no string-vs-binary marker: `decrypt`
 * reconstructs the frame type by attempting a strict UTF-8 decode (see the
 * frame-type contract note in crypto.ts). Consumers on both sides re-detect
 * frame kind by content — the daemon and the client re-encode string
 * deliveries to UTF-8 bytes and sniff the leading opcode byte. These tests
 * pin the two properties that make that safe:
 *
 * 1. Binary frames whose bytes are valid UTF-8 (all protocol opcodes
 *    0x01-0x05/0x10-0x12 are valid UTF-8 lead bytes) come back as strings
 *    that re-encode to the exact original bytes (lossless round-trip).
 * 2. Binary frames containing invalid UTF-8 come back as ArrayBuffers with
 *    identical bytes.
 *
 * The wire format itself must not change — old daemons and clients depend on
 * it. If one of these tests fails, a consumer somewhere is about to receive
 * frames it cannot re-detect.
 */
import { describe, expect, it } from "vitest";
import nacl from "tweetnacl";

import { decrypt, deriveSharedKey, encrypt, generateKeyPair, SALT_LENGTH } from "./crypto.js";

function makeSharedKey(): Uint8Array {
  const a = generateKeyPair();
  const b = generateKeyPair();
  return deriveSharedKey(a.secretKey, b.publicKey);
}

function roundTrip(payload: string | ArrayBuffer): string | ArrayBuffer {
  const key = makeSharedKey();
  const salt = nacl.randomBytes(SALT_LENGTH);
  const bundle = encrypt(key, payload, 0n, salt);
  return decrypt(key, bundle).plaintext;
}

describe("E2EE frame-type contract", () => {
  it("delivers a valid-UTF-8 binary frame as a string that re-encodes to identical bytes", () => {
    // Shaped like a terminal Output frame: opcode 0x01, slot 0x02, ASCII payload.
    // 0x01 is a valid UTF-8 lead byte, so decrypt classifies this as text.
    const frame = new Uint8Array([0x01, 0x02, ...new TextEncoder().encode("ls -la\n")]);
    const delivered = roundTrip(toArrayBuffer(frame));

    expect(typeof delivered).toBe("string");
    const reEncoded = new TextEncoder().encode(delivered as string);
    expect(Array.from(reEncoded)).toEqual(Array.from(frame));
  });

  it("delivers an invalid-UTF-8 binary frame as an ArrayBuffer with identical bytes", () => {
    // 0xff is never valid UTF-8, so decrypt classifies this as binary.
    const frame = new Uint8Array([0x01, 0x02, 0xff, 0xfe, 0x00, 0x80]);
    const delivered = roundTrip(toArrayBuffer(frame));

    expect(delivered).toBeInstanceOf(ArrayBuffer);
    expect(Array.from(new Uint8Array(delivered as ArrayBuffer))).toEqual(Array.from(frame));
  });

  it("delivers JSON protocol text unchanged as a string", () => {
    const json = JSON.stringify({ type: "ping", ts: 1234 });
    const delivered = roundTrip(json);

    expect(delivered).toBe(json);
  });

  it("keeps the binary opcode space disjoint from the JSON lead byte", () => {
    // Consumers demux by sniffing the first byte; JSON always starts with
    // "{" (0x7b). If an opcode ever collides with 0x7b, JSON messages would be
    // misrouted into the binary path. Mirrors the opcode values in
    // @chisacode/protocol binary-frames (terminal 0x01-0x05, file 0x10-0x12),
    // which relay cannot import (architecture guard keeps relay standalone).
    const opcodes = [0x01, 0x02, 0x03, 0x04, 0x05, 0x10, 0x11, 0x12];
    const jsonLeadByte = "{".charCodeAt(0);
    expect(jsonLeadByte).toBe(0x7b);
    expect(opcodes).not.toContain(jsonLeadByte);
  });
});

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const out = new Uint8Array(bytes.byteLength);
  out.set(bytes);
  return out.buffer;
}
