import { describe, expect, test } from "vitest";

import { buildWorkspaceDraftAgentConfig } from "@/screens/workspace/workspace-draft-agent-config";
import { validateDraftSubmission } from "./workspace-tab-core";

const baseComposerState = {
  providerDefinitions: [{ id: "deepseek-tui" }],
  selectedProvider: "deepseek-tui",
  isModelLoading: false,
  effectiveModelId: "",
  availableModels: [],
};

function validate(overrides = {}) {
  return validateDraftSubmission({
    text: "hello",
    allowsEmptyAutoSubmit: false,
    composerState: baseComposerState,
    autoSubmitConfig: null,
    workspaceDirectory: "/tmp/project",
    hasClient: true,
    ...overrides,
  });
}

describe("workspace draft agent model validation", () => {
  test("allows a ready provider with no models to submit without a selected model", () => {
    expect(validate({})).toBeNull();
  });

  test("keeps waiting while model defaults are loading", () => {
    expect(
      validate({
        composerState: {
          ...baseComposerState,
          isModelLoading: true,
        },
      }),
    ).toBe("Model defaults are still loading");
  });

  test("still requires a selected model when the provider exposes models", () => {
    expect(
      validate({
        composerState: {
          ...baseComposerState,
          availableModels: [{ id: "deepseek/deepseek-v4-pro" }],
        },
      }),
    ).toBe("No model is available for the selected provider");
  });

  test("keeps agent provider separate from runtime provider in create config", () => {
    expect(
      buildWorkspaceDraftAgentConfig({
        provider: "claude",
        runtimeProvider: "deepseek-claude",
        cwd: "/tmp/project",
        model: "deepseek-r1",
      } as Parameters<typeof buildWorkspaceDraftAgentConfig>[0] & { runtimeProvider: string }),
    ).toMatchObject({
      provider: "claude",
      runtimeProvider: "deepseek-claude",
      model: "deepseek-r1",
    });
  });
});
