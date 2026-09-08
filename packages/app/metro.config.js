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

function resolveElectronVariant(context, moduleName, platform) {
  // Electron desktop builds (CHISACODE_WEB_PLATFORM=electron, set by the
  // desktop packaging chain) resolve `*.electron.ts(x)` over the base module —
  // the AGENTS.md ".electron.ts(x) file convention". Metro has no electron
  // platform, so without this the packaged web bundle silently keeps the
  // stub/base variant (e.g. browser-pane) instead of the desktop
  // implementation.
  if (
    process.env.CHISACODE_WEB_PLATFORM !== "electron" ||
    platform !== "web" ||
    context.originModulePath?.includes("?ctx=")
  ) {
    return undefined;
  }
  for (const sourceExt of [".tsx", ".ts"]) {
    let resolution;
    try {
      resolution = context.resolveRequest(context, `${moduleName}.electron${sourceExt}`, platform);
    } catch {
      // No electron variant for this extension — try the next one.
      continue;
    }
    if (resolution && resolution.type !== "empty") {
      return resolution;
    }
  }
  return undefined;
}

function resolveNodeNextTsImport(context, moduleName, platform) {
  // Workspace sources use TypeScript NodeNext imports (e.g. "./parsers.js" for
  // parsers.ts). Metro has no built-in mapping for the .js -> .ts rewrite, so
  // retry those specifiers against .ts/.tsx before failing.
  if (!moduleName.endsWith(".js")) {
    return undefined;
  }
  for (const sourceExt of [".ts", ".tsx"]) {
    try {
      return context.resolveRequest(context, `${moduleName.slice(0, -3)}${sourceExt}`, platform);
    } catch {
      // Try the next extension, then fall through to the default resolver.
    }
  }
  return undefined;
}

function resolveBrokenModuleFieldFallback(context, moduleName, platform, originalError) {
  // Some published packages declare a `module` field that points at a file
  // they do not ship (e.g. @xterm/headless 6.1.0-beta.303 says "lib/xterm.mjs"
  // but only ships lib-headless/). Expo web prefers `module` over `main`, so
  // retry the package's `main` entry when the preferred resolution fails.
  const isBareSpecifier = !moduleName.startsWith(".") && !path.isAbsolute(moduleName);
  if (!isBareSpecifier) {
    throw originalError;
  }
  let manifestPath;
  try {
    manifestPath = context.resolveRequest(context, `${moduleName}/package.json`, platform);
  } catch {
    throw originalError;
  }
  if (!manifestPath || manifestPath.type !== "sourceFile" || !manifestPath.filePath) {
    throw originalError;
  }
  const manifest = require(manifestPath.filePath);
  const mainEntry = manifest && manifest.main;
  if (typeof mainEntry !== "string" || mainEntry.length === 0) {
    throw originalError;
  }
  const mainCandidate = path.join(path.dirname(manifestPath.filePath), mainEntry);
  return context.resolveRequest(context, mainCandidate, platform);
}

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const electronVariant = resolveElectronVariant(context, moduleName, platform);
  if (electronVariant) {
    return electronVariant;
  }
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
  const nodeNextRetry = resolveNodeNextTsImport(context, moduleName, platform);
  if (nodeNextRetry) {
    return nodeNextRetry;
  }
  try {
    return context.resolveRequest(context, moduleName, platform);
  } catch (error) {
    return resolveBrokenModuleFieldFallback(context, moduleName, platform, error);
  }
};

module.exports = config;
