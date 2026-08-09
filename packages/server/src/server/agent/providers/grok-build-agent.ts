import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { Logger } from "pino";

import type { ProviderProfileModel, ProviderRuntimeSettings } from "../provider-launch-config.js";
import { GenericACPAgentClient } from "./generic-acp-agent.js";

interface GrokBuildAgentClientOptions {
  logger: Logger;
  runtimeSettings?: ProviderRuntimeSettings;
  providerId?: string;
  label?: string;
  models?: ProviderProfileModel[];
}

export class GrokBuildAgentClient extends GenericACPAgentClient {
  constructor(options: GrokBuildAgentClientOptions) {
    const providerId = options.providerId ?? "grokbuild";
    const label = options.label ?? "Grok Build";
    const env = prepareGrokGatewayEnv({
      providerId,
      env: options.runtimeSettings?.env,
      models: options.models,
    });
    const runtimeSettings = withGatewayAlwaysApproveCommand(options.runtimeSettings, env);

    super({
      logger: options.logger,
      command: resolveGrokBuildCommand(runtimeSettings),
      env,
      providerId,
      label,
    });
  }
}

/**
 * Gateway-backed Grok sessions need non-interactive tool approval so multi-turn
 * shell loops do not stall on ChisaCode permission prompts.
 */
function withGatewayAlwaysApproveCommand(
  runtimeSettings: ProviderRuntimeSettings | undefined,
  env: Record<string, string> | undefined,
): ProviderRuntimeSettings | undefined {
  if (!isGatewayRoutedGrokEnv(env)) {
    return runtimeSettings;
  }
  if (runtimeSettings?.command?.mode === "replace") {
    // Respect explicit full argv replacements; callers can include --always-approve.
    return runtimeSettings;
  }
  const existingArgs =
    runtimeSettings?.command?.mode === "append" ? (runtimeSettings.command.args ?? []) : [];
  if (existingArgs.includes("--always-approve")) {
    return runtimeSettings ?? { env };
  }
  return {
    ...runtimeSettings,
    command: {
      mode: "append",
      args: [...existingArgs, "--always-approve"],
    },
    env: runtimeSettings?.env ?? env,
  };
}

function isGatewayRoutedGrokEnv(env: Record<string, string> | undefined): boolean {
  if (!env) {
    return false;
  }
  const modelsBase = env.GROK_MODELS_BASE_URL?.trim() ?? "";
  const openAiBase = env.OPENAI_BASE_URL?.trim() ?? "";
  return (
    modelsBase.includes("/api/model-gateways/") ||
    openAiBase.includes("/api/model-gateways/") ||
    Boolean(env.GROK_HOME?.includes("provider-runtime") && env.GROK_HOME.includes("grokbuild"))
  );
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
  // Gateway faces inject `--always-approve` via append so tool-call loops do not
  // stall on ChisaCode permission prompts for every shell execute.
  if (runtimeSettings?.command?.mode === "append") {
    return ["grok", ...(runtimeSettings.command.args ?? []), "agent", "stdio"];
  }
  return ["grok", "agent", "stdio"];
}

/**
 * Materializes an isolated Grok home when gateway credentials are present so
 * model-gateway faces never read or write the user's `~/.grok` free-tier config.
 * @param options Provider id, runtime env, and gateway models
 * @returns Env with `GROK_HOME` (and token fallbacks) or the original env unchanged
 */
export function prepareGrokGatewayEnv(options: {
  providerId: string;
  env: Record<string, string> | undefined;
  models: ProviderProfileModel[] | undefined;
}): Record<string, string> | undefined {
  const env = options.env;
  const apiKey = env?.OPENAI_API_KEY?.trim() || env?.XAI_API_KEY?.trim();
  const baseUrl = env?.OPENAI_BASE_URL?.trim();
  const models = options.models ?? [];
  if (!apiKey || !baseUrl || models.length === 0 || env?.GROK_HOME) {
    return env;
  }

  const grokHome = resolveManagedGrokHome(options.providerId, baseUrl);
  writeManagedGrokConfig(grokHome, {
    apiKey,
    baseUrl,
    models,
  });

  return {
    ...env,
    GROK_HOME: grokHome,
    // Grok CLI routes OpenAI-compatible inference through models_base_url /
    // GROK_MODELS_BASE_URL. Per-model base_url on built-in ids like grok-4.5 is
    // ignored and still hits console.x.ai.
    GROK_MODELS_BASE_URL: baseUrl,
    // Prefer the "always allow" row when Grok still surfaces a first prompt.
    GROK_DEFAULT_SELECTED_PERMISSION: "always_allow_all_sessions",
    XAI_API_KEY: apiKey,
    OPENAI_API_KEY: apiKey,
    OPENAI_BASE_URL: baseUrl,
  };
}

