import { useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export const ZOOM_INDICATOR_FADE_MS = 1500;
export const ZOOM_INDICATOR_UNMOUNT_MS = 300;
export const ZOOM_LEVEL_STEP = 0.5;
export const ZOOM_LEVEL_MIN = -5;
export const ZOOM_LEVEL_MAX = 5;

/**
 * Electron `<webview>` zoom is logarithmic (level n → factor 1.2^n) and is
 * independent from the window-level zoom — see browser-pane handlers.
 */
export function zoomLevelToPercent(level: number): number {
  return Math.round(Math.pow(1.2, level) * 100);
}

export function clampZoomLevel(level: number): number {
  if (!Number.isFinite(level)) {
    return 0;
  }
  return Math.min(ZOOM_LEVEL_MAX, Math.max(ZOOM_LEVEL_MIN, level));
}

type IndicatorPhase = "hidden" | "visible" | "fading";

/**
 * Transient "X%" pill shown when the webview zoom level changes: appears on
 * every post-mount change, fades out after 1.5s, then unmounts. The first
 * frame is suppressed so the pill never flashes on pane mount (e.g. at 100%).
 */
export function ZoomIndicator({ percent }: { percent: number }) {
  const [phase, setPhase] = useState<IndicatorPhase>("hidden");
  const mountedRef = useRef(false);
  const prevPercentRef = useRef(percent);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      prevPercentRef.current = percent;
      return;
    }
    if (percent === prevPercentRef.current) {
      return;
    }
    prevPercentRef.current = percent;
    setPhase("visible");
    const fadeTimer = setTimeout(() => setPhase("fading"), ZOOM_INDICATOR_FADE_MS);
    const unmountTimer = setTimeout(
      () => setPhase("hidden"),
      ZOOM_INDICATOR_FADE_MS + ZOOM_INDICATOR_UNMOUNT_MS,
    );
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(unmountTimer);
    };
  }, [percent]);

  const pillStyle = useMemo(() => [styles.pill, phase === "fading" && styles.pillFading], [phase]);

  if (phase === "hidden") {
    return null;
  }

  return (
    <View testID="zoom-indicator" style={pillStyle}>
      <Text style={styles.text}>{percent}%</Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  pill: {
    height: 24,
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surfaceWorkspace,
    borderWidth: 1,
    borderColor: theme.colors.border,
    opacity: 1,
    pointerEvents: "none",
  },
  pillFading: {
    opacity: 0,
  },
  text: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
    color: theme.colors.foregroundSubtleText,
    fontVariant: ["tabular-nums"],
  },
}));
