import type { ReactNode } from "react";

/** Visual tone of a composer banner. */
export type ComposerBannerVariant =
  | "default"
  | "error"
  | "info"
  | "success"
  | "warning"
  | "activity";

/** Stack layer a banner competes in. `activity` always wins, `notice` always yields. */
export type ComposerBannerLayer = "activity" | "urgent" | "notice";

/** Vertical rhythm of a banner: `default` is two lines, `compact` is one. */
export type ComposerBannerDensity = "default" | "compact";

/** `full` spans the composer; `content` hugs its own text (480px ceiling). */
export type ComposerBannerWidth = "full" | "content";

export interface ComposerBannerActionDescriptor {
  label: string;
  onPress: () => void;
  /** `signal` paints the action in the variant's signal color (destructive/warning). */
  tone?: "neutral" | "signal";
  testID?: string;
}

export interface ComposerBannerDescriptor {
  /** Stable identity for React keys and the exit animation. */
  id: string;
  variant: ComposerBannerVariant;
  title: string;
  body?: string;
  /** Dismissal identity; defaults to `title`. Same message in a thread stays dismissed. */
  message?: string;
  /** Defaults to true. `false` renders without a close button and ignores dismissal memory. */
  dismissible?: boolean;
  density?: ComposerBannerDensity;
  width?: ComposerBannerWidth;
  actions?: readonly ComposerBannerActionDescriptor[];
  /** Replaces the plain `body` text (e.g. a scrollable code block). */
  bodySlot?: ReactNode;
  testID?: string;
}

const LAYER_BY_VARIANT: Record<ComposerBannerVariant, ComposerBannerLayer> = {
  activity: "activity",
  error: "urgent",
  warning: "urgent",
  info: "notice",
  success: "notice",
  default: "notice",
};

/** Lower rank attaches; higher rank collapses into the peek row. */
export const COMPOSER_BANNER_LAYER_RANK: Record<ComposerBannerLayer, number> = {
  activity: 0,
  urgent: 1,
  notice: 2,
};

/** Minimal read-only view of the dismissal memory (a `Set` satisfies it). */
export interface ComposerBannerDismissalLookup {
  has(key: string): boolean;
}

/**
 * Maps a banner variant to the stack layer it competes in.
 * @param variant Banner visual tone
 * @returns The layer for that variant
 */
export function resolveComposerBannerLayer(variant: ComposerBannerVariant): ComposerBannerLayer {
  return LAYER_BY_VARIANT[variant];
}

/**
 * Builds the dismissal-memory key for a banner message in a thread.
 * @param threadKey Stable thread identity (server + agent)
 * @param message Dismissal identity of the banner
 * @returns A key scoped to that thread
 */
export function buildComposerBannerDismissalKey(threadKey: string, message: string): string {
  return `${threadKey}::${message}`;
}

export interface ComposerBannerStackInput {
  banners: readonly ComposerBannerDescriptor[];
  threadKey: string;
  dismissed: ComposerBannerDismissalLookup;
}

export interface ComposerBannerStackResult {
  /** Highest-priority visible banner, rendered attached to the composer. */
  attached: ComposerBannerDescriptor | null;
  /** Remaining visible banners, ordered by layer then insertion. */
  peeks: ComposerBannerDescriptor[];
}

/**
 * Resolves which banner attaches and which collapse into the peek row.
 * Dismissed banners are filtered first, then the remainder is stably sorted by
 * layer rank so an activity banner always outranks an error and insertion order
 * breaks ties.
 * @param input Banners, thread identity, and dismissed keys
 * @returns The attached banner and the ordered peek list
 */
export function resolveComposerBannerStack(
  input: ComposerBannerStackInput,
): ComposerBannerStackResult {
  const visible = input.banners.filter((banner) => {
    if (banner.dismissible === false) {
      return true;
    }
    const message = banner.message ?? banner.title;
    return !input.dismissed.has(buildComposerBannerDismissalKey(input.threadKey, message));
  });
  const ordered = visible
    .map((banner, index) => ({ banner, index }))
    .sort((left, right) => {
      const rank =
        COMPOSER_BANNER_LAYER_RANK[resolveComposerBannerLayer(left.banner.variant)] -
        COMPOSER_BANNER_LAYER_RANK[resolveComposerBannerLayer(right.banner.variant)];
      return rank === 0 ? left.index - right.index : rank;
    })
    .map((entry) => entry.banner);
  const [attached = null, ...peeks] = ordered;
  return { attached, peeks };
}

/**
 * Concatenates banner groups, de-duplicating by `id` with later groups winning.
 * @param groups Banner groups in increasing precedence
 * @returns A merged banner list in first-seen order
 */
export function mergeComposerBanners(
  ...groups: readonly (readonly ComposerBannerDescriptor[])[]
): ComposerBannerDescriptor[] {
  const byId = new Map<string, ComposerBannerDescriptor>();
  for (const group of groups) {
    for (const banner of group) {
      byId.set(banner.id, banner);
    }
  }
  return [...byId.values()];
}

export interface ComposerBannerDismissalStore {
  /** Remembers a dismissal key, evicting the oldest entry past the cap. */
  dismiss(key: string): void;
  /** Whether a key has been dismissed. */
  has(key: string): boolean;
  /** Clears all dismissals (tests and explicit user recovery). */
  reset(): void;
  /** Number of remembered dismissals. */
  size(): number;
  /** Subscribes to dismissal changes; returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
}

/**
 * Creates a bounded, insertion-ordered dismissal memory.
 * @param options `maxEntries` caps growth for long-lived sessions (default 200)
 * @returns A store with dismiss/has/reset/size/subscribe
 */
export function createComposerBannerDismissalStore(options?: {
  maxEntries?: number;
}): ComposerBannerDismissalStore {
  const maxEntries = Math.max(1, options?.maxEntries ?? 200);
  const keys = new Map<string, true>();
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) {
      listener();
    }
  };
  return {
    dismiss(key) {
      keys.delete(key);
      keys.set(key, true);
      while (keys.size > maxEntries) {
        const oldest = keys.keys().next();
        if (oldest.done) {
          break;
        }
        keys.delete(oldest.value);
      }
      notify();
    },
    has(key) {
      return keys.has(key);
    },
    reset() {
      keys.clear();
      notify();
    },
    size() {
      return keys.size;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const DISMISSAL_STORE_GLOBAL_KEY = "__chisacodeComposerBannerDismissals";

interface GlobalWithBannerDismissals {
  [DISMISSAL_STORE_GLOBAL_KEY]?: ComposerBannerDismissalStore;
}

/**
 * Session-scoped dismissal memory shared by every composer stack.
 *
 * Held on `globalThis` rather than a module-level constant because Metro can
 * evaluate this module more than once in one bundle (alias imports and the
 * expo-router route context both reach it), which would otherwise create
 * independent stores and silently break dismissal propagation.
 * @returns The process-wide dismissal store
 */
export function getComposerBannerDismissals(): ComposerBannerDismissalStore {
  const host = globalThis as unknown as GlobalWithBannerDismissals;
  if (!host[DISMISSAL_STORE_GLOBAL_KEY]) {
    host[DISMISSAL_STORE_GLOBAL_KEY] = createComposerBannerDismissalStore({ maxEntries: 200 });
  }
  return host[DISMISSAL_STORE_GLOBAL_KEY];
}

/** Shared dismissal memory; see {@link getComposerBannerDismissals}. */
export const composerBannerDismissals = getComposerBannerDismissals();
