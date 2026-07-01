import { describe, expect, it } from "vitest";
import { detectGenerativeUiFences } from "./generative-ui-fence-detector.js";

function fence(componentId: string, props: string) {
  return `\`\`\`chisacode-ui component=${componentId}\n${props}\n\`\`\``;
}

describe("detectGenerativeUiFences", () => {
  it("returns empty array for empty text", () => {
    expect(detectGenerativeUiFences("")).toEqual([]);
    expect(detectGenerativeUiFences("   ")).toEqual([]);
  });

  it("returns empty array when no chisacode-ui substring present", () => {
    expect(detectGenerativeUiFences("普通文本没有任何特殊标记")).toEqual([]);
    expect(detectGenerativeUiFences('```json\n{"key":"val"}\n```')).toEqual([]);
    expect(detectGenerativeUiFences("```python\nprint('hello')\n```")).toEqual([]);
  });

  it("detects a single valid fence", () => {
    const text = fence(
      "line_chart",
      '{"title":"Sales","xAxis":"month","yAxis":"amount","data":[]}',
    );
    const results = detectGenerativeUiFences(text);
    expect(results).toHaveLength(1);
    expect(results[0].componentId).toBe("line_chart");
    expect(results[0].source).toBe("fence");
    const props = results[0].props as Record<string, unknown>;
    expect(props.title).toBe("Sales");
    expect(props.xAxis).toBe("month");
    expect(props.yAxis).toBe("amount");
    expect(props.data).toEqual([]);
  });

  it("skips fence with invalid JSON body", () => {
    const text = fence("form", "{invalid json}");
    expect(detectGenerativeUiFences(text)).toEqual([]);
  });

  it("skips fence where body parses to an array", () => {
    const text = fence("table", "[1,2,3]");
    expect(detectGenerativeUiFences(text)).toEqual([]);
  });

  it("skips fence where body parses to null", () => {
    const text = fence("chart", "null");
    expect(detectGenerativeUiFences(text)).toEqual([]);
  });

  it("skips fence where body parses to a primitive", () => {
    const text = fence("chart", '"hello"');
    expect(detectGenerativeUiFences(text)).toEqual([]);
  });

  it("skips fence where body parses to a boolean", () => {
    expect(detectGenerativeUiFences(fence("chart", "true"))).toEqual([]);
    expect(detectGenerativeUiFences(fence("chart", "false"))).toEqual([]);
  });

  it("skips fence where componentId is empty", () => {
    const text = "```chisacode-ui component=\n{}\n```";
    expect(detectGenerativeUiFences(text)).toEqual([]);
  });

  it("detects multiple fences in the same text", () => {
    const text = [
      fence("line_chart", '{"xAxis":"x","yAxis":"y","data":[]}'),
      "some text in between",
      fence("bar_chart", '{"label":"l","value":"v","data":[]}'),
    ].join("\n");
    const results = detectGenerativeUiFences(text);
    expect(results).toHaveLength(2);
    expect(results[0].componentId).toBe("line_chart");
    expect(results[1].componentId).toBe("bar_chart");
  });

  it("returns empty array for incomplete fence (no closing ```)", () => {
    const text = '```chisacode-ui component=line_chart\n{"x":1}';
    expect(detectGenerativeUiFences(text)).toEqual([]);
  });

  it("handles fence with surrounding normal text", () => {
    const text = [
      "Here is a chart:",
      "",
      fence("line_chart", '{"xAxis":"month","yAxis":"sales","data":[]}'),
      "",
      "I hope this helps.",
    ].join("\n");
    const results = detectGenerativeUiFences(text);
    expect(results).toHaveLength(1);
    expect(results[0].componentId).toBe("line_chart");
  });

  it("handles complex nested JSON props", () => {
    const props = {
      title: "Complex Chart",
      data: [
        { month: "Jan", amount: 10 },
        { month: "Feb", amount: 20 },
      ],
      config: { colors: ["#ff0000", "#00ff00"], showLegend: true },
    };
    const text = fence("line_chart", JSON.stringify(props));
    const results = detectGenerativeUiFences(text);
    expect(results).toHaveLength(1);
    expect(results[0].props).toEqual(props);
  });

  it("handles JSON with unicode characters", () => {
    const props = { title: "中文图表", label: "カテゴリ" };
    const text = fence("bar_chart", JSON.stringify(props));
    const results = detectGenerativeUiFences(text);
    expect(results).toHaveLength(1);
    expect((results[0].props as Record<string, unknown>).title).toBe("中文图表");
    expect((results[0].props as Record<string, unknown>).label).toBe("カテゴリ");
  });

  it("handles JSON with escaped string values", () => {
    const props = { title: 'He said "hello"', path: "C:\\Users\\name" };
    const text = fence("table", JSON.stringify(props));
    const results = detectGenerativeUiFences(text);
    expect(results).toHaveLength(1);
    expect((results[0].props as Record<string, unknown>).title).toBe('He said "hello"');
  });

  it("stops at the first closing ``` (standard Markdown behaviour)", () => {
    // If the JSON body itself contains ```, the fence ends at the first ```
    const text = '```chisacode-ui component=line_chart\n{"x":1}\n```\nSome trailing text\n```';
    const results = detectGenerativeUiFences(text);
    expect(results).toHaveLength(1);
    expect(results[0].componentId).toBe("line_chart");
  });

  it("preserves multi-line JSON body", () => {
    const text = [
      "```chisacode-ui component=form",
      "{",
      '  "title": "Contact",',
      '  "fields": [',
      '    {"name": "email", "label": "Email", "type": "text"},',
      '    {"name": "msg", "label": "Message", "type": "textarea"}',
      "  ]",
      "}",
      "```",
    ].join("\n");
    const results = detectGenerativeUiFences(text);
    expect(results).toHaveLength(1);
    const props = results[0].props as Record<string, unknown>;
    expect(props.title).toBe("Contact");
    expect(Array.isArray(props.fields)).toBe(true);
  });
});
