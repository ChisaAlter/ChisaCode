#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const baselinePath = path.join(repoRoot, "scripts", "test-audit-baseline.json");
const shouldUpdate = process.argv.includes("--update");

const checks = [
  {
    id: "moduleMock",
    description: "vi.mock calls",
    pattern: /\bvi\.mock\s*\(/g,
  },
  {
    id: "spyOn",
    description: "vi.spyOn calls",
    pattern: /\bvi\.spyOn\s*\(/g,
  },
  {
    id: "unconditionalSkip",
    description: "unconditional test skips",
    pattern: /\b(?:describe|it|test)\.skip\s*\(/g,
  },
  {
    id: "conditionalSkip",
    description: "conditional skip/run gates",
    pattern:
      /\b(?:skipIf|runIf|context\.skip)\s*\(|\?\s*(?:describe|it|test)\s*:\s*(?:describe|it|test)\.skip|\?\s*(?:describe|it|test)\.(?:sequential|only)?\s*:\s*(?:describe|it|test)\.skip/g,
  },
  {
    id: "fixedWait",
    description: "fixed sleeps and waitForTimeout",
    pattern: /(?<!\.)\bsetTimeout\s*\(|\b(?:waitForTimeout|sleep)\s*\(/g,
    // setTimeout(fn) / setTimeout(fn, 0) is a tick deferral (event-ordering in
    // fakes), not a fixed sleep — only non-zero delays are debt.
    accept: (text, match) => !isZeroDelaySetTimeout(text, match),
  },
  {
    id: "weakAssertion",
    description: "weak assertions",
    pattern: /\.toBe(?:Truthy|Falsy|Defined)\s*\(/g,
  },
  {
    id: "processEnvMutation",
    description: "direct process.env mutations",
    pattern: /(?:delete\s+process\.env\.[A-Z0-9_]+|process\.env\.[A-Z0-9_]+\s*=(?!=))/g,
  },
];

function findingKey(checkId, filePath, line) {
  return `${checkId}::${filePath.replaceAll("\\", "/")}:${line}`;
}

/**
 * Returns true when a matched `setTimeout(` call passes no delay or a literal
 * `0` delay, i.e. a next-tick deferral rather than a fixed sleep. Scans from
 * the opening paren with a small tokenizer that balances parens and skips
 * string/template literals and comments so nested callbacks parse correctly.
 * Unparseable calls (unterminated, dynamic) conservatively count as debt.
 */
function isZeroDelaySetTimeout(text, match) {
  if (!match[0].includes("setTimeout")) return false;
  const openParen = text.indexOf("(", match.index);
  if (openParen === -1) return false;
  let depth = 0;
  let lastTopLevelComma = -1;
  let i = openParen;
  while (i < text.length) {
    const ch = text[i];
    const skipTo = skipNonCode(text, i);
    if (skipTo !== -1) {
      i = skipTo;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") depth += 1;
    if (ch === ")" || ch === "]" || ch === "}") {
      depth -= 1;
      if (depth === 0) {
        const lastArgStart = lastTopLevelComma === -1 ? openParen + 1 : lastTopLevelComma + 1;
        const lastArg = text.slice(lastArgStart, i).trim();
        // No comma at depth 1 means a single callback argument (no delay).
        return lastTopLevelComma === -1 || lastArg === "0";
      }
    }
    if (ch === "," && depth === 1) lastTopLevelComma = i;
    i += 1;
  }
  return false;
}

/**
 * If `start` sits on a string/template literal or a comment, returns the index
 * just past it; otherwise returns -1.
 */
function skipNonCode(text, start) {
  const ch = text[start];
  if (ch === '"' || ch === "'" || ch === "`") {
    return skipStringLiteral(text, start);
  }
  if (ch === "/" && text[start + 1] === "/") {
    const eol = text.indexOf("\n", start);
    return eol === -1 ? text.length : eol + 1;
  }
  if (ch === "/" && text[start + 1] === "*") {
    const end = text.indexOf("*/", start + 2);
    return end === -1 ? text.length : end + 2;
  }
  return -1;
}

function skipStringLiteral(text, start) {
  const quote = text[start];
  let i = start + 1;
  while (i < text.length) {
    if (text[i] === "\\") {
      i += 2;
      continue;
    }
    if (text[i] === quote) return i + 1;
    if (quote !== "`" && text[i] === "\n") return i + 1;
    i += 1;
  }
  return text.length;
}

const ignoredDirs = new Set([
  "node_modules",
  "dist",
  ".git",
  ".claude",
  ".turbo",
  ".worktrees",
  "worktrees",
  "release",
]);
const testFilePattern = /(?:\.test|\.spec)\.[cm]?[jt]sx?$/;

function shouldIgnoreDirectory(name) {
  return ignoredDirs.has(name) || /^release-.+/.test(name);
}

async function collectFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (shouldIgnoreDirectory(entry.name)) continue;
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(entryPath)));
      continue;
    }
    if (entry.isFile() && testFilePattern.test(entry.name)) {
      files.push(entryPath);
    }
  }
  return files;
}

function scanFile(file) {
  const text = readFileSync(file, "utf8");
  const relativePath = path.relative(repoRoot, file).replaceAll(path.sep, "/");
  const findings = [];
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) lineStarts.push(i + 1);
  }
  for (const check of checks) {
    check.pattern.lastIndex = 0;
    for (;;) {
      const match = check.pattern.exec(text);
      if (!match) break;
      if (check.accept && !check.accept(text, match)) continue;
      const line = upperBound(lineStarts, match.index);
      findings.push({
        check: check.id,
        file: relativePath,
        line,
        key: findingKey(check.id, relativePath, line),
      });
    }
  }
  return findings;
}

function upperBound(values, needle) {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (values[mid] <= needle) low = mid + 1;
    else high = mid;
  }
  return low;
}

