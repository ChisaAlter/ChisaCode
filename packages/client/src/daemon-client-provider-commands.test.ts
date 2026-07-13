import { describe, expect, test } from "vitest";

import type { DaemonCommandTransport } from "./daemon-client-command-transport.js";
import { ProviderCommandClient } from "./daemon-client-provider-commands.js";

describe("ProviderCommandClient", () => {
  test("maps bounded diagnostics options to the correlated transport", async () => {
    const requests: Array<Parameters<DaemonCommandTransport["request"]>[0]> = [];
    const client = new ProviderCommandClient({
      request: async (params) => {
        requests.push(params);
        return {} as never;
      },
    });

    await client.getDiagnostics({
      includeLogs: true,
      maxLogLines: 80,
      requestId: "diagnostics-1",
    });

    expect(requests).toEqual([
      {
        requestId: "diagnostics-1",
        message: {
          type: "diagnostics.request",
          includeLogs: true,
          maxLogLines: 80,
        },
        responseType: "diagnostics.response",
        timeout: 30000,
      },
    ]);
  });
});
