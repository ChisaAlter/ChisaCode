import { darkHighlightColors, lightHighlightColors } from "@chisacode/highlight";

export const baseColors = {
  // Base colors
  white: "#ffffff",
  black: "#000000",

  // Zinc scale (primary gray palette)
  zinc: {
    50: "#fafafa",
    100: "#f4f4f5",
    200: "#e4e4e7",
    300: "#d4d4d8",
    400: "#a1a1aa",
    500: "#71717a",
    600: "#52525b",
    700: "#3f3f46",
    800: "#27272a",
    850: "#1a1a1d",
    900: "#18181b",
    950: "#121214",
  },

  // Gray scale
  gray: {
    50: "#f9fafb",
    100: "#f3f4f6",
    200: "#e5e7eb",
    300: "#d1d5db",
    400: "#9ca3af",
    500: "#6b7280",
    600: "#4b5563",
    700: "#374151",
    800: "#1f2937",
    900: "#111827",
  },

  // Slate scale
  slate: {
    200: "#e2e8f0",
  },

  // Blue scale
  blue: {
    50: "#eff6ff",
    100: "#dbeafe",
    200: "#bfdbfe",
    300: "#93c5fd",
    400: "#60a5fa",
    500: "#3b82f6",
    600: "#2563eb",
    700: "#1d4ed8",
    800: "#1e40af",
    900: "#1e3a8a",
    950: "#172554",
  },

  // Green scale
  green: {
    100: "#dcfce7",
    200: "#bbf7d0",
    400: "#4ade80",
    500: "#22c55e",
    600: "#16a34a",
    800: "#166534",
    900: "#14532d",
  },

  // Red scale
  red: {
    100: "#fee2e2",
    200: "#fecaca",
    300: "#fca5a5",
    500: "#ef4444",
    600: "#dc2626",
    800: "#991b1b",
    900: "#7f1d1d",
  },

  // Teal scale
  teal: {
    200: "#99f6e4",
  },

  // Amber scale
  amber: {
    500: "#f59e0b",
    700: "#b45309",
  },

  // Yellow scale
  yellow: {
    400: "#fbbf24",
  },

  // Purple scale
  purple: {
    500: "#a855f7",
    600: "#9333ea",
  },

  // Orange scale
  orange: {
    500: "#f97316",
    600: "#ea580c",
  },
} as const;

export const ACTIVE_THEME_NAMES = ["light", "dark", "liquid-neon", "chisaki", "aemeath"] as const;

export type ActiveThemeName = (typeof ACTIVE_THEME_NAMES)[number];
export type ThemeName = ActiveThemeName;

export const THEME_PICKER_OPTIONS = ["auto", ...ACTIVE_THEME_NAMES] as const;

export const LEGACY_THEME_MIGRATIONS = {
  zinc: "dark",
  midnight: "dark",
  claude: "dark",
  ghostty: "dark",
} as const satisfies Record<string, ActiveThemeName>;

export type LegacyThemeName = keyof typeof LEGACY_THEME_MIGRATIONS;

// Diff stat colors — light uses muted tones, dark uses the brighter palette values
const lightDiffColors = {
  diffAddition: "#15803d", // green-700 — readable on white without screaming
  diffDeletion: "#b91c1c", // red-700
  diffAdditionBg: "rgba(21, 128, 61, 0.12)", // green-700 at 12% opacity
  diffDeletionBg: "rgba(185, 28, 28, 0.10)", // red-700 at 10% opacity
  diffAdditionHighlightBg: "rgba(21, 128, 61, 0.35)", // green-700 at 35%
  diffDeletionHighlightBg: "rgba(185, 28, 28, 0.30)", // red-700 at 30%
};

const darkDiffColors = {
  diffAddition: "#4ade80", // green-400
  diffDeletion: "#ef4444", // red-500
  diffAdditionBg: "rgba(74, 222, 128, 0.15)", // green-400 at 15% opacity
  diffDeletionBg: "rgba(239, 68, 68, 0.10)", // red-500 at 10% opacity
  diffAdditionHighlightBg: "rgba(74, 222, 128, 0.40)", // green-400 at 40%
  diffDeletionHighlightBg: "rgba(239, 68, 68, 0.35)", // red-500 at 35%
};

