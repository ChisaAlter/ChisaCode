import type {
  ModelGatewayConfig,
  ModelGatewayUpstream,
  SyntheticModelConfig,
  SyntheticModelMoa,
  SyntheticModelParameters,
} from "@chisacode/protocol/provider-config";

export type ModelGatewayTargetFormat = "anthropic" | "chatCompletions" | "responses";

type JsonRecord = Record<string, unknown>;

interface HandleModelGatewayRequestOptions {
  gateway: ModelGatewayConfig;
  targetFormat: ModelGatewayTargetFormat;
  requestBody: JsonRecord;
  fetchImpl?: typeof fetch;
}

interface UpstreamSelection {
  format: ModelGatewayTargetFormat;
  upstream: ModelGatewayUpstream;
  url: string;
}

export interface MoaTestNodeTrace {
  id: string | null;
  model: string;
  status: "success" | "error";
  output: string | null;
  error: string | null;
  durationMs: number;
}

export interface MoaTestLayerTrace {
  id: string;
  label: string | null;
  nodes: MoaTestNodeTrace[];
}

export interface MoaTestAggregatorTrace {
  model: string;
  status: "success" | "error";
  output: string | null;
  error: string | null;
  durationMs: number;
}

export interface MoaTestResult {
  finalText: string;
  durationMs: number;
  layers: MoaTestLayerTrace[];
  aggregator: MoaTestAggregatorTrace;
}

const SYNTHETIC_MODEL_SYSTEM_PROMPT = `You have been provided with a set of responses from multiple models to the latest user request. Synthesize them into one high-quality answer. Critically evaluate the responses because some may be incomplete, biased, or incorrect. Do not merely copy them; produce a refined, accurate, coherent, and complete response.

Return only the final answer that should be shown to the user. Do not describe your evaluation process, do not mention the model responses, and do not include hidden reasoning or analysis.

Responses from models:`;
const SYNTHETIC_CHAT_OPTION_KEYS = [
  "temperature",
  "top_p",
  "max_tokens",
  "max_completion_tokens",
  "presence_penalty",
  "frequency_penalty",
  "stop",
  "seed",
] as const;
const XIAOMI_CHAT_COMPLETIONS_MAX_TOKENS = 131_072;
const UPSTREAM_COMPATIBILITY_RULES = [
  {
    host: "api.xiaomimimo.com",
    format: "chatCompletions",
    tokenLimits: {
      max_tokens: XIAOMI_CHAT_COMPLETIONS_MAX_TOKENS,
      max_completion_tokens: XIAOMI_CHAT_COMPLETIONS_MAX_TOKENS,
    },
  },
] as const;

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as JsonRecord;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/u, "");
}

function isConfigured(
  upstream: ModelGatewayUpstream | undefined,
): upstream is ModelGatewayUpstream {
  return upstream?.enabled === true && upstream.baseUrl.trim().length > 0;
}

function resolvePath(format: ModelGatewayTargetFormat, baseUrl: string): string {
  if (format === "anthropic") {
    const path = new URL(baseUrl).pathname.replace(/\/+$/u, "");
    return path.endsWith("/v1") ? "/messages" : "/v1/messages";
  }
  if (format === "chatCompletions") {
    return "/chat/completions";
  }
  return "/responses";
}

function getUpstreamForFormat(
  gateway: ModelGatewayConfig,
  format: ModelGatewayTargetFormat,
): ModelGatewayUpstream | undefined {
  if (format === "anthropic") {
    return gateway.upstreams.anthropic;
  }
  if (format === "chatCompletions") {
    return gateway.upstreams.chatCompletions;
  }
  return gateway.upstreams.responses;
}

function selectUpstream(
  gateway: ModelGatewayConfig,
  targetFormat: ModelGatewayTargetFormat,
): UpstreamSelection {
  const orderedFormats: ModelGatewayTargetFormat[] = [
    targetFormat,
    "responses",
    "chatCompletions",
    "anthropic",
  ];
  for (const format of orderedFormats) {
    const upstream = getUpstreamForFormat(gateway, format);
    if (!isConfigured(upstream)) {
      continue;
    }
    return {
      format,
      upstream,
      url: `${trimTrailingSlash(upstream.baseUrl)}${resolvePath(format, upstream.baseUrl)}`,
    };
  }
  throw new Error(`Model gateway "${gateway.id}" has no enabled upstream`);
}

function readPartText(part: unknown): string {
  const record = asRecord(part);
  if (!record) {
    return "";
  }
  if (typeof record.text === "string") {
    return record.text;
  }
  if (typeof record.input_text === "string") {
    return record.input_text;
  }
  if (typeof record.output_text === "string") {
    return record.output_text;
  }
  return "";
}

function readTextContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content.map(readPartText).join("");
}

function normalizeRequestedModelId(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  return trimmed;
}

function findSyntheticModel(
  gateway: ModelGatewayConfig,
  requestedModel: unknown,
): SyntheticModelConfig | null {
  const normalized = normalizeRequestedModelId(requestedModel);
  if (!normalized) {
    return null;
  }
  const syntheticModels = gateway.syntheticModels ?? [];
  const exact = syntheticModels.find((model) => model.id === normalized);
  if (exact) {
    return exact;
  }
  const slashIndex = normalized.indexOf("/");
  if (slashIndex < 0) {
    return null;
  }
  const withoutProviderPrefix = normalized.slice(slashIndex + 1);
  return syntheticModels.find((model) => model.id === withoutProviderPrefix) ?? null;
}

