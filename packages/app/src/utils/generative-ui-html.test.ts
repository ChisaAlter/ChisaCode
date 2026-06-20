import { describe, expect, it } from "vitest";
import {
  buildGenerativeHtmlDocument,
  getGenerativeHtmlFence,
  isGenerativeHtmlFence,
} from "./generative-ui-html";

describe("generative UI HTML", () => {
  it("recognizes HTML fenced code blocks as generative UI", () => {
    expect(isGenerativeHtmlFence("html", "<section><h1>Status</h1></section>")).toBe(true);
    expect(isGenerativeHtmlFence("HTML preview", "<div>Chart</div>")).toBe(true);
    expect(isGenerativeHtmlFence("html", '<img src="data:image/png;base64,abc" alt="Chart">')).toBe(
      true,
    );
    expect(isGenerativeHtmlFence("html", "<label>Name</label><textarea></textarea>")).toBe(true);
    expect(isGenerativeHtmlFence("tsx", "<div>React component</div>")).toBe(false);
    expect(isGenerativeHtmlFence("html", "plain text only")).toBe(false);
  });

  it("extracts normalized HTML fence content for preview rendering", () => {
    expect(getGenerativeHtmlFence(" html ", "\n<div>Card</div>\n")).toEqual({
      html: "<div>Card</div>",
      language: "html",
    });
    expect(getGenerativeHtmlFence("javascript", "<div>Not a preview</div>")).toBeNull();
  });

  it("wraps fragments in a sandbox document with a restrictive CSP", () => {
    const documentHtml = buildGenerativeHtmlDocument("<button>Run</button>");

    expect(documentHtml).toContain("<!doctype html>");
    expect(documentHtml).toContain("default-src 'none'");
    expect(documentHtml).toContain("script-src 'unsafe-inline'");
    expect(documentHtml).toContain("connect-src 'none'");
    expect(documentHtml).toContain("<button>Run</button>");
  });

  it("adds the sandbox CSP to full HTML documents", () => {
    const documentHtml = buildGenerativeHtmlDocument(
      "<!doctype html><html><head><title>Dash</title></head><body>OK</body></html>",
    );

    expect(documentHtml).toContain("<title>Dash</title>");
    expect(documentHtml).toContain('http-equiv="Content-Security-Policy"');
    expect(documentHtml.indexOf("Content-Security-Policy")).toBeLessThan(
      documentHtml.indexOf("<title>Dash</title>"),
    );
  });
});
