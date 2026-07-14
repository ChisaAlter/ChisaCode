import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connectToDaemon: vi.fn(),
}));

vi.mock("./utils/client.js", () => ({
  connectToDaemon: mocks.connectToDaemon,
}));

import { createCli } from "./cli.js";
import { runUsageSummaryCommandWithDependencies } from "./commands/usage/summary.js";

describe("usage CLI commands", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mocks.connectToDaemon.mockReset();
  });

  it("fetches a seven-day usage summary through the daemon client", async () => {
    const fetchUsageSummary = vi.fn(async () => ({
      requestId: "usage-summary",
      summary: {
        rangeDays: 7 as const,
        generatedAt: "2026-07-14T00:00:00.000Z",
        totals: {
          inputTokens: 10,
          cachedInputTokens: 2,
          outputTokens: 5,
          totalTokens: 15,
          turnCount: 1,
          messageCount: 2,
          activeDays: 1,
          currentStreakDays: 1,
        },
        mostUsedModel: {
          model: "gpt-5.4",
          totalTokens: 15,
          turnCount: 1,
          percentage: 100,
        },
        daily: [],
        models: [],
      },
    }));
    const close = vi.fn(async () => undefined);
    mocks.connectToDaemon.mockResolvedValue({ fetchUsageSummary, close });
    const output: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      output.push(String(chunk));
      return true;
    });
    const program = createCli().exitOverride();
    program.configureOutput({ writeErr: () => undefined, writeOut: () => undefined });

    await program.parseAsync([
      "node",
      "chisacode",
      "usage",
      "summary",
      "--range",
      "7",
      "--host",
      "127.0.0.1:6767",
      "--json",
    ]);

    expect(mocks.connectToDaemon).toHaveBeenCalledWith({ host: "127.0.0.1:6767" });
    expect(fetchUsageSummary).toHaveBeenCalledWith({ rangeDays: 7 });
    expect(close).toHaveBeenCalledTimes(1);
    expect(JSON.parse(output.join(""))).toMatchObject({
      rangeDays: 7,
      totals: { totalTokens: 15 },
      mostUsedModel: { model: "gpt-5.4" },
    });
  });

  it("rejects an unsupported range before connecting", async () => {
    const connect = vi.fn();

    await expect(
      runUsageSummaryCommandWithDependencies({ range: "14" }, new Command(), { connect }),
    ).rejects.toThrow("--range");
    expect(connect).not.toHaveBeenCalled();
  });
});