function parseJsonObject(value: unknown): JsonRecord {
  if (typeof value !== "string" || value.trim().length === 0) {
    return {};
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return asRecord(parsed) ?? {};
  } catch {
    return {};
  }
}

function anthropicToChat(body: JsonRecord): JsonRecord {
  const messages: JsonRecord[] = [];
  const system = body.system;
  if (typeof system === "string" && system.trim().length > 0) {
    messages.push({ role: "system", content: system });
  } else if (Array.isArray(system)) {
    const text = readTextContent(system);
    if (text.trim().length > 0) {
      messages.push({ role: "system", content: text });
    }
  }

  for (const message of Array.isArray(body.messages) ? body.messages : []) {
    const record = asRecord(message);
    if (!record) {
      continue;
    }
    const content = Array.isArray(record.content) ? record.content : [];
    const toolCalls = readAnthropicToolCalls(content);
    const role = record.role === "assistant" ? "assistant" : "user";
    messages.push({
      role,
      content: readTextContent(record.content),
      ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
    });
  }

  return {
    model: body.model,
    messages,
    ...(typeof body.max_tokens === "number" ? { max_tokens: body.max_tokens } : {}),
    stream: body.stream === true,
  };
}

function readAnthropicToolCalls(content: unknown[]): JsonRecord[] {
  return content.flatMap((part) => {
    const record = asRecord(part);
    if (!record || record.type !== "tool_use") {
      return [];
    }
    return [
      {
        id: typeof record.id === "string" ? record.id : "",
        type: "function",
        function: {
          name: typeof record.name === "string" ? record.name : "",
          arguments: JSON.stringify(record.input ?? {}),
        },
      },
    ];
  });
}

function responsesToChat(body: JsonRecord): JsonRecord {
  const messages: JsonRecord[] = [];
  if (typeof body.instructions === "string" && body.instructions.trim().length > 0) {
    messages.push({ role: "system", content: body.instructions });
  }

  const input = body.input;
  if (typeof input === "string") {
    messages.push({ role: "user", content: input });
  } else if (Array.isArray(input)) {
    for (const item of input) {
      const record = asRecord(item);
      if (!record) {
        continue;
      }
      messages.push({
        role: normalizeMessageRole(record.role),
        content: readTextContent(record.content),
      });
    }
  }

  return {
    model: body.model,
    messages,
    ...(typeof body.max_output_tokens === "number" ? { max_tokens: body.max_output_tokens } : {}),
    stream: body.stream === true,
  };
}

function normalizeMessageRole(role: unknown): string {
  if (role === "developer") {
    return "system";
  }
  if (role === "assistant" || role === "system" || role === "tool") {
    return role;
  }
  return "user";
}

function chatToAnthropic(body: JsonRecord): JsonRecord {
  const messages: JsonRecord[] = [];
  const systemMessages: string[] = [];

  for (const message of Array.isArray(body.messages) ? body.messages : []) {
    const record = asRecord(message);
    if (!record) {
      continue;
    }
    appendChatMessageAsAnthropic(record, messages, systemMessages);
  }

  return {
    model: body.model,
    messages,
    ...(systemMessages.length > 0 ? { system: systemMessages.join("\n\n") } : {}),
    ...(typeof body.max_tokens === "number" ? { max_tokens: body.max_tokens } : {}),
    stream: body.stream === true,
  };
}

function appendChatMessageAsAnthropic(
  record: JsonRecord,
  messages: JsonRecord[],
  systemMessages: string[],
): void {
  const role = normalizeMessageRole(record.role);
  const contentText = readTextContent(record.content);
  if (role === "system" || role === "developer") {
    if (contentText.trim().length > 0) {
      systemMessages.push(contentText);
    }
    return;
  }
  if (role === "tool") {
    messages.push({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: typeof record.tool_call_id === "string" ? record.tool_call_id : "",
          content: contentText,
        },
      ],
    });
    return;
  }

  const content: JsonRecord[] = [];
  if (contentText.length > 0) {
    content.push({ type: "text", text: contentText });
  }
  content.push(...readChatToolUseContent(record.tool_calls));
  messages.push({ role: role === "assistant" ? "assistant" : "user", content });
}

function readChatToolUseContent(toolCalls: unknown): JsonRecord[] {
  if (!Array.isArray(toolCalls)) {
    return [];
  }
  return toolCalls.flatMap((toolCall) => {
    const toolCallRecord = asRecord(toolCall);
    const fn = asRecord(toolCallRecord?.function);
    if (!toolCallRecord || !fn) {
      return [];
    }
    return [
      {
        type: "tool_use",
        id: typeof toolCallRecord.id === "string" ? toolCallRecord.id : "",
        name: typeof fn.name === "string" ? fn.name : "",
        input: parseJsonObject(fn.arguments),
      },
    ];
  });
}

function chatToResponses(body: JsonRecord): JsonRecord {
  const input: JsonRecord[] = [];
  const instructions: string[] = [];
  for (const message of Array.isArray(body.messages) ? body.messages : []) {
    const record = asRecord(message);
    if (!record) {
      continue;
    }
    const role = normalizeMessageRole(record.role);
    const text = readTextContent(record.content);
    if (role === "system" || role === "developer") {
      if (text.trim().length > 0) {
        instructions.push(text);
      }
      continue;
    }
    input.push({
      role: role === "assistant" ? "assistant" : "user",
      content: text,
    });
  }

  return {
    model: body.model,
    input,
    ...(instructions.length > 0 ? { instructions: instructions.join("\n\n") } : {}),
    ...(typeof body.max_tokens === "number" ? { max_output_tokens: body.max_tokens } : {}),
    stream: body.stream === true,
  };
}

