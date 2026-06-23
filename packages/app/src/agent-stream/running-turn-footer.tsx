import React, { memo, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { SyncedLoader } from "@/components/synced-loader";
import { formatDuration } from "@/utils/time";

const STREAM_METADATA_FONT_SIZE = 13;

export const RunningTurnFooter = memo(function RunningTurnFooter({
  inFlightTurnStartedAt,
}: {
  inFlightTurnStartedAt: Date | null;
}) {
  const { theme } = useUnistyles();
  const loaderColor =
    theme.colorScheme === "light"
      ? theme.colors.palette.amber[700]
      : theme.colors.palette.amber[500];
  return (
    <View style={stylesheet.turnFooterSlot} testID="turn-working-indicator">
      <View style={stylesheet.turnFooterContent}>
        <View style={stylesheet.workingIcon} testID="turn-working-pixel-loader">
          <SyncedLoader size={14} color={loaderColor} />
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
    }, 1000);
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
    gap: theme.spacing[2],
  },
  workingElapsed: {
    color: theme.colors.foregroundMuted,
    fontSize: STREAM_METADATA_FONT_SIZE,
    fontVariant: ["tabular-nums"],
  },
  workingIcon: {
    width: 14,
    height: 14,
    alignItems: "center",
    justifyContent: "center",
  },
}));
