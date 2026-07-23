import { describe, expect, it } from "vitest";
import {
  computeWorkspaceTabLayout,
  computeWorkspaceVisibleTabWindow,
  shouldShowMobileWorkspaceTabSwitcher,
} from "@/screens/workspace/workspace-tab-layout";

const metrics = {
  rowHorizontalInset: 0,
  actionsReservedWidth: 120,
  rowPaddingHorizontal: 8,
  tabGap: 4,
  maxTabWidth: 200,
  tabIconWidth: 14,
  tabHorizontalPadding: 12,
  tabContentGap: 4,
  estimatedCharWidth: 7,
  closeButtonWidth: 22,
  minTabWidth: 88,
};

describe("computeWorkspaceTabLayout", () => {
  it("sizes tabs from their labels when there is extra horizontal space", () => {
    const result = computeWorkspaceTabLayout({
      viewportWidth: 1200,
      tabLabelLengths: [8, 10, 7],
      metrics,
    });

    expect(result.closeButtonPolicy).toBe("all");
    expect(result.requiresHorizontalScrollFallback).toBe(false);
    expect(result.items).toHaveLength(3);
    expect(result.items.every((item) => item.showLabel)).toBe(true);
    expect(result.items.map((item) => item.width)).toEqual([120, 134, 113]);
  });

  it("shrinks content-sized tabs proportionally to fit the pane", () => {
    const result = computeWorkspaceTabLayout({
      viewportWidth: 520,
      tabLabelLengths: [24, 12, 8],
      metrics,
    });

    expect(result.closeButtonPolicy).toBe("all");
    expect(result.requiresHorizontalScrollFallback).toBe(false);
    expect(result.items.map((item) => item.width)).toEqual([149, 121, 106]);
    expect(result.items.every((item) => item.showLabel)).toBe(true);
  });

  it("keeps content-sized widths when a split pane has extra space", () => {
    const result = computeWorkspaceTabLayout({
      viewportWidth: 743,
      tabLabelLengths: [8, 8, 8, 8],
      metrics: {
        ...metrics,
        actionsReservedWidth: 44,
        rowPaddingHorizontal: 0,
        tabGap: 0,
      },
    });

    expect(result.closeButtonPolicy).toBe("all");
    expect(result.requiresHorizontalScrollFallback).toBe(false);
    expect(result.items.map((item) => item.width)).toEqual([120, 120, 120, 120]);
  });

  it("uses readable overflow widths instead of collapsing below the source minimum", () => {
    const result = computeWorkspaceTabLayout({
      viewportWidth: 388,
      tabLabelLengths: [14, 14, 14, 14],
      metrics,
    });

    expect(result.closeButtonPolicy).toBe("all");
    expect(result.requiresHorizontalScrollFallback).toBe(true);
    expect(result.items.map((item) => item.width)).toEqual([132, 132, 132, 132]);
    expect(result.items.every((item) => item.showLabel)).toBe(true);
  });

  it("uses readable tab widths instead of icon-only chips in scroll fallback", () => {
    const result = computeWorkspaceTabLayout({
      viewportWidth: 300,
      tabLabelLengths: [14, 14, 14, 14],
      metrics,
    });

    expect(result.closeButtonPolicy).toBe("all");
    expect(result.requiresHorizontalScrollFallback).toBe(true);
    expect(result.items.map((item) => item.width)).toEqual([132, 132, 132, 132]);
    expect(result.items.every((item) => item.showLabel)).toBe(true);
  });

  it("returns empty layout details when there are no tabs", () => {
    const result = computeWorkspaceTabLayout({
      viewportWidth: 1200,
      tabLabelLengths: [],
      metrics,
    });

    expect(result.closeButtonPolicy).toBe("all");
    expect(result.requiresHorizontalScrollFallback).toBe(false);
    expect(result.items).toEqual([]);
  });

  it("keeps the active tab centered in the visible overflow window when many tabs are open", () => {
    const result = computeWorkspaceVisibleTabWindow({
      tabCount: 24,
      activeIndex: 12,
      maxVisibleTabs: 5,
    });

    expect(result).toEqual({
      startIndex: 10,
      endIndex: 15,
      hiddenCount: 19,
    });
  });

  it("clamps the visible overflow window to the start and end of the tab list", () => {
    expect(
      computeWorkspaceVisibleTabWindow({
        tabCount: 24,
        activeIndex: 0,
        maxVisibleTabs: 5,
      }),
    ).toEqual({
      startIndex: 0,
      endIndex: 5,
      hiddenCount: 19,
    });

    expect(
      computeWorkspaceVisibleTabWindow({
        tabCount: 24,
        activeIndex: 23,
        maxVisibleTabs: 5,
      }),
    ).toEqual({
      startIndex: 19,
      endIndex: 24,
      hiddenCount: 19,
    });
  });
});

describe("shouldShowMobileWorkspaceTabSwitcher", () => {
  it("hides the Soft compact tab wall when there are fewer than two tabs", () => {
    expect(shouldShowMobileWorkspaceTabSwitcher(0)).toBe(false);
    expect(shouldShowMobileWorkspaceTabSwitcher(1)).toBe(false);
  });

  it("shows the compact tab switcher once two or more tabs exist", () => {
    expect(shouldShowMobileWorkspaceTabSwitcher(2)).toBe(true);
    expect(shouldShowMobileWorkspaceTabSwitcher(5)).toBe(true);
  });
});
