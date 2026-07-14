import { useMemo } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { ShieldCheck } from "lucide-react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  buildProviderCapabilityHintSummaryLabel,
  getProviderCapabilityHints,
  summarizeProviderCapabilityHints,
  type ProviderCapabilityHint,
} from "@/utils/provider-capability-hints";

export function ProviderCapabilityHints({ provider }: { provider: string | null }) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const hints = useMemo(() => getProviderCapabilityHints(provider), [provider]);
  const summary = useMemo(() => summarizeProviderCapabilityHints(hints), [hints]);
  const iconColor =
    summary.unsupportedCount === 0 ? theme.colors.statusSuccess : theme.colors.foregroundMuted;
  const badgeStyle = useMemo(
    () => [
      styles.capabilityHintBadge,
      summary.unsupportedCount === 0 && styles.capabilityHintBadgeComplete,
    ],
    [summary.unsupportedCount],
  );
  const accessibilityLabel = useMemo(
    () =>
      buildProviderCapabilityHintSummaryLabel(hints, {
        title: t("providerCapabilities.title"),
        supportedLabel: t("providerCapabilities.supported"),
        limitedLabel: t("providerCapabilities.limited"),
        formatCount: ({ supported, total }) =>
          t("providerCapabilities.shortLabelWithCount", { supported, total }),
        labelForHint: (id) => t(`providerCapabilities.items.${id}`),
      }),
    [hints, t],
  );

  if (!provider) {
    return null;
  }

  return (
    <Tooltip delayDuration={150} enabledOnDesktop enabledOnMobile={false}>
      <TooltipTrigger asChild>
        <View
          accessible
          accessibilityLabel={accessibilityLabel}
          accessibilityRole="text"
          style={badgeStyle}
          testID="provider-capability-hints"
        >
          <ShieldCheck size={14} color={iconColor} />
          <Text style={styles.capabilityHintBadgeText} numberOfLines={1} ellipsizeMode="tail">
            {t("providerCapabilities.shortLabelWithCount", {
              supported: summary.supportedCount,
              total: summary.totalCount,
            })}
          </Text>
        </View>
      </TooltipTrigger>
      <TooltipContent side="top" align="center" offset={8}>
        <View style={styles.capabilityHintTooltip}>
          <Text style={styles.tooltipText}>{t("providerCapabilities.title")}</Text>
          <View style={styles.capabilityHintGrid}>
            {hints.map((hint) => (
              <ProviderCapabilityHintRow key={hint.id} hint={hint} />
            ))}
          </View>
        </View>
      </TooltipContent>
    </Tooltip>
  );
}

function ProviderCapabilityHintRow({ hint }: { hint: ProviderCapabilityHint }) {
  const { t } = useTranslation();
  const dotStyle = useMemo(
    () => [
      styles.capabilityHintDot,
      hint.supported ? styles.capabilityHintDotSupported : styles.capabilityHintDotMuted,
    ],
    [hint.supported],
  );
  return (
    <View style={styles.capabilityHintRow}>
      <View style={dotStyle} />
      <Text style={styles.capabilityHintText}>{t(`providerCapabilities.items.${hint.id}`)}</Text>
      <Text style={styles.capabilityHintStatusText}>
        {hint.supported ? t("providerCapabilities.supported") : t("providerCapabilities.limited")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  capabilityHintBadge: {
    height: 28,
    minWidth: 0,
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius["2xl"],
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
  },
  capabilityHintBadgeComplete: {
    borderColor: theme.colors.borderAccent,
    backgroundColor: theme.colors.surface1,
  },
  capabilityHintBadgeText: {
    minWidth: 0,
    flexShrink: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.normal,
  },
  capabilityHintTooltip: {
    gap: theme.spacing[2],
    minWidth: 180,
  },
  capabilityHintGrid: {
    gap: theme.spacing[1],
  },
  capabilityHintRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  capabilityHintDot: {
    width: 7,
    height: 7,
    borderRadius: theme.borderRadius.full,
  },
  capabilityHintDotSupported: {
    backgroundColor: theme.colors.statusSuccess,
  },
  capabilityHintDotMuted: {
    backgroundColor: theme.colors.foregroundMuted,
  },
  capabilityHintText: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.normal,
  },
  capabilityHintStatusText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.normal,
  },
  tooltipText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    lineHeight: theme.fontSize.sm * 1.4,
  },
}));
