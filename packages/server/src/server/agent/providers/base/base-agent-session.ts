import type {
  AgentCapabilityFlags,
  AgentFeature,
  AgentMode,
  AgentPersistenceHandle,
  AgentPermissionRequest,
  AgentPermissionResponse,
  AgentPermissionResult,
  AgentPromptInput,
  AgentRunOptions,
  AgentRunResult,
  AgentRuntimeInfo,
  AgentSession,
  AgentSessionConfig,
  AgentStreamEvent,
} from "../../agent-sdk-types.js";
import { runProviderTurn } from "../provider-runner.js";

/**
 * Abstract base class for provider agent sessions.
 *
 * Implements the shared {@link AgentSession} contract with common patterns
 * observed across all three providers (Codex, Claude, OpenCode):
 * subscriber management, turn-ID generation, event emission, runtime-info
 * caching, mode/model/thinking-option persistence, permission tracking,
 * interrupt, and close.
 *
 * Subclasses must implement provider-specific turn execution, feature
 * toggles, native event dispatch, and the remaining abstract members.
 *
 * This is Slice 0 of the provider god-file split. No existing provider
 * files are modified; future slices will port each provider to extend
 * this base.
 */
export abstract class BaseAgentSession implements AgentSession {
  abstract readonly provider: AgentSession["provider"];
  abstract readonly capabilities: AgentCapabilityFlags;

  protected readonly config: AgentSessionConfig;
  protected readonly subscribers = new Set<(event: AgentStreamEvent) => void>();
  protected nextTurnOrdinal = 0;
  protected activeForegroundTurnId: string | null = null;
  protected pendingPermissions = new Map<string, AgentPermissionRequest>();
  protected closed = false;
  protected cachedRuntimeInfo: AgentRuntimeInfo | null = null;

  constructor(config: AgentSessionConfig) {
    this.config = config;
  }

  // ---------------------------------------------------------------------------
  // Identity
  // ---------------------------------------------------------------------------

  abstract get id(): string | null;

  get features(): AgentFeature[] | undefined {
    return undefined;
  }

  // ---------------------------------------------------------------------------
  // Subscriber management — identical across all providers
  // ---------------------------------------------------------------------------

  subscribe(callback: (event: AgentStreamEvent) => void): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  // ---------------------------------------------------------------------------
  // Event emission — all providers tag events with the current turn ID and
  // suppress delivery once closed. Subclasses may override for custom logging.
  // ---------------------------------------------------------------------------

  /**
   * Notify all registered subscribers with an event.
   * Events are tagged with the active foreground turn ID unless overridden.
   * @param event The stream event to dispatch
   * @param turnIdOverride Optional override for the turn-ID tag
   */
  protected notifySubscribers(event: AgentStreamEvent, turnIdOverride?: string): void {
    if (this.closed) {
      return;
    }
    const turnId = turnIdOverride ?? this.activeForegroundTurnId;
    const tagged = turnId ? { ...event, turnId } : event;
    for (const callback of this.subscribers) {
      try {
        callback(tagged);
      } catch {
        // Subscriber error isolation — must not propagate to other subscribers
      }
    }
  }

  /**
   * Convenience alias for {@link notifySubscribers}.
   * Provided for providers (e.g. Codex) that use the `emitEvent` naming convention.
   */
  protected emitEvent(event: AgentStreamEvent): void {
    this.notifySubscribers(event);
  }

  // ---------------------------------------------------------------------------
  // Turn-ID generation — provider-prefixed ordinal counter
  // ---------------------------------------------------------------------------

  /**
   * Generate a unique turn ID scoped to this session.
   * Format: `{provider}-turn-{ordinal}`.
   */
  protected createTurnId(): string {
    return `${this.provider}-turn-${this.nextTurnOrdinal++}`;
  }

  // ---------------------------------------------------------------------------
  // Turn lifecycle helpers
  // ---------------------------------------------------------------------------

  /**
   * Mark a foreground turn as active and emit `turn_started`.
   */
  protected beginForegroundTurn(turnId: string): void {
    this.activeForegroundTurnId = turnId;
    this.notifySubscribers({ type: "turn_started", provider: this.provider });
  }

  /**
   * Emit a terminal turn event and clear the foreground turn.
   */
  protected finishForegroundTurn(
    event: Extract<AgentStreamEvent, { type: "turn_completed" | "turn_failed" | "turn_canceled" }>,
  ): void {
    this.notifySubscribers(event);
    this.activeForegroundTurnId = null;
  }

  // ---------------------------------------------------------------------------
  // run() — delegates to the shared provider-runner utility
  // ---------------------------------------------------------------------------

  async run(prompt: AgentPromptInput, options?: AgentRunOptions): Promise<AgentRunResult> {
    return runProviderTurn({
      prompt,
      runOptions: options,
      startTurn: (p, o) => this.startTurn(p, o),
      subscribe: (callback) => this.subscribe(callback),
      getSessionId: () => this.id ?? "",
    });
  }

  // ---------------------------------------------------------------------------
  // Runtime info — cached with invalidation on config changes
  // ---------------------------------------------------------------------------

