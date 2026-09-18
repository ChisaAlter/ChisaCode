/**
 * Resting composer controls measurement — pure layout core (T3 port M19,
 * consumed by M15 resting layout).
 *
 * Given the natural (untruncated) width of each toolbar control and the
 * available row width, decides which controls stay inline and which move
 * into the compact "⋯" overflow menu. Flexible controls (e.g. the model
 * selector) shrink toward their minimum before anything overflows; pinned
 * controls (e.g. send) never overflow. DOM measurement lives in M15 — this
 * module only owns the deterministic allocation math.
 */

export interface RestingControlSpec {
  id: string;
  /** Natural, untruncated width in px. */
  width: number;
  /** May shrink down to `minWidth` (default 0) before overflowing. */
  flexible?: boolean;
  minWidth?: number;
  /** Never overflows — always rendered inline. */
  pinned?: boolean;
}

export interface RestingControlsLayout {
  /** Controls rendered inline, in original order. */
  visibleIds: string[];
  /** Controls moved into the overflow menu, in original order. */
  overflowIds: string[];
  /** Resolved width for each visible flexible control. */
  flexibleWidths: Record<string, number>;
  /** Whether the overflow menu trigger must be rendered. */
  needsOverflowButton: boolean;
}

export interface RestingControlsLayoutInput {
  /** Usable row width in px. */
  availableWidth: number;
  controls: RestingControlSpec[];
  /** Width the "⋯" trigger occupies when anything overflows. */
  overflowButtonWidth?: number;
  /** Gap between consecutive inline controls. */
  gap?: number;
}

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

export function layoutRestingComposerControls({
  availableWidth,
  controls,
  overflowButtonWidth = 0,
  gap = 0,
}: RestingControlsLayoutInput): RestingControlsLayout {
  const flexibleWidths: Record<string, number> = {};
  const resolvedWidth = (control: RestingControlSpec) =>
    control.flexible ? (flexibleWidths[control.id] ?? control.width) : control.width;

  const fits = (visible: RestingControlSpec[], reservedOverflow: boolean) => {
    if (visible.length === 0) return !reservedOverflow || overflowButtonWidth <= availableWidth;
    const widths = visible.map(resolvedWidth);
    const total =
      sum(widths) + gap * (visible.length - 1) + (reservedOverflow ? overflowButtonWidth + gap : 0);
    return total <= availableWidth;
  };

  const allVisible = () => ({
    visibleIds: controls.map((control) => control.id),
    overflowIds: [],
    flexibleWidths,
    needsOverflowButton: false,
  });

  // Give leftover slack back to visible flexible controls, leftmost first,
  // restoring them toward their natural width.
  const distributeSlack = (visible: RestingControlSpec[], hasOverflow: boolean) => {
    if (visible.length === 0) return;
    let slack =
      availableWidth -
      sum(visible.map(resolvedWidth)) -
      gap * (visible.length - 1) -
      (hasOverflow ? overflowButtonWidth + gap : 0);
    for (const control of visible) {
      if (!control.flexible || slack <= 0) continue;
      const grow = Math.min(control.width - resolvedWidth(control), slack);
      flexibleWidths[control.id] = resolvedWidth(control) + grow;
      slack -= grow;
    }
  };

  if (controls.length === 0 || fits(controls, false)) {
    return allVisible();
  }

  // Shrink flexible controls toward their minimum, rightmost first, until
  // the row fits or every flexible control is at its floor.
  const flexiblesRightToLeft = controls.toReversed().filter((c) => c.flexible);
  for (const control of flexiblesRightToLeft) {
    if (fits(controls, false)) break;
    const floor = Math.max(0, control.minWidth ?? 0);
    const shrinkTo = Math.min(control.width, floor);
    flexibleWidths[control.id] = shrinkTo;
  }
  if (fits(controls, false)) {
    distributeSlack(controls, false);
    return allVisible();
  }

  // Overflow non-pinned controls right-to-left until the remaining row —
  // plus the overflow trigger — fits.
  const overflowed = new Set<string>();
  const candidates = controls.toReversed().filter((c) => !c.pinned);
  for (const control of candidates) {
    const visible = controls.filter((c) => !overflowed.has(c.id));
    if (fits(visible, true)) break;
    overflowed.add(control.id);
  }

  const visibleControls = controls.filter((c) => !overflowed.has(c.id));
  distributeSlack(visibleControls, overflowed.size > 0);

  return {
    visibleIds: visibleControls.map((control) => control.id),
    overflowIds: controls.filter((c) => overflowed.has(c.id)).map((c) => c.id),
    flexibleWidths,
    needsOverflowButton: overflowed.size > 0,
  };
}
