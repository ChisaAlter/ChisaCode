import { access } from "node:fs/promises";
import { createRequire } from "node:module";
import { describe, expect, test } from "vitest";

interface SmokeRuntime {
  smokeHome: string;
  userData: string;
  desktopEnv: NodeJS.ProcessEnv;
  cliEnv: NodeJS.ProcessEnv;
  cleanupStopEnv: NodeJS.ProcessEnv;
  cleanup(): Promise<void>;
}

interface SmokePackagedDesktopAppModule {
  createSmokeRuntime(): SmokeRuntime;
}

const require = createRequire(import.meta.url);
const { createSmokeRuntime } =
  require("./smoke-packaged-desktop-app.js") as SmokePackagedDesktopAppModule;

describe("packaged desktop smoke runtime", () => {
  test("uses one isolated CHISACODE_HOME for desktop, CLI, and cleanup commands", async () => {
    const runtime = createSmokeRuntime();

    try {
      expect(runtime.smokeHome).not.toBe(runtime.userData);
      expect({
        desktopHome: runtime.desktopEnv.CHISACODE_HOME,
        cliHome: runtime.cliEnv.CHISACODE_HOME,
        cleanupHome: runtime.cleanupStopEnv.CHISACODE_HOME,
        userData: runtime.desktopEnv.CHISACODE_ELECTRON_USER_DATA_DIR,
      }).toEqual({
        desktopHome: runtime.smokeHome,
        cliHome: runtime.smokeHome,
        cleanupHome: runtime.smokeHome,
        userData: runtime.userData,
      });
    } finally {
      await runtime.cleanup();
    }
  });

  test("cleanup removes both isolated runtime directories", async () => {
    const runtime = createSmokeRuntime();

    await expect(access(runtime.smokeHome)).resolves.toBeUndefined();
    await expect(access(runtime.userData)).resolves.toBeUndefined();

    await runtime.cleanup();

    await expect(access(runtime.smokeHome)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(access(runtime.userData)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
