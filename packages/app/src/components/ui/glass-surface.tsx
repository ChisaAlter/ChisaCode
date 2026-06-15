import { BlurView } from "expo-blur";
import { type ReactNode, useMemo } from "react";
import { StyleSheet as RNStyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import { isWeb } from "@/constants/platform";

export type GlassSurfaceVariant = "panel" | "popover" | "sheet" | "chrome";

export interface GlassSurfaceProps {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  variant: GlassSurfaceVariant;
}

const NATIVE_BLUR_INTENSITY = 42;

export function GlassSurface({ children, style, variant }: GlassSurfaceProps) {
  const surfaceStyle = useMemo(() => [style, styles.root, styles[variant]], [style, variant]);
  const webBlurLayerStyle = useMemo(() => [styles.blurLayer, styles.webBlurLayer], []);

  return (
    <View style={surfaceStyle}>
      {isWeb ? (
        <View pointerEvents="none" style={webBlurLayerStyle} />
      ) : (
        <BlurView
          intensity={NATIVE_BLUR_INTENSITY}
          pointerEvents="none"
          style={styles.blurLayer}
          tint="dark"
        />
      )}
      <View pointerEvents="none" style={styles.edgeHighlight} />
      {children}
    </View>
  );
}

export function createGlassSurfaceStyle(
  variant: GlassSurfaceVariant,
): (typeof styles)[GlassSurfaceVariant] {
  return styles[variant];
}

const absoluteFill = RNStyleSheet.absoluteFillObject;

const styles = StyleSheet.create((theme) => ({
  root: theme.glass.enabled
    ? {
        position: "relative" as const,
        borderWidth: theme.borderWidth[1],
        borderColor: theme.glass.border,
        overflow: "hidden" as const,
      }
    : {},
  panel: theme.glass.enabled
    ? {
        backgroundColor: theme.glass.panel,
      }
    : {},
  popover: theme.glass.enabled
    ? {
        backgroundColor: theme.glass.popover,
        borderColor: theme.glass.border,
      }
    : {},
  sheet: theme.glass.enabled
    ? {
        backgroundColor: theme.glass.sheet,
      }
    : {},
  chrome: theme.glass.enabled
    ? {
        backgroundColor: theme.glass.chrome,
      }
    : {},
  blurLayer: {
    ...absoluteFill,
    display: theme.glass.enabled ? "flex" : "none",
  },
  webBlurLayer: {
    backgroundColor: "rgba(255, 255, 255, 0.01)",
    backdropFilter: "blur(22px) saturate(1.8)" as unknown as ViewStyle["backfaceVisibility"],
  },
  edgeHighlight: {
    ...absoluteFill,
    display: theme.glass.enabled ? "flex" : "none",
    borderWidth: theme.borderWidth[1],
    borderColor: theme.glass.highlight,
    opacity: 0.8,
  },
}));