function summarize(findings) {
  const counts = Object.fromEntries(checks.map((check) => [check.id, 0]));
  for (const finding of findings) counts[finding.check] += 1;
  return counts;
}

function formatSummary(summary) {
  return checks
    .map((check) => `${check.id}: ${summary[check.id]} (${check.description})`)
    .join("\n");
}

const files = await collectFiles(repoRoot);
const findings = files.flatMap(scanFile);
const summary = summarize(findings);
const fingerprints = [...new Set(findings.map((finding) => finding.key))].sort();

if (shouldUpdate) {
  writeFileSync(
    baselinePath,
    JSON.stringify(
      {
        version: 2,
        description:
          "Baseline for test debt audit. CI fails on new finding fingerprints or when totals rise above counts. Fingerprints prevent debt migration between files.",
        counts: summary,
        fingerprints,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`Updated ${path.relative(repoRoot, baselinePath)}`);
  console.log(formatSummary(summary));
  console.log(`fingerprints: ${fingerprints.length}`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
const failures = [];
for (const check of checks) {
  const actual = summary[check.id] ?? 0;
  const allowed = baseline.counts?.[check.id] ?? 0;
  if (actual > allowed) {
    failures.push({
      kind: "count",
      check,
      actual,
      allowed,
    });
  }
}

const baselineFingerprints = new Set(
  Array.isArray(baseline.fingerprints) ? baseline.fingerprints : [],
);
const newFingerprints = fingerprints.filter((key) => !baselineFingerprints.has(key));
// If baseline has no fingerprints yet (v1), seed is required via --update.
if (!Array.isArray(baseline.fingerprints)) {
  failures.push({
    kind: "fingerprint-missing",
    message:
      "Baseline lacks fingerprints (v1). Run `npm run test:audit -- --update` once to seed fingerprint set after review.",
  });
} else if (newFingerprints.length > 0) {
  failures.push({
    kind: "fingerprint",
    newFingerprints,
  });
}

console.log("Test audit summary:");
console.log(formatSummary(summary));
console.log(`fingerprints: ${fingerprints.length}`);

if (failures.length === 0) {
  process.exit(0);
}

console.error("\nTest audit found new debt above baseline:");
for (const failure of failures) {
  if (failure.kind === "count") {
    console.error(
      `- ${failure.check.id}: ${failure.actual} > ${failure.allowed} (${failure.check.description})`,
    );
    const examples = findings
      .filter((finding) => finding.check === failure.check.id)
      .slice(0, 10)
      .map((finding) => `  ${finding.file}:${finding.line}`);
    console.error(examples.join("\n"));
  } else if (failure.kind === "fingerprint") {
    console.error(`- new finding fingerprints: ${failure.newFingerprints.length}`);
    console.error(
      failure.newFingerprints
        .slice(0, 20)
        .map((key) => `  ${key}`)
        .join("\n"),
    );
  } else {
    console.error(`- ${failure.message}`);
  }
}
console.error("\nIf this is an intentional migration step, run: npm run test:audit -- --update");
process.exit(1);
