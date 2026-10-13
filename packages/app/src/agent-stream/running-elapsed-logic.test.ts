import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RUNNING_ELAPSED_TICK_MS,
  formatRunningElapsedLabel,
  startRunningElapsedTicker,
} from "./running-elapsed-logic";

describe("formatRunningElapsedLabel", () => {
  it("formats non-negative elapsed durations", () => {
    expect(formatRunningElapsedLabel(1_000, 1_000)).toBe("0s");
    expect(formatRunningElapsedLabel(1_000, 6_500)).toBe("5s");
    expect(formatRunningElapsedLabel(1_000, 76_000)).toBe("1m 15s");
  });

  it("clamps negative clocks to zero", () => {
    expect(formatRunningElapsedLabel(5_000, 1_000)).toBe("0s");
  });
});

describe("startRunningElapsedTicker", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("publishes immediately and on each interval", () => {
    vi.useFakeTimers();
    const onTick = vi.fn();
    let now = 10_000;
    const ticker = startRunningElapsedTicker({
      startedAtMs: 10_000,
      now: () => now,
      onTick,
    });

    expect(onTick).toHaveBeenCalledTimes(1);
    expect(onTick).toHaveBeenLastCalledWith("0s");

    now = 11_500;
    vi.advanceTimersByTime(RUNNING_ELAPSED_TICK_MS);
    expect(onTick).toHaveBeenCalledTimes(2);
    expect(onTick).toHaveBeenLastCalledWith("1s");

    ticker.stop();
    now = 12_500;
    vi.advanceTimersByTime(RUNNING_ELAPSED_TICK_MS);
    expect(onTick).toHaveBeenCalledTimes(2);
  });

  it("clears the interval when stopped", () => {
    const clearIntervalFn = vi.fn();
    const setIntervalFn = vi.fn(() => 42 as unknown as ReturnType<typeof setInterval>);
    const ticker = startRunningElapsedTicker({
      startedAtMs: 0,
      onTick: () => undefined,
      setIntervalFn: setIntervalFn as unknown as typeof setInterval,
      clearIntervalFn: clearIntervalFn as unknown as typeof clearInterval,
    });
    expect(setIntervalFn).toHaveBeenCalledWith(expect.any(Function), RUNNING_ELAPSED_TICK_MS);
    ticker.stop();
    expect(clearIntervalFn).toHaveBeenCalledWith(42);
  });

  it("uses the default 1000ms tick", () => {
    const setIntervalFn = vi.fn(() => 1 as unknown as ReturnType<typeof setInterval>);
    const ticker = startRunningElapsedTicker({
      startedAtMs: 0,
      onTick: () => undefined,
      setIntervalFn: setIntervalFn as unknown as typeof setInterval,
      clearIntervalFn: () => undefined,
    });
    expect(setIntervalFn).toHaveBeenCalledWith(expect.any(Function), 1000);
    ticker.stop();
  });
});
