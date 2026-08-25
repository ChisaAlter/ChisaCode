import { describe, expect, it } from "vitest";
import { resolveAgentCreateErrorMessage } from "./agent-create-errors";

function codedError(message: string, code: unknown): Error {
  return Object.assign(new Error(message), { code });
}

describe("resolveAgentCreateErrorMessage", () => {
  it("localizes DSH_MISSING_API_KEY instead of showing the raw daemon message", () => {
    const error = codedError("daemon raw copy", "DSH_MISSING_API_KEY");
    const message = resolveAgentCreateErrorMessage(error);
    expect(message).not.toBe("daemon raw copy");
    expect(message).toContain("DEEPSEEK_API_KEY");
  });

  it("falls back to the daemon message for unknown codes", () => {
    expect(resolveAgentCreateErrorMessage(codedError("unknown code copy", "SOME_OTHER"))).toBe(
      "unknown code copy",
    );
  });

  it("falls back to the daemon message when no code is present", () => {
    expect(resolveAgentCreateErrorMessage(new Error("plain failure"))).toBe("plain failure");
    expect(resolveAgentCreateErrorMessage(codedError("numeric code", 42))).toBe("numeric code");
  });
});
