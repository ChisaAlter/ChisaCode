import { describe, expect, it } from "vitest";

import {
  ACTIVE_THEME_NAMES,
  ANDROID_FALLBACK_THEME,
  ANDROID_THEME_OPTIONS,
  LEGACY_THEME_MIGRATIONS,
  THEME_PICKER_OPTIONS,
  THEME_PREVIEWS,
  THEME_SWATCHES,
  THEME_TO_UNISTYLES,
  aemeathTheme,
  chisakiTheme,
  darkTheme,
  lightTheme,
  liquidNeonTheme,
} from "./theme";

describe("theme catalog", () => {
  it("exposes exactly the five product themes in product order", () => {
    expect(ACTIVE_THEME_NAMES).toEqual(["light", "dark", "liquid-neon", "chisaki", "aemeath"]);
    expect(THEME_PICKER_OPTIONS).toEqual(["auto", ...ACTIVE_THEME_NAMES]);
  });

  it("shares the complete catalog with Android and defaults Android to light", () => {
    expect(ANDROID_THEME_OPTIONS).toEqual(THEME_PICKER_OPTIONS);
    expect(ANDROID_FALLBACK_THEME).toBe("light");
  });

  it("maps every legacy dark theme to cyber dark", () => {
    expect(LEGACY_THEME_MIGRATIONS).toEqual({
      zinc: "dark",
      midnight: "dark",
      claude: "dark",
      ghostty: "dark",
    });
  });

  it("registers runtime mappings only for active product themes", () => {
    expect(Object.keys(THEME_TO_UNISTYLES)).toEqual(ACTIVE_THEME_NAMES);
  });
});

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
