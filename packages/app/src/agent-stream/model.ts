import type { ReactNode } from "react";
import { deriveStreamTurnTiming, type StreamTurnTiming } from "@/timeline/turn-time";
import type { StreamItem, ThoughtItem } from "@/types/stream";
import {
  findMountedWindowStart,
  getWebMountedRecentStreamItems,
  getWebPartialVirtualizationThreshold,
} from "./web-virtualization";
import { orderHeadForStreamRenderStrategy, orderTailForStreamRenderStrategy } from "./strategy";
import { resolveStreamRenderStrategy } from "./strategy-resolver";

export interface StreamRenderSegments {
  historyVirtualized: StreamItem[];
  historyMounted: StreamItem[];
  liveHead: StreamItem[];
}

export interface StreamHistoryBoundary {
  hasVirtualizedHistory: boolean;
  hasMountedHistory: boolean;
  hasLiveHead: boolean;
}

export interface StreamRenderAuxiliary {
  pendingPermissions: ReactNode;
  turnFooter: ReactNode;
}

export interface AgentStreamRenderModel {
  history: StreamItem[];
  segments: StreamRenderSegments;
  turnTiming: StreamTurnTiming;
  boundary: StreamHistoryBoundary;
  auxiliary: StreamRenderAuxiliary;
}

export interface BuildAgentStreamRenderModelInput {
  agentStatus: string;
  tail: StreamItem[];
  head: StreamItem[];
  platform: "web" | "native";
  isMobileBreakpoint: boolean;
}

const EMPTY_STREAM_ITEMS: StreamItem[] = [];
const EMPTY_AUXILIARY: StreamRenderAuxiliary = {
  pendingPermissions: null,
  turnFooter: null,
};

const orderedTailCache = new WeakMap<StreamItem[], Map<string, StreamItem[]>>();
const orderedHeadCache = new WeakMap<StreamItem[], Map<string, StreamItem[]>>();
const splitHistoryCache = new WeakMap<
  StreamItem[],
  Map<string, Pick<AgentStreamRenderModel, "history" | "segments">>
>();
const turnTimingCache = new WeakMap<
  StreamItem[],
  WeakMap<StreamItem[], Map<string, StreamTurnTiming>>
>();

function isThoughtItem(item: StreamItem): item is ThoughtItem {
  return item.kind === "thought";
}

function collapseCompletedTurn(turnItems: StreamItem[]): StreamItem[] {
  const thoughts = turnItems.filter(isThoughtItem);
  if (thoughts.length === 0) {
    return turnItems;
  }

  let lastAssistantIndex = -1;
  for (let index = turnItems.length - 1; index >= 0; index -= 1) {
    if (turnItems[index]?.kind === "assistant_message") {
      lastAssistantIndex = index;
      break;
    }
  }

  const lastAssistant = turnItems[lastAssistantIndex];
  if (lastAssistantIndex < 0 || !lastAssistant || lastAssistant.kind !== "assistant_message") {
    return turnItems;
  }

  const summaryText = thoughts
    .map((thought) => thought.text.trim())
    .filter((text) => text.length > 0)
    .join("\n\n");
  if (!summaryText) {
    return turnItems.filter((item) => item.kind !== "thought");
  }

  const lastThought = thoughts.at(-1);
  const summary: ThoughtItem = {
    kind: "thought",
    id: `thought-summary:${lastAssistant.id}`,
    text: summaryText,
    timestamp: lastThought?.timestamp ?? lastAssistant.timestamp,
    status: "ready",
    isCollapsedSummary: true,
    summaryForAssistantMessageId: lastAssistant.id,
  };

  const collapsed: StreamItem[] = [];
  for (let index = 0; index < turnItems.length; index += 1) {
    const item = turnItems[index];
    if (!item || item.kind === "thought") {
      continue;
    }
    collapsed.push(item);
    if (index === lastAssistantIndex) {
      collapsed.push(summary);
    }
  }
  return collapsed;
}

export function collapseCompletedTurnThoughtsForDisplay(
  items: StreamItem[],
  input: { isRunning: boolean },
): StreamItem[] {
  if (items.length === 0 || input.isRunning) {
    return items;
  }

  const collapsed: StreamItem[] = [];
  let currentTurn: StreamItem[] = [];

  const flushTurn = () => {
    if (currentTurn.length === 0) {
      return;
    }
    collapsed.push(...collapseCompletedTurn(currentTurn));
    currentTurn = [];
  };

  for (const item of items) {
    if (item.kind === "user_message") {
      flushTurn();
    }
    currentTurn.push(item);
  }
  flushTurn();

  return collapsed.length === items.length &&
    collapsed.every((item, index) => item === items[index])
    ? items
    : collapsed;
}

function collapseCompletedTurnThoughtSegments(input: {
  tail: StreamItem[];
  head: StreamItem[];
  isRunning: boolean;
}): Pick<BuildAgentStreamRenderModelInput, "tail" | "head"> {
  if (input.head.length === 0 || input.isRunning) {
    return {
      tail: collapseCompletedTurnThoughtsForDisplay(input.tail, { isRunning: false }),
      head: input.head,
    };
  }

  const collapsed = collapseCompletedTurnThoughtsForDisplay([...input.tail, ...input.head], {
    isRunning: false,
  });
  const headItems = new Set(input.head);
  const headIds = new Set(input.head.map((item) => item.id));
  const displayTail: StreamItem[] = [];
  const displayHead: StreamItem[] = [];

  for (const item of collapsed) {
    const sourceId =
      item.kind === "thought" && item.summaryForAssistantMessageId
        ? item.summaryForAssistantMessageId
        : item.id;
    if (headItems.has(item) || headIds.has(sourceId)) {
      displayHead.push(item);
    } else {
      displayTail.push(item);
    }
  }

  return {
    tail:
      displayTail.length === input.tail.length &&
      displayTail.every((item, index) => item === input.tail[index])
        ? input.tail
        : displayTail,
    head:
      displayHead.length === input.head.length &&
      displayHead.every((item, index) => item === input.head[index])
        ? input.head
        : displayHead,
  };
}

