import type {
  DesktopAppUpdateCheckResult,
  DesktopAppUpdateInstallResult,
  DesktopReleaseChannel,
} from "@/desktop/updates/desktop-updates";

export type DesktopAppUpdateStatus =
  | "idle"
  | "checking"
  | "pending"
  | "up-to-date"
  | "available"
  | "installing"
  | "installed"
  | "error";

export const PENDING_RECHECK_MS = 10_000;

export interface DesktopAppUpdaterSnapshot {
  status: DesktopAppUpdateStatus;
  availableUpdate: DesktopAppUpdateCheckResult | null;
  errorMessage: string | null;
  installMessage: string | null;
  lastCheckedAt: number | null;
  isChecking: boolean;
  isInstalling: boolean;
}

export interface DesktopAppUpdaterPort {
  checkDesktopAppUpdate(input: {
    releaseChannel: DesktopReleaseChannel;
  }): Promise<DesktopAppUpdateCheckResult>;
  installDesktopAppUpdate(input: {
    releaseChannel: DesktopReleaseChannel;
  }): Promise<DesktopAppUpdateInstallResult>;
}

export interface DesktopAppUpdaterErrorReport {
  error: unknown;
  message: string;
  logLabel: string;
}

export interface DesktopAppUpdaterDeps {
  port: DesktopAppUpdaterPort;
  now(): number;
  reportInstallError?(report: DesktopAppUpdaterErrorReport): void;
}

export interface DesktopAppUpdater {
  getSnapshot(): DesktopAppUpdaterSnapshot;
  subscribe(listener: () => void): () => void;
  checkForUpdates(options?: {
    releaseChannel: DesktopReleaseChannel;
    silent?: boolean;
  }): Promise<DesktopAppUpdateCheckResult | null>;
  installUpdate(options: {
    releaseChannel: DesktopReleaseChannel;
  }): Promise<DesktopAppUpdateInstallResult | null>;
}

interface InternalState {
  status: DesktopAppUpdateStatus;
  availableUpdate: DesktopAppUpdateCheckResult | null;
  errorMessage: string | null;
  installMessage: string | null;
  lastCheckedAt: number | null;
  isInstalling: boolean;
  requestVersion: number;
}

const INITIAL_STATE: InternalState = {
  status: "idle",
  availableUpdate: null,
  errorMessage: null,
  installMessage: null,
  lastCheckedAt: null,
  isInstalling: false,
  requestVersion: 0,
};

function buildSnapshot(state: InternalState): DesktopAppUpdaterSnapshot {
  return {
    status: state.status,
    availableUpdate: state.availableUpdate,
    errorMessage: state.errorMessage,
    installMessage: state.installMessage,
    lastCheckedAt: state.lastCheckedAt,
    isChecking: state.status === "checking",
    isInstalling: state.status === "installing" || state.isInstalling,
  };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && typeof error.message === "string") {
    return error.message;
  }
  return String(error);
}

export function formatStatusText(input: {
  status: DesktopAppUpdateStatus;
  availableUpdate: DesktopAppUpdateCheckResult | null;
  installMessage: string | null;
  formatVersion: (version: string | null | undefined) => string;
}): string {
  const { status, availableUpdate, installMessage, formatVersion } = input;

  if (status === "checking") {
    return "正在检查应用更新...";
  }

  if (status === "installing") {
    return "正在安装应用更新...";
  }

  if (status === "up-to-date") {
    return "应用已是最新版本。";
  }

  if (status === "pending") {
    return "更新准备好后会通知你。";
  }

  if (status === "available") {
    if (availableUpdate?.latestVersion) {
      return `更新已就绪：${formatVersion(availableUpdate.latestVersion)}`;
    }
    return "应用更新已可安装。";
  }

  if (status === "installed") {
    return installMessage ?? "应用更新已安装，需要重启。";
  }

  if (status === "error") {
    return "应用更新失败。";
  }

  return "尚未检查更新状态。";
}

export function createDesktopAppUpdater(deps: DesktopAppUpdaterDeps): DesktopAppUpdater {
  let state: InternalState = { ...INITIAL_STATE };
  let cachedSnapshot: DesktopAppUpdaterSnapshot = buildSnapshot(state);
  const listeners = new Set<() => void>();

  function commit(next: InternalState): void {
    state = next;
    cachedSnapshot = buildSnapshot(state);
    for (const listener of listeners) {
      listener();
    }
  }

  async function checkForUpdates(options?: {
    releaseChannel: DesktopReleaseChannel;
    silent?: boolean;
  }): Promise<DesktopAppUpdateCheckResult | null> {
    if (!options) {
      return null;
    }
    const { releaseChannel, silent = false } = options;
    const requestVersion = state.requestVersion + 1;

    commit({
      ...state,
      requestVersion,
      status: silent ? state.status : "checking",
      errorMessage: null,
    });

    try {
      const result = await deps.port.checkDesktopAppUpdate({ releaseChannel });
      if (requestVersion !== state.requestVersion) {
        return result;
      }

      const nextLastCheckedAt = deps.now();
      let nextStatus: DesktopAppUpdateStatus;
      let nextAvailable: DesktopAppUpdateCheckResult | null;

      if (result.readyToInstall) {
        nextStatus = "available";
        nextAvailable = result;
      } else if (result.hasUpdate) {
        nextStatus = "pending";
        nextAvailable = null;
      } else {
        nextStatus = "up-to-date";
        nextAvailable = null;
      }

      commit({
        ...state,
        status: nextStatus,
        availableUpdate: nextAvailable,
        installMessage: null,
        lastCheckedAt: nextLastCheckedAt,
      });

      return result;
    } catch (error) {
      if (requestVersion !== state.requestVersion) {
        return null;
      }

      const message = getErrorMessage(error);
      if (silent) {
        console.warn("[DesktopUpdater] Silent update check failed", message);
        commit({ ...state });
      } else {
        commit({
          ...state,
          status: "error",
          errorMessage: message,
        });
      }
      return null;
    }
  }

  async function installUpdate(options: {
    releaseChannel: DesktopReleaseChannel;
  }): Promise<DesktopAppUpdateInstallResult | null> {
    commit({
      ...state,
      status: "installing",
      errorMessage: null,
      isInstalling: true,
    });

    try {
      const result = await deps.port.installDesktopAppUpdate({
        releaseChannel: options.releaseChannel,
      });
      const nextLastCheckedAt = deps.now();
      commit({
        ...state,
        status: result.installed ? "installed" : "up-to-date",
        availableUpdate: null,
        installMessage: result.message,
        lastCheckedAt: nextLastCheckedAt,
        isInstalling: false,
      });
      return result;
    } catch (error) {
      const message = getErrorMessage(error);
      deps.reportInstallError?.({
        error,
        message: "无法安装桌面应用更新。",
        logLabel: "[DesktopUpdater] Failed to install app update",
      });
      commit({
        ...state,
        status: "error",
        errorMessage: message,
        isInstalling: false,
      });
      return null;
    }
  }

  return {
    getSnapshot: () => cachedSnapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    checkForUpdates,
    installUpdate,
  };
}
