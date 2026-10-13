import React, { memo, useEffect, useState } from "react";
import { Text, type StyleProp, type TextStyle } from "react-native";
import { formatRunningElapsedLabel, startRunningElapsedTicker } from "./running-elapsed-logic";

/**
 * Native RunningElapsed: keeps the existing setState tick path (T3 port M21).
 * Web builds resolve `running-elapsed.web.tsx` instead.
 */
export const RunningElapsed = memo(function RunningElapsed({
  startedAt,
  style,
  testID,
}: {
  startedAt: Date;
  style?: StyleProp<TextStyle>;
  testID?: string;
}) {
  const startedAtMs = startedAt.getTime();
  const [label, setLabel] = useState(() => formatRunningElapsedLabel(startedAtMs, Date.now()));

  useEffect(() => {
    const ticker = startRunningElapsedTicker({
      startedAtMs,
      onTick: setLabel,
    });
    return () => {
      ticker.stop();
    };
  }, [startedAtMs]);

  return (
    <Text style={style} testID={testID}>
      {label}
    </Text>
  );
});
