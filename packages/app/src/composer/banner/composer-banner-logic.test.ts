import { describe, expect, it } from "vitest";
import {
  COMPOSER_BANNER_LAYER_RANK,
  buildComposerBannerDismissalKey,
  createComposerBannerDismissalStore,
  mergeComposerBanners,
  resolveComposerBannerLayer,
  resolveComposerBannerStack,
  type ComposerBannerDescriptor,
} from "./composer-banner-logic";

function banner(
  id: string,
  variant: ComposerBannerDescriptor["variant"],
  overrides: Partial<ComposerBannerDescriptor> = {},
): ComposerBannerDescriptor {
  return { id, variant, title: `title-${id}`, ...overrides };
}

describe("resolveComposerBannerLayer", () => {
  it("maps activity to the top layer", () => {
    expect(resolveComposerBannerLayer("activity")).toBe("activity");
  });

  it("maps error and warning to urgent", () => {
    expect(resolveComposerBannerLayer("error")).toBe("urgent");
    expect(resolveComposerBannerLayer("warning")).toBe("urgent");
  });

  it("maps info, success, and default to notice", () => {
    expect(resolveComposerBannerLayer("info")).toBe("notice");
    expect(resolveComposerBannerLayer("success")).toBe("notice");
    expect(resolveComposerBannerLayer("default")).toBe("notice");
  });

  it("keeps layer ranks strictly ordered", () => {
    expect(COMPOSER_BANNER_LAYER_RANK.activity).toBeLessThan(COMPOSER_BANNER_LAYER_RANK.urgent);
    expect(COMPOSER_BANNER_LAYER_RANK.urgent).toBeLessThan(COMPOSER_BANNER_LAYER_RANK.notice);
  });
});

describe("buildComposerBannerDismissalKey", () => {
  it("scopes the message to the thread", () => {
    expect(buildComposerBannerDismissalKey("s1:a1", "boom")).toBe("s1:a1::boom");
  });
});

describe("resolveComposerBannerStack", () => {
  const threadKey = "server:agent";

  it("returns nothing for an empty list", () => {
    expect(resolveComposerBannerStack({ banners: [], threadKey, dismissed: new Set() })).toEqual({
      attached: null,
      peeks: [],
    });
  });

  it("attaches a single banner and leaves no peeks", () => {
    const result = resolveComposerBannerStack({
      banners: [banner("a", "info")],
      threadKey,
      dismissed: new Set(),
    });
    expect(result.attached?.id).toBe("a");
    expect(result.peeks).toEqual([]);
  });

  it("lets activity outrank an error", () => {
    const result = resolveComposerBannerStack({
      banners: [banner("err", "error"), banner("act", "activity")],
      threadKey,
      dismissed: new Set(),
    });
    expect(result.attached?.id).toBe("act");
    expect(result.peeks.map((item) => item.id)).toEqual(["err"]);
  });

  it("lets an error outrank a notice", () => {
    const result = resolveComposerBannerStack({
      banners: [banner("note", "info"), banner("err", "error")],
      threadKey,
      dismissed: new Set(),
    });
    expect(result.attached?.id).toBe("err");
    expect(result.peeks.map((item) => item.id)).toEqual(["note"]);
  });

  it("keeps insertion order within a layer", () => {
    const result = resolveComposerBannerStack({
      banners: [banner("first", "warning"), banner("second", "error")],
      threadKey,
      dismissed: new Set(),
    });
    expect(result.attached?.id).toBe("first");
    expect(result.peeks.map((item) => item.id)).toEqual(["second"]);
  });

  it("filters dismissed banners", () => {
    const dismissed = new Set([buildComposerBannerDismissalKey(threadKey, "title-a")]);
    const result = resolveComposerBannerStack({
      banners: [banner("a", "error"), banner("b", "warning")],
      threadKey,
      dismissed,
    });
    expect(result.attached?.id).toBe("b");
    expect(result.peeks).toEqual([]);
  });

  it("scopes dismissal to the thread", () => {
    const dismissed = new Set([buildComposerBannerDismissalKey("other:thread", "title-a")]);
    const result = resolveComposerBannerStack({
      banners: [banner("a", "error")],
      threadKey,
      dismissed,
    });
    expect(result.attached?.id).toBe("a");
  });

  it("uses the message override as the dismissal identity", () => {
    const dismissed = new Set([buildComposerBannerDismissalKey(threadKey, "send-failed")]);
    const result = resolveComposerBannerStack({
      banners: [banner("a", "error", { message: "send-failed" })],
      threadKey,
      dismissed,
    });
    expect(result.attached).toBeNull();
  });

  it("ignores dismissal memory for non-dismissible banners", () => {
    const dismissed = new Set([buildComposerBannerDismissalKey(threadKey, "title-a")]);
    const result = resolveComposerBannerStack({
      banners: [banner("a", "error", { dismissible: false })],
      threadKey,
      dismissed,
    });
    expect(result.attached?.id).toBe("a");
  });

  it("orders all peeks by layer", () => {
    const result = resolveComposerBannerStack({
      banners: [
        banner("notice", "info"),
        banner("warn", "warning"),
        banner("act", "activity"),
        banner("err", "error"),
      ],
      threadKey,
      dismissed: new Set(),
    });
    expect(result.attached?.id).toBe("act");
    expect(result.peeks.map((item) => item.id)).toEqual(["warn", "err", "notice"]);
  });
});

