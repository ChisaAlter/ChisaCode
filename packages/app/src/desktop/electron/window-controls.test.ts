import { describe, expect, it } from "vitest";

import { getDesktopWindowControlsBackground } from "./window-controls";

describe("getDesktopWindowControlsBackground", () => {
  it("uses the titlebar color for the native window controls background", () => {
    expect(
      getDesktopWindowControlsBackground({
        foreground: "#09090b",
        surface0: "#f8fafc",
        surfaceSidebar: "#f4f4f5",
        surfaceWorkspace: "#ffffff",
      }),
    ).toBe("#f8fafc");
  });

  it("uses the workspace color when the titlebar color cannot be sent to Electron", () => {
    expect(
      getDesktopWindowControlsBackground({
        foreground: "#09090b",
        surface0: "transparent",
        surfaceSidebar: "#f4f4f5",
        surfaceWorkspace: "#ffffff",
      }),
    ).toBe("#ffffff");
  });

  it("uses the sidebar color when the titlebar and workspace colors are transparent", () => {
    expect(
      getDesktopWindowControlsBackground({
        foreground: "#09090b",
        surface0: "transparent",
        surfaceSidebar: "#f4f4f5",
        surfaceWorkspace: "transparent",
      }),
    ).toBe("#f4f4f5");
  });

  it("uses the opaque base canvas for transparent light themes", () => {
    expect(
      getDesktopWindowControlsBackground({
        foreground: "#1d1d1f",
        surface0: "#fbfdff",
        surfaceSidebar: "rgba(255, 255, 255, 0.28)",
        surfaceWorkspace: "transparent",
      }),
    ).toBe("#fbfdff");
  });

  it("uses the opaque base canvas for transparent dark themes", () => {
    expect(
      getDesktopWindowControlsBackground({
        foreground: "#fafafa",
        surface0: "#06111f",
        surfaceSidebar: "rgba(20, 23, 22, 0.5)",
        surfaceWorkspace: "transparent",
      }),
    ).toBe("#06111f");
  });
});
