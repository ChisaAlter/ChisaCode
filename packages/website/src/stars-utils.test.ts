import { describe, it, expect } from "vitest";
import { formatStars, isStars } from "./stars-utils";

describe("formatStars", () => {
  it("returns the number as a string when under 1000", () => {
    expect(formatStars(0)).toBe("0");
    expect(formatStars(999)).toBe("999");
  });

  it("formats exact thousands with k suffix", () => {
    expect(formatStars(1000)).toBe("1k");
    expect(formatStars(2000)).toBe("2k");
    expect(formatStars(10000)).toBe("10k");
  });

  it("formats fractional thousands with one decimal", () => {
    expect(formatStars(1500)).toBe("1.5k");
    expect(formatStars(1234)).toBe("1.2k");
  });
});

describe("isStars", () => {
  it("accepts plain number strings", () => {
    expect(isStars("0")).toBe(true);
    expect(isStars("999")).toBe(true);
  });

  it("accepts k-formatted strings", () => {
    expect(isStars("1k")).toBe(true);
    expect(isStars("1.5k")).toBe(true);
    expect(isStars("10k")).toBe(true);
  });

  it("rejects invalid strings", () => {
    expect(isStars("")).toBe(false);
    expect(isStars("abc")).toBe(false);
    expect(isStars("1.2K")).toBe(false); // uppercase K rejected
  });

  it("rejects non-string values", () => {
    expect(isStars(42)).toBe(false);
    expect(isStars(null)).toBe(false);
    expect(isStars(undefined)).toBe(false);
  });
});
