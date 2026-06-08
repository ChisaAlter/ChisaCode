import {
  default as React,
  useCallback,
  useMemo,
  useState,
  type ComponentType,
  type PropsWithChildren,
  type ReactElement,
  type ReactNode,
} from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import type {
  PressableProps,
  PressableStateCallbackType,
  StyleProp,
  TextStyle,
  ViewStyle,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

type ButtonVariant = "default" | "secondary" | "outline" | "ghost" | "destructive";
type ButtonSize = "xs" | "sm" | "md" | "lg";

type LeftIcon =
  | ReactElement
  | ComponentType<{ color: string; size: number }>
  | ((color: string) => ReactElement)
  | null;

const ICON_SIZE: Record<ButtonSize, number> = { xs: 12, sm: 14, md: 16, lg: 20 };

function normalizeGeneratedAccessibilityLabel(value: string | number): string | undefined {
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeButtonVariant(variant: ButtonVariant): ButtonVariant {
  if (
    variant === "default" ||
    variant === "secondary" ||
    variant === "outline" ||
    variant === "ghost" ||
    variant === "destructive"
  ) {
    return variant;
  }
  return "secondary";
}

function normalizeButtonSize(size: ButtonSize): ButtonSize {
  if (size === "xs" || size === "sm" || size === "md" || size === "lg") {
    return size;
  }
  return "md";
}

const styles = StyleSheet.create((theme) => ({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[2],
    minHeight: 36,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: "transparent",
  },
  md: {
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
  },
  xs: {
    minHeight: 28,
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.xl,
  },
  sm: {
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.xl,
  },
  lg: {
    paddingVertical: theme.spacing[4],
    paddingHorizontal: theme.spacing[6],
    borderRadius: theme.borderRadius.xl,
  },
  default: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
    ...theme.shadow.sm,
  },
  secondary: {
    backgroundColor: theme.colors.surface2,
    borderColor: theme.colors.borderAccent,
    ...theme.shadow.sm,
  },
  outline: {
    backgroundColor: "transparent",
    borderColor: theme.colors.borderAccent,
    ...theme.shadow.sm,
  },
  ghost: {
    backgroundColor: "transparent",
    borderColor: "transparent",
  },
  ghostHovered: {
    backgroundColor: theme.colors.surface1,
    borderColor: theme.colors.borderAccent,
  },
  destructive: {
    backgroundColor: theme.colors.destructive,
    borderColor: theme.colors.destructive,
    ...theme.shadow.sm,
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: theme.opacity[50],
  },
  text: {
    minWidth: 0,
    flexShrink: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.normal,
  },
  textXs: {
    fontSize: theme.fontSize.xs,
  },
  textDefault: {
    color: theme.colors.palette.white,
  },
  textDestructive: {
    color: theme.colors.palette.white,
  },
  textGhost: {
    color: theme.colors.foregroundMuted,
  },
  textGhostHovered: {
    color: theme.colors.foreground,
  },
}));

export function Button({
  children,
  variant = "secondary",
  size = "md",
  leftIcon,
  trailing,
  style,
  textStyle,
  disabled,
  loading = false,
  accessibilityLabel,
  accessibilityRole,
  ...props
}: PropsWithChildren<
  Omit<PressableProps, "style"> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
    leftIcon?: LeftIcon;
    trailing?: ReactNode;
    style?: StyleProp<ViewStyle>;
    textStyle?: StyleProp<TextStyle>;
    loading?: boolean;
  }
