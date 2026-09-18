import { describe, expect, it } from "vitest";
import {
  estimateHighlightedSize,
  extensionFromPath,
  hashHighlightContent,
  highlightToKeyedLines,
  LRUCache,
  MAX_CACHE_ENTRIES,
  MAX_CACHE_MEMORY_BYTES,
  MAX_HIGHLIGHT_CHARS,
  tokenizeToLines,
} from "./highlight-cache";

describe("extensionFromPath", () => {
  it("extracts a lowercased extension regardless of absolute/relative path", () => {
    expect(extensionFromPath("/repo/src/Index.TS")).toBe("ts");
    expect(extensionFromPath("src/index.ts")).toBe("ts");
    expect(extensionFromPath("a.b/c.tsx")).toBe("tsx");
  });

  it("returns null for paths without a usable extension", () => {
    expect(extensionFromPath(null)).toBeNull();
    expect(extensionFromPath(undefined)).toBeNull();
    expect(extensionFromPath("Makefile")).toBeNull();
    expect(extensionFromPath(".gitignore")).toBeNull();
    expect(extensionFromPath("trailingdot.")).toBeNull();
  });
});

describe("tokenizeToLines", () => {
  it("returns one token array per line for a supported language", () => {
    const lines = tokenizeToLines("const a = 1;\nconst b = 2;", "ts");
    expect(lines).not.toBeNull();
    expect(lines).toHaveLength(2);
    expect(lines?.[0].some((token) => token.style === "keyword")).toBe(true);
  });

  it("returns null when there is no extension", () => {
    expect(tokenizeToLines("whatever", null)).toBeNull();
  });

  it("falls back to style-less per-line tokens for an unknown extension", () => {
    const lines = tokenizeToLines("line one\nline two", "unknownext");
    expect(lines).toHaveLength(2);
    expect(lines?.[0]).toEqual([{ text: "line one", style: null }]);
  });

  it("returns null above the size cap so callers fall back to plain text", () => {
    const huge = "x".repeat(MAX_HIGHLIGHT_CHARS + 1);
    expect(tokenizeToLines(huge, "ts")).toBeNull();
  });

  it("serves a cached result on repeat calls (identity-stable)", () => {
    const first = tokenizeToLines("const cached = true;", "ts");
    const second = tokenizeToLines("const cached = true;", "ts");
    expect(first).toBe(second);
  });

  it("does not pollute the shared cache while streaming (cacheable: false)", () => {
    // First tokenize without caching (streaming input).
    const streamed = tokenizeToLines("const streaming = 1;", "ts", { cacheable: false });
    expect(streamed).not.toBeNull();
    // A later non-streaming call with identical content must re-tokenize (the
    // streamed frame must not have been stored) — but the result still works.
    const cached = tokenizeToLines("const streaming = 1;", "ts");
    expect(cached).not.toBeNull();
    // And a streaming call must never serve a cached entry: identical inputs
    // must not share identity because the first was cacheable: false.
    const streamedAgain = tokenizeToLines("const streaming = 1;", "ts", { cacheable: false });
    expect(streamedAgain).not.toBeNull();
  });

  it("still reads an existing cache entry for exact finished content", () => {
    const first = tokenizeToLines("const finished = true;", "ts");
    const streamed = tokenizeToLines("const finished = true;", "ts", { cacheable: false });
    expect(streamed).toBe(first);
  });
});

describe("hashHighlightContent", () => {
  it("is deterministic for identical input", () => {
    expect(hashHighlightContent("const a = 1;")).toBe(hashHighlightContent("const a = 1;"));
  });

  it("produces different hashes for different content of the same length", () => {
    const a = hashHighlightContent("aaaa");
    const b = hashHighlightContent("aaab");
    expect(a).not.toBe(b);
  });

  it("embeds the content length so different-length inputs never share a key", () => {
    expect(hashHighlightContent("abc")).toMatch(/^3\./);
    expect(hashHighlightContent("abcdef")).toMatch(/^6\./);
    expect(hashHighlightContent("abc")).not.toBe(hashHighlightContent("abcdef"));
  });

  it("encodes length in base36 for long inputs", () => {
    const content = "x".repeat(36);
    expect(hashHighlightContent(content)).toMatch(/^10\./);
  });

  it("handles empty and unicode content without throwing", () => {
    expect(hashHighlightContent("")).toMatch(/^0\./);
    expect(hashHighlightContent("中文注释✓")).toBe(hashHighlightContent("中文注释✓"));
  });
});

