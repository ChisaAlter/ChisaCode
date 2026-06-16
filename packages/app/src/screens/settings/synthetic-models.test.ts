import { describe, expect, it } from "vitest";
import {
  buildDeleteSyntheticModelPatch,
  buildSaveSyntheticModelPatch,
  collectSyntheticModelGateways,
  collectSyntheticModels,
} from "@/screens/settings/synthetic-models";
import type { MutableDaemonConfig } from "@chisacode/protocol/messages";

const modelGateways = {
  zai: {
    id: "zai",
    label: "ZAI",
    enabled: true,
    models: [
      { id: "glm-5", label: "GLM 5", isDefault: true },
      { id: "glm-5-air", label: "GLM 5 Air" },
      { id: "glm-4.6", label: "GLM 4.6" },
    ],
    syntheticModels: [
      {
        id: "moa-coder",
        label: "MoA Coder",
        references: [{ model: "glm-5" }, { model: "glm-5-air" }],
        aggregatorModel: "glm-5",
        rounds: 1,
      },
    ],
    upstreams: {
      anthropic: { enabled: false, baseUrl: "", apiKey: "" },
      chatCompletions: { enabled: true, baseUrl: "https://api.z.ai/v1", apiKey: "sk-chat" },
      responses: { enabled: false, baseUrl: "", apiKey: "" },
    },
  },
} satisfies NonNullable<MutableDaemonConfig["modelGateways"]>;

describe("synthetic model helpers", () => {
  it("collects configured synthetic model gateways and models", () => {
    expect(collectSyntheticModelGateways(modelGateways)).toMatchObject([
      {
        id: "zai",
        label: "ZAI",
        models: [{ id: "glm-5" }, { id: "glm-5-air" }, { id: "glm-4.6" }],
      },
    ]);
    expect(collectSyntheticModels(modelGateways)).toEqual([
      {
        id: "moa-coder",
        label: "MoA Coder",
        references: [{ model: "glm-5" }, { model: "glm-5-air" }],
        aggregatorModel: "glm-5",
        rounds: 1,
        gatewayId: "zai",
        gatewayLabel: "ZAI",
      },
    ]);
  });

  it("builds a gateway patch for a synthetic model", () => {
    expect(
      buildSaveSyntheticModelPatch({
        currentGateways: modelGateways,
        previousGatewayId: "zai",
        previousId: "moa-coder",
        gatewayId: "zai",
        id: "moa-reviewer",
        label: "MoA Reviewer",
        references: ["glm-5", "glm-4.6"],
        aggregatorModel: "glm-5",
        rounds: 2,
      }),
    ).toEqual({
      modelGateways: {
        zai: {
          models: modelGateways.zai.models,
          syntheticModels: [
            {
              id: "moa-reviewer",
              label: "MoA Reviewer",
              references: [{ model: "glm-5" }, { model: "glm-4.6" }],
              aggregatorModel: "glm-5",
              rounds: 2,
            },
          ],
        },
      },
    });
  });

  it("builds a delete patch for a synthetic model", () => {
    expect(
      buildDeleteSyntheticModelPatch({
        currentGateways: modelGateways,
        gatewayId: "zai",
        id: "moa-coder",
      }),
    ).toEqual({
      modelGateways: {
        zai: {
          models: modelGateways.zai.models,
          syntheticModels: [],
        },
      },
    });
  });
});
