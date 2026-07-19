import { useCallback, useMemo, useState, type ReactNode } from "react";
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import { CONVERSATION_COLUMN_MAX_WIDTH_RATIO, useIsCompactFormFactor } from "@/constants/layout";
import { resolveThemeWorkbenchSurfaceRoles } from "@/styles/workbench-surface-roles";

/**
 * Left-aligned chat column capped at pane height (1:1).
 *
 * Important: never set an explicit pixel `width` from a self-measured pane width.
 * That creates a flex feedback loop (child width → parent min content size →
 * parent cannot shrink → layout width never decreases). Cap with maxWidth only.
 *
 * @param props.children Stream + composer (or draft setup) content
 */
export function ConversationAspectColumn({ children }: { children: ReactNode }) {
  const isCompact = useIsCompactFormFactor();
  // Only height is needed for the 1:1 max-width cap.
  const [paneHeight, setPaneHeight] = useState(0);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { height } = event.nativeEvent.layout;
    setPaneHeight((current) => (current === height ? current : height));
  }, []);

  const maxWidth =
    !isCompact && paneHeight > 0
      ? Math.round(paneHeight * CONVERSATION_COLUMN_MAX_WIDTH_RATIO)
      : null;

  const hostStyle = useMemo<StyleProp<ViewStyle>>(
    () => [styles.conversationAspectHost, !isCompact && styles.conversationAspectHostDesktopInset],
    [isCompact],
  );

  const columnStyle = useMemo<StyleProp<ViewStyle>>(() => {
    if (maxWidth == null) {
      return styles.conversationColumn;
    }
    return [styles.conversationColumn, { maxWidth }];
  }, [maxWidth]);

  return (
    <View style={hostStyle} onLayout={handleLayout} testID="conversation-aspect-host">
      <View style={columnStyle} testID="conversation-aspect-column">
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  conversationAspectHost: {
    flex: 1,
    width: "100%",
    minWidth: 0,
    // Clip any child min-content that would otherwise expand the flex chain.
    overflow: "hidden",
    // Left-align: when maxWidth binds, extra space stays on the right.
    alignItems: "flex-start",
    backgroundColor: resolveThemeWorkbenchSurfaceRoles(theme).content,
  },
  // Desktop only: keep the left-aligned column from hugging the sidebar edge.
  conversationAspectHostDesktopInset: {
    paddingLeft: theme.spacing[6],
    paddingRight: theme.spacing[4],
  },
  conversationColumn: {
    flex: 1,
    // Fill the host until maxWidth (height) clamps it.
    width: "100%",
    minWidth: 0,
    maxWidth: "100%",
    flexShrink: 1,
  },
}));
