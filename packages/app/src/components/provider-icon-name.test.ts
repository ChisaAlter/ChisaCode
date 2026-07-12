import { describe, expect, it } from "vitest";
import { resolveProviderIconName } from "./provider-icon-name";

describe("resolveProviderIconName", () => {
  it("returns the built-in identifier for known provider ids", () => {
    expect(resolveProviderIconName("claude")).toEqual({ kind: "builtin", id: "claude" });
    expect(resolveProviderIconName("codex")).toEqual({ kind: "builtin", id: "codex" });
  });

  it("falls back to the bot icon for legacy and custom providers", () => {
    expect(resolveProviderIconName("kiro")).toEqual({ kind: "bot" });
    expect(resolveProviderIconName("amp-acp")).toEqual({ kind: "bot" });
    expect(resolveProviderIconName("custom-claude-profile")).toEqual({ kind: "bot" });
  });
});