// Overlay / backdrop mask — used by modals, sheets, and dropdown backdrops
const lightOverlay = "rgba(0, 0, 0, 0.25)";
const darkOverlay = "rgba(0, 0, 0, 0.50)";

// Status colors — semantic signals for success/danger/warning/merged. Used by
// check statuses, PR states, and review decisions. Kept a step darker than the
// raw palette so they read as signals, not neon.
const lightStatusColors = {
  statusSuccess: "#15803d", // green-700
  statusDanger: "#b91c1c", // red-700
  statusWarning: "#d97706", // amber-600
  statusMerged: "#7c3aed", // purple-600
  statusSuccessBg: "rgba(21, 128, 61, 0.12)", // green-700 at 12%
  statusWarningBg: "rgba(217, 119, 6, 0.12)", // amber-600 at 12%
  statusDangerBg: "rgba(185, 28, 28, 0.14)", // red-700 at 14%
};

const darkStatusColors = {
  statusSuccess: "#16a34a", // green-600
  statusDanger: "#dc2626", // red-600
  statusWarning: "#f59e0b", // amber-500
  statusMerged: "#9333ea", // purple-600
  statusSuccessBg: "rgba(22, 163, 74, 0.12)", // green-600 at 12%
  statusWarningBg: "rgba(245, 158, 11, 0.12)", // amber-500 at 12%
  statusDangerBg: "rgba(220, 38, 38, 0.14)", // red-600 at 14%
};

// Semantic color tokens - Layer-based system
const lightSemanticColors = {
  // Surfaces (layers) — Blockchain Light (蓝紫浅色)
  surface0: "#f8fafc",
  surface1: "#f1f5f9",
  surface2: "#e2e8f0",
  surface3: "#cbd5e1",
  surface4: "#94a3b8",
  surfaceDiffEmpty: "#f8fafc",
  surfaceSidebar: "#ffffff",
  surfaceSidebarHover: "#f1f5f9",
  surfaceWorkspace: "#ffffff",

  // Text
  foreground: "#0f172a",
  foregroundMuted: "#64748b",

  // Controls
  scrollbarHandle: "#3f3f46", // zinc-700

  // Borders
  border: "#e2e8f0",
  borderAccent: "#cbd5e1",

  // Brand
  accent: "#3B82F6", // blue-500
  accentBright: "#6366F1", // indigo-500
  accentForeground: "#ffffff",

  // Semantic
  destructive: "#ef4444",
  destructiveForeground: "#ffffff",
  success: "#20744A",
  successForeground: "#ffffff",
  overlay: lightOverlay,
  blockquoteBorder: "#3B82F6",

  // Legacy aliases (for gradual migration)
  background: "#f8fafc",
  popover: "#ffffff",
  popoverForeground: "#0f172a",
  primary: "#0f172a",
  primaryForeground: "#f8fafc",
  secondary: "#f1f5f9",
  secondaryForeground: "#0f172a",
  muted: "#f1f5f9",
  mutedForeground: "#64748b",
  accentBorder: "#cbd5e1",
  input: "#f1f5f9",
  ring: "#3B82F6",

  ...lightDiffColors,
  ...lightStatusColors,

  terminal: {
    background: "#f8fafc",
    foreground: "#0f172a",
    cursor: "#3B82F6",
    cursorAccent: "#ffffff",
    selectionBackground: "rgba(0, 0, 0, 0.15)",
    selectionForeground: "#0f172a",

    black: "#0f172a",
    red: "#dc2626",
    green: "#16a34a",
    yellow: "#ca8a04",
    blue: "#2563eb",
    magenta: "#9333ea",
    cyan: "#0891b2",
    white: "#ffffff",

    brightBlack: "#3f3f46",
    brightRed: "#ef4444",
    brightGreen: "#22c55e",
    brightYellow: "#f59e0b",
    brightBlue: "#3b82f6",
    brightMagenta: "#a855f7",
    brightCyan: "#06b6d4",
    brightWhite: "#fafafa",
  },
} as const;

// ---------------------------------------------------------------------------
// Dark theme variant builder
// ---------------------------------------------------------------------------

interface DarkThemeConfig {
  surface0: string;
  surface1: string;
  surface2: string;
  surface3: string;
  surface4: string;
  surfaceDiffEmpty: string;
  surfaceSidebar: string;
  surfaceSidebarHover: string;
  foregroundMuted: string;
  scrollbarHandle: string;
  border: string;
  borderAccent: string;
  accent: string;
  accentBright: string;
  accentForeground?: string;
  destructive: string;
  ringColor?: string;
}