function anthropicToResponses(body: JsonRecord): JsonRecord {
  return chatToResponses(anthropicToChat(body));
}

function responsesToAnthropic(body: JsonRecord): JsonRecord {
  return chatToAnthropic(responsesToChat(body));
}

function normalizeChatUpstreamBody(body: JsonRecord): JsonRecord {
  const normalized = Array.isArray(body.messages)
    ? {
        ...body,
        messages: body.messages.map((message) => {
          const record = asRecord(message);
          if (!record) {
            return message;
          }
          return {
            ...record,
            role: normalizeMessageRole(record.role),
          };
        }),
      }
    : body;
  return normalized;
}

function isXiaomiChatCompletionsUpstream(
  upstreamFormat: ModelGatewayTargetFormat,
  upstream: ModelGatewayUpstream,
): boolean {
  try {
    const hostname = new URL(upstream.baseUrl).hostname;
    return UPSTREAM_COMPATIBILITY_RULES.some(
      (rule) => rule.format === upstreamFormat && rule.host === hostname,
    );
  } catch {
    return false;
  }
}

function clampTokenLimit(body: JsonRecord, key: string, limit: number): JsonRecord {
  const value = body[key];
  if (typeof value !== "number" || value <= limit) {
    return body;
  }
  return {
    ...body,
    [key]: limit,
  };
}

function applyUpstreamCompatibility(
  upstreamFormat: ModelGatewayTargetFormat,
  upstream: ModelGatewayUpstream,
  body: JsonRecord,
): JsonRecord {
  if (!isXiaomiChatCompletionsUpstream(upstreamFormat, upstream)) {
    return body;
  }

  let nextBody = body;
  for (const rule of UPSTREAM_COMPATIBILITY_RULES) {
    if (rule.format !== upstreamFormat) {
      continue;
    }
    for (const [key, limit] of Object.entries(rule.tokenLimits)) {
      nextBody = clampTokenLimit(nextBody, key, limit);
    }
  }
  return nextBody;
}

function readUsageNumber(usage: JsonRecord, primary: string, fallback?: string): number {
  if (typeof usage[primary] === "number") {
    return usage[primary];
  }
  if (fallback && typeof usage[fallback] === "number") {
    return usage[fallback];
  }
  return 0;
}

function chatToAnthropicResponse(chatResponse: JsonRecord, fallbackModel: unknown): JsonRecord {
  const choices = Array.isArray(chatResponse.choices) ? chatResponse.choices : [];
  const firstChoice = asRecord(choices[0]);
  const message = asRecord(firstChoice?.message) ?? {};
  const usage = asRecord(chatResponse.usage) ?? {};

  return {
    id: typeof chatResponse.id === "string" ? chatResponse.id : `msg_${Date.now()}`,
    type: "message",
    role: "assistant",
    model: typeof chatResponse.model === "string" ? chatResponse.model : fallbackModel,
    content: readChatMessageAsAnthropicContent(message),
    stop_reason: firstChoice?.finish_reason === "length" ? "max_tokens" : "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: readUsageNumber(usage, "prompt_tokens"),
      output_tokens: readUsageNumber(usage, "completion_tokens"),
    },
  };
}

function readChatMessageAsAnthropicContent(message: JsonRecord): JsonRecord[] {
  const content: JsonRecord[] = [];
  const text = readTextContent(message.content);
  if (text.length > 0) {
    content.push({ type: "text", text });
  }
  content.push(...readChatToolUseContent(message.tool_calls));
  return content.length > 0 ? content : [{ type: "text", text: "" }];
}

function anthropicToChatResponse(
  anthropicResponse: JsonRecord,
  fallbackModel: unknown,
): JsonRecord {
  const usage = asRecord(anthropicResponse.usage) ?? {};
  const content = Array.isArray(anthropicResponse.content) ? anthropicResponse.content : [];
  const promptTokens = readUsageNumber(usage, "input_tokens");
  const completionTokens = readUsageNumber(usage, "output_tokens");
  return {
    id: typeof anthropicResponse.id === "string" ? anthropicResponse.id : `chatcmpl_${Date.now()}`,
    object: "chat.completion",
    model: typeof anthropicResponse.model === "string" ? anthropicResponse.model : fallbackModel,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: readTextContent(content),
          ...readAnthropicToolCallsAsChat(content),
        },
        finish_reason: anthropicResponse.stop_reason === "max_tokens" ? "length" : "stop",
      },
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
  };
}

function readAnthropicToolCallsAsChat(content: unknown[]): JsonRecord {
  const toolCalls = readAnthropicToolCalls(content);
  return toolCalls.length > 0 ? { tool_calls: toolCalls } : {};
}

function readResponsesOutputText(response: JsonRecord): string {
  if (typeof response.output_text === "string") {
    return response.output_text;
  }
  if (!Array.isArray(response.output)) {
    return "";
  }
  return response.output.map((item) => readTextContent(asRecord(item)?.content)).join("");
}

