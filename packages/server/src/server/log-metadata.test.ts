import { describe, expect, test } from "vitest";
import { summarizeUntrustedLogIdentifier } from "./log-metadata.js";

describe("summarizeUntrustedLogIdentifier", () => {
  test("returns a bounded deterministic summary without raw or control-character content", () => {
    const secret = `TASK10-LOG-SECRET\n\u0000${"x".repeat(100_000)}`;

    const first = summarizeUntrustedLogIdentifier(secret);
    const second = summarizeUntrustedLogIdentifier(secret);

    expect(first).toEqual(second);
    expect(first).toEqual({
      length: secret.length,
      fingerprint: expect.stringMatching(/^[a-f0-9]{16}$/),
    });
    expect(JSON.stringify(first)).not.toContain("TASK10-LOG-SECRET");
    expect(JSON.stringify(first).length).toBeLessThan(100);
  });
});
