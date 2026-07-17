import { describe, expect, it } from "vitest";
import { MARKDOWN_TEXT_SPAN_WEB_STYLE } from "./markdown-text.web";

describe("MarkdownTextSpan web layout", () => {
  it("uses a full-width block so compact line height controls wrapped text", () => {
    expect(MARKDOWN_TEXT_SPAN_WEB_STYLE).toEqual({
      display: "block",
      width: "100%",
    });
  });
});