  async getRuntimeInfo(): Promise<AgentRuntimeInfo> {
    if (this.cachedRuntimeInfo) {
      return { ...this.cachedRuntimeInfo };
    }
    const info: AgentRuntimeInfo = {
      provider: this.provider,
      sessionId: this.id,
      model: this.resolvedModel,
      modeId: this.resolvedMode,
      thinkingOptionId: this.resolvedThinkingOption,
    };
    this.cachedRuntimeInfo = info;
    return { ...info };
  }

  // ---------------------------------------------------------------------------
  // Persistence handle — default maps sessionId → nativeHandle
  // ---------------------------------------------------------------------------

  describePersistence(): AgentPersistenceHandle | null {
    const sid = this.id;
    if (!sid) {
      return null;
    }
    return {
      provider: this.provider,
      sessionId: sid,
      nativeHandle: sid,
    };
  }

  // ---------------------------------------------------------------------------
  // Mode / Model / Thinking option
  // ---------------------------------------------------------------------------

  /**
   * Set the active mode.
   * Default: stores on config and invalidates the runtime-info cache.
   * Providers that need extra side-effects (e.g. applying feature toggles,
   * validating against available modes, or calling native SDK APIs) should
   * override this method.
   */
  async setMode(modeId: string): Promise<void> {
    this.config.modeId = modeId;
    this.cachedRuntimeInfo = null;
  }

  /**
   * Set the active model.
   * Default: stores on config and invalidates the runtime-info cache.
   */
  async setModel(modelId: string | null): Promise<void> {
    this.config.model = modelId ?? undefined;
    this.cachedRuntimeInfo = null;
  }

  /**
   * Set the thinking option.
   * Default: stores on config and invalidates the runtime-info cache.
   */
  async setThinkingOption(thinkingOptionId: string | null): Promise<void> {
    this.config.thinkingOptionId = thinkingOptionId ?? undefined;
    this.cachedRuntimeInfo = null;
  }

  // ---------------------------------------------------------------------------
  // Resolved config helpers (used by getRuntimeInfo default)
  // ---------------------------------------------------------------------------

  protected get resolvedModel(): string | null {
    return this.config.model ?? null;
  }

  protected get resolvedMode(): string | null {
    return this.config.modeId ?? null;
  }

  protected get resolvedThinkingOption(): string | null {
    return this.config.thinkingOptionId ?? null;
  }

  // ---------------------------------------------------------------------------
  // Features — provider-specific; default throws
  // ---------------------------------------------------------------------------

  abstract setFeature(featureId: string, value: unknown): Promise<void>;

  // ---------------------------------------------------------------------------
  // Permissions
  // ---------------------------------------------------------------------------

  getPendingPermissions(): AgentPermissionRequest[] {
    return Array.from(this.pendingPermissions.values());
  }

  // ---------------------------------------------------------------------------
  // Interrupt — aborts the active turn and emits turn_canceled
  // ---------------------------------------------------------------------------

  async interrupt(): Promise<void> {
    const turnId = this.activeForegroundTurnId;
    await this.doInterrupt();
    if (turnId) {
      this.finishForegroundTurn({
        type: "turn_canceled",
        provider: this.provider,
        reason: "interrupted",
      });
    }
  }

  /**
   * Provider-specific interrupt hook.
   * Subclasses must signal the native provider to abort the active turn.
   */
  protected abstract doInterrupt(): Promise<void>;

  // ---------------------------------------------------------------------------
  // Close — flips closed flag, clears subscribers and pending state
  // ---------------------------------------------------------------------------

  async close(): Promise<void> {
    this.closed = true;
    this.subscribers.clear();
    this.pendingPermissions.clear();
    this.activeForegroundTurnId = null;
    this.cachedRuntimeInfo = null;
    await this.doClose();
  }

  /**
   * Provider-specific close hook.
   * Subclasses should release native resources (abort event streams,
   * dispose clients, release server handles) in this method.
   * Called after the base class has cleared generic state.
   */
  protected async doClose(): Promise<void> {
    // Default: no-op. Override in subclasses to release native resources.
  }

  // ---------------------------------------------------------------------------
  // Abstract — must be implemented by each provider
  // ---------------------------------------------------------------------------

  abstract startTurn(
    prompt: AgentPromptInput,
    options?: AgentRunOptions,
  ): Promise<{
    turnId: string;
  }>;
  abstract streamHistory(): AsyncGenerator<AgentStreamEvent>;
  abstract getAvailableModes(): Promise<AgentMode[]>;
  abstract getCurrentMode(): Promise<string | null>;
  abstract respondToPermission(
    requestId: string,
    response: AgentPermissionResponse,
  ): Promise<AgentPermissionResult | void>;

  /**
   * Route a native provider event into the ChisaCode event stream.
   * Each provider translates its own SDK event type and calls
   * {@link notifySubscribers} or {@link emitEvent} with the resulting
   * {@link AgentStreamEvent}.
   */
  protected abstract dispatchNativeEvent(event: unknown): Promise<void>;
}
