/**
 * 从 assistant_message 文本中提取 chisacode-ui Markdown fence block。
 * 格式: ```chisacode-ui component=<id>\n{ JSON }\n```
 */

export interface GenerativeUiFenceMatch {
  componentId: string;
  props: Record<string, unknown>;
  source: "fence";
}

/** 匹配完整的 ```chisacode-ui component=<id>\n<JSON>\n``` block */
const GEN_UI_FENCE_BLOCK_RE = /```chisacode-ui\s+component=(\S+)\s*\n([\s\S]*?)```/g;

/**
 * 扫描文本中所有 chisacode-ui Markdown fence block，
 * 提取 componentId 和 JSON props。
 * @param text 完整的 assistant_message 文本内容
 * @returns 检测到的所有有效 fence block 数组
 */
export function detectGenerativeUiFences(text: string): GenerativeUiFenceMatch[] {
  if (!text || !text.includes("chisacode-ui")) {
    return [];
  }

  const results: GenerativeUiFenceMatch[] = [];
  const re = new RegExp(GEN_UI_FENCE_BLOCK_RE.source, "g");

  for (const match of text.matchAll(re)) {
    const raw = match[1];
    const body = match[2];
    const componentId = raw?.trim();

    if (!componentId) {
      continue;
    }

    try {
      const parsed = JSON.parse(body.trim()) as unknown;
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        continue;
      }
      results.push({
        componentId,
        props: parsed as Record<string, unknown>,
        source: "fence",
      });
    } catch {
      // JSON 解析失败 → 跳过该 block
      continue;
    }
  }

  return results;
}
