import { describe, expect, test } from "vitest";
import { applyAgentPresetToDraft } from "./apply-preset";

describe("applyAgentPresetToDraft", () => {
  test("fills a draft without starting an agent", () => {
    expect(
      applyAgentPresetToDraft(
        { provider: "codex" },
        {
          id: "review",
          label: "Review",
          description: "",
          provider: "default",
          modeId: "read-only",
          systemPrompt: "Review carefully",
          samplePrompts: ["Review this diff"],
        },
      ),
    ).toEqual({
      provider: "codex",
      modeId: "read-only",
      model: null,
      systemPrompt: "Review carefully",
      samplePrompt: "Review this diff",
      mcpServerIds: undefined,
    });
  });
});
