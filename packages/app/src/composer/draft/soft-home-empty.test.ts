import { describe, expect, it } from "vitest";
import {
  resolveSoftComposerCardElevation,
  resolveSoftHomeTopInset,
} from "@/composer/draft/soft-home-layout";

describe("resolveSoftHomeTopInset", () => {
  it("uses a tighter optical band for compact Soft Home", () => {
    expect(resolveSoftHomeTopInset(800, true)).toBe(64);
    expect(resolveSoftHomeTopInset(200, true)).toBe(24);
    expect(resolveSoftHomeTopInset(2000, true)).toBe(72);
  });

  it("keeps the desktop Soft Home optical band", () => {
    expect(resolveSoftHomeTopInset(1000, false)).toBe(180);
    expect(resolveSoftHomeTopInset(200, false)).toBe(56);
    expect(resolveSoftHomeTopInset(400, false)).toBe(72);
  });
});

describe("resolveSoftComposerCardElevation", () => {
  it("returns floating-card elevation props", () => {
    const elevation = resolveSoftComposerCardElevation();
    // Web uses boxShadow; native uses RN shadow + elevation.
    expect(
      "boxShadow" in elevation || ("elevation" in elevation && "shadowOpacity" in elevation),
    ).toBe(true);
  });
});
