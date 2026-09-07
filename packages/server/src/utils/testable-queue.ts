/**
 * Testable Queue Pattern - DrainableWorker inspired by T3code
 *
 * Enables deterministic testing by awaiting queue completion
 * instead of using setTimeout/sleep.
 *
 * Usage:
 *
 * ```typescript
 * const queue = new TestableQueue()
 *
 * // In production code
 * queue.enqueue(async () => {
 *   await processAgent()
 * })
 *
 * // In tests
 * await queue.drain() // Wait for all tasks to complete
 * expect(agent.status).toBe('idle')
 * ```
 */

export class TestableQueue {
  private pending = 0;
  private drainPromise: Promise<void> | null = null;
  private drainResolve: (() => void) | null = null;

  /**
   * Enqueue a task and track its lifecycle
   */
  enqueue<T>(fn: () => Promise<T>): Promise<T> {
    this.pending++;

    return fn().finally(() => {
      this.pending--;
      if (this.pending === 0 && this.drainResolve) {
        this.drainResolve();
        this.drainPromise = null;
        this.drainResolve = null;
      }
    });
  }

  /**
   * Wait until all enqueued tasks complete
   * Returns immediately if queue is already empty
   */
  async drain(timeoutMs = 30000): Promise<void> {
    if (this.pending === 0) {
      return Promise.resolve();
    }

    if (!this.drainPromise) {
      this.drainPromise = new Promise<void>((resolve) => {
        this.drainResolve = resolve;
      });
    }

    // Add timeout to prevent hanging tests
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(
          new Error(
            `Queue drain timeout after ${timeoutMs}ms (${this.pending} tasks still pending)`,
          ),
        );
      }, timeoutMs);
    });

    return Promise.race([this.drainPromise, timeout]);
  }

  /**
   * Get current pending task count (useful for debugging)
   */
  getPending(): number {
    return this.pending;
  }

  /**
   * Check if queue is empty
   */
  isEmpty(): boolean {
    return this.pending === 0;
  }
}

/**
 * Testable Worker - wraps a work function with queue tracking
 *
 * Usage:
 *
 * ```typescript
 * const worker = new TestableWorker(async (task) => {
 *   await processTask(task)
 * })
 *
 * worker.schedule(task1)
 * worker.schedule(task2)
 *
 * await worker.drain() // Wait for all work to complete
 * ```
 */
export class TestableWorker<T> {
  private queue = new TestableQueue();

  constructor(private workFn: (task: T) => Promise<void>) {}

  /**
   * Schedule work on this worker
   */
  schedule(task: T): Promise<void> {
    return this.queue.enqueue(() => this.workFn(task));
  }

  /**
   * Wait for all scheduled work to complete
   */
  drain(timeoutMs?: number): Promise<void> {
    return this.queue.drain(timeoutMs);
  }

  /**
   * Check if worker is idle
   */
  isIdle(): boolean {
    return this.queue.isEmpty();
  }
}
