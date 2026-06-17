import { createServer } from "node:http";
import { afterEach, describe, expect, test } from "vitest";

import { createTestChisaCodeDaemon } from "./test-utils/chisacode-daemon.js";

const upstreamServers: Array<{ close: () => Promise<void> }> = [];

async function createJsonUpstream() {
  const requests: Array<{ url: string; authorization: string | undefined; body: unknown }> = [];
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += String(chunk);
    });
    req.on("end", () => {
      requests.push({
        url: req.url ?? "",
        authorization: req.headers.authorization,
        body: raw ? JSON.parse(raw) : null,
      });
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          id: "chatcmpl_1",
          model: "glm-5",
          choices: [
            {
              message: { role: "assistant", content: "hi" },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("test upstream did not bind a TCP port");
  }
  const handle = {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
  upstreamServers.push(handle);
  return handle;
}

describe("model gateway bootstrap routes", () => {
  afterEach(async () => {
    await Promise.all(upstreamServers.splice(0).map((server) => server.close()));
  });

  test("protects gateway routes with the internal token and forwards known gateways", async () => {
    const upstream = await createJsonUpstream();
    const daemonHandle = await createTestChisaCodeDaemon({
      modelGatewayToken: "internal-token",
      modelGateways: {
        zai: {
          id: "zai",
          label: "ZAI",
          enabled: true,
          models: [{ id: "glm-5", label: "GLM 5", isDefault: true }],
          upstreams: {
            anthropic: {
              enabled: false,
              baseUrl: "",
              apiKey: "",
            },
            chatCompletions: {
              enabled: true,
              baseUrl: upstream.baseUrl,
              apiKey: "sk-chat",
            },
            responses: {
              enabled: false,
              baseUrl: "",
              apiKey: "",
            },
          },
        },
      },
    });
    try {
      const missingAuth = await fetch(
        `http://127.0.0.1:${daemonHandle.port}/api/model-gateways/zai/v1/messages`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ model: "glm-5", messages: [] }),
        },
      );
      expect(missingAuth.status).toBe(401);

      const unknown = await fetch(
        `http://127.0.0.1:${daemonHandle.port}/api/model-gateways/unknown/v1/messages`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: "Bearer internal-token",
          },
          body: JSON.stringify({ model: "glm-5", messages: [] }),
        },
      );
      expect(unknown.status).toBe(404);

      const response = await fetch(
        `http://127.0.0.1:${daemonHandle.port}/api/model-gateways/zai/v1/messages`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: "Bearer internal-token",
          },
          body: JSON.stringify({
            model: "glm-5",
            messages: [{ role: "user", content: "hello" }],
          }),
        },
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        type: "message",
        content: [{ type: "text", text: "hi" }],
      });
      expect(upstream.requests).toEqual([
        {
          url: "/chat/completions",
          authorization: "Bearer sk-chat",
          body: {
            model: "glm-5",
            messages: [{ role: "user", content: "hello" }],
            stream: false,
          },
        },
      ]);
    } finally {
      await daemonHandle.close();
    }
  });

  test("accepts large gateway requests without the default JSON body limit", async () => {
    const upstream = await createJsonUpstream();
    const daemonHandle = await createTestChisaCodeDaemon({
      modelGatewayToken: "internal-token",
      modelGateways: {
        zai: {
          id: "zai",
          label: "ZAI",
          enabled: true,
          models: [{ id: "glm-5", label: "GLM 5", isDefault: true }],
          upstreams: {
            anthropic: {
              enabled: false,
              baseUrl: "",
              apiKey: "",
            },
            chatCompletions: {
              enabled: true,
              baseUrl: upstream.baseUrl,
              apiKey: "sk-chat",
            },
            responses: {
              enabled: false,
              baseUrl: "",
              apiKey: "",
            },
          },
        },
      },
    });
    try {
      const largeContent = "x".repeat(33 * 1024 * 1024);
      const response = await fetch(
        `http://127.0.0.1:${daemonHandle.port}/api/model-gateways/zai/v1/messages`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: "Bearer internal-token",
          },
          body: JSON.stringify({
            model: "glm-5",
            messages: [{ role: "user", content: largeContent }],
          }),
        },
      );

      expect(response.status).toBe(200);
      expect(upstream.requests).toHaveLength(1);
    } finally {
      await daemonHandle.close();
    }
  });

  test("applies model override routes and accepts Anthropic x-api-key auth", async () => {
    const upstream = await createJsonUpstream();
    const daemonHandle = await createTestChisaCodeDaemon({
      modelGatewayToken: "internal-token",
      modelGateways: {
        zai: {
          id: "zai",
          label: "ZAI",
          enabled: true,
          models: [{ id: "glm-5", label: "GLM 5", isDefault: true }],
          upstreams: {
            anthropic: {
              enabled: false,
              baseUrl: "",
              apiKey: "",
            },
            chatCompletions: {
              enabled: true,
              baseUrl: upstream.baseUrl,
              apiKey: "sk-chat",
            },
            responses: {
              enabled: false,
              baseUrl: "",
              apiKey: "",
            },
          },
        },
      },
    });
    try {
      const response = await fetch(
        `http://127.0.0.1:${daemonHandle.port}/api/model-gateways/zai/model-overrides/GPT6.0/v1/messages`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": "internal-token",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-5",
            messages: [{ role: "user", content: "hello" }],
          }),
        },
      );

      expect(response.status).toBe(200);
      expect(upstream.requests[0]?.body).toMatchObject({
        model: "GPT6.0",
      });
    } finally {
      await daemonHandle.close();
    }
  });
});
