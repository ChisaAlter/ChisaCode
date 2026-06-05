import { shell, ipcMain } from "electron";
import { translateDesktop } from "../i18n.js";
import { getDesktopSettingsStore } from "../settings/desktop-settings-electron.js";

const ALLOWED_EXTERNAL_URL_PROTOCOLS = new Set(["http:", "https:"]);
const IPC_PREFIXES = ["chisacode"] as const;

export function isAllowedExternalUrl(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  try {
    const url = new URL(value);
    return ALLOWED_EXTERNAL_URL_PROTOCOLS.has(url.protocol);
  } catch {
    return false;
  }
}

export function registerOpenerHandlers(): void {
  const openUrl = async (_event: Electron.IpcMainInvokeEvent, url: unknown) => {
    const language = (await getDesktopSettingsStore().get()).language;
    if (!isAllowedExternalUrl(url)) {
      throw new Error(translateDesktop(language, "opener.unsupportedExternalUrl"));
    }
    await shell.openExternal(url);
  };

  for (const prefix of IPC_PREFIXES) {
    ipcMain.handle(`${prefix}:opener:openUrl`, openUrl);
  }
}