function responsesToChatResponse(
  responsesResponse: JsonRecord,
  fallbackModel: unknown,
): JsonRecord {
  const usage = asRecord(responsesResponse.usage) ?? {};
  const promptTokens = readUsageNumber(usage, "input_tokens", "prompt_tokens");
  const completionTokens = readUsageNumber(usage, "output_tokens", "completion_tokens");
  return {
    id: typeof responsesResponse.id === "string" ? responsesResponse.id : `chatcmpl_${Date.now()}`,
    object: "chat.completion",
    model: typeof responsesResponse.model === "string" ? responsesResponse.model : fallbackModel,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: readResponsesOutputText(responsesResponse),
        },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
  };
}

function chatToResponsesResponse(chatResponse: JsonRecord, fallbackModel: unknown): JsonRecord {
  const choices = Array.isArray(chatResponse.choices) ? chatResponse.choices : [];
  const firstChoice = asRecord(choices[0]);
  const message = asRecord(firstChoice?.message) ?? {};
  const usage = asRecord(chatResponse.usage) ?? {};
  const text = readTextContent(message.content);
  const promptTokens = readUsageNumber(usage, "prompt_tokens");
  const completionTokens = readUsageNumber(usage, "completion_tokens");
  return {
    id: typeof chatResponse.id === "string" ? chatResponse.id : `resp_${Date.now()}`,
    object: "response",
    status: "completed",
    model: typeof chatResponse.model === "string" ? chatResponse.model : fallbackModel,
    output: [
      {
        id: `msg_${Date.now()}`,
        type: "message",
        status: "completed",
        role: "assistant",
        content: [{ type: "output_text", text }],
      },
    ],
    output_text: text,
    usage: {
      input_tokens: promptTokens,
      output_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
  };
}

function sseEvent(event: string, data: JsonRecord): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function parseStreamTextDeltas(sseText: string, format: ModelGatewayTargetFormat): string[] {
  const chunks: string[] = [];
  for (const line of sseText.split(/\r?\n/u)) {
    if (!line.startsWith("data:")) {
      continue;
    }
    const payload = line.slice("data:".length).trim();
    if (!payload || payload === "[DONE]") {
      continue;
    }
    try {
      const parsed = JSON.parse(payload) as unknown;
      const content = readStreamDelta(asRecord(parsed) ?? {}, format);
      if (content.length > 0) {
        chunks.push(content);
      }
    } catch {
      continue;
    }
  }
  return chunks;
}

function readStreamDelta(parsed: JsonRecord, format: ModelGatewayTargetFormat): string {
  if (format === "chatCompletions") {
    const choices = Array.isArray(parsed.choices) ? parsed.choices : [];
    const firstChoice = asRecord(choices[0]);
    const delta = asRecord(firstChoice?.delta) ?? {};
    return typeof delta.content === "string" ? delta.content : "";
  }
  if (format === "anthropic") {
    const delta = asRecord(parsed.delta) ?? {};
    return typeof delta.text === "string" ? delta.text : "";
  }
  return typeof parsed.delta === "string" ? parsed.delta : "";
}

function readSseBlockTextDelta(block: string, format: ModelGatewayTargetFormat): string {
  const data = block
    .split(/\r?\n/u)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trim())
    .filter((payload) => payload.length > 0 && payload !== "[DONE]")
    .join("\n");
  if (!data) {
    return "";
  }
  try {
    return readStreamDelta(asRecord(JSON.parse(data) as unknown) ?? {}, format);
  } catch {
    return "";
  }
}

function createStreamFormatter(targetFormat: ModelGatewayTargetFormat): {
  start: () => string;
  delta: (text: string) => string;
  finish: () => string;
} {
  if (targetFormat === "anthropic") {
    return {
      start: () =>
        [
          sseEvent("message_start", {
            type: "message_start",
            message: {
              id: `msg_${Date.now()}`,
              type: "message",
              role: "assistant",
              content: [],
              model: "",
              stop_reason: null,
              stop_sequence: null,
              usage: { input_tokens: 0, output_tokens: 0 },
            },
          }),
          sseEvent("content_block_start", {
            type: "content_block_start",
            index: 0,
            content_block: { type: "text", text: "" },
          }),
        ].join(""),
      delta: (text: string) =>
        sseEvent("content_block_delta", {
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text },
        }),
      finish: () =>
        [
          sseEvent("content_block_stop", { type: "content_block_stop", index: 0 }),
          sseEvent("message_stop", { type: "message_stop" }),
        ].join(""),
    };
  }

  if (targetFormat === "chatCompletions") {
    const id = `chatcmpl_${Date.now()}`;
    return {
      start: () => "",
      delta: (text: string) =>
        `data: ${JSON.stringify({
          id,
          object: "chat.completion.chunk",
          choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
        })}\n\n`,
      finish: () =>
        [
          `data: ${JSON.stringify({
            id,
            object: "chat.completion.chunk",
            choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
          })}\n\n`,
          "data: [DONE]\n\n",
        ].join(""),
    };
  }

  const responseId = `resp_${Date.now()}`;
  const itemId = `msg_${Date.now()}`;
  const chunks: string[] = [];
  return {
    start: () =>
      [
        sseEvent("response.created", {
          type: "response.created",
          response: {
            id: responseId,
            object: "response",
            status: "in_progress",
            output: [],
            output_text: "",
          },
        }),
        sseEvent("response.output_item.added", {
          type: "response.output_item.added",
          output_index: 0,
          item: {
            id: itemId,
            type: "message",
            status: "in_progress",
            role: "assistant",
            content: [],
          },
        }),
        sseEvent("response.content_part.added", {
          type: "response.content_part.added",
          item_id: itemId,
          output_index: 0,
          content_index: 0,
          part: { type: "output_text", text: "", annotations: [] },
        }),
      ].join(""),
    delta: (text: string) => {
      chunks.push(text);
      return sseEvent("response.output_text.delta", {
        type: "response.output_text.delta",
        item_id: itemId,
        output_index: 0,
        content_index: 0,
        delta: text,
      });
    },
    finish: () => {
      const fullText = chunks.join("");
      const messageItem = {
        id: itemId,
        type: "message",
        status: "completed",
        role: "assistant",
        content: [{ type: "output_text", text: fullText, annotations: [] }],
      };
      return [
        sseEvent("response.output_text.done", {
          type: "response.output_text.done",
          item_id: itemId,
          output_index: 0,
          content_index: 0,
          text: fullText,
        }),
        sseEvent("response.content_part.done", {
          type: "response.content_part.done",
          item_id: itemId,
          output_index: 0,
          content_index: 0,
          part: { type: "output_text", text: fullText, annotations: [] },
        }),
        sseEvent("response.output_item.done", {
          type: "response.output_item.done",
          output_index: 0,
          item: messageItem,
        }),
        sseEvent("response.completed", {
          type: "response.completed",
          response: {
            id: responseId,
            object: "response",
            status: "completed",
            output: [messageItem],
            output_text: fullText,
          },
        }),
        "data: [DONE]\n\n",
      ].join("");
    },
  };
}

