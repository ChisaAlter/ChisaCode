import { describe, expect, it } from "vitest";
import {
  buildDisableCustomModelProviderPatch,
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
  it("builds anthopic and openai provider overrides from one supplier", () => {
    expect(
      buildSaveCustomModelProviderPatch({
        currentProviders: {},
        id: "zai",
        label: "ZAI",
        models: ["glm-5", "glm-5-air"],
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
      }),
    ).toEqual({
      providers: {
        "zai-anthropic": {
          extends: "claude",
          label: "ZAI Anthropic",
          env: {
            ANTHROPIC_AUTH_TOKEN: "sk-anthropic",
            ANTHROPIC_BASE_URL: "https://api.z.ai/api/anthropic",
          },
          disallowedTools: ["WebSearch"],
          models: [
            { id: "glm-5", label: "glm-5", isDefault: true },
            { id: "glm-5-air", label: "glm-5-air" },
          ],
          enabled: true,
        },
        "zai-openai": {
          extends: "codex",
          label: "ZAI OpenAI",
          env: {
            OPENAI_API_KEY: "sk-openai",
            OPENAI_BASE_URL: "https://api.z.ai/v1",
            OPENAI_WIRE_API: "responses",
          },
          models: [
            { id: "glm-5", label: "glm-5", isDefault: true },
            { id: "glm-5-air", label: "glm-5-air" },
          ],
          enabled: true,
        },
      },
    });
  });

  it("disables an omitted format while preserving the remaining format", () => {
    const currentProviders = makeProviders({
      "zai-anthropic": {
        extends: "claude",
        label: "ZAI Anthropic",
        enabled: true,
      },
      "zai-openai": {
        extends: "codex",
        label: "ZAI OpenAI",
        enabled: true,
      },
    });

    expect(
      buildSaveCustomModelProviderPatch({
        currentProviders,
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
      }),
    ).toEqual({
      providers: {
        "zai-anthropic": { enabled: false },
        "zai-openai": {
          extends: "codex",
          label: "ZAI OpenAI",
          env: {
            OPENAI_API_KEY: "sk-openai",
            OPENAI_BASE_URL: "https://api.z.ai/v1",
            OPENAI_WIRE_API: "chat",
          },
          models: [{ id: "glm-5", label: "glm-5", isDefault: true }],
          enabled: true,
        },
      },
    });
  });

  it("collects paired provider entries back into supplier rows", () => {
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

    expect(collectCustomModelProviders(providers)).toEqual([
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
      },
    ]);
  });

  it("builds a disable patch for every generated provider id", () => {
    expect(buildDisableCustomModelProviderPatch("zai")).toEqual({
      providers: {
        "zai-anthropic": { enabled: false },
        "zai-openai": { enabled: false },
      },
    });
  });
});
