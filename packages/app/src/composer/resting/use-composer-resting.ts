import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  useComposerScrollCollapse,
  type ComposerScrollCollapseResult,
} from "@/composer/use-composer-scroll-collapse";
import {
  isComposerLayoutCollapsed,
  resolveComposerLayoutMode,
  type ComposerLayoutMode,
} from "./composer-resting-state";
import { inferMultilineFromText } from "./use-composer-multiline";
import { runRestingFlipTransition } from "./resting-transition";
import { isWeb } from "@/constants/platform";

export interface UseComposerRestingOptions {
  timelineHasContent: boolean;
  isFocused: boolean;
  /** Optional measured multiline; falls back to newline heuristic on `value`. */
  isMultiline?: boolean | null;
  hasAttachments: boolean;
  /** Soft Home / draft: disable resting. */
  enabled?: boolean;
  /** Draft text for newline fallback. */
  value?: string;
  isNearBottom: boolean;
  /** DOM node to FLIP when mode changes (web). */
  flipTargetRef?: RefObject<HTMLElement | null>;
}

export interface ComposerRestingResult {
  mode: ComposerLayoutMode;
  /** True for resting or scroll-collapsed chrome. */
  layoutCollapsed: boolean;
  isResting: boolean;
  scrollCollapsed: boolean;
  noteInput: () => void;
  expand: () => void;
  /** Report composer focus changes from MessageInput. */
  setFocused: (focused: boolean) => void;
}

/**
 * Unified composer layout state machine (T3 port M15).
 * Absorbs M8 scroll-collapse and derives resting from blur/content/attachments.
 */
export function useComposerResting(options: UseComposerRestingOptions): ComposerRestingResult {
  const {
    timelineHasContent,
    isFocused: isFocusedProp,
    isMultiline: isMultilineProp,
    hasAttachments,
    enabled = true,
    value = "",
    isNearBottom,
    flipTargetRef,
  } = options;

  const [isFocusedLocal, setFocusedLocal] = useState(isFocusedProp);
  useEffect(() => {
    setFocusedLocal(isFocusedProp);
  }, [isFocusedProp]);

  const scrollCollapse: ComposerScrollCollapseResult = useComposerScrollCollapse({
    isNearBottom,
    // Attachments suppress scroll-fold (M8 residual / M15 alignment).
    enabled: enabled && !hasAttachments,
  });

  const isMultiline =
    typeof isMultilineProp === "boolean" ? isMultilineProp : inferMultilineFromText(value);

  const mode = resolveComposerLayoutMode({
    timelineHasContent,
    isFocused: isFocusedLocal,
    isMultiline,
    hasAttachments,
    scrollCollapsed: scrollCollapse.collapsed,
    enabled,
  });

  const prevModeRef = useRef(mode);
  useEffect(() => {
    const previous = prevModeRef.current;
    prevModeRef.current = mode;
    if (previous === mode || !isWeb) {
      return;
    }
    const target = flipTargetRef?.current;
    if (!target) {
      return;
    }
    // FLIP around an already-committed React update: measure after paint via rAF.
    // We invert by briefly forcing the previous visual height is not available,
    // so we animate opacity/scale as a polish pass on the new geometry.
    runRestingFlipTransition(target, () => undefined);
  }, [flipTargetRef, mode]);

  const expand = useCallback(() => {
    scrollCollapse.expand();
    setFocusedLocal(true);
  }, [scrollCollapse]);

  const setFocused = useCallback(
    (focused: boolean) => {
      setFocusedLocal(focused);
      if (focused) {
        scrollCollapse.expand();
      }
    },
    [scrollCollapse],
  );

  return useMemo(
    () => ({
      mode,
      layoutCollapsed: isComposerLayoutCollapsed(mode),
      isResting: mode === "resting",
      scrollCollapsed: scrollCollapse.collapsed,
      noteInput: scrollCollapse.noteInput,
      expand,
      setFocused,
    }),
    [expand, mode, scrollCollapse.collapsed, scrollCollapse.noteInput, setFocused],
  );
}
