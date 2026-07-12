import type { Logger } from "pino";

import type { ProviderRuntimeSettings } from "../provider-launch-config.js";
import {
  MIMOCODE_PROVIDER_CONFIG,
  OPENCODE_PROVIDER_CONFIG,
  OpenCodeAgentClientRuntime,
  type OpenCodeAgentClientDeps,
  type OpenCodeSessionFactoryInput,
} from "./opencode/client.js";
import { collectOpenCodePersistedAgentsFromSdk, OpenCodeAgentSession } from "./opencode/session.js";

export { translateOpenCodeEvent } from "./opencode/event-translator.js";
export type { OpenCodeEventTranslationState } from "./opencode/event-translator.js";
export { __openCodeInternals } from "./opencode/session.js";
export { type OpenCodeAgentClientDeps };

function createOpenCodeSession(input: OpenCodeSessionFactoryInput): OpenCodeAgentSession {
  return new OpenCodeAgentSession(
    input.config,
    input.client,
    input.sessionId,
    input.logger,
    input.modelContextWindowsByModelKey,
    input.releaseServer,
    input.persistSession,
    input.agentId,
    input.modelPrefix,
  );
}

export class OpenCodeAgentClient extends OpenCodeAgentClientRuntime {
  constructor(
    logger: Logger,
    runtimeSettings?: ProviderRuntimeSettings,
    deps: OpenCodeAgentClientDeps = {},
  ) {
    super(
      logger,
      runtimeSettings,
      deps,
      createOpenCodeSession,
      collectOpenCodePersistedAgentsFromSdk,
      OPENCODE_PROVIDER_CONFIG,
    );
  }
}

export class MimoCodeAgentClient extends OpenCodeAgentClientRuntime {
  constructor(
    logger: Logger,
    runtimeSettings?: ProviderRuntimeSettings,
    deps: OpenCodeAgentClientDeps = {},
  ) {
    super(
      logger,
      runtimeSettings,
      deps,
      createOpenCodeSession,
      collectOpenCodePersistedAgentsFromSdk,
      MIMOCODE_PROVIDER_CONFIG,
    );
  }
}
