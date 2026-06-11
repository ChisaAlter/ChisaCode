import type { Logger } from "pino";

import type { ProviderRuntimeSettings } from "../provider-launch-config.js";
import { GenericACPAgentClient } from "./generic-acp-agent.js";

interface KimiCodeAgentClientOptions {
  logger: Logger;
  runtimeSettings?: ProviderRuntimeSettings;
}

export class KimiCodeAgentClient extends GenericACPAgentClient {
  constructor(options: KimiCodeAgentClientOptions) {
    super({
      logger: options.logger,
      command: resolveKimiCommand(options.runtimeSettings),
      env: options.runtimeSettings?.env,
      providerId: "kimi",
      label: "Kimi Code",
    });
  }
}

function resolveKimiCommand(
  runtimeSettings: ProviderRuntimeSettings | undefined,
): [string, ...string[]] {
  if (runtimeSettings?.command?.mode === "replace") {
    const [command, ...args] = runtimeSettings.command.argv;
    return [command, ...args];
  }
  if (runtimeSettings?.command?.mode === "append") {
    return ["kimi", ...(runtimeSettings.command.args ?? []), "acp"];
  }
  return ["kimi", "acp"];
}
