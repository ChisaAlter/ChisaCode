import React, { memo, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import {
  ChisaThinkingIndicator,
  type ChisaThinkingIndicatorColors,
} from "@/components/thought-message";
import { formatDuration } from "@/utils/time";

const STREAM_METADATA_FONT_SIZE = 13;

interface ChisaIndicatorTheme {
  colors: {
    foregroundMuted: string;
    palette: {
      black: string;
      red: { 300: string; 600: string };
    };
  };
}

const ThemedChisaThinkingIndicator = withUnistyles(ChisaThinkingIndicator);
const chisaThinkingIndicatorColorMapping = (
  theme: ChisaIndicatorTheme,
): { colors: ChisaThinkingIndicatorColors } => ({
  colors: {
    black: theme.colors.palette.black,
    muted: theme.colors.foregroundMuted,
    red: theme.colors.palette.red[600],
    redBright: theme.colors.palette.red[300],
  },
});

export const RunningTurnFooter = memo(function RunningTurnFooter({
  inFlightTurnStartedAt,
}: {
  inFlightTurnStartedAt: Date | null;
}) {
  return (
    <View style={stylesheet.turnFooterSlot} testID="turn-working-indicator">
      <View style={stylesheet.turnFooterContent}>
        <View style={stylesheet.workingMascot}>
          <ThemedChisaThinkingIndicator
            status="loading"
            uniProps={chisaThinkingIndicatorColorMapping}
          />
        </View>
        {inFlightTurnStartedAt ? (
          <RunningElapsed startedAt={inFlightTurnStartedAt} testID="turn-working-elapsed" />
        ) : null}
      </View>
    </View>
  );
});

const RunningElapsed = memo(function RunningElapsed({
  startedAt,
  testID,
}: {
  startedAt: Date;
  testID?: string;
}) {
  const startedAtMs = startedAt.getTime();
  const [elapsedMs, setElapsedMs] = useState(() => Math.max(0, Date.now() - startedAtMs));

  useEffect(() => {
    setElapsedMs(Math.max(0, Date.now() - startedAtMs));
    const handle = setInterval(() => {
      setElapsedMs(Math.max(0, Date.now() - startedAtMs));
    }, 100);
    return () => clearInterval(handle);
  }, [startedAtMs]);

  return (
    <Text style={stylesheet.workingElapsed} testID={testID}>
      {formatDuration(elapsedMs)}
    </Text>
  );
});

const stylesheet = StyleSheet.create((theme) => ({
  turnFooterSlot: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    minHeight: 24,
    paddingBottom: theme.spacing[6],
  },
  turnFooterContent: {
    height: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: theme.spacing[3],
  },
  workingElapsed: {
    color: theme.colors.foregroundMuted,
    fontSize: STREAM_METADATA_FONT_SIZE,
    fontVariant: ["tabular-nums"],
  },
  workingMascot: {
    width: 72,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: -2,
  },
}));
