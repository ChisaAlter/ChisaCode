import { describe, expect, it } from "vitest";

import { getDesktopWindowControlsBackground } from "./window-controls";

describe("getDesktopWindowControlsBackground", () => {
  it("uses the workspace chrome color for the native window controls background", () => {
    expect(
      getDesktopWindowControlsBackground({
        surfaceSidebar: "#f4f4f5",
        surfaceWorkspace: "#ffffff",
      }),
    ).toBe("#ffffff");
  });
});
