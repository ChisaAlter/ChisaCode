const HTML_LANGUAGE_IDS = new Set(["html", "htm"]);
const HTML_TAG_PATTERN =
  /<\s*(?:!doctype|html|head|body|main|section|article|div|span|p|h[1-6]|canvas|svg|form|fieldset|label|input|select|option|textarea|button|table|thead|tbody|tr|td|th|ul|ol|li|img|picture|style|script)\b/i;
const FULL_HTML_DOCUMENT_PATTERN = /^\s*(?:<!doctype\s+html[^>]*>\s*)?<html[\s>]/i;

const GENERATIVE_UI_CSP = [
  "default-src 'none'",
  "img-src data: blob:",
  "media-src data: blob:",
  "font-src data:",
  "style-src 'unsafe-inline'",
  "script-src 'unsafe-inline'",
  "connect-src 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

const CSP_META = `<meta http-equiv="Content-Security-Policy" content="${GENERATIVE_UI_CSP}" />`;

interface GenerativeHtmlFence {
  html: string;
  language: string;
}

export function isGenerativeHtmlFence(info: string | null | undefined, content: string): boolean {
  const language = getFenceLanguage(info);
  if (!language || !HTML_LANGUAGE_IDS.has(language)) {
    return false;
  }

  return HTML_TAG_PATTERN.test(content);
}

export function getGenerativeHtmlFence(
  info: string | null | undefined,
  content: string,
): GenerativeHtmlFence | null {
  if (!isGenerativeHtmlFence(info, content)) {
    return null;
  }

  return {
    html: trimFenceContent(content),
    language: getFenceLanguage(info) ?? "html",
  };
}

export function buildGenerativeHtmlDocument(html: string): string {
  const trimmed = trimFenceContent(html);
  if (FULL_HTML_DOCUMENT_PATTERN.test(trimmed)) {
    return injectCspMeta(trimmed);
  }

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    ${CSP_META}
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      html, body {
        margin: 0;
        min-height: 100%;
        background: transparent;
      }
      body {
        box-sizing: border-box;
        font-family:
          ui-sans-serif,
          system-ui,
          -apple-system,
          BlinkMacSystemFont,
          "Segoe UI",
          sans-serif;
      }
      *, *::before, *::after {
        box-sizing: inherit;
      }
    </style>
  </head>
  <body>
${trimmed}
  </body>
</html>`;
}

function getFenceLanguage(info: string | null | undefined): string | null {
  const first = info?.trim().split(/\s+/)[0]?.toLowerCase();
  if (!first) {
    return null;
  }
  return first.replace(/^\./, "");
}

function trimFenceContent(content: string): string {
  return content.trim();
}

function injectCspMeta(html: string): string {
  if (/http-equiv=["']Content-Security-Policy["']/i.test(html)) {
    return html;
  }

  const headMatch = /<head\b[^>]*>/i.exec(html);
  if (!headMatch) {
    return `${CSP_META}\n${html}`;
  }

  const insertAt = headMatch.index + headMatch[0].length;
  return `${html.slice(0, insertAt)}${CSP_META}${html.slice(insertAt)}`;
}
