import type { ReactElement } from "react";
import { Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export interface CompactComposerControlItem {
  id: string;
  label: string;
  onSelect: () => void;
  leading?: ReactElement | null;
}

/** Lightweight list fallback for tests / surfaces without the dropdown portal. */
export function CompactComposerControlsFallbackList({
  items,
}: {
  items: readonly CompactComposerControlItem[];
}): ReactElement | null {
  if (items.length === 0) {
    return null;
  }
  return (
    <View style={styles.fallback} testID="composer-resting-overflow-fallback">
      {items.map((item) => (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          onPress={item.onSelect}
          style={styles.fallbackRow}
        >
          <Text style={styles.fallbackText}>{item.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  fallback: {
    gap: theme.spacing[1],
    padding: theme.spacing[2],
  },
  fallbackRow: {
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
  },
  fallbackText: {
    fontSize: 12.5,
    color: theme.colors.foreground,
  },
}));
