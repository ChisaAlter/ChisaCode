/**
 * Native stub: resting FLIP is web-only (T3 port M15).
 * Web builds resolve `resting-transition.web.ts`.
 */
export interface RestingFlipRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface RestingFlipOptions {
  durationMs?: number;
  easing?: string;
  prefersReducedMotion?: boolean;
  animate?: (
    element: Element,
    keyframes: Keyframe[],
    options: KeyframeAnimationOptions,
  ) => Animation | { cancel: () => void; finished: Promise<void> };
}

export function prefersReducedMotion(): boolean {
  return false;
}

export function readRestingFlipRect(_element: Element): RestingFlipRect {
  return { top: 0, left: 0, width: 0, height: 0 };
}

export function runRestingFlipTransition(
  _element: HTMLElement,
  mutate: () => void,
  _options?: RestingFlipOptions,
): void {
  mutate();
}

export function resetRestingFlipAnimationForTests(): void {
  // no-op
}
