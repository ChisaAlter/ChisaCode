import { describe, expect, it } from "vitest";

import { THEME_PREVIEWS, THEME_SWATCHES, chisakiTheme, liquidNeonTheme } from "./theme";

describe("liquid neon theme surfaces", () => {
  it("uses the workspace surface as the base for sidebar and settings chrome", () => {
    expect(liquidNeonTheme.colors.surface0).toBe(liquidNeonTheme.colors.surfaceWorkspace);
    expect(liquidNeonTheme.colors.surfaceSidebar).toBe(liquidNeonTheme.colors.surfaceWorkspace);
    expect(THEME_PREVIEWS["liquid-neon"].surface).toBe(liquidNeonTheme.colors.surfaceWorkspace);
  });
});

describe("chisaki theme surfaces", () => {
  it("uses a layered ribbon palette instead of red borders on white chrome", () => {
    expect(chisakiTheme.colors.surface0).toBe("#fff8f8");
    expect(chisakiTheme.colors.surfaceWorkspace).toBe("#fffafa");
    expect(chisakiTheme.colors.surfaceSidebar).toBe("#f3eaec");
    expect(chisakiTheme.colors.surfaceSidebarHover).toBe("#eadadd");

    expect(chisakiTheme.colors.border).toBe("#eadadd");
    expect(chisakiTheme.colors.borderAccent).toBe("#d7a6ad");
    expect(chisakiTheme.colors.accent).toBe("#b51d2a");
    expect(chisakiTheme.colors.accentBright).toBe("#e04755");
  });

  it("keeps theme previews and terminal highlights aligned to the ribbon accent", () => {
    expect(THEME_SWATCHES.chisaki).toBe(chisakiTheme.colors.accent);
    expect(THEME_PREVIEWS.chisaki).toEqual({
      surface: chisakiTheme.colors.surface0,
      border: chisakiTheme.colors.borderAccent,
      line: chisakiTheme.colors.surface3,
      accent: chisakiTheme.colors.accent,
    });
    expect(chisakiTheme.colors.terminal.cursor).toBe(chisakiTheme.colors.accent);
    expect(chisakiTheme.colors.terminal.selectionBackground).toBe("rgba(181, 29, 42, 0.18)");
  });
});
