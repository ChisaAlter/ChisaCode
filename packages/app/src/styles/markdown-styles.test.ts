import { describe, expect, it } from "vitest";
import { createMarkdownStyles, createWorkbenchMarkdownStyles } from "./markdown-styles";
import { darkTheme } from "./theme";

describe("createMarkdownStyles", () => {
  it("matches Paseo prose typography (base size, scaled line-height)", () => {
    const styles = createMarkdownStyles(darkTheme);

    expect(styles.body).toMatchObject({
      fontSize: darkTheme.fontSize.base,
      lineHeight: Math.round(darkTheme.fontSize.base * 1.4),
      color: darkTheme.colors.foreground,
    });
    expect(styles.paragraph).toMatchObject({
      marginBottom: darkTheme.spacing[3],
      flexWrap: "wrap",
      flexDirection: "row",
    });
    expect(styles.code_inline).toMatchObject({
      fontSize: darkTheme.fontSize.code,
      backgroundColor: darkTheme.colors.surface2,
    });
  });

  it("createWorkbenchMarkdownStyles aliases full Paseo prose styles", () => {
    const prose = createMarkdownStyles(darkTheme);
    const workbench = createWorkbenchMarkdownStyles(darkTheme);
    expect(workbench.body).toEqual(prose.body);
    expect(workbench.paragraph).toEqual(prose.paragraph);
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
