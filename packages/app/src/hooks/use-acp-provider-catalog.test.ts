import { describe, expect, it } from "vitest";
import { ACP_PROVIDER_CATALOG } from "@/data/acp-provider-catalog";
import { buildAcpProviderConfigPatch, getAcpProviderCatalog } from "./use-acp-provider-catalog";

const SUPPORTED_PROVIDER_IDS = ["claude", "codex", "opencode", "mimocode", "pi", "kimi"] as const;

function findProvider(id: string) {
  const entry = getAcpProviderCatalog().find((provider) => provider.id === id);
  if (!entry) {
    throw new Error(`Missing provider catalog entry: ${id}`);
  }
  return entry;
}

describe("provider catalog", () => {
  it("keeps only the supported built-in agent providers", () => {
    expect(getAcpProviderCatalog().map((entry) => entry.id)).toEqual(SUPPORTED_PROVIDER_IDS);
  });

  it("vendors provider entries with unique ids and concrete commands", () => {
    const ids = new Set<string>();

    for (const entry of ACP_PROVIDER_CATALOG) {
      expect(ids.has(entry.id)).toBe(false);
      ids.add(entry.id);
      expect(entry.title).not.toBe("");
      expect(entry.description).not.toBe("");
      expect(entry.installLink).toMatch(/^https:\/\//);
      expect(entry.command.length).toBeGreaterThan(0);
      expect(entry.command[0]).not.toBe("");
    }
  });

  it("maps a catalog entry to a supported daemon provider config patch", () => {
    expect(buildAcpProviderConfigPatch(findProvider("mimocode"))).toEqual({
      providers: {
        mimocode: {
          enabled: true,
          label: "MiMoCode",
          description: "Xiaomi's OpenCode-compatible coding agent",
          command: ["mimo"],
          env: {},
        },
      },
    });

    expect(buildAcpProviderConfigPatch(findProvider("kimi"))).toEqual({
      providers: {
        kimi: {
          enabled: true,
          label: "Kimi Code",
          description: "Moonshot AI's open-source terminal coding agent via ACP",
          command: ["kimi", "acp"],
          env: {},
        },
      },
    });
  });
});
