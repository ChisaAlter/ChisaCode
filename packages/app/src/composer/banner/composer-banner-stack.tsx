import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { isWeb } from "@/constants/platform";
import { ComposerBannerItem } from "./composer-banner";
import {
  buildComposerBannerDismissalKey,
  composerBannerDismissals,
  resolveComposerBannerStack,
  type ComposerBannerDescriptor,
} from "./composer-banner-logic";

/** Hover intent before the peek row opens, so a cursor passing over does not flash it. */
const HOVER_INTENT_MS = 120;
/** Enter/exit duration shared with the prototype spec. */
const BANNER_ANIMATION_MS = 220;

export interface ComposerBannerStackProps {
  banners: readonly ComposerBannerDescriptor[];
  /** Stable thread identity (server + agent) for dismissal scoping. */
  threadKey: string;
  /** Custom content pinned above the stack (user-input / approval panels). */
  slot?: ReactNode;
  /** Reports whether a banner is currently attached, so the card can square its top edge. */
  onAttachedChange?: (attached: boolean) => void;
  testID?: string;
}

interface BannerMotionProps {
  banner: ComposerBannerDescriptor;
  attached: boolean;
  leaving: boolean;
  dismissAccessibilityLabel: string;
  trailingSlot?: ReactNode;
  onRequestDismiss: (banner: ComposerBannerDescriptor) => void;
}

/**
 * Enter/exit motion for one banner. Reanimated's `exiting` keeps a removed view
 * mounted on web and its animation callbacks are not reliable there, so the
 * fade is visual only and the dismissal commit is driven by a timer in the
 * stack.
 */
function BannerMotion({
  banner,
  attached,
  leaving,
  dismissAccessibilityLabel,
  trailingSlot,
  onRequestDismiss,
}: BannerMotionProps) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(1, { duration: BANNER_ANIMATION_MS });
  }, [progress]);
  useEffect(() => {
    if (!leaving) {
      return;
    }
    progress.value = withTiming(0, { duration: BANNER_ANIMATION_MS });
  }, [leaving, progress]);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * -6 }],
  }));
  return (
    <Animated.View style={animatedStyle}>
      <ComposerBannerItem
        banner={banner}
        attached={attached}
        onDismiss={onRequestDismiss}
        dismissAccessibilityLabel={dismissAccessibilityLabel}
        trailingSlot={trailingSlot}
      />
    </Animated.View>
  );
}

/**
 * Priority-ordered composer banner stack (T3 port M7).
 *
 * The highest-layer banner attaches to the composer card; the rest collapse
 * behind a peek chip that opens on hover (web, 120ms intent) or tap, pins on
 * click, and closes on Escape. Dismissals are remembered per thread+message in
 * a session-scoped store, so the same error stays gone while a different one
 * still surfaces.
 */
