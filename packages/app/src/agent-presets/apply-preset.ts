import type { AgentPreset } from "@chisacode/protocol/agent-presets";

export interface AgentPresetDraft {
  provider?: string | null;
  modeId?: string | null;
  model?: string | null;
  systemPrompt?: string;
  mcpServerIds?: string[];
  samplePrompt?: string;
}

export function applyAgentPresetToDraft(
  draft: AgentPresetDraft,
  preset: AgentPreset,
): AgentPresetDraft {
  return {
    ...draft,
    provider: preset.provider === "default" ? draft.provider : preset.provider,
    modeId: preset.modeId ?? draft.modeId ?? null,
    model: preset.model ?? draft.model ?? null,
    systemPrompt: preset.systemPrompt ?? draft.systemPrompt,
    mcpServerIds: preset.mcpServerIds ?? draft.mcpServerIds,
    samplePrompt: preset.samplePrompts?.[0] ?? draft.samplePrompt,
  };
}
