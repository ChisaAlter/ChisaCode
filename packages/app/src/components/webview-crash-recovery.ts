/**
 * Crash-recovery policy for the browser pane's webview renderer process.
 *
 * The webview emits `render-process-gone` on renderer crashes. Auto-reload
 * follows an exponential backoff; attempts are capped inside a sliding window
 * so a crash loop converges on the manual reload overlay instead of spinning
 * forever.
 */
export interface WebviewCrashRecoveryOptions {
  /** Backoff delays in ms per attempt. Default [250, 500, 1000]. */
  delays?: number[];
  /** Sliding window over which attempts are counted. Default 30s. */
  windowMs?: number;
  /** Maximum auto-reload attempts per window. Default delays.length. */
  maxAttempts?: number;
}

export interface WebviewCrashRecovery {
  /**
   * Records a crash and returns the backoff delay before reloading, or null
   * when the attempt budget is exhausted (show the manual overlay).
   */
  onCrash(): { reloadAfterMs: number } | null;
  /** Clears the attempt history (e.g. after a successful reload). */
  reset(): void;
}

export function createWebviewCrashRecovery(
  options: WebviewCrashRecoveryOptions = {},
): WebviewCrashRecovery {
  const delays = options.delays ?? [250, 500, 1_000];
  const windowMs = options.windowMs ?? 30_000;
  const maxAttempts = options.maxAttempts ?? delays.length;
  let crashTimes: number[] = [];

  return {
    onCrash() {
      const now = Date.now();
      crashTimes = crashTimes.filter((time) => now - time < windowMs);
      if (crashTimes.length >= maxAttempts) {
        return null;
      }
      const attemptIndex = crashTimes.length;
      const delay = delays[Math.min(attemptIndex, delays.length - 1)] ?? delays[0] ?? 250;
      crashTimes.push(now);
      return { reloadAfterMs: delay };
    },
    reset() {
      crashTimes = [];
    },
  };
}
