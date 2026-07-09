import { describe, expect, it } from "vitest";

import { getDesktopWindowControlsBackground } from "./window-controls";

describe("getDesktopWindowControlsBackground", () => {
  it("uses the workspace chrome color for the native window controls background", () => {
    expect(
      getDesktopWindowControlsBackground({
        foreground: "#09090b",
        surfaceSidebar: "#f4f4f5",
        surfaceWorkspace: "#ffffff",
      }),
    ).toBe("#ffffff");
  });

  it("uses the sidebar color when the workspace color cannot be sent to Electron", () => {
    expect(
      getDesktopWindowControlsBackground({
        foreground: "#09090b",
        surfaceSidebar: "#f4f4f5",
        surfaceWorkspace: "transparent",
      }),
    ).toBe("#f4f4f5");
  });

  it("falls back to an opaque light chrome color for transparent light themes", () => {
    expect(
      getDesktopWindowControlsBackground({
        foreground: "#1d1d1f",
        surfaceSidebar: "rgba(255, 255, 255, 0.28)",
        surfaceWorkspace: "transparent",
      }),
    ).toBe("#ffffff");
  });

  it("falls back to an opaque dark chrome color for transparent dark themes", () => {
    expect(
      getDesktopWindowControlsBackground({
        foreground: "#fafafa",
        surfaceSidebar: "rgba(20, 23, 22, 0.5)",
        surfaceWorkspace: "transparent",
      }),
    ).toBe("#181B1A");
  });
});
