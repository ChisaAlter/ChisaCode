/**
 * Metro config for React Native with source imports
 *
 * Enables direct TypeScript source imports from workspace packages
 * without requiring explicit build steps in development.
 */

const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Watch all workspace packages for changes
config.watchFolders = [workspaceRoot];

// Let Metro bundle TS files from workspace packages
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// Resolve workspace packages to their source directories
config.resolver.extraNodeModules = {
  "@chisacode/protocol": path.resolve(workspaceRoot, "packages/protocol/src"),
  "@chisacode/client": path.resolve(workspaceRoot, "packages/client/src"),
  "@chisacode/highlight": path.resolve(workspaceRoot, "packages/highlight/src"),
};

// Support TypeScript source files. Extend (never overwrite) Expo's default
// list — dropping css/mjs/cjs breaks packages that ship those (e.g.
// @expo/log-box imports ErrorToast.module.css, resolved via sourceExts).
config.resolver.sourceExts = Array.from(
  new Set([...config.resolver.sourceExts, "tsx", "ts", "jsx", "js", "json"]),
);

// Workspace sources use TypeScript NodeNext imports (e.g. "./parsers.js" for
// parsers.ts). Metro has no built-in mapping for the .js -> .ts rewrite, so
// retry those specifiers against .ts/.tsx before failing.
//
// Some published packages declare a `module` field that points at a file they
// do not ship (e.g. @xterm/headless 6.1.0-beta.303 says "lib/xterm.mjs" but
// only ships lib-headless/). Expo web prefers `module` over `main`, so retry
// the package's `main` entry when the preferred resolution fails.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Browser shim for node:diagnostics_channel — see metro-shims/diagnostics-channel.js.
  if (moduleName === "node:diagnostics_channel" || moduleName === "diagnostics_channel") {
    return context.resolveRequest(
      context,
      path.resolve(projectRoot, "metro-shims/diagnostics-channel.js"),
      platform,
    );
  }
  // Expo Router discovers routes via a recursive require.context over the
  // router root (src), which eagerly pulls every file under src into the
  // graph — including *.test.ts files that import vitest. Route discovery
  // must not bundle tests: stub context-originated test imports as empty.
  // Direct (non-context) imports of test files still fail loudly.
  if (
    /\.test\.[jt]sx?$/.test(moduleName) &&
    String(context.originModulePath ?? "").includes("?ctx=")
  ) {
    return { type: "empty" };
  }
  if (moduleName.endsWith(".js")) {
    for (const sourceExt of [".ts", ".tsx"]) {
      const candidate = `${moduleName.slice(0, -3)}${sourceExt}`;
      try {
        return context.resolveRequest(context, candidate, platform);
      } catch {
        // Try the next extension, then fall through to the default resolver.
      }
    }
  }
  try {
    return context.resolveRequest(context, moduleName, platform);
  } catch (error) {
    const isBareSpecifier = !moduleName.startsWith(".") && !path.isAbsolute(moduleName);
    if (!isBareSpecifier) throw error;
    let manifestPath;
    try {
      manifestPath = context.resolveRequest(context, `${moduleName}/package.json`, platform);
    } catch {
      throw error;
    }
    if (!manifestPath || manifestPath.type !== "sourceFile" || !manifestPath.filePath) {
      throw error;
    }
    const manifest = require(manifestPath.filePath);
    const mainEntry = manifest && manifest.main;
    if (typeof mainEntry !== "string" || mainEntry.length === 0) throw error;
    const mainCandidate = path.join(path.dirname(manifestPath.filePath), mainEntry);
    return context.resolveRequest(context, mainCandidate, platform);
  }
};

module.exports = config;
