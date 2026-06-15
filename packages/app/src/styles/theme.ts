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

export type ThemeName =
  | "light"
  | "dark"
  | "zinc"
  | "midnight"
  | "claude"
  | "ghostty"
  | "liquid-neon"
  | "chisaki";

// Diff stat colors — light uses muted tones, dark uses the brighter palette values
const lightDiffColors = {
  diffAddition: "#15803d", // green-700 — readable on white without screaming
  diffDeletion: "#b91c1c", // red-700
};

const darkDiffColors = {
  diffAddition: "#4ade80", // green-400
  diffDeletion: "#ef4444", // red-500
};

// Status colors — semantic signals for success/danger/warning/merged. Used by
// check statuses, PR states, and review decisions. Kept a step darker than the
// raw palette so they read as signals, not neon.
const lightStatusColors = {
  statusSuccess: "#15803d", // green-700
  statusDanger: "#b91c1c", // red-700
  statusWarning: "#d97706", // amber-600
  statusMerged: "#7c3aed", // purple-600
};

const darkStatusColors = {
  statusSuccess: "#16a34a", // green-600
  statusDanger: "#dc2626", // red-600
  statusWarning: "#f59e0b", // amber-500
  statusMerged: "#9333ea", // purple-600
};

// Semantic color tokens - Layer-based system
const lightSemanticColors = {
  // Surfaces (layers) - shifted one step lighter
  surface0: "#ffffff", // App background
  surface1: "#fafafa", // Subtle hover (was zinc-100, now zinc-50)
  surface2: "#f4f4f5", // Elevated: badges, inputs, sheets (was zinc-200, now zinc-100)
  surface3: "#e4e4e7", // Highest elevation (was zinc-300, now zinc-200)
  surface4: "#d4d4d8", // Extra emphasis (was zinc-400, now zinc-300)
  surfaceDiffEmpty: "#f6f6f6", // Empty side of split diff rows, between surface1 and surface2 and biased toward surface2
  surfaceSidebar: "#f4f4f5", // Sidebar background (darker than main)
  surfaceSidebarHover: "#e9e9ec", // Sidebar hover (darker in light mode)
  surfaceWorkspace: "#ffffff", // Workspace main background

  // Text
  foreground: "#1a1a1e",
  foregroundMuted: "#71717a",

  // Controls
  scrollbarHandle: "#3f3f46", // zinc-700

  // Borders - shifted one step lighter
  border: "#e4e4e7", // (was zinc-200, now zinc-200 - keep for contrast)
  borderAccent: "#ececf1", // Softer accent border for low-emphasis outlines

  // Brand
  accent: "#20744A",
  accentBright: "#239956",
  accentForeground: "#ffffff",

  // Semantic
  destructive: "#b04138", // dark warm red on white — calm but unambiguously red
  destructiveForeground: "#ffffff",
  success: "#20744A",
  successForeground: "#ffffff",

  // Legacy aliases (for gradual migration)
  background: "#ffffff",
  popover: "#ffffff",
  popoverForeground: "#1a1a1e",
  primary: "#18181b",
  primaryForeground: "#fafafa",
  secondary: "#f4f4f5",
  secondaryForeground: "#1a1a1e",
  muted: "#f4f4f5",
  mutedForeground: "#71717a",
  accentBorder: "#ececf1",
  input: "#f4f4f5",
  ring: "#18181b",

  ...lightDiffColors,
  ...lightStatusColors,

  terminal: {
    background: "#ffffff",
    foreground: "#1a1a1e",
    cursor: "#1a1a1e",
    cursorAccent: "#ffffff",
    selectionBackground: "rgba(0, 0, 0, 0.15)",
    selectionForeground: "#1a1a1e",

    black: "#1a1a1e",
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

const chisakiSemanticColors = {
  ...lightSemanticColors,

  scrollbarHandle: "#dc2626",

  border: "#dc2626",
  borderAccent: "#dc2626",

  accentBorder: "#dc2626",
  ring: "#dc2626",

  terminal: {
    ...lightSemanticColors.terminal,
    cursor: "#dc2626",
    cursorAccent: "#ffffff",
    selectionBackground: "rgba(220, 38, 38, 0.16)",
    red: "#dc2626",
    brightRed: "#ef4444",
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
    ring: "#d4d4d8",

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

// ChisaCode — subtle teal-green tint (default)
const chisacodeDarkColors = buildDarkSemanticColors({
  surface0: "#181B1A",
  surface1: "#1E2120",
  surface2: "#272A29",
  surface3: "#434645",
  surface4: "#595B5B",
  surfaceDiffEmpty: "#252827",
  surfaceSidebar: "#141716",
  surfaceSidebarHover: "#1c1f1e",
  foregroundMuted: "#A1A5A4",
  scrollbarHandle: "#717574",
  border: "#252B2A",
  borderAccent: "#2F3534",
  accent: "#20744A",
  accentBright: "#7ccba0",
  destructive: "#c64f43", // warm red, hue ~7 — reads as red (not pink) against the green tint
});

// Zinc — neutral gray, no tint
const zincDarkColors = buildDarkSemanticColors({
  surface0: "#18181b",
  surface1: "#1f1f22",
  surface2: "#27272a",
  surface3: "#3f3f46",
  surface4: "#52525b",
  surfaceDiffEmpty: "#242427",
  surfaceSidebar: "#131316",
  surfaceSidebarHover: "#1b1b1e",
  foregroundMuted: "#a1a1aa",
  scrollbarHandle: "#71717a",
  border: "#27272a",
  borderAccent: "#303036",
  accent: "#e4e4e7",
  accentBright: "#fafafa",
  accentForeground: "#18181b", // monochrome zinc accent is near-white — needs dark text
  destructive: "#c44a4a", // neutral red, hue 0 — clearly red without screaming
});

// Midnight — subtle blue tint
const midnightDarkColors = buildDarkSemanticColors({
  surface0: "#161820",
  surface1: "#1c1e27",
  surface2: "#252731",
  surface3: "#3c3e4c",
  surface4: "#535564",
  surfaceDiffEmpty: "#222430",
  surfaceSidebar: "#121420",
  surfaceSidebarHover: "#1a1c28",
  foregroundMuted: "#9a9db0",
  scrollbarHandle: "#6b6e82",
  border: "#242636",
  borderAccent: "#2e3040",
  accent: "#3b6fcf",
  accentBright: "#7eaaeb",
  destructive: "#c44a52", // red with a hint of cool lean against the blue tint
});

// Claude — warm neutral with subtle orange undertone
const claudeDarkColors = buildDarkSemanticColors({
  surface0: "#1f1f1e",
  surface1: "#262523",
  surface2: "#2f2d2b",
  surface3: "#4a4745",
  surface4: "#605d5b",
  surfaceDiffEmpty: "#2a2826",
  surfaceSidebar: "#1a1918",
  surfaceSidebarHover: "#222120",
  foregroundMuted: "#ada9a5",
  scrollbarHandle: "#78746f",
  border: "#2c2a27",
  borderAccent: "#36332f",
  accent: "#d97757",
  accentBright: "#e89a7f",
  destructive: "#cf513e", // warm orange-red, hue ~10 — sits with the Claude orange accent
});

// Ghostty — blue-tinted dark based on Ghostty default background
const ghosttyDarkColors = buildDarkSemanticColors({
  surface0: "#282c34",
  surface1: "#2f333d",
  surface2: "#383c48",
  surface3: "#4a4f5e",
  surface4: "#5b6175",
  surfaceDiffEmpty: "#323643",
  surfaceSidebar: "#21252d",
  surfaceSidebarHover: "#292d36",
  foregroundMuted: "#c8ccd8",
  scrollbarHandle: "#a0a4b2",
  border: "#353a47",
  borderAccent: "#3f4454",
  accent: "#89b4fa",
  accentBright: "#b4d0fc",
  destructive: "#c44a55", // red with slight cool lean against the slate-blue surfaces
});

const liquidNeonDarkColors = {
  ...buildDarkSemanticColors({
    surface0: "rgba(4, 9, 18, 0.96)",
    surface1: "rgba(8, 17, 32, 0.82)",
    surface2: "rgba(15, 28, 48, 0.72)",
    surface3: "rgba(34, 55, 84, 0.64)",
    surface4: "rgba(59, 83, 120, 0.68)",
    surfaceDiffEmpty: "rgba(12, 24, 42, 0.68)",
    surfaceSidebar: "rgba(5, 12, 24, 0.72)",
    surfaceSidebarHover: "rgba(18, 37, 63, 0.78)",
    foregroundMuted: "#a8bad3",
    scrollbarHandle: "#67e8f9",
    border: "rgba(103, 232, 249, 0.18)",
    borderAccent: "rgba(217, 70, 239, 0.26)",
    accent: "#22d3ee",
    accentBright: "#f0abfc",
    accentForeground: "#031019",
    destructive: "#fb7185",
  }),
  foreground: "#f8fbff",
  success: "#34d399",
  statusSuccess: "#34d399",
  statusDanger: "#fb7185",
  statusWarning: "#fbbf24",
  statusMerged: "#d946ef",
  diffAddition: "#5eead4",
  diffDeletion: "#fb7185",
  terminal: {
    background: "#050914",
    foreground: "#f8fbff",
    cursor: "#67e8f9",
    cursorAccent: "#031019",
    selectionBackground: "rgba(34, 211, 238, 0.26)",
    selectionForeground: "#f8fbff",
    black: "#050914",
    red: "#fb7185",
    green: "#34d399",
    yellow: "#fbbf24",
    blue: "#60a5fa",
    magenta: "#d946ef",
    cyan: "#22d3ee",
    white: "#dbeafe",
    brightBlack: "#334155",
    brightRed: "#fda4af",
    brightGreen: "#6ee7b7",
    brightYellow: "#fde68a",
    brightBlue: "#93c5fd",
    brightMagenta: "#f0abfc",
    brightCyan: "#67e8f9",
    brightWhite: "#ffffff",
  },
} as const;

export const SPACING = {
  0: 0,
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
} as const;

const liquidNeonGlass = {
  enabled: true,
  blurIntensity: 42,
  panel: "rgba(8, 18, 34, 0.56)",
  popover: "rgba(9, 19, 36, 0.68)",
  sheet: "rgba(8, 18, 34, 0.74)",
  chrome: "rgba(5, 13, 27, 0.58)",
  border: "rgba(103, 232, 249, 0.28)",
  highlight: "rgba(255, 255, 255, 0.18)",
  glow: "rgba(217, 70, 239, 0.28)",
} as const;

const liquidNeonShadow = {
  sm: {
    shadowColor: "rgba(34, 211, 238, 0.24)",
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 10,
    elevation: 3,
  },
  md: {
    shadowColor: "rgba(217, 70, 239, 0.20)",
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 18,
    elevation: 8,
  },
  lg: {
    shadowColor: "rgba(34, 211, 238, 0.24)",
    shadowOffset: { width: 0, height: 16 },
    shadowRadius: 36,
    elevation: 10,
  },
} as const;

function buildDarkTheme(semanticColors: ReturnType<typeof buildDarkSemanticColors>) {
  return {
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
export const darkZincTheme = buildDarkTheme(zincDarkColors);
export const darkMidnightTheme = buildDarkTheme(midnightDarkColors);
export const darkClaudeTheme = buildDarkTheme(claudeDarkColors);
export const darkGhosttyTheme = buildDarkTheme(ghosttyDarkColors);

export const liquidNeonTheme = {
  colorScheme: "dark" as const,
  colors: {
    ...liquidNeonDarkColors,
    palette: baseColors,
    syntax: darkHighlightColors,
  },
  glass: liquidNeonGlass,
  shadow: liquidNeonShadow,
  ...commonTheme,
} as const;

export const lightTheme = {
  colorScheme: "light" as const,
  colors: {
    ...lightSemanticColors,
    palette: baseColors,
    syntax: lightHighlightColors,
  },
  glass: defaultGlass,
  shadow: {
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
  },
  ...commonTheme,
} as const;

export const chisakiTheme = {
  colorScheme: "light" as const,
  colors: {
    ...chisakiSemanticColors,
    palette: baseColors,
    syntax: lightHighlightColors,
  },
  glass: defaultGlass,
  shadow: {
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
  },
  ...commonTheme,
} as const;

// Keep compatibility with existing code
export const theme = darkTheme;

// Export a union type that works for both themes
export type Theme =
  | typeof darkTheme
  | typeof lightTheme
  | typeof chisakiTheme
  | typeof liquidNeonTheme;

export function isLiquidNeonThemeName(themeName: ThemeName | "auto"): boolean {
  return themeName === "liquid-neon";
}

type UnistylesThemeKey =
  | "light"
  | "dark"
  | "darkZinc"
  | "darkMidnight"
  | "darkClaude"
  | "darkGhostty"
  | "liquidNeon"
  | "chisaki";

export const THEME_TO_UNISTYLES: Record<ThemeName, UnistylesThemeKey> = {
  light: "light",
  dark: "dark",
  zinc: "darkZinc",
  midnight: "darkMidnight",
  claude: "darkClaude",
  ghostty: "darkGhostty",
  "liquid-neon": "liquidNeon",
  chisaki: "chisaki",
};

export const THEME_SWATCHES: Record<ThemeName, string> = {
  light: "#ffffff",
  dark: "#2D8B62",
  zinc: "#808080",
  midnight: "#4A6BA8",
  claude: "#D97757",
  ghostty: "#8caaee",
  "liquid-neon": "#22d3ee",
  chisaki: "#dc2626",
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
  zinc: {
    surface: zincDarkColors.surface0,
    border: zincDarkColors.borderAccent,
    line: zincDarkColors.surface3,
    accent: zincDarkColors.accent,
  },
  midnight: {
    surface: midnightDarkColors.surface0,
    border: midnightDarkColors.borderAccent,
    line: midnightDarkColors.surface3,
    accent: midnightDarkColors.accent,
  },
  claude: {
    surface: claudeDarkColors.surface0,
    border: claudeDarkColors.borderAccent,
    line: claudeDarkColors.surface3,
    accent: claudeDarkColors.accent,
  },
  ghostty: {
    surface: ghosttyDarkColors.surface0,
    border: ghosttyDarkColors.borderAccent,
    line: ghosttyDarkColors.surface3,
    accent: ghosttyDarkColors.accent,
  },
  "liquid-neon": {
    surface: "#050914",
    border: liquidNeonDarkColors.borderAccent,
    line: "#223754",
    accent: liquidNeonDarkColors.accent,
  },
  chisaki: {
    surface: chisakiSemanticColors.surface0,
    border: chisakiSemanticColors.borderAccent,
    line: chisakiSemanticColors.border,
    accent: chisakiSemanticColors.borderAccent,
  },
};
