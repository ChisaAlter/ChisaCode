import React, { memo, useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Brain, ChevronDown, ChevronRight } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Fonts } from "@/constants/theme";
import type { ThoughtStatus } from "@/types/stream";

export interface ThoughtMessageProps {
  text: string;
  status: ThoughtStatus;
  isLastInSequence?: boolean;
}

export const ThoughtMessage = memo(function ThoughtMessage({ text, status }: ThoughtMessageProps) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const [isExpanded, setIsExpanded] = useState(false);
  const content = text.trim();
  const label = status === "loading" ? t("stream.thinkingRunning") : t("stream.thinking");
  const Icon = isExpanded ? ChevronDown : ChevronRight;

  const toggle = useCallback(() => {
    if (!content) {
      return;
    }
    setIsExpanded((value) => !value);
  }, [content]);

  const accessibilityState = useMemo(() => ({ expanded: isExpanded }), [isExpanded]);

  return (
    <View style={styles.container} testID="thought-message">
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="button"
        accessibilityState={accessibilityState}
        disabled={!content}
        onPress={toggle}
        style={styles.header}
        testID="thought-message-toggle"
      >
        <View style={styles.iconRail}>
          <Brain size={12} color={theme.colors.foregroundMuted} />
        </View>
        <Text numberOfLines={1} style={styles.label}>
          {label}
        </Text>
        {content ? (
          <Icon size={14} color={theme.colors.foregroundMuted} style={styles.chevron} />
        ) : null}
      </Pressable>
      {isExpanded && content ? (
        <Text selectable style={styles.content} testID="thought-message-content">
          {content}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create((theme) => ({
  container: {
    alignSelf: "flex-start",
    maxWidth: "100%",
    paddingVertical: theme.spacing[1],
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    minHeight: 28,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
  },
  iconRail: {
    width: 14,
    height: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    color: theme.colors.foregroundMuted,
    fontFamily: Fonts.sans,
    fontSize: theme.fontSize.xs,
    lineHeight: 16,
  },
  chevron: {
    marginLeft: theme.spacing[1],
  },
  content: {
    maxWidth: "100%",
    marginTop: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    paddingBottom: theme.spacing[1],
    color: theme.colors.foregroundMuted,
    fontFamily: Fonts.sans,
    fontSize: theme.fontSize.xs,
    lineHeight: 18,
  },
}));
