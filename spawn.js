import { execFile, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, extname } from "node:path";
import { promisify } from "node:util";
import { createExternalCommandProcessEnv } from "../server/chisacode-env.js";
import {
  isWindowsCommandScript,
  quoteWindowsArgument,
  quoteWindowsCommand,
} from "./windows-command.js";
const execFileAsync = promisify(execFile);
function hasPathSeparator(value) {
  return value.includes("/") || value.includes("\\");
}
function shouldUseWindowsShell(command, requestedShell) {
  if (isWindowsCommandScript(command)) {
    return true;
  }
  if (requestedShell !== undefined) {
    return requestedShell;
  }
  return process.platform === "win32" && !hasPathSeparator(command) && !extname(command);
}
function parseWindowsCommandTokens(value) {
  const tokens = [];
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
function resolveWindowsCommandShim(command, args) {
  if (!isWindowsCommandScript(command) || !existsSync(command)) {
    return null;
  }
  let contents;
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
export function spawnProcess(command, args, options) {
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
      ? { ...resolvedBaseEnv, ...envOverlay }
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
export async function execCommand(command, args, options) {
  const { baseEnv, env, envOverlay } = options ?? {};
  const resolvedBaseEnv = env ?? baseEnv ?? process.env;
  const isWindows = process.platform === "win32";
  const shell = shouldUseWindowsShell(command, options?.shell);
  const shouldQuoteForShell = isWindows && shell !== false;
  const resolvedCommand = shouldQuoteForShell ? quoteWindowsCommand(command) : command;
  const resolvedArgs = shouldQuoteForShell ? args.map(quoteWindowsArgument) : args;
  const childEnv =
    options?.envMode === "internal"
      ? { ...resolvedBaseEnv, ...envOverlay }
      : createExternalCommandProcessEnv(
          command,
          resolvedBaseEnv,
          ...(envOverlay ? [envOverlay] : []),
        );
  return execFileAsync(resolvedCommand, resolvedArgs, {
    cwd: options?.cwd,
    env: childEnv,
    encoding: options?.encoding ?? "utf8",
    killSignal: options?.killSignal,
    timeout: options?.timeout,
    maxBuffer: options?.maxBuffer,
    shell,
    windowsHide: true,
  });
}
export function platformShell() {
  if (process.platform === "win32") {
    return { command: "cmd.exe", flag: ["/c"] };
  }
  return { command: "/bin/sh", flag: ["-lc"] };
}
export function platformBash() {
  if (process.platform === "win32") {
    return { command: "cmd.exe", flag: ["/c"] };
  }
  return { command: "/bin/bash", flag: ["-lc"] };
}
//# sourceMappingURL=spawn.js.map
