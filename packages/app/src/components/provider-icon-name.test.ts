import { describe, expect, it } from "vitest";
import { resolveProviderIconName } from "./provider-icon-name";

describe("resolveProviderIconName", () => {
  it("returns the built-in identifier for known provider ids", () => {
    expect(resolveProviderIconName("claude")).toEqual({ kind: "builtin", id: "claude" });
    expect(resolveProviderIconName("codex")).toEqual({ kind: "builtin", id: "codex" });
  });

  it("maps custom providers that extend a built-in family to that family's icon", () => {
    expect(resolveProviderIconName("deepseek-codex")).toEqual({ kind: "builtin", id: "codex" });
    expect(resolveProviderIconName("custom-claude-profile")).toEqual({
      kind: "builtin",
      id: "claude",
    });
    expect(resolveProviderIconName("Codex")).toEqual({ kind: "builtin", id: "codex" });
  });

  it("falls back to the bot icon for unknown providers", () => {
    expect(resolveProviderIconName("kiro")).toEqual({ kind: "bot" });
    expect(resolveProviderIconName("amp-acp")).toEqual({ kind: "bot" });
    expect(resolveProviderIconName("sleepy-beaver")).toEqual({ kind: "bot" });
  });
});
