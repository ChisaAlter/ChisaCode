import { useEffect } from "react";
import { StatusBar } from "react-native";
import { useUnistyles } from "react-native-unistyles";

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
  const { theme } = useUnistyles();

  useEffect(() => {
    StatusBar.setBarStyle(theme.isDark ? "light-content" : "dark-content", true);
    StatusBar.setBackgroundColor("transparent", true);
  }, [theme.isDark]);
}
