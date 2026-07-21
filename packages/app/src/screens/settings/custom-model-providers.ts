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
  supportsTools?: boolean;
  supportsThinking?: boolean;
}

export interface CollectedSavedModel {
  key: string;
  gatewayId: string;
  gatewayLabel: string;
  modelId: string;
  label: string;
  contextWindowMaxTokens?: number;
  supportsImages?: boolean;
  supportsTools?: boolean;
  supportsThinking?: boolean;
  providerIds: string[];
  baseUrl?: string;
}

export interface SaveOpenAiCompatibleModelInput {
  currentGateways: MutableDaemonConfig["modelGateways"] | undefined;
  /** Existing gateway id when editing; omitted when creating a new gateway. */
  gatewayId?: string | null;
  /** Previous model id when renaming a model inside a gateway. */
  previousModelId?: string | null;
  modelId: string;
  label?: string | null;
  baseUrl: string;
  apiKey: string;
  contextWindowMaxTokens?: number;
  supportsImages?: boolean;
  supportsTools?: boolean;
  supportsThinking?: boolean;
  /** When true, use the advanced multi-endpoint fields below instead of simple OpenAI-only. */
  customProtocol?: boolean;
  anthropic?: CustomModelProviderEndpoint;
  openai?: CustomModelProviderOpenAIEndpoint;
  responses?: CustomModelProviderEndpoint;
}

export interface DeleteSavedModelInput {
  currentGateways: MutableDaemonConfig["modelGateways"] | undefined;
  gatewayId: string;
  modelId: string;
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

function mimocodeProviderId(id: string): string {
  return `${id}-mimocode`;
}

function piProviderId(id: string): string {
  return `${id}-pi`;
}

function kimiProviderId(id: string): string {
  return `${id}-kimi`;
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
  mimocodeProviderId: string;
  piProviderId: string;
  kimiProviderId: string;
} {
  const normalizedId = normalizeSupplierId(id);
  return {
    claudeProviderId: claudeProviderId(normalizedId),
    codexProviderId: codexProviderId(normalizedId),
    opencodeProviderId: opencodeProviderId(normalizedId),
    mimocodeProviderId: mimocodeProviderId(normalizedId),
    piProviderId: piProviderId(normalizedId),
    kimiProviderId: kimiProviderId(normalizedId),
  };
}

export function buildModelGatewayProviderIdList(id: string): string[] {
  const ids = buildModelGatewayProviderIds(id);
  return [
    ids.claudeProviderId,
    ids.codexProviderId,
    ids.opencodeProviderId,
    ids.mimocodeProviderId,
    ids.piProviderId,
    ids.kimiProviderId,
  ];
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

const DEFAULT_THINKING_OPTION = {
  id: "default",
  label: "Thinking",
  isDefault: true,
} as const;

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
      ...(input.supportsTools === true ? { supportsTools: true } : {}),
      ...(input.supportsThinking === true ? { thinkingOptions: [DEFAULT_THINKING_OPTION] } : {}),
      ...(result.length === 0 ? { isDefault: true } : {}),
    });
  }
  return result;
}

