import { useMemo } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import {
  AGENT_LIFECYCLE_STATUSES,
  type AgentLifecycleStatus,
} from "@chisacode/protocol/agent-lifecycle";
import { deriveSidebarStateBucket } from "@/utils/sidebar-agent-state";
import { getStatusDotColor } from "@/utils/status-dot-color";

export function AgentStatusDot({
  status,
  requiresAttention,
  attentionReason,
  pendingPermissionCount,
  showInactive = false,
}: {
  status: string | null | undefined;
  requiresAttention: boolean | null | undefined;
  attentionReason?: "finished" | "error" | "permission" | null;
  pendingPermissionCount?: number;
  showInactive?: boolean;
}) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();

  if (!status) {
    return null;
  }
  if (!isAgentLifecycleStatus(status)) {
    return null;
  }

  const bucket = deriveSidebarStateBucket({
    status,
    requiresAttention: Boolean(requiresAttention),
    attentionReason: attentionReason ?? null,
    pendingPermissionCount: pendingPermissionCount ?? 0,
  });
  const color = getStatusDotColor({ theme, bucket, showDoneAsInactive: showInactive });

  if (!color) {
    return null;
  }

  return <AgentStatusDotView color={color} accessibilityLabel={labelForBucket(bucket, t)} />;
}

function labelForBucket(
  bucket: ReturnType<typeof deriveSidebarStateBucket>,
  t: (key: string) => string,
): string {
  switch (bucket) {
    case "done":
      return t("agentStatus.completed");
    case "failed":
      return t("agentStatus.errored");
    case "needs_input":
      return t("agentStatus.needsPermission");
    case "running":
      return t("agentStatus.running");
    case "attention":
      return t("agentStatus.idle");
  }
}

function AgentStatusDotView({
  color,
  accessibilityLabel,
}: {
  color: string;
  accessibilityLabel: string;
}) {
  const dotStyle = useMemo(() => [styles.dot, { backgroundColor: color }], [color]);
  return (
    <View accessibilityLabel={accessibilityLabel} accessibilityRole="image" style={dotStyle} />
  );
}

function isAgentLifecycleStatus(value: string): value is AgentLifecycleStatus {
  return AGENT_LIFECYCLE_STATUSES.some((status) => status === value);
}

const styles = StyleSheet.create((theme) => ({
  dot: {
    width: 8,
    height: 8,
    borderRadius: theme.borderRadius.full,
  },
}));
