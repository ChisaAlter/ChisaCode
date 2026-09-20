#!/usr/bin/env node

// x64-only Windows packaged build for the desktop e2e gate.
//
// Mirrors scripts/build.js (custom asar-integrity-after-rcedit packager that
// re-embeds the asar hash after rcedit rewrites the exe) but restricts the
// electron-builder targets to win x64 (nsis + zip) and skips arm64, halving
// the build time for local packaged verification loops. Run from
// packages/desktop: `node scripts/build-x64.js`.
//
// pnpm workspaces: electron-builder's `pnpm list` collector resolves to the
// workspace root in a monorepo, so it packs zero node_modules from
// packages/desktop directly. Stage the app with `pnpm deploy` first — the
// deploy dir is self-contained (own .pnpm slice) — and point electron-builder
// at it, rewriting the yml's relative resource paths to the real sources.
const { build, Arch, Platform } = require("electron-builder");
const { WinPackager } = require("app-builder-lib");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const packageRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(packageRoot, "..", "..");
const deployDir = path.join(packageRoot, "release", ".deploy");

class WindowsAsarIntegrityAfterRceditPackager extends WinPackager {
  async doPack(packOptions) {
    return super.doPack({
      ...packOptions,
      options: {
        ...packOptions.options,
        disableAsarIntegrity: true,
      },
    });
  }
}

function platformPackagerFactory(info, platform) {
  switch (platform) {
    case Platform.WINDOWS:
      return new WindowsAsarIntegrityAfterRceditPackager(info);
    default:
      throw new Error(`Unsupported desktop build platform: ${platform.name}`);
  }
}

const winTargets = new Map();
winTargets.set(Platform.WINDOWS, new Map([[Arch.x64, ["nsis", "zip"]]]));

function stageDeployDir() {
  fs.rmSync(deployDir, { recursive: true, force: true });
  console.log("[build-x64] staging deploy dir:", deployDir);
  const deploy = spawnSync(
    "pnpm",
    ["--filter=@chisacode/desktop", "deploy", "--prod", "--legacy", deployDir],
    { cwd: repoRoot, stdio: "inherit", shell: process.platform === "win32" },
  );
  if (deploy.status !== 0 || !fs.existsSync(path.join(deployDir, "dist", "main.js"))) {
    throw new Error(`pnpm deploy failed (status ${deploy.status})`);
  }
  flattenDeployedNodeModules();

  // The deployed yml keeps repo-relative resource paths; point them at the
  // real sources and send build output to the canonical release dir.
  const ymlPath = path.join(deployDir, "electron-builder.yml");
  const toPosix = (value) => value.replace(/\\/g, "/");
  let yml = fs.readFileSync(ymlPath, "utf8");
  yml = yml
    .replace(
      "from: ../app/dist",
      `from: ${toPosix(path.join(repoRoot, "packages", "app", "dist"))}`,
    )
    .replace("from: ../../skills", `from: ${toPosix(path.join(repoRoot, "skills"))}`)
    .replace("output: release", `output: ${toPosix(path.join(packageRoot, "release"))}`);
  fs.writeFileSync(ymlPath, yml);
}

// electron-builder's traversal collector resolves transitive deps with an
// upward node_modules walk from each package's symlink path, which never
// reaches the pnpm .pnpm sibling slices. Hoist every package that appears in
// any .pnpm slice to the deploy's top-level node_modules (junction if not
// already present) so the walk finds the full production closure.
function flattenDeployedNodeModules() {
  const nmDir = path.join(deployDir, "node_modules");
  const pnpmDir = path.join(nmDir, ".pnpm");
  if (!fs.existsSync(pnpmDir)) {
    throw new Error("deploy node_modules/.pnpm missing after pnpm deploy");
  }
  let hoisted = 0;
  const hoist = (src, dest) => {
    if (fs.existsSync(dest)) return;
    fs.symlinkSync(src, dest, "junction");
    hoisted += 1;
  };
  for (const slice of fs.readdirSync(pnpmDir)) {
    const sliceNm = path.join(pnpmDir, slice, "node_modules");
    if (!fs.existsSync(sliceNm)) continue;
    for (const entry of fs.readdirSync(sliceNm)) {
      if (entry === ".pnpm") continue;
      const entryPath = path.join(sliceNm, entry);
      let st;
      try {
        st = fs.lstatSync(entryPath);
      } catch {
        continue;
      }
      if (!st.isDirectory() && !st.isSymbolicLink()) continue;
      if (entry.startsWith("@")) {
        const scopedDest = path.join(nmDir, entry);
        fs.mkdirSync(scopedDest, { recursive: true });
        for (const child of fs.readdirSync(entryPath)) {
          hoist(path.join(entryPath, child), path.join(scopedDest, child));
        }
        continue;
      }
      hoist(entryPath, path.join(nmDir, entry));
    }
  }
  console.log(`[build-x64] hoisted ${hoisted} transitive packages to deploy node_modules`);
}

function main() {
  // Export the renderer here (Node-level env, no cmd/cross-env chain): the
  // desktop renderer must carry the `.electron.ts(x)` variants, which the
  // metro resolver only picks up when CHISACODE_WEB_PLATFORM=electron.
  const appDir = path.join(repoRoot, "packages", "app");
  console.log("[build-x64] exporting renderer web bundle");
  const expoBin = path.join(
    appDir,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "expo.CMD" : "expo",
  );
  const exportResult = spawnSync(expoBin, ["export", "--platform", "web"], {
    cwd: appDir,
    env: { ...process.env, CHISACODE_WEB_PLATFORM: "electron" },
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (exportResult.status !== 0 || !fs.existsSync(path.join(appDir, "dist", "index.html"))) {
    throw new Error(`expo export failed (status ${exportResult.status})`);
  }
  stageDeployDir();
  console.log("[build-x64] building electron targets from staged deploy dir");
  return build({
    projectDir: deployDir,
    config: path.join(deployDir, "electron-builder.yml"),
    platformPackagerFactory,
    targets: winTargets,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
