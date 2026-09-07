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

// Support TypeScript source files
config.resolver.sourceExts = ["tsx", "ts", "jsx", "js", "json"];

module.exports = config;
