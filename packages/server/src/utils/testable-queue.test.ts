/**
 * Example test using TestableQueue for deterministic testing
 */

import { describe, it, expect, beforeEach } from "vitest";
import { TestableQueue, TestableWorker } from "../utils/testable-queue";

describe("TestableQueue", () => {
  let queue: TestableQueue;

  beforeEach(() => {
    queue = new TestableQueue();
  });

  it("should drain empty queue immediately", async () => {
    await queue.drain(); // Should resolve instantly
    expect(queue.isEmpty()).toBe(true);
  });

  it("should wait for tasks to complete", async () => {
    let completed = false;

    queue.enqueue(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      completed = true;
    });

    expect(completed).toBe(false);
    expect(queue.isEmpty()).toBe(false);

    await queue.drain();

    expect(completed).toBe(true);
    expect(queue.isEmpty()).toBe(true);
  });

  it("should track multiple tasks", async () => {
    const results: number[] = [];

    queue.enqueue(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      results.push(1);
    });

    queue.enqueue(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      results.push(2);
    });

    expect(queue.getPending()).toBe(2);

    await queue.drain();

    expect(results).toContain(1);
    expect(results).toContain(2);
    expect(queue.getPending()).toBe(0);
  });

  it("should timeout if tasks hang", async () => {
    queue.enqueue(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    });

    await expect(queue.drain(100)).rejects.toThrow("Queue drain timeout");
  });
});

describe("TestableWorker", () => {
  it("should process tasks and drain", async () => {
    const processed: string[] = [];

    const worker = new TestableWorker<string>(async (task) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      processed.push(task);
    });

    worker.schedule("task1");
    worker.schedule("task2");
    worker.schedule("task3");

    expect(worker.isIdle()).toBe(false);

    await worker.drain();

    expect(worker.isIdle()).toBe(true);
    expect(processed).toEqual(["task1", "task2", "task3"]);
  });
});

/**
 * Example: Agent lifecycle test using TestableQueue
 *
 * Before: flaky test with setTimeout
 * After: deterministic test with drain()
 */
describe("Agent lifecycle (example)", () => {
  it("completes agent run deterministically", async () => {
    // Simulate agent manager with testable queue
    const agentQueue = new TestableQueue();

    let agentStatus = "idle";

    // Simulate agent run
    agentQueue.enqueue(async () => {
      agentStatus = "running";
      await new Promise((resolve) => setTimeout(resolve, 50));
      agentStatus = "idle";
    });

    // BEFORE (flaky):
    // await new Promise(resolve => setTimeout(resolve, 1000)) // Arbitrary wait
    // expect(agentStatus).toBe('idle') // Might fail if agent takes longer

    // AFTER (deterministic):
    await agentQueue.drain(); // Wait for actual completion
    expect(agentStatus).toBe("idle"); // Always correct
  });
});
