import type { Logger } from "pino";

import type {
  AgentClient,
  AgentCreateConfigUnattendedInput,
  AgentMode,
  AgentModelDefinition,
  AgentPersistenceHandle,
  AgentProvider,
  AgentRuntimeInfo,
  AgentSession,
  AgentStreamEvent,
  ListModelsOptions,
  ListModesOptions,
  ListPersistedAgentsOptions,
  PersistedAgentDescriptor,
  ResolveAgentCreateConfigInput,
  ResolveAgentCreateConfigResult,
} from "./agent-sdk-types.js";
import {
  isDefaultAgentCreateConfigUnattended,
  resolveDefaultAgentCreateConfig,
} from "./create-agent-mode.js";
import { normalizeAgentModelDefinition } from "./agent-sdk-types.js";
import type { WorkspaceGitService } from "../workspace-git-service.js";
import type {
  AgentProviderRuntimeSettingsMap,
  ModelGatewayConfig,
  ModelGatewayConfigs,
  ProviderOverride,
  ProviderProfileModel,
  ProviderRuntimeSettings,
} from "./provider-launch-config.js";
import { ClaudeAgentClient } from "./providers/claude/agent.js";
import { CodexAppServerAgentClient } from "./providers/codex-app-server-agent.js";
import { KimiCodeAgentClient } from "./providers/kimi-code-agent.js";
import { MimoCodeAgentClient, OpenCodeAgentClient } from "./providers/opencode-agent.js";
import { PiRpcAgentClient } from "./providers/pi/agent.js";
import { GenericACPAgentClient } from "./providers/generic-acp-agent.js";
import { MockLoadTestAgentClient } from "./providers/mock-load-test-agent.js";
import { MockSlowProviderClient } from "./providers/mock-slow-provider.js";
import {
  AGENT_PROVIDER_DEFINITIONS,
  DEV_AGENT_PROVIDER_DEFINITIONS,
  getAgentProviderDefinition,
  type AgentProviderDefinition,
} from "@chisacode/protocol/provider-manifest";

export type { AgentProviderDefinition };

export { AGENT_PROVIDER_DEFINITIONS, getAgentProviderDefinition };

export interface ProviderDefinition extends AgentProviderDefinition {
  enabled: boolean;
  runtimeSettings?: ProviderRuntimeSettings;
  /**
   * The id of another *registered* provider this one extends (e.g. a Z.AI
   * profile that extends "claude"). null for built-in providers and for
   * generic ACP providers (which only extend the literal "acp" sentinel).
   */
  derivedFromProviderId: string | null;
  modelGatewayId: string | null;
  createClient: (logger: Logger) => AgentClient;
  resolveCreateConfig: (input: ResolveAgentCreateConfigInput) => ResolveAgentCreateConfigResult;
  isCreateConfigUnattended: (input: AgentCreateConfigUnattendedInput) => boolean;
  fetchModels: (options: ListModelsOptions) => Promise<AgentModelDefinition[]>;
  fetchModes: (options: ListModesOptions) => Promise<AgentMode[]>;
}

export { IMPORTABLE_PROVIDERS } from "@chisacode/protocol/importable-providers";

export interface BuildProviderRegistryOptions {
  runtimeSettings?: AgentProviderRuntimeSettingsMap;
  providerOverrides?: Record<string, ProviderOverride>;
  modelGateways?: ModelGatewayConfigs;
  modelGatewayBaseUrl?: string;
  modelGatewayToken?: string;
  workspaceGitService?: Pick<WorkspaceGitService, "resolveRepoRoot">;
  isDev?: boolean;
}

interface ProviderClientFactoryOptions extends Pick<
  BuildProviderRegistryOptions,
  "workspaceGitService"
> {
  profileModels?: ProviderProfileModel[];
  additionalModels?: ProviderProfileModel[];
  customProvider?: {
    id: string;
    label: string;
    extends: string;
  };
}

type ProviderClientFactory = (
  logger: Logger,
  runtimeSettings?: ProviderRuntimeSettings,
  options?: ProviderClientFactoryOptions,
) => AgentClient;

