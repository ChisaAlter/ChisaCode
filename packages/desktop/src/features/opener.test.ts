import { ipcMain, shell } from "electron";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { isAllowedExternalUrl, registerOpenerHandlers } from "./opener";

vi.mock("electron", () => ({
  ipcMain: { handle: vi.fn() },
  shell: { openExternal: vi.fn() },
}));

// opener.ts reads the configured language via getDesktopSettingsStore() to
// translate the "unsupported external URL" error. Mock the settings module so
// the test does not pull in `app.getPath("userData")` (which the electron mock
// above does not expose). Use English so the thrown message matches the
// assertion below.
vi.mock("../settings/desktop-settings-electron.js", () => ({
  getDesktopSettingsStore: () => ({
    get: async () => ({ language: "en" }),
  }),
}));

function getRegisteredOpenUrlHandler(): (_event: unknown, url: unknown) => Promise<void> {
  registerOpenerHandlers();
  const handler = vi.mocked(ipcMain.handle).mock.calls.find(([channel]) => {
    return channel === "chisacode:opener:openUrl";
  })?.[1];
  if (typeof handler !== "function") {
    throw new Error("open URL handler was not registered");
  }
  return handler as (_event: unknown, url: unknown) => Promise<void>;
}

describe("desktop opener", () => {
  beforeEach(() => {
    vi.mocked(ipcMain.handle).mockReset();
    vi.mocked(shell.openExternal).mockReset();
  });

  it("allows only http and https external URLs", () => {
    expect(isAllowedExternalUrl("https://example.com/path")).toBe(true);
    expect(isAllowedExternalUrl("http://localhost:8081")).toBe(true);
    expect(isAllowedExternalUrl("file:///etc/passwd")).toBe(false);
    expect(isAllowedExternalUrl("javascript:alert(1)")).toBe(false);
    expect(isAllowedExternalUrl("chisacode://settings")).toBe(false);
    expect(isAllowedExternalUrl("/relative/path")).toBe(false);
    expect(isAllowedExternalUrl(null)).toBe(false);
  });

  it("opens allowed URLs through Electron shell", async () => {
    const handler = getRegisteredOpenUrlHandler();

    await handler({}, "https://example.com");

    expect(shell.openExternal).toHaveBeenCalledWith("https://example.com");
  });

  it("rejects blocked URLs before invoking Electron shell", async () => {
    const handler = getRegisteredOpenUrlHandler();

    await expect(handler({}, "file:///etc/passwd")).rejects.toThrow("Unsupported external URL");

    expect(shell.openExternal).not.toHaveBeenCalled();
  });
});
