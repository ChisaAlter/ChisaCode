import { useMemo, type ReactNode } from "react";
import type { LayoutChangeEvent } from "react-native";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import {
  HEADER_INNER_HEIGHT,
  HEADER_INNER_HEIGHT_MOBILE,
  HEADER_TOP_PADDING_MOBILE,
  useIsCompactFormFactor,
  WORKBENCH_HEADER_HORIZONTAL_PADDING,
} from "@/constants/layout";
import { useWindowControlsPadding } from "@/utils/desktop-window";
import { TitlebarDragRegion } from "@/components/desktop/titlebar-drag-region";
import { resolveThemeWorkbenchSurfaceRoles } from "@/styles/workbench-surface-roles";

interface ScreenHeaderProps {
  left?: ReactNode;
  right?: ReactNode;
  leftStyle?: StyleProp<ViewStyle>;
  rightStyle?: StyleProp<ViewStyle>;
  borderless?: boolean;
  windowControlsPaddingRole?: "header" | "detailHeader";
  onRowLayout?: (event: LayoutChangeEvent) => void;
  height?: number;
  horizontalPadding?: number;
  backgroundColor?: string;
}

/**
 * Shared frame for the home/back headers so we only maintain padding, border,
 * and safe-area logic in one place.
 */
export function ScreenHeader({
  left,
  right,
  leftStyle,
  rightStyle,
  borderless,
  windowControlsPaddingRole = "header",
  onRowLayout,
  height,
  horizontalPadding,
  backgroundColor,
}: ScreenHeaderProps) {
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  const isMobile = useIsCompactFormFactor();
  const padding = useWindowControlsPadding(windowControlsPaddingRole);
  // Only add extra padding on mobile for better touch targets; on desktop, only use safe area insets
  const topPadding = isMobile ? HEADER_TOP_PADDING_MOBILE : 0;
  const baseHorizontalPadding =
    horizontalPadding ?? (isMobile ? theme.spacing[2] : WORKBENCH_HEADER_HORIZONTAL_PADDING);

  const innerStyle = useMemo(
    () => [styles.inner, { paddingTop: insets.top + topPadding }],
    [insets.top, topPadding],
  );
  const rowStyle = useMemo(
    () => [
      styles.row,
      height === undefined ? null : { height },
      {
        paddingLeft: baseHorizontalPadding + padding.left,
        paddingRight: baseHorizontalPadding + padding.right,
      },
      borderless && styles.borderless,
    ],
    [baseHorizontalPadding, borderless, height, padding.left, padding.right],
  );
  const headerStyle = useMemo(
    () => [styles.header, backgroundColor ? { backgroundColor } : null],
    [backgroundColor],
  );
  const leftCombinedStyle = useMemo(() => [styles.left, leftStyle], [leftStyle]);
  const rightCombinedStyle = useMemo(() => [styles.right, rightStyle], [rightStyle]);

  return (
    <View style={headerStyle}>
      <View style={innerStyle}>
        <View onLayout={onRowLayout} style={rowStyle}>
          <TitlebarDragRegion />
          <View style={leftCombinedStyle}>{left}</View>
          <View style={rightCombinedStyle}>{right}</View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  header: {
    backgroundColor: resolveThemeWorkbenchSurfaceRoles(theme).content,
  },
  inner: {},
  row: {
    position: "relative",
    height: {
      xs: HEADER_INNER_HEIGHT_MOBILE,
      md: HEADER_INNER_HEIGHT,
    },
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing[2],
    borderBottomWidth: theme.borderWidth[1],
    borderBottomColor: theme.colors.border,
    userSelect: "none",
  },
  left: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    minWidth: 0,
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    flexShrink: 0,
  },
  borderless: {
    borderBottomColor: "transparent",
  },
}));
