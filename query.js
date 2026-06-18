import { query } from "@anthropic-ai/claude-agent-sdk";
import { createProviderEnv, createProviderEnvSpec } from "../../provider-launch-config.js";
import { buildSelfNodeCommand } from "../../../chisacode-env.js";
import { spawnProcess } from "../../../../utils/spawn.js";
function isChildProcessWithStreams(child) {
  return child.stdin !== null && child.stdout !== null && child.stderr !== null;
}
function resolveClaudeSpawnCommand(spawnOptions, runtimeSettings) {
  const commandConfig = runtimeSettings?.command;
  if (!commandConfig || commandConfig.mode === "default") {
    return {
      command: spawnOptions.command,
      args: [...spawnOptions.args],
    };
  }
  if (commandConfig.mode === "append") {
    return {
      command: spawnOptions.command,
      args: [...spawnOptions.args, ...(commandConfig.args ?? [])],
    };
  }
  return {
    command: commandConfig.argv[0],
    args: [...commandConfig.argv.slice(1), ...spawnOptions.args],
  };
}
function applyRuntimeSettingsToClaudeOptions(options, runtimeSettings, launchEnv) {
  return {
    ...options,
    spawnClaudeCodeProcess: (spawnOptions) => {
      const resolved = resolveClaudeSpawnCommand(spawnOptions, runtimeSettings);
      // When the SDK passes a default JS runtime ("node"/"bun"), replace it with
      // process.execPath — the actual node binary running the daemon. This avoids
      // PATH lookup failures in the managed runtime bundle.
      // When the SDK passes a native binary path (from pathToClaudeCodeExecutable)
      // or the user overrides the command via runtime settings, use that directly.
      const isDefaultRuntime = resolved.command === "node" || resolved.command === "bun";
      const providerEnvSpec = createProviderEnvSpec({
        baseEnv: spawnOptions.env,
        runtimeSettings,
        overlays: [launchEnv],
      });
      const providerEnv = createProviderEnv({
        baseEnv: spawnOptions.env,
        runtimeSettings,
        overlays: [launchEnv],
      });
      const selfNodeCommand = isDefaultRuntime
        ? buildSelfNodeCommand(resolved.args, providerEnv)
        : null;
      const command = selfNodeCommand?.command ?? resolved.command;
      const args = selfNodeCommand?.args ?? resolved.args;
      const child = spawnProcess(command, args, {
        cwd: spawnOptions.cwd,
        ...(selfNodeCommand ? { env: selfNodeCommand.env, envMode: "internal" } : providerEnvSpec),
        signal: spawnOptions.signal,
        stdio: ["pipe", "pipe", "pipe"],
        // Bypass cmd.exe on Windows: the SDK passes --mcp-config with inline JSON
        // containing double quotes, which cmd.exe mangles (strips quotes, breaks parsing).
        // The command is always a resolved binary path, so shell routing is unnecessary.
        shell: false,
      });
      if (typeof options.stderr === "function") {
        child.stderr?.on("data", (chunk) => {
          options.stderr?.(chunk.toString());
        });
      }
      if (!isChildProcessWithStreams(child)) {
        throw new Error("Claude process was spawned without stdio streams");
      }
      return child;
    },
  };
}
export function claudeQuery(input, context = {}) {
  const launchQuery = context.queryFactory ?? query;
  return launchQuery({
    ...input,
    options: applyRuntimeSettingsToClaudeOptions(
      input.options,
      context.runtimeSettings,
      context.launchEnv,
    ),
  });
}
//# sourceMappingURL=query.js.map
