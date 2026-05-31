import { contextBridge, ipcRenderer, webUtils } from "electron";

type EventHandler = (payload: unknown) => void;

function createDesktopBridge(channelPrefix: "chisacode") {
  const channel = (name: string) => `${channelPrefix}:${name}`;

  return {
    platform: process.platform,
    invoke: (command: string, args?: Record<string, unknown>) =>
      ipcRenderer.invoke(channel("invoke"), command, args),
    getPendingOpenProject: () =>
      ipcRenderer.invoke(channel("get-pending-open-project")) as Promise<string | null>,
    events: {
      on: (event: string, handler: EventHandler): Promise<() => void> => {
        const listener = (_ipcEvent: Electron.IpcRendererEvent, payload: unknown) => {
          handler(payload);
        };
        ipcRenderer.on(channel(`event:${event}`), listener);
        return Promise.resolve(() => {
          ipcRenderer.removeListener(channel(`event:${event}`), listener);
        });
      },
    },
    window: {
      getCurrentWindow: () => ({
        toggleMaximize: () => ipcRenderer.invoke(channel("window:toggleMaximize")),
        isFullscreen: () => ipcRenderer.invoke(channel("window:isFullscreen")),
        updateWindowControls: (update: {
          height?: number;
          backgroundColor?: string;
          foregroundColor?: string;
        }) => ipcRenderer.invoke(channel("window:updateWindowControls"), update),
        onResized: (handler: EventHandler): (() => void) => {
          const listener = (_ipcEvent: Electron.IpcRendererEvent, payload: unknown) => {
            handler(payload);
          };
          ipcRenderer.on(channel("window:resized"), listener);
          return () => {
            ipcRenderer.removeListener(channel("window:resized"), listener);
          };
        },
        setBadgeCount: (count?: number) =>
          ipcRenderer.invoke(channel("window:setBadgeCount"), count),
      }),
    },
    dialog: {
      ask: (message: string, options?: Record<string, unknown>) =>
        ipcRenderer.invoke(channel("dialog:ask"), message, options),
      askWithCheckbox: (message: string, options: Record<string, unknown>) =>
        ipcRenderer.invoke(channel("dialog:askWithCheckbox"), message, options),
      open: (options?: Record<string, unknown>) =>
        ipcRenderer.invoke(channel("dialog:open"), options),
    },
    notification: {
      isSupported: () => ipcRenderer.invoke(channel("notification:isSupported")),
      sendNotification: (payload: {
        title: string;
        body?: string;
        data?: Record<string, unknown>;
      }) => ipcRenderer.invoke(channel("notification:send"), payload),
    },
    opener: {
      openUrl: (url: string) => ipcRenderer.invoke(channel("opener:openUrl"), url),
    },
    webUtils: {
      getPathForFile: (file: File) => webUtils.getPathForFile(file),
    },
    menu: {
      showContextMenu: (input?: Record<string, unknown>) =>
        ipcRenderer.invoke(channel("menu:showContextMenu"), input),
    },
    browser: {
      setWorkspaceActiveBrowser: (browserId: string | null) =>
        ipcRenderer.invoke(channel("browser:set-workspace-active-browser"), browserId),
      openDevTools: (browserId: string) =>
        ipcRenderer.invoke(channel("browser:open-devtools"), browserId),
      clearPartition: (browserId: string) =>
        ipcRenderer.invoke(channel("browser:clear-partition"), browserId),
    },
  };
}

contextBridge.exposeInMainWorld("chisacodeDesktop", createDesktopBridge("chisacode"));
