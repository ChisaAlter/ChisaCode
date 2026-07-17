import { describe, expect, it } from "vitest";
import { resolveWindowControlsPadding } from "@/utils/desktop-window";

const rawPadding = {
  left: 80,
  right: 48,
  top: 28,
};

describe("resolveWindowControlsPadding", () => {
  it("integrates desktop content into the titlebar instead of reserving a top spacer", () => {
    expect(
      resolveWindowControlsPadding({
        role: "sidebar",
        rawPadding,
        sidebarClosed: false,
        explorerOpen: false,
        focusModeEnabled: false,
      }),
    ).toEqual({
      left: 80,
      right: 0,
      top: 0,
    });
  });

  it("pads the main header for window controls when the app sidebar is closed", () => {
    expect(
      resolveWindowControlsPadding({
        role: "header",
        rawPadding,
        sidebarClosed: true,
        explorerOpen: false,
        focusModeEnabled: false,
      }),
    ).toEqual({
      left: 80,
      right: 48,
      top: 0,
    });
  });

  it("does not add left padding to detail headers with their own sidebar", () => {
    expect(
      resolveWindowControlsPadding({
        role: "detailHeader",
        rawPadding,
        sidebarClosed: true,
        explorerOpen: false,
        focusModeEnabled: false,
      }),
    ).toEqual({
      left: 0,
      right: 48,
      top: 0,
    });
  });

  it("keeps desktop workspace tab rows in the content row", () => {
    expect(
      resolveWindowControlsPadding({
        role: "tabRow",
        rawPadding,
        sidebarClosed: false,
        explorerOpen: false,
        focusModeEnabled: false,
      }),
    ).toEqual({
      left: 0,
      right: 0,
      top: 0,
    });
  });

  it("only reserves horizontal window controls space for tab rows in focus mode", () => {
    expect(
      resolveWindowControlsPadding({
        role: "tabRow",
        rawPadding,
        sidebarClosed: true,
        explorerOpen: false,
        focusModeEnabled: true,
      }),
    ).toEqual({
      left: 80,
      right: 48,
      top: 0,
    });
  });

  it("offsets the explorer sidebar from Windows caption buttons", () => {
    expect(
      resolveWindowControlsPadding({
        role: "explorerSidebar",
        rawPadding,
        sidebarClosed: false,
        explorerOpen: true,
        focusModeEnabled: false,
      }),
    ).toEqual({
      left: 0,
      right: 48,
      top: 28,
    });
  });
});
