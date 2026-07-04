import type {
  AgentCapabilityFlags,
  AgentClient,
  AgentCreateSessionOptions,
  AgentCreateConfigUnattendedInput,
  AgentFeature,
  AgentLaunchContext,
  AgentMode,
  AgentModelDefinition,
  AgentPersistenceHandle,
  AgentSession,
  AgentSessionConfig,
  AgentSkill,
  AgentSlashCommand,
  ListModelsOptions,
  ListModesOptions,
  ListPersistedAgentsOptions,
  PersistedAgentDescriptor,
  ResolveAgentCreateConfigInput,
  ResolveAgentCreateConfigResult,
} from "../../agent-sdk-types.js";

/**
 * Abstract base class for provider agent clients.
 *
 * Implements the shared {@link AgentClient} contract with skeleton
 * implementations for availability checks, diagnostics, and persisted-agent
 * listing. Subclasses supply provider-specific config validation and session
 * instantiation.
 *
 * This is Slice 0 of the provider god-file split. No existing provider
 * files are modified.
 */
export abstract class BaseAgentClient implements AgentClient {
  abstract readonly provider: AgentClient["provider"];
  abstract readonly capabilities: AgentCapabilityFlags;

  // ---------------------------------------------------------------------------
  // Lifecycle — fully provider-specific
  // ---------------------------------------------------------------------------

  abstract createSession(
    config: AgentSessionConfig,
    launchContext?: AgentLaunchContext,
    options?: AgentCreateSessionOptions,
  ): Promise<AgentSession>;

  abstract resumeSession(
    handle: AgentPersistenceHandle,
    overrides?: Partial<AgentSessionConfig>,
    launchContext?: AgentLaunchContext,
  ): Promise<AgentSession>;

  abstract listModels(options: ListModelsOptions): Promise<AgentModelDefinition[]>;

  // ---------------------------------------------------------------------------
  // Config validation — abstract
  // ---------------------------------------------------------------------------

  /**
   * Validate and normalize an {@link AgentSessionConfig} for this provider.
   * Called before createSession / resumeSession to assert that the config
   * targets this provider and contains required fields.
   * @throws If the config is invalid or targets a different provider
   */
  protected abstract assertConfig(config: AgentSessionConfig): Promise<AgentSessionConfig>;

  // ---------------------------------------------------------------------------
  // Availability — common pattern across providers
  // ---------------------------------------------------------------------------

  abstract isAvailable(): Promise<boolean>;

  // ---------------------------------------------------------------------------
  // Diagnostic — skeleton; providers override with detailed diagnostics
  // ---------------------------------------------------------------------------

  async getDiagnostic(): Promise<{ diagnostic: string }> {
    const available = await this.isAvailable();
    return {
      diagnostic: `${this.provider}: ${available ? "available" : "not available"}`,
    };
  }

  // ---------------------------------------------------------------------------
  // Persisted agents — skeleton; providers override with native listing
  // ---------------------------------------------------------------------------

  async listPersistedAgents(
    _options?: ListPersistedAgentsOptions,
  ): Promise<PersistedAgentDescriptor[]> {
    return [];
  }

  // ---------------------------------------------------------------------------
  // Optional contract members — declared but not abstract since they are
  // optional in {@link AgentClient}. Subclasses may override.
  // ---------------------------------------------------------------------------

  listModes?(options: ListModesOptions): Promise<AgentMode[]>;
  resolveCreateConfig?(input: ResolveAgentCreateConfigInput): ResolveAgentCreateConfigResult;
  isCreateConfigUnattended?(input: AgentCreateConfigUnattendedInput): boolean;
  listCommands?(config: AgentSessionConfig): Promise<AgentSlashCommand[]>;
  listSkills?(config: AgentSessionConfig): Promise<AgentSkill[]>;
  listFeatures?(config: AgentSessionConfig): Promise<AgentFeature[]>;
  archiveNativeSession?(handle: AgentPersistenceHandle): Promise<void>;
  shutdown?(): Promise<void>;
}
