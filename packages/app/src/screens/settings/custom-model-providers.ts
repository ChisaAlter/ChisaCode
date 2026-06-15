import type { ProviderProfileModel } from "@chisacode/protocol/provider-config";
import type { MutableDaemonConfig, MutableDaemonConfigPatch } from "@chisacode/protocol/messages";

type ProviderConfig = MutableDaemonConfig["providers"][string];
type ModelGatewayConfig = NonNullable<MutableDaemonConfig["modelGateways"]>[string];
type ModelGatewayPatch = NonNullable<MutableDaemonConfigPatch["modelGateways"]>[string];

export type CustomOpenAIWireApi = "responses" | "chat";

export interface CustomModelProviderEndpoint {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
}

export interface CustomModelProviderOpenAIEndpoint extends CustomModelProviderEndpoint {
  wireApi: CustomOpenAIWireApi;
}

export interface CustomModelProviderModelInput {
  id: string;
  label?: string;
  contextWindowMaxTokens?: number;
  supportsImages?: boolean;
}

export interface SaveCustomModelProviderInput {
  currentGateways: MutableDaemonConfig["modelGateways"] | undefined;
  previousId?: string | null;
  id: string;
  label: string;
  models: Array<string | CustomModelProviderModelInput>;
  anthropic: CustomModelProviderEndpoint;
  openai: CustomModelProviderOpenAIEndpoint;
  responses: CustomModelProviderEndpoint;
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
  responses: {
    providerId: string;
    enabled: boolean;
    baseUrl: string;
    hasApiKey: boolean;
  } | null;
}

const PROVIDER_ID_PATTERN = /^[a-z][a-z0-9-]*$/;

