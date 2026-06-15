import { describe, expect, test } from "vitest";

import { handleModelGatewayRequest } from "./model-gateway.js";
import type { ModelGatewayConfig } from "@chisacode/protocol/provider-config";

function makeGateway(overrides: Partial<ModelGatewayConfig> = {}): ModelGatewayConfig {
  return {
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
        baseUrl: "https://api.z.ai/v1",
        apiKey: "sk-chat",
      },
      responses: {
        enabled: false,
        baseUrl: "",
        apiKey: "",
      },
    },
    ...overrides,
  };
}

function makeGatewayWithOnly(
  format: "anthropic" | "chatCompletions" | "responses",
): ModelGatewayConfig {
  return makeGateway({
    upstreams: {
      anthropic: {
        enabled: format === "anthropic",
        baseUrl: format === "anthropic" ? "https://api.anthropic.test/v1" : "",
        apiKey: format === "anthropic" ? "sk-anthropic" : "",
      },
      chatCompletions: {
        enabled: format === "chatCompletions",
        baseUrl: format === "chatCompletions" ? "https://api.chat.test/v1" : "",
        apiKey: format === "chatCompletions" ? "sk-chat" : "",
      },
      responses: {
        enabled: format === "responses",
        baseUrl: format === "responses" ? "https://api.responses.test/v1" : "",
        apiKey: format === "responses" ? "sk-responses" : "",
      },
    },
  });
}