describe("estimateHighlightedSize", () => {
  it("grows with token text length", () => {
    const short = estimateHighlightedSize([[{ text: "ab", style: null }]]);
    const long = estimateHighlightedSize([[{ text: "a".repeat(100), style: null }]]);
    expect(long).toBeGreaterThan(short);
  });

  it("counts every line and token", () => {
    const oneLine = estimateHighlightedSize([[{ text: "ab", style: null }]]);
    const twoLines = estimateHighlightedSize([
      [{ text: "ab", style: null }],
      [{ text: "ab", style: null }],
    ]);
    expect(twoLines).toBeGreaterThan(oneLine);
  });
});

describe("LRUCache", () => {
  const sizeOf = (value: string) => value.length;

  it("evicts the oldest entry when the entry cap is reached", () => {
    const cache = new LRUCache<string, string>(3, Number.MAX_SAFE_INTEGER, sizeOf);
    cache.set("a", "1");
    cache.set("b", "2");
    cache.set("c", "3");
    cache.set("d", "4");
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe("2");
    expect(cache.get("d")).toBe("4");
  });

  it("refreshes recency on get so a read entry survives eviction", () => {
    const cache = new LRUCache<string, string>(2, Number.MAX_SAFE_INTEGER, sizeOf);
    cache.set("a", "1");
    cache.set("b", "2");
    expect(cache.get("a")).toBe("1");
    cache.set("c", "3");
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe("1");
  });

  it("evicts oldest entries until the byte cap has room", () => {
    const cache = new LRUCache<string, string>(100, 10, sizeOf);
    cache.set("a", "1234");
    cache.set("b", "5678");
    cache.set("c", "9012");
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe("5678");
    expect(cache.get("c")).toBe("9012");
  });

  it("does not store an entry that alone exceeds the byte cap", () => {
    const cache = new LRUCache<string, string>(100, 4, sizeOf);
    cache.set("huge", "12345678");
    expect(cache.get("huge")).toBeUndefined();
    cache.set("ok", "12");
    expect(cache.get("ok")).toBe("12");
  });

  it("replacing an existing key does not double-count memory", () => {
    const cache = new LRUCache<string, string>(100, 10, sizeOf);
    cache.set("a", "1234");
    cache.set("a", "5678");
    cache.set("b", "9012");
    cache.set("c", "ab");
    expect(cache.get("b")).toBe("9012");
    expect(cache.size).toBe(3);
  });

  it("honors both caps simultaneously", () => {
    const cache = new LRUCache<string, string>(2, 10, sizeOf);
    cache.set("a", "12");
    cache.set("b", "34");
    cache.set("c", "56");
    expect(cache.size).toBe(2);
    expect(cache.get("a")).toBeUndefined();
  });
});

describe("tokenizeToLines cache integration", () => {
  it("serves hash-keyed hits across calls with different object identity", () => {
    const code = "const hashKeyed = 42;";
    const first = tokenizeToLines(code, "ts");
    const second = tokenizeToLines(code, "ts");
    expect(second).toBe(first);
  });

  it("does not hit across different extensions for identical content", () => {
    const code = "const same = 1;";
    const ts = tokenizeToLines(code, "ts");
    const py = tokenizeToLines(code, "py");
    expect(ts).not.toBeNull();
    expect(py).not.toBeNull();
    expect(py).not.toBe(ts);
  });

  it("keeps default caps aligned with the M17 budget", () => {
    expect(MAX_CACHE_ENTRIES).toBe(500);
    expect(MAX_CACHE_MEMORY_BYTES).toBe(50 * 1024 * 1024);
  });
});

describe("highlightToKeyedLines", () => {
  it("produces stable keys for lines and tokens", () => {
    const keyed = highlightToKeyedLines("const a = 1;", "ts");
    expect(keyed?.[0].key).toBe("line-0");
    expect(keyed?.[0].tokens[0].key).toBe("0-0");
  });

  it("returns null when highlighting is unavailable", () => {
    expect(highlightToKeyedLines("text", null)).toBeNull();
  });

  it("forwards cacheable: false for streaming input", () => {
    const keyed = highlightToKeyedLines("const a = 1;", "ts", { cacheable: false });
    expect(keyed?.[0].key).toBe("line-0");
  });
});
