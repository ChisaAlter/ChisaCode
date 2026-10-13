import { useEffect, useRef, type RefObject } from "react";
import { isWeb } from "@/constants/platform";
import { runRestingFlipTransition } from "./resting-transition";

/**
 * Runs a FLIP transition when the composer collapses/expands (T3 port M15).
 * Extracted from MessageInput to keep that component under the complexity budget.
 */
export function useRestingFlipOnCollapseChange(
  layoutCollapsed: boolean,
  wrapperRef: RefObject<unknown>,
): void {
  const prevCollapsedRef = useRef(layoutCollapsed);
  useEffect(() => {
    if (!isWeb) {
      return;
    }
    const previous = prevCollapsedRef.current;
    prevCollapsedRef.current = layoutCollapsed;
    if (previous === layoutCollapsed) {
      return;
    }
    const node = wrapperRef.current as HTMLElement | null;
    if (!node) {
      return;
    }
    runRestingFlipTransition(node, () => undefined);
  }, [layoutCollapsed, wrapperRef]);
}
