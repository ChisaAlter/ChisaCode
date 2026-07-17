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

describe("small text contrast", () => {
  it("keeps readable subtle text separate from decorative faint color", () => {
    expect(lightTheme.colors.foregroundSubtleText).toBe(lightTheme.colors.foregroundMuted);
    expect(darkTheme.colors.foregroundSubtleText).toBe(darkTheme.colors.foregroundMuted);
    expect(chisakiTheme.colors.foregroundSubtleText).toBe(chisakiTheme.colors.foregroundMuted);
    expect(aemeathTheme.colors.foregroundSubtleText).toBe(aemeathTheme.colors.foregroundMuted);
    expect(liquidNeonTheme.colors.foregroundSubtleText).toBe("#9fb5d3");
  });
});

describe("liquid neon theme surfaces", () => {
  it("uses dark glass surfaces with cyan accent", () => {
    expect(liquidNeonTheme.colors.surface0).toBe("#06111f");
    expect(liquidNeonTheme.colors.accent).toBe("#00a3ff");
    expect(liquidNeonTheme.colors.accentBright).toBe("#63e6ff");
    expect(liquidNeonTheme.colorScheme).toBe("dark");
    expect(liquidNeonTheme.glass.shell).toBe("rgba(7, 14, 27, 0.3)");
    expect(lightTheme.glass.shell).toBe("transparent");
  });
});

