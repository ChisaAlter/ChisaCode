import { describe, expect, it } from "vitest";
import { createMarkdownStyles, createWorkbenchMarkdownStyles } from "./markdown-styles";
import { darkTheme } from "./theme";

describe("createMarkdownStyles", () => {
  it("matches the current Soft chat prose typography", () => {
    const styles = createMarkdownStyles(darkTheme);

    expect(styles.body).toMatchObject({
      fontSize: 14.5,
      lineHeight: 24,
      color: darkTheme.colors.foreground,
    });
    expect(styles.paragraph).toMatchObject({
      marginBottom: darkTheme.spacing[3],
      flexWrap: "wrap",
      flexDirection: "row",
    });
    expect(styles.code_inline).toMatchObject({
      fontSize: darkTheme.fontSize.code,
      // Soft quiet wash: shell canvas, not elevated surface2.
      backgroundColor: darkTheme.colors.surfaceWorkspace,
    });
  });

  it("createWorkbenchMarkdownStyles uses Soft chat prose scale", () => {
    const workbench = createWorkbenchMarkdownStyles(darkTheme);
    expect(workbench.body).toMatchObject({
      fontSize: 14.5,
      lineHeight: Math.round(14.5 * 1.65),
      color: darkTheme.colors.foreground,
    });
    expect(workbench.paragraph).toMatchObject({
      marginBottom: 12,
    });
  });

  it("applies shrink-and-wrap constraints to long markdown text and links", () => {
    const styles = createMarkdownStyles(darkTheme);

    expect(styles.body).toMatchObject({
      flexShrink: 1,
      minWidth: 0,
      width: "100%",
    });

    expect(styles.paragraph).toMatchObject({
      flexShrink: 1,
      minWidth: 0,
      width: "100%",
      flexWrap: "wrap",
    });

    expect(styles.text).toMatchObject({
      flexShrink: 1,
      minWidth: 0,
      overflowWrap: "anywhere",
    });

    expect(styles.link).toMatchObject({
      flexShrink: 1,
      minWidth: 0,
      overflowWrap: "anywhere",
    });
  });
});
