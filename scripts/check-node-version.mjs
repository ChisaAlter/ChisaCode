#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const toolVersionsPath = path.join(repoRoot, ".tool-versions");

const toolVersions = readFileSync(toolVersionsPath, "utf8");
const nodeLine = toolVersions
  .split(/\r?\n/)
  .map((line) => line.trim())
  .find((line) => line.startsWith("nodejs "));

if (!nodeLine) {
  console.error("Node version check failed: .tool-versions does not define nodejs.");
  process.exit(1);
}

const expected = nodeLine.split(/\s+/)[1];
const actual = process.version.replace(/^v/, "");

if (actual === expected) {
  console.log(`Node version OK: v${actual}`);
  process.exit(0);
}

console.error(`Node version mismatch: expected v${expected}, got v${actual}.`);
console.error("Use the Node version pinned in .tool-versions before release/build checks.");
console.error(
  String.raw`Windows local fallback: C:\Users\48818\.cache\node-v${expected}-win-x64\npm.cmd run <script>`,
);
process.exit(1);