interface ResolvedProvider {
  definition: AgentProviderDefinition;
  runtimeSettings?: ProviderRuntimeSettings;
  profileModels: ProviderProfileModel[];
  additionalModels: ProviderProfileModel[];
  profileModelsAreAdditive: boolean;
  enabled: boolean;
  derivedFromProviderId: string | null;
  modelGatewayId: string | null;
  createBaseClient: (logger: Logger) => AgentClient;
}

const PROVIDER_CLIENT_FACTORIES: Record<string, ProviderClientFactory> = {
  claude: (logger, runtimeSettings) =>
    new ClaudeAgentClient({
      logger,
      runtimeSettings,
    }),
  codex: (logger, runtimeSettings, options) =>
    new CodexAppServerAgentClient(logger, runtimeSettings, {
      workspaceGitService: options?.workspaceGitService,
      customProvider: options?.customProvider,
    }),
  opencode: (logger, runtimeSettings) => new OpenCodeAgentClient(logger, runtimeSettings),
  mimocode: (logger, runtimeSettings) => new MimoCodeAgentClient(logger, runtimeSettings),
  pi: (logger, runtimeSettings) =>
    new PiRpcAgentClient({
      logger,
      runtimeSettings,
    }),
  kimi: (logger, runtimeSettings, options) =>
    new KimiCodeAgentClient({
      logger,
      runtimeSettings,
      providerId: options?.customProvider?.id ?? "kimi",
      label: options?.customProvider?.label ?? "Kimi Code",
      models: [...(options?.profileModels ?? []), ...(options?.additionalModels ?? [])],
    }),
  mock: (logger) => new MockLoadTestAgentClient(logger),
  "mock-slow": () => new MockSlowProviderClient(),
};

function getProviderClientFactory(provider: string): ProviderClientFactory {
  const factory = PROVIDER_CLIENT_FACTORIES[provider];
  if (!factory) {
    throw new Error(`No provider client factory registered for '${provider}'`);
  }
  return factory;
}

function toRuntimeSettings(override?: ProviderOverride): ProviderRuntimeSettings | undefined {
  if (!override?.command && !override?.env && !override?.disallowedTools) {
    return undefined;
  }

  return {
    command: override.command
      ? {
          mode: "replace",
          argv: override.command,
        }
      : undefined,
    env: override.env,
    disallowedTools: override.disallowedTools,
  };
}

function mergeRuntimeSettings(
  base: ProviderRuntimeSettings | undefined,
  override: ProviderRuntimeSettings | undefined,
): ProviderRuntimeSettings | undefined {
  if (!base && !override) {
    return undefined;
  }

  return {
    command: override?.command ?? base?.command,
    env:
      base?.env || override?.env
        ? {
            ...base?.env,
            ...override?.env,
          }
        : undefined,
    disallowedTools:
      base?.disallowedTools || override?.disallowedTools
        ? [...(base?.disallowedTools ?? []), ...(override?.disallowedTools ?? [])]
        : undefined,
  };
}

function applyOverrideToDefinition(
  definition: AgentProviderDefinition,
  override?: ProviderOverride,
): AgentProviderDefinition {
  if (!override) {
    return definition;
  }

  return {
    ...definition,
    label: override.label ?? definition.label,
    description: override.description ?? definition.description,
  };
}

function mapPersistenceHandle(
  provider: AgentProvider,
  handle: AgentPersistenceHandle | null,
): AgentPersistenceHandle | null {
  if (!handle) {
    return null;
  }

  return {
    ...handle,
    provider,
  };
}

function mapRuntimeInfo(provider: AgentProvider, runtimeInfo: AgentRuntimeInfo): AgentRuntimeInfo {
  return {
    ...runtimeInfo,
    provider,
  };
}

function mapStreamEvent(provider: AgentProvider, event: AgentStreamEvent): AgentStreamEvent {
  return {
    ...event,
    provider,
  };
}

function mapPersistedAgentDescriptor(
  provider: AgentProvider,
  descriptor: PersistedAgentDescriptor,
): PersistedAgentDescriptor {
  return {
    ...descriptor,
    provider,
    persistence: {
      ...descriptor.persistence,
      provider,
    },
  };
}

function mapModel(
  provider: AgentProvider,
  model: AgentModelDefinition | ProviderProfileModel,
): AgentModelDefinition {
  return normalizeAgentModelDefinition({ ...model, provider });
}

