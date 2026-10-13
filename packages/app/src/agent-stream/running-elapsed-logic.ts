import { formatDuration } from "@/utils/time";

export const RUNNING_ELAPSED_TICK_MS = 1000;

/**
 * Formats the running-turn elapsed label for a given start/now pair.
 */
export function formatRunningElapsedLabel(startedAtMs: number, nowMs: number): string {
  return formatDuration(Math.max(0, nowMs - startedAtMs));
}

export interface RunningElapsedTicker {
  /** Clears the interval. */
  stop: () => void;
}

/**
 * Starts a 1s ticker that writes elapsed labels without React state.
 * Used by the web RunningElapsed path and covered by unit tests.
 */
export function startRunningElapsedTicker(input: {
  startedAtMs: number;
  now?: () => number;
  intervalMs?: number;
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
  onTick: (label: string) => void;
}): RunningElapsedTicker {
  const now = input.now ?? Date.now;
  const intervalMs = input.intervalMs ?? RUNNING_ELAPSED_TICK_MS;
  const setIntervalFn = input.setIntervalFn ?? setInterval;
  const clearIntervalFn = input.clearIntervalFn ?? clearInterval;

  const publish = () => {
    input.onTick(formatRunningElapsedLabel(input.startedAtMs, now()));
  };
  publish();
  const handle = setIntervalFn(publish, intervalMs);
  return {
    stop: () => {
      clearIntervalFn(handle);
    },
  };
}