const darkTerminalAnsi = {
  red: "#e07070",
  green: "#5dba80",
  yellow: "#d4a44a",
  blue: "#6a9de0",
  magenta: "#b07ad0",
  cyan: "#4aabb8",
  white: "#d4d4d8",
  brightRed: "#e89090",
  brightGreen: "#7ecf9a",
  brightYellow: "#e0be6e",
  brightBlue: "#8ab4e8",
  brightMagenta: "#c49ae0",
  brightCyan: "#6ec2cc",
  brightWhite: "#f0f0f2",
} as const;

function buildDarkSemanticColors(tint: DarkThemeConfig) {
  return {
    surface0: tint.surface0,
    surface1: tint.surface1,
    surface2: tint.surface2,
    surface3: tint.surface3,
    surface4: tint.surface4,
    surfaceDiffEmpty: tint.surfaceDiffEmpty,
    surfaceSidebar: tint.surfaceSidebar,
    surfaceSidebarHover: tint.surfaceSidebarHover,
    surfaceWorkspace: tint.surface1,

    foreground: "#fafafa",
    foregroundMuted: tint.foregroundMuted,

    scrollbarHandle: tint.scrollbarHandle,

    border: tint.border,
    borderAccent: tint.borderAccent,

    accent: tint.accent,
    accentBright: tint.accentBright,
    accentForeground: tint.accentForeground ?? "#ffffff",

    destructive: tint.destructive,
    destructiveForeground: "#ffffff",
    success: tint.accent,
    successForeground: "#ffffff",
    overlay: darkOverlay,
    blockquoteBorder: tint.accent, // match the theme accent color

    // Legacy aliases (for gradual migration)
    background: tint.surface0,
    popover: tint.surface2,
    popoverForeground: "#fafafa",
    primary: "#fafafa",
    primaryForeground: tint.surface0,
    secondary: tint.surface2,
    secondaryForeground: "#fafafa",
    muted: tint.surface2,
    mutedForeground: tint.foregroundMuted,
    accentBorder: tint.borderAccent,
    input: tint.surface2,
    ring: tint.ringColor ?? "#d4d4d8",

    ...darkDiffColors,
    ...darkStatusColors,

    terminal: {
      background: tint.surface0,
      foreground: "#fafafa",
      cursor: "#fafafa",
      cursorAccent: tint.surface0,
      selectionBackground: "rgba(255, 255, 255, 0.2)",
      selectionForeground: "#fafafa",
      black: tint.surfaceSidebar,
      ...darkTerminalAnsi,
      brightBlack: tint.surface3,
    },
  };
}

// ---------------------------------------------------------------------------
// Dark tint definitions
// ---------------------------------------------------------------------------

// Cyber Dark — 蓝紫暗色 (default)
const chisacodeDarkColors = buildDarkSemanticColors({
  surface0: "#0a0c10",
  surface1: "#12141c",
  surface2: "#1a1d28",
  surface3: "#252836",
  surface4: "#3a3d4e",
  surfaceDiffEmpty: "#12141c",
  surfaceSidebar: "#0e1018",
  surfaceSidebarHover: "#1a1d28",
  foregroundMuted: "#8b8fa3",
  scrollbarHandle: "#3a3d4e",
  border: "#252836",
  borderAccent: "#3a3d4e",
  accent: "#6366F1", // indigo-500
  accentBright: "#818CF8", // indigo-400
  destructive: "#ef4444",
  ringColor: "#6366F1",
});

