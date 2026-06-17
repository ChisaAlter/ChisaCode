import { BUILTIN_AGENT_PRESETS, type AgentPreset } from "@chisacode/protocol/agent-presets";

export function getBuiltinAgentPresetCatalog(): AgentPreset[] {
  return Array.from(BUILTIN_AGENT_PRESETS);
}
