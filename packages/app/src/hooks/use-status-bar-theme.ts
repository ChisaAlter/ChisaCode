import { useEffect, useRef } from "react";
import { StatusBar } from "react-native";
import { UnistylesRuntime } from "react-native-unistyles";

/**
 * Syncs the Android status bar barStyle with the active Unistyles theme colorScheme.
 * On Android with edge-to-edge enabled, also sets the status bar background to transparent.
 *
 * Must be mounted inside ProvidersWrapper so it re-runs when the theme changes.
 *
 * - dark / auto-dark themes → light-content (white icons)
 * - light / liquid-neon / auto-light themes → dark-content (dark icons)
 */
export function useStatusBarTheme(): void {
  const previousThemeKeyRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const currentKey: string | undefined = UnistylesRuntime.themeName as string | undefined;
    if (currentKey === previousThemeKeyRef.current) return;
    previousThemeKeyRef.current = currentKey;

    const key = currentKey ?? "";
    const isDark =
      key === "dark" ||
      key === "darkZinc" ||
      key === "darkMidnight" ||
      key === "darkClaude" ||
      key === "darkGhostty";

    StatusBar.setBarStyle(isDark ? "light-content" : "dark-content", true);
    StatusBar.setBackgroundColor("transparent", true);
  });
}