describe("chisaki theme surfaces", () => {
  it("uses dark rose-black palette", () => {
    expect(chisakiTheme.colors.surface0).toBe("#09070a");
    expect(chisakiTheme.colors.accent).toBe("#b7132f");
    expect(chisakiTheme.colors.accentBright).toBe("#ff4b67");
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

describe("source design token parity", () => {
  const cases = [
    {
      name: "Blockchain Light",
      theme: lightTheme,
      expected: {
        surface0: "#f8fafc",
        surfaceWorkspace: "#ffffff",
        surfaceSidebar: "#f1f5f9",
        surface1: "#ffffff",
        surface2: "#f4f7fb",
        surface3: "#edf2f8",
        surfaceSidebarHover: "#eef4ff",
        border: "#dce5f0",
        borderAccent: "#cbd7e6",
        foreground: "#0f172a",
        foregroundMuted: "#64748b",
        foregroundFaint: "#94a3b8",
        accent: "#3b82f6",
        accentBright: "#6366f1",
        accentNeon: "#8b5cf6",
        success: "#16a34a",
        destructive: "#ef4444",
        backgroundCss: "#f8fafc",
        userBubbleGradient: "linear-gradient(135deg, #3b82f6, #6366f1 56%, #8b5cf6)",
      },
    },
    {
      name: "Cyber Dark",
      theme: darkTheme,
      expected: {
        surface0: "#090b11",
        surfaceWorkspace: "#0f1219",
        surfaceSidebar: "#0b0e14",
        surface1: "#121722",
        surface2: "#171d2a",
        surface3: "#202838",
        surfaceSidebarHover: "#1c2434",
        border: "#232b3a",
        borderAccent: "#30394c",
        foreground: "#e5e7eb",
        foregroundMuted: "#8994a8",
        foregroundFaint: "#596579",
        accent: "#6366f1",
        accentBright: "#818cf8",
        accentNeon: "#3b82f6",
        success: "#22c55e",
        destructive: "#ff4772",
        backgroundCss: "#090b11",
        userBubbleGradient:
          "linear-gradient(135deg, rgba(99, 102, 241, 0.92), rgba(59, 130, 246, 0.85))",
      },
    },
    {
      name: "Liquid Glass",
      theme: liquidNeonTheme,
      expected: {
        surface0: "#06111f",
        surfaceWorkspace: "rgba(8, 18, 32, 0.46)",
        surfaceSidebar: "rgba(255, 255, 255, 0.055)",
        surface1: "rgba(255, 255, 255, 0.09)",
        surface2: "rgba(255, 255, 255, 0.13)",
        surface3: "rgba(255, 255, 255, 0.19)",
        surfaceSidebarHover: "rgba(99, 230, 255, 0.13)",
        border: "rgba(255, 255, 255, 0.18)",
        borderAccent: "rgba(99, 230, 255, 0.32)",
        foreground: "#f7fbff",
        foregroundMuted: "#bfd0ea",
        foregroundFaint: "#8fa7c9",
        accent: "#00a3ff",
        accentBright: "#63e6ff",
        accentNeon: "#a855f7",
        success: "#68f6b4",
        destructive: "#ff6fbe",
        backgroundCss:
          "radial-gradient(circle at 12% -8%, rgba(0, 163, 255, 0.45), transparent 34%), radial-gradient(circle at 92% 10%, rgba(255, 79, 216, 0.3), transparent 30%), linear-gradient(150deg, #06111f 0%, #071726 46%, #0a0820 100%)",
        userBubbleGradient:
          "linear-gradient(135deg, rgba(0, 163, 255, 0.55), rgba(99, 230, 255, 0.32) 48%, rgba(168, 85, 247, 0.45))",
      },
    },
    {
      name: "Chisaki",
      theme: chisakiTheme,
      expected: {
        surface0: "#09070a",
        surfaceWorkspace: "#120d12",
        surfaceSidebar: "#0d090d",
        surface1: "#171116",
        surface2: "#211820",
        surface3: "#2b2028",
        surfaceSidebarHover: "#2a1721",
        border: "#34242d",
        borderAccent: "#56303c",
        foreground: "#f8eef2",
        foregroundMuted: "#b49da7",
        foregroundFaint: "#826c76",
        accent: "#b7132f",
        accentBright: "#ff4b67",
        accentNeon: "#ff3158",
        success: "#2dd49d",
        destructive: "#ff3158",
        backgroundCss: "#09070a",
        userBubbleGradient: "linear-gradient(135deg, #b7132f, #ff3158)",
      },
    },
    {
      name: "Aemeath",
      theme: aemeathTheme,
      expected: {
        surface0: "#fbfdff",
        surfaceWorkspace: "#ffffff",
        surfaceSidebar: "#fff8fc",
        surface1: "#fffefe",
        surface2: "#fff7fb",
        surface3: "#eef9ff",
        surfaceSidebarHover: "#f8edf5",
        border: "#f0e3eb",
        borderAccent: "#dbeef8",
        foreground: "#2b2028",
        foregroundMuted: "#806f7c",
        foregroundFaint: "#a2939f",
        accent: "#f2a7c8",
        accentBright: "#f6b3d0",
        accentNeon: "#9bdcf2",
        success: "#39af83",
        destructive: "#d94c78",
        backgroundCss: "#fbfdff",
        userBubbleGradient: "linear-gradient(135deg, #f2a7c8, #9bdcf2)",
      },
    },
  ] as const;

  it.each(cases)("matches $name tokens from web3-themes-v2.html", ({ theme, expected }) => {
    expect({
      surface0: theme.colors.surface0,
      surfaceWorkspace: theme.colors.surfaceWorkspace,
      surfaceSidebar: theme.colors.surfaceSidebar,
      surface1: theme.colors.surface1,
      surface2: theme.colors.surface2,
      surface3: theme.colors.surface3,
      surfaceSidebarHover: theme.colors.surfaceSidebarHover,
      border: theme.colors.border,
      borderAccent: theme.colors.borderAccent,
      foreground: theme.colors.foreground,
      foregroundMuted: theme.colors.foregroundMuted,
      foregroundFaint: theme.colors.foregroundFaint,
      accent: theme.colors.accent,
      accentBright: theme.colors.accentBright,
      accentNeon: theme.colors.accentNeon,
      success: theme.colors.success,
      destructive: theme.colors.destructive,
      backgroundCss: theme.colors.backgroundCss,
      userBubbleGradient: theme.colors.userBubbleGradient,
    }).toEqual(expected);
  });
});
