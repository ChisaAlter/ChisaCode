import type { ProviderSnapshotEntry } from "@chisacode/protocol/agent-types";
import { describe, expect, it } from "vitest";

import { resolveRunningAgentModelControls } from "./running-agent-model-controls";

describe("resolveRunningAgentModelControls", () => {
  it("keeps gateway models grouped under the agent provider and filters to the runtime provider", () => {
    const snapshotEntries: ProviderSnapshotEntry[] = [
      {
        provider: "opencode",
        label: "OpenCode",
        enabled: true,
        status: "ready",
        models: [
          {
            id: "native-model",
            provider: "opencode",
            label: "Native model",
          },
        ],
      },
      {
        provider: "openrouter",
        label: "OpenRouter",
        enabled: true,
        status: "ready",
        derivedFromProviderId: "opencode",
        modelGatewayId: "openrouter",
        models: [
          {
            id: "gateway-model",
            provider: "openrouter",
            label: "Gateway model",
            thinkingOptions: [
              { id: "low", label: "Low" },
              { id: "high", label: "High" },
            ],
            defaultThinkingOptionId: "low",
          },
        ],
      },
    ];

    const result = resolveRunningAgentModelControls({
      agent: {
        provider: "opencode",
        runtimeProvider: "openrouter",
        runtimeModelId: "gateway-model",
        model: "gateway-model",
        thinkingOptionId: "high",
      },
      snapshotEntries,
      defaultModelLabel: "Default",
      unavailable: "Unavailable",
      unknownError: "Unknown error",
    });

    expect(result.agentProvider).toBe("opencode");
    expect(result.agentRuntimeProvider).toBe("openrouter");
    expect(result.agentModelSelectorProviders).toHaveLength(1);
    expect(result.agentModelSelectorProviders[0]?.id).toBe("opencode");
    expect(result.agentModelSelectorProviders[0]?.modelSelection).toEqual({
      kind: "models",
      rows: [
        expect.objectContaining({
          agentProvider: "opencode",
          runtimeProvider: "openrouter",
          modelId: "gateway-model",
        }),
      ],
    });
    expect(result.modelOptions).toEqual([{ id: "gateway-model", label: "Gateway model" }]);
    expect(result.modelSelection.activeModelId).toBe("gateway-model");
    expect(result.modelSelection.selectedThinkingId).toBe("high");
    expect(result.thinkingOptions).toEqual([
      { id: "low", label: "低" },
      { id: "high", label: "高" },
    ]);
    expect(result.selectedProviderIsLoading).toBe(false);
  });
});
