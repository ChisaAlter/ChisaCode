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

export interface SoftHomeBranchContextInput {
  cwd: string | null | undefined;
  checkoutIsGit: boolean | null | undefined;
  currentBranch: string | null | undefined;
  serverId: string;
}

/**
 * Soft Home branch pill policy: same as /new — show for any cwd until checkout proves non-git.
 * @param input.cwd Working directory for git operations (path, not opaque workspace id)
 * @returns Branch switcher context, or null when hidden
 */
export function resolveSoftHomeBranchContext(input: SoftHomeBranchContextInput): {
  currentBranchName: string | null;
  serverId: string;
  workspaceId: string;
  isGitCheckout: true;
} | null {
  const cwd = typeof input.cwd === "string" ? input.cwd.trim() : "";
  if (!cwd) {
    return null;
  }
  if (input.checkoutIsGit === false) {
    return null;
  }
  const currentBranch =
    typeof input.currentBranch === "string" && input.currentBranch.trim().length > 0
      ? input.currentBranch.trim()
      : null;
  return {
    currentBranchName: currentBranch === "HEAD" ? null : currentBranch,
    serverId: input.serverId,
    workspaceId: cwd,
    isGitCheckout: true,
  };
}
