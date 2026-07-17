import { useCallback, useMemo, type ReactNode } from "react";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import type { LucideIcon } from "lucide-react-native";
import {
  HEADER_INNER_HEIGHT,
  HEADER_INNER_HEIGHT_MOBILE,
  SETTINGS_DESKTOP_BACK_HEIGHT,
} from "@/constants/layout";

interface SidebarHeaderRowProps {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  isActive?: boolean;
  testID?: string;
  nativeID?: string;
  accessibilityLabel?: string;
  trailing?: ReactNode;
  compact?: boolean;
}

/**
 * Top-of-sidebar header row: a sidebar-height pressable with an icon + label
 * and a full-width border separator beneath. Used as the first element of a
 * sidebar (workspace "Sessions", settings "Back to workspace"). Owns its own
 * separator line so both sidebars converge on the same edge and padding.
 */
export function SidebarHeaderRow({
  icon: Icon,
  label,
  onPress,
  isActive = false,
  testID,
  nativeID,
  accessibilityLabel,
  trailing,
  compact = false,
}: SidebarHeaderRowProps) {
  const { theme } = useUnistyles();

  const buttonStyle = useCallback(
    ({ hovered }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.button,
      compact && styles.compactButton,
      (Boolean(hovered) || isActive) && styles.buttonHovered,
    ],
    [compact, isActive],
  );

  const renderChildren = useCallback(
    (state: PressableStateCallbackType & { hovered?: boolean }) => {
      const isHighlighted = Boolean(state.hovered) || isActive;
      const iconColor = isHighlighted ? theme.colors.foreground : theme.colors.foregroundMuted;
      return (
        <>
          <View style={styles.titleGroup}>
            <Icon size={theme.iconSize.md} color={iconColor} />
            <SidebarHeaderRowLabel label={label} isHighlighted={isHighlighted} compact={compact} />
          </View>
          {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
        </>
      );
    },
    [
      Icon,
      compact,
      isActive,
      label,
      theme.colors.foreground,
      theme.colors.foregroundMuted,
      theme.iconSize.md,
      trailing,
    ],
  );

  const containerStyle = useMemo(
    () => [styles.container, compact && styles.compactContainer],
    [compact],
  );

  return (
    <View style={containerStyle}>
      <Pressable
        onPress={onPress}
        testID={testID}
        nativeID={nativeID}
        accessible
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        style={buttonStyle}
      >
        {renderChildren}
      </Pressable>
    </View>
  );
}

function SidebarHeaderRowLabel({
  label,
  isHighlighted,
  compact,
}: {
  label: string;
  isHighlighted: boolean;
  compact: boolean;
}) {
  const labelStyle = useMemo(
    () => [styles.label, compact && styles.compactLabel, isHighlighted && styles.labelHighlighted],
    [compact, isHighlighted],
  );
  return <Text style={labelStyle}>{label}</Text>;
}

const styles = StyleSheet.create((theme) => ({
  container: {
    height: {
      xs: HEADER_INNER_HEIGHT_MOBILE,
      md: HEADER_INNER_HEIGHT,
    },
    paddingHorizontal: theme.spacing[2],
    justifyContent: "center",
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    userSelect: "none",
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
  },
  titleGroup: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  trailing: {
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonHovered: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  label: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.normal,
    color: theme.colors.foregroundMuted,
  },
  labelHighlighted: {
    color: theme.colors.foreground,
  },
  compactContainer: {
    height: SETTINGS_DESKTOP_BACK_HEIGHT,
    paddingHorizontal: theme.spacing[3],
  },
  compactButton: {
    flex: 1,
    paddingVertical: 0,
    paddingHorizontal: 0,
    borderRadius: 0,
  },
  compactLabel: {
    fontSize: 13,
    lineHeight: 18,
  },
}));
