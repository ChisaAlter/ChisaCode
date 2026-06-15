import { describe, expect, it } from "vitest";
import {
  buildDisableCustomModelProviderPatch,
  buildModelGatewayProviderIds,
  buildSaveCustomModelProviderPatch,
  collectCustomModelProviders,
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
          },
        },
      },
    });
  });

  it("returns the three generated provider IDs for a gateway", () => {
    expect(buildModelGatewayProviderIds("zai")).toEqual({
      claudeProviderId: "zai-claude",
      codexProviderId: "zai-codex",
      opencodeProviderId: "zai-opencode",
    });
  });

  it("disables an omitted gateway format while preserving the remaining format", () => {
    const currentGateways = {
      zai: {
        id: "zai",
        label: "ZAI",
        enabled: true,
        models: [{ id: "glm-5", label: "GLM 5", isDefault: true }],
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
          },
          generatedModels: {
            opencode: [{ id: "openai/glm-5", label: "glm-5", isDefault: true }],
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
});
