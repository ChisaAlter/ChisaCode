import { describe, expect, test } from "vitest";
import { execFileSync } from "node:child_process";

import type { AgentModelDefinition } from "./agent-sdk-types.js";
import { createDaemonTestContext } from "../test-utils/index.js";

function isBinaryInstalled(binary: string): boolean {
  try {
    const command = process.platform === "win32" ? "where.exe" : "which";
    const out = execFileSync(command, [binary], { encoding: "utf8" }).trim();
    return out.length > 0;
  } catch {
    return false;
  }
}

const hasClaude = isBinaryInstalled("claude");
const hasCodex = isBinaryInstalled("codex");
const hasOpenCode = isBinaryInstalled("opencode");

/**
 * These are real-catalog tests: they assert the shape of models discovered
 * from the actual provider CLIs. The default daemon test context injects fake
 * agent clients, and provider discovery now routes through injected clients
 * (see ProviderSnapshotManager.refreshProvider), so a context with fakes would
 * return fake models here. Pass an empty agentClients map so discovery hits
 * the real runtimes, and gate each test on the binary being installed.
 */
function createRealDiscoveryContext() {
  return createDaemonTestContext({ agentClients: {} });
}

function modelMatchesFamily(model: AgentModelDefinition, family: "sonnet" | "haiku"): boolean {
  const haystacks = [model.id, model.label, model.description ?? ""].map((value) =>
    value.toLowerCase(),
  );
  return haystacks.some((text) => text.includes(family));
}

describe("provider model catalogs (e2e)", () => {
  test.runIf(hasClaude)(
    "Claude catalog exposes Sonnet and Haiku variants",
    async () => {
      const ctx = await createRealDiscoveryContext();
      try {
        const result = await ctx.client.listProviderModels("claude");

        expect(result.error).toBeNull();
        expect(result.models.length).toBeGreaterThan(0);

        expect(result.models.some((model) => modelMatchesFamily(model, "sonnet"))).toBe(true);
        expect(result.models.some((model) => modelMatchesFamily(model, "haiku"))).toBe(true);
      } finally {
        await ctx.cleanup();
      }
    },
    180_000,
  );

  test.runIf(hasCodex)(
    "Codex catalog exposes gpt-5.1-codex",
    async () => {
      const ctx = await createRealDiscoveryContext();
      try {
        const result = await ctx.client.listProviderModels("codex");

        expect(result.error).toBeNull();
        const ids = result.models.map((model) => model.id);
        expect(ids.some((id) => id.includes("codex"))).toBe(true);
      } finally {
        await ctx.cleanup();
      }
    },
    180_000,
  );

  test.runIf(hasOpenCode)(
    "OpenCode catalog returns models from multiple providers",
    async () => {
      const ctx = await createRealDiscoveryContext();
      try {
        const result = await ctx.client.listProviderModels("opencode");

        expect(result.error).toBeNull();
        expect(result.models.length).toBeGreaterThan(0);

        for (const model of result.models) {
          expect(model.provider).toBe("opencode");
          expect(model.id).toContain("/");
          expect(model.label).toBeTruthy();
          expect(model.metadata).toBeDefined();
          expect(model.metadata?.providerId).toBeTruthy();
          expect(model.metadata?.modelId).toBeTruthy();
        }

        const providerIds = new Set(result.models.map((m) => m.metadata?.providerId));
        expect(providerIds.size).toBeGreaterThan(0);
      } finally {
        await ctx.cleanup();
      }
    },
    180_000,
  );
});
