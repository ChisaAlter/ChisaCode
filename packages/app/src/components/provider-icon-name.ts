export type BuiltinProviderIconName = "claude" | "codex" | "kimi" | "opencode" | "pi";

export type ProviderIconName = { kind: "builtin"; id: BuiltinProviderIconName } | { kind: "bot" };

const BUILTIN_PROVIDER_IDS: ReadonlySet<BuiltinProviderIconName> = new Set([
  "claude",
  "codex",
  "kimi",
  "opencode",
  "pi",
]);

export function resolveProviderIconName(provider: string): ProviderIconName {
  if (BUILTIN_PROVIDER_IDS.has(provider as BuiltinProviderIconName)) {
    return { kind: "builtin", id: provider as BuiltinProviderIconName };
  }
  return { kind: "bot" };
}
