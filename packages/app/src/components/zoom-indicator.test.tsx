/**
 * @vitest-environment jsdom
 */
import React from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clampZoomLevel,
  ZOOM_INDICATOR_FADE_MS,
  ZOOM_INDICATOR_UNMOUNT_MS,
  ZOOM_LEVEL_MAX,
  ZOOM_LEVEL_MIN,
  ZoomIndicator,
  zoomLevelToPercent,
} from "./zoom-indicator";

afterEach(() => {
  vi.useRealTimers();
});

describe("zoomLevelToPercent", () => {
  it("maps level 0 to 100%", () => {
    expect(zoomLevelToPercent(0)).toBe(100);
  });

  it("maps logarithmic levels to factors of 1.2", () => {
    expect(zoomLevelToPercent(1)).toBe(120);
    expect(zoomLevelToPercent(-1)).toBe(83);
  });
});

describe("clampZoomLevel", () => {
  it("clamps to the supported range and normalizes invalid input", () => {
    expect(clampZoomLevel(0.5)).toBe(0.5);
    expect(clampZoomLevel(99)).toBe(ZOOM_LEVEL_MAX);
    expect(clampZoomLevel(-99)).toBe(ZOOM_LEVEL_MIN);
    expect(clampZoomLevel(Number.NaN)).toBe(0);
  });
});

describe("ZoomIndicator", () => {
  it("stays hidden on the initial frame at 100%", () => {
    render(<ZoomIndicator percent={100} />);
    expect(screen.queryByTestId("zoom-indicator")).toBeNull();
  });

  it("stays hidden on mount even when the initial percent is not 100%", () => {
    render(<ZoomIndicator percent={133} />);
    expect(screen.queryByTestId("zoom-indicator")).toBeNull();
  });

  it("appears with the new percentage after a zoom change", () => {
    vi.useFakeTimers();
    const { rerender } = render(<ZoomIndicator percent={100} />);
    rerender(<ZoomIndicator percent={110} />);
    expect(screen.getByTestId("zoom-indicator").textContent).toBe("110%");
  });

  it("unmounts after the fade timeout", () => {
    vi.useFakeTimers();
    const { rerender } = render(<ZoomIndicator percent={100} />);
    rerender(<ZoomIndicator percent={110} />);
    expect(screen.getByTestId("zoom-indicator")).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(ZOOM_INDICATOR_FADE_MS + ZOOM_INDICATOR_UNMOUNT_MS + 1);
    });
    expect(screen.queryByTestId("zoom-indicator")).toBeNull();
  });

  it("shows the indicator again when the zoom resets to 100%", () => {
    vi.useFakeTimers();
    const { rerender } = render(<ZoomIndicator percent={100} />);
    rerender(<ZoomIndicator percent={110} />);
    rerender(<ZoomIndicator percent={100} />);
    expect(screen.getByTestId("zoom-indicator").textContent).toBe("100%");
  });

  it("restarts the fade window on repeated zoom changes", () => {
    vi.useFakeTimers();
    const { rerender } = render(<ZoomIndicator percent={100} />);
    rerender(<ZoomIndicator percent={110} />);

    act(() => {
      vi.advanceTimersByTime(ZOOM_INDICATOR_FADE_MS - 100);
    });
    rerender(<ZoomIndicator percent={120} />);
    expect(screen.getByTestId("zoom-indicator").textContent).toBe("120%");

    act(() => {
      vi.advanceTimersByTime(ZOOM_INDICATOR_FADE_MS - 100);
    });
    expect(screen.getByTestId("zoom-indicator")).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(100 + ZOOM_INDICATOR_UNMOUNT_MS + 1);
    });
    expect(screen.queryByTestId("zoom-indicator")).toBeNull();
  });
});
