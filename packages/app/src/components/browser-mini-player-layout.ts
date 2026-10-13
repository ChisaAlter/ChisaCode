/**
 * Pure layout helpers for the browser Mini Player (T3 port M14).
 * Position/size are session-scoped UI geometry — not persisted.
 */

export const MINI_PLAYER_EDGE_GAP = 12;
export const MINI_PLAYER_DEFAULT_WIDTH = 320;
export const MINI_PLAYER_DEFAULT_HEIGHT = 200;
export const MINI_PLAYER_MIN_WIDTH = 240;
export const MINI_PLAYER_MIN_HEIGHT = 150;

export interface MiniPlayerPoint {
  x: number;
  y: number;
}

export interface MiniPlayerSize {
  w: number;
  h: number;
}

export interface MiniPlayerContainerSize {
  w: number;
  h: number;
}

function clamp(value: number, lo: number, hi: number): number {
  if (!Number.isFinite(value)) {
    return lo;
  }
  if (hi < lo) {
    return lo;
  }
  return Math.min(hi, Math.max(lo, value));
}

/**
 * Clamps a mini-player top-left position inside the workspace container.
 * `bottomInset` reserves space above the container bottom (e.g. terminal drawer).
 */
export function clampMiniPlayerPosition(
  pos: MiniPlayerPoint,
  container: MiniPlayerContainerSize,
  size: MiniPlayerSize,
  bottomInset = 0,
): MiniPlayerPoint {
  const maxX = container.w - size.w - MINI_PLAYER_EDGE_GAP;
  const maxY = container.h - size.h - MINI_PLAYER_EDGE_GAP - Math.max(0, bottomInset);
  return {
    x: clamp(pos.x, MINI_PLAYER_EDGE_GAP, maxX),
    y: clamp(pos.y, MINI_PLAYER_EDGE_GAP, maxY),
  };
}

/**
 * Clamps mini-player size so it stays within the container and above mins.
 */
export function clampMiniPlayerSize(
  size: MiniPlayerSize,
  container: MiniPlayerContainerSize,
  position: MiniPlayerPoint,
  bottomInset = 0,
): MiniPlayerSize {
  const maxW = Math.max(MINI_PLAYER_MIN_WIDTH, container.w - position.x - MINI_PLAYER_EDGE_GAP);
  const maxH = Math.max(
    MINI_PLAYER_MIN_HEIGHT,
    container.h - position.y - MINI_PLAYER_EDGE_GAP - Math.max(0, bottomInset),
  );
  return {
    w: clamp(size.w, MINI_PLAYER_MIN_WIDTH, maxW),
    h: clamp(size.h, MINI_PLAYER_MIN_HEIGHT, maxH),
  };
}

/**
 * Default bottom-right placement for a freshly popped-out mini player.
 */
export function defaultMiniPlayerGeometry(
  container: MiniPlayerContainerSize,
  bottomInset = 0,
): { position: MiniPlayerPoint; size: MiniPlayerSize } {
  const size: MiniPlayerSize = {
    w: MINI_PLAYER_DEFAULT_WIDTH,
    h: MINI_PLAYER_DEFAULT_HEIGHT,
  };
  const position = clampMiniPlayerPosition(
    {
      x: container.w - size.w - MINI_PLAYER_EDGE_GAP,
      y: container.h - size.h - MINI_PLAYER_EDGE_GAP - Math.max(0, bottomInset),
    },
    container,
    size,
    bottomInset,
  );
  return { position, size: clampMiniPlayerSize(size, container, position, bottomInset) };
}
