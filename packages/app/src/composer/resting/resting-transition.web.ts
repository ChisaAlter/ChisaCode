/**
 * FLIP transition helper for the resting composer chrome (T3 port M15, web).
 * Measures first/last geometry, plays a short transform animation, and
 * supports interrupt + prefers-reduced-motion instant jump.
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
  /** Injected for tests / reduced-motion override. */
  prefersReducedMotion?: boolean;
  /** Web Animations API — injectable for tests. */
  animate?: (
    element: Element,
    keyframes: Keyframe[],
    options: KeyframeAnimationOptions,
  ) => Animation | { cancel: () => void; finished: Promise<void> };
}

const DEFAULT_DURATION_MS = 260;
const DEFAULT_EASING = "cubic-bezier(0.32, 0.72, 0.35, 1)";

let activeAnimation: { cancel: () => void } | null = null;

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function readRestingFlipRect(element: Element): RestingFlipRect {
  const rect = element.getBoundingClientRect();
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

/**
 * Runs a FLIP height/opacity transition after `mutate` flips resting state.
 * Cancels any in-flight animation (interruptible redirect).
 */
export function runRestingFlipTransition(
  element: HTMLElement,
  mutate: () => void,
  options: RestingFlipOptions = {},
): void {
  const reduced =
    options.prefersReducedMotion ??
    (typeof window !== "undefined" ? prefersReducedMotion() : false);
  if (reduced) {
    activeAnimation?.cancel();
    activeAnimation = null;
    mutate();
    return;
  }

  const first = readRestingFlipRect(element);
  activeAnimation?.cancel();
  activeAnimation = null;
  mutate();
  const last = readRestingFlipRect(element);

  const heightRatio = last.height > 0 && first.height > 0 ? first.height / last.height : 1;
  if (!Number.isFinite(heightRatio) || Math.abs(heightRatio - 1) < 0.01) {
    return;
  }

  const animate =
    options.animate ??
    ((el: Element, keyframes: Keyframe[], opts: KeyframeAnimationOptions) =>
      el.animate(keyframes, opts));

  const animation = animate(
    element,
    [
      {
        transform: `scaleY(${heightRatio})`,
        transformOrigin: "bottom center",
        opacity: 0.92,
      },
      { transform: "scaleY(1)", transformOrigin: "bottom center", opacity: 1 },
    ],
    {
      duration: options.durationMs ?? DEFAULT_DURATION_MS,
      easing: options.easing ?? DEFAULT_EASING,
      fill: "both",
    },
  );
  activeAnimation = animation;
  void Promise.resolve(animation.finished)
    .catch(() => undefined)
    .then(() => {
      if (activeAnimation === animation) {
        activeAnimation = null;
      }
      return undefined;
    });
}

/** Test helper. */
export function resetRestingFlipAnimationForTests(): void {
  activeAnimation?.cancel();
  activeAnimation = null;
}
