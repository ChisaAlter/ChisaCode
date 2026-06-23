import { memo, useMemo } from "react";
import { View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import type { ResizeHandleProps } from "./resize-handle.types";

/**
 * Native fallback for {@link ResizeHandle}.
 *
 * The real implementation lives in `resize-handle.web.tsx` and relies on DOM
 * APIs (`Element.parentElement`, `getBoundingClientRect`, `window.addEventListener`,
 * `document.body.style.cursor`) that do not exist on React Native. Pane resizing
 * is a web/desktop-only feature (see `split-container.tsx`), so on native we
 * render a static separator without any pointer handling.
 *
 * Metro resolution picks this file for native and `resize-handle.web.tsx` for
 * web, so `import { ResizeHandle } from "@/components/resize-handle"` resolves
 * to the correct implementation per platform.
 */
export const ResizeHandle = memo(function ResizeHandleNative({ direction }: ResizeHandleProps) {
  const { theme } = useUnistyles();
  const directionStyle =
    direction === "horizontal" ? stylesheet.handleHorizontal : stylesheet.handleVertical;
  const style = useMemo(
    () => [stylesheet.handle, directionStyle, { backgroundColor: theme.colors.border }],
    [directionStyle, theme.colors.border],
  );
  return <View style={style} />;
});

const stylesheet = StyleSheet.create((_theme) => ({
  handle: {
    position: "relative",
    flexShrink: 0,
  },
  handleHorizontal: {
    width: 1,
    alignSelf: "stretch",
  },
  handleVertical: {
    height: 1,
    width: "100%",
  },
}));
