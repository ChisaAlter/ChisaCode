import { describe, expect, test } from "vitest";

import { resolveGrokBuildCommand } from "./grok-build-agent.js";

describe("resolveGrokBuildCommand", () => {
  test("uses the Grok Build ACP command by default", () => {
    expect(resolveGrokBuildCommand(undefined)).toEqual(["grok", "agent", "stdio"]);
  });

  test("appends runtime arguments before the ACP subcommand", () => {
    expect(
      resolveGrokBuildCommand({
        command: { mode: "append", args: ["--model", "grok-4.5"] },
      }),
    ).toEqual(["grok", "--model", "grok-4.5", "agent", "stdio"]);
  });

  test("replaces the complete command when configured", () => {
    expect(
      resolveGrokBuildCommand({
        command: { mode: "replace", argv: ["custom-grok", "agent", "stdio"] },
      }),
    ).toEqual(["custom-grok", "agent", "stdio"]);
  });
});
