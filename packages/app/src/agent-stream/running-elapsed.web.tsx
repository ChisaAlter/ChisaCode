import React, { memo, useEffect, useLayoutEffect, useRef } from "react";
import { Text, type StyleProp, type TextStyle } from "react-native";
import { formatRunningElapsedLabel, startRunningElapsedTicker } from "./running-elapsed-logic";

function resolveElapsedDomNode(node: unknown): HTMLElement | null {
  if (!node || typeof node !== "object") {
    return null;
  }
  if (node instanceof HTMLElement) {
    return node;
  }
  // RN-web Text refs sometimes wrap the host node.
  const maybeHost =
    (node as { _node?: unknown; node?: unknown })._node ?? (node as { node?: unknown }).node;
  return maybeHost instanceof HTMLElement ? maybeHost : null;
}

/**
 * Web RunningElapsed (T3 port M21): updates `textContent` on a 1s ticker so
 * the turn footer does not re-render the React tree every second.
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
  const textRef = useRef<Text | null>(null);
  const labelRef = useRef(formatRunningElapsedLabel(startedAtMs, Date.now()));

  const writeLabel = (label: string) => {
    labelRef.current = label;
    const el = resolveElapsedDomNode(textRef.current);
    if (el) {
      el.textContent = label;
    }
  };

  useLayoutEffect(() => {
    writeLabel(labelRef.current);
  });

  useEffect(() => {
    const ticker = startRunningElapsedTicker({
      startedAtMs,
      onTick: writeLabel,
    });
    return () => {
      ticker.stop();
    };
  }, [startedAtMs]);

  return <Text ref={textRef} style={style} testID={testID} />;
});
