import { useMemo } from "react";
import { Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

interface BrowserPaneProps {
  browserId: string;
  serverId: string;
  workspaceId: string;
  cwd: string | null;
  isInteractive?: boolean;
  onFocusPane?: () => void;
}

export function BrowserPane({ browserId }: BrowserPaneProps) {
  const { theme } = useUnistyles();
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
      <Text style={titleStyle}>浏览器仅支持桌面端</Text>
      <Text style={subtitleStyle}>在 Electron 中打开此工作区即可使用内置浏览器。</Text>
      <Text style={subtitleStyle}>浏览器会话 {browserId}</Text>
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
  title: {
    fontSize: 16,
    fontWeight: "600",
  },
  subtitle: {
    fontSize: 12,
  },
}));
