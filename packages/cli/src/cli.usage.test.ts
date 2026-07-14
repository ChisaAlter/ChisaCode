import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connectToDaemon: vi.fn(),
}));

vi.mock("./utils/client.js", () => ({
  connectToDaemon: mocks.connectToDaemon,
}));

import { createCli } from "./cli.js";
import { runUsageClearCommandWithDependencies } from "./commands/usage/clear.js";
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

  it("exports raw usage only to an explicit output file", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "chisacode-usage-cli-"));
    const outputPath = path.join(directory, "usage.json");
    const exportUsage = vi.fn(async () => ({
      requestId: "usage-export",
      format: "json" as const,
      filename: "chisacode-usage.json",
      content: '[{"inputTokens":10}]',
    }));
    const close = vi.fn(async () => undefined);
    mocks.connectToDaemon.mockResolvedValue({ exportUsage, close });
    const output: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      output.push(String(chunk));
      return true;
    });
    const program = createCli().exitOverride();
    program.configureOutput({ writeErr: () => undefined, writeOut: () => undefined });

    try {
      await program.parseAsync([
        "node",
        "chisacode",
        "usage",
        "export",
        "--type",
        "json",
        "--output",
        outputPath,
        "--host",
        "127.0.0.1:6767",
        "--json",
      ]);

      expect(exportUsage).toHaveBeenCalledWith({ format: "json" });
      expect(await readFile(outputPath, "utf8")).toBe('[{"inputTokens":10}]');
      expect(close).toHaveBeenCalledTimes(1);
      expect(JSON.parse(output.join(""))).toMatchObject({
        format: "json",
        outputPath,
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("clears usage only when --yes is explicit", async () => {
    const clearUsage = vi.fn(async () => ({ requestId: "usage-clear", cleared: true }));
    const close = vi.fn(async () => undefined);
    mocks.connectToDaemon.mockResolvedValue({ clearUsage, close });
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const program = createCli().exitOverride();
    program.configureOutput({ writeErr: () => undefined, writeOut: () => undefined });

    await program.parseAsync([
      "node",
      "chisacode",
      "usage",
      "clear",
      "--yes",
      "--host",
      "127.0.0.1:6767",
      "--json",
    ]);

    expect(clearUsage).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("rejects usage clearing before connecting when --yes is absent", async () => {
    const connect = vi.fn();

    await expect(
      runUsageClearCommandWithDependencies({}, new Command(), { connect }),
    ).rejects.toThrow("--yes");
    expect(connect).not.toHaveBeenCalled();
  });
});