export function ComposerBannerStack({
  banners,
  threadKey,
  slot,
  onAttachedChange,
  testID = "composer-banner-stack",
}: ComposerBannerStackProps) {
  const { t } = useTranslation();
  const [pinned, setPinned] = useState(false);
  const [hoverOpen, setHoverOpen] = useState(false);
  const [leavingId, setLeavingId] = useState<string | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dismissals live in a module store so they survive panel remounts, but the
  // stack renders from React state synced to that store: a plain Set as the
  // resolver input keeps the filter and the render in lockstep.
  const [dismissedKeys, setDismissedKeys] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    const sync = () => {
      const next = new Set<string>();
      for (const banner of banners) {
        const message = banner.message ?? banner.title;
        const key = buildComposerBannerDismissalKey(threadKey, message);
        if (composerBannerDismissals.has(key)) {
          next.add(key);
        }
      }
      setDismissedKeys(next);
    };
    sync();
    return composerBannerDismissals.subscribe(sync);
  }, [banners, threadKey]);

  const resolved = resolveComposerBannerStack({
    banners,
    threadKey,
    dismissed: dismissedKeys,
  });
  const expanded = (pinned || hoverOpen) && resolved.peeks.length > 0;
  const compactPeeks = useMemo(
    () => resolved.peeks.map((banner) => ({ ...banner, density: "compact" as const })),
    [resolved.peeks],
  );

  const clearHoverTimer = useCallback(() => {
    if (hoverTimerRef.current !== null) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearHoverTimer, [clearHoverTimer]);

  useEffect(
    () => () => {
      if (dismissTimerRef.current !== null) {
        clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    if (resolved.peeks.length === 0) {
      setPinned(false);
      setHoverOpen(false);
    }
  }, [resolved.peeks.length]);

  const hasAttached = resolved.attached !== null;
  useEffect(() => {
    onAttachedChange?.(hasAttached);
  }, [hasAttached, onAttachedChange]);

  useEffect(() => {
    if (!isWeb || !expanded) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      setPinned(false);
      setHoverOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [expanded]);

  const handleHoverIn = useCallback(() => {
    if (!isWeb) {
      return;
    }
    clearHoverTimer();
    hoverTimerRef.current = setTimeout(() => {
      setHoverOpen(true);
    }, HOVER_INTENT_MS);
  }, [clearHoverTimer]);

  const handleHoverOut = useCallback(() => {
    if (!isWeb) {
      return;
    }
    clearHoverTimer();
    setHoverOpen(false);
  }, [clearHoverTimer]);

  const handleToggle = useCallback(() => {
    setPinned((value) => !value);
  }, []);

  const handleRequestDismiss = useCallback(
    (banner: ComposerBannerDescriptor) => {
      setLeavingId((current) => {
        if (current !== null) {
          return current;
        }
        // Commit after the exit duration; the fade itself is visual only so a
        // missing animation callback can never strand a dismissed banner.
        dismissTimerRef.current = setTimeout(() => {
          dismissTimerRef.current = null;
          const message = banner.message ?? banner.title;
          composerBannerDismissals.dismiss(buildComposerBannerDismissalKey(threadKey, message));
          setLeavingId(null);
        }, BANNER_ANIMATION_MS);
        return banner.id;
      });
    },
    [threadKey],
  );

  const resolvePeekStyle = useCallback(
    ({ hovered }: { pressed: boolean; hovered?: boolean }) => [
      styles.peekChip,
      Boolean(hovered) && styles.peekChipHovered,
    ],
    [],
  );

  const dismissLabel = t("composer.banner.dismiss");
  const peekCount = resolved.peeks.length;
  const peekAccessibilityState = useMemo(() => ({ expanded }), [expanded]);
  const peekAccessibilityLabel = expanded
    ? t("composer.banner.collapse")
    : t("composer.banner.expand");
  const peekLabel = t("composer.banner.peekMore", { count: peekCount });
  const peekChip = useMemo(() => {
    if (peekCount === 0) {
      return null;
    }
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={peekAccessibilityLabel}
        accessibilityState={peekAccessibilityState}
        onBlur={handleHoverOut}
        onFocus={handleHoverIn}
        onHoverIn={handleHoverIn}
        onHoverOut={handleHoverOut}
        onPress={handleToggle}
        style={resolvePeekStyle}
        testID="composer-banner-peek"
      >
        <Text style={styles.peekLabel}>{peekLabel}</Text>
      </Pressable>
    );
  }, [
    handleHoverIn,
    handleHoverOut,
    handleToggle,
    peekAccessibilityLabel,
    peekAccessibilityState,
    peekCount,
    peekLabel,
    resolvePeekStyle,
  ]);

  return (
    <View style={styles.container} testID={testID}>
      {slot ? <View style={styles.slot}>{slot}</View> : null}
      {expanded ? (
        <View style={styles.expandedList} testID="composer-banner-peek-list">
          {compactPeeks.map((banner) => (
            <BannerMotion
              key={banner.id}
              banner={banner}
              attached={false}
              leaving={leavingId === banner.id}
              dismissAccessibilityLabel={dismissLabel}
              onRequestDismiss={handleRequestDismiss}
            />
          ))}
        </View>
      ) : null}
      {resolved.attached ? (
        <BannerMotion
          key={resolved.attached.id}
          banner={resolved.attached}
          attached
          leaving={leavingId === resolved.attached.id}
          dismissAccessibilityLabel={dismissLabel}
          trailingSlot={peekChip}
          onRequestDismiss={handleRequestDismiss}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    width: "100%",
    gap: theme.spacing[2],
  },
  slot: {
    width: "100%",
  },
  expandedList: {
    width: "100%",
    gap: 6,
  },
  peekChip: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
    alignSelf: "flex-start",
  },
  peekChipHovered: {
    backgroundColor: theme.colors.surface1,
  },
  peekLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: theme.fontWeight.medium,
  },
}));