function createStreamingTextTransform(
  targetFormat: ModelGatewayTargetFormat,
  upstreamFormat: ModelGatewayTargetFormat,
): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const formatter = createStreamFormatter(targetFormat);
  let buffer = "";

  function emit(value: string, controller: TransformStreamDefaultController<Uint8Array>): void {
    if (value.length > 0) {
      controller.enqueue(encoder.encode(value));
    }
  }

  function drainCompleteBlocks(controller: TransformStreamDefaultController<Uint8Array>): void {
    while (true) {
      const match = /\r?\n\r?\n/u.exec(buffer);
      if (!match) {
        return;
      }
      const block = buffer.slice(0, match.index);
      buffer = buffer.slice(match.index + match[0].length);
      const text = readSseBlockTextDelta(block, upstreamFormat);
      if (text.length > 0) {
        emit(formatter.delta(text), controller);
      }
    }
  }

  return new TransformStream({
    start(controller) {
      emit(formatter.start(), controller);
    },
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      drainCompleteBlocks(controller);
    },
    flush(controller) {
      buffer += decoder.decode();
      if (buffer.trim().length > 0) {
        const text = readSseBlockTextDelta(buffer, upstreamFormat);
        if (text.length > 0) {
          emit(formatter.delta(text), controller);
        }
      }
      emit(formatter.finish(), controller);
    },
  });
}

function streamTextAsAnthropic(contentChunks: string[], status: number): Response {
  const body = [
    sseEvent("message_start", {
      type: "message_start",
      message: {
        id: `msg_${Date.now()}`,
        type: "message",
        role: "assistant",
        content: [],
        model: "",
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0 },
      },
    }),
    sseEvent("content_block_start", {
      type: "content_block_start",
      index: 0,
      content_block: { type: "text", text: "" },
    }),
    ...contentChunks.map((text) =>
      sseEvent("content_block_delta", {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text },
      }),
    ),
    sseEvent("content_block_stop", { type: "content_block_stop", index: 0 }),
    sseEvent("message_stop", { type: "message_stop" }),
  ].join("");
  return new Response(body, {
    status,
    headers: { "content-type": "text/event-stream" },
  });
}

function streamTextAsChat(contentChunks: string[], status: number): Response {
  const id = `chatcmpl_${Date.now()}`;
  const body = [
    ...contentChunks.map(
      (text) =>
        `data: ${JSON.stringify({
          id,
          object: "chat.completion.chunk",
          choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
        })}\n\n`,
    ),
    `data: ${JSON.stringify({
      id,
      object: "chat.completion.chunk",
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
    })}\n\n`,
    "data: [DONE]\n\n",
  ].join("");
  return new Response(body, {
    status,
    headers: { "content-type": "text/event-stream" },
  });
}

function streamTextAsResponses(contentChunks: string[], status: number): Response {
  const responseId = `resp_${Date.now()}`;
  const itemId = `msg_${Date.now()}`;
  const fullText = contentChunks.join("");
  const messageItem = {
    id: itemId,
    type: "message",
    status: "completed",
    role: "assistant",
    content: [{ type: "output_text", text: fullText, annotations: [] }],
  };
  const body = [
    sseEvent("response.created", {
      type: "response.created",
      response: {
        id: responseId,
        object: "response",
        status: "in_progress",
        output: [],
        output_text: "",
      },
    }),
    sseEvent("response.output_item.added", {
      type: "response.output_item.added",
      output_index: 0,
      item: {
        id: itemId,
        type: "message",
        status: "in_progress",
        role: "assistant",
        content: [],
      },
    }),
    sseEvent("response.content_part.added", {
      type: "response.content_part.added",
      item_id: itemId,
      output_index: 0,
      content_index: 0,
      part: { type: "output_text", text: "", annotations: [] },
    }),
    ...contentChunks.map((text) =>
      sseEvent("response.output_text.delta", {
        type: "response.output_text.delta",
        item_id: itemId,
        output_index: 0,
        content_index: 0,
        delta: text,
      }),
    ),
    sseEvent("response.output_text.done", {
      type: "response.output_text.done",
      item_id: itemId,
      output_index: 0,
      content_index: 0,
      text: fullText,
    }),
    sseEvent("response.content_part.done", {
      type: "response.content_part.done",
      item_id: itemId,
      output_index: 0,
      content_index: 0,
      part: { type: "output_text", text: fullText, annotations: [] },
    }),
    sseEvent("response.output_item.done", {
      type: "response.output_item.done",
      output_index: 0,
      item: messageItem,
    }),
    sseEvent("response.completed", {
      type: "response.completed",
      response: {
        id: responseId,
        object: "response",
        status: "completed",
        output: [messageItem],
        output_text: fullText,
      },
    }),
    "data: [DONE]\n\n",
  ].join("");
  return new Response(body, {
    status,
    headers: { "content-type": "text/event-stream" },
  });
}

