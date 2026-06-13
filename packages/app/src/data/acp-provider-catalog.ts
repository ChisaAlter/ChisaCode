export interface AcpProviderCatalogEntry {
  id: string;
  title: string;
  description: string;
  version: string;
  installLink: string;
  command: readonly [string, ...string[]];
  env?: Readonly<Record<string, string>>;
}

export const ACP_PROVIDER_CATALOG: AcpProviderCatalogEntry[] = [
  {
    id: "claude",
    title: "Claude Code",
    description: "Anthropic's multi-tool assistant with MCP support, streaming, and deep reasoning",
    version: "latest",
    installLink: "https://docs.anthropic.com/en/docs/claude-code/setup",
    command: ["claude"],
  },
  {
    id: "codex",
    title: "Codex",
    description: "OpenAI's Codex workspace agent with sandbox controls and optional network access",
    version: "latest",
    installLink: "https://developers.openai.com/codex",
    command: ["codex"],
  },
  {
    id: "opencode",
    title: "OpenCode",
    description: "Open-source coding assistant with multi-provider model support",
    version: "latest",
    installLink: "https://opencode.ai/docs/",
    command: ["opencode"],
  },
  {
    id: "mimocode",
    title: "MiMoCode",
    description: "Xiaomi's OpenCode-compatible coding agent",
    version: "latest",
    installLink: "https://github.com/XiaomiMiMo/MiMo-Code",
    command: ["mimo"],
  },
  {
    id: "pi",
    title: "Pi",
    description: "Minimal terminal-based coding agent with multi-provider LLM support",
    version: "latest",
    installLink: "https://www.npmjs.com/package/@earendil-works/pi-coding-agent",
    command: ["pi"],
  },
  {
    id: "kimi",
    title: "Kimi Code",
    description: "Moonshot AI's open-source terminal coding agent via ACP",
    version: "latest",
    installLink: "https://github.com/MoonshotAI/kimi-code",
    command: ["kimi", "acp"],
  },
];
