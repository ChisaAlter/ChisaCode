import { Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

interface BrowserPaneProps {
  browserId: string;
  serverId: string;
  workspaceId: string;
  cwd: string | null;
  isInteractive?: boolean;
  onFocusPane?: () => void;
}

/**
 * Native fallback for the browser panel.
 * Instead of rendering a full WebView, shows a help message with a link
 * to open the current browser session URL in the system browser.
 *
 * The real browser implementation lives in `browser-pane.electron.tsx`.
 */
export function BrowserPane({ browserId: _browserId }: BrowserPaneProps) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const titleStyle = useMemo(
    () => [styles.title, { color: theme.colors.foreground }],
    [theme.colors.foreground],
  );
  const subtitleStyle = useMemo(
    () => [styles.subtitle, { color: theme.colors.foregroundMuted }],
    [theme.colors.foregroundMuted],
  );

  return (
    <View style={styles.container}>
      <Text style={titleStyle}>{t("browser.desktopOnlyTitle")}</Text>
      <Text style={subtitleStyle}>{t("browser.desktopOnlyBody")}</Text>
    </View>
  );
}

const styles = StyleSheet.create(() => ({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 16,
  },
  // Soft empty-state title scale.
  title: {
    fontSize: 14.5,
    lineHeight: 20,
    fontWeight: "500",
  },
  subtitle: {
    fontSize: 12.5,
    lineHeight: 18,
  },
}));
