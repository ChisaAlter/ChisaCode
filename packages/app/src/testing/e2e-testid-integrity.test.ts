/**
 * Guard against silent e2e helper decay: every literal testID referenced by
 * the Playwright suite must exist in app or desktop source. UI refactors that
 * rename or remove a testID fail here in seconds instead of burning a 90
 * minute Playwright job on a misleading timeout.
 *
 * See docs/testing/client-e2e-test-hardening-plan-2026-08-25.md §2 for the
 * failure-class analysis this guard closes.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, test } from "vitest";

const APP_ROOT = resolve(__dirname, "../..");
const E2E_DIR = resolve(APP_ROOT, "e2e");
const SOURCE_DIRS = [resolve(APP_ROOT, "src"), resolve(APP_ROOT, "../desktop/src")];

/**
 * testIDs that the static scanner cannot link to source. Every entry needs a
 * justification; remove entries as soon as the dynamic construction gets a
 * statically visible literal.
 */
const ALLOWLIST = new Map<string, string>([
  // AdaptiveRenameModal composes `${testID}-input` / `-submit` from its prop;
  // host-page passes testID="host-page-rename-modal" at the call site.
  ["host-page-rename-modal-input", "rename-modal suffix composition"],
  ["host-page-rename-modal-submit", "rename-modal suffix composition"],
  // desktop-selected-hover-stable.script.ts asserts the ABSENCE of the
  // removed T3 inline Settle/Snooze buttons (2026-08-12 removal); referencing
  // the dead IDs is the point of that gate.
  ["sidebar-status-settle-", "absence assertion of removed settle/snooze UI"],
  ["sidebar-status-snooze-", "absence assertion of removed settle/snooze UI"],
]);

function listFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      listFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

interface E2eReference {
  id: string;
  kind: "exact" | "prefix";
  file: string;
}

function extractE2eReferences(): E2eReference[] {
  const references: E2eReference[] = [];
  for (const file of listFiles(E2E_DIR)) {
    const text = readFileSync(file, "utf8");
    const rel = relative(APP_ROOT, file);
    for (const match of text.matchAll(/getByTestId\(\s*"([^"]+)"\s*\)/g)) {
      references.push({ id: match[1], kind: "exact", file: rel });
    }
    for (const match of text.matchAll(/getByTestId\(\s*`([^`$]+)\$\{/g)) {
      references.push({ id: match[1], kind: "prefix", file: rel });
    }
    for (const match of text.matchAll(/data-testid(\^?)="([^"$]+)"/g)) {
      references.push({ id: match[2], kind: match[1] === "^" ? "prefix" : "exact", file: rel });
    }
    for (const match of text.matchAll(/data-testid(\^?)=\\?"([^"$\\]+)\\?"/g)) {
      references.push({ id: match[2], kind: match[1] === "^" ? "prefix" : "exact", file: rel });
    }
  }
  return references;
}

interface SourceCorpus {
  literals: Set<string>;
  templatePrefixes: string[];
  suffixTemplates: string[];
}

function extractSourceCorpus(): SourceCorpus {
  const literals = new Set<string>();
  const templatePrefixes: string[] = [];
  const suffixTemplates: string[] = [];
  for (const dir of SOURCE_DIRS) {
    for (const file of listFiles(dir)) {
      const text = readFileSync(file, "utf8");
      // Covers JSX attributes, object properties, assignments, and default
      // parameters, with either testID or testId casing:
      //   testID="x"  testId="x"  testID: "x"  testID = "x"  testID={"x"}
      for (const match of text.matchAll(/test[iI][dD]\s*[=:]\s*\{?\s*"([^"]+)"/g)) {
        literals.add(match[1]);
      }
      // Any kebab-literal template prefix counts, wherever the template sits
      // (direct attribute, ternary, variable) — e.g. `agent-panel-${agentId}`.
      for (const match of text.matchAll(/`([a-z0-9][a-z0-9:-]*-)\$\{/g)) {
        templatePrefixes.push(match[1]);
      }
      // Suffix composition: `${testID}-input`, `${base}-backdrop`, ...
      for (const match of text.matchAll(/`\$\{[^}]+\}(-[a-z0-9-]+)`/g)) {
        suffixTemplates.push(match[1]);
      }
    }
  }
  return { literals, templatePrefixes, suffixTemplates };
}

function matchesExact(id: string, corpus: SourceCorpus): boolean {
  if (corpus.literals.has(id)) return true;
  if (corpus.templatePrefixes.some((prefix) => prefix.length > 0 && id.startsWith(prefix))) {
    return true;
  }
  return corpus.suffixTemplates.some(
    (suffix) => id.endsWith(suffix) && corpus.literals.has(id.slice(0, -suffix.length)),
  );
}

function matchesPrefix(prefix: string, corpus: SourceCorpus): boolean {
  for (const literal of corpus.literals) {
    if (literal.startsWith(prefix)) return true;
  }
  return corpus.templatePrefixes.some(
    (candidate) => candidate.startsWith(prefix) || prefix.startsWith(candidate),
  );
}

describe("e2e testID integrity", () => {
  test("every literal testID referenced by the e2e suite exists in app or desktop source", () => {
    const references = extractE2eReferences();
    expect(references.length).toBeGreaterThan(50);

    const corpus = extractSourceCorpus();
    expect(corpus.literals.size).toBeGreaterThan(50);

    const missing: string[] = [];
    const seen = new Set<string>();
    for (const reference of references) {
      const key = `${reference.kind}:${reference.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (ALLOWLIST.has(reference.id)) continue;
      const found =
        reference.kind === "exact"
          ? matchesExact(reference.id, corpus)
          : matchesPrefix(reference.id, corpus);
      if (!found) {
        missing.push(`${reference.id} (${reference.kind}) referenced by ${reference.file}`);
      }
    }

    expect(
      missing,
      "e2e references testIDs that no longer exist in packages/app/src or packages/desktop/src. " +
        "Either restore the testID on the new UI, update the helper/spec, or (only for dynamic " +
        "compositions the scanner cannot follow) add a justified ALLOWLIST entry.\n" +
        missing.join("\n"),
    ).toEqual([]);
  });

  test("allowlist entries stay minimal and still referenced", () => {
    const referencedIds = new Set(extractE2eReferences().map((reference) => reference.id));
    for (const [id] of ALLOWLIST) {
      expect(
        referencedIds.has(id),
        `ALLOWLIST entry "${id}" is no longer referenced — remove it`,
      ).toBe(true);
    }
  });
});