const liquidNeonLightColors = {
  surface0: "#06111f",
  surface1: "#0a1628",
  surface2: "#0f1e34",
  surface3: "#1a2840",
  surface4: "#243450",
  surfaceDiffEmpty: "#0a1628",
  surfaceSidebar: "#081424",
  surfaceSidebarHover: "#0f1e34",
  surfaceWorkspace: "#091828",
  foreground: "#F7FBFF",
  foregroundMuted: "#BFD0EA",
  scrollbarHandle: "#243450",
  border: "rgba(255,255,255,0.20)",
  borderAccent: "rgba(99,230,255,0.34)",
  accent: "#00A3FF",
  accentBright: "#63E6FF",
  accentForeground: "#ffffff",
  destructive: "#FF4466",
  destructiveForeground: "#ffffff",
  success: "#00A3FF",
  successForeground: "#ffffff",
  overlay: darkOverlay,
  blockquoteBorder: "#00A3FF",
  background: "#06111f",
  popover: "#0f1e34",
  popoverForeground: "#F7FBFF",
  primary: "#F7FBFF",
  primaryForeground: "#06111f",
  secondary: "#0f1e34",
  secondaryForeground: "#F7FBFF",
  muted: "#0f1e34",
  mutedForeground: "#BFD0EA",
  accentBorder: "rgba(99,230,255,0.34)",
  input: "#0f1e34",
  ring: "#00A3FF",
  diffAddition: "#4ade80",
  diffDeletion: "#ef4444",
  diffAdditionBg: "rgba(74, 222, 128, 0.15)",
  diffDeletionBg: "rgba(239, 68, 68, 0.10)",
  diffAdditionHighlightBg: "rgba(74, 222, 128, 0.40)",
  diffDeletionHighlightBg: "rgba(239, 68, 68, 0.35)",
  statusSuccess: "#16a34a",
  statusDanger: "#dc2626",
  statusWarning: "#f59e0b",
  statusMerged: "#9333ea",
  statusSuccessBg: "rgba(22, 163, 74, 0.12)",
  statusWarningBg: "rgba(245, 158, 11, 0.12)",
  statusDangerBg: "rgba(220, 38, 38, 0.14)",
  terminal: {
    background: "#06111f",
    foreground: "#F7FBFF",
    cursor: "#63E6FF",
    cursorAccent: "#06111f",
    selectionBackground: "rgba(0,163,255,0.2)",
    selectionForeground: "#F7FBFF",
    black: "#081424",
    red: "#e07070",
    green: "#5dba80",
    yellow: "#d4a44a",
    blue: "#6a9de0",
    magenta: "#b07ad0",
    cyan: "#4aabb8",
    white: "#d4d4d8",
    brightRed: "#e89090",
    brightGreen: "#7ecf9a",
    brightYellow: "#e0be6e",
    brightBlue: "#8ab4e8",
    brightMagenta: "#c49ae0",
    brightCyan: "#6ec2cc",
    brightBlack: "#1a2840",
    brightWhite: "#F7FBFF",
  },
} as const;

export const SPACING = {
  0: 0,
  0.5: 2,
  1: 4,
  1.5: 6,
  2: 8,
  3: 12,
  4: 16,
  6: 24,
  8: 32,
  12: 48,
  16: 64,
  20: 80,
  24: 96,
  32: 128,
} as const;

export const FONT_SIZE = {
  xs: 12,
  code: 12,
  codeInline: 13, // base - 3 — inline code is slightly smaller than body text
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  "2xl": 22,
  "3xl": 26,
  "4xl": 34,
} as const;

export const LINE_HEIGHT = {
  diff: 22,
  // Markdown heading/body line heights (fixed px values for consistent rendering)
  heading1: 32,
  heading2: 28,
  heading3: 26,
  heading4: 24,
  heading5: 22,
  heading6: 20,
  body: 22,
  listItem: 22,
} as const;

export const ICON_SIZE = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
} as const;

export const FONT_WEIGHT = {
  normal: "normal" as const,
  medium: "500" as const,
  semibold: "600" as const,
  bold: "bold" as const,
} as const;

export const BORDER_RADIUS = {
  none: 0,
  sm: 2,
  base: 4,
  md: 6,
  lg: 8,
  xl: 12,
  "2xl": 16,
  full: 9999,
} as const;

export const BORDER_WIDTH = {
  0: 0,
  1: 1,
  2: 2,
} as const;

export const OPACITY = {
  0: 0,
  50: 0.5,
  100: 1,
} as const;

const commonTheme = {
  spacing: SPACING,
  fontSize: FONT_SIZE,
  lineHeight: LINE_HEIGHT,
  iconSize: ICON_SIZE,
  fontWeight: FONT_WEIGHT,
  borderRadius: BORDER_RADIUS,
  borderWidth: BORDER_WIDTH,
  opacity: OPACITY,
} as const;

