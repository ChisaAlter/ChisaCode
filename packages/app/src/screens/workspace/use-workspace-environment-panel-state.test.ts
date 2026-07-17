import { describe, expect, it } from "vitest";

import { shouldAutoShowEnvironmentPanel } from "./use-workspace-environment-panel-state";

describe("shouldAutoShowEnvironmentPanel", () => {
  it("shows the 240px inspector in a 1000px desktop workspace", () => {
    expect(shouldAutoShowEnvironmentPanel(1000, 240)).toBe(true);
  });

  it("hides the inspector when it would reduce chat below the minimum width", () => {
    expect(shouldAutoShowEnvironmentPanel(640, 240)).toBe(false);
  });
});
