export const PARENT_AGENT_ID_LABEL = "fleurdelys.parent-agent-id";
export const LEGACY_PARENT_AGENT_ID_LABEL = "paseo.parent-agent-id";

export function readParentAgentIdLabel(labels: Record<string, unknown> | undefined): unknown {
  return labels?.[PARENT_AGENT_ID_LABEL] ?? labels?.[LEGACY_PARENT_AGENT_ID_LABEL];
}