>) {
  const [hovered, setHovered] = useState(false);
  const { theme } = useUnistyles();
  const isDisabled = disabled || loading;
  const normalizedVariant = normalizeButtonVariant(variant);
  const normalizedSize = normalizeButtonSize(size);

  let variantStyle: ViewStyle;
  if (normalizedVariant === "default") {
    variantStyle = styles.default;
  } else if (normalizedVariant === "secondary") {
    variantStyle = styles.secondary;
  } else if (normalizedVariant === "outline") {
    variantStyle = styles.outline;
  } else if (normalizedVariant === "ghost") {
    variantStyle = styles.ghost;
  } else {
    variantStyle = styles.destructive;
  }

  let sizeStyle: ViewStyle;
  if (normalizedSize === "xs") {
    sizeStyle = styles.xs;
  } else if (normalizedSize === "sm") {
    sizeStyle = styles.sm;
  } else if (normalizedSize === "lg") {
    sizeStyle = styles.lg;
  } else {
    sizeStyle = styles.md;
  }
  const isGhostHovered = hovered && normalizedVariant === "ghost";

  const handleHoverIn = useCallback(() => setHovered(true), []);
  const handleHoverOut = useCallback(() => setHovered(false), []);

  const pressableStyle = useCallback(
    ({ pressed }: PressableStateCallbackType): StyleProp<ViewStyle> => [
      styles.base,
      sizeStyle,
      variantStyle,
      hovered && normalizedVariant === "ghost" ? styles.ghostHovered : null,
      pressed ? styles.pressed : null,
      isDisabled ? styles.disabled : null,
      style,
    ],
    [sizeStyle, variantStyle, hovered, normalizedVariant, isDisabled, style],
  );

  const resolvedTextStyle = useMemo(
    () => [
      styles.text,
      normalizedSize === "xs" ? styles.textXs : null,
      normalizedVariant === "default" ? styles.textDefault : null,
      normalizedVariant === "destructive" ? styles.textDestructive : null,
      normalizedVariant === "ghost" ? styles.textGhost : null,
      textStyle,
      isGhostHovered ? styles.textGhostHovered : null,
    ],
    [normalizedSize, normalizedVariant, textStyle, isGhostHovered],
  );

  const accessibilityState = useMemo(
    () => ({ disabled: isDisabled, busy: loading }),
    [isDisabled, loading],
  );
  const explicitAccessibilityLabel =
    typeof accessibilityLabel === "string"
      ? normalizeGeneratedAccessibilityLabel(accessibilityLabel)
      : undefined;
  const generatedAccessibilityLabel =
    typeof children === "string" || typeof children === "number"
      ? normalizeGeneratedAccessibilityLabel(children)
      : undefined;
  const resolvedAccessibilityLabel = explicitAccessibilityLabel ?? generatedAccessibilityLabel;

  function resolveIconColor(): string {
    if (normalizedVariant === "default") {
      return theme.colors.accentForeground;
    }
    if (normalizedVariant === "ghost") {
      return isGhostHovered ? theme.colors.foreground : theme.colors.foregroundMuted;
    }
    return theme.colors.foreground;
  }

  function renderIcon() {
    if (loading) {
      return (
        <View>
          <ActivityIndicator size="small" color={resolveIconColor()} />
        </View>
      );
    }

    if (!leftIcon) return null;

    // Pre-rendered element — pass through
    if (typeof leftIcon === "object" && "type" in leftIcon) {
      return <View>{leftIcon}</View>;
    }

    const color = resolveIconColor();
    const iconSize = ICON_SIZE[normalizedSize];

    // Render function
    if (
      typeof leftIcon === "function" &&
      !leftIcon.prototype?.isReactComponent &&
      leftIcon.length > 0
    ) {
      return <View>{(leftIcon as (color: string) => ReactElement)(color)}</View>;
    }

    // Component type
    const Icon = leftIcon as ComponentType<{ color: string; size: number }>;
    return (
      <View>
        <Icon color={color} size={iconSize} />
      </View>
    );
  }

  return (
    <Pressable
      {...props}
      accessibilityLabel={resolvedAccessibilityLabel}
      accessibilityRole={accessibilityRole ?? "button"}
      accessibilityState={accessibilityState}
      disabled={isDisabled}
      onHoverIn={handleHoverIn}
      onHoverOut={handleHoverOut}
      style={pressableStyle}
    >
      {renderIcon()}
      {children != null ? (
        <Text style={resolvedTextStyle} numberOfLines={1} ellipsizeMode="tail">
          {children}
        </Text>
      ) : null}
      {trailing}
    </Pressable>
  );
}
