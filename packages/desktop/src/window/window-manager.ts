import {
  app,
  BrowserWindow,
  Menu,
  type MenuItemConstructorOptions,
  type WebContents,
  clipboard,
  ipcMain,
  nativeTheme,
  shell,
} from "electron";
import { translateDesktop } from "../i18n.js";
import { isAllowedExternalUrl } from "../features/opener.js";
import { getDesktopSettingsStore } from "../settings/desktop-settings-electron.js";

const IPC_PREFIXES = ["chisacode"] as const;
const OPAQUE_HEX_COLOR = /^#[\da-f]{6}$/i;
const MAIN_WINDOW_MIN_WIDTH = 980;
const MAIN_WINDOW_MIN_HEIGHT = 720;

export function readBadgeCount(input: unknown): number {
  if (typeof input !== "number" || !Number.isSafeInteger(input) || input < 0) {
    return 0;
  }

  return input;
}

export type WindowTheme = "light" | "dark";
export interface WindowControlsOverlayUpdate {
  height?: number;
  backgroundColor?: string;
  foregroundColor?: string;
}

export interface WindowControlsOverlayState {
  height: number;
  backgroundColor?: string;
  foregroundColor?: string;
}

export function readWindowTheme(input: unknown): WindowTheme | null {
  if (input === "light" || input === "dark") {
    return input;
  }

  return null;
}

export function resolveSystemWindowTheme(): WindowTheme {
  return nativeTheme.shouldUseDarkColors ? "dark" : "light";
}

export function getWindowBackgroundColor(theme: WindowTheme): string {
  return theme === "dark" ? "#181B1A" : "#ffffff";
}

export function createWindowControlsOverlayState(theme: WindowTheme): WindowControlsOverlayState {
  const overlay = getTitleBarOverlayOptions(theme);
  return {
    height: overlay.height ?? 29,
    backgroundColor: overlay.color,
    foregroundColor: overlay.symbolColor,
  };
}

export function getTitleBarOverlayOptions(theme: WindowTheme): Electron.TitleBarOverlayOptions {
  if (theme === "dark") {
    return { color: "#181B1A", symbolColor: "#e4e4e7", height: 29 };
  }

  return { color: "#ffffff", symbolColor: "#09090b", height: 29 };
}

export function getMainWindowChromeOptions(input: {
  platform: NodeJS.Platform;
  theme: WindowTheme;
}): Pick<
  Electron.BrowserWindowConstructorOptions,
  "titleBarStyle" | "trafficLightPosition" | "frame" | "titleBarOverlay" | "autoHideMenuBar"
> {
  if (input.platform === "darwin") {
    return {
      titleBarStyle: "hidden",
      titleBarOverlay: true,
      trafficLightPosition: { x: 16, y: 14 },
    };
  }

  return {
    titleBarStyle: "hidden",
    frame: false,
    titleBarOverlay: getTitleBarOverlayOptions(input.theme),
    autoHideMenuBar: true,
  };
}

export function getMainWindowSizingOptions(): Pick<
  Electron.BrowserWindowConstructorOptions,
  "minWidth" | "minHeight"
> {
  return {
    minWidth: MAIN_WINDOW_MIN_WIDTH,
    minHeight: MAIN_WINDOW_MIN_HEIGHT,
  };
}

function readFiniteOverlayHeight(input: unknown): number | null {
  if (typeof input !== "number" || !Number.isFinite(input)) {
    return null;
  }

  const rounded = Math.round(input);
  return rounded >= 1 ? rounded : null;
}

function readOverlayColor(input: unknown): string | null {
  if (typeof input !== "string") {
    return null;
  }

  const color = input.trim();
  return OPAQUE_HEX_COLOR.test(color) ? color : null;
}

export function readWindowControlsOverlayUpdate(
  input: unknown,
): WindowControlsOverlayUpdate | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const candidate = input as Record<string, unknown>;
  const height = readFiniteOverlayHeight(candidate.height);
  const backgroundColor = readOverlayColor(candidate.backgroundColor);
  const foregroundColor = readOverlayColor(candidate.foregroundColor);

  if (height === null && backgroundColor === null && foregroundColor === null) {
    return null;
  }

  return {
    ...(height !== null ? { height } : {}),
    ...(backgroundColor !== null ? { backgroundColor } : {}),
    ...(foregroundColor !== null ? { foregroundColor } : {}),
  };
}

export function resolveRuntimeTitleBarOverlayOptions(
  state: WindowControlsOverlayState,
): Electron.TitleBarOverlayOptions {
  return {
    color: state.backgroundColor?.trim() === "" ? undefined : state.backgroundColor,
    symbolColor: state.foregroundColor?.trim() === "" ? undefined : state.foregroundColor,
    height: Math.max(0, state.height - 1),
  };
}

export function applyWindowControlsOverlayUpdate(input: {
  win: Pick<BrowserWindow, "setTitleBarOverlay">;
  current: WindowControlsOverlayState;
  update: WindowControlsOverlayUpdate;
}): WindowControlsOverlayState {
  const next: WindowControlsOverlayState = {
    height: input.update.height ?? input.current.height,
    backgroundColor: input.update.backgroundColor ?? input.current.backgroundColor,
    foregroundColor: input.update.foregroundColor ?? input.current.foregroundColor,
  };

  input.win.setTitleBarOverlay(resolveRuntimeTitleBarOverlayOptions(next));
  return next;
}

