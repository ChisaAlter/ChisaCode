import { describe, expect, test } from "vitest";
import { AGENT_PROVIDER_IDS, BUILTIN_PROVIDER_IDS } from "./provider-manifest.js";

describe("provider manifest compatibility", () => {
  test("keeps AGENT_PROVIDER_IDS as the legacy alias for built-in providers", () => {
    expect(AGENT_PROVIDER_IDS).toBe(BUILTIN_PROVIDER_IDS);
  });
});