describe("model gateway", () => {
  test("forwards chat completions to a matching chat upstream without conversion", async () => {
    const fetchCalls: Array<{ url: string; init: RequestInit }> = [];
    const response = await handleModelGatewayRequest({
      gateway: makeGateway(),
      targetFormat: "chatCompletions",
      requestBody: {
        model: "glm-5",
        messages: [{ role: "user", content: "hello" }],
      },
      fetchImpl: async (url, init) => {
        fetchCalls.push({ url: String(url), init: init ?? {} });
        return new Response(
          JSON.stringify({
            id: "chatcmpl_1",
            choices: [{ message: { role: "assistant", content: "hi" }, finish_reason: "stop" }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    });

    await expect(response.json()).resolves.toMatchObject({
      id: "chatcmpl_1",
      choices: [{ message: { role: "assistant", content: "hi" }, finish_reason: "stop" }],
    });
    expect(fetchCalls).toEqual([
      {
        url: "https://api.z.ai/v1/chat/completions",
        init: expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            authorization: "Bearer sk-chat",
          }),
          body: JSON.stringify({
            model: "glm-5",
            messages: [{ role: "user", content: "hello" }],
          }),
        }),
      },
    ]);
  });

  test("normalizes developer role for matching chat completion upstreams", async () => {
    await handleModelGatewayRequest({
      gateway: makeGatewayWithOnly("chatCompletions"),
      targetFormat: "chatCompletions",
      requestBody: {
        model: "deepseek-v4-pro",
        messages: [
          { role: "developer", content: "Use repo context." },
          { role: "user", content: "hello" },
        ],
      },
      fetchImpl: async (_url, init) => {
        expect(init?.body).toBe(
          JSON.stringify({
            model: "deepseek-v4-pro",
            messages: [
              { role: "system", content: "Use repo context." },
              { role: "user", content: "hello" },
            ],
          }),
        );
        return Response.json({
          id: "chatcmpl_deepseek",
          choices: [{ message: { role: "assistant", content: "hi" }, finish_reason: "stop" }],
        });
      },
    });
  });

  test("converts an Anthropic Messages request to chat completions when only chat upstream exists", async () => {
    const response = await handleModelGatewayRequest({
      gateway: makeGateway(),
      targetFormat: "anthropic",
      requestBody: {
        model: "glm-5",
        system: "Be terse.",
        messages: [{ role: "user", content: "hello" }],
        max_tokens: 128,
      },
      fetchImpl: async (_url, init) => {
        expect(init?.body).toBe(
          JSON.stringify({
            model: "glm-5",
            messages: [
              { role: "system", content: "Be terse." },
              { role: "user", content: "hello" },
            ],
            max_tokens: 128,
            stream: false,
          }),
        );
        return new Response(
          JSON.stringify({
            id: "chatcmpl_1",
            model: "glm-5",
            choices: [{ message: { role: "assistant", content: "hi" }, finish_reason: "stop" }],
            usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    });

    await expect(response.json()).resolves.toMatchObject({
      id: "chatcmpl_1",
      type: "message",
      role: "assistant",
      model: "glm-5",
      content: [{ type: "text", text: "hi" }],
      stop_reason: "end_turn",
      usage: {
        input_tokens: 3,
        output_tokens: 2,
      },
    });
  });

  test("converts streaming chat deltas to Anthropic Messages SSE events", async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'data: {"choices":[{"delta":{"content":"hi"}}]}\n\ndata: [DONE]\n\n',
          ),
        );
        controller.close();
      },
    });
    const response = await handleModelGatewayRequest({
      gateway: makeGateway(),
      targetFormat: "anthropic",
      requestBody: {
        model: "glm-5",
        messages: [{ role: "user", content: "hello" }],
        stream: true,
      },
      fetchImpl: async () =>
        new Response(stream, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        }),
    });

    const text = await response.text();
    expect(text).toContain("event: content_block_delta");
    expect(text).toContain('"text":"hi"');
    expect(text).toContain("event: message_stop");
  });

  test("converts a chat completions request to Anthropic Messages when only Anthropic upstream exists", async () => {
    const response = await handleModelGatewayRequest({
      gateway: makeGatewayWithOnly("anthropic"),
      targetFormat: "chatCompletions",
      requestBody: {
        model: "glm-5",
        messages: [
          { role: "system", content: "Be terse." },
          { role: "user", content: "hello" },
        ],
        max_tokens: 32,
      },
      fetchImpl: async (url, init) => {
        expect(String(url)).toBe("https://api.anthropic.test/v1/messages");
        expect(init?.body).toBe(
          JSON.stringify({
            model: "glm-5",
            messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
            system: "Be terse.",
            max_tokens: 32,
            stream: false,
          }),
        );
        return Response.json({
          id: "msg_1",
          model: "glm-5",
          content: [{ type: "text", text: "hi" }],
          stop_reason: "end_turn",
          usage: { input_tokens: 3, output_tokens: 2 },
        });
      },
    });

    await expect(response.json()).resolves.toMatchObject({
      id: "msg_1",
      object: "chat.completion",
      choices: [{ message: { role: "assistant", content: "hi" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
    });
  });

  test("converts a responses request to chat completions when only chat upstream exists", async () => {
    const response = await handleModelGatewayRequest({
      gateway: makeGatewayWithOnly("chatCompletions"),
      targetFormat: "responses",
      requestBody: {
        model: "glm-5",
        instructions: "Be terse.",
        input: [{ role: "user", content: [{ type: "input_text", text: "hello" }] }],
        max_output_tokens: 32,
      },
      fetchImpl: async (_url, init) => {
        expect(init?.body).toBe(
          JSON.stringify({
            model: "glm-5",
            messages: [
              { role: "system", content: "Be terse." },
              { role: "user", content: "hello" },
            ],
            max_tokens: 32,
            stream: false,
          }),
        );
        return Response.json({
          id: "chatcmpl_1",
          model: "glm-5",
          choices: [{ message: { role: "assistant", content: "hi" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
        });
      },
    });

    await expect(response.json()).resolves.toMatchObject({
      id: "chatcmpl_1",
      object: "response",
      status: "completed",
      output_text: "hi",
      usage: { input_tokens: 3, output_tokens: 2, total_tokens: 5 },
    });
  });

  test("converts Responses developer input to system for chat completion upstreams", async () => {
    await handleModelGatewayRequest({
      gateway: makeGatewayWithOnly("chatCompletions"),
      targetFormat: "responses",
      requestBody: {
        model: "deepseek-v4-pro",
        input: [
          { role: "user", content: [{ type: "input_text", text: "hello" }] },
          { role: "developer", content: [{ type: "input_text", text: "Use repo context." }] },
        ],
      },
      fetchImpl: async (_url, init) => {
        expect(init?.body).toBe(
          JSON.stringify({
            model: "deepseek-v4-pro",
            messages: [
              { role: "user", content: "hello" },
              { role: "system", content: "Use repo context." },
            ],
            stream: false,
          }),
        );
        return Response.json({
          id: "chatcmpl_deepseek",
          model: "deepseek-v4-pro",
          choices: [{ message: { role: "assistant", content: "hi" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
        });
      },
    });
  });

  test("converts an Anthropic Messages request to Responses when only Responses upstream exists", async () => {
    const response = await handleModelGatewayRequest({
      gateway: makeGatewayWithOnly("responses"),
      targetFormat: "anthropic",
      requestBody: {
        model: "glm-5",
        system: "Be terse.",
        messages: [{ role: "user", content: "hello" }],
        max_tokens: 32,
      },
      fetchImpl: async (url, init) => {
        expect(String(url)).toBe("https://api.responses.test/v1/responses");
        expect(init?.body).toBe(
          JSON.stringify({
            model: "glm-5",
            input: [{ role: "user", content: "hello" }],
            instructions: "Be terse.",
            max_output_tokens: 32,
            stream: false,
          }),
        );
        return Response.json({
          id: "resp_1",
          model: "glm-5",
          output_text: "hi",
          usage: { input_tokens: 3, output_tokens: 2, total_tokens: 5 },
        });
      },
    });

    await expect(response.json()).resolves.toMatchObject({
      id: "resp_1",
      type: "message",
      role: "assistant",
      content: [{ type: "text", text: "hi" }],
      usage: { input_tokens: 3, output_tokens: 2 },
    });
  });

  test("converts Anthropic streaming deltas to chat completion SSE events", async () => {
    const response = await handleModelGatewayRequest({
      gateway: makeGatewayWithOnly("anthropic"),
      targetFormat: "chatCompletions",
      requestBody: {
        model: "glm-5",
        messages: [{ role: "user", content: "hello" }],
        stream: true,
      },
      fetchImpl: async () =>
        new Response(
          'event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":"hi"}}\n\n',
          {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          },
        ),
    });

    const text = await response.text();
    expect(text).toContain("chat.completion.chunk");
    expect(text).toContain('"content":"hi"');
    expect(text).toContain("data: [DONE]");
  });

  test("converts chat streaming deltas to Responses SSE events", async () => {
    const response = await handleModelGatewayRequest({
      gateway: makeGatewayWithOnly("chatCompletions"),
      targetFormat: "responses",
      requestBody: {
        model: "glm-5",
        input: "hello",
        stream: true,
      },
      fetchImpl: async () =>
        new Response('data: {"choices":[{"delta":{"content":"hi"}}]}\n\ndata: [DONE]\n\n', {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        }),
    });

    const text = await response.text();
    expect(text).toContain("event: response.output_text.delta");
    expect(text).toContain('"delta":"hi"');
    expect(text).toContain("event: response.completed");
  });
});
