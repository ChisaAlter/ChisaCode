import protocolPackage from "../package.json" with { type: "json" };
import { describe, expect, test } from "vitest";

describe("package exports compatibility", () => {
  test("keeps the legacy deep import wildcard for patch releases", () => {
    expect(protocolPackage.exports).toMatchObject({
      "./*": {
        types: "./dist/*.d.ts",
        default: "./dist/*.js",
      },
    });
  });
});
