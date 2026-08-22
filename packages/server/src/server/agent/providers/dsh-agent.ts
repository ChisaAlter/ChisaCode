import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import type { Logger } from "pino";

import type {
  AgentCapabilityFlags,
  AgentLaunchContext,
  AgentModelDefinition,
  AgentSession,
  AgentSessionConfig,
  ListModelsOptions,
} from "../agent-sdk-types.js";
import { normalizeAgentModelDefinition } from "../agent-sdk-types.js";
import type { ProviderProfileModel, ProviderRuntimeSettings } from "../provider-launch-config.js";
import { GenericACPAgentClient } from "./generic-acp-agent.js";

/**
 * Upstream contract reference: docs/dsh-upstream-contract.md (module 0 gate).
 * DeepSeek Harness exposes its ACP server as `dsh-acp-demo --config <cordis.yml>`
 * (there is no `dsh acp` subcommand). The composition pins provider + model in
 * config, so ChisaCode materializes a managed cordis.yml per provider instance.
 */

const DSH_BINARY = "dsh-acp-demo";
const DSH_DEFAULT_BASE_URL = "https://api.deepseek.com";

/** Plugin packages only shipped vendored inside `@deepseek-ai/dsh`'s own node_modules. */
const DSH_VENDOR_PACKAGES = [
  "dsh-llm-deepseek",
  "dsh-sandbox-local",
  "dsh-sandbox-policy",
  "dsh-subprocess-local",
  "dsh-bash-sandbox",
  "dsh-user-approval",
  "dsh-fs-sandbox",
  "dsh-fs-observation-policy",
  "dsh-tool-fs",
  "dsh-token-meter",
  "dsh-compaction-basic",
  "dsh-repeat-tool-reminder",
] as const;

function dshThinkingOptions(): ProviderProfileModel["thinkingOptions"] {
  return [
    { id: "off", label: "Off" },
    { id: "low", label: "Low" },
    { id: "high", label: "High", isDefault: true },
    { id: "max", label: "Max" },
  ];
}

/** Default catalog used when the provider carries no configured model list. */
export const DSH_DEFAULT_MODELS: ProviderProfileModel[] = [
  {
    id: "deepseek-v4-flash",
    label: "DeepSeek V4 Flash",
    contextWindowMaxTokens: 1_000_000,
    thinkingOptions: dshThinkingOptions(),
  },
  {
    id: "deepseek-v4-pro",
    label: "DeepSeek V4 Pro",
    isDefault: true,
    contextWindowMaxTokens: 1_000_000,
    thinkingOptions: dshThinkingOptions(),
  },
];

interface DshAgentClientOptions {
  logger: Logger;
  runtimeSettings?: ProviderRuntimeSettings;
  providerId?: string;
  label?: string;
  models?: ProviderProfileModel[];
}

/**
 * Capability truth table for dsh's automation-only ACP transport
 * (docs/dsh-upstream-contract.md §3): committed blocks stream out, but there
 * are no tool-call frames, no reasoning deltas, no modes, no session load,
 * and non-empty mcpServers are rejected at session/new.
 */
const DSH_ACP_CAPABILITIES: AgentCapabilityFlags = {
  supportsStreaming: true,
  supportsSessionPersistence: false,
  supportsDynamicModes: false,
  supportsMcpServers: false,
  supportsReasoningStream: false,
  supportsToolInvocations: false,
  supportsRewindConversation: false,
  supportsRewindFiles: false,
  supportsRewindBoth: false,
};

/**
 * ACP client for DeepSeek Harness (`dsh`).
 *
 * Unlike kimi/grokbuild (which only need a managed home for gateway faces),
 * dsh's ACP transport *requires* a cordis.yml composition pinning provider +
 * model, so a managed composition is materialized for every provider instance
 * unless the user replaces the full command argv (replace-mode override).
 *
 * Vendored plugin packages live inside `@deepseek-ai/dsh`'s nested
 * node_modules and are referenced by absolute `file://` URLs so cordis resolves
 * them with their intended singleton dependency tree.
 */
