/**
 * Unified model catalog — aggregates model definitions from all providers
 * into a single queryable list.
 *
 * Static models (Claude) come from hardcoded definitions; dynamic models
 * (Codex, OpenCode) are fetched at runtime via each provider's listModels().
 * This module provides the aggregation layer so consumers (WebSocket snapshot,
 * model selector, usage tracking) don't need to know per-provider details.
 */

import type { AgentModelDefinition, ModelCost } from "./agent-sdk-types.js";

export interface CatalogModelEntry extends AgentModelDefinition {
  /** Which provider runtime this model belongs to. */
  provider: string;
}

export interface ModelCatalogSnapshot {
  /** All known models across providers, deduplicated by (provider, id). */
  models: CatalogModelEntry[];
  /** Unix ms when this snapshot was assembled. */
  assembledAt: number;
}

/**
 * Merge model lists from multiple providers into a unified catalog.
 * Later providers' models are appended; duplicates within the same provider
 * are removed (first-wins by id).
 */
export function buildModelCatalog(
  providerModels: ReadonlyArray<{ provider: string; models: AgentModelDefinition[] }>,
): ModelCatalogSnapshot {
  const seen = new Set<string>();
  const models: CatalogModelEntry[] = [];

  for (const { provider, models: defs } of providerModels) {
    for (const def of defs) {
      const key = `${provider}\0${def.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      models.push({ ...def, provider });
    }
  }

  return { models, assembledAt: Date.now() };
}

/** Look up a model by (provider, id). Returns undefined when not found. */
export function findCatalogModel(
  catalog: ModelCatalogSnapshot,
  provider: string,
  modelId: string,
): CatalogModelEntry | undefined {
  return catalog.models.find((m) => m.provider === provider && m.id === modelId);
}

/** All models for a specific provider. */
export function modelsForProvider(
  catalog: ModelCatalogSnapshot,
  provider: string,
): CatalogModelEntry[] {
  return catalog.models.filter((m) => m.provider === provider);
}

/** The default model for a provider (first with isDefault, or first overall). */
export function defaultModelForProvider(
  catalog: ModelCatalogSnapshot,
  provider: string,
): CatalogModelEntry | undefined {
  const providerModels = modelsForProvider(catalog, provider);
  return providerModels.find((m) => m.isDefault) ?? providerModels[0];
}

/**
 * Format a context window token count for display: "1M", "200K", "8192".
 * Shared utility so server and clients format consistently.
 */
export function formatContextWindow(tokens: number): string {
  if (tokens >= 1_000_000) {
    const m = tokens / 1_000_000;
    return `${Number.isInteger(m) ? m : Number(m.toFixed(1))}M`;
  }
  if (tokens >= 1000) {
    const k = tokens / 1000;
    return `${Number.isInteger(k) ? k : Number(k.toFixed(0))}K`;
  }
  return String(tokens);
}

/**
 * Estimate the cost of a turn in USD given token counts and model pricing.
 * Returns null when the model has no cost data.
 */
export function estimateTurnCost(
  cost: ModelCost | undefined,
  tokens: { input: number; output: number; cacheRead?: number; cacheWrite?: number },
): number | null {
  if (!cost) return null;
  let total = 0;
  if (cost.input) total += (tokens.input / 1_000_000) * cost.input;
  if (cost.output) total += (tokens.output / 1_000_000) * cost.output;
  if (cost.cacheRead && tokens.cacheRead) total += (tokens.cacheRead / 1_000_000) * cost.cacheRead;
  if (cost.cacheWrite && tokens.cacheWrite)
    total += (tokens.cacheWrite / 1_000_000) * cost.cacheWrite;
  return total;
}
