/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  prefersReducedMotion,
  readRestingFlipRect,
  resetRestingFlipAnimationForTests,
  runRestingFlipTransition,
} from "./resting-transition";

afterEach(() => {
  resetRestingFlipAnimationForTests();
});

describe("readRestingFlipRect", () => {
  it("reads bounding client rect fields", () => {
    const el = document.createElement("div");
    el.getBoundingClientRect = () =>
      ({
        top: 10,
        left: 20,
        width: 300,
        height: 100,
        bottom: 110,
        right: 320,
        x: 20,
        y: 10,
        toJSON: () => ({}),
      }) as DOMRect;
    expect(readRestingFlipRect(el)).toEqual({
      top: 10,
      left: 20,
      width: 300,
      height: 100,
    });
  });
});

describe("runRestingFlipTransition", () => {
  it("skips animation when prefers-reduced-motion is set", () => {
    const el = document.createElement("div");
    const animate = vi.fn();
    let mutated = false;
    runRestingFlipTransition(
      el,
      () => {
        mutated = true;
      },
      { prefersReducedMotion: true, animate },
    );
    expect(mutated).toBe(true);
    expect(animate).not.toHaveBeenCalled();
  });

  it("animates scaleY when height changes", () => {
    const el = document.createElement("div");
    let height = 120;
    el.getBoundingClientRect = () =>
      ({
        top: 0,
        left: 0,
        width: 400,
        height,
        bottom: height,
        right: 400,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    const animate = vi.fn(() => ({
      cancel: () => undefined,
      finished: Promise.resolve(),
    }));
    runRestingFlipTransition(
      el,
      () => {
        height = 48;
      },
      { prefersReducedMotion: false, animate },
    );
    expect(animate).toHaveBeenCalledTimes(1);
    const firstCall = animate.mock.calls[0] as unknown as [
      Element,
      Keyframe[],
      KeyframeAnimationOptions,
    ];
    expect(firstCall[1][0]?.transform).toContain("scaleY");
  });

  it("cancels a prior animation on interrupt", () => {
    const el = document.createElement("div");
    let height = 120;
    el.getBoundingClientRect = () =>
      ({
        top: 0,
        left: 0,
        width: 400,
        height,
        bottom: height,
        right: 400,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    const cancel = vi.fn();
    const animate = vi.fn(() => ({
      cancel,
      finished: new Promise<void>(() => undefined),
    }));
    runRestingFlipTransition(
      el,
      () => {
        height = 48;
      },
      { prefersReducedMotion: false, animate },
    );
    runRestingFlipTransition(
      el,
      () => {
        height = 120;
      },
      { prefersReducedMotion: false, animate },
    );
    expect(cancel).toHaveBeenCalled();
    expect(animate).toHaveBeenCalledTimes(2);
  });
});

describe("prefersReducedMotion", () => {
  it("returns a boolean from matchMedia when available", () => {
    expect(typeof prefersReducedMotion()).toBe("boolean");
  });
});
