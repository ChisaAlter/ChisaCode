/**
 * Threshold of upward scroll (px) accumulated before the composer collapses.
 */
export const SCROLL_COLLAPSE_THRESHOLD_PX = 24;

/**
 * Keyboard input inside this window suppresses collapsing, so an active
 * typing session never folds the composer away.
 */
export const SCROLL_COLLAPSE_INPUT_SUPPRESS_MS = 120;

export interface ComposerScrollGestureState {
  /** Upward px accumulated since the last reset (toward-end event or collapse). */
  accumulatedDeltaPx: number;
  /** Whether the composer should currently be collapsed. */
  collapsed: boolean;
  /** Timestamp (ms) of the last keyboard input, for the suppress window. */
  lastInputAt: number;
}

export function createComposerScrollGestureState(): ComposerScrollGestureState {
  return { accumulatedDeltaPx: 0, collapsed: false, lastInputAt: 0 };
}

export interface ComposerScrollGestureEvent {
  /** Wheel delta magnitude in px (absolute value is taken internally). */
  deltaPx: number;
  /** Whether the scroll moves toward the logical end (downward). */
  towardEnd: boolean;
  /** Whether the scroll container is currently at its bottom edge. */
  atEnd: boolean;
  /** Current time in ms (same clock as {@link noteComposerScrollInput}). */
  now: number;
}

export interface ComposerScrollGestureResult {
  state: ComposerScrollGestureState;
  /** Whether this event collapsed the composer (edge transition). */
  collapsed: boolean;
  /** Whether this event expanded a previously collapsed composer. */
  expanded: boolean;
}

/**
 * Folds one wheel event into the gesture state (prototype section 3 rules):
 * a toward-end event resets accumulation and expands; an upward event within
 * the input-suppress window resets accumulation without collapsing; upward
 * accumulation reaching the threshold collapses and resets the accumulator.
 * @param state Mutable gesture state (mutated in place)
 * @param event The wheel event to fold in
 * @returns The mutated state and whether the collapse edge fired
 */
export function recordComposerScrollGestureEvent(
  state: ComposerScrollGestureState,
  event: ComposerScrollGestureEvent,
): ComposerScrollGestureResult {
  if (event.towardEnd) {
    state.accumulatedDeltaPx = 0;
    const expanded = state.collapsed;
    state.collapsed = false;
    return { state, collapsed: false, expanded };
  }
  if (event.atEnd) {
    // At the bottom there is no history above to read; upward flicks there
    // are rubber-band noise, not a reading intent.
    state.accumulatedDeltaPx = 0;
    return { state, collapsed: false, expanded: false };
  }
  if (event.now - state.lastInputAt < SCROLL_COLLAPSE_INPUT_SUPPRESS_MS) {
    state.accumulatedDeltaPx = 0;
    return { state, collapsed: false, expanded: false };
  }
  state.accumulatedDeltaPx += Math.abs(event.deltaPx);
  if (state.accumulatedDeltaPx >= SCROLL_COLLAPSE_THRESHOLD_PX) {
    state.accumulatedDeltaPx = 0;
    state.collapsed = true;
    return { state, collapsed: true, expanded: false };
  }
  return { state, collapsed: false, expanded: false };
}

/**
 * Records keyboard input so an active typing session suppresses collapse.
 * @param state Mutable gesture state (mutated in place)
 * @param now Current time in ms
 */
export function noteComposerScrollInput(state: ComposerScrollGestureState, now: number): void {
  state.lastInputAt = now;
}

/**
 * Expands the composer and clears accumulation (focus, pointer-down,
 * scroll-return-to-bottom).
 * @param state Mutable gesture state (mutated in place)
 */
export function expandComposerScrollGesture(state: ComposerScrollGestureState): void {
  state.accumulatedDeltaPx = 0;
  state.collapsed = false;
}
