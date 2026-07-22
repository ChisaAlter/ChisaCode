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
import { buildFavoriteModelKey } from "@/hooks/use-form-preferences";
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

/**
 * Gateway snapshot entries are folded into their base provider id for draft
 * selection (e.g. "grok-4-5-codex" → models under "codex"). Running sessions
 * store agent.provider as the generated gateway id, so filter matches must also
 * accept providers that only appear via rows with that runtimeProvider.
 */
function filterProvidersForRunningAgent(
  providers: ProviderSelectorProvider[],
  agentProvider: string | undefined,
): ProviderSelectorProvider[] {
  if (!agentProvider) {
    return providers;
  }
  const exact = providers.filter((provider) => provider.id === agentProvider);
  if (exact.length > 0) {
    return exact;
  }

  const matched: ProviderSelectorProvider[] = [];
  for (const provider of providers) {
    if (provider.modelSelection.kind !== "models") {
      continue;
    }
    const rows = provider.modelSelection.rows.filter(
      (row) =>
        row.runtimeProvider === agentProvider ||
        row.provider === agentProvider ||
        row.agentProvider === agentProvider,
    );
    if (rows.length === 0) {
      continue;
    }
    matched.push({
      id: agentProvider,
      label: provider.label,
      modelSelection: {
        kind: "models",
        rows: rows.map((row) => Object.assign({}, row, { agentProvider })),
      },
    });
  }
  return matched;
}

function buildStandaloneGatewayModelSelection(
  entry: ProviderSnapshotEntry,
  label: string,
  copy: {
    unavailable: string;
    unknownError: string;
  },
): ProviderSelectorProvider["modelSelection"] {
  const models = entry.models ?? [];
  if (models.length > 0) {
    return {
      kind: "models",
      rows: models.map((model) => ({
        favoriteKey: buildFavoriteModelKey({
          provider: entry.provider,
          modelId: model.id,
        }),
        provider: entry.provider,
        agentProvider: entry.provider,
        runtimeProvider: entry.provider,
        providerLabel: label,
        modelId: model.id,
        modelLabel: model.label,
        description: model.description,
        isDefault: model.isDefault,
      })),
    };
  }
  if (entry.status === "loading") {
    return { kind: "loading" };
  }
  return {
    kind: "error",
    message: entry.error ?? (entry.status === "unavailable" ? copy.unavailable : copy.unknownError),
  };
}

function buildStandaloneGatewaySelectorProviders(
  entry: ProviderSnapshotEntry,
  copy: {
    defaultModelLabel: string;
    unavailable: string;
    unknownError: string;
  },
): ProviderSelectorProvider[] {
  const selectableEntry = entry as ProviderSnapshotEntry & {
    derivedFromProviderId?: string | null;
    modelGatewayId?: string | null;
  };
  // When the only matching entry is a gateway, buildSelectable drops it unless
  // its base is also present. Force a top-level provider for the running agent.
  if (selectableEntry.modelGatewayId && selectableEntry.derivedFromProviderId) {
    const label = entry.label ?? entry.provider;
    return [
      {
        id: entry.provider,
        label,
        modelSelection: buildStandaloneGatewayModelSelection(entry, label, copy),
      },
    ];
  }
  return buildSelectableProviderSelectorProviders([entry], copy);
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
  // Running sessions may have runtimeProvider set to a gateway id (e.g.
  // grok-4-5-codex) while agent.provider stays the base family (codex). The
  // model picker must still list every model under that base provider so the
  // user can switch back to native GPT models; do not filter the list down to
  // only the currently active runtime gateway.
  const groupedProviders = filterProvidersForRunningAgent(
    buildSelectableProviderSelectorProviders(input.snapshotEntries, {
      defaultModelLabel: input.copy.defaultModelLabel,
      unavailable: input.copy.unavailable,
      unknownError: input.copy.unknownError,
    }),
    input.agentProvider,
  );
  if (groupedProviders.length > 0) {
    return groupedProviders;
  }

  // Gateway-only agent.provider (agent.provider === generated id): fall back to
  // runtime-scoped rows, then the selected gateway entry alone.
  if (input.agentRuntimeProvider && input.agentRuntimeProvider !== input.agentProvider) {
    const runtimeScoped = filterProviderSelectorProvidersByRuntimeProvider(
      buildSelectableProviderSelectorProviders(input.snapshotEntries, {
        defaultModelLabel: input.copy.defaultModelLabel,
        unavailable: input.copy.unavailable,
        unknownError: input.copy.unknownError,
      }),
      input.agentRuntimeProvider,
    );
    if (runtimeScoped.length > 0) {
      return runtimeScoped;
    }
  }

  if (input.selectedEntry) {
    return buildStandaloneGatewaySelectorProviders(input.selectedEntry, {
      defaultModelLabel: input.copy.defaultModelLabel,
      unavailable: input.copy.unavailable,
      unknownError: input.copy.unknownError,
    });
  }
  return buildProviderSelectorProviders({
    providerDefinitions: input.providerDefinitions,
    modelsByProvider: input.modelsByProvider,
    copy: {
      defaultModelLabel: input.copy.defaultModelLabel,
    },
  });
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
