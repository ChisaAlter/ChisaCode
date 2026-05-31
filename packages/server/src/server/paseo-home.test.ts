import { mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import { resolvePaseoHome } from "./paseo-home.js";
import { PRIVATE_DIRECTORY_MODE } from "./private-files.js";

const MODE_MASK = 0o777;

function modeOf(filePath: string): number {
  return statSync(filePath).mode & MODE_MASK;
}

describe.skipIf(process.platform === "win32")("resolvePaseoHome permissions", () => {
  test("creates FLEURDELYS_HOME with private permissions", () => {
    const parent = mkdtempSync(path.join(tmpdir(), "paseo-home-parent-"));
    const fleurdelysHome = path.join(parent, "home");
    try {
      expect(resolvePaseoHome({ FLEURDELYS_HOME: fleurdelysHome })).toBe(fleurdelysHome);
      expect(modeOf(fleurdelysHome)).toBe(PRIVATE_DIRECTORY_MODE);
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });
});

describe("resolvePaseoHome compatibility", () => {
  test("prefers FLEURDELYS_HOME over PASEO_HOME", () => {
    const parent = mkdtempSync(path.join(tmpdir(), "paseo-home-parent-"));
    const fleurdelysHome = path.join(parent, "fleurdelys");
    const paseoHome = path.join(parent, "paseo");
    try {
      expect(
        resolvePaseoHome({
          FLEURDELYS_HOME: fleurdelysHome,
          PASEO_HOME: paseoHome,
        }),
      ).toBe(path.resolve(fleurdelysHome));
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  test("falls back to PASEO_HOME", () => {
    const parent = mkdtempSync(path.join(tmpdir(), "paseo-home-parent-"));
    const paseoHome = path.join(parent, "paseo");
    try {
      expect(resolvePaseoHome({ PASEO_HOME: paseoHome })).toBe(path.resolve(paseoHome));
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  test("uses legacy default home when it exists and the new default does not", () => {
    const parent = mkdtempSync(path.join(tmpdir(), "paseo-home-parent-"));
    const realHome = process.env.HOME;
    const realUserProfile = process.env.USERPROFILE;
    try {
      process.env.HOME = parent;
      process.env.USERPROFILE = parent;
      mkdirSync(path.join(parent, ".paseo"));

      expect(resolvePaseoHome({})).toBe(path.join(parent, ".paseo"));
    } finally {
      if (realHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = realHome;
      }
      if (realUserProfile === undefined) {
        delete process.env.USERPROFILE;
      } else {
        process.env.USERPROFILE = realUserProfile;
      }
      rmSync(parent, { recursive: true, force: true });
    }
  });
});
