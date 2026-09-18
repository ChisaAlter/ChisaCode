import { highlightCode, type HighlightToken } from "@chisacode/highlight";

// Shared, theme-independent tokenization + cache for syntax highlighting.
// Used by markdown code blocks, file preview, and tool-call detail blocks
// (Edit diff / Write / Read). Colors are applied at render time, so the cache
// key is just (extension, content hash) and one entry serves both light and dark.

/** A highlight token paired with a stable render key */
export interface KeyedToken {
  key: string;
  token: HighlightToken;
}

/** A line of highlight tokens paired with a stable render key */
export interface KeyedLine {
  key: string;
  tokens: KeyedToken[];
}

// Above this, highlighting a whole document on the main thread risks a visible
// stall when a large Read/Write block is expanded. Callers fall back to plain
// monospace text. Generous enough to cover the vast majority of real blocks.
export const MAX_HIGHLIGHT_CHARS = 100_000;

// Cache bounds (T3 port M17): entry count and an estimated memory ceiling.
// A single 100KB block tokenizes to roughly 200KB of tokens, so 50MB covers
// ~250 large blocks — realistic sessions stay far below that.
export const MAX_CACHE_ENTRIES = 500;
export const MAX_CACHE_MEMORY_BYTES = 50 * 1024 * 1024;

/**
 * fnv-1a 32-bit hash of the content, prefixed by the content length so two
 * inputs of different lengths can never share a cache key (collisions are
 * only possible within equal-length inputs).
 */
export function hashHighlightContent(content: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < content.length; i++) {
    hash ^= content.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${content.length.toString(36)}.${(hash >>> 0).toString(36)}`;
}

// Rough per-token overhead: object shape + style reference + array slot.
const TOKEN_OVERHEAD_BYTES = 64;
const LINE_OVERHEAD_BYTES = 32;

/** Estimates the retained size of a tokenized block for the memory cap. */
export function estimateHighlightedSize(lines: HighlightToken[][]): number {
  let bytes = 0;
  for (const line of lines) {
    bytes += LINE_OVERHEAD_BYTES;
    for (const token of line) {
      bytes += TOKEN_OVERHEAD_BYTES + token.text.length * 2;
    }
  }
  return bytes;
}

interface SizedEntry<V> {
  value: V;
  bytes: number;
}

export class LRUCache<K, V> {
  private readonly map = new Map<K, SizedEntry<V>>();
  private totalBytes = 0;

  constructor(
    private readonly maxEntries: number,
    private readonly maxBytes: number,
    private readonly sizeOf: (value: V) => number,
  ) {}

  get size(): number {
    return this.map.size;
  }

  get(key: K): V | undefined {
    const entry = this.map.get(key);
    if (entry === undefined) return undefined;
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V): void {
    const bytes = this.sizeOf(value);
    if (bytes > this.maxBytes) return;
    const existing = this.map.get(key);
    if (existing !== undefined) {
      this.totalBytes -= existing.bytes;
      this.map.delete(key);
    }
    while (this.map.size >= this.maxEntries || this.totalBytes + bytes > this.maxBytes) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.totalBytes -= this.map.get(oldest)?.bytes ?? 0;
      this.map.delete(oldest);
    }
    this.map.set(key, { value, bytes });
    this.totalBytes += bytes;
  }
}

const tokenizationCache = new LRUCache<string, HighlightToken[][]>(
  MAX_CACHE_ENTRIES,
  MAX_CACHE_MEMORY_BYTES,
  estimateHighlightedSize,
);

/**
 * Tokenizes code into per-line highlight tokens, cached by extension and content. Returns null when the language is
 * unsupported, the input is over the size cap, or parsing throws — callers then render plain text
 * @param code The source code to tokenize
 * @param ext The file extension used to select the grammar, or null to skip highlighting
 * @returns The per-line tokens, or null when highlighting is unavailable
 */
export function tokenizeToLines(
  code: string,
  ext: string | null,
  options: { cacheable?: boolean } = {},
): HighlightToken[][] | null {
  if (!ext) return null;
  if (code.length > MAX_HIGHLIGHT_CHARS) return null;
  const cacheKey = `${ext}:${hashHighlightContent(code)}`;
  const cached = tokenizationCache.get(cacheKey);
  if (cached) return cached;
  let lines: HighlightToken[][];
  try {
    lines = highlightCode(code, `x.${ext}`);
  } catch {
    return null;
  }
  // Streaming input must not pollute the shared LRU: half-rendered fence
  // content would evict completed blocks (reference implementation behavior).
  // An exact cache hit above is still safe — the key is a full-content hash, so
  // a hit can only be a finished block.
  if (options.cacheable !== false) {
    tokenizationCache.set(cacheKey, lines);
  }
  return lines;
}

function toKeyedLine(tokens: HighlightToken[], lineIndex: number): KeyedLine {
  return {
    key: `line-${lineIndex}`,
    tokens: tokens.map((token, tokenIndex) => ({
      key: `${lineIndex}-${tokenIndex}`,
      token,
    })),
  };
}

/**
 * Tokenizes code and wraps each line and token with a stable render key for list rendering
 * @param code The source code to tokenize
 * @param ext The file extension used to select the grammar, or null to skip highlighting
 * @param options When `cacheable` is false (streaming input), the result is
 *   not stored in the shared LRU (see tokenizeToLines)
 * @returns The keyed lines, or null when highlighting is unavailable
 */
export function highlightToKeyedLines(
  code: string,
  ext: string | null,
  options: { cacheable?: boolean } = {},
): KeyedLine[] | null {
  const lines = tokenizeToLines(code, ext, options);
  return lines ? lines.map(toKeyedLine) : null;
}

/**
 * Extracts the lowercase file extension for grammar selection from a file path. Only the suffix is needed, so
 * absolute and relative paths are equivalent here
 * @param filePath The file path to inspect
 * @returns The extension without a leading dot, or null when the path has none
 */
export function extensionFromPath(filePath: string | null | undefined): string | null {
  if (!filePath) return null;
  const name = filePath.split(/[\\/]/).pop() ?? filePath;
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return null;
  return name.slice(dot + 1).toLowerCase();
}
