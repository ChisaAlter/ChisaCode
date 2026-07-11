import { describe, expect, it } from "vitest";

import {
  THEME_PREVIEWS,
  THEME_SWATCHES,
  aemeathTheme,
  chisakiTheme,
  darkTheme,
  lightTheme,
  liquidNeonTheme,
} from "./theme";

describe("theme brightness", () => {
  it("exposes status bar brightness independently of the theme name", () => {
    expect(darkTheme.isDark).toBe(true);
    expect(liquidNeonTheme.isDark).toBe(true);
    expect(chisakiTheme.isDark).toBe(true);
    expect(lightTheme.isDark).toBe(false);
    expect(aemeathTheme.isDark).toBe(false);
  });
});

describe("liquid neon theme surfaces", () => {
  it("uses dark glass surfaces with cyan accent", () => {
    expect(liquidNeonTheme.colors.surface0).toBe("#06111f");
    expect(liquidNeonTheme.colors.accent).toBe("#00A3FF");
    expect(liquidNeonTheme.colors.accentBright).toBe("#63E6FF");
    expect(liquidNeonTheme.colorScheme).toBe("dark");
  });
});

describe("chisaki theme surfaces", () => {
  it("uses dark rose-black palette", () => {
    expect(chisakiTheme.colors.surface0).toBe("#09070A");
    expect(chisakiTheme.colors.accent).toBe("#B7132F");
    expect(chisakiTheme.colors.accentBright).toBe("#FF4B67");
    expect(chisakiTheme.colorScheme).toBe("dark");
  });

  it("keeps theme previews and terminal highlights aligned to the accent", () => {
    expect(THEME_SWATCHES.chisaki).toBe(chisakiTheme.colors.accent);
    expect(THEME_PREVIEWS.chisaki).toEqual({
      surface: chisakiTheme.colors.surface0,
      border: chisakiTheme.colors.borderAccent,
      line: chisakiTheme.colors.surface3,
      accent: chisakiTheme.colors.accent,
    });
    expect(chisakiTheme.colors.terminal.cursor).toBe("#fafafa");
  });
});
