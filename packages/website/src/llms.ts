import { AGENT_PAGES } from "~/data/agent-pages";
import { type Doc, getDocs } from "~/docs";

const SITE_URL = "https://chisacode.sh";

const PRODUCT_PREAMBLE = `# ChisaCode

> Mobile and desktop app for monitoring and controlling your local AI coding agents from anywhere. Your dev environment, in your pocket.

ChisaCode is an open source application that lets you run AI coding agents on your own machine and drive them from your phone, desktop, browser, or terminal. Your code stays local — ChisaCode connects directly to your real development environment instead of running agents in someone else's cloud.

A self-hosted daemon manages agent lifecycle, exposes a WebSocket API, and ships with an MCP server so other agents can talk to it. Native apps for iOS, Android, macOS, Windows, Linux, and the web let you launch sessions, watch them work, review diffs, and ship from anywhere. A Docker-style CLI ("chisacode run", "chisacode ls", "chisacode logs", "chisacode wait") gives you scripting access. An end-to-end encrypted relay lets the mobile app reach your daemon over the public internet without exposing it.

ChisaCode supports every major coding agent: Claude Code, Codex, GitHub Copilot, OpenCode, Cursor, Gemini, Cline, Goose, Amp, Aider, and 30+ others. Each agent runs as its own process; ChisaCode handles I/O, persistence, git worktree isolation, schedules, and skills.

Distribution: native apps for Mac, Windows, Linux, iOS, and Android; web app; Homebrew; npm. Source: AGPL-3.0 at https://github.com/getchisacode/chisacode. Marketing site: https://chisacode.sh.
`;

function docLine(doc: Doc): string {
  const url = `${SITE_URL}${doc.href}.md`;
  const description = doc.frontmatter.description?.trim();
  const suffix = description ? `: ${description}` : "";
  return `- [${doc.frontmatter.title}](${url})${suffix}`;
}

function agentLine(agent: (typeof AGENT_PAGES)[number]): string {
  return `- [${agent.name}](${SITE_URL}/${agent.slug}): ${agent.subtitle}`;
}

function topLevelDocs(): Doc[] {
  return getDocs().filter((d) => !d.slug.includes("/"));
}

function alternativeDocs(): Doc[] {
  return getDocs().filter((d) => d.slug.startsWith("alternatives/"));
}

export function buildLlmsTxt(): string {
  const docs = topLevelDocs().map(docLine).join("\n");
  const alternatives = alternativeDocs().map(docLine).join("\n");
  const agents = AGENT_PAGES.map(agentLine).join("\n");

  return `${PRODUCT_PREAMBLE}
## Docs

${docs}

## Alternatives

${alternatives}

## Supported agents

${agents}

## Optional

- [Changelog](${SITE_URL}/changelog): Release notes for the ChisaCode daemon, CLI, desktop, and mobile apps.
- [Download](${SITE_URL}/download): Install ChisaCode on Mac, Windows, Linux, iOS, Android, or run the web app.
- [ChisaCode Cloud](${SITE_URL}/cloud): Waitlist for the hosted multi-user version of ChisaCode.
- [Blog](${SITE_URL}/blog): Updates and technical posts from the ChisaCode team.
- [Privacy](${SITE_URL}/privacy): Privacy policy.
- [GitHub](https://github.com/getchisacode/chisacode): Source code, issues, and releases.
`;
}
