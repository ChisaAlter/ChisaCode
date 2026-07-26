import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Env var Pi reads for its agent config directory (`~/.pi/agent` by default). */
export const PI_CODING_AGENT_DIR_ENV = "PI_CODING_AGENT_DIR";

/**
 * When ChisaCode launches Pi against a model gateway it sets OPENAI_API_KEY /
 * OPENAI_BASE_URL. Pi honors the key from env but still resolves openai baseUrl
 * from ~/.pi/agent/models.json (or built-in defaults). Isolate the agent dir so
 * the gateway base URL and env-backed key win over the user's personal Pi config.
 * @param env Launch env overlay for the Pi process
 * @returns Env with PI_CODING_AGENT_DIR set when gateway isolation is needed
 */
export function preparePiGatewayEnv(
  env: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!env) {
    return env;
  }
  const apiKey = env.OPENAI_API_KEY?.trim();
  const baseUrl = env.OPENAI_BASE_URL?.trim();
  if (!apiKey || !baseUrl || env[PI_CODING_AGENT_DIR_ENV]?.trim()) {
    return env;
  }

  const agentDir = resolveManagedPiAgentDir(baseUrl);
  writeManagedPiModelsJson(agentDir, baseUrl);
  return {
    ...env,
    [PI_CODING_AGENT_DIR_ENV]: agentDir,
  };
}

function resolveManagedPiAgentDir(baseUrl: string): string {
  const chisacodeHome = process.env.CHISACODE_HOME?.trim() || join(homedir(), ".chisacode");
  const configHash = createHash("sha256").update(baseUrl).digest("hex").slice(0, 10);
  return join(chisacodeHome, "provider-runtime", "pi", configHash);
}

function writeManagedPiModelsJson(agentDir: string, baseUrl: string): void {
  mkdirSync(agentDir, { recursive: true, mode: 0o700 });
  const modelsPath = join(agentDir, "models.json");
  const payload = {
    providers: {
      openai: {
        baseUrl,
        api: "openai-completions",
        // Resolved from the process env ChisaCode injects for gateway faces.
        apiKey: "$OPENAI_API_KEY",
      },
    },
  };
  writeFileSync(modelsPath, `${JSON.stringify(payload, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}
