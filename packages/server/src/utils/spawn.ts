import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, extname } from "node:path";

import { createExternalCommandProcessEnv, type ProcessEnvRecord } from "../server/chisacode-env.js";
import { terminateWithTreeKill } from "./tree-kill.js";
import {
  isWindowsCommandScript,
  quoteWindowsArgument,
  quoteWindowsCommand,
} from "./windows-command.js";

const COMMAND_GRACEFUL_TERMINATION_MS = 250;
const COMMAND_FORCE_TERMINATION_MS = 2_000;
const DEFAULT_EXEC_MAX_BUFFER = 1024 * 1024;

interface ExternalEnvOptions {
  baseEnv?: ProcessEnvRecord;
  envMode?: "external" | "internal";
  env?: ProcessEnvRecord;
  envOverlay?: ProcessEnvRecord;
}

export type SpawnProcessOptions = Omit<SpawnOptions, "env"> & ExternalEnvOptions;

interface ExecCommandOptions extends ExternalEnvOptions {
  cwd?: string;
  encoding?: BufferEncoding;
  killSignal?: NodeJS.Signals;
  signal?: AbortSignal;
  timeout?: number;
  maxBuffer?: number;
  shell?: boolean | string;
}

interface ExecCommandResult {
  stdout: string;
  stderr: string;
}

interface ExecCommandError extends Error {
  code?: number | string | null;
  cmd?: string;
  killed?: boolean;
  signal?: NodeJS.Signals | null;
  stdout?: string;
  stderr?: string;
}

type ExecCommandTerminationReason = "abort" | "maxBuffer" | "timeout";

interface ExecCommandTimeoutErrorOptions extends ErrorOptions {
  cmd?: string;
  signal?: NodeJS.Signals;
}

class BoundedOutputBuffer {
  private readonly chunks: Buffer[] = [];
  private byteLength = 0;

  constructor(private readonly maxBytes: number) {}

  append(value: Buffer | string): boolean {
    const chunk = typeof value === "string" ? Buffer.from(value) : value;
    const remaining = Math.max(0, this.maxBytes - this.byteLength);
    if (remaining > 0) {
      const boundedChunk = chunk.byteLength > remaining ? chunk.subarray(0, remaining) : chunk;
      this.chunks.push(boundedChunk);
      this.byteLength += boundedChunk.byteLength;
    }
    return chunk.byteLength > remaining;
  }

  toString(encoding: BufferEncoding): string {
    return Buffer.concat(this.chunks, this.byteLength).toString(encoding);
  }
}

/** Identifies a command that exceeded the configured execution timeout. */
export class ExecCommandTimeoutError extends Error {
  readonly code = "EXEC_COMMAND_TIMEOUT";
  readonly cmd: string;
  readonly killed = true;
  readonly signal: NodeJS.Signals;

  /**
   * Creates a timeout error with captured command output.
   * @param timeoutMs Configured timeout in milliseconds
   * @param stdout Captured standard output
   * @param stderr Captured standard error
   * @param options Optional error cause and child-process compatibility metadata
   */
  constructor(
    readonly timeoutMs: number,
    readonly stdout: string,
    readonly stderr: string,
    options?: ExecCommandTimeoutErrorOptions,
  ) {
    super(`Command timed out after ${timeoutMs}ms`, options);
    this.name = "ExecCommandTimeoutError";
    this.cmd = options?.cmd ?? "";
    this.signal = options?.signal ?? "SIGTERM";
  }
}

function hasPathSeparator(value: string): boolean {
  return value.includes("/") || value.includes("\\");
}

function shouldUseWindowsShell(
  command: string,
  requestedShell?: boolean | string,
): boolean | string {
  if (isWindowsCommandScript(command)) {
    return true;
  }
  if (requestedShell !== undefined) {
    return requestedShell;
  }
  return process.platform === "win32" && !hasPathSeparator(command) && !extname(command);
}

function parseWindowsCommandTokens(value: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && /\s/u.test(char)) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }

  if (current.length > 0) {
    tokens.push(current);
  }
  return tokens;
}

function resolveWindowsCommandShim(
  command: string,
  args: string[],
): { command: string; args: string[] } | null {
  if (!isWindowsCommandScript(command) || !existsSync(command)) {
    return null;
  }

  let contents: string;
  try {
    contents = readFileSync(command, "utf8");
  } catch {
    return null;
  }

  const scriptDir = `${dirname(command)}\\`;
  const lines = contents.split(/\r?\n/u);
  for (let lineIndex = lines.length - 1; lineIndex >= 0; lineIndex -= 1) {
    const rawLine = lines[lineIndex] ?? "";
    const line = rawLine.trim();
    const splatIndex = line.toLowerCase().lastIndexOf("%*");
    if (splatIndex === -1) {
      continue;
    }

    const prefix = line
      .slice(0, splatIndex)
      .replace(/%~?dp0%/giu, scriptDir)
      .trim();
    let tokens = parseWindowsCommandTokens(prefix);
    if (tokens[0]?.toLowerCase() === "call") {
      tokens = tokens.slice(1);
    }
    const [resolvedCommand, ...fixedArgs] = tokens;
    if (resolvedCommand && existsSync(resolvedCommand)) {
      return {
        command: resolvedCommand,
        args: [...fixedArgs, ...args],
      };
    }
  }

  return null;
}

