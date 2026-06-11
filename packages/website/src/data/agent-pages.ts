// Source of truth for per-agent marketing landing pages.
// To add a new agent, append an entry here and create a 4-line route file at
// `src/routes/<slug>.tsx`. The sitemap (vite.config) reads `AGENT_PAGE_SLUGS`.

export interface AgentPage {
  slug: string;
  name: string;
  title: string;
  subtitle: string;
  metaTitle: string;
  metaDescription: string;
}

export const AGENT_PAGES = [
  {
    slug: "claude-code",
    name: "Claude Code",
    title: "Open source app for Claude Code",
    subtitle:
      "Run Claude Code on your machine, drive it from your phone or desktop. Launch agents, watch them work, review and merge from anywhere.",
    metaTitle: "Claude Code Mobile and Desktop App, Open Source",
    metaDescription:
      "Open source mobile and desktop app for Claude Code. Run agents on your machine, monitor progress, review diffs, and merge from anywhere. Self-hosted, your code stays local.",
  },
  {
    slug: "codex",
    name: "Codex",
    title: "Open source app for Codex",
    subtitle:
      "Run OpenAI's Codex on your machine, drive it from your phone or desktop. Same setup, same machine, no laptop required.",
    metaTitle: "Codex Mobile and Desktop App, Open Source",
    metaDescription:
      "Open source mobile and desktop app for OpenAI Codex. Launch agents on your machine, monitor progress, and ship code from anywhere. Self-hosted.",
  },
  {
    slug: "opencode",
    name: "OpenCode",
    title: "Open source app for OpenCode",
    subtitle:
      "Run OpenCode on your machine, drive it from your phone or desktop. Open source on both ends, your code stays local.",
    metaTitle: "OpenCode Mobile and Desktop App, Open Source",
    metaDescription:
      "Open source mobile and desktop app for OpenCode. Launch agents on your machine, watch them work, ship code from anywhere. Self-hosted.",
  },
  {
    slug: "pi",
    name: "Pi Agent",
    title: "Open source app for the Pi coding agent",
    subtitle:
      "Run the Pi coding agent on your machine, drive it from your phone or desktop. Self-hosted and open source.",
    metaTitle: "Pi Agent Mobile and Desktop App, Open Source",
    metaDescription:
      "Open source mobile and desktop app for the Pi coding agent. Launch sessions on your machine, monitor progress, merge from anywhere. Self-hosted.",
  },
  {
    slug: "kimi",
    name: "Kimi Code CLI",
    title: "Open source app for Kimi Code CLI",
    subtitle:
      "Run Moonshot AI's Kimi Code CLI on your machine, drive it from your phone or desktop.",
    metaTitle: "Kimi Code CLI Mobile and Desktop App, Open Source",
    metaDescription:
      "Open source mobile and desktop app for Moonshot AI's Kimi Code CLI. Launch sessions on your machine, monitor progress, ship from anywhere.",
  },
] as const satisfies readonly AgentPage[];

export const AGENT_PAGE_SLUGS: readonly string[] = AGENT_PAGES.map((p) => p.slug);

const AGENT_PAGE_MAP_INTERNAL: Record<string, AgentPage> = Object.fromEntries(
  AGENT_PAGES.map((p) => [p.slug, p]),
);

export function getAgentPage(slug: string): AgentPage {
  const page = AGENT_PAGE_MAP_INTERNAL[slug];
  if (!page) throw new Error(`Unknown agent page slug: ${slug}`);
  return page;
}
