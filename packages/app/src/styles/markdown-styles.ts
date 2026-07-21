import type { Theme } from "./theme";
import { Fonts } from "@/constants/theme";
import { isWeb } from "@/constants/platform";

const webSelectableTextStyle = isWeb ? { userSelect: "text" as const } : {};

/**
 * Theme tokens for react-native-markdown-display.
 * Prefer MarkdownRenderer (which applies these via withUnistyles) over wiring
 * styles by hand. Domain surfaces should not rebuild parallel style pipelines.
 */
export function createMarkdownStyles(theme: Theme) {
  return {
    // =========================================================================
    // BASE STYLES
    // =========================================================================

    body: {
      ...webSelectableTextStyle,
      color: theme.colors.foreground,
      // Soft .a stream body: 14.5 / 1.65.
      fontSize: 14.5,
      lineHeight: 24,
      flexShrink: 1,
      minWidth: 0,
      width: "100%" as const,
    },

    text: {
      ...webSelectableTextStyle,
      color: theme.colors.foreground,
      flexShrink: 1,
      minWidth: 0,
      overflowWrap: "anywhere" as const,
    },

    paragraph: {
      marginTop: 0,
      marginBottom: theme.spacing[3],
      flexWrap: "wrap" as const,
      flexDirection: "row" as const,
      alignItems: "flex-start" as const,
      justifyContent: "flex-start" as const,
      flexShrink: 1,
      minWidth: 0,
      width: "100%" as const,
    },

    // =========================================================================
    // HEADINGS
    // =========================================================================

    heading1: {
      ...webSelectableTextStyle,
      // Soft stream h1: quiet step above body 14.5 (not display 3xl).
      fontSize: 20,
      fontWeight: theme.fontWeight.semibold,
      color: theme.colors.foreground,
      marginTop: theme.spacing[6],
      marginBottom: theme.spacing[3],
      lineHeight: 28,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
      paddingBottom: theme.spacing[2],
    },

    heading2: {
      ...webSelectableTextStyle,
      fontSize: 17,
      fontWeight: theme.fontWeight.semibold,
      color: theme.colors.foreground,
      marginTop: theme.spacing[6],
      marginBottom: theme.spacing[3],
      lineHeight: 26,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
      paddingBottom: theme.spacing[2],
    },

    heading3: {
      ...webSelectableTextStyle,
      // Soft stream heading ladder under .a body 14.5.
      fontSize: 16,
      fontWeight: theme.fontWeight.semibold,
      color: theme.colors.foreground,
      marginTop: theme.spacing[4],
      marginBottom: theme.spacing[2],
      lineHeight: 24,
    },

    heading4: {
      ...webSelectableTextStyle,
      fontSize: 15,
      fontWeight: theme.fontWeight.semibold,
      color: theme.colors.foreground,
      marginTop: theme.spacing[4],
      marginBottom: theme.spacing[2],
      lineHeight: 22,
    },

    heading5: {
      ...webSelectableTextStyle,
      fontSize: 14.5,
      fontWeight: theme.fontWeight.semibold,
      color: theme.colors.foreground,
      marginTop: theme.spacing[3],
      marginBottom: theme.spacing[1],
      lineHeight: 22,
    },

    // Soft h6: muted medium, sentence case (no uppercase chrome).
    heading6: {
      ...webSelectableTextStyle,
      fontSize: 13,
      fontWeight: theme.fontWeight.medium,
      color: theme.colors.foregroundMuted,
      marginTop: theme.spacing[3],
      marginBottom: theme.spacing[1],
      lineHeight: 18,
      textTransform: "none" as const,
      letterSpacing: 0,
    },

    // =========================================================================
    // TEXT FORMATTING
    // =========================================================================

    strong: {
      ...webSelectableTextStyle,
      fontWeight: theme.fontWeight.medium,
    },

    em: {
      ...webSelectableTextStyle,
      fontStyle: "italic" as const,
    },

    s: {
      ...webSelectableTextStyle,
      textDecorationLine: "line-through" as const,
      color: theme.colors.foregroundMuted,
    },

    link: {
      ...webSelectableTextStyle,
      color: theme.colors.accentBright,
      textDecorationLine: "none" as const,
      flexShrink: 1,
      minWidth: 0,
      overflowWrap: "anywhere" as const,
    },

    blocklink: {
      ...webSelectableTextStyle,
      color: theme.colors.accentBright,
      textDecorationLine: "none" as const,
      flexShrink: 1,
      minWidth: 0,
      overflowWrap: "anywhere" as const,
    },

    // =========================================================================
    // CODE
    // =========================================================================

    // Soft document code: quiet workspace wash + micro radius.
    code_inline: {
      ...webSelectableTextStyle,
      backgroundColor: theme.colors.surfaceWorkspace,
      color: theme.colors.foreground,
      paddingHorizontal: theme.spacing[1],
      paddingVertical: 2,
      // Soft micro code chip: design plus-chip family (6).
      borderRadius: 6,
      borderWidth: 1,
      borderColor: theme.colors.border,
      fontFamily: Fonts.mono,
      fontSize: theme.fontSize.code,
      lineHeight: Math.round(theme.fontSize.code * 1.45),
    },

    // Soft stream code card.
    code_block: {
      ...webSelectableTextStyle,
      backgroundColor: theme.colors.surface0,
      color: theme.colors.foreground,
      padding: theme.spacing[3],
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.colors.border,
      ...(isWeb
        ? ({
            boxShadow: "0 1px 2px rgba(20, 23, 31, 0.04), 0 8px 24px rgba(20, 23, 31, 0.06)",
          } as object)
        : {}),
      fontFamily: Fonts.mono,
      fontSize: theme.fontSize.code,
      marginVertical: theme.spacing[2],
    },

    fence: {
      ...webSelectableTextStyle,
      backgroundColor: theme.colors.surface0,
      color: theme.colors.foreground,
      padding: theme.spacing[3],
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.colors.border,
      ...(isWeb
        ? ({
            boxShadow: "0 1px 2px rgba(20, 23, 31, 0.04), 0 8px 24px rgba(20, 23, 31, 0.06)",
          } as object)
        : {}),
      fontFamily: Fonts.mono,
      fontSize: theme.fontSize.code,
      marginVertical: theme.spacing[3],
    },

    pre: {
      marginVertical: theme.spacing[2],
    },

    // =========================================================================
    // TABLES
    // =========================================================================

    table: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 12,
      marginVertical: theme.spacing[3],
    },

    thead: {
      backgroundColor: theme.colors.surfaceWorkspace,
    },

    tbody: {},

    th: {
      ...webSelectableTextStyle,
      padding: theme.spacing[2],
      borderBottomWidth: 1,
      borderRightWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceWorkspace,
      fontWeight: theme.fontWeight.semibold,
      color: theme.colors.foreground,
      fontSize: 13,
      lineHeight: 18,
      textAlign: "left" as const,
    },

    tr: {
      borderBottomWidth: 1,
      borderColor: theme.colors.border,
      flexDirection: "row" as const,
    },

    td: {
      ...webSelectableTextStyle,
      padding: theme.spacing[2],
      borderRightWidth: 1,
      borderColor: theme.colors.border,
      color: theme.colors.foreground,
      fontSize: 13,
      lineHeight: 18,
      flex: 1,
    },

    // =========================================================================
    // LISTS
    // =========================================================================

    bullet_list: {
      paddingLeft: 0,
      width: "100%" as const,
    },

    ordered_list: {
      paddingLeft: 0,
      width: "100%" as const,
    },

    list_item: {
      marginBottom: theme.spacing[1],
      flexDirection: "row" as const,
      alignItems: "flex-start" as const,
      flexShrink: 1,
    },

    bullet_list_content: {
      flex: 1,
      flexShrink: 1,
    },

    ordered_list_content: {
      flex: 1,
      flexShrink: 1,
    },

    bullet_list_icon: {
      ...webSelectableTextStyle,
      color: theme.colors.foregroundMuted,
      marginRight: 4,
      fontSize: 14.5,
      lineHeight: 24,
    },

    ordered_list_icon: {
      ...webSelectableTextStyle,
      color: theme.colors.foregroundMuted,
      marginRight: 4,
      fontSize: 14.5,
      fontWeight: theme.fontWeight.normal,
      lineHeight: 24,
      minWidth: 12,
    },

    // =========================================================================
    // BLOCKQUOTE
    // =========================================================================

    blockquote: {
      backgroundColor: theme.colors.surface0,
      borderLeftWidth: 3,
      borderLeftColor: theme.colors.border,
      paddingHorizontal: theme.spacing[4],
      paddingVertical: theme.spacing[3],
      marginVertical: theme.spacing[3],
      borderRadius: 12,
    },

    // =========================================================================
    // HORIZONTAL RULE
    // =========================================================================

    hr: {
      backgroundColor: theme.colors.border,
      height: 1,
      marginVertical: theme.spacing[6],
    },

    // =========================================================================
    // IMAGES
    // =========================================================================

    image: {
      borderRadius: 12,
      marginVertical: theme.spacing[2],
    },

    // =========================================================================
    // BREAKS
    // =========================================================================

    hardbreak: {
      height: theme.spacing[2],
    },

    softbreak: {},
  };
}

