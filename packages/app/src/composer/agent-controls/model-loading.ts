import type { ProviderSnapshotEntry } from "@chisacode/protocol/agent-types";
import { isProviderEntryLoading } from "@/provider-selection/provider-snapshot-loading";

interface ProviderModelsQueryState {
  isFetching: boolean;
  isLoading: boolean;
}

export function isProviderModelsQueryLoading(input: ProviderModelsQueryState): boolean {
  return input.isLoading || input.isFetching;
}

export function resolveRunningAgentModelLoading(input: {
  configuredModelId: string | null | undefined;
  runtimeModelId: string | null | undefined;
  runtimeProvider?: string | null;
  runtimeEntry: ProviderSnapshotEntry | null;
  selectedEntry: ProviderSnapshotEntry | null;
}): boolean {
  const hasResolvedAgentModel = Boolean(
    input.configuredModelId?.trim() || input.runtimeModelId?.trim(),
  );
  if (hasResolvedAgentModel) {
    return false;
  }
  return isProviderEntryLoading({
    runtimeProvider: input.runtimeProvider,
    runtimeEntry: input.runtimeEntry,
    selectedEntry: input.selectedEntry,
  });
}
