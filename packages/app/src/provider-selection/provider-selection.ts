import type {
  AgentMode,
  AgentModelDefinition,
  AgentProvider,
  ProviderSnapshotEntry,
} from "@fleurdelys/protocol/agent-types";
import type { AgentProviderDefinition } from "@fleurdelys/protocol/provider-manifest";
import type { DraftCommandConfig } from "@/hooks/use-agent-commands-query";
import { buildFavoriteModelKey, type FavoriteModelRow } from "@/hooks/use-form-preferences";
import { compareMatchScores, scoreTextFields } from "@/utils/score-match";

export type ProviderSelectionModelRow = FavoriteModelRow & { isDefault?: boolean };

export type ProviderModelSelection =
  | { kind: "models"; rows: ProviderSelectionModelRow[] }
  | { kind: "loading" }
  | { kind: "error"; message: string };

export interface ProviderSelectorProvider {
  id: string;
  label: string;
  modelSelection: ProviderModelSelection;
}

export interface ProviderSelectionState {
  provider: AgentProvider | null;
  modelId: string;
  modeId: string;
  thinkingOptionId: string;
  availableModels: AgentModelDefinition[];
  modeOptions: AgentMode[];
}

export interface ProviderSelectionReadiness {
  ok: boolean;
  reason?: string;
}

function buildModelRows(
  provider: string,
  providerLabel: string,
  models: AgentModelDefinition[],
): ProviderSelectionModelRow[] {
  return models.map((model) => ({
    favoriteKey: buildFavoriteModelKey({ provider, modelId: model.id }),
    provider,
    providerLabel,
    modelId: model.id,
    modelLabel: model.label,
    description: model.description,
    isDefault: model.isDefault,
  }));
}

function buildSyntheticDefaultRow(
  provider: string,
  providerLabel: string,
): ProviderSelectionModelRow {
  return {
    favoriteKey: buildFavoriteModelKey({ provider, modelId: "" }),
    provider,
    providerLabel,
    modelId: "",
    modelLabel: "默认",
    description: undefined,
    isDefault: true,
  };
}

function buildModelSelection(
  provider: string,
  providerLabel: string,
  models: AgentModelDefinition[] | null,
): ProviderModelSelection {
  if (models === null) {
    return { kind: "loading" };
  }
  if (models.length === 0) {
    return { kind: "models", rows: [buildSyntheticDefaultRow(provider, providerLabel)] };
  }
  return { kind: "models", rows: buildModelRows(provider, providerLabel, models) };
}

function buildEntryModelSelection(
  entry: ProviderSnapshotEntry,
  label: string,
): ProviderModelSelection {
  if ((entry.models?.length ?? 0) > 0) {
    return buildModelSelection(entry.provider, label, entry.models ?? null);
  }
  if (entry.status === "ready") {
    return buildModelSelection(entry.provider, label, entry.models ?? null);
  }
  if (entry.status === "loading") {
    return { kind: "loading" };
  }
  return {
    kind: "error",
    message: entry.error ?? (entry.status === "unavailable" ? "不可用" : "未知错误"),
  };
}

export function buildProviderSelectorProviders(input: {
  providerDefinitions: AgentProviderDefinition[];
  modelsByProvider: Map<string, AgentModelDefinition[]>;
}): ProviderSelectorProvider[] {
  return input.providerDefinitions.map((definition) => ({
    id: definition.id,
    label: definition.label,
    modelSelection: buildModelSelection(
      definition.id,
      definition.label,
      input.modelsByProvider.has(definition.id)
        ? (input.modelsByProvider.get(definition.id) ?? [])
        : null,
    ),
  }));
}

export function buildSelectableProviderSelectorProviders(
  entries: ProviderSnapshotEntry[] | undefined,
): ProviderSelectorProvider[] {
  return (entries ?? [])
    .filter((entry) => entry.enabled)
    .map((entry) => {
      const label = entry.label ?? entry.provider;
      return {
        id: entry.provider,
        label,
        modelSelection: buildEntryModelSelection(entry, label),
      };
    });
}

export function getProviderModelRows(
  provider: ProviderSelectorProvider,
): ProviderSelectionModelRow[] {
  return provider.modelSelection.kind === "models" ? provider.modelSelection.rows : [];
}

export function getAllProviderModelRows(
  providers: ProviderSelectorProvider[],
): ProviderSelectionModelRow[] {
  return providers.flatMap(getProviderModelRows);
}

