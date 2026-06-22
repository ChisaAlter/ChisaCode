import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { ChevronDown, ChevronRight } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { SyncedLoader } from "@/components/synced-loader";
import { Fonts } from "@/constants/theme";
import type { ThoughtStatus } from "@/types/stream";

export interface ThoughtMessageProps {
  text: string;
  status: ThoughtStatus;
  defaultCollapsed?: boolean;
  isLastInSequence?: boolean;
}

export const ThoughtMessage = memo(function ThoughtMessage({
  text,
  status,
  defaultCollapsed = false,
}: ThoughtMessageProps) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const content = text.trim();
  const hasContent = content.length > 0;
  const isLoading = status === "loading";
  const [isExpanded, setIsExpanded] = useState(() => hasContent && !defaultCollapsed);
  const previousStatusRef = useRef(status);
  const label = isLoading ? t("stream.thinkingRunning") : t("stream.thinking");
  const Icon = isExpanded ? ChevronDown : ChevronRight;
  const loaderColor =
    theme.colorScheme === "light"
      ? theme.colors.palette.amber[700]
      : theme.colors.palette.amber[500];
  const pixelDotStyle = useMemo(
    () => [styles.pixelDot, { backgroundColor: loaderColor }],
    [loaderColor],
  );

  useEffect(() => {
    if (!hasContent) {
      setIsExpanded(false);
      previousStatusRef.current = status;
      return;
    }
    if (isLoading) {
      setIsExpanded(true);
    }
    previousStatusRef.current = status;
  }, [hasContent, isLoading, status]);

  const toggle = useCallback(() => {
    if (!hasContent) {
      return;
    }
    setIsExpanded((value) => !value);
  }, [hasContent]);

  const accessibilityState = useMemo(() => ({ expanded: isExpanded }), [isExpanded]);

  return (
    <View style={styles.container} testID="thought-message">
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="button"
        accessibilityState={accessibilityState}
        disabled={!hasContent}
        onPress={toggle}
        style={styles.header}
        testID="thought-message-toggle"
      >
        <View style={styles.iconRail}>
          {isLoading ? (
            <SyncedLoader size={14} color={loaderColor} />
          ) : (
            <View style={pixelDotStyle} testID="thought-pixel-dot" />
          )}
        </View>
        <Text numberOfLines={1} style={styles.label}>
          {label}
        </Text>
        {!isExpanded && hasContent ? (
          <Text numberOfLines={1} style={styles.preview} testID="thought-message-preview">
            {content}
          </Text>
        ) : null}
        {hasContent ? (
          <Icon size={14} color={theme.colors.foregroundMuted} style={styles.chevron} />
        ) : null}
      </Pressable>
      {isExpanded && hasContent ? (
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
    maxWidth: "100%",
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
  pixelDot: {
    width: 4,
    height: 4,
    borderRadius: 1,
  },
  label: {
    color: theme.colors.foregroundMuted,
    fontFamily: Fonts.sans,
    fontSize: theme.fontSize.xs,
    lineHeight: 16,
    flexShrink: 0,
  },
  preview: {
    color: theme.colors.foregroundMuted,
    fontFamily: Fonts.sans,
    fontSize: theme.fontSize.xs,
    lineHeight: 16,
    opacity: 0.7,
    minWidth: 0,
    flexShrink: 1,
  },
  chevron: {
    marginLeft: theme.spacing[1],
    flexShrink: 0,
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
