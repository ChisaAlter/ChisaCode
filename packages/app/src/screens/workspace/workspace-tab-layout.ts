export type WorkspaceTabCloseButtonPolicy = "all";

export interface WorkspaceTabLayoutInput {
  viewportWidth: number;
  tabLabelLengths: number[];
  metrics: {
    rowHorizontalInset: number;
    actionsReservedWidth: number;
    rowPaddingHorizontal: number;
    tabGap: number;
    maxTabWidth: number;
    tabIconWidth: number;
    tabHorizontalPadding: number;
    tabContentGap?: number;
    estimatedCharWidth: number;
    closeButtonWidth: number;
    minTabWidth?: number;
    minScrollableTabWidth?: number;
  };
}

export interface WorkspaceTabLayoutItem {
  width: number;
  showLabel: boolean;
  labelCharCap: number;
}

export interface WorkspaceTabLayoutResult {
  items: WorkspaceTabLayoutItem[];
  closeButtonPolicy: WorkspaceTabCloseButtonPolicy;
  requiresHorizontalScrollFallback: boolean;
}

export interface WorkspaceVisibleTabWindowInput {
  tabCount: number;
  activeIndex: number;
  maxVisibleTabs: number;
}

export interface WorkspaceVisibleTabWindow {
  startIndex: number;
  endIndex: number;
  hiddenCount: number;
}

/**
 * Soft compact: hide the mobile tab strip until there are at least two tabs.
 * Matches design language §6.7 (0–1 tab → no tab wall).
 * @param tabCount Number of workspace tabs in the switcher model
 * @returns Whether the compact tab switcher row should mount
 */
export function shouldShowMobileWorkspaceTabSwitcher(tabCount: number): boolean {
  return tabCount >= 2;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

export function computeWorkspaceVisibleTabWindow(
  input: WorkspaceVisibleTabWindowInput,
): WorkspaceVisibleTabWindow {
  if (input.tabCount <= 0) {
    return { startIndex: 0, endIndex: 0, hiddenCount: 0 };
  }

  const visibleCount = clamp(Math.floor(input.maxVisibleTabs), 1, input.tabCount);
  const activeIndex = clamp(Math.floor(input.activeIndex), 0, input.tabCount - 1);
  const preferredStartIndex = activeIndex - Math.floor((visibleCount - 1) / 2);
  const startIndex = clamp(preferredStartIndex, 0, input.tabCount - visibleCount);

  return {
    startIndex,
    endIndex: startIndex + visibleCount,
    hiddenCount: input.tabCount - visibleCount,
  };
}

export function computeWorkspaceTabLayout(
  input: WorkspaceTabLayoutInput,
): WorkspaceTabLayoutResult {
  const tabCount = input.tabLabelLengths.length;
  if (tabCount === 0) {
    return {
      items: [],
      closeButtonPolicy: "all",
      requiresHorizontalScrollFallback: false,
    };
  }

  const availableWidth = Math.max(
    0,
    input.viewportWidth - input.metrics.rowHorizontalInset * 2 - input.metrics.actionsReservedWidth,
  );
  const rowOverhead =
    input.metrics.rowPaddingHorizontal * 2 + Math.max(tabCount - 1, 0) * input.metrics.tabGap;
  const availableTabsWidth = Math.max(0, availableWidth - rowOverhead);
  const iconOnlyTabWidth =
    input.metrics.tabIconWidth +
    input.metrics.tabHorizontalPadding * 2 +
    input.metrics.closeButtonWidth +
    (input.metrics.tabContentGap ?? 0);
  const minTabWidth = Math.max(iconOnlyTabWidth, input.metrics.minTabWidth ?? iconOnlyTabWidth);
  const minScrollableTabWidth = Math.max(minTabWidth, input.metrics.minScrollableTabWidth ?? 132);
  const minimumTotalTabsWidth = minTabWidth * tabCount;
  const requiresHorizontalScrollFallback = availableTabsWidth < minimumTotalTabsWidth;
  const idealWidths = input.tabLabelLengths.map((labelLength) =>
    clamp(
      iconOnlyTabWidth + Math.max(0, labelLength) * input.metrics.estimatedCharWidth,
      minTabWidth,
      input.metrics.maxTabWidth,
    ),
  );
  const idealTotalTabsWidth = idealWidths.reduce((total, width) => total + width, 0);
  let resolvedWidths: number[];

  if (requiresHorizontalScrollFallback) {
    resolvedWidths = Array.from({ length: tabCount }, () => minScrollableTabWidth);
  } else if (idealTotalTabsWidth <= availableTabsWidth) {
    resolvedWidths = idealWidths;
  } else {
    const shrinkableWidth = Math.max(1, idealTotalTabsWidth - minimumTotalTabsWidth);
    const shrinkRatio = clamp((idealTotalTabsWidth - availableTabsWidth) / shrinkableWidth, 0, 1);
    resolvedWidths = idealWidths.map((width) => width - (width - minTabWidth) * shrinkRatio);
  }

  const roundedWidths = resolvedWidths.map((width) =>
    Math.round(clamp(width, minTabWidth, input.metrics.maxTabWidth)),
  );

  return {
    items: roundedWidths.map((width) => {
      const rawCharCap = Math.floor((width - iconOnlyTabWidth) / input.metrics.estimatedCharWidth);
      const labelCharCap = Math.max(0, rawCharCap);
      return {
        width,
        showLabel: labelCharCap > 0,
        labelCharCap,
      };
    }),
    closeButtonPolicy: "all",
    requiresHorizontalScrollFallback,
  };
}
