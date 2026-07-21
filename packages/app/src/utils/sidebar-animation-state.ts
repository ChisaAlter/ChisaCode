interface SidebarAnimationSyncInput {
  previousIsOpen: boolean;
  nextIsOpen: boolean;
  previousWindowWidth: number;
  nextWindowWidth: number;
}

interface SidebarAnimationTargetInput {
  isOpen: boolean;
  windowWidth: number;
  sidebarWidth?: number;
}

interface DesktopSidebarResizeStateInput {
  storedWidth: number;
  viewportWidth: number;
  minWidth: number;
  maxWidth: number;
  minContentWidth: number;
}

interface SidebarAnimationTargets {
  translateX: number;
  backdropOpacity: number;
}

interface DesktopSidebarResizeState {
  width: number;
  maxWidth: number;
}

export function shouldSyncSidebarAnimation(input: SidebarAnimationSyncInput): boolean {
  return (
    input.previousIsOpen !== input.nextIsOpen || input.previousWindowWidth !== input.nextWindowWidth
  );
}

export function getLeftSidebarAnimationTargets(
  input: SidebarAnimationTargetInput,
): SidebarAnimationTargets {
  const sidebarWidth = resolveSidebarAnimationWidth(input);
  return {
    translateX: input.isOpen || sidebarWidth === 0 ? 0 : -sidebarWidth,
    backdropOpacity: input.isOpen ? 1 : 0,
  };
}

export function getRightSidebarAnimationTargets(
  input: SidebarAnimationTargetInput,
): SidebarAnimationTargets {
  const sidebarWidth = resolveSidebarAnimationWidth(input);
  return {
    translateX: input.isOpen ? 0 : sidebarWidth,
    backdropOpacity: input.isOpen ? 1 : 0,
  };
}

function resolveSidebarAnimationWidth(input: SidebarAnimationTargetInput): number {
  if (typeof input.sidebarWidth === "number" && Number.isFinite(input.sidebarWidth)) {
    return Math.max(0, input.sidebarWidth);
  }
  if (Number.isFinite(input.windowWidth)) {
    return Math.max(0, input.windowWidth);
  }
  return 0;
}

/**
 * Soft .drawer: width 86%, max-width 300.
 * @param windowWidth Viewport width in CSS pixels
 * @returns Drawer width clamped to the Soft mobile drawer geometry
 */
export function getMobileSidebarWidth(windowWidth: number): number {
  if (!Number.isFinite(windowWidth) || windowWidth <= 0) {
    return 300;
  }
  const preferredWidth = windowWidth * 0.86;
  return Math.round(Math.min(windowWidth, Math.min(300, preferredWidth)));
}

export function getDesktopSidebarResizeState(
  input: DesktopSidebarResizeStateInput,
): DesktopSidebarResizeState {
  const availableMaxWidth = Number.isFinite(input.viewportWidth)
    ? input.viewportWidth - input.minContentWidth
    : input.maxWidth;
  const maxWidth = Math.max(input.minWidth, Math.min(input.maxWidth, availableMaxWidth));
  const storedWidth = Number.isFinite(input.storedWidth) ? input.storedWidth : input.minWidth;
  return {
    width: Math.max(input.minWidth, Math.min(maxWidth, storedWidth)),
    maxWidth,
  };
}
