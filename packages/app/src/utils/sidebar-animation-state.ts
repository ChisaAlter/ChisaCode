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

interface SidebarAnimationTargets {
  translateX: number;
  backdropOpacity: number;
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

export function getMobileSidebarWidth(windowWidth: number): number {
  if (!Number.isFinite(windowWidth) || windowWidth <= 0) {
    return 280;
  }
  const preferredWidth = windowWidth * 0.56;
  return Math.round(Math.min(windowWidth, Math.max(280, Math.min(420, preferredWidth))));
}