export function registerWindowManager(): void {
  const overlayStateByWindow = new WeakMap<BrowserWindow, WindowControlsOverlayState>();

  const toggleMaximize = (event: Electron.IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  };

  const isFullscreen = (event: Electron.IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return win?.isFullScreen() ?? false;
  };

  const setBadgeCount = (_event: Electron.IpcMainInvokeEvent, count?: unknown) => {
    if (process.platform === "darwin" || process.platform === "linux") {
      const badgeCount = readBadgeCount(count);
      try {
        app.setBadgeCount(badgeCount);
      } catch (error) {
        console.warn("[window-manager] Failed to update badge count", {
          count,
          badgeCount,
          error,
        });
      }
    }
  };

  const updateWindowControls = (event: Electron.IpcMainInvokeEvent, update?: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) {
      return;
    }

    const nextUpdate = readWindowControlsOverlayUpdate(update);
    if (!nextUpdate) {
      return;
    }

    if (nextUpdate.backgroundColor) {
      win.setBackgroundColor(nextUpdate.backgroundColor);
    }

    if (process.platform === "darwin") {
      return;
    }

    const current =
      overlayStateByWindow.get(win) ?? createWindowControlsOverlayState(resolveSystemWindowTheme());
    const nextState = applyWindowControlsOverlayUpdate({
      win,
      current,
      update: nextUpdate,
    });
    overlayStateByWindow.set(win, nextState);
  };

  for (const prefix of IPC_PREFIXES) {
    ipcMain.handle(`${prefix}:window:toggleMaximize`, toggleMaximize);
    ipcMain.handle(`${prefix}:window:isFullscreen`, isFullscreen);
    ipcMain.handle(`${prefix}:window:setBadgeCount`, setBadgeCount);
    ipcMain.handle(`${prefix}:window:updateWindowControls`, updateWindowControls);
  }
}

export function setupWindowResizeEvents(win: BrowserWindow): void {
  win.on("resize", () => {
    for (const prefix of IPC_PREFIXES) {
      win.webContents.send(`${prefix}:window:resized`, {});
    }
  });

  win.on("enter-full-screen", () => {
    for (const prefix of IPC_PREFIXES) {
      win.webContents.send(`${prefix}:window:resized`, {});
    }
  });

  win.on("leave-full-screen", () => {
    for (const prefix of IPC_PREFIXES) {
      win.webContents.send(`${prefix}:window:resized`, {});
    }
  });
}

export async function buildStandardContextMenuItems(
  contents: WebContents,
  params: Electron.ContextMenuParams,
): Promise<MenuItemConstructorOptions[]> {
  const language = (await getDesktopSettingsStore().get()).language;
  const t = (key: Parameters<typeof translateDesktop>[1]) => translateDesktop(language, key);
  const items: MenuItemConstructorOptions[] = [];

  if (params.misspelledWord) {
    if (params.dictionarySuggestions.length > 0) {
      for (const suggestion of params.dictionarySuggestions) {
        items.push({
          label: suggestion,
          click: () => contents.replaceMisspelling(suggestion),
        });
      }
    } else {
      items.push({ label: t("menu.noSuggestions"), enabled: false });
    }
    items.push({ type: "separator" });
    items.push({
      label: t("menu.addToDictionary"),
      click: () => contents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
    });
    items.push({ type: "separator" });
  }

  if (isAllowedExternalUrl(params.linkURL)) {
    items.push({
      label: t("menu.openLinkInBrowser"),
      click: () => {
        void shell.openExternal(params.linkURL);
      },
    });
    items.push({
      label: t("menu.copyLinkAddress"),
      click: () => clipboard.writeText(params.linkURL),
    });
    items.push({ type: "separator" });
  }

  if (params.hasImageContents && params.srcURL) {
    items.push({
      label: t("menu.copyImage"),
      click: () => contents.copyImageAt(params.x, params.y),
    });
    items.push({
      label: t("menu.saveImageAs"),
      click: () => contents.downloadURL(params.srcURL),
    });
    items.push({ type: "separator" });
  }

  if (params.isEditable) {
    items.push({ role: "cut", enabled: params.editFlags.canCut });
    items.push({ role: "copy", enabled: params.editFlags.canCopy });
    items.push({ role: "paste", enabled: params.editFlags.canPaste });
    items.push({ type: "separator" });
    items.push({ role: "selectAll" });
  } else {
    items.push({ role: "copy", enabled: params.selectionText.length > 0 });
    items.push({ role: "paste" });
    items.push({ type: "separator" });
    items.push({ role: "selectAll" });
  }

  return items;
}

export function setupDefaultContextMenu(win: BrowserWindow): void {
  win.webContents.on("context-menu", (_event, params) => {
    void (async () => {
      const items = await buildStandardContextMenuItems(win.webContents, params);
      const menu = Menu.buildFromTemplate(items);
      menu.popup({ window: win });
    })();
  });
}

/**
 * Prevent Electron from navigating to files dragged onto the window.
 * The renderer handles drag-drop via standard HTML5 APIs instead.
 */
export function setupDragDropPrevention(win: BrowserWindow): void {
  win.webContents.on("will-navigate", (event, url) => {
    // Allow normal navigation (e.g. dev server hot-reload) but block file:// URLs
    // that result from dropping files onto the window.
    if (url.startsWith("file://")) {
      event.preventDefault();
    }
  });
}
