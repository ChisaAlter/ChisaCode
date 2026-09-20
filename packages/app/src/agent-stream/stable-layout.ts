import { useMemo, useRef } from "react";
import type { StreamLayout, StreamLayoutItem, TurnFooterHost } from "./layout";

/**
 * Identity-stable derivation of a {@link StreamLayout}: rows whose content did
 * not change reuse the previous frame's object reference, so React memo
 * boundaries and tanstack-virtual skip re-rendering them during streaming.
 *
 * The per-frame `layoutStream` output rebuilds every row object; this pass
 * restores reference identity frame-to-frame.
 */
export interface StableStreamLayoutState {
  byId: Map<string, StreamLayoutItem>;
  result: StreamLayoutItem[];
}

export interface StableStreamLayout extends StreamLayout {
  historyState: StableStreamLayoutState;
  liveHeadState: StableStreamLayoutState;
}

function isTurnFooterHostUnchanged(a: TurnFooterHost | null, b: TurnFooterHost | null): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  return (
    a.itemId === b.itemId &&
    a.items === b.items &&
    a.timing === b.timing &&
    a.startIndex === b.startIndex
  );
}

/**
 * True when every render-relevant field of the two layout rows matches by
 * reference or primitive value. Positional metadata (`index`, `frameOrder`,
 * the segment `items` array reference) is deliberately excluded — it changes
 * whenever the source arrays are rebuilt — and is checked separately as part
 * of the reference-reuse tier in {@link computeStableStreamLayoutItems}.
 * `toolSequenceGroup` is compared by reference; layout.ts keeps group arrays
 * identity-stable while their member rows are unchanged.
 * @param a Previous frame's layout row
 * @param b Current frame's layout row
 */
export function isStreamLayoutItemContentUnchanged(
  a: StreamLayoutItem,
  b: StreamLayoutItem,
): boolean {
  return (
    a.item === b.item &&
    a.items === b.items &&
    a.aboveItem === b.aboveItem &&
    a.belowItem === b.belowItem &&
    a.gapBelow === b.gapBelow &&
    a.assistantSpacing === b.assistantSpacing &&
    isTurnFooterHostUnchanged(a.completedFooter, b.completedFooter) &&
    a.turnTiming === b.turnTiming &&
    a.turnChanges === b.turnChanges &&
    a.toolSequence === b.toolSequence &&
    a.toolSequenceGroup === b.toolSequenceGroup &&
    a.toolSequenceGroupGapBelow === b.toolSequenceGroupGapBelow &&
    a.isToolSequenceGroupContinuation === b.isToolSequenceGroupContinuation &&
    a.isFirstInUserGroup === b.isFirstInUserGroup &&
    a.isLastInUserGroup === b.isLastInUserGroup &&
    a.isLastInToolSequence === b.isLastInToolSequence
  );
}

/**
 * Derives an identity-stable layout row list from the per-frame layout output.
 *
 * A row reuses the previous frame's object reference only when its content is
 * unchanged AND its positional metadata (`index`, `frameOrder`, segment
 * `items` reference) also matches — reused objects must not carry stale
 * position data. When every row is reused, the previous state object itself is
 * returned so upstream `useMemo` consumers see an identical reference and skip
 * entirely.
 * @param items Current frame's layout rows for one segment
 * @param prev Previous frame's stable state, or null on first run
 * @returns The stable state; `result` is the row list to render
 */
export function computeStableStreamLayoutItems(
  items: readonly StreamLayoutItem[],
  prev: StableStreamLayoutState | null,
): StableStreamLayoutState {
  if (items.length === 0) {
    if (prev && prev.result.length === 0) {
      return prev;
    }
    return { byId: new Map(), result: [] };
  }

  const byId = new Map<string, StreamLayoutItem>();
  const result: StreamLayoutItem[] = [];
  let allReused = prev !== null && prev.result.length === items.length;
  for (let index = 0; index < items.length; index += 1) {
    const current = items[index];
    const prevItem = prev?.byId.get(current.item.id);
    const reusable =
      prevItem !== undefined &&
      isStreamLayoutItemContentUnchanged(prevItem, current) &&
      prevItem.index === current.index &&
      prevItem.frameOrder === current.frameOrder &&
      prevItem.items === current.items;
    const stable = reusable && prevItem ? prevItem : current;
    byId.set(current.item.id, stable);
    result[index] = stable;
    if (!reusable) {
      allReused = false;
    }
  }
  if (allReused && prev) {
    return prev;
  }
  return { byId, result };
}

function isStableStreamLayoutStateUnchanged(
  a: StableStreamLayoutState,
  b: StableStreamLayoutState,
): boolean {
  return a === b;
}

/**
 * Derives an identity-stable {@link StreamLayout} from the per-frame
 * `layoutStream` output. When history, live head, and the auxiliary turn
 * footer are all unchanged, the previous layout object itself is returned.
 * @param layout Current frame's layout output
 * @param prev Previous stable layout, or null on first run
 */
export function computeStableStreamLayout(
  layout: StreamLayout,
  prev: StableStreamLayout | null,
): StableStreamLayout {
  const historyState = computeStableStreamLayoutItems(layout.history, prev?.historyState ?? null);
  const liveHeadState = computeStableStreamLayoutItems(
    layout.liveHead,
    prev?.liveHeadState ?? null,
  );
  const footerUnchanged = isTurnFooterHostUnchanged(
    prev?.auxiliaryTurnFooter ?? null,
    layout.auxiliaryTurnFooter,
  );
  if (
    prev !== null &&
    isStableStreamLayoutStateUnchanged(historyState, prev.historyState) &&
    isStableStreamLayoutStateUnchanged(liveHeadState, prev.liveHeadState) &&
    footerUnchanged
  ) {
    return prev;
  }
  return {
    history: historyState.result,
    liveHead: liveHeadState.result,
    auxiliaryTurnFooter: layout.auxiliaryTurnFooter,
    historyState,
    liveHeadState,
  };
}

/**
 * React binding for {@link computeStableStreamLayout}: wraps the per-frame
 * `layoutStream` output so downstream `useMemo`/memo consumers see stable
 * references across streaming frames.
 * @param layout Current frame's layout output from `layoutStream`
 * @returns The stable layout; reference-equal to the previous value when nothing changed
 */
export function useStableStreamLayout(layout: StreamLayout): StreamLayout {
  const prevRef = useRef<StableStreamLayout | null>(null);
  return useMemo(() => {
    const next = computeStableStreamLayout(layout, prevRef.current);
    prevRef.current = next;
    return next;
  }, [layout]);
}
