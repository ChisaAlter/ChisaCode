import { existsSync, readdirSync, realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, relative as pathRelative } from "node:path";

// pnpm stores each dependency under node_modules/.pnpm/<name>@<version>/...,
// so the old `node_modules/<name>` existence check never matched and every
// patch was silently skipped. Resolve the real installed copies instead: the
// pnpm store entries plus any workspace-level symlink targets (which point back
// into the store).
const PATCHED_PACKAGES = [
  "react-native-draggable-flatlist",
  "react-native-gesture-handler",
  "react-native-worklets",
  "metro",
  "metro-runtime",
  "app-builder-lib",
];

function listPnpmCopies(packageName) {
  const pnpmDir = join("node_modules", ".pnpm");
  if (!existsSync(pnpmDir)) {
    return [];
  }
  // Scan every store entry: pnpm truncates long names to
  // `<name-prefix>_<hash>`, so prefix-matching the directory name is unreliable.
  return readdirSync(pnpmDir)
    .map((entry) => join(pnpmDir, entry, "node_modules", packageName))
    .filter((dir) => existsSync(dir));
}

function listWorkspaceCopies(packageName) {
  const packagesDir = "packages";
  if (!existsSync(packagesDir)) {
    return [];
  }
  return readdirSync(packagesDir)
    .map((entry) => join(packagesDir, entry, "node_modules", packageName))
    .filter((dir) => existsSync(dir));
}

/** git apply needs a repo-relative POSIX path, and symlinks must not duplicate work. */
function resolveApplyTargets(candidates) {
  const seen = new Map();
  for (const candidate of candidates) {
    let real = candidate;
    try {
      real = realpathSync(candidate);
    } catch {
      // keep the unresolved path
    }
    if (seen.has(real)) {
      continue;
    }
    const relative = pathRelativeToCwd(real);
    if (!relative) {
      continue;
    }
    seen.set(real, relative);
  }
  return [...seen.values()];
}

function pathRelativeToCwd(target) {
  const relative = pathRelative(process.cwd(), target);
  if (!relative || relative.startsWith("..")) {
    return null;
  }
  return toPosixPath(relative);
}

function runGitApply(args) {
  return spawnSync("git", args, { encoding: "utf8" });
}

/** git apply requires POSIX separators in --directory on Windows. */
function toPosixPath(target) {
  return target.replaceAll("\\", "/");
}

if (!existsSync("patches")) {
  process.exit(0);
}

const patchFiles = readdirSync("patches").filter((file) => file.endsWith(".patch"));
let applied = 0;
let alreadyApplied = 0;
let skipped = 0;

for (const packageName of PATCHED_PACKAGES) {
  const patchFile = patchFiles.find((file) => file.startsWith(`${packageName}+`));
  if (!patchFile) {
    continue;
  }
  const targets = resolveApplyTargets([
    ...listPnpmCopies(packageName),
    ...listWorkspaceCopies(packageName),
  ]);
  if (targets.length === 0) {
    continue;
  }
  const patchPath = join("patches", patchFile);
  for (const target of targets) {
    // Patch paths are `a/node_modules/<pkg>/<rest>`; strip three components so
    // `<rest>` lands inside the resolved package directory.
    const baseArgs = ["apply", "-p3", `--directory=${toPosixPath(target)}`];
    const check = runGitApply([...baseArgs, "--check", patchPath]);
    if (check.status === 0) {
      const result = runGitApply([...baseArgs, patchPath]);
      if (result.status === 0) {
        applied += 1;
        console.log(`[patches] applied ${patchFile} -> ${target}`);
      } else {
        console.warn(`[patches] failed ${patchFile} -> ${target}: ${result.stderr.trim()}`);
      }
      continue;
    }
    const reverseCheck = runGitApply([...baseArgs, "--reverse", "--check", patchPath]);
    if (reverseCheck.status === 0) {
      alreadyApplied += 1;
      continue;
    }
    skipped += 1;
    console.warn(
      `[patches] skipped ${patchFile} -> ${target} (context mismatch): ${check.stderr.trim()}`,
    );
  }
}

console.log(`[patches] applied=${applied} alreadyApplied=${alreadyApplied} skipped=${skipped}`);