export function resolveSelectedModelLabel(input: {
  providers: ProviderSelectorProvider[];
  selectedProvider: string;
  selectedModel: string;
  isLoading: boolean;
}): string {
  const selectedProvider = input.selectedProvider.trim();
  if (!selectedProvider) {
    return "选择模型";
  }

  const provider = input.providers.find((entry) => entry.id === selectedProvider);
  if (!provider) {
    return input.isLoading ? "加载中..." : "选择模型";
  }
  if (provider.modelSelection.kind === "loading") {
    return "加载中...";
  }
  if (provider.modelSelection.kind === "error") {
    return "错误";
  }
  if (provider.modelSelection.kind !== "models") {
    return "选择模型";
  }

  const model = provider.modelSelection.rows.find((entry) => entry.modelId === input.selectedModel);
  const defaultModel = provider.modelSelection.rows.find((row) => row.isDefault);
  return (
    model?.modelLabel ??
    defaultModel?.modelLabel ??
    provider.modelSelection.rows[0]?.modelLabel ??
    "选择模型"
  );
}

export function buildSelectedTriggerLabel(modelLabel: string): string {
  return modelLabel;
}

export function matchesModelSearch(
  row: ProviderSelectionModelRow,
  normalizedQuery: string,
): boolean {
  return scoreModelRow(row, normalizedQuery) !== null;
}

function getModelRowSearchFields(row: ProviderSelectionModelRow): string[] {
  return [row.modelLabel, row.modelId, row.providerLabel, row.description ?? ""];
}

export function scoreModelRow(row: ProviderSelectionModelRow, normalizedQuery: string) {
  return scoreTextFields(normalizedQuery, getModelRowSearchFields(row));
}

export function filterAndRankModelRows(
  rows: ProviderSelectionModelRow[],
  normalizedQuery: string,
): ProviderSelectionModelRow[] {
  if (!normalizedQuery) return rows;
  const scored = rows
    .map((row) => ({ row, score: scoreModelRow(row, normalizedQuery) }))
    .filter(
      (
        entry,
      ): entry is { row: ProviderSelectionModelRow; score: NonNullable<typeof entry.score> } =>
        Boolean(entry.score),
    );

  scored.sort((a, b) => {
    const cmp = compareMatchScores(a.score, b.score);
    if (cmp !== 0) return cmp;
    return a.row.modelLabel.localeCompare(b.row.modelLabel);
  });

  return scored.map((entry) => entry.row);
}

export function resolveEffectiveComposerModelId(selection: ProviderSelectionState): string {
  return selection.modelId.trim();
}

export function resolveEffectiveComposerThinkingOptionId(
  selection: ProviderSelectionState,
  effectiveModelId: string,
): string {
  const selectedThinkingOptionId = selection.thinkingOptionId.trim();
  if (selectedThinkingOptionId) {
    return selectedThinkingOptionId;
  }

  const selectedModelDefinition =
    selection.availableModels.find((model) => model.id === effectiveModelId) ?? null;
  return selectedModelDefinition?.defaultThinkingOptionId ?? "";
}

export function buildDraftCommandConfig(input: {
  selection: ProviderSelectionState;
  cwd: string;
  effectiveModelId: string;
  effectiveThinkingOptionId: string;
  featureValues?: Record<string, unknown>;
}): DraftCommandConfig | undefined {
  const cwd = input.cwd.trim();
  if (!input.selection.provider || !cwd) {
    return undefined;
  }

  return {
    provider: input.selection.provider,
    cwd,
    ...(input.selection.modeOptions.length > 0 && input.selection.modeId !== ""
      ? { modeId: input.selection.modeId }
      : {}),
    ...(input.effectiveModelId ? { model: input.effectiveModelId } : {}),
    ...(input.effectiveThinkingOptionId
      ? { thinkingOptionId: input.effectiveThinkingOptionId }
      : {}),
    ...(input.featureValues ? { featureValues: input.featureValues } : {}),
  };
}

export function resolveSubmissionReadiness(input: {
  text: string;
  allowsEmptyAutoSubmit: boolean;
  providerCount: number;
  selection: {
    provider: AgentProvider | string | null;
    modelId: string;
    availableModels: readonly unknown[];
    isModelLoading: boolean;
  };
  autoSubmitConfig: { provider: string; model: string | null } | null;
  workspaceDirectory: string | null;
  hasClient: boolean;
}): ProviderSelectionReadiness {
  if (!input.allowsEmptyAutoSubmit && !input.text.trim()) {
    return { ok: false, reason: "请输入初始提示词" };
  }
  if (input.providerCount === 0) {
    return { ok: false, reason: "所选主机没有可用 Provider" };
  }
  if (!(input.autoSubmitConfig?.provider ?? input.selection.provider)) {
    return { ok: false, reason: "请选择模型" };
  }
  if (input.selection.isModelLoading) {
    return { ok: false, reason: "模型默认值仍在加载" };
  }
  const hasSelectedModel = Boolean(input.autoSubmitConfig?.model ?? input.selection.modelId);
  if (!hasSelectedModel && input.selection.availableModels.length > 0) {
    return { ok: false, reason: "所选 Provider 没有可用模型" };
  }
  if (!input.workspaceDirectory) {
    return { ok: false, reason: "找不到工作区目录" };
  }
  if (!input.hasClient) {
    return { ok: false, reason: "主机未连接" };
  }
  return { ok: true };
}
