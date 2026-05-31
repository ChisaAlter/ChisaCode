import { shell, ipcMain } from "electron";

const ALLOWED_EXTERNAL_URL_PROTOCOLS = new Set(["http:", "https:"]);
const IPC_PREFIXES = ["chisacode", "chisacode"] as const;

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
    if (!isAllowedExternalUrl(url)) {
      throw new Error("不支持的外部 URL");
    }
    await shell.openExternal(url);
  };

  for (const prefix of IPC_PREFIXES) {
    ipcMain.handle(`${prefix}:opener:openUrl`, openUrl);
  }
}
