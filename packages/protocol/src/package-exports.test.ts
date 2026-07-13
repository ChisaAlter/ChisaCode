import protocolPackage from "../package.json" with { type: "json" };
import { describe, expect, test } from "vitest";

const V1_0_2_PUBLIC_SUBPATHS = [
  "./agent-attention-notification",
  "./agent-labels",
  "./agent-lifecycle",
  "./agent-presets",
  "./agent-state-bucket",
  "./agent-title-limits",
  "./agent-types",
  "./binary-frames/file-transfer",
  "./binary-frames/index",
  "./binary-frames/terminal",
  "./branch-slug",
  "./chat/rpc-schemas",
  "./chat/types",
  "./chisacode-config-schema",
  "./client-capabilities",
  "./connection-offer",
  "./daemon-endpoints",
  "./error-utils",
  "./git-remote",
  "./host-connection-schema",
  "./importable-providers",
  "./literal-union",
  "./loop/rpc-schemas",
  "./messages",
  "./path-utils",
  "./provider-config",
  "./provider-manifest",
  "./schedule/rpc-schemas",
  "./schedule/types",
  "./terminal-input-mode",
  "./terminal-key-input",
  "./terminal-snapshot",
  "./terminal-stream-protocol",
  "./tool-call-display",
  "./tool-name-normalization",
] as const;

describe("current package exports", () => {
  test("exports terminal messages as a first-class protocol domain", () => {
    expect(protocolPackage.exports["./terminal/messages"]).toEqual({
      types: "./dist/terminal/messages.d.ts",
      default: "./dist/terminal/messages.js",
    });
  });
});

describe("package exports compatibility", () => {
  test.each(V1_0_2_PUBLIC_SUBPATHS)("keeps the v1.0.2 public subpath %s", (subpath) => {
    const outputPath = subpath.slice(2);

    expect(protocolPackage.exports[subpath]).toEqual({
      types: `./dist/${outputPath}.d.ts`,
      default: `./dist/${outputPath}.js`,
    });
  });
});
