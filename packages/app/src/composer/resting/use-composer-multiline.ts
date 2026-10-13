import { useCallback, useEffect, useState, type RefObject } from "react";
import { isWeb } from "@/constants/platform";

export interface UseComposerMultilineOptions {
  /** Web textarea / input element ref. */
  elementRef: RefObject<HTMLElement | null>;
  /** Current composer text — triggers remeasure. */
  value: string;
  /** Fallback when DOM measurement is unavailable (native / no ref). */
  fallbackMultiline?: boolean;
}

/**
 * Detects whether the composer text field spans more than one visual line.
 * Web: ResizeObserver + MutationObserver against scrollHeight vs line-height.
 * Native / missing DOM: uses `fallbackMultiline` (typically newline presence).
 */
export function useComposerMultiline(options: UseComposerMultilineOptions): boolean | null {
  const { elementRef, value, fallbackMultiline } = options;
  const [isMultiline, setIsMultiline] = useState<boolean | null>(null);

  const measure = useCallback(() => {
    if (!isWeb) {
      setIsMultiline(fallbackMultiline ?? null);
      return;
    }
    const element = elementRef.current;
    if (!element || typeof window === "undefined") {
      setIsMultiline(fallbackMultiline ?? null);
      return;
    }
    const style = window.getComputedStyle(element);
    const lineHeight = Number.parseFloat(style.lineHeight);
    const paddingTop = Number.parseFloat(style.paddingTop) || 0;
    const paddingBottom = Number.parseFloat(style.paddingBottom) || 0;
    const contentHeight = element.scrollHeight - paddingTop - paddingBottom;
    if (!Number.isFinite(lineHeight) || lineHeight <= 0) {
      setIsMultiline(value.includes("\n"));
      return;
    }
    setIsMultiline(contentHeight > lineHeight * 1.5);
  }, [elementRef, fallbackMultiline, value]);

  useEffect(() => {
    measure();
    if (!isWeb) {
      return;
    }
    const element = elementRef.current;
    if (!element || typeof ResizeObserver === "undefined") {
      return;
    }
    const resizeObserver = new ResizeObserver(() => measure());
    resizeObserver.observe(element);
    const mutationObserver =
      typeof MutationObserver !== "undefined" ? new MutationObserver(() => measure()) : null;
    mutationObserver?.observe(element, {
      characterData: true,
      childList: true,
      subtree: true,
    });
    return () => {
      resizeObserver.disconnect();
      mutationObserver?.disconnect();
    };
  }, [elementRef, measure]);

  return isMultiline;
}

/** Cheap newline heuristic for native / tests. */
export function inferMultilineFromText(value: string): boolean {
  return value.includes("\n");
}