function mergeModels(
  provider: AgentProvider,
  profileModels: ProviderProfileModel[],
  additionalModels: ProviderProfileModel[],
  runtimeModels: AgentModelDefinition[],
  options?: { profileModelsAreAdditive?: boolean },
): AgentModelDefinition[] {
  const baseModels = runtimeModels.map((model) => mapModel(provider, model));
  if (profileModels.length > 0 && options?.profileModelsAreAdditive !== true) {
    return mergeModelAdditions(
      provider,
      profileModels.map((model) => mapModel(provider, model)),
      additionalModels,
    );
  }

  return mergeModelAdditions(provider, baseModels, [...profileModels, ...additionalModels]);
}

function mergeModelAdditions(
  provider: AgentProvider,
  baseModels: AgentModelDefinition[],
  modelAdditions: ProviderProfileModel[],
): AgentModelDefinition[] {
  if (modelAdditions.length === 0) {
    return baseModels;
  }

  const mergedModels = [...baseModels];
  let hasAdditionalDefault = false;

  for (const model of modelAdditions) {
    const additionalModel = mapModel(provider, model);
    hasAdditionalDefault ||= additionalModel.isDefault === true;

    const existingIndex = mergedModels.findIndex((candidate) => candidate.id === model.id);
    if (existingIndex === -1) {
      mergedModels.push(additionalModel);
      continue;
    }

    mergedModels[existingIndex] = {
      ...mergedModels[existingIndex],
      ...additionalModel,
    };
  }

  if (!hasAdditionalDefault) {
    return mergedModels;
  }

  const additionalDefaultIds = new Set(
    modelAdditions.filter((model) => model.isDefault === true).map((model) => model.id),
  );

  return mergedModels.map((model) =>
    additionalDefaultIds.has(model.id) ? model : Object.assign({}, model, { isDefault: false }),
  );
}

function shouldUseProfileModelsOnly(
  profileModels: ProviderProfileModel[],
  profileModelsAreAdditive: boolean,
): boolean {
  return profileModels.length > 0 && profileModelsAreAdditive !== true;
}

export function wrapSessionProvider(provider: AgentProvider, inner: AgentSession): AgentSession {
  return {
    provider,
    id: inner.id,
    capabilities: inner.capabilities,
    get features() {
      return inner.features;
    },
    run: (prompt, options) => inner.run(prompt, options),
    startTurn: (prompt, options) => inner.startTurn(prompt, options),
    subscribe: (callback) => inner.subscribe((event) => callback(mapStreamEvent(provider, event))),
    async *streamHistory() {
      for await (const event of inner.streamHistory()) {
        yield mapStreamEvent(provider, event);
      }
    },
    getRuntimeInfo: async () => mapRuntimeInfo(provider, await inner.getRuntimeInfo()),
    getAvailableModes: () => inner.getAvailableModes(),
    getCurrentMode: () => inner.getCurrentMode(),
    setMode: (modeId) => inner.setMode(modeId),
    getPendingPermissions: () => inner.getPendingPermissions(),
    respondToPermission: (requestId, response) => inner.respondToPermission(requestId, response),
    describePersistence: () => mapPersistenceHandle(provider, inner.describePersistence()),
    interrupt: () => inner.interrupt(),
    close: () => inner.close(),
    listCommands: inner.listCommands?.bind(inner),
    setModel: inner.setModel?.bind(inner),
    setThinkingOption: inner.setThinkingOption?.bind(inner),
    setFeature: inner.setFeature?.bind(inner),
    revertConversation: inner.revertConversation?.bind(inner),
    revertFiles: inner.revertFiles?.bind(inner),
    revertBoth: inner.revertBoth?.bind(inner),
    tryHandleOutOfBand: inner.tryHandleOutOfBand?.bind(inner),
  };
}

