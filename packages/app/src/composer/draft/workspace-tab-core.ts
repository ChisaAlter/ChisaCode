import { resolveSubmissionReadiness } from "@/provider-selection/provider-selection";
import type { ProviderSelectionCopy } from "@/provider-selection/provider-selection";

export interface WorkspaceDraftAutoSubmitConfig {
  provider: string;
  model: string | null;
}

export function shouldWaitForDraftModelReadiness(input: {
  autoSubmitConfig: WorkspaceDraftAutoSubmitConfig | null;
  isModelLoading: boolean;
}): boolean {
  if (input.autoSubmitConfig?.model) {
    return false;
  }
  return input.isModelLoading;
}

export function validateDraftSubmission(input: {
  text: string;
  allowsEmptyAutoSubmit: boolean;
  composerState: {
    providerDefinitions: unknown[];
    selectedProvider: string | null;
    isModelLoading: boolean;
    effectiveModelId: string | null;
    availableModels: unknown[];
  };
  autoSubmitConfig: WorkspaceDraftAutoSubmitConfig | null;
  workspaceDirectory: string | null;
  hasClient: boolean;
  copy?: ProviderSelectionCopy;
}): string | null {
  const {
    text,
    allowsEmptyAutoSubmit,
    composerState,
    autoSubmitConfig,
    workspaceDirectory,
    hasClient,
  } = input;
  const readiness = resolveSubmissionReadiness({
    text,
    allowsEmptyAutoSubmit,
    providerCount: composerState.providerDefinitions.length,
    selection: {
      provider: composerState.selectedProvider,
      modelId: composerState.effectiveModelId ?? "",
      availableModels: composerState.availableModels,
      isModelLoading: composerState.isModelLoading,
    },
    autoSubmitConfig,
    workspaceDirectory,
    hasClient,
    copy: input.copy,
  });
  return readiness.ok ? null : (readiness.reason ?? null);
}