function resolveManagedGrokHome(providerId: string, baseUrl: string): string {
  const chisacodeHome = process.env.CHISACODE_HOME?.trim() || join(homedir(), ".chisacode");
  const safeProviderId = providerId.replace(/[^a-zA-Z0-9_-]+/gu, "-");
  const configHash = createHash("sha256").update(baseUrl).digest("hex").slice(0, 10);
  return join(chisacodeHome, "provider-runtime", "grokbuild", `${safeProviderId}-${configHash}`);
}

function writeManagedGrokConfig(
  grokHome: string,
  options: {
    apiKey: string;
    baseUrl: string;
    models: ProviderProfileModel[];
  },
): void {
  mkdirSync(grokHome, { recursive: true, mode: 0o700 });
  writeFileSync(join(grokHome, "config.toml"), buildManagedGrokConfigToml(options), {
    encoding: "utf8",
    mode: 0o600,
  });
}

/**
 * Builds a managed Grok `config.toml` that routes models through an OpenAI-compatible gateway.
 *
 * Grok CLI only honors custom OpenAI-compatible backends via `[endpoints].models_base_url`
 * (or `GROK_MODELS_BASE_URL`). Setting `base_url` under `[model.<builtin-id>]` does **not**
 * divert built-in ids such as `grok-4.5` away from xAI free/subscription auth.
 *
 * @param options API credentials, base URL, and model list
 * @returns TOML document contents
 */
export function buildManagedGrokConfigToml(options: {
  apiKey: string;
  baseUrl: string;
  models: ProviderProfileModel[];
}): string {
  const models = mergeGrokModels(options.models);
  const defaultModel = models.find((model) => model.isDefault)?.id ?? models[0]?.id ?? "";
  const lines = [
    // Headless gateway sessions should not stop on interactive approval UI.
    "[permissions]",
    'default_selected_permission = "always_allow_all_sessions"',
    "",
    "[ui]",
    "yolo = true",
    "remember_tool_approvals = true",
    "",
    "[models]",
    `default = ${tomlString(defaultModel)}`,
    "",
    "[endpoints]",
    `models_base_url = ${tomlString(options.baseUrl)}`,
    `api_key = ${tomlString(options.apiKey)}`,
  ];

  // Optional per-model display/context overrides. Do not set base_url here for
  // built-in model ids; Grok ignores it and keeps the xAI endpoint.
  for (const model of models) {
    const tableKey = grokModelTableKey(model.id);
    lines.push("", `[model.${tableKey}]`, `model = ${tomlString(model.id)}`);
    if (model.label && model.label !== model.id) {
      lines.push(`name = ${tomlString(model.label)}`);
    }
    if (model.description) {
      lines.push(`description = ${tomlString(model.description)}`);
    }
    if (model.contextWindowMaxTokens) {
      lines.push(`context_window = ${model.contextWindowMaxTokens}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function mergeGrokModels(models: ProviderProfileModel[]): ProviderProfileModel[] {
  const mergedModels: ProviderProfileModel[] = [];
  for (const model of models) {
    const existingIndex = mergedModels.findIndex((candidate) => candidate.id === model.id);
    if (existingIndex === -1) {
      mergedModels.push(model);
      continue;
    }
    mergedModels[existingIndex] = {
      ...mergedModels[existingIndex],
      ...model,
    };
  }
  return mergedModels;
}

function grokModelTableKey(modelId: string): string {
  // Bare keys match Grok's own examples (`[model.grok-4.5]`); quote anything else.
  if (/^[A-Za-z0-9._-]+$/u.test(modelId)) {
    return modelId;
  }
  return tomlString(modelId);
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}
