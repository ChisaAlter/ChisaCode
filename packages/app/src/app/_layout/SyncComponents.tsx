import { useEffect } from "react";
import { useUnistyles } from "react-native-unistyles";
import { DESKTOP_WINDOW_CONTROLS_HEIGHT } from "@/constants/layout";
import { isNative } from "@/constants/platform";
import { updateDesktopWindowControls } from "@/desktop/electron/window";
import { getDesktopWindowControlsBackground } from "@/desktop/electron/window-controls";
import { useFaviconStatus } from "@/hooks/use-favicon-status";
import { useStatusBarTheme } from "@/hooks/use-status-bar-theme";

function DesktopWindowControlsSync({ enabled }: { enabled: boolean }) {
  const { theme } = useUnistyles();
  const windowChromeBackground = getDesktopWindowControlsBackground(theme.colors);
  const foreground = theme.colors.foregroundMuted;

  useEffect(() => {
    if (!enabled || isNative) return;
    void updateDesktopWindowControls({
      height: DESKTOP_WINDOW_CONTROLS_HEIGHT,
      backgroundColor: windowChromeBackground,
      foregroundColor: foreground,
    }).catch((error) => {
      console.warn("[DesktopWindow] Failed to update window controls overlay", error);
    });
  }, [enabled, windowChromeBackground, foreground]);

  return null;
}

function FaviconStatusSync() {
  useFaviconStatus();
  return null;
}

/**
 * Syncs the Android status bar appearance with the active theme.
 * On non-native platforms, renders nothing (no-op).
 */
function StatusBarThemeSync() {
  if (isNative) {
    return <InnerStatusBarThemeSync />;
  }
  return null;
}

function InnerStatusBarThemeSync() {
  useStatusBarTheme();
  return null;
}

export {
  DesktopWindowControlsSync,
  FaviconStatusSync,
  StatusBarThemeSync,
  InnerStatusBarThemeSync,
};
