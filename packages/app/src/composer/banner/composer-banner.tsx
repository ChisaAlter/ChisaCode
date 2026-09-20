import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react-native";
import { type ReactNode, useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { ICON_SIZE, type Theme } from "@/styles/theme";
import type {
  ComposerBannerActionDescriptor,
  ComposerBannerDensity,
  ComposerBannerDescriptor,
  ComposerBannerVariant,
  ComposerBannerWidth,
} from "./composer-banner-logic";

export interface ComposerBannerRootProps {
  variant?: ComposerBannerVariant;
  density?: ComposerBannerDensity;
  width?: ComposerBannerWidth;
  /**
   * Attached seam: squares the bottom edge and drops its bottom border so the
   * banner fuses with the composer card into one continuous surface.
   */
  attached?: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export interface ComposerBannerIconProps {
  variant?: ComposerBannerVariant;
  /** Overrides the variant's default icon. */
  children?: ReactNode;
}

export interface ComposerBannerActionProps extends ComposerBannerActionDescriptor {
  variant?: ComposerBannerVariant;
}

export interface ComposerBannerDismissProps {
  onPress: () => void;
  accessibilityLabel: string;
  testID?: string;
}

const ThemedInfo = withUnistyles(Info);
const ThemedCheckCircle2 = withUnistyles(CheckCircle2);
const ThemedAlertTriangle = withUnistyles(AlertTriangle);
const ThemedXCircle = withUnistyles(XCircle);
const ThemedX = withUnistyles(X);

const infoIconMapping = (theme: Theme) => ({ color: theme.colors.statusInfo });
const successIconMapping = (theme: Theme) => ({ color: theme.colors.statusSuccess });
const warningIconMapping = (theme: Theme) => ({ color: theme.colors.statusWarning });
const errorIconMapping = (theme: Theme) => ({ color: theme.colors.statusDanger });
const neutralIconMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

const VARIANT_ICON = {
  default: ThemedInfo,
  info: ThemedInfo,
  success: ThemedCheckCircle2,
  warning: ThemedAlertTriangle,
  error: ThemedXCircle,
} as const;

function resolveIconMapping(variant: ComposerBannerVariant) {
  if (variant === "info") return infoIconMapping;
  if (variant === "success") return successIconMapping;
  if (variant === "warning") return warningIconMapping;
  if (variant === "error") return errorIconMapping;
  return neutralIconMapping;
}

/**
 * Tone styles own colors only — no border widths or radii — so they never
 * collide with the geometry styles in the same style array. Unistyles on web
 * compiles each style to an atomic class, so overlapping properties across
 * styles would resolve by stylesheet order rather than array order.
 */
function resolveToneStyle(variant: ComposerBannerVariant) {
  if (variant === "error") return styles.toneError;
  if (variant === "warning") return styles.toneWarning;
  if (variant === "success") return styles.toneSuccess;
  if (variant === "info") return styles.toneInfo;
  if (variant === "activity") return styles.toneInfo;
  return styles.toneNeutral;
}

/** Geometry styles own every border width and radius, so the set is complete. */
function resolveGeometryStyle(attached: boolean, density: ComposerBannerDensity) {
  if (attached) {
    return density === "compact" ? styles.geometryAttachedCompact : styles.geometryAttached;
  }
  return density === "compact" ? styles.geometryCompact : styles.geometry;
}

function resolveActionToneStyle(variant: ComposerBannerVariant, tone: "neutral" | "signal") {
  if (tone === "neutral") return styles.actionNeutral;
  if (variant === "error") return styles.actionError;
  if (variant === "warning") return styles.actionWarning;
  return styles.actionSignal;
}

/**
 * Banner surface for the composer stack (T3 port M7). Compound primitive:
 * compose `ComposerBannerIcon`, `ComposerBannerContent`, and
 * `ComposerBannerActions` inside it, or render a descriptor with
 * `ComposerBannerItem`.
 */
export function ComposerBannerRoot({
  variant = "default",
  density = "default",
  width = "full",
  attached = false,
  children,
  style,
  testID,
}: ComposerBannerRootProps) {
  const isSignal = variant === "error" || variant === "warning";
  const containerStyle = useMemo(
    () => [
      styles.root,
      density === "compact" && styles.rootCompact,
      width === "content" && styles.rootWidthContent,
      resolveGeometryStyle(attached, density),
      resolveToneStyle(variant),
      style,
    ],
    [attached, density, style, variant, width],
  );
  return (
    <View
      style={containerStyle}
      testID={testID}
      accessibilityRole={isSignal ? "alert" : undefined}
      accessibilityLiveRegion={isSignal ? "polite" : undefined}
    >
      {children}
    </View>
  );
}

/** Variant-tinted leading icon; `activity` renders a spinner instead. */
export function ComposerBannerIcon({ variant = "default", children }: ComposerBannerIconProps) {
  const slotStyle = useMemo(
    () => [styles.iconSlot, variant === "activity" && styles.iconSlotActivity],
    [variant],
  );
  if (children !== undefined) {
    return <View style={slotStyle}>{children}</View>;
  }
  if (variant === "activity") {
    return (
      <View style={slotStyle}>
        <ActivityIndicator size="small" />
      </View>
    );
  }
  const Icon = VARIANT_ICON[variant];
  return (
    <View style={slotStyle}>
      <Icon size={ICON_SIZE.md} uniProps={resolveIconMapping(variant)} />
    </View>
  );
}

export function ComposerBannerContent({
  children,
  density = "default",
}: {
  children: ReactNode;
  density?: ComposerBannerDensity;
}) {
  const containerStyle = useMemo(
    () => [styles.content, density === "compact" && styles.contentCompact],
    [density],
  );
  return <View style={containerStyle}>{children}</View>;
}

export function ComposerBannerTitle({
  children,
  numberOfLines,
}: {
  children: ReactNode;
  numberOfLines?: number;
}) {
  return (
    <Text style={styles.title} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}

export function ComposerBannerBody({
  children,
  numberOfLines,
}: {
  children: ReactNode;
  numberOfLines?: number;
}) {
  return (
    <Text style={styles.body} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}

export function ComposerBannerActions({ children }: { children: ReactNode }) {
  return <View style={styles.actions}>{children}</View>;
}

/** Inline banner action; `tone="signal"` paints it in the variant's color. */
export function ComposerBannerAction({
  label,
  onPress,
  tone = "neutral",
  variant = "default",
  testID,
}: ComposerBannerActionProps) {
  const handlePress = useCallback(() => {
    onPress();
  }, [onPress]);
  const resolveStyle = useCallback(
    ({ hovered }: { pressed: boolean; hovered?: boolean }) => [
      styles.action,
      Boolean(hovered) && styles.actionHovered,
    ],
    [],
  );
  const labelStyle = useMemo(
    () => [styles.actionLabel, resolveActionToneStyle(variant, tone)],
    [tone, variant],
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={handlePress}
      style={resolveStyle}
      testID={testID}
    >
      <Text style={labelStyle}>{label}</Text>
    </Pressable>
  );
}

export function ComposerBannerDismiss({
  onPress,
  accessibilityLabel,
  testID,
}: ComposerBannerDismissProps) {
  const handlePress = useCallback(() => {
    onPress();
  }, [onPress]);
  const resolveStyle = useCallback(
    ({ hovered }: { pressed: boolean; hovered?: boolean }) => [
      styles.dismiss,
      Boolean(hovered) && styles.dismissHovered,
    ],
    [],
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={6}
      onPress={handlePress}
      style={resolveStyle}
      testID={testID}
    >
      <ThemedX size={ICON_SIZE.sm} uniProps={neutralIconMapping} />
    </Pressable>
  );
}

export interface ComposerBannerItemProps {
  banner: ComposerBannerDescriptor;
  attached?: boolean;
  onDismiss?: (banner: ComposerBannerDescriptor) => void;
  dismissAccessibilityLabel: string;
  /** Rendered between the actions and the dismiss button (e.g. a peek chip). */
  trailingSlot?: ReactNode;
}

/**
 * Renders a banner descriptor with the standard icon, content, actions, and
 * dismiss affordances. Used by the stack and available for standalone previews.
 */
export function ComposerBannerItem({
  banner,
  attached = false,
  onDismiss,
  dismissAccessibilityLabel,
  trailingSlot,
}: ComposerBannerItemProps) {
  const density = banner.density ?? "default";
  const isCompact = density === "compact";
  const dismissible = banner.dismissible !== false;
  const handleDismiss = useCallback(() => {
    onDismiss?.(banner);
  }, [banner, onDismiss]);
  const bodyNode = useMemo(() => {
    if (banner.bodySlot) {
      return banner.bodySlot;
    }
    if (!banner.body) {
      return null;
    }
    return <ComposerBannerBody numberOfLines={isCompact ? 1 : 2}>{banner.body}</ComposerBannerBody>;
  }, [banner.body, banner.bodySlot, isCompact]);
  return (
    <ComposerBannerRoot
      variant={banner.variant}
      density={density}
      width={banner.width ?? "full"}
      attached={attached}
      testID={banner.testID}
    >
      <ComposerBannerIcon variant={banner.variant} />
      <ComposerBannerContent density={density}>
        <ComposerBannerTitle numberOfLines={isCompact ? 1 : undefined}>
          {banner.title}
        </ComposerBannerTitle>
        {bodyNode}
      </ComposerBannerContent>
      {banner.actions?.length ? (
        <ComposerBannerActions>
          {banner.actions.map((action) => (
            <ComposerBannerAction key={action.label} {...action} variant={banner.variant} />
          ))}
        </ComposerBannerActions>
      ) : null}
      {trailingSlot}
      {dismissible && onDismiss ? (
        <ComposerBannerDismiss
          onPress={handleDismiss}
          accessibilityLabel={dismissAccessibilityLabel}
          testID={banner.testID ? `${banner.testID}-dismiss` : undefined}
        />
      ) : null}
    </ComposerBannerRoot>
  );
}

/** Compound export mirroring the T3 `ComposerBanner` namespace. */
export const ComposerBanner = {
  Root: ComposerBannerRoot,
  Icon: ComposerBannerIcon,
  Content: ComposerBannerContent,
  Title: ComposerBannerTitle,
  Body: ComposerBannerBody,
  Actions: ComposerBannerActions,
  Action: ComposerBannerAction,
  Dismiss: ComposerBannerDismiss,
  Item: ComposerBannerItem,
} as const;

const styles = StyleSheet.create((theme: Theme) => ({
  // Layout only: geometry and tone live in their own disjoint styles.
  root: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    paddingTop: 9,
    paddingBottom: 9,
    paddingLeft: 12,
    paddingRight: 8,
  },
  rootCompact: {
    alignItems: "center",
    paddingTop: 5,
    paddingBottom: 5,
    paddingLeft: 10,
  },
  rootWidthContent: {
    maxWidth: 480,
  },
  // Geometry: every border width and corner radius, per state, so no property
  // is declared twice across the style array.
  geometry: {
    borderTopWidth: theme.borderWidth[1],
    borderRightWidth: theme.borderWidth[1],
    borderBottomWidth: theme.borderWidth[1],
    borderLeftWidth: theme.borderWidth[1],
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
  geometryCompact: {
    borderTopWidth: theme.borderWidth[1],
    borderRightWidth: theme.borderWidth[1],
    borderBottomWidth: theme.borderWidth[1],
    borderLeftWidth: theme.borderWidth[1],
    borderTopLeftRadius: 9,
    borderTopRightRadius: 9,
    borderBottomLeftRadius: 9,
    borderBottomRightRadius: 9,
  },
  geometryAttached: {
    borderTopWidth: theme.borderWidth[1],
    borderRightWidth: theme.borderWidth[1],
    borderBottomWidth: 0,
    borderLeftWidth: theme.borderWidth[1],
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  geometryAttachedCompact: {
    borderTopWidth: theme.borderWidth[1],
    borderRightWidth: theme.borderWidth[1],
    borderBottomWidth: 0,
    borderLeftWidth: theme.borderWidth[1],
    borderTopLeftRadius: 9,
    borderTopRightRadius: 9,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  // Tone: colors only. Baked `*Bg` tokens carry their own alpha because
  // Unistyles web exposes theme colors as CSS variables, which cannot be
  // alpha-adjusted by string manipulation at runtime.
  toneNeutral: {
    backgroundColor: theme.colors.surface1,
    borderColor: theme.colors.border,
  },
  toneInfo: {
    backgroundColor: theme.colors.statusInfoBg,
    borderColor: theme.colors.statusInfo,
  },
  toneSuccess: {
    backgroundColor: theme.colors.statusSuccessBg,
    borderColor: theme.colors.statusSuccess,
  },
  toneWarning: {
    backgroundColor: theme.colors.statusWarningBg,
    borderColor: theme.colors.statusWarning,
  },
  toneError: {
    backgroundColor: theme.colors.statusDangerBg,
    borderColor: theme.colors.statusDanger,
  },
  iconSlot: {
    paddingTop: 1,
  },
  iconSlotActivity: {
    paddingTop: 2,
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  contentCompact: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 7,
  },
  title: {
    color: theme.colors.foreground,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: theme.fontWeight.medium,
  },
  body: {
    marginTop: 1,
    color: theme.colors.foregroundMuted,
    fontSize: 12.5,
    lineHeight: 17,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: 2,
  },
  action: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  actionHovered: {
    backgroundColor: theme.colors.surface1,
  },
  actionLabel: {
    fontSize: 12.5,
    lineHeight: 16,
    fontWeight: theme.fontWeight.medium,
  },
  actionNeutral: {
    color: theme.colors.accent,
  },
  actionSignal: {
    color: theme.colors.accent,
  },
  actionError: {
    color: theme.colors.statusDanger,
  },
  actionWarning: {
    color: theme.colors.statusWarning,
  },
  dismiss: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
  },
  dismissHovered: {
    backgroundColor: theme.colors.surface1,
  },
}));
