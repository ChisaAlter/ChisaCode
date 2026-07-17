import { describe, expect, it } from "vitest";
import { createMarkdownStyles, createWorkbenchMarkdownStyles } from "./markdown-styles";
import { darkTheme } from "./theme";

describe("createMarkdownStyles", () => {
  it("provides compact workbench markdown typography", () => {
    const styles = createWorkbenchMarkdownStyles(darkTheme);

    expect(styles.body).toMatchObject({ fontSize: 13, lineHeight: 18 });
    expect(styles.paragraph).toMatchObject({
      fontSize: 13,
      lineHeight: 18,
      marginBottom: 6,
    });
    expect(styles.text).toMatchObject({ fontSize: 13, lineHeight: 18 });
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

    expect(styles.blocklink).toMatchObject({
      flexShrink: 1,
      minWidth: 0,
      overflowWrap: "anywhere",
    });
  });

  it("keeps assistant markdown text selectable on web", () => {
    const styles = createMarkdownStyles(darkTheme);

    expect(styles.body).toMatchObject({
      userSelect: "text",
    });
    expect(styles.text).toMatchObject({
      userSelect: "text",
    });
    expect(styles.heading1).toMatchObject({
      userSelect: "text",
    });
    expect(styles.link).toMatchObject({
      userSelect: "text",
    });
    expect(styles.code_inline).toMatchObject({
      userSelect: "text",
    });
    expect(styles.code_block).toMatchObject({
      userSelect: "text",
    });
    expect(styles.fence).toMatchObject({
      userSelect: "text",
    });
    expect(styles.bullet_list_icon).toMatchObject({
      userSelect: "text",
    });
    expect(styles.ordered_list_icon).toMatchObject({
      userSelect: "text",
    });
  });

  it("uses compact chat-friendly spacing for assistant markdown blocks", () => {
    const styles = createMarkdownStyles(darkTheme);

    expect(styles.paragraph).toMatchObject({
      marginBottom: darkTheme.spacing[2],
    });
    expect(styles.list_item).toMatchObject({
      marginBottom: darkTheme.spacing[2],
      paddingLeft: darkTheme.spacing[1],
    });
    expect(styles.code_inline).toMatchObject({
      marginHorizontal: 1,
    });
    expect(styles.hr).toMatchObject({
      marginTop: darkTheme.spacing[4],
      marginBottom: darkTheme.spacing[4],
      width: "100%",
    });
  });
});
