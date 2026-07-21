import React, { useEffect } from "react";
import {
  StyleSheet as RNStyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import type { AgentLifecycleStatus } from "@chisacode/protocol/agent-lifecycle";
import { AlertCircle, CheckCircle, ShieldAlert } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

export interface AgentStatusIndicatorProps {
  /** Agent lifecycle status */
  status: AgentLifecycleStatus;
  /** Whether the agent requires user attention */
  requiresAttention?: boolean;
  /** Reason for attention: "finished" | "error" | "permission" | null */
  attentionReason?: "finished" | "error" | "permission" | null;
  /** Number of pending permission requests */
  pendingPermissionCount?: number;
  /** Size variant: "sm" for sidebar rows, "md" for full list */
  size?: "sm" | "md";
}

/**
 * Compact visual indicator for agent status.
 *
 * - `running`: pulsing accent dot
 * - `initializing`: spinning indicator
 * - `error`: static red dot (+ attention reason icon for md)
 * - `requiresAttention` / `pendingPermissionCount > 0`: amber dot with optional count
 * - `idle` / `closed`: renders nothing
 */
export function AgentStatusIndicator({
  status,
  requiresAttention,
  attentionReason,
  pendingPermissionCount = 0,
  size = "sm",
}: AgentStatusIndicatorProps) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const needsAttention = requiresAttention || pendingPermissionCount > 0;
  const isRunning = status === "running";
  const isInitializing = status === "initializing";
  const isError = status === "error";
  const dotSize = size === "sm" ? 6 : 8;
  const dynamicStyles = React.useMemo(
    () => ({
      successText: [
        styles.attentionText,
        { color: theme.colors.statusSuccess } satisfies TextStyle,
      ],
      dangerText: [styles.attentionText, { color: theme.colors.statusDanger } satisfies TextStyle],
      warningText: [
        styles.attentionText,
        { color: theme.colors.statusWarning } satisfies TextStyle,
      ],
      warningDot: [
        staticStyles.dot,
        {
          backgroundColor: theme.colors.statusWarning,
          width: dotSize,
          height: dotSize,
        } satisfies ViewStyle,
      ],
      dangerDot: [
        staticStyles.dot,
        {
          backgroundColor: theme.colors.statusDanger,
          width: dotSize,
          height: dotSize,
        } satisfies ViewStyle,
      ],
      countBadge: [
        styles.countBadge,
        { backgroundColor: theme.colors.statusWarningBg } satisfies ViewStyle,
      ],
      countText: [styles.countText, { color: theme.colors.statusWarning } satisfies TextStyle],
    }),
    [
      dotSize,
      theme.colors.statusDanger,
      theme.colors.statusSuccess,
      theme.colors.statusWarning,
      theme.colors.statusWarningBg,
    ],
  );

  // Hide indicator for idle/closed - nothing visual to show.
  if (status === "idle" || status === "closed") {
    if (!requiresAttention && pendingPermissionCount === 0) {
      return null;
    }
  }

  // --- Running: pulsing accent dot ---
  if (isRunning) {
    return <PulsingDot color={theme.colors.accent} size={dotSize} />;
  }

  // --- Initializing: spinner ---
  if (isInitializing) {
    return (
      <LoadingSpinner color={theme.colors.accent} size={size === "sm" ? "small" : undefined} />
    );
  }

  // --- Attention badge for finished/error/permission (md only) ---
  if (size === "md" && attentionReason) {
    switch (attentionReason) {
      case "finished":
        return (
          <View style={styles.attentionBadge}>
            <CheckCircle size={14} color={theme.colors.statusSuccess} />
            <Text style={dynamicStyles.successText}>{t("agentStatus.completed")}</Text>
          </View>
        );
      case "error":
        return (
          <View style={styles.attentionBadge}>
            <AlertCircle size={14} color={theme.colors.statusDanger} />
            <Text style={dynamicStyles.dangerText}>{t("agentStatus.errored")}</Text>
          </View>
        );
      case "permission":
        return (
          <View style={styles.attentionBadge}>
            <ShieldAlert size={14} color={theme.colors.statusWarning} />
            <Text style={dynamicStyles.warningText}>{t("agentStatus.needsPermission")}</Text>
          </View>
        );
    }
  }

  // --- Permission count badge ---
  if (pendingPermissionCount > 0) {
    return (
      <View style={styles.permissionWrapper}>
        <View style={dynamicStyles.warningDot} />
        <View style={dynamicStyles.countBadge}>
          <Text style={dynamicStyles.countText}>{pendingPermissionCount}</Text>
        </View>
      </View>
    );
  }

  // --- Error: static red dot ---
  if (isError) {
    return <View style={dynamicStyles.dangerDot} />;
  }

  // --- Generic attention (no specific reason) ---
  if (needsAttention) {
    return <View style={dynamicStyles.warningDot} />;
  }

  return null;
}

/** Pulsing dot animation for "running" status */
function PulsingDot({ color, size }: { color: string; size: number }) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.3, { duration: 500, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 500, easing: Easing.inOut(Easing.quad) }),
      ),
      -1, // infinite repeat
      false,
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));
  const dotStyle = React.useMemo(
    () => [
      staticStyles.dot,
      { backgroundColor: color, width: size, height: size } satisfies ViewStyle,
      animatedStyle,
    ],
    [animatedStyle, color, size],
  );

  return <Animated.View style={dotStyle} />;
}

const styles = StyleSheet.create((theme) => ({
  permissionWrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  countBadge: {
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: 4,
    paddingVertical: 1,
    minWidth: 16,
    alignItems: "center",
  },
  countText: {
    fontSize: 10,
    fontWeight: "600",
    lineHeight: 14,
  },
  attentionBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  attentionText: {
    fontSize: 12.5,
    lineHeight: 16,
    fontWeight: "500",
  },
}));

const staticStyles = RNStyleSheet.create({
  dot: {
    borderRadius: 9999,
  },
});
