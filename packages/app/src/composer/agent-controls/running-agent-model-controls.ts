import { useMemo } from "react";
import type { AgentModelDefinition, ProviderSnapshotEntry } from "@chisacode/protocol/agent-types";
import type { AgentProviderDefinition } from "@chisacode/protocol/provider-manifest";

import {
  buildProviderSelectorProviders,
  buildSelectableProviderSelectorProviders,
  filterProviderSelectorProvidersByRuntimeProvider,
  type ProviderSelectorProvider,
} from "@/provider-selection/provider-selection";
import { resolveRunningAgentModelLoading } from "@/composer/agent-controls/model-loading";
import {
  formatThinkingOptionLabel,
  resolveAgentModelSelection,
} from "@/composer/agent-controls/utils";
import { resolveProviderDefinition } from "@/utils/provider-definitions";

interface RunningAgentModelAgent {
  provider: string;
  runtimeProvider: string | null;
  runtimeModelId: string | null;
  model: string | null | undefined;
  thinkingOptionId: string | null | undefined;
}

interface RunningAgentModelControlsInput {
  agent: RunningAgentModelAgent | null;
  snapshotEntries: ProviderSnapshotEntry[] | undefined;
  defaultModelLabel: string;
  unavailable: string;
  unknownError: string;
}

function resolveSnapshotSelectedEntry(
  snapshotEntries: ProviderSnapshotEntry[] | undefined,
  agentProvider: string | undefined,
) {
  if (!snapshotEntries || !agentProvider) {
    return null;
  }
  return snapshotEntries.find((entry) => entry.provider === agentProvider) ?? null;
}

function buildAgentProviderDefinitions(
  agentProvider: string | undefined,
  snapshotEntries: ProviderSnapshotEntry[] | undefined,
): AgentProviderDefinition[] {
  const definition = agentProvider
    ? resolveProviderDefinition(agentProvider, snapshotEntries)
    : undefined;
  return definition ? [definition] : [];
}

function buildAgentProviderModels(
  agentProvider: string | undefined,
  models: AgentModelDefinition[] | null,
): Map<string, AgentModelDefinition[]> {
  const map = new Map<string, AgentModelDefinition[]>();
  if (agentProvider && models) {
    map.set(agentProvider, models);
  }
  return map;
}

function resolveAgentRuntimeProvider(agent: RunningAgentModelAgent | null): string | null {
  return agent?.runtimeProvider ?? agent?.provider ?? null;
}

function resolveProviderModels(input: {
  runtimeEntry: ProviderSnapshotEntry | null;
  selectedEntry: ProviderSnapshotEntry | null;
}): AgentModelDefinition[] | null {
  return input.runtimeEntry?.models ?? input.selectedEntry?.models ?? null;
}

function buildRunningAgentModelSelectorProviders(input: {
  agentProvider: string | undefined;
  agentRuntimeProvider: string | null;
  snapshotEntries: ProviderSnapshotEntry[] | undefined;
  selectedEntry: ProviderSnapshotEntry | null;
  providerDefinitions: AgentProviderDefinition[];
  modelsByProvider: Map<string, AgentModelDefinition[]>;
  copy: {
    defaultModelLabel: string;
    unavailable: string;
    unknownError: string;
  };
}): ProviderSelectorProvider[] {
  const filterToRuntime = (providers: ProviderSelectorProvider[]) =>
    filterProviderSelectorProvidersByRuntimeProvider(providers, input.agentRuntimeProvider);
  const groupedProviders = filterToRuntime(
    buildSelectableProviderSelectorProviders(input.snapshotEntries, {
      defaultModelLabel: input.copy.defaultModelLabel,
      unavailable: input.copy.unavailable,
      unknownError: input.copy.unknownError,
    }).filter((provider) => provider.id === input.agentProvider),
  );
  if (groupedProviders.length > 0) {
    return groupedProviders;
  }
  if (input.selectedEntry) {
    return filterToRuntime(
      buildSelectableProviderSelectorProviders([input.selectedEntry], {
        defaultModelLabel: input.copy.defaultModelLabel,
        unavailable: input.copy.unavailable,
        unknownError: input.copy.unknownError,
      }),
    );
  }
  return filterToRuntime(
    buildProviderSelectorProviders({
      providerDefinitions: input.providerDefinitions,
      modelsByProvider: input.modelsByProvider,
      copy: {
        defaultModelLabel: input.copy.defaultModelLabel,
      },
    }),
  );
}

export function resolveRunningAgentModelControls(input: RunningAgentModelControlsInput) {
  const { agent, snapshotEntries } = input;
  const agentProvider = agent?.provider;
  const agentRuntimeProvider = resolveAgentRuntimeProvider(agent);
  const snapshotSelectedEntry = resolveSnapshotSelectedEntry(snapshotEntries, agentProvider);
  const snapshotRuntimeEntry = resolveSnapshotSelectedEntry(
    snapshotEntries,
    agentRuntimeProvider ?? undefined,
  );
  const models = resolveProviderModels({
    runtimeEntry: snapshotRuntimeEntry,
    selectedEntry: snapshotSelectedEntry,
  });
  const selectedProviderIsLoading = resolveRunningAgentModelLoading({
    configuredModelId: agent?.model,
    runtimeModelId: agent?.runtimeModelId,
    runtimeProvider: agentRuntimeProvider,
    runtimeEntry: snapshotRuntimeEntry,
    selectedEntry: snapshotSelectedEntry,
  });
  const providerDefinitions = buildAgentProviderDefinitions(agentProvider, snapshotEntries);
  const modelsByProvider = buildAgentProviderModels(agentProvider, models);
  const agentModelSelectorProviders = buildRunningAgentModelSelectorProviders({
    agentProvider,
    agentRuntimeProvider,
    snapshotEntries,
    selectedEntry: snapshotSelectedEntry,
    providerDefinitions,
    modelsByProvider,
    copy: {
      defaultModelLabel: input.defaultModelLabel,
      unavailable: input.unavailable,
      unknownError: input.unknownError,
    },
  });
  const modelSelection = resolveAgentModelSelection({
    models,
    runtimeModelId: agent?.runtimeModelId,
    configuredModelId: agent?.model,
    explicitThinkingOptionId: agent?.thinkingOptionId,
  });
  const modelOptions = (models ?? []).map((model) => ({ id: model.id, label: model.label }));
  const thinkingOptions = (modelSelection.thinkingOptions ?? []).map((option) => ({
    id: option.id,
    label: formatThinkingOptionLabel(option),
  }));

  return {
    agentProvider,
    agentRuntimeProvider,
    agentModelSelectorProviders,
    modelOptions,
    modelSelection,
    selectedProviderIsLoading,
    thinkingOptions,
  };
}

export function useRunningAgentModelControls(input: RunningAgentModelControlsInput) {
  const { agent, defaultModelLabel, snapshotEntries, unavailable, unknownError } = input;
  return useMemo(
    () =>
      resolveRunningAgentModelControls({
        agent,
        defaultModelLabel,
        snapshotEntries,
        unavailable,
        unknownError,
      }),
    [agent, defaultModelLabel, snapshotEntries, unavailable, unknownError],
  );
}
