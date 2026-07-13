import { describe, expect, test } from "vitest";

import {
  AgentCreatedStatusPayloadSchema as LegacyAgentCreatedStatusPayloadSchema,
  AgentUpdateMessageSchema as LegacyAgentUpdateMessageSchema,
  CreateAgentRequestMessageSchema as LegacyCreateAgentRequestMessageSchema,
  KnownStatusPayloadSchema,
  SendAgentMessageSchema as LegacySendAgentMessageSchema,
  SessionInboundMessageSchema,
  SessionOutboundMessageSchema,
} from "../messages.js";
import {
  AgentCreatedStatusPayloadSchema,
  AgentInboundMessageSchemas,
  AgentOutboundMessageSchemas,
  AgentStatusPayloadSchemas,
  AgentUpdateMessageSchema,
  CreateAgentRequestMessageSchema,
  SendAgentMessageSchema,
} from "./messages.js";

describe("agent message domain", () => {
  test("owns 23 inbound, 23 outbound, and four lifecycle status schemas", () => {
    expect(AgentInboundMessageSchemas).toHaveLength(23);
    expect(AgentOutboundMessageSchemas).toHaveLength(23);
    expect(AgentStatusPayloadSchemas).toHaveLength(4);
  });

  test("preserves legacy messages re-export identities", () => {
    expect(LegacyCreateAgentRequestMessageSchema).toBe(CreateAgentRequestMessageSchema);
    expect(LegacyAgentCreatedStatusPayloadSchema).toBe(AgentCreatedStatusPayloadSchema);
    expect(LegacyAgentUpdateMessageSchema).toBe(AgentUpdateMessageSchema);
    expect(LegacySendAgentMessageSchema).toBe(SendAgentMessageSchema);
  });

  test("keeps agent requests, events, and status payloads in the aggregate unions", () => {
    const inbound = {
      type: "delete_agent_request" as const,
      agentId: "agent-1",
      requestId: "delete-1",
    };
    const outbound = {
      type: "agent_deleted" as const,
      payload: { agentId: "agent-1", requestId: "delete-1" },
    };
    const status = {
      status: "agent_create_failed" as const,
      requestId: "create-1",
      error: "provider unavailable",
    };

    expect(AgentInboundMessageSchemas.some((schema) => schema.safeParse(inbound).success)).toBe(
      true,
    );
    expect(SessionInboundMessageSchema.parse(inbound)).toEqual(inbound);
    expect(AgentOutboundMessageSchemas.some((schema) => schema.safeParse(outbound).success)).toBe(
      true,
    );
    expect(SessionOutboundMessageSchema.parse(outbound)).toEqual(outbound);
    expect(AgentStatusPayloadSchemas.some((schema) => schema.safeParse(status).success)).toBe(true);
    expect(KnownStatusPayloadSchema.parse(status)).toEqual(status);
  });

  test("leaves cross-domain session control messages outside the agent tuples", () => {
    const inboundMessages = [
      { type: "abort_request" },
      { type: "close_items_request", requestId: "close-1" },
      {
        type: "project.rename.request",
        projectId: "project-1",
        customName: "ChisaCode",
        requestId: "rename-1",
      },
      {
        type: "model_gateway.moa.test.request",
        requestId: "moa-1",
        gatewayId: "gateway-1",
        syntheticModel: {
          id: "moa-model",
          label: "MoA Model",
          references: [{ model: "reference-model" }],
          aggregatorModel: "aggregator-model",
        },
        prompt: "Review this change",
      },
      {
        type: "client_heartbeat",
        deviceType: "web",
        focusedAgentId: null,
        lastActivityAt: "2026-07-14T00:00:00.000Z",
        appVisible: true,
      },
      { type: "ping", requestId: "ping-1" },
      { type: "register_push_token", token: "push-token" },
    ];

    for (const message of inboundMessages) {
      expect(AgentInboundMessageSchemas.some((schema) => schema.safeParse(message).success)).toBe(
        false,
      );
      expect(SessionInboundMessageSchema.safeParse(message).success).toBe(true);
    }

    const outboundMessages = [
      {
        type: "close_items_response",
        payload: { agents: [], terminals: [], requestId: "close-1" },
      },
      {
        type: "project.rename.response",
        payload: {
          requestId: "rename-1",
          projectId: "project-1",
          accepted: true,
          customName: "ChisaCode",
          error: null,
        },
      },
      {
        type: "model_gateway.moa.test.response",
        payload: {
          requestId: "moa-1",
          gatewayId: "gateway-1",
          result: null,
          error: null,
        },
      },
    ];

    for (const message of outboundMessages) {
      expect(AgentOutboundMessageSchemas.some((schema) => schema.safeParse(message).success)).toBe(
        false,
      );
      expect(SessionOutboundMessageSchema.safeParse(message).success).toBe(true);
    }
  });

  test("keeps legacy send_agent_message outside the correlated session union", () => {
    const message = {
      type: "send_agent_message" as const,
      agentId: "agent-1",
      text: "hello",
    };

    expect(SendAgentMessageSchema.safeParse(message).success).toBe(true);
    expect(AgentInboundMessageSchemas.some((schema) => schema.safeParse(message).success)).toBe(
      false,
    );
    expect(SessionInboundMessageSchema.safeParse(message).success).toBe(false);
  });
});
