import { StyleSheet, UnistylesRuntime } from "react-native-unistyles";
import {
  SETTINGS_HINT_LINE_HEIGHT,
  SETTINGS_ROW_HORIZONTAL_PADDING,
  SETTINGS_ROW_TITLE_FONT_SIZE,
  SETTINGS_ROW_TITLE_LINE_HEIGHT,
} from "@/constants/layout";

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
    lineHeight: SETTINGS_HINT_LINE_HEIGHT,
    fontWeight: theme.fontWeight.semibold,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  sectionHeaderLink: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing[1],
    minHeight: 28,
    minWidth: 28,
    paddingHorizontal: theme.spacing[1],
    paddingVertical: theme.spacing[1],
  },
  sectionHeaderLinkText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  // Soft Workbench: card sits on shell as a quiet surface group.
  card: {
    ...(theme.glass.enabled
      ? {
          backgroundColor: theme.colors.surface1,
          borderColor: theme.colors.border,
        }
      : {
          backgroundColor: theme.colors.surface0,
          borderColor: theme.colors.border,
        }),
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    overflow: "hidden",
  },
  row: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: theme.spacing[4],
    paddingHorizontal: SETTINGS_ROW_HORIZONTAL_PADDING,
  },
  rowBorder: {
    borderTopWidth: 1 / UnistylesRuntime.pixelRatio,
    borderTopColor: theme.colors.border,
  },
  rowContent: {
    flex: 1,
    marginRight: theme.spacing[4],
  },
  rowTitle: {
    color: theme.colors.foreground,
    fontSize: SETTINGS_ROW_TITLE_FONT_SIZE,
    lineHeight: SETTINGS_ROW_TITLE_LINE_HEIGHT,
    fontWeight: theme.fontWeight.normal,
  },
  rowHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    lineHeight: SETTINGS_HINT_LINE_HEIGHT,
    marginTop: theme.spacing[0.5],
  },
}));
