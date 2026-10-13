/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { inferMultilineFromText } from "./use-composer-multiline";

describe("inferMultilineFromText", () => {
  it("is false for a single line", () => {
    expect(inferMultilineFromText("hello")).toBe(false);
  });

  it("is true when a newline is present", () => {
    expect(inferMultilineFromText("hello\nworld")).toBe(true);
  });

  it("is false for an empty string", () => {
    expect(inferMultilineFromText("")).toBe(false);
  });
});