export function spawnProcess(
  command: string,
  args: string[],
  options?: SpawnProcessOptions,
): ChildProcess {
  const { baseEnv, env, envOverlay, ...spawnOptions } = options ?? {};
  const shimLaunch = process.platform === "win32" ? resolveWindowsCommandShim(command, args) : null;
  const launchCommand = shimLaunch?.command ?? command;
  const launchArgs = shimLaunch?.args ?? args;
  const resolvedBaseEnv = env ?? baseEnv ?? process.env;
  const isWindows = process.platform === "win32";
  const shell = shimLaunch ? false : shouldUseWindowsShell(launchCommand, spawnOptions.shell);

  const shouldQuoteForShell = isWindows && shell !== false;
  const resolvedCommand = shouldQuoteForShell ? quoteWindowsCommand(launchCommand) : launchCommand;
  const resolvedArgs = shouldQuoteForShell ? launchArgs.map(quoteWindowsArgument) : launchArgs;
  const childEnv =
    options?.envMode === "internal"
      ? ({ ...resolvedBaseEnv, ...envOverlay } as NodeJS.ProcessEnv)
      : createExternalCommandProcessEnv(
          launchCommand,
          resolvedBaseEnv,
          ...(envOverlay ? [envOverlay] : []),
        );

  return spawn(resolvedCommand, resolvedArgs, {
    ...spawnOptions,
    env: childEnv,
    shell,
    windowsHide: true,
  });
}

export async function execCommand(
  command: string,
  args: string[],
  options?: ExecCommandOptions,
): Promise<ExecCommandResult> {
  const { baseEnv, env, envOverlay } = options ?? {};
  const resolvedBaseEnv = env ?? baseEnv ?? process.env;
  const isWindows = process.platform === "win32";
  const shell = shouldUseWindowsShell(command, options?.shell);
  const shouldQuoteForShell = isWindows && shell !== false;
  const resolvedCommand = shouldQuoteForShell ? quoteWindowsCommand(command) : command;
  const resolvedArgs = shouldQuoteForShell ? args.map(quoteWindowsArgument) : args;
  const childEnv =
    options?.envMode === "internal"
      ? ({ ...resolvedBaseEnv, ...envOverlay } as NodeJS.ProcessEnv)
      : createExternalCommandProcessEnv(
          command,
          resolvedBaseEnv,
          ...(envOverlay ? [envOverlay] : []),
        );

  if (options?.signal?.aborted) {
    throw createExecCommandAbortError(options.signal.reason, "", "");
  }

  return new Promise<ExecCommandResult>((resolve, reject) => {
    const encoding = options?.encoding ?? "utf8";
    const maxBuffer = options?.maxBuffer ?? DEFAULT_EXEC_MAX_BUFFER;
    const stdoutBuffer = new BoundedOutputBuffer(maxBuffer);
    const stderrBuffer = new BoundedOutputBuffer(maxBuffer);
    const commandText = [resolvedCommand, ...resolvedArgs].join(" ");
    let terminationReason: ExecCommandTerminationReason | null = null;
    let terminationPromise: Promise<void> | null = null;
    let timeoutHandle: NodeJS.Timeout | null = null;
    let spawnError: Error | null = null;
    let maxBufferStream: "stderr" | "stdout" | null = null;
    const child = spawn(resolvedCommand, resolvedArgs, {
      cwd: options?.cwd,
      env: childEnv,
      shell,
      windowsHide: true,
    });
    const requestTermination = (reason: ExecCommandTerminationReason) => {
      if (terminationReason) {
        return;
      }
      terminationReason = reason;
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
      terminationPromise = terminateWithTreeKill(child, {
        gracefulSignal: options?.killSignal,
        gracefulTimeoutMs: COMMAND_GRACEFUL_TERMINATION_MS,
        forceTimeoutMs: COMMAND_FORCE_TERMINATION_MS,
      }).then(() => undefined);
    };
    const appendOutput = (
      target: BoundedOutputBuffer,
      stream: "stderr" | "stdout",
      chunk: Buffer | string,
    ) => {
      if (terminationReason) {
        return;
      }
      if (target.append(chunk)) {
        maxBufferStream = stream;
        requestTermination("maxBuffer");
      }
    };
    const onAbort = () => requestTermination("abort");
    child.stdout?.on("data", (chunk: Buffer | string) => {
      appendOutput(stdoutBuffer, "stdout", chunk);
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      appendOutput(stderrBuffer, "stderr", chunk);
    });
    child.on("error", (error) => {
      spawnError = error;
    });
    child.on("close", (exitCode, signalCode) => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
      options?.signal?.removeEventListener("abort", onAbort);
      void settleExecCommand({
        abortReason: options?.signal?.reason,
        commandText,
        exitCode,
        killSignal: options?.killSignal,
        maxBufferStream,
        reject,
        resolve,
        signalCode,
        spawnError,
        stderr: stderrBuffer.toString(encoding),
        stdout: stdoutBuffer.toString(encoding),
        terminationPromise,
        terminationReason,
        timeoutMs: options?.timeout,
      });
    });
    options?.signal?.addEventListener("abort", onAbort, { once: true });
    if (options?.signal?.aborted) {
      onAbort();
    }
    if (!terminationReason && options?.timeout !== undefined && options.timeout > 0) {
      timeoutHandle = setTimeout(() => requestTermination("timeout"), options.timeout);
    }
  });
}

