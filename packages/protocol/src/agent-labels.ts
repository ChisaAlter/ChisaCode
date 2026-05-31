export const PARENT_AGENT_ID_LABEL = "chisacode.parent-agent-id";

export function readParentAgentIdLabel(labels: Record<string, unknown> | undefined): unknown {
  return labels?.[PARENT_AGENT_ID_LABEL];
}
