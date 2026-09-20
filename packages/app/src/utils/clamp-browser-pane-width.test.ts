import { describe, expect, it } from "vitest";

import { BROWSER_PANE_MIN_WIDTH, clampBrowserPaneWidth } from "./clamp-browser-pane-width";

describe("clampBrowserPaneWidth", () => {
  it("keeps a width inside the allowed range", () => {
    expect(clampBrowserPaneWidth(500, 1280)).toBe(500);
  });

  it("clamps below the minimum to BROWSER_PANE_MIN_WIDTH", () => {
    expect(clampBrowserPaneWidth(120, 1280)).toBe(BROWSER_PANE_MIN_WIDTH);
  });

  it("clamps above 70% of the viewport", () => {
    expect(clampBrowserPaneWidth(2000, 1000)).toBe(700);
  });

  it("rounds fractional widths deterministically", () => {
    expect(clampBrowserPaneWidth(480.6, 1280)).toBe(481);
  });

  it("keeps the minimum when the viewport is too narrow for it", () => {
    // 0.7 * 400 = 280 < 360 → min wins (panel-first behavior).
    expect(clampBrowserPaneWidth(200, 400)).toBe(BROWSER_PANE_MIN_WIDTH);
    expect(clampBrowserPaneWidth(9999, 400)).toBe(BROWSER_PANE_MIN_WIDTH);
  });

  it("falls back to the minimum on non-finite input", () => {
    expect(clampBrowserPaneWidth(Number.NaN, 1280)).toBe(BROWSER_PANE_MIN_WIDTH);
  });

  it("applies only the minimum when the viewport is unknown", () => {
    expect(clampBrowserPaneWidth(250, 0)).toBe(BROWSER_PANE_MIN_WIDTH);
    expect(clampBrowserPaneWidth(900, 0)).toBe(900);
  });
});