async function settleExecCommand(options: {
  abortReason: unknown;
  commandText: string;
  exitCode: number | null;
  killSignal: NodeJS.Signals | undefined;
  maxBufferStream: "stderr" | "stdout" | null;
  reject: (reason?: unknown) => void;
  resolve: (result: ExecCommandResult) => void;
  signalCode: NodeJS.Signals | null;
  spawnError: Error | null;
  stderr: string;
  stdout: string;
  terminationPromise: Promise<void> | null;
  terminationReason: ExecCommandTerminationReason | null;
  timeoutMs: number | undefined;
}): Promise<void> {
  if (options.terminationReason) {
    await options.terminationPromise;
    if (options.terminationReason === "abort") {
      options.reject(
        createExecCommandAbortError(options.abortReason, options.stdout, options.stderr),
      );
      return;
    }
    if (options.terminationReason === "maxBuffer") {
      options.reject(
        createMaxBufferError(options.maxBufferStream ?? "stdout", options.stdout, options.stderr),
      );
      return;
    }
    options.reject(
      new ExecCommandTimeoutError(options.timeoutMs ?? 0, options.stdout, options.stderr, {
        cause: options.spawnError ?? undefined,
        cmd: options.commandText,
        signal: options.killSignal ?? "SIGTERM",
      }),
    );
    return;
  }
  if (options.spawnError) {
    const commandError = options.spawnError as ExecCommandError;
    commandError.cmd = options.commandText;
    commandError.stdout = options.stdout;
    commandError.stderr = options.stderr;
    options.reject(commandError);
    return;
  }
  if (options.exitCode === 0) {
    options.resolve({ stdout: options.stdout, stderr: options.stderr });
    return;
  }
  options.reject(
    createExecCommandExitError({
      commandText: options.commandText,
      exitCode: options.exitCode,
      signalCode: options.signalCode,
      stderr: options.stderr,
      stdout: options.stdout,
    }),
  );
}

function createMaxBufferError(
  stream: "stderr" | "stdout",
  stdout: string,
  stderr: string,
): ExecCommandError {
  const error = new RangeError(`${stream} maxBuffer length exceeded`) as ExecCommandError;
  error.code = "ERR_CHILD_PROCESS_STDIO_MAXBUFFER";
  error.stdout = stdout;
  error.stderr = stderr;
  return error;
}

function createExecCommandExitError(options: {
  commandText: string;
  exitCode: number | null;
  signalCode: NodeJS.Signals | null;
  stderr: string;
  stdout: string;
}): ExecCommandError {
  const error = new Error(
    `Command failed: ${options.commandText}\n${options.stderr}`,
  ) as ExecCommandError;
  error.code = options.exitCode;
  error.cmd = options.commandText;
  error.killed = options.signalCode !== null;
  error.signal = options.signalCode;
  error.stdout = options.stdout;
  error.stderr = options.stderr;
  return error;
}

function createExecCommandAbortError(
  reason: unknown,
  stdout: string,
  stderr: string,
): ExecCommandError {
  const error = new Error("The operation was aborted", { cause: reason }) as ExecCommandError;
  error.name = "AbortError";
  error.code = "ABORT_ERR";
  error.stdout = stdout;
  error.stderr = stderr;
  return error;
}

export function platformShell(): { command: string; flag: string[] } {
  if (process.platform === "win32") {
    return { command: "cmd.exe", flag: ["/c"] };
  }

  return { command: "/bin/sh", flag: ["-lc"] };
}

export function platformBash(): { command: string; flag: string[] } {
  if (process.platform === "win32") {
    return { command: "cmd.exe", flag: ["/c"] };
  }

  return { command: "/bin/bash", flag: ["-lc"] };
}
