import { describe, expect, test } from "vitest";
import { AGENT_PROVIDER_IDS, BUILTIN_PROVIDER_IDS } from "./provider-manifest.js";

describe("provider manifest compatibility", () => {
  test("includes Grok Build as a built-in provider", () => {
    expect(BUILTIN_PROVIDER_IDS).toContain("grokbuild");
  });

  test("keeps AGENT_PROVIDER_IDS as the legacy alias for built-in providers", () => {
    expect(AGENT_PROVIDER_IDS).toBe(BUILTIN_PROVIDER_IDS);
  });
});
