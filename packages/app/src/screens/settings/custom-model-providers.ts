import type { ProviderProfileModel } from "@chisacode/protocol/provider-config";
import type { MutableDaemonConfig, MutableDaemonConfigPatch } from "@chisacode/protocol/messages";

type ProviderConfig = MutableDaemonConfig["providers"][string];
type ProviderPatch = NonNullable<MutableDaemonConfigPatch["providers"]>[string];

export type CustomOpenAIWireApi = "responses" | "chat";

export interface CustomModelProviderEndpoint {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
}

export interface CustomModelProviderOpenAIEndpoint extends CustomModelProviderEndpoint {
  wireApi: CustomOpenAIWireApi;
}

export interface SaveCustomModelProviderInput {
  currentProviders: MutableDaemonConfig["providers"] | undefined;
  previousId?: string | null;
  id: string;
  label: string;
  models: string[];
  anthropic: CustomModelProviderEndpoint;
  openai: CustomModelProviderOpenAIEndpoint;
}

export interface CollectedCustomModelProvider {
  id: string;
  label: string;
  providerIds: string[];
  models: ProviderProfileModel[];
  anthropic: {
    providerId: string;
    enabled: boolean;
    baseUrl: string;
    hasApiKey: boolean;
  } | null;
  openai: {
    providerId: string;
    enabled: boolean;
    baseUrl: string;
    hasApiKey: boolean;
    wireApi: CustomOpenAIWireApi;
  } | null;
}

const PROVIDER_ID_PATTERN = /^[a-z][a-z0-9-]*$/;

