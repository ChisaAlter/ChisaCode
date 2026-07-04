// TODO(provider-god-file-decomposition): wire BaseAgentClient/BaseAgentSession
// into each provider (codex/claude/opencode/pi) so shared logic is inherited
// instead of duplicated. See docs/refactors/provider-god-file-decomposition-plan.md.
// Currently unused — exported for the upcoming migration only.
export { BaseAgentSession } from "./base-agent-session.js";
export { BaseAgentClient } from "./base-agent-client.js";