function wrapClientProvider(
  provider: AgentProvider,
  inner: AgentClient,
  profileModels: ProviderProfileModel[],
  additionalModels: ProviderProfileModel[],
  profileModelsAreAdditive: boolean,
): AgentClient {
  const listPersistedAgents = inner.listPersistedAgents?.bind(inner);

  return {
    provider,
    capabilities: inner.capabilities,
    createSession: async (config, launchContext) =>
      wrapSessionProvider(
        provider,
        await inner.createSession(
          {
            ...config,
            provider: inner.provider,
          },
          launchContext,
        ),
      ),
    resumeSession: async (handle, overrides, launchContext) =>
      wrapSessionProvider(
        provider,
        await inner.resumeSession(
          {
            ...handle,
            provider: inner.provider,
          },
          overrides
            ? {
                ...overrides,
                provider: inner.provider,
              }
            : undefined,
          launchContext,
        ),
      ),
    listModels: async (options) => {
      if (shouldUseProfileModelsOnly(profileModels, profileModelsAreAdditive)) {
        return mergeModels(provider, profileModels, additionalModels, [], {
          profileModelsAreAdditive,
        });
      }
      return mergeModels(
        provider,
        profileModels,
        additionalModels,
        await inner.listModels(options),
        {
          profileModelsAreAdditive,
        },
      );
    },
    listModes: inner.listModes?.bind(inner),
    resolveCreateConfig: inner.resolveCreateConfig?.bind(inner),
    isCreateConfigUnattended: inner.isCreateConfigUnattended?.bind(inner),
    listPersistedAgents: listPersistedAgents
      ? async (options?: ListPersistedAgentsOptions) =>
          (await listPersistedAgents(options)).map((descriptor) =>
            mapPersistedAgentDescriptor(provider, descriptor),
          )
      : undefined,
    isAvailable: () => inner.isAvailable(),
    getDiagnostic: inner.getDiagnostic?.bind(inner),
  };
}

function createRegistryEntry(
  logger: Logger,
  provider: AgentProvider,
  resolved: ResolvedProvider,
): ProviderDefinition {
  const shouldCreateMetadataClientEagerly = resolved.definition.id !== "kimi";
  const modelClient = shouldCreateMetadataClientEagerly ? resolved.createBaseClient(logger) : null;
  const getModelClient = () => modelClient ?? resolved.createBaseClient(logger);

  return {
    ...resolved.definition,
    enabled: resolved.enabled,
    runtimeSettings: resolved.runtimeSettings,
    derivedFromProviderId: resolved.derivedFromProviderId,
    modelGatewayId: resolved.modelGatewayId,
    createClient: (providerLogger: Logger) =>
      createResolvedProviderClient(providerLogger, provider, resolved),
    resolveCreateConfig: modelClient?.resolveCreateConfig ?? resolveDefaultAgentCreateConfig,
    isCreateConfigUnattended:
      modelClient?.isCreateConfigUnattended ?? isDefaultAgentCreateConfigUnattended,
    fetchModels: async (options: ListModelsOptions) => {
      if (shouldUseProfileModelsOnly(resolved.profileModels, resolved.profileModelsAreAdditive)) {
        return mergeModels(provider, resolved.profileModels, resolved.additionalModels, [], {
          profileModelsAreAdditive: resolved.profileModelsAreAdditive,
        });
      }
      return mergeModels(
        provider,
        resolved.profileModels,
        resolved.additionalModels,
        await getModelClient().listModels(options),
        {
          profileModelsAreAdditive: resolved.profileModelsAreAdditive,
        },
      );
    },
    fetchModes: async (options: ListModesOptions) => {
      if (shouldUseProfileModelsOnly(resolved.profileModels, resolved.profileModelsAreAdditive)) {
        return resolved.definition.modes;
      }
      const client = getModelClient();
      const modes = client.listModes ? await client.listModes(options) : resolved.definition.modes;
      return modes.map((mode) => {
        if (mode.icon && mode.colorTier) return mode;
        const definitionMode = resolved.definition.modes.find((d) => d.id === mode.id);
        if (!definitionMode) return mode;
        return Object.assign({}, mode, {
          icon: mode.icon ?? definitionMode.icon,
          colorTier: mode.colorTier ?? definitionMode.colorTier,
        });
      });
    },
  };
}

function createResolvedProviderClient(
  logger: Logger,
  provider: AgentProvider,
  resolved: ResolvedProvider,
): AgentClient {
  const inner = resolved.createBaseClient(logger);
  const hasModelOverrides =
    resolved.profileModels.length > 0 || resolved.additionalModels.length > 0;
  if (inner.provider === provider && !hasModelOverrides) {
    return inner;
  }
  return wrapClientProvider(
    provider,
    inner,
    resolved.profileModels,
    resolved.additionalModels,
    resolved.profileModelsAreAdditive,
  );
}

