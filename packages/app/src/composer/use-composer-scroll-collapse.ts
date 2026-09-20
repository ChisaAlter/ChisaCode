import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isWeb } from "@/constants/platform";
import {
  createComposerScrollGestureState,
  expandComposerScrollGesture,
  noteComposerScrollInput,
  recordComposerScrollGestureEvent,
} from "./input/composer-scroll-gesture";

/** The agent-stream scroll container (web DOM element). */
const STREAM_SCROLL_SELECTOR = '[data-testid="agent-chat-scroll"]';

export interface UseComposerScrollCollapseOptions {
  /** Whether the stream is currently pinned to the bottom (follow output). */
  isNearBottom: boolean;
  /** Disabled outside web/Electron. */
  enabled?: boolean;
}

export interface ComposerScrollCollapseResult {
  collapsed: boolean;
  /** Call on every keyboard input so an active typing session suppresses collapse. */
  noteInput: () => void;
  /** Expands the composer (focus, pointer-down, scroll-return-to-bottom). */
  expand: () => void;
}

function findStreamScrollContainer(): HTMLElement | null {
  return document.querySelector<HTMLElement>(STREAM_SCROLL_SELECTOR);
}

/**
 * Scroll-collapse for the composer (T3 port M8, web/Electron only).
 *
 * Accumulated upward wheel on the stream container past 24px collapses the
 * composer; downward wheel, keyboard input within 120ms, or the stream
 * returning to bottom expands it again.
 * @param options Bottom state and enable flag
 * @returns The collapsed flag plus input-note and expand callbacks
 */
export function useComposerScrollCollapse(
  options: UseComposerScrollCollapseOptions,
): ComposerScrollCollapseResult {
  const { isNearBottom, enabled = true } = options;
  const [collapsed, setCollapsed] = useState(false);
  const gestureRef = useRef(createComposerScrollGestureState());
  const collapsedRef = useRef(false);

  const setCollapsedState = useCallback((value: boolean) => {
    collapsedRef.current = value;
    setCollapsed(value);
  }, []);

  const expand = useCallback(() => {
    expandComposerScrollGesture(gestureRef.current);
    setCollapsedState(false);
  }, [setCollapsedState]);

  const noteInput = useCallback(() => {
    noteComposerScrollInput(gestureRef.current, performance.now());
  }, []);

  // Stream returning to bottom always expands.
  useEffect(() => {
    if (isNearBottom && collapsedRef.current) {
      expand();
    }
  }, [expand, isNearBottom]);

  useEffect(() => {
    if (!enabled || !isWeb) {
      return;
    }
    const handleWheel = (event: WheelEvent) => {
      const scrollContainer = findStreamScrollContainer();
      if (!scrollContainer) {
        return;
      }
      const atEnd =
        scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight <=
        8;
      const result = recordComposerScrollGestureEvent(gestureRef.current, {
        deltaPx: event.deltaY,
        towardEnd: event.deltaY > 0,
        atEnd,
        now: performance.now(),
      });
      if (result.collapsed !== collapsedRef.current) {
        setCollapsedState(result.collapsed);
      }
    };
    window.addEventListener("wheel", handleWheel, { passive: true });
    return () => window.removeEventListener("wheel", handleWheel);
  }, [enabled, setCollapsedState]);

  return useMemo(() => ({ collapsed, noteInput, expand }), [collapsed, expand, noteInput]);
}
