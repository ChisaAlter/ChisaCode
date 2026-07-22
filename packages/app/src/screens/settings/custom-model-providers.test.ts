import { describe, expect, it } from "vitest";
import {
  buildDeleteSavedModelPatch,
  buildDisableCustomModelProviderPatch,
  buildModelGatewayProviderIds,
  buildSaveCustomModelProviderPatch,
  buildSaveOpenAiCompatibleModelPatch,
  collectCustomModelProviders,
  collectSavedModels,
} from "@/screens/settings/custom-model-providers";
import type { MutableDaemonConfig } from "@chisacode/protocol/messages";

function makeProviders(
  providers: MutableDaemonConfig["providers"],
): MutableDaemonConfig["providers"] {
  return providers;
}

describe("custom model provider helpers", () => {
  it("builds one model gateway from one supplier with three supported upstream formats", () => {
    expect(
      buildSaveCustomModelProviderPatch({
        currentGateways: {},
        id: "zai",
        label: "ZAI",
        models: [
          {
            id: "glm-5",
            contextWindowMaxTokens: 200_000,
            supportsImages: true,
          },
          { id: "glm-5-air" },
        ],
        anthropic: {
          enabled: true,
          baseUrl: "https://api.z.ai/api/anthropic",
          apiKey: "sk-anthropic",
        },
        openai: {
          enabled: true,
          baseUrl: "https://api.z.ai/v1",
          apiKey: "sk-openai",
          wireApi: "responses",
        },
        responses: {
          enabled: true,
          baseUrl: "https://api.z.ai/responses",
          apiKey: "sk-responses",
        },
      }),
    ).toEqual({
      modelGateways: {
        zai: {
          id: "zai",
          label: "ZAI",
          enabled: true,
          protocolPreset: "all",
          models: [
            {
              id: "glm-5",
              label: "glm-5",
              contextWindowMaxTokens: 200_000,
              supportsImages: true,
              isDefault: true,
            },
            { id: "glm-5-air", label: "glm-5-air" },
          ],
          upstreams: {
            anthropic: {
              enabled: true,
              baseUrl: "https://api.z.ai/api/anthropic",
              apiKey: "sk-anthropic",
            },
            chatCompletions: {
              enabled: true,
              baseUrl: "https://api.z.ai/v1",
              apiKey: "sk-openai",
            },
            responses: {
              enabled: true,
              baseUrl: "https://api.z.ai/responses",
              apiKey: "sk-responses",
            },
          },
          generatedProviderIds: {
            claude: "zai-claude",
            codex: "zai-codex",
            opencode: "zai-opencode",
            mimocode: "zai-mimocode",
            pi: "zai-pi",
            kimi: "zai-kimi",
          },
          generatedModels: {
            opencode: [
              {
                id: "openai/glm-5",
                label: "glm-5",
                contextWindowMaxTokens: 200_000,
                supportsImages: true,
                isDefault: true,
              },
              { id: "openai/glm-5-air", label: "glm-5-air" },
            ],
            mimocode: [
              {
                id: "openai/glm-5",
                label: "glm-5",
                contextWindowMaxTokens: 200_000,
                supportsImages: true,
                isDefault: true,
              },
              { id: "openai/glm-5-air", label: "glm-5-air" },
            ],
            pi: [
              {
                id: "openai/glm-5",
                label: "glm-5",
                contextWindowMaxTokens: 200_000,
                supportsImages: true,
                isDefault: true,
              },
              { id: "openai/glm-5-air", label: "glm-5-air" },
            ],
            kimi: [
              {
                id: "glm-5",
                label: "glm-5",
                contextWindowMaxTokens: 200_000,
                supportsImages: true,
                isDefault: true,
              },
              { id: "glm-5-air", label: "glm-5-air" },
            ],
          },
        },
      },
    });
  });

  it("returns generated provider IDs for every built-in agent", () => {
    expect(buildModelGatewayProviderIds("zai")).toEqual({
      claudeProviderId: "zai-claude",
      codexProviderId: "zai-codex",
      opencodeProviderId: "zai-opencode",
      mimocodeProviderId: "zai-mimocode",
      piProviderId: "zai-pi",
      kimiProviderId: "zai-kimi",
    });
  });

  it("disables an omitted gateway format while preserving the remaining format", () => {
    const currentGateways = {
      zai: {
        id: "zai",
        label: "ZAI",
        enabled: true,
        models: [{ id: "glm-5", label: "GLM 5", isDefault: true }],
        syntheticModels: [],
        upstreams: {
          anthropic: {
            enabled: true,
            baseUrl: "https://api.z.ai/api/anthropic",
            apiKey: "sk-anthropic",
          },
          chatCompletions: {
            enabled: true,
            baseUrl: "https://api.z.ai/v1",
            apiKey: "sk-openai",
          },
          responses: {
            enabled: false,
            baseUrl: "",
            apiKey: "",
          },
        },
      },
    } satisfies NonNullable<MutableDaemonConfig["modelGateways"]>;

    expect(
      buildSaveCustomModelProviderPatch({
        currentGateways,
        previousId: "zai",
        id: "zai",
        label: "ZAI",
        models: ["glm-5"],
        anthropic: {
          enabled: false,
          baseUrl: "",
          apiKey: "",
        },
        openai: {
          enabled: true,
          baseUrl: "https://api.z.ai/v1",
          apiKey: "sk-openai",
          wireApi: "chat",
        },
        responses: {
          enabled: false,
          baseUrl: "",
          apiKey: "",
        },
      }),
    ).toEqual({
      modelGateways: {
        zai: {
          id: "zai",
          label: "ZAI",
          enabled: true,
          protocolPreset: "openai",
          models: [{ id: "glm-5", label: "glm-5", isDefault: true }],
          upstreams: {
            anthropic: {
              enabled: false,
              baseUrl: "",
              apiKey: "",
            },
            chatCompletions: {
              enabled: true,
              baseUrl: "https://api.z.ai/v1",
              apiKey: "sk-openai",
            },
            responses: {
              enabled: false,
              baseUrl: "",
              apiKey: "",
            },
          },
          generatedProviderIds: {
            claude: "zai-claude",
            codex: "zai-codex",
            opencode: "zai-opencode",
            mimocode: "zai-mimocode",
            pi: "zai-pi",
            kimi: "zai-kimi",
          },
          generatedModels: {
            opencode: [{ id: "openai/glm-5", label: "glm-5", isDefault: true }],
            mimocode: [{ id: "openai/glm-5", label: "glm-5", isDefault: true }],
            pi: [{ id: "openai/glm-5", label: "glm-5", isDefault: true }],
            kimi: [{ id: "glm-5", label: "glm-5", isDefault: true }],
          },
        },
      },
    });
  });

  it("collects legacy paired provider entries back into supplier rows", () => {
    const providers = makeProviders({
      "zai-anthropic": {
        extends: "claude",
        label: "ZAI Anthropic",
        env: {
          ANTHROPIC_BASE_URL: "https://api.z.ai/api/anthropic",
          ANTHROPIC_AUTH_TOKEN: "secret",
        },
        models: [{ id: "glm-5", label: "GLM 5", isDefault: true }],
        enabled: true,
      },
      "zai-openai": {
        extends: "codex",
        label: "ZAI OpenAI",
        env: {
          OPENAI_BASE_URL: "https://api.z.ai/v1",
          OPENAI_API_KEY: "secret",
          OPENAI_WIRE_API: "chat",
        },
        models: [{ id: "glm-5", label: "GLM 5", isDefault: true }],
        enabled: true,
      },
    });

    expect(collectCustomModelProviders(undefined, providers)).toEqual([
      {
        id: "zai",
        label: "ZAI",
        providerIds: ["zai-anthropic", "zai-openai"],
        models: [{ id: "glm-5", label: "GLM 5", isDefault: true }],
        anthropic: {
          providerId: "zai-anthropic",
          enabled: true,
          baseUrl: "https://api.z.ai/api/anthropic",
          hasApiKey: true,
        },
        openai: {
          providerId: "zai-openai",
          enabled: true,
          baseUrl: "https://api.z.ai/v1",
          hasApiKey: true,
          wireApi: "chat",
        },
        responses: null,
      },
    ]);
  });

  it("builds a disable patch for a gateway", () => {
    expect(buildDisableCustomModelProviderPatch("zai")).toEqual({
      modelGateways: {
        zai: { enabled: false },
      },
    });
  });

  it("flattens enabled gateway models into saved-model rows", () => {
    const gateways = {
      zai: {
        id: "zai",
        label: "ZAI",
        enabled: true,
        models: [
          {
            id: "glm-5",
            label: "GLM 5",
            isDefault: true,
            supportsTools: true,
            thinkingOptions: [{ id: "default", label: "Thinking", isDefault: true }],
          },
          { id: "glm-5-air", label: "GLM 5 Air", supportsImages: true },
        ],
        syntheticModels: [],
        upstreams: {
          anthropic: { enabled: false, baseUrl: "", apiKey: "" },
          chatCompletions: {
            enabled: true,
            baseUrl: "https://api.z.ai/v1",
            apiKey: "sk",
          },
          responses: { enabled: false, baseUrl: "", apiKey: "" },
        },
      },
      disabled: {
        id: "disabled",
        label: "Disabled",
        enabled: false,
        models: [{ id: "hidden", label: "Hidden" }],
        syntheticModels: [],
        upstreams: {
          anthropic: { enabled: false, baseUrl: "", apiKey: "" },
          chatCompletions: { enabled: false, baseUrl: "", apiKey: "" },
          responses: { enabled: false, baseUrl: "", apiKey: "" },
        },
      },
    } satisfies NonNullable<MutableDaemonConfig["modelGateways"]>;

    expect(collectSavedModels(gateways)).toEqual([
      {
        key: "zai:glm-5",
        gatewayId: "zai",
        gatewayLabel: "ZAI",
        modelId: "glm-5",
        label: "GLM 5",
        supportsTools: true,
        supportsThinking: true,
        thinkingMode: "single",
        protocolPreset: "openai",
        providerIds: ["zai-opencode", "zai-mimocode", "zai-pi", "zai-kimi"],
        baseUrl: "https://api.z.ai/v1",
      },
      {
        key: "zai:glm-5-air",
        gatewayId: "zai",
        gatewayLabel: "ZAI",
        modelId: "glm-5-air",
        label: "GLM 5 Air",
        supportsImages: true,
        thinkingMode: "off",
        protocolPreset: "openai",
        providerIds: ["zai-opencode", "zai-mimocode", "zai-pi", "zai-kimi"],
        baseUrl: "https://api.z.ai/v1",
      },
    ]);
  });

  it("saves an OpenAI-compatible model as a chatCompletions-only gateway", () => {
    const patch = buildSaveOpenAiCompatibleModelPatch({
      currentGateways: {},
      modelId: "gpt-4o",
      label: "GPT-4o",
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk-test",
      supportsTools: true,
      supportsImages: true,
      thinkingMode: "levels",
      protocolPreset: "openai",
      contextWindowMaxTokens: 131_072,
    });

    expect(patch.modelGateways?.["gpt-4o"]).toMatchObject({
      id: "gpt-4o",
      label: "GPT-4o",
      enabled: true,
      protocolPreset: "openai",
      models: [
        {
          id: "gpt-4o",
          label: "GPT-4o",
          supportsTools: true,
          supportsImages: true,
          contextWindowMaxTokens: 131_072,
          thinkingOptions: [
            { id: "low", label: "Low" },
            { id: "medium", label: "Medium", isDefault: true },
            { id: "high", label: "High" },
          ],
          isDefault: true,
        },
      ],
      upstreams: {
        anthropic: { enabled: false, baseUrl: "", apiKey: "" },
        chatCompletions: {
          enabled: true,
          baseUrl: "https://api.example.com/v1",
          apiKey: "sk-test",
        },
        responses: { enabled: false, baseUrl: "", apiKey: "" },
      },
    });
  });

  it("merges a model into an existing multi-model gateway and deletes one model without removing the rest", () => {
    const currentGateways = {
      zai: {
        id: "zai",
        label: "ZAI",
        enabled: true,
        models: [
          { id: "glm-5", label: "GLM 5", isDefault: true },
          { id: "glm-5-air", label: "GLM 5 Air" },
        ],
        syntheticModels: [],
        upstreams: {
          anthropic: { enabled: false, baseUrl: "", apiKey: "" },
          chatCompletions: {
            enabled: true,
            baseUrl: "https://api.z.ai/v1",
            apiKey: "sk",
          },
          responses: { enabled: false, baseUrl: "", apiKey: "" },
        },
      },
    } satisfies NonNullable<MutableDaemonConfig["modelGateways"]>;

    const savePatch = buildSaveOpenAiCompatibleModelPatch({
      currentGateways,
      gatewayId: "zai",
      previousModelId: "glm-5-air",
      modelId: "glm-5-air",
      label: "GLM 5 Air",
      baseUrl: "https://api.z.ai/v1",
      apiKey: "sk",
      supportsImages: true,
    });

    expect(savePatch.modelGateways?.zai?.models).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "glm-5" }),
        expect.objectContaining({ id: "glm-5-air", supportsImages: true }),
      ]),
    );

    const deleteOne = buildDeleteSavedModelPatch({
      currentGateways,
      gatewayId: "zai",
      modelId: "glm-5-air",
    });
    expect(deleteOne.modelGateways?.zai?.models).toEqual([
      expect.objectContaining({ id: "glm-5", label: "GLM 5" }),
    ]);

    const deleteLast = buildDeleteSavedModelPatch({
      currentGateways: {
        zai: {
          ...currentGateways.zai,
          models: [{ id: "glm-5", label: "GLM 5", isDefault: true }],
        },
      },
      gatewayId: "zai",
      modelId: "glm-5",
    });
    expect(deleteLast).toEqual({
      modelGateways: {
        zai: { enabled: false },
      },
    });
  });
});