export class DshAgentClient extends GenericACPAgentClient {
  constructor(options: DshAgentClientOptions) {
    const providerId = options.providerId ?? "dsh";
    const label = options.label ?? "DeepSeek Harness";
    const prepared = prepareDshLaunch({
      providerId,
      logger: options.logger,
      runtimeSettings: options.runtimeSettings,
      models: options.models,
    });
    super({
      logger: options.logger,
      command: prepared.command,
      env: prepared.env,
      providerId,
      label,
      capabilities: DSH_ACP_CAPABILITIES,
    });
  }

  /**
   * dsh rejects non-empty mcpServers at session/new, so daemon-managed MCP
   * wiring (companion server, per-scope servers) is stripped before launch.
   * Permission prompts are unaffected: they arrive via session/request_permission.
   */
  override async createSession(
    config: AgentSessionConfig,
    launchContext?: AgentLaunchContext,
  ): Promise<AgentSession> {
    const hasMcpServers = Object.keys(config.mcpServers ?? {}).length > 0;
    if (!hasMcpServers) {
      return super.createSession(config, launchContext);
    }
    this.logger.warn(
      { provider: "dsh", dropped: Object.keys(config.mcpServers ?? {}) },
      "dsh ACP transport accepts no mcpServers; dropping them for this session",
    );
    return super.createSession({ ...config, mcpServers: {} }, launchContext);
  }

  /**
   * dsh's ACP session/new advertises no model catalog, so without this
   * fallback the provider would show an empty picker. Surface the verified
   * default catalog instead; configured/gateway models still win.
   */
  override async listModels(options: ListModelsOptions): Promise<AgentModelDefinition[]> {
    const discovered = await super.listModels(options);
    return withDefaultDshModels(discovered);
  }
}

interface PreparedDshLaunch {
  command: [string, ...string[]];
  env: Record<string, string> | undefined;
}

function prepareDshLaunch(options: {
  providerId: string;
  logger: Logger;
  runtimeSettings: ProviderRuntimeSettings | undefined;
  models: ProviderProfileModel[] | undefined;
}): PreparedDshLaunch {
  const { runtimeSettings } = options;
  if (runtimeSettings?.command?.mode === "replace") {
    const [command, ...args] = runtimeSettings.command.argv;
    return { command: [command, ...args], env: runtimeSettings.env };
  }

  const models = options.models?.length ? options.models : DSH_DEFAULT_MODELS;
  const baseUrl = runtimeSettings?.env?.DEEPSEEK_BASE_URL?.trim() || DSH_DEFAULT_BASE_URL;
  const home = resolveManagedDshHome(options.providerId, baseUrl);

  const pluginBase = resolveDshVendorDir();
  if (pluginBase) {
    writeManagedDshComposition(home, { pluginBaseDir: pluginBase, models });
  } else {
    options.logger.warn(
      { provider: options.providerId },
      "dsh plugin packages not resolvable under the global npm root; " +
        "install with `npm i -g @deepseek-ai/dsh@next @deepseek-ai/dsh-acp-demo@next`",
    );
  }

  const configPath = join(home, "cordis.yml");
  const insertArgs =
    runtimeSettings?.command?.mode === "append" ? (runtimeSettings.command.args ?? []) : [];
  return {
    command: [DSH_BINARY, ...insertArgs, "--config", configPath],
    env: runtimeSettings?.env,
  };
}

function resolveManagedDshHome(providerId: string, baseUrl: string): string {
  const chisacodeHome = process.env.CHISACODE_HOME?.trim() || join(homedir(), ".chisacode");
  const safeProviderId = providerId.replace(/[^a-zA-Z0-9_-]+/gu, "-");
  const configHash = createHash("sha256").update(baseUrl).digest("hex").slice(0, 10);
  return join(chisacodeHome, "provider-runtime", "dsh", `${safeProviderId}-${configHash}`);
}

