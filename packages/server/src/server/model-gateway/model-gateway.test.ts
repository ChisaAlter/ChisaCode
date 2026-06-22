import { describe, expect, test } from "vitest";

import { handleModelGatewayRequest, runSyntheticModelTest } from "./model-gateway.js";
import type { ModelGatewayConfig } from "@chisacode/protocol/provider-config";

function makeGateway(overrides: Partial<ModelGatewayConfig> = {}): ModelGatewayConfig {
  return {
    id: "zai",
    label: "ZAI",
    enabled: true,
    models: [{ id: "glm-5", label: "GLM 5", isDefault: true }],
    syntheticModels: [],
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
  test("synthesizes a configured model from references and an aggregator", async () => {
    const fetchCalls: Array<{ body: unknown }> = [];
    const response = await handleModelGatewayRequest({
      gateway: makeGateway({
        models: [
          { id: "glm-5", label: "GLM 5", isDefault: true },
          { id: "glm-5-air", label: "GLM 5 Air" },
          { id: "glm-4.6", label: "GLM 4.6" },
        ],
        syntheticModels: [
          {
            id: "moa-coder",
            label: "MoA Coder",
            references: [{ model: "glm-5-air" }, { model: "glm-4.6" }],
            aggregatorModel: "glm-5",
            rounds: 1,
          },
        ],
      }),
      targetFormat: "chatCompletions",
      requestBody: {
        model: "moa-coder",
        messages: [{ role: "user", content: "hello" }],
      },
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        fetchCalls.push({ body });
        let content = "final synthetic answer";
        if (body.model === "glm-5-air") {
          content = "air answer";
        } else if (body.model === "glm-4.6") {
          content = "base answer";
        }
        return new Response(
          JSON.stringify({
            id: `chatcmpl_${body.model}`,
            choices: [{ message: { role: "assistant", content }, finish_reason: "stop" }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    });

    await expect(response.json()).resolves.toMatchObject({
      choices: [{ message: { content: "final synthetic answer" } }],
    });
    expect(fetchCalls.map((call) => (call.body as { model: string }).model)).toEqual([
      "glm-5-air",
      "glm-4.6",
      "glm-5",
    ]);
    const aggregateCall = fetchCalls[2];
    expect(aggregateCall).toBeDefined();
    expect(
      (aggregateCall.body as { messages: Array<{ content: string }> }).messages[0]?.content,
    ).toContain("air answer");
  });

  test("recognizes provider-prefixed synthetic model ids before forwarding upstream", async () => {
    const fetchCalls: Array<{ body: { model: string } }> = [];
    const response = await handleModelGatewayRequest({
      gateway: makeGateway({
        models: [
          { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash" },
          { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
        ],
        syntheticModels: [
          {
            id: "GPT6.0",
            label: "GPT6.0",
            references: [{ model: "deepseek-v4-flash" }],
            aggregatorModel: "deepseek-v4-pro",
            rounds: 1,
          },
        ],
      }),
      targetFormat: "chatCompletions",
      requestBody: {
        model: "openai/GPT6.0",
        messages: [{ role: "user", content: "hello" }],
      },
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        fetchCalls.push({ body });
        return Response.json({
          id: `chatcmpl_${body.model}`,
          choices: [
            {
              message: { role: "assistant", content: `${body.model} answer` },
              finish_reason: "stop",
            },
          ],
        });
      },
    });

    await expect(response.json()).resolves.toMatchObject({
      choices: [{ message: { content: "deepseek-v4-pro answer" } }],
    });
    expect(fetchCalls.map((call) => call.body.model)).toEqual([
      "deepseek-v4-flash",
      "deepseek-v4-pro",
    ]);
  });

  test("runs a layered MoA synthetic model and returns node traces", async () => {
    const fetchCalls: Array<{ body: { model: string; messages: Array<{ content: string }> } }> = [];
    const result = await runSyntheticModelTest({
      gateway: makeGateway({
        models: [
          { id: "glm-5", label: "GLM 5", isDefault: true },
          { id: "glm-5-air", label: "GLM 5 Air" },
          { id: "glm-4.6", label: "GLM 4.6" },
        ],
      }),
      syntheticModel: {
        id: "moa-layered",
        label: "MoA Layered",
        references: [{ model: "glm-5-air" }, { model: "glm-4.6" }],
        aggregatorModel: "glm-5",
        rounds: 1,
        moa: {
          defaults: { temperature: 0.4, maxTokens: 128 },
          layers: [
            {
              id: "layer-1",
              label: "Draft",
              nodes: [{ model: "glm-5-air" }, { model: "glm-4.6" }],
            },
            {
              id: "layer-2",
              label: "Refine",
              nodes: [{ model: "glm-5-air", parameters: { temperature: 0.2 } }],
            },
          ],
          aggregator: { model: "glm-5" },
        },
      },
      prompt: "hello",
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        fetchCalls.push({ body });
        return Response.json({
          id: `chatcmpl_${body.model}_${fetchCalls.length}`,
          choices: [
            {
              message: {
                role: "assistant",
                content: `${body.model} answer ${fetchCalls.length}`,
              },
              finish_reason: "stop",
            },
          ],
        });
      },
    });

    expect(result.finalText).toBe("glm-5 answer 4");
    expect(result.layers).toHaveLength(2);
    expect(result.layers[0]?.nodes.map((node) => node.model)).toEqual(["glm-5-air", "glm-4.6"]);
    expect(result.layers[1]?.nodes).toMatchObject([
      { model: "glm-5-air", status: "success", output: "glm-5-air answer 3" },
    ]);
    expect(fetchCalls.map((call) => call.body.model)).toEqual([
      "glm-5-air",
      "glm-4.6",
      "glm-5-air",
      "glm-5",
    ]);
    expect(fetchCalls[2]?.body.messages[0]?.content).toContain("glm-5-air answer 1");
    expect(fetchCalls[2]?.body.messages[0]?.content).toContain("glm-4.6 answer 2");
    expect(fetchCalls[2]?.body).toMatchObject({ temperature: 0.2, max_tokens: 128 });
  });

  test("caps existing three-layer MoA configs at two layers before aggregation", async () => {
    const fetchCalls: Array<{ body: { model: string } }> = [];
    const result = await runSyntheticModelTest({
      gateway: makeGateway({
        models: [
          { id: "draft-model", label: "Draft" },
          { id: "review-model", label: "Review" },
          { id: "third-model", label: "Third" },
          { id: "decision-model", label: "Decision" },
        ],
      }),
      syntheticModel: {
        id: "legacy-three-layer",
        label: "Legacy Three Layer",
        references: [{ model: "draft-model" }],
        aggregatorModel: "decision-model",
        rounds: 3,
        moa: {
          layers: [
            { id: "layer-1", nodes: [{ model: "draft-model" }] },
            { id: "layer-2", nodes: [{ model: "review-model" }] },
            { id: "layer-3", nodes: [{ model: "third-model" }] },
          ],
          aggregator: { model: "decision-model" },
        },
      },
      prompt: "hello",
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        fetchCalls.push({ body });
        return Response.json({
          id: `chatcmpl_${body.model}`,
          choices: [
            {
              message: { role: "assistant", content: `${body.model} answer` },
              finish_reason: "stop",
            },
          ],
        });
      },
    });

    expect(result.layers.map((layer) => layer.id)).toEqual(["layer-1", "layer-2"]);
    expect(fetchCalls.map((call) => call.body.model)).toEqual([
      "draft-model",
      "review-model",
      "decision-model",
    ]);
  });

  test("skips empty MoA layers and lets the aggregator decide directly", async () => {
    const fetchCalls: Array<{ body: { model: string; messages: Array<{ content: string }> } }> = [];
    const result = await runSyntheticModelTest({
      gateway: makeGateway({
        models: [
          { id: "glm-5", label: "GLM 5", isDefault: true },
          { id: "glm-5-air", label: "GLM 5 Air" },
        ],
      }),
      syntheticModel: {
        id: "decision-only",
        label: "Decision Only",
        references: [{ model: "glm-5" }],
        aggregatorModel: "glm-5",
        rounds: 2,
        moa: {
          layers: [
            {
              id: "layer-1",
              label: "Draft",
              nodes: [],
            },
            {
              id: "layer-2",
              label: "Review",
              nodes: [],
            },
          ],
          aggregator: { model: "glm-5" },
        },
      },
      prompt: "hello",
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        fetchCalls.push({ body });
        return Response.json({
          id: `chatcmpl_${body.model}`,
          choices: [
            {
              message: {
                role: "assistant",
                content: `${body.model} decision`,
              },
              finish_reason: "stop",
            },
          ],
        });
      },
    });

    expect(result.finalText).toBe("glm-5 decision");
    expect(result.layers).toEqual([
      { id: "layer-1", label: "Draft", nodes: [] },
      { id: "layer-2", label: "Review", nodes: [] },
    ]);
    expect(fetchCalls.map((call) => call.body.model)).toEqual(["glm-5"]);
    expect(fetchCalls[0]?.body.messages[0]?.content).toBe("hello");
  });

  test("uses reasoning_content when chat completion content is empty", async () => {
    const result = await runSyntheticModelTest({
      gateway: makeGateway({
        models: [
          { id: "reasoning-model", label: "Reasoning" },
          { id: "decision-model", label: "Decision" },
        ],
      }),
      syntheticModel: {
        id: "reasoning-fallback",
        label: "Reasoning Fallback",
        references: [{ model: "reasoning-model" }],
        aggregatorModel: "decision-model",
        rounds: 1,
        moa: {
          layers: [{ id: "layer-1", nodes: [{ model: "reasoning-model" }] }],
          aggregator: { model: "decision-model" },
        },
      },
      prompt: "hello",
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        return Response.json({
          id: `chatcmpl_${body.model}`,
          choices: [
            {
              message: {
                role: "assistant",
                content: body.model === "reasoning-model" ? "" : "final",
                reasoning_content:
                  body.model === "reasoning-model" ? "reasoning fallback output" : undefined,
              },
              finish_reason: "stop",
            },
          ],
        });
      },
    });

    expect(result.layers[0]?.nodes[0]).toMatchObject({
      model: "reasoning-model",
      status: "success",
      output: "reasoning fallback output",
    });
    expect(result.finalText).toBe("final");
  });

  test("instructs the aggregator to return only the final user-facing answer", async () => {
    const aggregatePrompts: string[] = [];
    await runSyntheticModelTest({
      gateway: makeGateway({
        models: [
          { id: "draft-model", label: "Draft" },
          { id: "decision-model", label: "Decision" },
        ],
      }),
      syntheticModel: {
        id: "final-only",
        label: "Final Only",
        references: [{ model: "draft-model" }],
        aggregatorModel: "decision-model",
        rounds: 1,
      },
      prompt: "hello",
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        if (body.model === "decision-model") {
          aggregatePrompts.push(String(body.messages[0]?.content ?? ""));
        }
        return Response.json({
          id: `chatcmpl_${body.model}`,
          choices: [
            {
              message: {
                role: "assistant",
                content: body.model === "draft-model" ? "draft answer" : "final answer",
              },
              finish_reason: "stop",
            },
          ],
        });
      },
    });

    expect(aggregatePrompts[0]).toContain("Return only the final answer");
    expect(aggregatePrompts[0]).toContain("do not include hidden reasoning or analysis");
  });

  test("continues a MoA layer when one node fails and fails when a whole layer fails", async () => {
    const gateway = makeGateway({
      models: [
        { id: "glm-5", label: "GLM 5", isDefault: true },
        { id: "bad-a", label: "Bad A" },
        { id: "bad-b", label: "Bad B" },
      ],
    });
    await expect(
      runSyntheticModelTest({
        gateway,
        syntheticModel: {
          id: "moa-failing",
          label: "MoA Failing",
          references: [{ model: "bad-a" }, { model: "bad-b" }],
          aggregatorModel: "glm-5",
          rounds: 1,
          moa: {
            layers: [
              {
                id: "layer-1",
                nodes: [{ model: "bad-a" }, { model: "bad-b" }],
              },
            ],
            aggregator: { model: "glm-5" },
          },
        },
        prompt: "hello",
        fetchImpl: async () => new Response("{}", { status: 500 }),
      }),
    ).rejects.toThrow('MoA layer "layer-1" produced no successful outputs');
  });
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

  test("caps excessive token limits for Xiaomi chat completion upstreams", async () => {
    await handleModelGatewayRequest({
      gateway: makeGateway({
        upstreams: {
          anthropic: {
            enabled: false,
            baseUrl: "",
            apiKey: "",
          },
          chatCompletions: {
            enabled: true,
            baseUrl: "https://api.xiaomimimo.com/v1",
            apiKey: "sk-chat",
          },
          responses: {
            enabled: false,
            baseUrl: "",
            apiKey: "",
          },
        },
      }),
      targetFormat: "chatCompletions",
      requestBody: {
        model: "mimo-v2.5",
        messages: [{ role: "user", content: "hello" }],
        max_tokens: 262_144,
        max_completion_tokens: 262_144,
      },
      fetchImpl: async (_url, init) => {
        expect(init?.body).toBe(
          JSON.stringify({
            model: "mimo-v2.5",
            messages: [{ role: "user", content: "hello" }],
            max_tokens: 131_072,
            max_completion_tokens: 131_072,
          }),
        );
        return Response.json({
          id: "chatcmpl_mimo",
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

  test("returns converted streaming responses before the upstream stream completes", async () => {
    const encoder = new TextEncoder();
    let releaseUpstream!: () => void;
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"hi"}}]}\n\n'));
        releaseUpstream = () => {
          controller.enqueue(
            encoder.encode('data: {"choices":[{"delta":{"content":" there"}}]}\n\n'),
          );
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        };
      },
    });
    const responsePromise = handleModelGatewayRequest({
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

    await expect(
      Promise.race([
        responsePromise.then(() => "resolved"),
        new Promise((resolve) => setTimeout(() => resolve("pending"), 20)),
      ]),
    ).resolves.toBe("resolved");

    const response = await responsePromise;
    const textPromise = response.text();
    releaseUpstream();
    const text = await textPromise;
    expect(text).toContain('"text":"hi"');
    expect(text).toContain('"text":" there"');
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

  test("appends v1 for Anthropic-compatible upstream bases that omit it", async () => {
    await handleModelGatewayRequest({
      gateway: makeGateway({
        upstreams: {
          anthropic: {
            enabled: true,
            baseUrl: "https://api.xiaomimimo.com/anthropic",
            apiKey: "sk-anthropic",
          },
          chatCompletions: {
            enabled: false,
            baseUrl: "",
            apiKey: "",
          },
          responses: {
            enabled: false,
            baseUrl: "",
            apiKey: "",
          },
        },
      }),
      targetFormat: "anthropic",
      requestBody: {
        model: "mimo-v2.5",
        messages: [{ role: "user", content: "hello" }],
        max_tokens: 32,
      },
      fetchImpl: async (url, init) => {
        expect(String(url)).toBe("https://api.xiaomimimo.com/anthropic/v1/messages");
        expect(init?.body).toBe(
          JSON.stringify({
            model: "mimo-v2.5",
            messages: [{ role: "user", content: "hello" }],
            max_tokens: 32,
          }),
        );
        return Response.json({
          id: "msg_1",
          model: "mimo-v2.5",
          content: [{ type: "text", text: "hi" }],
          stop_reason: "end_turn",
          usage: { input_tokens: 3, output_tokens: 2 },
        });
      },
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
    expect(text).toContain("event: response.output_item.added");
    expect(text).toContain("event: response.content_part.added");
    expect(text).toContain("event: response.output_text.delta");
    expect(text).toContain('"delta":"hi"');
    expect(text).toContain("event: response.output_text.done");
    expect(text).toContain("event: response.output_item.done");
    expect(text).toContain("event: response.completed");
    expect(text).toContain('"output_text":"hi"');
  });
});