function buildResolvedBuiltinProviders(
  providerOverrides: Record<string, ProviderOverride>,
  runtimeSettings: AgentProviderRuntimeSettingsMap | undefined,
  options: Pick<BuildProviderRegistryOptions, "workspaceGitService">,
  isDev: boolean,
): Map<string, ResolvedProvider> {
  const resolvedProviders = new Map<string, ResolvedProvider>();

  const definitions = isDev
    ? [...AGENT_PROVIDER_DEFINITIONS, ...DEV_AGENT_PROVIDER_DEFINITIONS]
    : AGENT_PROVIDER_DEFINITIONS;

  for (const definition of definitions) {
    const override = providerOverrides[definition.id];
    const factory = getProviderClientFactory(definition.id);
    const profileModels = override?.models ?? [];
    const additionalModels = override?.additionalModels ?? [];
    const mergedRuntimeSettings = mergeRuntimeSettings(
      runtimeSettings?.[definition.id],
      toRuntimeSettings(override),
    );

    resolvedProviders.set(definition.id, {
      definition: applyOverrideToDefinition(definition, override),
      runtimeSettings: mergedRuntimeSettings,
      profileModels,
      additionalModels,
      profileModelsAreAdditive: definition.id === "claude",
      enabled: override?.enabled !== false,
      derivedFromProviderId: null,
      modelGatewayId: null,
      createBaseClient: (logger) =>
        factory(logger, mergedRuntimeSettings, {
          workspaceGitService: options.workspaceGitService,
          profileModels,
          additionalModels,
        }),
    });
  }

  return resolvedProviders;
}

function requireCustomProviderLabel(providerId: string, override: ProviderOverride): string {
  const label = override.label?.trim();
  if (!label) {
    throw new Error(`Custom provider '${providerId}' requires a label`);
  }
  return label;
}

function requireCustomProviderExtends(providerId: string, override: ProviderOverride): string {
  const extendsProvider = override.extends?.trim();
  if (!extendsProvider) {
    throw new Error(`Custom provider '${providerId}' requires extends`);
  }
  return extendsProvider;
}

function requireAcpCommand(providerId: string, override: ProviderOverride): [string, ...string[]] {
  const command = override.command;
  if (!command || command.length === 0) {
    throw new Error(`ACP provider '${providerId}' requires a command`);
  }
  return command as [string, ...string[]];
}

function buildCustomAcpDefinition(
  providerId: string,
  override: ProviderOverride,
  label: string,
): AgentProviderDefinition {
  return {
    id: providerId,
    label,
    description: override.description ?? "Custom ACP agent provider",
    defaultModeId: null,
    modes: [],
  };
}

function buildDerivedProviderDefinition(
  providerId: string,
  baseDefinition: AgentProviderDefinition,
  override: ProviderOverride,
  label: string,
): AgentProviderDefinition {
  return {
    ...baseDefinition,
    id: providerId,
    label,
    description: override.description ?? baseDefinition.description,
  };
}

