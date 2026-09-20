export interface AcpProviderCatalogEntry {
  id: string;
  title: string;
  description: string;
  version: string;
  installLink: string;
  /**
   * Launcher argv written into the daemon config as a replace-mode command
   * override. Omit it for providers whose built-in client manages its own
   * launch composition (e.g. dsh materializes a managed cordis.yml and appends
   * `--config <path>` itself) — a replace-mode override would bypass that.
   */
  command?: readonly [string, ...string[]];
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
  {
    id: "grokbuild",
    title: "Grok Build",
    description: "xAI's terminal coding agent via ACP",
    version: "latest",
    installLink: "https://x.ai/cli",
    command: ["grok", "agent", "stdio"],
  },
  {
    id: "dsh",
    title: "DeepSeek Harness",
    description: "DeepSeek's official coding-agent harness via ACP (automation transport)",
    version: "next",
    installLink: "https://github.com/deepseek-ai/deepseek-harness",
    // No command on purpose: the built-in dsh client spawns
    // `dsh-acp-demo --config <managed cordis.yml>` itself
    // (docs/dsh-upstream-contract.md §2). Writing `["dsh-acp-demo"]` here
    // would become a replace-mode override that drops the managed --config
    // and boots against an unrelated ./cordis.yml.
  },
];