const darkShadow = {
  sm: {
    shadowColor: "rgba(0, 0, 0, 0.25)",
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: "rgba(0, 0, 0, 0.20)",
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 8,
  },
  lg: {
    shadowColor: "rgba(0, 0, 0, 0.40)",
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 24,
    elevation: 8,
  },
} as const;

const defaultGlass = {
  enabled: false,
  blurIntensity: 0,
  panel: "transparent",
  popover: "transparent",
  sheet: "transparent",
  chrome: "transparent",
  border: "transparent",
  highlight: "transparent",
  glow: "transparent",
  tint: "transparent",
  edge: "transparent",
  innerShadow: "transparent",
  specular: "transparent",
  refraction: "transparent",
  caustic: "transparent",
  cssBackdropFilter: "none",
  cardBorder: "transparent",
} as const;

const liquidNeonGlass = {
  enabled: true,
  blurIntensity: 22,
  panel: "rgba(255,255,255,0.08)",
  popover: "rgba(255,255,255,0.06)",
  sheet: "rgba(255,255,255,0.06)",
  chrome: "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.16)",
  highlight: "rgba(255,255,255,0.20)",
  glow: "rgba(99,230,255,0.12)",
  tint: "rgba(0,163,255,0.06)",
  edge: "rgba(99,230,255,0.24)",
  innerShadow: "rgba(0,163,255,0.08)",
  specular: "rgba(255,255,255,0.32)",
  refraction: "rgba(168,85,247,0.08)",
  caustic: "rgba(0,163,255,0.10)",
  cssBackdropFilter: "blur(22px) saturate(1.4)",
  cardBorder: "rgba(255,255,255,0.12)",
} as const;

const liquidNeonShadow = {
  sm: {
    shadowColor: "rgba(0,163,255,0.08)",
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
  },
  md: {
    shadowColor: "rgba(0,163,255,0.12)",
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 16,
    elevation: 4,
  },
  lg: {
    shadowColor: "rgba(99,230,255,0.16), rgba(168,85,247,0.08)",
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 24,
    elevation: 8,
  },
} as const;

function buildDarkTheme(semanticColors: ReturnType<typeof buildDarkSemanticColors>) {
  return {
    isDark: true,
    colorScheme: "dark" as const,
    colors: {
      ...semanticColors,
      palette: baseColors,
      syntax: darkHighlightColors,
    },
    glass: defaultGlass,
    shadow: darkShadow,
    ...commonTheme,
  } as const;
}

export const darkTheme = buildDarkTheme(chisacodeDarkColors);

export const liquidNeonTheme = {
  isDark: true,
  colorScheme: "dark" as const,
  colors: {
    ...liquidNeonLightColors,
    palette: baseColors,
    syntax: darkHighlightColors,
  },
  glass: liquidNeonGlass,
  shadow: liquidNeonShadow,
  ...commonTheme,
} as const;

const lightShadow = {
  sm: {
    shadowColor: "rgba(0, 0, 0, 0.02)",
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
  },
  md: {
    shadowColor: "rgba(0, 0, 0, 0.04)",
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 16,
    elevation: 4,
  },
  lg: {
    shadowColor: "rgba(0, 0, 0, 0.08)",
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 24,
    elevation: 8,
  },
} as const;

/** Widens literal string types to string while preserving object structure */
type Widened<T> = T extends string ? string : { [K in keyof T]: Widened<T[K]> };

function buildLightTheme(semanticColors: Widened<typeof lightSemanticColors>) {
  return {
    isDark: false,
    colorScheme: "light" as const,
    colors: {
      ...semanticColors,
      palette: baseColors,
      syntax: lightHighlightColors,
    },
    glass: defaultGlass,
    shadow: lightShadow,
    ...commonTheme,
  } as const;
}

export const lightTheme = buildLightTheme(lightSemanticColors);

// Deep rose-black dark theme
const chisakiDarkColors = buildDarkSemanticColors({
  surface0: "#09070A",
  surface1: "#171116",
  surface2: "#211820",
  surface3: "#2A1F28",
  surface4: "#382630",
  surfaceDiffEmpty: "#171116",
  surfaceSidebar: "#130F14",
  surfaceSidebarHover: "#211820",
  foregroundMuted: "#B49DA7",
  scrollbarHandle: "#382630",
  border: "#34242D",
  borderAccent: "#56303C",
  accent: "#B7132F",
  accentBright: "#FF4B67",
  destructive: "#991b1b",
  ringColor: "#B7132F",
});
export const chisakiTheme = buildDarkTheme(chisakiDarkColors);

