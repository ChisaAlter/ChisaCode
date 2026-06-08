import { describe, it, expect } from "vitest";
import {
  hasRequiredAssets,
  pickWindowsAssets,
  versionFromTag,
  isReleaseInfo,
  type GitHubRelease,
  type GitHubAsset,
} from "./release-utils";

describe("hasRequiredAssets", () => {
  const makeRelease = (assetNames: string[]): GitHubRelease => ({
    tag_name: "v1.0.0",
    assets: assetNames.map((name) => ({ name })),
    prerelease: false,
    draft: false,
  });

  const validAssets = [
    "ChisaCode-1.0.0-arm64.dmg",
    "ChisaCode-1.0.0-x86_64.AppImage",
    "ChisaCode-Setup-1.0.0.exe",
  ];

  it("returns true when all required platforms are present", () => {
    expect(hasRequiredAssets(makeRelease(validAssets))).toBe(true);
  });

  it("returns false when Mac dmg is missing", () => {
    const assets = validAssets.filter((n) => !n.endsWith(".dmg"));
    expect(hasRequiredAssets(makeRelease(assets))).toBe(false);
  });

  it("returns false when Linux AppImage is missing", () => {
    const assets = validAssets.filter((n) => !n.endsWith(".AppImage"));
    expect(hasRequiredAssets(makeRelease(assets))).toBe(false);
  });

  it("returns false when Windows exe is missing", () => {
    const assets = validAssets.filter((n) => !n.endsWith(".exe"));
    expect(hasRequiredAssets(makeRelease(assets))).toBe(false);
  });

  it("returns false for empty assets", () => {
    expect(hasRequiredAssets(makeRelease([]))).toBe(false);
  });
});

describe("pickWindowsAssets", () => {
  const makeAssets = (names: string[]): GitHubAsset[] => names.map((name) => ({ name }));

  it("picks x64 suffixed exe over legacy", () => {
    const assets = makeAssets(["ChisaCode-Setup-1.0.0-x64.exe"]);
    const result = pickWindowsAssets(assets);
    expect(result.x64).toBe("ChisaCode-Setup-1.0.0-x64.exe");
    expect(result.arm64).toBeNull();
  });

  it("picks arm64 exe", () => {
    const assets = makeAssets(["ChisaCode-Setup-1.0.0-arm64.exe"]);
    const result = pickWindowsAssets(assets);
    expect(result.arm64).toBe("ChisaCode-Setup-1.0.0-arm64.exe");
  });

  it("falls back to legacy exe when no x64 suffix", () => {
    const assets = makeAssets(["ChisaCode-Setup-1.0.0.exe"]);
    const result = pickWindowsAssets(assets);
    expect(result.x64).toBe("ChisaCode-Setup-1.0.0.exe");
  });

  it("returns null for x64 when no matching exe", () => {
    const assets = makeAssets(["ChisaCode-Setup-1.0.0-arm64.exe"]);
    const result = pickWindowsAssets(assets);
    expect(result.x64).toBeNull();
  });
});

describe("versionFromTag", () => {
  it("strips leading v", () => {
    expect(versionFromTag("v1.0.0")).toBe("1.0.0");
  });

  it("returns the string unchanged when no v prefix", () => {
    expect(versionFromTag("1.0.0")).toBe("1.0.0");
  });
});

describe("isReleaseInfo", () => {
  it("accepts valid release info", () => {
    expect(
      isReleaseInfo({
        version: "1.0.0",
        windowsX64Asset: "ChisaCode-Setup-1.0.0.exe",
        windowsArm64Asset: null,
      }),
    ).toBe(true);
  });

  it("accepts release info with x64 suffix", () => {
    expect(
      isReleaseInfo({
        version: "1.0.0",
        windowsX64Asset: "ChisaCode-Setup-1.0.0-x64.exe",
        windowsArm64Asset: "ChisaCode-Setup-1.0.0-arm64.exe",
      }),
    ).toBe(true);
  });

  it("accepts null windows assets", () => {
    expect(
      isReleaseInfo({
        version: "1.0.0",
        windowsX64Asset: null,
        windowsArm64Asset: null,
      }),
    ).toBe(true);
  });

  it("rejects non-object values", () => {
    expect(isReleaseInfo(null)).toBe(false);
    expect(isReleaseInfo("string")).toBe(false);
    expect(isReleaseInfo(42)).toBe(false);
  });

  it("rejects invalid version format", () => {
    expect(
      isReleaseInfo({
        version: "latest",
        windowsX64Asset: null,
        windowsArm64Asset: null,
      }),
    ).toBe(false);
  });

  it("accepts prerelease version format", () => {
    expect(
      isReleaseInfo({
        version: "1.0.0-beta.1",
        windowsX64Asset: null,
        windowsArm64Asset: null,
      }),
    ).toBe(true);
  });
});
