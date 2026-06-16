import { describe, expect, it } from "vitest";

import { THEME_PREVIEWS, liquidNeonTheme } from "./theme";

describe("liquid neon theme surfaces", () => {
  it("uses the workspace surface as the base for sidebar and settings chrome", () => {
    expect(liquidNeonTheme.colors.surface0).toBe(liquidNeonTheme.colors.surfaceWorkspace);
    expect(liquidNeonTheme.colors.surfaceSidebar).toBe(liquidNeonTheme.colors.surfaceWorkspace);
    expect(THEME_PREVIEWS["liquid-neon"].surface).toBe(liquidNeonTheme.colors.surfaceWorkspace);
  });
});
