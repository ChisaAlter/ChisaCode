import { describe, expect, test } from "vitest";

import { DshCredentialsError } from "./agent/providers/dsh-agent.js";
import { toAgentCreateWireError, toWorktreeWireError } from "./worktree-errors.js";
import { BranchAlreadyCheckedOutError } from "../utils/worktree.js";

describe("toAgentCreateWireError", () => {
  test("keeps worktree error codes untouched", () => {
    const error = new BranchAlreadyCheckedOutError("feature/x");
    expect(toAgentCreateWireError(error)).toEqual({
      code: "branch_already_checked_out",
      message: error.message,
    });
  });

  test("surfaces the dsh credential preflight code for client-side localization", () => {
    const error = new DshCredentialsError("缺少 DEEPSEEK_API_KEY");
    expect(toAgentCreateWireError(error)).toEqual({
      code: "DSH_MISSING_API_KEY",
      message: "缺少 DEEPSEEK_API_KEY",
    });
  });

  test("falls back to unknown for plain errors and non-errors", () => {
    expect(toAgentCreateWireError(new Error("boom"))).toEqual({
      code: "unknown",
      message: "boom",
    });
    expect(toAgentCreateWireError("boom")).toEqual({ code: "unknown", message: "boom" });
  });

  test("ignores non-string and empty code properties", () => {
    const numericCode = Object.assign(new Error("numeric"), { code: 42 });
    expect(toAgentCreateWireError(numericCode).code).toBe("unknown");
    const emptyCode = Object.assign(new Error("empty"), { code: "" });
    expect(toAgentCreateWireError(emptyCode).code).toBe("unknown");
  });
});

describe("toWorktreeWireError", () => {
  test("maps unrecognized errors to unknown", () => {
    expect(toWorktreeWireError(new Error("x")).code).toBe("unknown");
  });
});