/**
 * Locates the directory holding dsh's vendored `@deepseek-ai/*` plugin packages
 * (`<npm-global-root>/@deepseek-ai/dsh/node_modules/@deepseek-ai`). Returns null
 * when the harness is not installed, so construction never throws before a
 * clearer boot-time diagnostic can surface.
 */
export function resolveDshVendorDir(): string | null {
  const override = process.env.CHISACODE_DSH_VENDOR_DIR?.trim();
  if (override) {
    return isCompleteVendorDir(override) ? override : null;
  }
  let npmRoot: string;
  try {
    npmRoot = execSync("npm root -g", {
      encoding: "utf8",
      timeout: 5_000,
      windowsHide: true,
    }).trim();
  } catch {
    return null;
  }
  const candidate = join(npmRoot, "@deepseek-ai", "dsh", "node_modules", "@deepseek-ai");
  return isCompleteVendorDir(candidate) ? candidate : null;
}

function isCompleteVendorDir(dir: string): boolean {
  return DSH_VENDOR_PACKAGES.every((pkg) => existsSync(join(dir, pkg)));
}

function writeManagedDshComposition(
  home: string,
  options: { pluginBaseDir: string; models: ProviderProfileModel[] },
): void {
  mkdirSync(join(home, "sessions"), { recursive: true, mode: 0o700 });
  writeFileSync(join(home, "cordis.yml"), buildManagedDshCordisYml(home, options), {
    encoding: "utf8",
    mode: 0o600,
  });
}

/**
 * Builds the managed cordis.yml composition for the dsh ACP transport.
 * @param home Managed provider-runtime home (also the session persistence root)
 * @param options Plugin base directory plus the provider's model catalog
 * @returns cordis.yml document contents
 */
