import { describe, expect, it } from "vitest";
import {
  MINI_PLAYER_DEFAULT_HEIGHT,
  MINI_PLAYER_DEFAULT_WIDTH,
  MINI_PLAYER_EDGE_GAP,
  MINI_PLAYER_MIN_HEIGHT,
  MINI_PLAYER_MIN_WIDTH,
  clampMiniPlayerPosition,
  clampMiniPlayerSize,
  defaultMiniPlayerGeometry,
} from "./browser-mini-player-layout";

const CONTAINER = { w: 1000, h: 700 };

describe("clampMiniPlayerPosition", () => {
  const size = { w: 320, h: 200 };

  it("keeps an in-bounds position unchanged", () => {
    expect(clampMiniPlayerPosition({ x: 40, y: 50 }, CONTAINER, size)).toEqual({
      x: 40,
      y: 50,
    });
  });

  it("clamps below EDGE_GAP on the top-left", () => {
    expect(clampMiniPlayerPosition({ x: -80, y: -60 }, CONTAINER, size)).toEqual({
      x: MINI_PLAYER_EDGE_GAP,
      y: MINI_PLAYER_EDGE_GAP,
    });
  });

  it("clamps past the bottom-right edge", () => {
    const result = clampMiniPlayerPosition({ x: 9999, y: 9999 }, CONTAINER, size);
    expect(result.x).toBe(CONTAINER.w - size.w - MINI_PLAYER_EDGE_GAP);
    expect(result.y).toBe(CONTAINER.h - size.h - MINI_PLAYER_EDGE_GAP);
  });

  it("honors bottomInset when clamping Y", () => {
    const inset = 80;
    const result = clampMiniPlayerPosition({ x: 40, y: 9999 }, CONTAINER, size, inset);
    expect(result.y).toBe(CONTAINER.h - size.h - MINI_PLAYER_EDGE_GAP - inset);
  });

  it("falls back to EDGE_GAP for non-finite input", () => {
    expect(
      clampMiniPlayerPosition({ x: Number.NaN, y: Number.POSITIVE_INFINITY }, CONTAINER, size),
    ).toEqual({
      x: MINI_PLAYER_EDGE_GAP,
      y: MINI_PLAYER_EDGE_GAP,
    });
  });
});

describe("clampMiniPlayerSize", () => {
  const position = { x: 100, y: 100 };

  it("keeps a valid size unchanged", () => {
    expect(clampMiniPlayerSize({ w: 320, h: 200 }, CONTAINER, position)).toEqual({
      w: 320,
      h: 200,
    });
  });

  it("enforces minimum width and height", () => {
    expect(clampMiniPlayerSize({ w: 10, h: 10 }, CONTAINER, position)).toEqual({
      w: MINI_PLAYER_MIN_WIDTH,
      h: MINI_PLAYER_MIN_HEIGHT,
    });
  });

  it("does not overflow the container from the current position", () => {
    const result = clampMiniPlayerSize({ w: 5000, h: 5000 }, CONTAINER, position);
    expect(result.w).toBe(CONTAINER.w - position.x - MINI_PLAYER_EDGE_GAP);
    expect(result.h).toBe(CONTAINER.h - position.y - MINI_PLAYER_EDGE_GAP);
  });

  it("honors bottomInset when capping height", () => {
    const inset = 100;
    const result = clampMiniPlayerSize({ w: 320, h: 5000 }, CONTAINER, position, inset);
    expect(result.h).toBe(CONTAINER.h - position.y - MINI_PLAYER_EDGE_GAP - inset);
  });
});

describe("defaultMiniPlayerGeometry", () => {
  it("places the default card at the bottom-right with EDGE_GAP", () => {
    const { position, size } = defaultMiniPlayerGeometry(CONTAINER);
    expect(size).toEqual({ w: MINI_PLAYER_DEFAULT_WIDTH, h: MINI_PLAYER_DEFAULT_HEIGHT });
    expect(position).toEqual({
      x: CONTAINER.w - MINI_PLAYER_DEFAULT_WIDTH - MINI_PLAYER_EDGE_GAP,
      y: CONTAINER.h - MINI_PLAYER_DEFAULT_HEIGHT - MINI_PLAYER_EDGE_GAP,
    });
  });

  it("respects bottomInset for the default Y", () => {
    const inset = 48;
    const { position } = defaultMiniPlayerGeometry(CONTAINER, inset);
    expect(position.y).toBe(
      CONTAINER.h - MINI_PLAYER_DEFAULT_HEIGHT - MINI_PLAYER_EDGE_GAP - inset,
    );
  });

  it("still fits inside a tiny container by clamping", () => {
    const tiny = { w: 200, h: 160 };
    const { position, size } = defaultMiniPlayerGeometry(tiny);
    expect(size.w).toBeGreaterThanOrEqual(MINI_PLAYER_MIN_WIDTH);
    expect(size.h).toBeGreaterThanOrEqual(MINI_PLAYER_MIN_HEIGHT);
    expect(position.x).toBe(MINI_PLAYER_EDGE_GAP);
    expect(position.y).toBe(MINI_PLAYER_EDGE_GAP);
  });
});
