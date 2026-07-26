/**
 * check-i18n-glossary.mjs — CI gate for i18n terminology consistency.
 *
 * Scans i18n translation strings for forbidden terms defined in
 * i18n/glossary.json. Run with: npm run check:i18n-glossary
 *
 * Exit codes: 0 = clean, 1 = violations found, 2 = glossary invalid.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ── Load glossary ──────────────────────────────────────────────────────────
let glossary;
try {
  glossary = JSON.parse(readFileSync(path.join(ROOT, "i18n/glossary.json"), "utf8"));
} catch (err) {
  console.error(`❌ Cannot read i18n/glossary.json: ${err.message}`);
  process.exit(2);
}

if (!Array.isArray(glossary.terms)) {
  console.error("❌ glossary.terms must be an array");
  process.exit(2);
}

// ── Collect translation strings from app i18n ──────────────────────────────
const I18N_FILE = path.join(ROOT, "packages/app/src/i18n/index.ts");
let i18nSource;
try {
  i18nSource = readFileSync(I18N_FILE, "utf8");
} catch {
  console.log("⚠️  packages/app/src/i18n/index.ts not found, skipping.");
  process.exit(0);
}

// Extract zh-CN string values from the inline resource object
const zhValues = [];
for (const m of i18nSource.matchAll(/:\s*"([^"]*)"/g)) {
  zhValues.push({ value: m[1], pos: m.index });
}

// ── Check forbidden terms ──────────────────────────────────────────────────
const violations = [];

for (const term of glossary.terms) {
  const forbidden = term.forbidden?.["zh-CN"];
  if (!Array.isArray(forbidden) || forbidden.length === 0) continue;

  for (const banned of forbidden) {
    for (const { value, pos } of zhValues) {
      if (value.includes(banned)) {
        // Find approximate line number
        const line = i18nSource.slice(0, pos).split("\n").length;
        violations.push({
          term: term.id,
          banned,
          approved: term.translations?.["zh-CN"] ?? term.en,
          found: value,
          line,
        });
      }
    }
  }
}

// ── Report ─────────────────────────────────────────────────────────────────
if (violations.length === 0) {
  console.log("✅ i18n glossary check passed — no forbidden terms found.");
  process.exit(0);
}

const reportOnly = process.argv.includes("--report");
const exitCode = reportOnly ? 0 : 1;
const icon = reportOnly ? "⚠️ " : "❌";

console.error(`${icon} Found ${violations.length} glossary violation(s):\n`);
for (const v of violations) {
  console.error(
    `  Line ${v.line}: "${v.found}" contains forbidden "${v.banned}" → use "${v.approved}" (term: ${v.term})`,
  );
}
console.error(`\nSee i18n/glossary.json for approved terminology.`);
process.exit(exitCode);
