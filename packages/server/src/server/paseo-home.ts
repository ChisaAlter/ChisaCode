import os from "node:os";
import path from "node:path";
import { existsSync } from "node:fs";
import { ensurePrivateDirectory } from "./private-files.js";

export const FLEURDELYS_HOME_ENV = "FLEURDELYS_HOME";
export const LEGACY_PASEO_HOME_ENV = "PASEO_HOME";
export const DEFAULT_FLEURDELYS_HOME = "~/.fleurdelys";
export const LEGACY_PASEO_HOME = "~/.paseo";

function expandHomeDir(input: string): string {
  if (input.startsWith("~/")) {
    return path.join(os.homedir(), input.slice(2));
  }
  if (input === "~") {
    return os.homedir();
  }
  return input;
}

function resolveHomeCandidate(input: string): string {
  return path.resolve(expandHomeDir(input));
}

function resolveDefaultHome(): string {
  const fleurdelysHome = resolveHomeCandidate(DEFAULT_FLEURDELYS_HOME);
  const legacyHome = resolveHomeCandidate(LEGACY_PASEO_HOME);
  if (!existsSync(fleurdelysHome) && existsSync(legacyHome)) {
    return legacyHome;
  }
  return fleurdelysHome;
}

export function resolvePaseoHome(env: NodeJS.ProcessEnv = process.env): string {
  // COMPAT(paseo-name-migration): FLEURDELYS_HOME is canonical, PASEO_HOME remains readable.
  const raw = env.FLEURDELYS_HOME ?? env.PASEO_HOME;
  const resolved = raw ? resolveHomeCandidate(raw) : resolveDefaultHome();
  ensurePrivateDirectory(resolved);
  return resolved;
}
