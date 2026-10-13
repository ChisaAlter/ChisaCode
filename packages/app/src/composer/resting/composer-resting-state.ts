/**
 * Pure resting-layout state (T3 port M15).
 *
 * Unified collapse dimensions:
 * - `scrollCollapsed` (M8 wheel-fold) wins when reading history
 * - `resting` applies when the stream has content, the composer is blurred,
 *   single-line, attachment-free, and not scroll-collapsed
 */

export type ComposerLayoutMode = "expanded" | "resting" | "scrollCollapsed";

export interface ComposerRestingInput {
  timelineHasContent: boolean;
  isFocused: boolean;
  isMultiline: boolean;
  hasAttachments: boolean;
  scrollCollapsed: boolean;
  /** Soft Home /new draft composers never rest. */
  enabled?: boolean;
}

/**
 * Derives whether the composer should enter the resting layout.
 * Scroll-collapse and resting are mutually exclusive: scroll wins.
 */
export function deriveIsComposerResting(input: ComposerRestingInput): boolean {
  if (input.enabled === false) {
    return false;
  }
  if (input.scrollCollapsed) {
    return false;
  }
  return (
    input.timelineHasContent && !input.isFocused && !input.isMultiline && !input.hasAttachments
  );
}

/**
 * Resolves the single layout mode for the composer chrome.
 */
export function resolveComposerLayoutMode(input: ComposerRestingInput): ComposerLayoutMode {
  if (input.scrollCollapsed) {
    return "scrollCollapsed";
  }
  if (deriveIsComposerResting(input)) {
    return "resting";
  }
  return "expanded";
}

/** True when the card should use the collapsed chrome (resting or scroll). */
export function isComposerLayoutCollapsed(mode: ComposerLayoutMode): boolean {
  return mode !== "expanded";
}