function trim(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSupplierId(value: string): string {
  return trim(value).toLowerCase();
}

function claudeProviderId(id: string): string {
  return `${id}-claude`;
}

function codexProviderId(id: string): string {
  return `${id}-codex`;
}

function opencodeProviderId(id: string): string {
  return `${id}-opencode`;
}

function anthropicProviderId(id: string): string {
  return `${id}-anthropic`;
}

function openaiProviderId(id: string): string {
  return `${id}-openai`;
}

export function buildModelGatewayProviderIds(id: string): {
  claudeProviderId: string;
  codexProviderId: string;
  opencodeProviderId: string;
} {
  const normalizedId = normalizeSupplierId(id);
  return {
    claudeProviderId: claudeProviderId(normalizedId),
    codexProviderId: codexProviderId(normalizedId),
    opencodeProviderId: opencodeProviderId(normalizedId),
  };
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

function stripLegacyFormatSuffix(providerId: string): string | null {
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
  return label.replace(/\s+(Anthropic|OpenAI|Claude|Codex|OpenCode)$/u, "").trim();
}

function normalizePositiveInteger(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  const normalized = Math.trunc(value);
  return normalized > 0 ? normalized : undefined;
}

function normalizeModelInput(
  model: string | CustomModelProviderModelInput,
): CustomModelProviderModelInput {
  return typeof model === "string" ? { id: model } : model;
}

function normalizeModels(
  models: Array<string | CustomModelProviderModelInput>,
): ProviderProfileModel[] {
  const seen = new Set<string>();
  const result: ProviderProfileModel[] = [];
  for (const raw of models) {
    const input = normalizeModelInput(raw);
    const id = trim(input.id);
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    const label = trim(input.label) || id;
    const contextWindowMaxTokens = normalizePositiveInteger(input.contextWindowMaxTokens);
    result.push({
      id,
      label,
      ...(contextWindowMaxTokens !== undefined ? { contextWindowMaxTokens } : {}),
      ...(input.supportsImages === true ? { supportsImages: true } : {}),
      ...(result.length === 0 ? { isDefault: true } : {}),
    });
  }
  return result;
}

function normalizeOpenCodeModels(models: ProviderProfileModel[]): ProviderProfileModel[] {
  return models.map((model) => ({
    ...model,
    id: model.id.startsWith("openai/") ? model.id : `openai/${model.id}`,
  }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function normalizeGatewayEndpoint(endpoint: CustomModelProviderEndpoint): {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
} {
  return {
    enabled: endpoint.enabled,
    baseUrl: trim(endpoint.baseUrl),
    apiKey: trim(endpoint.apiKey),
  };
}

function requireConfiguredEndpoint(name: string, endpoint: CustomModelProviderEndpoint): void {
  if (!endpoint.enabled) {
    return;
  }
  if (!trim(endpoint.baseUrl) || !trim(endpoint.apiKey)) {
    throw new Error(`${name} interface requires base URL and API key`);
  }
}

export function buildDisableCustomModelProviderPatch(id: string): MutableDaemonConfigPatch {
  const normalizedId = normalizeSupplierId(id);
  if (!PROVIDER_ID_PATTERN.test(normalizedId)) {
    throw new Error(
      "Provider ID must start with a letter and use lowercase letters, numbers, or hyphens",
    );
  }
  return {
    modelGateways: {
      [normalizedId]: { enabled: false },
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
  if (!input.anthropic.enabled && !input.openai.enabled && !input.responses.enabled) {
    throw new Error("Enable at least one interface format");
  }

  requireConfiguredEndpoint("Anthropic", input.anthropic);
  requireConfiguredEndpoint("Chat Completions", input.openai);
  requireConfiguredEndpoint("Responses", input.responses);

  const gatewayPatches: NonNullable<MutableDaemonConfigPatch["modelGateways"]> = {};
  const previousId = normalizeSupplierId(input.previousId ?? "");
  if (previousId && previousId !== id) {
    gatewayPatches[previousId] = { enabled: false } satisfies ModelGatewayPatch;
  }

  const ids = buildModelGatewayProviderIds(id);
  gatewayPatches[id] = {
    id,
    label,
    enabled: true,
    models,
    upstreams: {
      anthropic: normalizeGatewayEndpoint(input.anthropic),
      chatCompletions: normalizeGatewayEndpoint(input.openai),
      responses: normalizeGatewayEndpoint(input.responses),
    },
    generatedProviderIds: {
      claude: ids.claudeProviderId,
      codex: ids.codexProviderId,
      opencode: ids.opencodeProviderId,
    },
    generatedModels: {
      opencode: normalizeOpenCodeModels(models),
    },
  } satisfies ModelGatewayPatch;

  return { modelGateways: gatewayPatches };
}

function collectGatewayProviders(
  gateways: MutableDaemonConfig["modelGateways"] | undefined,
): CollectedCustomModelProvider[] {
  return Object.values(gateways ?? {})
    .filter((gateway): gateway is ModelGatewayConfig => Boolean(gateway?.id))
    .map(collectGatewayProvider);
}

function collectGatewayEndpoint(
  providerId: string,
  gatewayEnabled: boolean,
  upstream:
    | ModelGatewayConfig["upstreams"]["anthropic"]
    | ModelGatewayConfig["upstreams"]["chatCompletions"]
    | ModelGatewayConfig["upstreams"]["responses"]
    | undefined,
): NonNullable<CollectedCustomModelProvider["anthropic"]> {
  return {
    providerId,
    enabled: gatewayEnabled && upstream?.enabled === true,
    baseUrl: upstream?.baseUrl ?? "",
    hasApiKey: trim(upstream?.apiKey).length > 0,
  };
}

function collectGatewayProvider(gateway: ModelGatewayConfig): CollectedCustomModelProvider {
  const ids = buildModelGatewayProviderIds(gateway.id);
  const enabled = gateway.enabled !== false;
  return {
    id: gateway.id,
    label: gateway.label ?? gateway.id,
    providerIds: [ids.claudeProviderId, ids.codexProviderId, ids.opencodeProviderId],
    models: gateway.models ?? [],
    anthropic: collectGatewayEndpoint(ids.claudeProviderId, enabled, gateway.upstreams?.anthropic),
    openai: {
      ...collectGatewayEndpoint(
        ids.opencodeProviderId,
        enabled,
        gateway.upstreams?.chatCompletions,
      ),
      wireApi: "chat",
    },
    responses: collectGatewayEndpoint(ids.codexProviderId, enabled, gateway.upstreams?.responses),
  };
}

function collectLegacyProviders(
  providers: MutableDaemonConfig["providers"] | undefined,
): CollectedCustomModelProvider[] {
  const grouped = new Map<string, CollectedCustomModelProvider>();

  for (const [providerId, rawProvider] of Object.entries(providers ?? {})) {
    const provider = rawProvider as ProviderConfig;
    const supplierId = stripLegacyFormatSuffix(providerId);
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
        responses: null,
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

  return Array.from(grouped.values());
}

export function collectCustomModelProviders(
  gateways: MutableDaemonConfig["modelGateways"] | undefined,
  legacyProviders?: MutableDaemonConfig["providers"] | undefined,
): CollectedCustomModelProvider[] {
  const gatewayProviders = collectGatewayProviders(gateways);
  const gatewayIds = new Set(gatewayProviders.map((provider) => provider.id));
  const legacyProvidersOnly = collectLegacyProviders(legacyProviders).filter(
    (provider) => !gatewayIds.has(provider.id),
  );

  return [...gatewayProviders, ...legacyProvidersOnly].sort((a, b) => {
    const labelCompare = a.label.localeCompare(b.label);
    return labelCompare !== 0 ? labelCompare : a.id.localeCompare(b.id);
  });
}
