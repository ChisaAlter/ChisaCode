/**
 * Pure utilities for release asset selection and version parsing.
 * Extracted from release.ts for testability.
 */

export interface GitHubAsset {
  name: string;
}

export interface GitHubRelease {
  tag_name: string;
  assets: GitHubAsset[];
  prerelease: boolean;
  draft: boolean;
}

const REQUIRED_ASSET_PATTERNS = [
  /ChisaCode-.*-arm64\.dmg$/, // Mac Apple Silicon
  /ChisaCode-.*-x86_64\.AppImage$/, // Linux AppImage
  /ChisaCode-Setup-.*\.exe$/, // Windows (any arch)
];

export function hasRequiredAssets(release: GitHubRelease): boolean {
  return REQUIRED_ASSET_PATTERNS.every((pattern) =>
    release.assets.some((asset) => pattern.test(asset.name)),
  );
}

export function pickWindowsAssets(assets: GitHubAsset[]): {
  x64: string | null;
  arm64: string | null;
} {
  const x64Suffixed = assets.find((a) => /ChisaCode-Setup-.*-x64\.exe$/.test(a.name));
  const arm64 = assets.find((a) => /ChisaCode-Setup-.*-arm64\.exe$/.test(a.name));
  const legacy = assets.find(
    (a) =>
      /ChisaCode-Setup-.*\.exe$/.test(a.name) &&
      !a.name.endsWith("-x64.exe") &&
      !a.name.endsWith("-arm64.exe"),
  );
  return {
    x64: (x64Suffixed ?? legacy)?.name ?? null,
    arm64: arm64?.name ?? null,
  };
}

export function versionFromTag(tag: string): string {
  return tag.replace(/^v/, "");
}

export interface ReleaseInfo {
  version: string;
  windowsX64Asset: string | null;
  windowsArm64Asset: string | null;
}

export function isReleaseInfo(value: unknown): value is ReleaseInfo {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.version === "string" &&
    /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(record.version) &&
    (typeof record.windowsX64Asset === "string" || record.windowsX64Asset === null) &&
    (typeof record.windowsArm64Asset === "string" || record.windowsArm64Asset === null) &&
    (record.windowsX64Asset === null ||
      new RegExp(
        `^ChisaCode-Setup-${(record.version as string).replaceAll(".", "\\.")}(?:-x64)?\\.exe$`,
      ).test(record.windowsX64Asset as string)) &&
    (record.windowsArm64Asset === null ||
      new RegExp(
        `^ChisaCode-Setup-${(record.version as string).replaceAll(".", "\\.")}-arm64\\.exe$`,
      ).test(record.windowsArm64Asset as string))
  );
}
