import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { ChevronDown, ChevronRight } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import Svg, { Circle, G, Line, Rect } from "react-native-svg";
import chisaThinkingAvatar from "../../assets/images/chisa-thinking-avatar.png";
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
  const content = text.trim();
  const hasContent = content.length > 0;
  const [isExpanded, setIsExpanded] = useState(() => hasContent);
  const hasAutoExpandedContentRef = useRef(hasContent);
  const label = status === "loading" ? t("stream.thinkingRunning") : t("stream.thinking");
  const Icon = isExpanded ? ChevronDown : ChevronRight;
  const indicatorColors = useMemo(
    () => ({
      black: theme.colors.palette.black,
      muted: theme.colors.foregroundMuted,
      red: theme.colors.palette.red[600],
      redBright: theme.colors.palette.red[300],
    }),
    [theme],
  );

  useEffect(() => {
    if (!hasContent) {
      hasAutoExpandedContentRef.current = false;
      setIsExpanded(false);
      return;
    }
    if (!hasAutoExpandedContentRef.current) {
      hasAutoExpandedContentRef.current = true;
      setIsExpanded(true);
    }
  }, [hasContent]);

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
        <View style={styles.mascotRail}>
          <ChisaThinkingIndicator status={status} colors={indicatorColors} />
        </View>
        <Text numberOfLines={1} style={styles.label}>
          {label}
        </Text>
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

export interface ChisaThinkingIndicatorColors {
  black: string;
  muted: string;
  red: string;
  redBright: string;
}

interface ChisaThinkingIndicatorProps {
  status: ThoughtStatus;
  colors: ChisaThinkingIndicatorColors;
}

export function ChisaThinkingIndicator({ status, colors }: ChisaThinkingIndicatorProps) {
  const isLoading = status === "loading";
  const [motionFrame, setMotionFrame] = useState(0);
  useEffect(() => {
    if (!isLoading) {
      setMotionFrame(0);
      return;
    }
    const interval = setInterval(() => {
      setMotionFrame((frame) => (frame + 1) % 4);
    }, 240);
    return () => clearInterval(interval);
  }, [isLoading]);

  const scissorsFrame = isLoading ? motionFrame : 0;
  const scissorsPath = [
    { x: 4, y: 5, bladeX: 12, bladeY: 1 },
    { x: 22, y: 5, bladeX: 1, bladeY: 12 },
    { x: 22, y: 19, bladeX: -12, bladeY: 1 },
    { x: 4, y: 19, bladeX: 1, bladeY: -12 },
  ][scissorsFrame];

  return (
    <View style={styles.indicatorRow} testID="chisa-thinking-indicator">
      <Image
        resizeMode="cover"
        source={chisaThinkingAvatar}
        style={styles.indicatorAvatar}
        testID="chisa-thinking-avatar"
      />
      <Svg width={38} height={28} viewBox="0 0 38 28" testID="chisa-thinking-scissors-stage">
        <G opacity={0.5}>
          <Rect x={4} y={6} width={28} height={18} rx={2} fill="none" stroke={colors.muted} />
          <Rect x={11} y={10} width={14} height={10} rx={1} fill="none" stroke={colors.muted} />
        </G>
        <G testID={`chisa-thinking-scissors-position-${scissorsFrame}`}>
          <Circle cx={scissorsPath.x} cy={scissorsPath.y} r={3} fill="none" stroke={colors.red} />
          <Circle
            cx={scissorsPath.x + 6}
            cy={scissorsPath.y}
            r={3}
            fill="none"
            stroke={colors.red}
          />
          <Line
            x1={scissorsPath.x + 3}
            y1={scissorsPath.y}
            x2={scissorsPath.x + 3 + scissorsPath.bladeX}
            y2={scissorsPath.y + scissorsPath.bladeY}
            stroke={colors.black}
            strokeWidth={2}
          />
          <Line
            x1={scissorsPath.x + 4}
            y1={scissorsPath.y}
            x2={scissorsPath.x + 4 + scissorsPath.bladeX}
            y2={scissorsPath.y - scissorsPath.bladeY}
            stroke={colors.black}
            strokeWidth={2}
          />
          <Circle cx={scissorsPath.x + 3.5} cy={scissorsPath.y} r={1.4} fill={colors.redBright} />
        </G>
      </Svg>
    </View>
  );
}

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
    minHeight: 34,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
  },
  mascotRail: {
    width: 72,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  indicatorRow: {
    width: 72,
    height: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  indicatorAvatar: {
    width: 28,
    height: 28,
    borderRadius: 7,
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