/**
 * Creates a smaller variant of markdown styles for compact UI elements
 * like thought bubbles, tooltips, or side panels.
 */
export function createCompactMarkdownStyles(theme: Theme) {
  const baseStyles = createMarkdownStyles(theme);

  return {
    ...baseStyles,

    body: {
      ...baseStyles.body,
      fontSize: 13,
      lineHeight: 18,
    },

    heading1: {
      ...baseStyles.heading1,
      fontSize: 16,
      marginTop: theme.spacing[4],
      marginBottom: theme.spacing[2],
      lineHeight: 24,
    },

    heading2: {
      ...baseStyles.heading2,
      fontSize: 15,
      marginTop: theme.spacing[3],
      marginBottom: theme.spacing[2],
      lineHeight: 22,
    },

    heading3: {
      ...baseStyles.heading3,
      fontSize: 14.5,
      marginTop: theme.spacing[3],
      marginBottom: theme.spacing[1],
      lineHeight: 22,
    },

    paragraph: {
      ...baseStyles.paragraph,
      marginBottom: theme.spacing[2],
    },

    code_inline: {
      ...baseStyles.code_inline,
      fontSize: theme.fontSize.code,
    },

    code_block: {
      ...baseStyles.code_block,
      fontSize: theme.fontSize.code,
      padding: theme.spacing[2],
    },

    fence: {
      ...baseStyles.fence,
      fontSize: theme.fontSize.code,
      padding: theme.spacing[2],
    },
  };
}

/**
 * Soft Workbench chat prose (.a): 14.5px / 1.65, not dense chrome tokens.
 * @param theme Active application theme
 * @returns Soft-tuned markdown styles for the conversation stream
 */
export function createWorkbenchMarkdownStyles(theme: Theme) {
  const baseStyles = createMarkdownStyles(theme);
  const softBodySize = 14.5;
  const softBodyLineHeight = Math.round(softBodySize * 1.65);

  return {
    ...baseStyles,
    // Soft .a: 14.5 / 1.65, paragraph stack 12.
    body: {
      ...baseStyles.body,
      fontSize: softBodySize,
      lineHeight: softBodyLineHeight,
    },
    paragraph: {
      ...baseStyles.paragraph,
      marginBottom: 12,
    },
    heading5: {
      ...baseStyles.heading5,
      fontSize: softBodySize,
      lineHeight: softBodyLineHeight,
    },
    heading6: {
      ...baseStyles.heading6,
      fontSize: softBodySize,
      lineHeight: Math.round(softBodySize * 1.4),
    },
  };
}
