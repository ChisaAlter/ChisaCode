export const BROWSER_PANE_MIN_WIDTH = 360;
export const BROWSER_PANE_MAX_VIEWPORT_RATIO = 0.7;

/**
 * Clamps the workspace browser pane width to [BROWSER_PANE_MIN_WIDTH,
 * floor(viewportWidth * 0.7)]. The min always wins over the computed max so a
 * very narrow viewport still gets a usable pane (known trade-off: it squeezes
 * the conversation column below ~720px viewports).
 */
export function clampBrowserPaneWidth(width: number, viewportWidth: number): number {
  const rounded = Number.isFinite(width) ? Math.round(width) : BROWSER_PANE_MIN_WIDTH;
  const maxWidth =
    Number.isFinite(viewportWidth) && viewportWidth > 0
      ? Math.floor(viewportWidth * BROWSER_PANE_MAX_VIEWPORT_RATIO)
      : Number.MAX_SAFE_INTEGER;
  const upper = Math.max(BROWSER_PANE_MIN_WIDTH, maxWidth);
  return Math.min(upper, Math.max(BROWSER_PANE_MIN_WIDTH, rounded));
}