function addResolvedCustomProviders(
  resolvedProviders: Map<string, ResolvedProvider>,
  providerOverrides: Record<string, ProviderOverride>,
  runtimeSettings: AgentProviderRuntimeSettingsMap | undefined,
  options: Pick<BuildProviderRegistryOptions, "workspaceGitService"> & {
    modelGatewayIds?: Map<string, string>;
  },
): void {
  for (const [providerId, override] of Object.entries(providerOverrides)) {
    if (resolvedProviders.has(providerId) || !override.extends) {
      continue;
    }

    const label = requireCustomProviderLabel(providerId, override);
    const extendsProvider = requireCustomProviderExtends(providerId, override);
    const profileModels = override.models ?? [];
    const additionalModels = override.additionalModels ?? [];
    const overrideRuntimeSettings = mergeRuntimeSettings(
      runtimeSettings?.[providerId],
      toRuntimeSettings(override),
    );

    if (extendsProvider === "acp") {
      const command = requireAcpCommand(providerId, override);
      resolvedProviders.set(providerId, {
        definition: buildCustomAcpDefinition(providerId, override, label),
        runtimeSettings: overrideRuntimeSettings,
        profileModels,
        additionalModels,
        profileModelsAreAdditive: false,
        enabled: override.enabled !== false,
        derivedFromProviderId: null,
        modelGatewayId: options.modelGatewayIds?.get(providerId) ?? null,
        createBaseClient: (logger) =>
          new GenericACPAgentClient({
            logger,
            command,
            env: overrideRuntimeSettings?.env,
            providerId,
            label,
          }),
      });
      continue;
    }

    const baseResolved = resolvedProviders.get(extendsProvider);
    if (!baseResolved) {
      throw new Error(`Provider '${providerId}' extends unknown provider '${extendsProvider}'`);
    }
    const factory = getProviderClientFactory(extendsProvider);
    const mergedRuntimeSettings = mergeRuntimeSettings(
      baseResolved.runtimeSettings,
      overrideRuntimeSettings,
    );

    resolvedProviders.set(providerId, {
      definition: buildDerivedProviderDefinition(
        providerId,
        baseResolved.definition,
        override,
        label,
      ),
      runtimeSettings: mergedRuntimeSettings,
      profileModels,
      additionalModels,
      profileModelsAreAdditive: false,
      enabled: override.enabled !== false,
      derivedFromProviderId: extendsProvider,
      modelGatewayId: options.modelGatewayIds?.get(providerId) ?? null,
      createBaseClient: (logger) =>
        factory(logger, mergedRuntimeSettings, {
          workspaceGitService: options.workspaceGitService,
          customProvider: {
            id: providerId,
            label,
            extends: extendsProvider,
          },
          profileModels,
          additionalModels,
        }),
    });
  }
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/u, "");
}

function buildGatewayRouteBase(baseUrl: string, gatewayId: string): string {
  return `${trimTrailingSlash(baseUrl)}/api/model-gateways/${encodeURIComponent(gatewayId)}`;
}

function buildGatewayProviderModels(
  models: ProviderProfileModel[],
  options?: { modelPrefix?: string; supportsTools?: boolean },
): ProviderProfileModel[] {
  return models.map((model, index) => ({
    ...model,
    id:
      options?.modelPrefix && !model.id.startsWith(`${options.modelPrefix}/`)
        ? `${options.modelPrefix}/${model.id}`
        : model.id,
    ...(options?.supportsTools === false ? { supportsTools: false } : {}),
    ...(model.isDefault === undefined && index === 0 ? { isDefault: true } : {}),
  }));
}

function buildGatewaySyntheticModels(gateway: ModelGatewayConfig): ProviderProfileModel[] {
  return (gateway.syntheticModels ?? []).map((model) => {
    const providerModel: ProviderProfileModel = {
      id: model.id,
      label: model.label,
    };
    if (model.description) {
      providerModel.description = model.description;
    }
    return providerModel;
  });
}

function buildAllGatewayProviderModels(
  gateway: ModelGatewayConfig,
  options?: { modelPrefix?: string; models?: ProviderProfileModel[]; supportsTools?: boolean },
): ProviderProfileModel[] {
  return buildGatewayProviderModels(
    [...(options?.models ?? gateway.models ?? []), ...buildGatewaySyntheticModels(gateway)],
    options,
  );
}

function isXiaomiChatCompletionsGateway(gateway: ModelGatewayConfig): boolean {
  if (gateway.upstreams.chatCompletions.enabled !== true) {
    return false;
  }
  try {
    return new URL(gateway.upstreams.chatCompletions.baseUrl).hostname === "api.xiaomimimo.com";
  } catch {
    return false;
  }
}

function resolveNativeXiaomiGatewayEnv(
  gateway: ModelGatewayConfig,
): { env: Record<string, string>; modelPrefix: string } | null {
  if (!isXiaomiChatCompletionsGateway(gateway)) {
    return null;
  }
  const apiKey = gateway.upstreams.chatCompletions.apiKey.trim();
  if (!apiKey) {
    return null;
  }
  return {
    env: { XIAOMI_API_KEY: apiKey },
    modelPrefix: "xiaomi",
  };
}