// Aemeath — 粉蓝浅色
const aemeathSemanticColors = {
  ...lightSemanticColors,

  surface0: "#FBFDFF",
  surface1: "#FFFEFE",
  surface2: "#FFF7FB",
  surface3: "#F0E3EB",
  surface4: "#E0D0DC",
  surfaceDiffEmpty: "#FBFDFF",
  surfaceSidebar: "#FFF9FC",
  surfaceSidebarHover: "#FFF0F6",
  surfaceWorkspace: "#FBFDFF",

  foreground: "#2B2028",
  foregroundMuted: "#806F7C",

  border: "#F0E3EB",
  borderAccent: "#DBEEF8",

  accent: "#E87BA8",
  accentBright: "#F2A7C8",
  accentForeground: "#ffffff",
  destructive: "#dc2626",
  success: "#15803d",
  successForeground: "#ffffff",

  blockquoteBorder: "#E87BA8",
  background: "#FBFDFF",
  popover: "#FFFEFE",
  popoverForeground: "#2B2028",
  primary: "#2B2028",
  primaryForeground: "#FFFEFE",
  secondary: "#FFF7FB",
  secondaryForeground: "#2B2028",
  muted: "#FFF7FB",
  mutedForeground: "#806F7C",
  accentBorder: "#F0D8E8",
  input: "#FFF7FB",
  ring: "#E87BA8",

  terminal: {
    ...lightSemanticColors.terminal,
    background: "#FBFDFF",
    foreground: "#2B2028",
    cursor: "#E87BA8",
    cursorAccent: "#ffffff",
    selectionBackground: "rgba(232, 123, 168, 0.18)",
    selectionForeground: "#2B2028",
  },
} as const;
export const aemeathTheme = buildLightTheme(aemeathSemanticColors);

// Keep compatibility with existing code
export const theme = darkTheme;

// Export a union type that works for both themes
export type Theme =
  | typeof darkTheme
  | typeof lightTheme
  | typeof chisakiTheme
  | typeof liquidNeonTheme
  | typeof aemeathTheme;

export function isLiquidNeonThemeName(themeName: ThemeName | "auto"): boolean {
  return themeName === "liquid-neon";
}

export const ANDROID_THEME_OPTIONS = THEME_PICKER_OPTIONS;
export const ANDROID_FALLBACK_THEME: ActiveThemeName = "light";

type UnistylesThemeKey = "light" | "dark" | "liquidNeon" | "chisaki" | "aemeath";

export const THEME_TO_UNISTYLES: Record<ThemeName, UnistylesThemeKey> = {
  light: "light",
  dark: "dark",
  "liquid-neon": "liquidNeon",
  chisaki: "chisaki",
  aemeath: "aemeath",
};

export const THEME_SWATCHES: Record<ThemeName, string> = {
  light: "#ffffff",
  dark: "#6366F1",
  "liquid-neon": "#00A3FF",
  chisaki: "#B7132F",
  aemeath: "#E87BA8",
};

export const THEME_PREVIEWS: Record<
  ThemeName,
  {
    surface: string;
    border: string;
    line: string;
    accent: string;
  }
> = {
  light: {
    surface: lightSemanticColors.surface0,
    border: lightSemanticColors.border,
    line: lightSemanticColors.surface3,
    accent: lightSemanticColors.accent,
  },
  dark: {
    surface: chisacodeDarkColors.surface0,
    border: chisacodeDarkColors.borderAccent,
    line: chisacodeDarkColors.surface3,
    accent: chisacodeDarkColors.accent,
  },
  "liquid-neon": {
    surface: liquidNeonLightColors.surfaceWorkspace,
    border: liquidNeonLightColors.borderAccent,
    line: liquidNeonLightColors.border,
    accent: liquidNeonLightColors.accent,
  },
  chisaki: {
    surface: chisakiDarkColors.surface0,
    border: chisakiDarkColors.borderAccent,
    line: chisakiDarkColors.surface3,
    accent: chisakiDarkColors.accent,
  },
  aemeath: {
    surface: aemeathSemanticColors.surface0,
    border: aemeathSemanticColors.border,
    line: aemeathSemanticColors.surface3,
    accent: aemeathSemanticColors.accent,
  },
};
