/**
 * SSH Transport — run ACP agents on remote machines via SSH stdio.
 *
 * Creates a spawn-compatible function that runs a command on a remote host
 * over SSH, piping NDJSON (ACP protocol) through stdin/stdout. This plugs
 * directly into the ACP process runtime's `spawn` option — a remote agent
 * is just an ACP provider whose transport is SSH instead of a local process.
 *
 * Design adapted from Cindy's maker-remote-ssh + maker-cc-manager (Apache-2.0).
 */
import { type ChildProcess, spawn } from "node:child_process";

// ── Types ──────────────────────────────────────────────────────────────────

export interface SSHConnectionConfig {
  /** Remote hostname or IP. */
  host: string;
  /** SSH username. Defaults to current user if omitted. */
  user?: string;
  /** SSH port. Defaults to 22. */
  port?: number;
  /** Path to private key file. If omitted, uses ssh-agent or default keys. */
  identityFile?: string;
  /** Additional SSH options (-o key=value). */
  sshOptions?: string[];
}

export interface SSHSpawnOptions {
  /** Remote command to execute (e.g. "chisacode-agent" or "claude --acp"). */
  remoteCommand: string;
  /** Arguments for the remote command. */
  remoteArgs?: string[];
  /** Remote working directory. */
  remoteCwd?: string;
  /** Environment variables to set on the remote side. */
  remoteEnv?: Record<string, string>;
}

// ── SSH command building ───────────────────────────────────────────────────

/**
 * Build the SSH command arguments for spawning a remote process.
 * Exported for testing — the actual spawn is done by {@link createSSHSpawner}.
 */
export function buildSSHArgs(config: SSHConnectionConfig, options: SSHSpawnOptions): string[] {
  const args: string[] = [];

  // Port
  if (config.port && config.port !== 22) {
    args.push("-p", String(config.port));
  }

  // Identity file
  if (config.identityFile) {
    args.push("-i", config.identityFile);
  }

  // Additional SSH options
  if (config.sshOptions) {
    for (const opt of config.sshOptions) {
      args.push("-o", opt);
    }
  }

  // Disable pseudo-terminal (we need raw stdio for NDJSON)
  args.push("-T");

  // Batch mode (no interactive prompts)
  args.push("-o", "BatchMode=yes");

  // Connection timeout
  args.push("-o", "ConnectTimeout=30");

  // Keepalive for long-running NDJSON streams (prevent silent disconnect)
  args.push("-o", "ServerAliveInterval=60");
  args.push("-o", "ServerAliveCountMax=3");

  // Target
  const target = config.user ? `${config.user}@${config.host}` : config.host;
  args.push(target);

  // Remote command with optional cwd and env
  const commandParts: string[] = [];
  if (options.remoteCwd) {
    commandParts.push(`cd ${shellQuote(options.remoteCwd)}`);
  }
  if (options.remoteEnv) {
    for (const [key, value] of Object.entries(options.remoteEnv)) {
      // Validate key is a safe shell variable name (prevent command injection)
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
        throw new Error(`Invalid environment variable name: "${key}"`);
      }
      commandParts.push(`export ${key}=${shellQuote(value)}`);
    }
  }
  const fullCommand = [options.remoteCommand, ...(options.remoteArgs ?? [])]
    .map(shellQuote)
    .join(" ");
  commandParts.push(fullCommand);

  args.push(commandParts.join(" && "));

  return args;
}

/**
 * Create a spawn-compatible function for the ACP process runtime.
 *
 * Usage with ACP runtime:
 * ```ts
 * const sshSpawn = createSSHSpawner(sshConfig);
 * const result = await spawnInitializedACPProcess({
 *   launch: { command: "claude", args: ["--acp"] },
 *   spawn: sshSpawn,
 *   // ...
 * });
 * ```
 */
export function createSSHSpawner(
  config: SSHConnectionConfig,
): (
  command: string,
  args: string[],
  opts: { cwd?: string; env?: Record<string, string> },
) => ChildProcess {
  return (
    command: string,
    args: string[],
    opts?: { cwd?: string; env?: Record<string, string> },
  ) => {
    const sshArgs = buildSSHArgs(config, {
      remoteCommand: command,
      remoteArgs: args,
      remoteCwd: opts?.cwd,
      remoteEnv: opts?.env,
    });

    return spawn("ssh", sshArgs, {
      stdio: ["pipe", "pipe", "pipe"],
      // Don't inherit local env — remote env is set via the command
      env: { ...process.env },
    });
  };
}

// ── Connection validation ──────────────────────────────────────────────────

/**
 * Test SSH connectivity by running a simple echo command.
 * Returns true if the connection succeeds within the timeout.
 */
export async function testSSHConnection(
  config: SSHConnectionConfig,
  timeoutMs = 10000,
): Promise<{ ok: boolean; error?: string }> {
  const args = buildSSHArgs(config, { remoteCommand: "echo", remoteArgs: ["ok"] });

  try {
    const result = await new Promise<{ code: number | null; stdout: string; stderr: string }>(
      (resolve) => {
        const child = spawn("ssh", args, { stdio: ["pipe", "pipe", "pipe"] });
        let stdout = "";
        let stderr = "";

        child.stdout?.on("data", (d: Buffer) => {
          stdout += d.toString();
        });
        child.stderr?.on("data", (d: Buffer) => {
          stderr += d.toString();
        });

        const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
        // 'close' always fires (even after spawn errors), so it is the
        // single resolve point — no separate 'error' handler needed.
        child.on("close", (code) => {
          clearTimeout(timer);
          // eslint-disable-next-line eslint-plugin-promise/no-multiple-resolved -- single resolve point; timeout triggers close which lands here
          resolve({ code, stdout, stderr });
        });
      },
    );

    if (result.code === 0 && result.stdout.includes("ok")) {
      return { ok: true };
    }
    return { ok: false, error: result.stderr.trim() || `exit code ${result.code}` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// ── Internals ──────────────────────────────────────────────────────────────

function shellQuote(value: string): string {
  if (/^[a-zA-Z0-9._/-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, "'\\''")}'`;
}