function gatewayProviderOverride(params: {
  gateway: ModelGatewayConfig;
  extendsProvider: "claude" | "codex" | "opencode" | "mimocode" | "pi" | "kimi";
  label: string;
  baseUrl: string;
  token: string;
  models: ProviderProfileModel[];
}): ProviderOverride {
  const { gateway, extendsProvider, baseUrl, token, models } = params;
  const routeBase = buildGatewayRouteBase(baseUrl, gateway.id);
  if (extendsProvider === "claude") {
    return {
      extends: "claude",
      label: params.label,
      env: {
        ANTHROPIC_API_KEY: token,
        ANTHROPIC_AUTH_TOKEN: token,
        ANTHROPIC_BASE_URL: routeBase,
      },
      disallowedTools: ["WebSearch"],
      models,
      enabled: gateway.enabled !== false,
    };
  }
  if (extendsProvider === "codex") {
    return {
      extends: "codex",
      label: params.label,
      env: {
        OPENAI_API_KEY: token,
        OPENAI_BASE_URL: routeBase,
        OPENAI_WIRE_API: "responses",
      },
      models,
      enabled: gateway.enabled !== false,
    };
  }
  if (extendsProvider === "kimi") {
    return {
      extends: "kimi",
      label: params.label,
      env: {
        OPENAI_API_KEY: token,
        OPENAI_BASE_URL: `${routeBase}/v1`,
      },
      models,
      enabled: gateway.enabled !== false,
    };
  }
  const nativeXiaomi = ["opencode", "mimocode", "pi"].includes(extendsProvider)
    ? resolveNativeXiaomiGatewayEnv(gateway)
    : null;
  if (nativeXiaomi) {
    return {
      extends: extendsProvider,
      label: params.label,
      env: nativeXiaomi.env,
      models: buildGatewayProviderModels(models, { modelPrefix: nativeXiaomi.modelPrefix }),
      enabled: gateway.enabled !== false,
    };
  }
  return {
    extends: extendsProvider,
    label: params.label,
    env: {
      OPENAI_API_KEY: token,
      OPENAI_BASE_URL: `${routeBase}/v1`,
    },
    models,
    enabled: gateway.enabled !== false,
  };
}

function addResolvedModelGatewayProviders(
  resolvedProviders: Map<string, ResolvedProvider>,
  modelGateways: ModelGatewayConfigs | undefined,
  runtimeSettings: AgentProviderRuntimeSettingsMap | undefined,
  options: Pick<
    BuildProviderRegistryOptions,
    "workspaceGitService" | "modelGatewayBaseUrl" | "modelGatewayToken"
  >,
): void {
  const baseUrl = options.modelGatewayBaseUrl?.trim();
  const token = options.modelGatewayToken?.trim();
  if (!baseUrl || !token) {
    return;
  }

  const gatewayOverrides: Record<string, ProviderOverride> = {};
  const modelGatewayIds = new Map<string, string>();
  for (const gateway of Object.values(modelGateways ?? {})) {
    const gatewayId = gateway.id;
    const models = buildAllGatewayProviderModels(gateway);
    const nativeXiaomi = resolveNativeXiaomiGatewayEnv(gateway);
    const opencodeProviderModels = buildAllGatewayProviderModels(gateway, {
      modelPrefix: nativeXiaomi?.modelPrefix ?? "openai",
      models: gateway.generatedModels?.opencode,
    });
    const mimocodeProviderModels = buildAllGatewayProviderModels(gateway, {
      modelPrefix: nativeXiaomi?.modelPrefix ?? "openai",
      models: gateway.generatedModels?.mimocode,
    });
    const piProviderModels = buildAllGatewayProviderModels(gateway, {
      modelPrefix: nativeXiaomi?.modelPrefix ?? "openai",
      models: gateway.generatedModels?.pi,
    });
    const kimiProviderModels = buildAllGatewayProviderModels(gateway, {
      models: gateway.generatedModels?.kimi,
      supportsTools: nativeXiaomi ? false : undefined,
    });
    gatewayOverrides[`${gatewayId}-claude`] = gatewayProviderOverride({
      gateway,
      extendsProvider: "claude",
      label: `${gateway.label} Claude`,
      baseUrl,
      token,
      models,
    });
    modelGatewayIds.set(`${gatewayId}-claude`, gatewayId);
    gatewayOverrides[`${gatewayId}-codex`] = gatewayProviderOverride({
      gateway,
      extendsProvider: "codex",
      label: `${gateway.label} Codex`,
      baseUrl,
      token,
      models,
    });
    modelGatewayIds.set(`${gatewayId}-codex`, gatewayId);
    gatewayOverrides[`${gatewayId}-opencode`] = gatewayProviderOverride({
      gateway,
      extendsProvider: "opencode",
      label: `${gateway.label} OpenCode`,
      baseUrl,
      token,
      models: opencodeProviderModels,
    });
    modelGatewayIds.set(`${gatewayId}-opencode`, gatewayId);
    gatewayOverrides[`${gatewayId}-mimocode`] = gatewayProviderOverride({
      gateway,
      extendsProvider: "mimocode",
      label: `${gateway.label} MiMoCode`,
      baseUrl,
      token,
      models: mimocodeProviderModels,
    });
    modelGatewayIds.set(`${gatewayId}-mimocode`, gatewayId);
    gatewayOverrides[`${gatewayId}-pi`] = gatewayProviderOverride({
      gateway,
      extendsProvider: "pi",
      label: `${gateway.label} Pi`,
      baseUrl,
      token,
      models: piProviderModels,
    });
    modelGatewayIds.set(`${gatewayId}-pi`, gatewayId);
    gatewayOverrides[`${gatewayId}-kimi`] = gatewayProviderOverride({
      gateway,
      extendsProvider: "kimi",
      label: `${gateway.label} Kimi Code`,
      baseUrl,
      token,
      models: kimiProviderModels,
    });
    modelGatewayIds.set(`${gatewayId}-kimi`, gatewayId);
  }

  addResolvedCustomProviders(resolvedProviders, gatewayOverrides, runtimeSettings, {
    workspaceGitService: options.workspaceGitService,
    modelGatewayIds,
  });
}