function slugifyGatewayId(value: string): string {
  const normalized = trim(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  if (!normalized) {
    return "custom";
  }
  if (/^[a-z]/.test(normalized)) {
    return normalized;
  }
  return `m-${normalized}`;
}

function allocateGatewayId(
  preferred: string,
  currentGateways: MutableDaemonConfig["modelGateways"] | undefined,
): string {
  const base = slugifyGatewayId(preferred);
  if (!currentGateways?.[base] || currentGateways[base]?.enabled === false) {
    return base;
  }
  let suffix = 2;
  while (
    currentGateways[`${base}-${suffix}`] &&
    currentGateways[`${base}-${suffix}`]?.enabled !== false
  ) {
    suffix += 1;
  }
  return `${base}-${suffix}`;
}

function pickPrimaryBaseUrl(gateway: ModelGatewayConfig | undefined): string {
  if (!gateway?.upstreams) {
    return "";
  }
  const { chatCompletions, responses, anthropic } = gateway.upstreams;
  if (chatCompletions?.enabled && trim(chatCompletions.baseUrl)) {
    return trim(chatCompletions.baseUrl);
  }
  if (responses?.enabled && trim(responses.baseUrl)) {
    return trim(responses.baseUrl);
  }
  if (anthropic?.enabled && trim(anthropic.baseUrl)) {
    return trim(anthropic.baseUrl);
  }
  return (
    trim(chatCompletions?.baseUrl) || trim(responses?.baseUrl) || trim(anthropic?.baseUrl) || ""
  );
}

function modelHasThinking(model: ProviderProfileModel): boolean {
  return Array.isArray(model.thinkingOptions) && model.thinkingOptions.length > 0;
}

/**
 * Flattens enabled model gateways into one list row per model (fig2-style catalog).
 * @param gateways Daemon modelGateways map
 * @returns Sorted saved-model rows
 */
export function collectSavedModels(
  gateways: MutableDaemonConfig["modelGateways"] | undefined,
): CollectedSavedModel[] {
  const rows: CollectedSavedModel[] = [];
  for (const gateway of Object.values(gateways ?? {})) {
    if (!gateway?.id || gateway.enabled === false) {
      continue;
    }
    const gatewayLabel = gateway.label ?? gateway.id;
    const providerIds = buildModelGatewayProviderIdList(gateway.id);
    const baseUrl = pickPrimaryBaseUrl(gateway);
    for (const model of gateway.models ?? []) {
      const modelId = trim(model.id);
      if (!modelId) {
        continue;
      }
      rows.push({
        key: `${gateway.id}:${modelId}`,
        gatewayId: gateway.id,
        gatewayLabel,
        modelId,
        label: trim(model.label) || modelId,
        ...(typeof model.contextWindowMaxTokens === "number"
          ? { contextWindowMaxTokens: model.contextWindowMaxTokens }
          : {}),
        ...(model.supportsImages === true ? { supportsImages: true } : {}),
        ...(model.supportsTools === true ? { supportsTools: true } : {}),
        ...(modelHasThinking(model) ? { supportsThinking: true } : {}),
        providerIds,
        ...(baseUrl ? { baseUrl } : {}),
      });
    }
  }
  return rows.sort((a, b) => {
    const labelCompare = a.label.localeCompare(b.label);
    if (labelCompare !== 0) {
      return labelCompare;
    }
    const gatewayCompare = a.gatewayLabel.localeCompare(b.gatewayLabel);
    if (gatewayCompare !== 0) {
      return gatewayCompare;
    }
    return a.modelId.localeCompare(b.modelId);
  });
}

function emptyEndpoint(): CustomModelProviderEndpoint {
  return { enabled: false, baseUrl: "", apiKey: "" };
}

function emptyOpenAiEndpoint(): CustomModelProviderOpenAIEndpoint {
  return { enabled: false, baseUrl: "", apiKey: "", wireApi: "chat" };
}

function toModelInput(model: ProviderProfileModel): CustomModelProviderModelInput {
  return {
    id: model.id,
    label: model.label,
    contextWindowMaxTokens: model.contextWindowMaxTokens,
    supportsImages: model.supportsImages,
    supportsTools: model.supportsTools,
    supportsThinking: modelHasThinking(model),
  };
}

function resolveSimpleOpenAiEndpoints(input: SaveOpenAiCompatibleModelInput): {
  anthropic: CustomModelProviderEndpoint;
  openai: CustomModelProviderOpenAIEndpoint;
  responses: CustomModelProviderEndpoint;
} {
  if (input.customProtocol) {
    return {
      anthropic: input.anthropic ?? emptyEndpoint(),
      openai: input.openai ?? emptyOpenAiEndpoint(),
      responses: input.responses ?? emptyEndpoint(),
    };
  }
  const baseUrl = trim(input.baseUrl);
  const apiKey = trim(input.apiKey);
  if (!baseUrl || !apiKey) {
    throw new Error("Base URL and API key are required");
  }
  return {
    anthropic: emptyEndpoint(),
    responses: emptyEndpoint(),
    openai: {
      enabled: true,
      baseUrl,
      apiKey,
      wireApi: "chat",
    },
  };
}

function buildNextModelInput(
  input: SaveOpenAiCompatibleModelInput,
  modelId: string,
  modelLabel: string,
): CustomModelProviderModelInput {
  return {
    id: modelId,
    label: modelLabel,
    ...(input.contextWindowMaxTokens !== undefined
      ? { contextWindowMaxTokens: input.contextWindowMaxTokens }
      : {}),
    ...(input.supportsImages ? { supportsImages: true } : {}),
    ...(input.supportsTools ? { supportsTools: true } : {}),
    ...(input.supportsThinking ? { supportsThinking: true } : {}),
  };
}

function endpointFromUpstream(
  upstream: { enabled?: boolean; baseUrl?: string; apiKey?: string } | undefined,
): CustomModelProviderEndpoint {
  return {
    enabled: upstream?.enabled === true,
    baseUrl: upstream?.baseUrl ?? "",
    apiKey: upstream?.apiKey ?? "",
  };
}

/**
 * Builds a modelGateways patch for the simple OpenAI-compatible add/edit form.
 * Creates a new gateway when gatewayId is omitted; merges into an existing gateway when editing.
 * @param input Save payload from the fig3-style editor
 * @returns Daemon config patch
 */
export function buildSaveOpenAiCompatibleModelPatch(
  input: SaveOpenAiCompatibleModelInput,
): MutableDaemonConfigPatch {
  const modelId = trim(input.modelId);
  if (!modelId) {
    throw new Error("Model ID is required");
  }
  const modelLabel = trim(input.label) || modelId;
  const previousModelId = trim(input.previousModelId) || modelId;
  const existingGatewayId = normalizeSupplierId(input.gatewayId ?? "");
  const currentGateways = input.currentGateways ?? {};
  const existingGateway = existingGatewayId ? currentGateways[existingGatewayId] : undefined;

  const gatewayId =
    existingGatewayId && existingGateway
      ? existingGatewayId
      : allocateGatewayId(modelLabel || modelId, currentGateways);

  if (!PROVIDER_ID_PATTERN.test(gatewayId)) {
    throw new Error(
      "Provider ID must start with a letter and use lowercase letters, numbers, or hyphens",
    );
  }

  const gatewayLabel =
    existingGateway?.label && existingGateway.models && existingGateway.models.length > 1
      ? existingGateway.label
      : modelLabel;

  const { anthropic, openai, responses } = resolveSimpleOpenAiEndpoints(input);
  const nextModelInput = buildNextModelInput(input, modelId, modelLabel);
  const existingModels = existingGateway?.models ?? [];
  const withoutPrevious = existingModels
    .filter((model) => model.id !== previousModelId && model.id !== modelId)
    .map(toModelInput);
  const mergedModels = [...withoutPrevious, nextModelInput];

  return buildSaveCustomModelProviderPatch({
    currentGateways,
    previousId: existingGatewayId && existingGatewayId !== gatewayId ? existingGatewayId : null,
    id: gatewayId,
    label: gatewayLabel,
    models: mergedModels,
    anthropic,
    openai,
    responses,
  });
}

/**
 * Removes one model from a gateway; disables the gateway when no models remain.
 * @param input Delete payload
 * @returns Daemon config patch
 */
export function buildDeleteSavedModelPatch(input: DeleteSavedModelInput): MutableDaemonConfigPatch {
  const gatewayId = normalizeSupplierId(input.gatewayId);
  const modelId = trim(input.modelId);
  if (!gatewayId || !modelId) {
    throw new Error("Gateway ID and model ID are required");
  }
  const gateway = input.currentGateways?.[gatewayId];
  if (!gateway) {
    return buildDisableCustomModelProviderPatch(gatewayId);
  }
  const remaining = (gateway.models ?? []).filter((model) => model.id !== modelId);
  if (remaining.length === 0) {
    return buildDisableCustomModelProviderPatch(gatewayId);
  }

  return buildSaveCustomModelProviderPatch({
    currentGateways: input.currentGateways,
    previousId: gatewayId,
    id: gatewayId,
    label: gateway.label ?? gatewayId,
    models: remaining.map(toModelInput),
    anthropic: endpointFromUpstream(gateway.upstreams?.anthropic),
    openai: {
      ...endpointFromUpstream(gateway.upstreams?.chatCompletions),
      wireApi: "chat",
    },
    responses: endpointFromUpstream(gateway.upstreams?.responses),
  });
}

function normalizeOpenCodeModels(models: ProviderProfileModel[]): ProviderProfileModel[] {
  return models.map((model) =>
    Object.assign({}, model, {
      id: model.id.startsWith("openai/") ? model.id : `openai/${model.id}`,
    }),
  );
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
      mimocode: ids.mimocodeProviderId,
      pi: ids.piProviderId,
      kimi: ids.kimiProviderId,
    },
    generatedModels: {
      opencode: normalizeOpenCodeModels(models),
      mimocode: normalizeOpenCodeModels(models),
      pi: normalizeOpenCodeModels(models),
      kimi: models,
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
    providerIds: buildModelGatewayProviderIdList(gateway.id),
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