async function convertStreamResponse(
  targetFormat: ModelGatewayTargetFormat,
  upstreamFormat: ModelGatewayTargetFormat,
  response: Response,
): Promise<Response> {
  if (!response.body) {
    const sourceText = await response.text();
    const contentChunks = parseStreamTextDeltas(sourceText, upstreamFormat);
    if (targetFormat === "anthropic") {
      return streamTextAsAnthropic(contentChunks, response.status);
    }
    if (targetFormat === "chatCompletions") {
      return streamTextAsChat(contentChunks, response.status);
    }
    return streamTextAsResponses(contentChunks, response.status);
  }
  return new Response(
    response.body.pipeThrough(createStreamingTextTransform(targetFormat, upstreamFormat)),
    {
      status: response.status,
      headers: { "content-type": "text/event-stream" },
    },
  );
}

function buildUpstreamBody(
  targetFormat: ModelGatewayTargetFormat,
  upstreamFormat: ModelGatewayTargetFormat,
  requestBody: JsonRecord,
): JsonRecord {
  if (targetFormat === upstreamFormat) {
    return upstreamFormat === "chatCompletions"
      ? normalizeChatUpstreamBody(requestBody)
      : requestBody;
  }
  if (upstreamFormat === "chatCompletions") {
    const chatBody =
      targetFormat === "anthropic" ? anthropicToChat(requestBody) : responsesToChat(requestBody);
    return normalizeChatUpstreamBody(chatBody);
  }
  if (upstreamFormat === "anthropic") {
    return targetFormat === "chatCompletions"
      ? chatToAnthropic(requestBody)
      : responsesToAnthropic(requestBody);
  }
  return targetFormat === "chatCompletions"
    ? chatToResponses(requestBody)
    : anthropicToResponses(requestBody);
}

function convertJsonResponseBody(
  targetFormat: ModelGatewayTargetFormat,
  upstreamFormat: ModelGatewayTargetFormat,
  requestBody: JsonRecord,
  json: JsonRecord,
): JsonRecord {
  if (targetFormat === "anthropic") {
    const chatResponse =
      upstreamFormat === "chatCompletions"
        ? json
        : responsesToChatResponse(json, requestBody.model);
    return chatToAnthropicResponse(chatResponse, requestBody.model);
  }
  if (targetFormat === "chatCompletions") {
    return upstreamFormat === "anthropic"
      ? anthropicToChatResponse(json, requestBody.model)
      : responsesToChatResponse(json, requestBody.model);
  }
  const chatResponse =
    upstreamFormat === "anthropic" ? anthropicToChatResponse(json, requestBody.model) : json;
  return chatToResponsesResponse(chatResponse, requestBody.model);
}

async function convertUpstreamResponse(
  targetFormat: ModelGatewayTargetFormat,
  upstreamFormat: ModelGatewayTargetFormat,
  requestBody: JsonRecord,
  response: Response,
): Promise<Response> {
  if (targetFormat === upstreamFormat || !response.ok) {
    return response;
  }
  if (requestBody.stream === true) {
    return convertStreamResponse(targetFormat, upstreamFormat, response);
  }
  const json = (await response.json()) as JsonRecord;
  return Response.json(convertJsonResponseBody(targetFormat, upstreamFormat, requestBody, json), {
    status: response.status,
  });
}

