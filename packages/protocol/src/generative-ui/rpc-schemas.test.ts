import { describe, expect, it } from "vitest";
import {
  GenerativeUiActionRequestSchema,
  GenerativeUiActionResponseSchema,
} from "./rpc-schemas.js";
import {
  SessionInboundMessageSchema,
  SessionOutboundMessageSchema,
} from "@chisacode/protocol/messages";

describe("GenerativeUiActionRequestSchema", () => {
  it("accepts a valid action request", () => {
    const result = GenerativeUiActionRequestSchema.safeParse({
      type: "generative_ui.action",
      requestId: "req-1",
      agentId: "agent-abc",
      instanceId: "inst-xyz",
      action: "submit",
      payload: { name: "Alice", age: 30 },
      timestamp: 1719700000000,
    });
    expect(result.success).toBe(true);
  });

  it("rejects when agentId is missing", () => {
    const result = GenerativeUiActionRequestSchema.safeParse({
      type: "generative_ui.action",
      requestId: "req-1",
      instanceId: "inst-xyz",
      action: "submit",
      payload: null,
      timestamp: 1719700000000,
    });
    expect(result.success).toBe(false);
  });

  it("rejects when type is wrong", () => {
    const result = GenerativeUiActionRequestSchema.safeParse({
      type: "other.action",
      requestId: "req-1",
      agentId: "agent-abc",
      instanceId: "inst-xyz",
      action: "submit",
      payload: null,
      timestamp: 1719700000000,
    });
    expect(result.success).toBe(false);
  });

  it("accepts null payload", () => {
    const result = GenerativeUiActionRequestSchema.safeParse({
      type: "generative_ui.action",
      requestId: "req-1",
      agentId: "agent-abc",
      instanceId: "inst-xyz",
      action: "click",
      payload: null,
      timestamp: 1719700000000,
    });
    expect(result.success).toBe(true);
  });
});

describe("GenerativeUiActionResponseSchema", () => {
  it("accepts received=true response", () => {
    const result = GenerativeUiActionResponseSchema.safeParse({
      type: "generative_ui.action.response",
      payload: { requestId: "req-1", received: true, error: null },
    });
    expect(result.success).toBe(true);
  });

  it("accepts received=false with error", () => {
    const result = GenerativeUiActionResponseSchema.safeParse({
      type: "generative_ui.action.response",
      payload: { requestId: "req-1", received: false, error: "agent not found" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects when payload is missing fields", () => {
    const result = GenerativeUiActionResponseSchema.safeParse({
      type: "generative_ui.action.response",
      payload: { requestId: "req-1" },
    });
    expect(result.success).toBe(false);
  });
});

describe("Session message registration", () => {
  it("recognizes generative_ui.action as a valid inbound message", () => {
    const result = SessionInboundMessageSchema.safeParse({
      type: "generative_ui.action",
      requestId: "req-1",
      agentId: "agent-abc",
      instanceId: "inst-xyz",
      action: "submit",
      payload: { value: 42 },
      timestamp: Date.now(),
    });
    expect(result.success).toBe(true);
  });

  it("recognizes generative_ui.action.response as a valid outbound message", () => {
    const result = SessionOutboundMessageSchema.safeParse({
      type: "generative_ui.action.response",
      payload: { requestId: "req-1", received: true, error: null },
    });
    expect(result.success).toBe(true);
  });
});