export function buildManagedDshCordisYml(
  home: string,
  options: { pluginBaseDir: string; models: ProviderProfileModel[] },
): string {
  const pluginUrl = (pkg: string) =>
    `${pathToFileURL(join(options.pluginBaseDir, pkg, "lib", "index.js")).href}`;
  const models = mergeDshModels(options.models);
  const defaultModel = models.find((model) => model.isDefault) ?? models[0];
  const defaultThinking = defaultModel?.thinkingOptions?.find((option) => option.isDefault);
  const thinkingEnabled = defaultThinking?.id !== "off";
  const reasoningEffort = thinkingEnabled && defaultThinking ? defaultThinking.id : "high";

  const modelLines: string[] = [];
  for (const model of models) {
    modelLines.push(`      - id: ${yamlString(model.id)}`);
    if (model.supportsImages) {
      modelLines.push(`        inputModalities: [text, image]`);
    }
  }

  const lines = [
    "# Managed by ChisaCode (provider-runtime/dsh). Do not edit; regenerated per launch.",
    `# Contract reference: docs/dsh-upstream-contract.md`,
    `- id: llm-deepseek`,
    `  name: ${yamlString(pluginUrl("dsh-llm-deepseek"))}`,
    `  config:`,
    `    thinking: ${thinkingEnabled ? "enabled" : "disabled"}`,
  ];
  if (thinkingEnabled) {
    lines.push(`    reasoningEffort: ${yamlString(reasoningEffort)}`);
  }
  lines.push(
    `    models:`,
    ...modelLines,
    ``,
    `- id: sandbox`,
    `  name: ${yamlString(pluginUrl("dsh-sandbox-local"))}`,
    ``,
    `- id: sandbox-policy`,
    `  name: ${yamlString(pluginUrl("dsh-sandbox-policy"))}`,
    `  config:`,
    `    mode: !!js "process.env.DSH_PERMISSION_MODE ?? 'workspace-write'"`,
    `    workspaceRoot: !!js process.cwd()`,
    ``,
    `- id: subprocess`,
    `  name: ${yamlString(pluginUrl("dsh-subprocess-local"))}`,
    ``,
    `- id: bash`,
    `  name: ${yamlString(pluginUrl("dsh-bash-sandbox"))}`,
    `  config:`,
    `    timeoutMs: 60000`,
    ``,
    `- id: approval`,
    `  name: ${yamlString(pluginUrl("dsh-user-approval"))}`,
    `  config:`,
    `    policy: !!js "(process.env.DSH_PERMISSION_MODE ?? 'workspace-write') === 'danger-full-access' ? 'never' : 'ask'"`,
    ``,
    `- id: fs-sandbox`,
    `  name: ${yamlString(pluginUrl("dsh-fs-sandbox"))}`,
    `  config:`,
    `    cwd: !!js process.cwd()`,
    ``,
    `- id: fs-observation-policy`,
    `  name: ${yamlString(pluginUrl("dsh-fs-observation-policy"))}`,
    ``,
    `- id: tool-fs`,
    `  name: ${yamlString(pluginUrl("dsh-tool-fs"))}`,
    ``,
    `- id: token-meter`,
    `  name: ${yamlString(pluginUrl("dsh-token-meter"))}`,
    ``,
    `- id: compaction-basic`,
    `  name: ${yamlString(pluginUrl("dsh-compaction-basic"))}`,
    `  config:`,
    `    thresholdRatio: 0.8`,
    `    retainRatio: 0.08`,
    `    maxTokens: 8192`,
    `    compactionRetries: 1`,
    ``,
    `- id: repeat-tool-reminder`,
    `  name: ${yamlString(pluginUrl("dsh-repeat-tool-reminder"))}`,
    ``,
    `- id: acp-agent`,
    `  name: ${yamlString("@deepseek-ai/dsh-acp-demo")}`,
    `  config:`,
    `    provider: deepseek-official`,
    `    model: ${yamlString(defaultModel?.id ?? "")}`,
    // ChisaCode spawns several dsh-acp-demo processes per daemon (per-cwd
    // probes + sessions). The upstream composition owns a single-writer SQLite
    // query index under persistenceRoot: a shared path makes the second
    // concurrent boot fail with sqlite "database is locked" (observed on
    // packaged desktop probes, 2026-08-22). Isolate per process.
    `    persistenceRoot: !!js ${dshPersistenceRootExpression(home)}`,
    `    workspaceContext: false`,
    `    persona: |-`,
    `      You are a coding assistant powered by the {{model}} model. Your working directory is {{cwd}}.`,
    `      Your bash and file tools run under a sandbox; a [sandbox: file access denied] failure is policy, not a command bug.`,
    `      Verify your work by running the code or tests. Keep answers brief and factual.`,
    ``,
  );
  return lines.join("\n");
}

function mergeDshModels(models: ProviderProfileModel[]): ProviderProfileModel[] {
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

/**
 * Builds the cordis `!!js` expression for a per-process session root.
 * The upstream demo's SQLite query index is single-writer, so ChisaCode's
 * concurrent dsh processes (parallel probes + sessions) each get
 * `<home>/sessions/p<pid>`. YAML `!!js` plain scalars cannot carry a leading
 * quoted string plus trailing operators, so the expression leads with an
 * identifier and keeps the path inside a raw template literal.
 */
function dshPersistenceRootExpression(home: string): string {
  const base = join(home, "sessions");
  return `String.raw\`${base.replaceAll("`", "\\`")}\\p\${process.pid}\``;
}

/**
 * Falls back to the verified default DeepSeek catalog when a dsh session
 * reports no models (its ACP transport never advertises a model list).
 * @param discovered Models reported by the transport or configured
 * @returns Discovered models, or the default catalog when empty
 */
export function withDefaultDshModels(discovered: AgentModelDefinition[]): AgentModelDefinition[] {
  if (discovered.length > 0) {
    return discovered;
  }
  return DSH_DEFAULT_MODELS.map((model) =>
    normalizeAgentModelDefinition({ provider: "dsh", ...model }),
  );
}

function yamlString(value: string): string {
  // YAML double-quoted scalars accept JSON escapes verbatim.
  return JSON.stringify(value);
}