function buildUpstreamHeaders(
  upstreamFormat: ModelGatewayTargetFormat,
  apiKey: string,
): HeadersInit {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`,
  };
  if (upstreamFormat === "anthropic") {
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
  }
  return headers;
}

function readChatResponseText(response: JsonRecord): string {
  const choices = Array.isArray(response.choices) ? response.choices : [];
  const firstChoice = asRecord(choices[0]);
  const message = asRecord(firstChoice?.message);
  const content = readTextContent(message?.content);
  if (content.trim().length > 0) {
    return content;
  }
  return typeof message?.reasoning_content === "string" ? message.reasoning_content : "";
}

function buildSyntheticChatResponse(model: unknown, text: string): JsonRecord {
  const modelId = typeof model === "string" && model.trim().length > 0 ? model : "synthetic";
  return {
    id: `chatcmpl_synthetic_${Date.now()}`,
    object: "chat.completion",
    model: modelId,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: text,
        },
        finish_reason: "stop",
      },
    ],
  };
}

function getChatMessages(
  targetFormat: ModelGatewayTargetFormat,
  requestBody: JsonRecord,
): JsonRecord[] {
  const chatBody =
    targetFormat === "chatCompletions"
      ? normalizeChatUpstreamBody(requestBody)
      : buildUpstreamBody(targetFormat, "chatCompletions", requestBody);
  return (Array.isArray(chatBody.messages) ? chatBody.messages : []).flatMap((message) => {
    const record = asRecord(message);
    return record ? [record] : [];
  });
}

function buildReferenceSystemPrompt(references: string[], systemPrompt?: string): string {
  const basePrompt =
    typeof systemPrompt === "string" && systemPrompt.trim().length > 0
      ? systemPrompt.trim()
      : SYNTHETIC_MODEL_SYSTEM_PROMPT;
  if (references.length === 0) {
    return basePrompt;
  }
  const referenceText = references
    .map((reference, index) => `${index + 1}. ${reference}`)
    .join("\n");
  return `${basePrompt}\n${referenceText}`;
}

function withReferenceSystemMessage(
  messages: JsonRecord[],
  references: string[],
  systemPrompt?: string,
): JsonRecord[] {
  if (references.length === 0 && !systemPrompt?.trim()) {
    return messages;
  }
  return [
    {
      role: "system",
      content: buildReferenceSystemPrompt(references, systemPrompt),
    },
    ...messages,
  ];
}

function buildSyntheticChatBody(input: {
  requestBody: JsonRecord;
  messages: JsonRecord[];
  model: string;
  parameters?: SyntheticModelParameters;
}): JsonRecord {
  const { requestBody, messages, model, parameters } = input;
  const options: JsonRecord = {};
  for (const key of SYNTHETIC_CHAT_OPTION_KEYS) {
    if (requestBody[key] !== undefined) {
      options[key] = requestBody[key];
    }
  }
  if (typeof parameters?.temperature === "number") {
    options.temperature = parameters.temperature;
  }
  if (typeof parameters?.maxTokens === "number") {
    options.max_tokens = parameters.maxTokens;
  }
  if (options.max_tokens === undefined && typeof requestBody.max_output_tokens === "number") {
    options.max_tokens = requestBody.max_output_tokens;
  }
  return {
    ...options,
    model,
    messages,
    stream: false,
  };
}

async function fetchGatewayChatCompletion(input: {
  selection: UpstreamSelection;
  chatBody: JsonRecord;
  fetchImpl: typeof fetch;
}): Promise<JsonRecord> {
  const { selection, chatBody, fetchImpl } = input;
  const upstreamBody = applyUpstreamCompatibility(
    selection.format,
    selection.upstream,
    buildUpstreamBody("chatCompletions", selection.format, chatBody),
  );
  const response = await fetchImpl(selection.url, {
    method: "POST",
    headers: buildUpstreamHeaders(selection.format, selection.upstream.apiKey),
    body: JSON.stringify(upstreamBody),
  });
  if (!response.ok) {
    throw new Error(`Synthetic model upstream request failed with HTTP ${response.status}`);
  }
  const json = (await response.json()) as JsonRecord;
  return selection.format === "chatCompletions"
    ? json
    : convertJsonResponseBody("chatCompletions", selection.format, chatBody, json);
}

function mergeSyntheticParameters(
  ...parameters: Array<SyntheticModelParameters | undefined>
): SyntheticModelParameters {
  return Object.assign({}, ...parameters.filter(Boolean));
}

function createLegacyMoaPlan(syntheticModel: SyntheticModelConfig): SyntheticModelMoa {
  const rounds = Math.max(1, Math.min(2, syntheticModel.rounds ?? 1));
  const nodes = syntheticModel.references.map((reference) => ({ model: reference.model }));
  return {
    layers: Array.from({ length: rounds }, (_, index) => ({
      id: `layer-${index + 1}`,
      label: `Layer ${index + 1}`,
      nodes,
    })),
    aggregator: { model: syntheticModel.aggregatorModel },
  };
}

function resolveSyntheticMoaPlan(syntheticModel: SyntheticModelConfig): SyntheticModelMoa {
  const plan = syntheticModel.moa ?? createLegacyMoaPlan(syntheticModel);
  return {
    ...plan,
    layers: plan.layers.slice(0, 2),
  };
}

async function runSyntheticNode(input: {
  selection: UpstreamSelection;
  fetchImpl: typeof fetch;
  requestBody: JsonRecord;
  messages: JsonRecord[];
  model: string;
  parameters?: SyntheticModelParameters;
  id?: string;
}): Promise<MoaTestNodeTrace> {
  const startedAt = performance.now();
  try {
    const chatResponse = await fetchGatewayChatCompletion({
      selection: input.selection,
      fetchImpl: input.fetchImpl,
      chatBody: buildSyntheticChatBody({
        requestBody: input.requestBody,
        messages: input.messages,
        model: input.model,
        parameters: input.parameters,
      }),
    });
    return {
      id: input.id ?? null,
      model: input.model,
      status: "success",
      output: readChatResponseText(chatResponse).trim(),
      error: null,
      durationMs: Math.round(performance.now() - startedAt),
    };
  } catch (error) {
    return {
      id: input.id ?? null,
      model: input.model,
      status: "error",
      output: null,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Math.round(performance.now() - startedAt),
    };
  }
}

async function runSyntheticModelWithTrace(input: {
  gateway: ModelGatewayConfig;
  syntheticModel: SyntheticModelConfig;
  targetFormat: ModelGatewayTargetFormat;
  requestBody: JsonRecord;
  fetchImpl: typeof fetch;
}): Promise<MoaTestResult> {
  const { gateway, syntheticModel, targetFormat, requestBody, fetchImpl } = input;
  const startedAt = performance.now();
  const messages = getChatMessages(targetFormat, requestBody);
  const selection = selectUpstream(gateway, "chatCompletions");
  const plan = resolveSyntheticMoaPlan(syntheticModel);
  const layerTraces: MoaTestLayerTrace[] = [];
  let references: string[] = [];

  for (const layer of plan.layers) {
    const layerParameters = mergeSyntheticParameters(plan.defaults, layer.parameters);
    const layerMessages = withReferenceSystemMessage(
      messages,
      references,
      layerParameters.systemPrompt,
    );
    if (layer.nodes.length === 0) {
      layerTraces.push({
        id: layer.id,
        label: layer.label ?? null,
        nodes: [],
      });
      continue;
    }
    const nodes = await Promise.all(
      layer.nodes.map((node) =>
        runSyntheticNode({
          selection,
          fetchImpl,
          requestBody,
          messages: layerMessages,
          model: node.model,
          id: node.id,
          parameters: mergeSyntheticParameters(layerParameters, node.parameters),
        }),
      ),
    );
    layerTraces.push({
      id: layer.id,
      label: layer.label ?? null,
      nodes,
    });
    references = nodes
      .filter((node) => node.status === "success" && node.output?.trim())
      .map((node) => node.output ?? "");
    if (references.length === 0) {
      throw new Error(`MoA layer "${layer.id}" produced no successful outputs`);
    }
  }

  const aggregatorStartedAt = performance.now();
  const aggregatorParameters = mergeSyntheticParameters(plan.defaults, plan.aggregator.parameters);
  try {
    const aggregateResponse = await fetchGatewayChatCompletion({
      selection,
      fetchImpl,
      chatBody: buildSyntheticChatBody({
        requestBody,
        messages: withReferenceSystemMessage(
          messages,
          references,
          aggregatorParameters.systemPrompt,
        ),
        model: plan.aggregator.model,
        parameters: aggregatorParameters,
      }),
    });
    const finalText = readChatResponseText(aggregateResponse).trim();
    return {
      finalText,
      durationMs: Math.round(performance.now() - startedAt),
      layers: layerTraces,
      aggregator: {
        model: plan.aggregator.model,
        status: "success",
        output: finalText,
        error: null,
        durationMs: Math.round(performance.now() - aggregatorStartedAt),
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      finalText: "",
      durationMs: Math.round(performance.now() - startedAt),
      layers: layerTraces,
      aggregator: {
        model: plan.aggregator.model,
        status: "error",
        output: null,
        error: message,
        durationMs: Math.round(performance.now() - aggregatorStartedAt),
      },
    };
  }
}

async function runSyntheticModel(input: {
  gateway: ModelGatewayConfig;
  syntheticModel: SyntheticModelConfig;
  targetFormat: ModelGatewayTargetFormat;
  requestBody: JsonRecord;
  fetchImpl: typeof fetch;
}): Promise<string> {
  const result = await runSyntheticModelWithTrace(input);
  if (result.aggregator.status === "error") {
    throw new Error(result.aggregator.error ?? "MoA aggregator failed");
  }
  return result.finalText;
}

export async function runSyntheticModelTest(input: {
  gateway: ModelGatewayConfig;
  syntheticModel: SyntheticModelConfig;
  prompt: string;
  fetchImpl?: typeof fetch;
}): Promise<MoaTestResult> {
  return runSyntheticModelWithTrace({
    gateway: input.gateway,
    syntheticModel: input.syntheticModel,
    targetFormat: "chatCompletions",
    requestBody: {
      model: input.syntheticModel.id,
      messages: [{ role: "user", content: input.prompt }],
    },
    fetchImpl: input.fetchImpl ?? fetch,
  });
}

function syntheticResponseForTarget(input: {
  targetFormat: ModelGatewayTargetFormat;
  requestBody: JsonRecord;
  text: string;
}): Response {
  const { targetFormat, requestBody, text } = input;
  if (requestBody.stream === true) {
    if (targetFormat === "anthropic") {
      return streamTextAsAnthropic([text], 200);
    }
    if (targetFormat === "chatCompletions") {
      return streamTextAsChat([text], 200);
    }
    return streamTextAsResponses([text], 200);
  }
  const chatResponse = buildSyntheticChatResponse(requestBody.model, text);
  const body =
    targetFormat === "chatCompletions"
      ? chatResponse
      : convertJsonResponseBody(targetFormat, "chatCompletions", requestBody, chatResponse);
  return Response.json(body, { status: 200 });
}

export async function handleModelGatewayRequest({
  gateway,
  targetFormat,
  requestBody,
  fetchImpl = fetch,
}: HandleModelGatewayRequestOptions): Promise<Response> {
  const syntheticModel = findSyntheticModel(gateway, requestBody.model);
  if (syntheticModel) {
    const text = await runSyntheticModel({
      gateway,
      syntheticModel,
      targetFormat,
      requestBody,
      fetchImpl,
    });
    return syntheticResponseForTarget({ targetFormat, requestBody, text });
  }

  const selection = selectUpstream(gateway, targetFormat);
  const upstreamBody = applyUpstreamCompatibility(
    selection.format,
    selection.upstream,
    buildUpstreamBody(targetFormat, selection.format, requestBody),
  );
  const response = await fetchImpl(selection.url, {
    method: "POST",
    headers: buildUpstreamHeaders(selection.format, selection.upstream.apiKey),
    body: JSON.stringify(upstreamBody),
  });
  return convertUpstreamResponse(targetFormat, selection.format, requestBody, response);
}
