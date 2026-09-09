import { describe, expect, it, vi } from "vitest";
import { createWebviewCrashRecovery } from "./webview-crash-recovery";

describe("createWebviewCrashRecovery", () => {
  it("returns the backoff sequence across successive crashes", () => {
    const recovery = createWebviewCrashRecovery({ windowMs: 30_000 });
    expect(recovery.onCrash()).toEqual({ reloadAfterMs: 250 });
    expect(recovery.onCrash()).toEqual({ reloadAfterMs: 500 });
    expect(recovery.onCrash()).toEqual({ reloadAfterMs: 1_000 });
  });

  it("returns null once the attempt budget is exhausted", () => {
    const recovery = createWebviewCrashRecovery({ windowMs: 30_000 });
    recovery.onCrash();
    recovery.onCrash();
    recovery.onCrash();
    expect(recovery.onCrash()).toBeNull();
    expect(recovery.onCrash()).toBeNull();
  });

  it("resets the attempt budget after the window expires", () => {
    vi.useFakeTimers();
    try {
      const recovery = createWebviewCrashRecovery({ windowMs: 30_000 });
      recovery.onCrash();
      recovery.onCrash();
      recovery.onCrash();
      expect(recovery.onCrash()).toBeNull();
      vi.advanceTimersByTime(31_000);
      expect(recovery.onCrash()).toEqual({ reloadAfterMs: 250 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("partial window expiry restores remaining budget", () => {
    vi.useFakeTimers();
    try {
      const recovery = createWebviewCrashRecovery({ windowMs: 30_000 });
      recovery.onCrash(); // t=0
      vi.advanceTimersByTime(31_000); // first attempt leaves the window
      recovery.onCrash(); // t=31s (attempt 1)
      recovery.onCrash(); // attempt 2
      recovery.onCrash(); // attempt 3 — budget of 3 is exhausted again
      expect(recovery.onCrash()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("reset clears the crash history entirely", () => {
    const recovery = createWebviewCrashRecovery({ windowMs: 30_000 });
    recovery.onCrash();
    recovery.onCrash();
    recovery.reset();
    expect(recovery.onCrash()).toEqual({ reloadAfterMs: 250 });
  });

  it("honors custom delays and caps at the last delay", () => {
    const recovery = createWebviewCrashRecovery({
      delays: [100, 200],
      windowMs: 60_000,
    });
    expect(recovery.onCrash()).toEqual({ reloadAfterMs: 100 });
    expect(recovery.onCrash()).toEqual({ reloadAfterMs: 200 });
    recovery.reset();
    recovery.onCrash();
    recovery.onCrash();
    recovery.onCrash();
    recovery.onCrash();
    expect(recovery.onCrash()).toBeNull();
  });

  it("supports a custom maxAttempts beyond the delay list length", () => {
    const recovery = createWebviewCrashRecovery({
      delays: [100],
      windowMs: 60_000,
      maxAttempts: 3,
    });
    expect(recovery.onCrash()).toEqual({ reloadAfterMs: 100 });
    expect(recovery.onCrash()).toEqual({ reloadAfterMs: 100 });
    expect(recovery.onCrash()).toEqual({ reloadAfterMs: 100 });
    expect(recovery.onCrash()).toBeNull();
  });
});
