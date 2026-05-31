import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("supervisor lifecycle intents", () => {
  test("uses explicit shutdown and restart IPC intents", () => {
    const source = readFileSync(new URL("./supervisor.ts", import.meta.url), "utf8");
    const legacyShutdownReason = ["cli", "shutdown"].join("_");

    expect(source).toContain('"chisacode:shutdown"');
    expect(source).toContain('"chisacode:restart"');
    expect(source).not.toContain(legacyShutdownReason);
  });
});
