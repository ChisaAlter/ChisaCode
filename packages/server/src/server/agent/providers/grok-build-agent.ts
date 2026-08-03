import type { Logger } from "pino";

import type { ProviderRuntimeSettings } from "../provider-launch-config.js";
import { GenericACPAgentClient } from "./generic-acp-agent.js";

interface GrokBuildAgentClientOptions {
  logger: Logger;
  runtimeSettings?: ProviderRuntimeSettings;
  providerId?: string;
  label?: string;
}

export class GrokBuildAgentClient extends GenericACPAgentClient {
  constructor(options: GrokBuildAgentClientOptions) {
    const providerId = options.providerId ?? "grokbuild";
    const label = options.label ?? "Grok Build";
    super({
      logger: options.logger,
      command: resolveGrokBuildCommand(options.runtimeSettings),
      env: options.runtimeSettings?.env,
      providerId,
      label,
    });
  }
}

/**
 * Resolves the Grok Build ACP launcher command for provider runtime settings.
 * @param runtimeSettings Optional provider command and environment overrides
 * @returns The complete Grok Build ACP argv
 */
export function resolveGrokBuildCommand(
  runtimeSettings: ProviderRuntimeSettings | undefined,
): [string, ...string[]] {
  if (runtimeSettings?.command?.mode === "replace") {
    const [command, ...args] = runtimeSettings.command.argv;
    return [command, ...args];
  }
  if (runtimeSettings?.command?.mode === "append") {
    return ["grok", ...(runtimeSettings.command.args ?? []), "agent", "stdio"];
  }
  return ["grok", "agent", "stdio"];
}