describe("mergeComposerBanners", () => {
  it("de-duplicates by id with later groups winning", () => {
    const merged = mergeComposerBanners(
      [banner("a", "info")],
      [banner("a", "error", { title: "replaced" })],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].variant).toBe("error");
    expect(merged[0].title).toBe("replaced");
  });

  it("preserves first-seen order across groups", () => {
    const merged = mergeComposerBanners(
      [banner("a", "info")],
      [banner("b", "error"), banner("c", "warning")],
    );
    expect(merged.map((item) => item.id)).toEqual(["a", "b", "c"]);
  });
});

describe("createComposerBannerDismissalStore", () => {
  it("remembers dismissals and reports size", () => {
    const store = createComposerBannerDismissalStore();
    expect(store.has("k")).toBe(false);
    store.dismiss("k");
    expect(store.has("k")).toBe(true);
    expect(store.size()).toBe(1);
  });

  it("resets all dismissals", () => {
    const store = createComposerBannerDismissalStore();
    store.dismiss("k");
    store.reset();
    expect(store.has("k")).toBe(false);
    expect(store.size()).toBe(0);
  });

  it("evicts the oldest entry past the cap", () => {
    const store = createComposerBannerDismissalStore({ maxEntries: 2 });
    store.dismiss("a");
    store.dismiss("b");
    store.dismiss("c");
    expect(store.size()).toBe(2);
    expect(store.has("a")).toBe(false);
    expect(store.has("b")).toBe(true);
    expect(store.has("c")).toBe(true);
  });

  it("refreshes recency when a key is dismissed again", () => {
    const store = createComposerBannerDismissalStore({ maxEntries: 2 });
    store.dismiss("a");
    store.dismiss("b");
    store.dismiss("a");
    store.dismiss("c");
    expect(store.has("a")).toBe(true);
    expect(store.has("b")).toBe(false);
  });

  it("notifies subscribers on change and stops after unsubscribe", () => {
    const store = createComposerBannerDismissalStore();
    let notified = 0;
    const unsubscribe = store.subscribe(() => {
      notified += 1;
    });
    store.dismiss("k");
    expect(notified).toBe(1);
    unsubscribe();
    store.dismiss("k2");
    expect(notified).toBe(1);
  });

  it("notifies subscribers on reset", () => {
    const store = createComposerBannerDismissalStore();
    let notified = 0;
    store.subscribe(() => {
      notified += 1;
    });
    store.dismiss("k");
    store.reset();
    expect(notified).toBe(2);
  });
});