function getOrderedItems(params: {
  cache: WeakMap<StreamItem[], Map<string, StreamItem[]>>;
  source: StreamItem[];
  cacheKey: string;
  order: (items: StreamItem[]) => StreamItem[];
}): StreamItem[] {
  const { cache, source, cacheKey, order } = params;
  let cachedByKey = cache.get(source);
  if (!cachedByKey) {
    cachedByKey = new Map();
    cache.set(source, cachedByKey);
  }
  const cached = cachedByKey.get(cacheKey);
  if (cached) {
    return cached;
  }
  const ordered = order(source);
  cachedByKey.set(cacheKey, ordered);
  return ordered;
}

function splitOrderedTail(params: {
  orderedTail: StreamItem[];
  platform: "web" | "native";
  isMobileBreakpoint: boolean;
}): Pick<AgentStreamRenderModel, "history" | "segments"> {
  const { orderedTail, platform, isMobileBreakpoint } = params;
  const shouldSplitHistory =
    platform === "web" &&
    !isMobileBreakpoint &&
    orderedTail.length > getWebPartialVirtualizationThreshold();
  const cacheKey = `${platform}:${isMobileBreakpoint}:${getWebMountedRecentStreamItems()}:${shouldSplitHistory}`;
  let cachedByKey = splitHistoryCache.get(orderedTail);
  if (!cachedByKey) {
    cachedByKey = new Map();
    splitHistoryCache.set(orderedTail, cachedByKey);
  }
  const cached = cachedByKey.get(cacheKey);
  if (cached) {
    return cached;
  }

  if (!shouldSplitHistory) {
    const unsplit = {
      history: orderedTail,
      segments: {
        historyVirtualized: EMPTY_STREAM_ITEMS,
        historyMounted: orderedTail,
        liveHead: EMPTY_STREAM_ITEMS,
      },
    } satisfies Pick<AgentStreamRenderModel, "history" | "segments">;
    cachedByKey.set(cacheKey, unsplit);
    return unsplit;
  }

  const mountedWindowStart = findMountedWindowStart({
    items: orderedTail,
    minMountedCount: getWebMountedRecentStreamItems(),
  });
  const split = {
    history: orderedTail,
    segments: {
      historyVirtualized: orderedTail.slice(0, mountedWindowStart),
      historyMounted: orderedTail.slice(mountedWindowStart),
      liveHead: EMPTY_STREAM_ITEMS,
    },
  } satisfies Pick<AgentStreamRenderModel, "history" | "segments">;
  cachedByKey.set(cacheKey, split);
  return split;
}

function getTurnTiming(params: {
  agentStatus: string;
  tail: StreamItem[];
  head: StreamItem[];
}): StreamTurnTiming {
  let cachedByHead = turnTimingCache.get(params.tail);
  if (!cachedByHead) {
    cachedByHead = new WeakMap();
    turnTimingCache.set(params.tail, cachedByHead);
  }
  let cachedByStatus = cachedByHead.get(params.head);
  if (!cachedByStatus) {
    cachedByStatus = new Map();
    cachedByHead.set(params.head, cachedByStatus);
  }
  const cached = cachedByStatus.get(params.agentStatus);
  if (cached) {
    return cached;
  }
  const timing = deriveStreamTurnTiming(params);
  cachedByStatus.set(params.agentStatus, timing);
  return timing;
}

export function buildAgentStreamRenderModel(
  input: BuildAgentStreamRenderModelInput,
): AgentStreamRenderModel {
  const strategy = resolveStreamRenderStrategy({
    platform: input.platform === "web" ? "web" : "native",
    isMobileBreakpoint: input.isMobileBreakpoint,
  });
  const orderingCacheKey = `${input.platform}:${input.isMobileBreakpoint}`;
  const displaySegments = collapseCompletedTurnThoughtSegments({
    tail: input.tail,
    head: input.head,
    isRunning: input.agentStatus === "running",
  });
  const orderedTail = getOrderedItems({
    cache: orderedTailCache,
    source: displaySegments.tail,
    cacheKey: orderingCacheKey,
    order: (items) =>
      orderTailForStreamRenderStrategy({
        strategy,
        streamItems: items,
      }),
  });
  const orderedHead = getOrderedItems({
    cache: orderedHeadCache,
    source: displaySegments.head,
    cacheKey: orderingCacheKey,
    order: (items) =>
      orderHeadForStreamRenderStrategy({
        strategy,
        streamHead: items,
      }),
  });
  const splitHistory = splitOrderedTail({
    orderedTail,
    platform: input.platform,
    isMobileBreakpoint: input.isMobileBreakpoint,
  });
  const turnTiming = getTurnTiming({
    agentStatus: input.agentStatus,
    tail: input.tail,
    head: input.head,
  });

  return {
    history: splitHistory.history,
    segments: {
      ...splitHistory.segments,
      liveHead: orderedHead,
    },
    turnTiming,
    boundary: {
      hasVirtualizedHistory: splitHistory.segments.historyVirtualized.length > 0,
      hasMountedHistory: splitHistory.segments.historyMounted.length > 0,
      hasLiveHead: orderedHead.length > 0,
    },
    auxiliary: EMPTY_AUXILIARY,
  };
}
