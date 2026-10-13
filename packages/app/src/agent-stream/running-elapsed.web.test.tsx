/**
 * @vitest-environment jsdom
 */
import React from "react";
import { cleanup, render, screen, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  Text: React.forwardRef(function MockText(
    {
      children,
      style,
      testID,
    }: {
      children?: React.ReactNode;
      style?: unknown;
      testID?: string;
    },
    ref: React.Ref<HTMLSpanElement>,
  ) {
    return React.createElement(
      "span",
      { ref, "data-style": JSON.stringify(style), "data-testid": testID },
      children,
    );
  }),
}));

vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: (factory: unknown) => (typeof factory === "function" ? factory({}) : factory),
  },
  withUnistyles: (Component: unknown) => Component,
}));

import { RunningElapsed } from "./running-elapsed.web";

describe("RunningElapsed (web textContent)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-18T00:00:10.000Z"));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("writes the initial label via textContent on the host node", () => {
    render(<RunningElapsed startedAt={new Date("2026-06-18T00:00:00.000Z")} testID="elapsed" />);
    const node = screen.getByTestId("elapsed");
    expect(node.textContent).toBe("10s");
    // No React text children — label is owned by textContent writes.
    expect(node.childElementCount).toBe(0);
  });

  it("updates textContent each second without remounting", () => {
    render(<RunningElapsed startedAt={new Date("2026-06-18T00:00:00.000Z")} testID="elapsed" />);
    const node = screen.getByTestId("elapsed");
    expect(node.textContent).toBe("10s");

    // Fake timers also advance Date.now(); one tick → 11s elapsed.
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(node.textContent).toBe("11s");
    expect(screen.getByTestId("elapsed")).toBe(node);
  });

  it("restarts the ticker when startedAt changes", () => {
    const { rerender } = render(
      <RunningElapsed startedAt={new Date("2026-06-18T00:00:00.000Z")} testID="elapsed" />,
    );
    expect(screen.getByTestId("elapsed").textContent).toBe("10s");

    rerender(<RunningElapsed startedAt={new Date("2026-06-18T00:00:05.000Z")} testID="elapsed" />);
    expect(screen.getByTestId("elapsed").textContent).toBe("5s");
  });

  it("clears the interval on unmount", () => {
    const clearSpy = vi.spyOn(globalThis, "clearInterval");
    const { unmount } = render(
      <RunningElapsed startedAt={new Date("2026-06-18T00:00:00.000Z")} testID="elapsed" />,
    );
    unmount();
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});
