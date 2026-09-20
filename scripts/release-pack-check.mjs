// Dry-run pack check for the publishable workspace packages.
// `npm pack` cannot be used here: it fails on `workspace:`/`catalog:` specifiers
// and would not rewrite them anyway, so it cannot validate the real publish
// manifest. `pnpm pack` rewrites workspace deps to resolved versions exactly
// like `pnpm publish` does. Tarballs land next to each package.json and are
// removed after the check.
import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const PACKAGES = [
  "@chisacode/highlight",
  "@chisacode/relay",
  "@chisacode/protocol",
  "@chisacode/client",
  "@chisacode/server",
  "@chisacode/cli",
];

// pnpm writes tarballs to the invoking cwd (repo root when run via npm scripts).
function listTarballs() {
  return readdirSync(".")
    .filter((f) => f.startsWith("chisacode-") && f.endsWith(".tgz"))
    .map((f) => join(".", f));
}

function run(cmd, args) {
  // pnpm is a .cmd shim on Windows and cannot be spawned without a shell.
  const result =
    process.platform === "win32"
      ? spawnSync("cmd.exe", ["/d", "/s", "/c", [cmd, ...args].join(" ")], { stdio: "inherit" })
      : spawnSync(cmd, args, { stdio: "inherit" });
  return result.status === 0;
}

let failed = false;
for (const t of listTarballs()) rmSync(t, { force: true });

try {
  for (const pkg of PACKAGES) {
    if (!run("pnpm", ["--filter", pkg, "pack"])) {
      failed = true;
    }
  }
  const tarballs = listTarballs();
  console.log(`pack check: ${tarballs.length}/${PACKAGES.length} tarballs produced`);
  for (const t of tarballs) console.log(`  ${t}`);
  if (tarballs.length !== PACKAGES.length) failed = true;
} finally {
  for (const t of listTarballs()) rmSync(t, { force: true });
}

if (failed) process.exit(1);
