import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { isProviderModelsQueryLoading, resolveRunningAgentModelLoading } from "./model-loading";

describe("isProviderModelsQueryLoading", () => {
  it("does not treat a disabled pending query as loading", () => {
    const queryClient = new QueryClient();
    const observer = new QueryObserver(queryClient, {
      queryKey: ["providerModels", "server-1", "__missing_provider__"],
      enabled: false,
      queryFn: async () => [],
    });

    const result = observer.getCurrentResult();

    expect(result.isPending).toBe(true);
    expect(result.isLoading).toBe(false);
    expect(result.isFetching).toBe(false);
    expect(isProviderModelsQueryLoading(result)).toBe(false);
  });

  it("treats an active fetch as loading", () => {
    expect(
      isProviderModelsQueryLoading({
        isLoading: false,
        isFetching: true,
      }),
    ).toBe(true);
  });
});

describe("resolveRunningAgentModelLoading", () => {
  it("does not show loading for a running agent that already reports a model", () => {
    expect(
      resolveRunningAgentModelLoading({
        configuredModelId: "gpt-5",
        runtimeModelId: null,
        runtimeProvider: "codex",
        runtimeEntry: {
          provider: "codex",
          status: "loading",
          enabled: true,
          label: "Codex",
          models: [],
        },
        selectedEntry: {
          provider: "mock",
          status: "loading",
          enabled: true,
          label: "Mock",
          models: [],
        },
      }),
    ).toBe(false);
  });

  it("keeps loading when the runtime provider is still loading and the agent has no model", () => {
    expect(
      resolveRunningAgentModelLoading({
        configuredModelId: null,
        runtimeModelId: null,
        runtimeProvider: "codex",
        runtimeEntry: {
          provider: "codex",
          status: "loading",
          enabled: true,
          label: "Codex",
          models: [],
        },
        selectedEntry: {
          provider: "mock",
          status: "ready",
          enabled: true,
          label: "Mock",
          models: [],
        },
      }),
    ).toBe(true);
  });
});
