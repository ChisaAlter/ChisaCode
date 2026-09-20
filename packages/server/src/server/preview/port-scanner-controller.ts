import path from "node:path";
import type { DiscoveredPort } from "./port-scanner.js";

export interface PortScannerControllerOptions {
  /** Minimum interval between actual system scans. Default 15s. */
  cacheTtlMs?: number;
  /** How often subscribers are notified with the (possibly cached) snapshot. Default 3s. */
  notifyIntervalMs?: number;
  scanFn?: () => DiscoveredPort[];
  timers?: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout };
}

type Subscriber = (ports: DiscoveredPort[]) => void;

// Temporary diagnostics: file-based because the packaged daemon worker's
// stdout does not reach the gate harness. Enabled outside production builds.
function debugLog(message: string): void {
  if (process.env.NODE_ENV === "production") {
    return;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { appendFileSync } = require("node:fs") as typeof import("node:fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const os = require("node:os") as typeof import("node:os");
    appendFileSync(
      path.join(os.tmpdir(), "chisacode-port-scanner-debug.log"),
      `${new Date().toISOString()} ${message}\n`,
    );
  } catch {
    // Diagnostics only.
  }
}

/**
 * Reference-counted scanner for the daemon host's listening TCP ports.
 *
 * The daemon only enumerates listeners (netstat/lsof are dependable from its
 * worker); it deliberately does NOT probe them over HTTP — the Electron
 * RUN_AS_NODE binary cannot read loopback HTTP responses from its own process
 * (global fetch hangs forever, node:http connects but never receives data).
 * HTML filtering happens on the consumer side (the renderer's Chromium stack
 * probes before display).
 *
 * System scans run at most once per cacheTtl; subscribers receive the cached
 * snapshot on the notify interval, and scanning stops entirely when the last
 * subscriber releases.
 */
export class PortScannerController {
  private readonly cacheTtlMs: number;
  private readonly notifyIntervalMs: number;
  private readonly scanFn: () => DiscoveredPort[];
  private readonly timers: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout };

  private subscribers = new Set<Subscriber>();
  private cachedPorts: DiscoveredPort[] = [];
  private cachedAt = 0;
  private refCount = 0;
  private notifyTimer: ReturnType<typeof setTimeout> | null = null;
  private scanning = false;

  constructor(options: PortScannerControllerOptions = {}) {
    this.cacheTtlMs = options.cacheTtlMs ?? 15_000;
    this.notifyIntervalMs = options.notifyIntervalMs ?? 3_000;
    this.scanFn = options.scanFn ?? (() => []);
    this.timers = options.timers ?? { setTimeout, clearTimeout };
  }

  /**
   * Registers a subscriber and starts polling when this is the first one.
   * @param subscriber Called with the current snapshot on every notify tick
   * @returns An unsubscribe function
   */
  subscribe(subscriber: Subscriber): () => void {
    this.subscribers.add(subscriber);
    this.refCount += 1;
    if (this.refCount === 1) {
      void this.refresh();
      this.notifyTimer = this.timers.setTimeout(() => {
        this.notifyTick();
      }, this.notifyIntervalMs);
    }
    subscriber(this.cachedPorts);
    return () => {
      this.subscribers.delete(subscriber);
      this.refCount = Math.max(0, this.refCount - 1);
      if (this.refCount === 0 && this.notifyTimer !== null) {
        this.timers.clearTimeout(this.notifyTimer);
        this.notifyTimer = null;
      }
    };
  }

  /**
   * Current cached snapshot without subscribing.
   * @returns The most recent discovered ports
   */
  getPorts(): DiscoveredPort[] {
    return this.cachedPorts;
  }

  /** Stops all polling and clears the cache. Intended for daemon shutdown. */
  stop(): void {
    if (this.notifyTimer !== null) {
      this.timers.clearTimeout(this.notifyTimer);
      this.notifyTimer = null;
    }
    this.subscribers.clear();
    this.refCount = 0;
    this.cachedPorts = [];
    this.cachedAt = 0;
  }

  private notifyTick(): void {
    void this.refresh();
    for (const subscriber of this.subscribers) {
      subscriber(this.cachedPorts);
    }
    if (this.refCount > 0) {
      this.notifyTimer = this.timers.setTimeout(() => {
        this.notifyTick();
      }, this.notifyIntervalMs);
    }
  }

  private async refresh(): Promise<void> {
    if (this.scanning || Date.now() - this.cachedAt < this.cacheTtlMs) {
      return;
    }
    this.scanning = true;
    debugLog("refresh start");
    try {
      const listening = this.scanFn();
      debugLog(
        `scanFn returned ${listening.length} ports: ${listening.map((p) => p.port).join(",")}`,
      );
      // No daemon-side HTTP probe here (see class doc): sorted listener list
      // goes straight to subscribers; the renderer filters for HTML. A
      // transient empty scan (child-process flake under AV interference)
      // keeps the previous snapshot rather than blanking subscribers.
      if (listening.length > 0 || this.cachedPorts.length === 0) {
        this.cachedPorts = [...listening].sort((a, b) => a.port - b.port);
        this.cachedAt = Date.now();
      }
      if (this.refCount > 0) {
        for (const subscriber of this.subscribers) {
          subscriber(this.cachedPorts);
        }
      }
    } finally {
      this.scanning = false;
    }
  }
}