function trim(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSupplierId(value: string): string {
  return trim(value).toLowerCase();
}

function anthropicProviderId(id: string): string {
  return `${id}-anthropic`;
}

function openaiProviderId(id: string): string {
  return `${id}-openai`;
}

export function buildCustomModelProviderIds(id: string): {
  anthropicProviderId: string;
  openaiProviderId: string;
} {
  const normalizedId = normalizeSupplierId(id);
  return {
    anthropicProviderId: anthropicProviderId(normalizedId),
    openaiProviderId: openaiProviderId(normalizedId),
  };
}

function stripFormatSuffix(providerId: string): string | null {
  if (providerId.endsWith("-anthropic")) {
    return providerId.slice(0, -"anthropic".length - 1);
  }
  if (providerId.endsWith("-openai")) {
    return providerId.slice(0, -"openai".length - 1);
  }
  return null;
}

function normalizeLabel(label: string, id: string): string {
  return trim(label) || id;
}

function stripGeneratedLabelSuffix(label: string): string {
  return label.replace(/\s+(Anthropic|OpenAI)$/u, "").trim();
}

function normalizeModels(models: string[]): ProviderProfileModel[] {
  const seen = new Set<string>();
  const result: ProviderProfileModel[] = [];
  for (const raw of models) {
    const id = trim(raw);
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    result.push({
      id,
      label: id,
      ...(result.length === 0 ? { isDefault: true } : {}),
    });
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getProviderConfig(
  providers: MutableDaemonConfig["providers"] | undefined,
  providerId: string,
): ProviderConfig | undefined {
  return (providers as Record<string, ProviderConfig> | undefined)?.[providerId];
}

function readModelArray(value: unknown): ProviderProfileModel[] {
  return Array.isArray(value) ? (value as ProviderProfileModel[]) : [];
}

function readModels(provider: ProviderConfig | undefined): ProviderProfileModel[] {
  return readModelArray(provider?.models).length > 0
    ? readModelArray(provider?.models)
    : readModelArray(provider?.additionalModels);
}

function readEnv(provider: ProviderConfig | undefined, key: string): string {
  const env = isRecord(provider?.env) ? provider.env : null;
  const value = env?.[key];
  return typeof value === "string" ? value : "";
}

function hasApiKey(provider: ProviderConfig | undefined, key: string): boolean {
  return readEnv(provider, key).trim().length > 0;
}

function resolveWireApi(provider: ProviderConfig | undefined): CustomOpenAIWireApi {
  return readEnv(provider, "OPENAI_WIRE_API") === "chat" ? "chat" : "responses";
}

function addDisablePatch(
  providers: NonNullable<MutableDaemonConfigPatch["providers"]>,
  providerId: string,
): void {
  providers[providerId] = { enabled: false };
}

export function buildDisableCustomModelProviderPatch(id: string): MutableDaemonConfigPatch {
  const normalizedId = normalizeSupplierId(id);
  if (!PROVIDER_ID_PATTERN.test(normalizedId)) {
    throw new Error(
      "Provider ID must start with a letter and use lowercase letters, numbers, or hyphens",
    );
  }
  return {
    providers: {
      [anthropicProviderId(normalizedId)]: { enabled: false },
      [openaiProviderId(normalizedId)]: { enabled: false },
    },
  };
}

export function buildSaveCustomModelProviderPatch(
  input: SaveCustomModelProviderInput,
): MutableDaemonConfigPatch {
  const id = normalizeSupplierId(input.id);
  if (!PROVIDER_ID_PATTERN.test(id)) {
    throw new Error(
      "Provider ID must start with a letter and use lowercase letters, numbers, or hyphens",
    );
  }
  const label = normalizeLabel(input.label, id);
  const models = normalizeModels(input.models);
  if (models.length === 0) {
    throw new Error("Add at least one model");
  }
  if (!input.anthropic.enabled && !input.openai.enabled) {
    throw new Error("Enable at least one interface format");
  }

  const providers: NonNullable<MutableDaemonConfigPatch["providers"]> = {};
  const previousId = normalizeSupplierId(input.previousId ?? "");
  if (previousId && previousId !== id) {
    addDisablePatch(providers, anthropicProviderId(previousId));
    addDisablePatch(providers, openaiProviderId(previousId));
  }

  const anthropicId = anthropicProviderId(id);
  if (input.anthropic.enabled) {
    const baseUrl = trim(input.anthropic.baseUrl);
    const apiKey = trim(input.anthropic.apiKey);
    if (!baseUrl || !apiKey) {
      throw new Error("Anthropic interface requires base URL and API key");
    }
    providers[anthropicId] = {
      extends: "claude",
      label: `${label} Anthropic`,
      env: {
        ANTHROPIC_AUTH_TOKEN: apiKey,
        ANTHROPIC_BASE_URL: baseUrl,
      },
      disallowedTools: ["WebSearch"],
      models,
      enabled: true,
    } satisfies ProviderPatch;
  } else if (getProviderConfig(input.currentProviders, anthropicId)) {
    addDisablePatch(providers, anthropicId);
  }

  const openaiId = openaiProviderId(id);
  if (input.openai.enabled) {
    const baseUrl = trim(input.openai.baseUrl);
    const apiKey = trim(input.openai.apiKey);
    if (!baseUrl || !apiKey) {
      throw new Error("OpenAI interface requires base URL and API key");
    }
    providers[openaiId] = {
      extends: "codex",
      label: `${label} OpenAI`,
      env: {
        OPENAI_API_KEY: apiKey,
        OPENAI_BASE_URL: baseUrl,
        OPENAI_WIRE_API: input.openai.wireApi,
      },
      models,
      enabled: true,
    } satisfies ProviderPatch;
  } else if (getProviderConfig(input.currentProviders, openaiId)) {
    addDisablePatch(providers, openaiId);
  }

  return { providers };
}

export function collectCustomModelProviders(
  providers: MutableDaemonConfig["providers"] | undefined,
): CollectedCustomModelProvider[] {
  const grouped = new Map<string, CollectedCustomModelProvider>();

  for (const [providerId, rawProvider] of Object.entries(providers ?? {})) {
    const provider = rawProvider as ProviderConfig;
    const supplierId = stripFormatSuffix(providerId);
    if (!supplierId) {
      continue;
    }
    if (provider.extends !== "claude" && provider.extends !== "codex") {
      continue;
    }

    const existing = grouped.get(supplierId);
    const rawLabel = typeof provider.label === "string" ? provider.label : supplierId;
    const label = stripGeneratedLabelSuffix(rawLabel) || supplierId;
    const entry =
      existing ??
      ({
        id: supplierId,
        label,
        providerIds: [],
        models: readModels(provider),
        anthropic: null,
        openai: null,
      } satisfies CollectedCustomModelProvider);

    if (!entry.providerIds.includes(providerId)) {
      entry.providerIds.push(providerId);
    }
    if (entry.models.length === 0) {
      entry.models = readModels(provider);
    }

    if (providerId.endsWith("-anthropic")) {
      entry.anthropic = {
        providerId,
        enabled: provider.enabled !== false,
        baseUrl: readEnv(provider, "ANTHROPIC_BASE_URL"),
        hasApiKey: hasApiKey(provider, "ANTHROPIC_AUTH_TOKEN"),
      };
    } else if (providerId.endsWith("-openai")) {
      entry.openai = {
        providerId,
        enabled: provider.enabled !== false,
        baseUrl: readEnv(provider, "OPENAI_BASE_URL"),
        hasApiKey: hasApiKey(provider, "OPENAI_API_KEY"),
        wireApi: resolveWireApi(provider),
      };
    }

    grouped.set(supplierId, entry);
  }

  return Array.from(grouped.values()).sort((a, b) => {
    const labelCompare = a.label.localeCompare(b.label);
    return labelCompare !== 0 ? labelCompare : a.id.localeCompare(b.id);
  });
}
