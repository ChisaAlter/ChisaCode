import type { ViewStyle } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export const settingsStyles = StyleSheet.create((theme) => ({
  section: {
    marginBottom: theme.spacing[4],
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: theme.spacing[3],
    marginLeft: theme.spacing[1],
  },
  sectionTitle: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.normal,
    marginBottom: theme.spacing[3],
    marginLeft: theme.spacing[1],
  },
  sectionHeaderTitle: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.normal,
  },
  sectionHeaderLink: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing[1],
    minHeight: 28,
    paddingHorizontal: theme.spacing[1],
    paddingVertical: theme.spacing[1],
  },
  sectionHeaderLinkText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  card: {
    ...(theme.glass.enabled
      ? {
          backgroundColor: theme.glass.panel,
          borderColor: theme.glass.cardBorder,
          backdropFilter: theme.glass
            .cssBackdropFilter as unknown as ViewStyle["backfaceVisibility"],
          // react-native-web needs WebkitBackdropFilter prefix
          WebkitBackdropFilter: theme.glass
            .cssBackdropFilter as unknown as ViewStyle["backfaceVisibility"],
        }
      : {
          backgroundColor: theme.colors.surface1,
          borderColor: theme.colors.border,
        }),
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[3],
  },
  rowBorder: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  rowContent: {
    flex: 1,
    marginRight: theme.spacing[3],
  },
  rowTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
  },
  rowHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    marginTop: theme.spacing[1],
  },
}));
