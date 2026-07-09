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
    estimatedCharWidth: number;
    closeButtonWidth: number;
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
    input.metrics.closeButtonWidth;
  const minScrollableTabWidth = Math.max(
    iconOnlyTabWidth,
    input.metrics.minScrollableTabWidth ?? 132,
  );
  const iconOnlyTotalTabsWidth = iconOnlyTabWidth * tabCount;
  const requiresHorizontalScrollFallback = availableTabsWidth < iconOnlyTotalTabsWidth;
  const resolvedWidth = requiresHorizontalScrollFallback
    ? minScrollableTabWidth
    : clamp(availableTabsWidth / tabCount, iconOnlyTabWidth, input.metrics.maxTabWidth);
  const resolvedWidths = Array.from({ length: tabCount }, () => resolvedWidth);

  const roundedWidths = resolvedWidths.map((width) =>
    Math.round(clamp(width, iconOnlyTabWidth, input.metrics.maxTabWidth)),
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
