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

// ─── Structured generative UI fence detection ────────────────────────────────

interface GenerativeUiFenceResult {
  componentId: string;
  props: Record<string, unknown>;
  source: "fence";
}

const GEN_UI_FENCE_PATTERN = /^chisacode-ui\s+component=(\S+)/;

/**
 * 检测代码块是否包含 chisacode-ui 结构化组件声明
 * 格式: chisacode-ui component=<id>\n{ JSON }
 *
 * 返回 null 表示不匹配，此时回退到现有 HTML fence 检测
 */
export function getGenerativeUiFence(
  sourceInfo: string | null | undefined,
  content: string,
): GenerativeUiFenceResult | null {
  if (!sourceInfo || !content) {
    return null;
  }

  const firstLine = sourceInfo.trim();
  const match = GEN_UI_FENCE_PATTERN.exec(firstLine);
  if (!match) {
    return null;
  }

  const componentId = match[1] ?? "";
  if (!componentId) {
    return null;
  }

  try {
    const trimmed = content.trim();
    const props = JSON.parse(trimmed) as unknown;
    if (typeof props !== "object" || props === null || Array.isArray(props)) {
      return null;
    }
    return {
      componentId,
      props: props as Record<string, unknown>,
      source: "fence",
    };
  } catch {
    return null;
  }
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
