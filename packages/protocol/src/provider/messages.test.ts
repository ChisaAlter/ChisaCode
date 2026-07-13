import { describe, expect, test } from "vitest";

import {
  ProviderSnapshotEntrySchema as LegacyProviderSnapshotEntrySchema,
  SessionInboundMessageSchema,
  SessionOutboundMessageSchema,
} from "../messages.js";
import {
  DiagnosticsRequestSchema,
  DiagnosticsResponseSchema,
  ProviderInboundMessageSchemas,
  ProviderOutboundMessageSchemas,
  ProviderSnapshotEntrySchema,
} from "./messages.js";

function schemaTypes(schemas: readonly { shape: { type: { value: string } } }[]): string[] {
  return schemas.map((schema) => schema.shape.type.value);
}

describe("provider message domain", () => {
  test("owns unique inbound and outbound message type sets", () => {
    const inboundTypes = schemaTypes(ProviderInboundMessageSchemas);
    const outboundTypes = schemaTypes(ProviderOutboundMessageSchemas);

    expect(inboundTypes).toHaveLength(11);
    expect(new Set(inboundTypes).size).toBe(inboundTypes.length);
    expect(outboundTypes).toHaveLength(12);
    expect(new Set(outboundTypes).size).toBe(outboundTypes.length);
  });

  test("keeps direct schemas and aggregate session unions aligned", () => {
    const request = DiagnosticsRequestSchema.parse({
      type: "diagnostics.request",
      requestId: "request-1",
      includeLogs: true,
      maxLogLines: 120,
    });
    expect(SessionInboundMessageSchema.parse(request)).toEqual(request);

    const response = DiagnosticsResponseSchema.parse({
      type: "diagnostics.response",
      payload: {
        requestId: "request-1",
        diagnostic: "healthy",
      },
    });
    expect(SessionOutboundMessageSchema.parse(response)).toEqual(response);
  });

  test("bounds explicitly requested daemon log context", () => {
    expect(
      DiagnosticsRequestSchema.safeParse({
        type: "diagnostics.request",
        requestId: "request-1",
        includeLogs: true,
        maxLogLines: 201,
      }).success,
    ).toBe(false);
  });

  test("keeps the legacy messages export wired to provider schemas", () => {
    expect(LegacyProviderSnapshotEntrySchema).toBe(ProviderSnapshotEntrySchema);
  });
});