export function buildProviderRegistry(
  logger: Logger,
  options?: BuildProviderRegistryOptions,
): Record<AgentProvider, ProviderDefinition> {
  const runtimeSettings = options?.runtimeSettings;
  const providerOverrides = options?.providerOverrides ?? {};
  const resolvedProviders = buildResolvedBuiltinProviders(
    providerOverrides,
    runtimeSettings,
    {
      workspaceGitService: options?.workspaceGitService,
    },
    options?.isDev === true,
  );
  addResolvedCustomProviders(resolvedProviders, providerOverrides, runtimeSettings, {
    workspaceGitService: options?.workspaceGitService,
  });
  addResolvedModelGatewayProviders(resolvedProviders, options?.modelGateways, runtimeSettings, {
    workspaceGitService: options?.workspaceGitService,
    modelGatewayBaseUrl: options?.modelGatewayBaseUrl,
    modelGatewayToken: options?.modelGatewayToken,
  });
  return Object.fromEntries(
    [...resolvedProviders.entries()].map(([provider, resolved]) => [
      provider,
      createRegistryEntry(logger, provider, resolved),
    ]),
  ) as Record<AgentProvider, ProviderDefinition>;
}

export function getProviderIds(
  registry: Record<AgentProvider, ProviderDefinition>,
): AgentProvider[] {
  return Object.keys(registry);
}

// Deprecated: Use buildProviderRegistry instead
export const PROVIDER_REGISTRY: Record<AgentProvider, ProviderDefinition> =
  null as unknown as Record<AgentProvider, ProviderDefinition>;

export function createAllClients(
  logger: Logger,
  options?: BuildProviderRegistryOptions,
): Record<AgentProvider, AgentClient> {
  return createClientsFromRegistry(buildProviderRegistry(logger, options), logger);
}

export function createClientsFromRegistry(
  registry: Record<AgentProvider, ProviderDefinition>,
  logger: Logger,
): Record<AgentProvider, AgentClient> {
  return Object.fromEntries(
    Object.entries(registry).map(([provider, definition]) => [
      provider,
      definition.createClient(logger),
    ]),
  ) as Record<AgentProvider, AgentClient>;
}

export async function shutdownProviders(
  logger: Logger,
  options?: BuildProviderRegistryOptions,
): Promise<void> {
  const clients = createAllClients(logger, options);
  await shutdownAgentClients(Object.values(clients), logger);
}

export async function shutdownAgentClients(
  clients: Iterable<AgentClient>,
  logger: Logger,
): Promise<void> {
  await Promise.all(
    Array.from(clients).map(async (client) => {
      if (!client.shutdown) return;
      try {
        await client.shutdown();
      } catch (error) {
        logger.warn({ err: error, provider: client.provider }, "Provider client shutdown failed");
      }
    }),
  );
}
