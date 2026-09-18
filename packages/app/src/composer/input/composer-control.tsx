import React, { useCallback, useMemo, type ReactElement, type ReactNode } from "react";
import {
  Pressable,
  View,
  type PressableProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { ChevronDown } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";

/**
 * Composer toolbar control primitives (T3 port M19).
 *
 * One visual family for the composer's chip buttons: `sm` is the expanded
 * 32px chip, `xs` the compact 28px resting chip, `md` the 34px send circle.
 * `composerControlStyle` is the shared style resolver — it powers
 * `ComposerControl` directly and can be handed to trigger components that
 * own their Pressable (DropdownMenuTrigger / TooltipTrigger) so the same
 * hover/disabled semantics apply without nesting pressables.
 */

export type ComposerControlSize = "xs" | "sm" | "md";
export type ComposerControlVariant = "ghost" | "default" | "primary";
export type ComposerControlShape = "rounded" | "circle";

export interface ComposerControlState {
  hovered?: boolean;
  pressed?: boolean;
}

export interface ComposerControlStyleInput {
  size?: ComposerControlSize;
  variant?: ComposerControlVariant;
  shape?: ComposerControlShape;
  /** Active toggles the destructive background (e.g. recording). */
  active?: boolean;
  disabled?: boolean;
}

const SIZE_STYLES: Record<ComposerControlSize, "controlXs" | "controlSm" | "controlMd"> = {
  xs: "controlXs",
  sm: "controlSm",
  md: "controlMd",
};

/**
 * Resolves the control style array for a Pressable-style callback state.
 * Mirrors the legacy button styles exactly: ghost chips hover to surface1
 * (suppressed while active/disabled), primary keeps its fill, active uses
 * destructive, disabled dims to 0.5.
 */
export function composerControlStyle(input: ComposerControlStyleInput) {
  const {
    size = "sm",
    variant = "ghost",
    shape = "rounded",
    active = false,
    disabled = false,
  } = input;
  return (state: ComposerControlState): StyleProp<ViewStyle> => [
    styles.controlBase,
    styles[SIZE_STYLES[size]],
    shape === "circle" && styles.controlCircle,
    variant === "primary" && styles.controlPrimary,
    variant === "default" && styles.controlDefault,
    Boolean(state.hovered || state.pressed) && !active && variant !== "primary" && !disabled
      ? styles.controlHovered
      : null,
    active && styles.controlActive,
    disabled && styles.controlDisabled,
  ];
}

export type ComposerControlProps = Omit<PressableProps, "style" | "children"> &
  ComposerControlStyleInput & {
    style?: StyleProp<ViewStyle>;
    children?: ReactNode | ((state: ComposerControlState) => ReactNode);
  };

export function ComposerControl({
  size = "sm",
  variant = "ghost",
  shape = "rounded",
  active = false,
  disabled = false,
  style,
  children,
  ...rest
}: ComposerControlProps): ReactElement {
  const resolve = useMemo(
    () => composerControlStyle({ size, variant, shape, active, disabled }),
    [size, variant, shape, active, disabled],
  );
  const pressableStyle = useCallback(
    (state: ComposerControlState) => [resolve(state), style],
    [resolve, style],
  );
  const renderChildren = useCallback(
    (state: ComposerControlState) => (typeof children === "function" ? children(state) : children),
    [children],
  );
  return (
    <Pressable {...rest} disabled={disabled} style={pressableStyle}>
      {renderChildren}
    </Pressable>
  );
}

type ThemedIconComponent = React.ComponentType<{
  size?: number | string;
  style?: StyleProp<TextStyle>;
}>;
const themedIconCache = new WeakMap<LucideIcon, ThemedIconComponent>();

function themedIcon(icon: LucideIcon): ThemedIconComponent {
  let wrapped = themedIconCache.get(icon);
  if (!wrapped) {
    wrapped = withUnistyles(icon) as unknown as ThemedIconComponent;
    themedIconCache.set(icon, wrapped);
  }
  return wrapped;
}

export type ComposerControlIconTone = "auto" | "onPrimary" | "onDestructive";

export interface ComposerControlIconProps {
  icon: LucideIcon;
  size: number;
  hovered?: boolean;
  /**
   * auto: muted at rest, foreground on hover (ghost chips).
   * onPrimary: primaryForeground (send circle). onDestructive: white (recording).
   */
  tone?: ComposerControlIconTone;
}

export function ComposerControlIcon({
  icon,
  size,
  hovered = false,
  tone = "auto",
}: ComposerControlIconProps): ReactElement {
  const Themed = themedIcon(icon);
  let style = hovered ? styles.iconForeground : styles.iconForegroundMuted;
  if (tone === "onPrimary") style = styles.iconOnPrimary;
  else if (tone === "onDestructive") style = styles.iconOnDestructive;
  return <Themed size={size} style={style} />;
}

export function ComposerControlChevron({
  hovered = false,
  size = 12,
}: {
  hovered?: boolean;
  size?: number;
}): ReactElement {
  return <ComposerControlIcon icon={ChevronDown} size={size} hovered={hovered} />;
}

export function ComposerControlSeparator(): ReactElement {
  return <View style={styles.separator} />;
}

export interface ComposerSelectControlProps extends Omit<ComposerControlProps, "children"> {
  children: ReactNode;
}

/** Label + chevron trigger for select-style composer controls (resting family). */
export function ComposerSelectControl({
  children,
  ...rest
}: ComposerSelectControlProps): ReactElement {
  const renderInner = useCallback(
    (state: ComposerControlState) => (
      <View style={styles.selectInner}>
        {children}
        <ComposerControlChevron hovered={Boolean(state.hovered)} />
      </View>
    ),
    [children],
  );
  return <ComposerControl {...rest}>{renderInner}</ComposerControl>;
}

const styles = StyleSheet.create((theme) => ({
  controlBase: {
    alignItems: "center",
    justifyContent: "center",
  },
  controlXs: {
    width: 28,
    height: 28,
    borderRadius: 8,
  },
  controlSm: {
    width: 32,
    height: 32,
    borderRadius: 10,
  },
  controlMd: {
    width: 34,
    height: 34,
    borderRadius: 10,
  },
  controlCircle: {
    borderRadius: theme.borderRadius.full,
  },
  controlPrimary: {
    backgroundColor: theme.colors.primary,
  },
  controlDefault: {
    backgroundColor: theme.colors.surface1,
  },
  controlHovered: {
    backgroundColor: theme.colors.surface1,
  },
  controlActive: {
    backgroundColor: theme.colors.destructive,
  },
  controlDisabled: {
    opacity: 0.5,
  },
  iconForeground: {
    color: theme.colors.foreground,
  },
  iconForegroundMuted: {
    color: theme.colors.foregroundMuted,
  },
  iconOnPrimary: {
    color: theme.colors.primaryForeground,
  },
  iconOnDestructive: {
    color: "#ffffff",
  },
  separator: {
    width: 1,
    height: 16,
    marginHorizontal: theme.spacing[1],
    backgroundColor: theme.colors.border,
  },
  selectInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
  },
}));
