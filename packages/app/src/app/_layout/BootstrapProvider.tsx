import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { shouldUseDesktopDaemon } from "@/desktop/daemon/desktop-daemon";
import { loadDesktopSettings } from "@/desktop/settings/desktop-settings";
import { useLatchedBoolean } from "@/hooks/use-latched-boolean";
import { getHostRuntimeStore, hasConfiguredLocalDaemonOverride } from "@/runtime/host-runtime";
import { getDaemonStartService } from "@/runtime/daemon-start-service";
import { startDaemonIfGateAllows, startHostRuntimeBootstrap } from "@/utils/host-runtime-bootstrap";

export interface HostRuntimeBootstrapState {
  splashError: string | null;
  retry: () => void;
  hasGivenUpWaitingForHost: boolean;
  storeReady: boolean;
}

const HostRuntimeBootstrapContext = createContext<HostRuntimeBootstrapState>({
  splashError: null,
  retry: () => {},
  hasGivenUpWaitingForHost: false,
  storeReady: false,
});

export function useEarliestOnlineHostServerId(): string | null {
  const store = getHostRuntimeStore();
  const subscribe = useCallback(
    (listener: () => void) => {
      const unsubscribeAll = store.subscribeAll(listener);
      const unsubscribeHostList = store.subscribeHostList(listener);
      return () => {
        unsubscribeAll();
        unsubscribeHostList();
      };
    },
    [store],
  );
  return useSyncExternalStore(
    subscribe,
    () => store.getEarliestOnlineHostServerId(),
    () => store.getEarliestOnlineHostServerId(),
  );
}

function useDaemonStartLastError(): string | null {
  const service = getDaemonStartService({ store: getHostRuntimeStore() });
  return useSyncExternalStore(
    (listener) => service.subscribe(listener),
    () => service.getLastError(),
    () => service.getLastError(),
  );
}

function useDaemonStartIsRunning(): boolean {
  const service = getDaemonStartService({ store: getHostRuntimeStore() });
  return useSyncExternalStore(
    (listener) => service.subscribe(listener),
    () => service.isRunning(),
    () => service.isRunning(),
  );
}

const STARTUP_GIVE_UP_TIMEOUT_MS = 5_000;

async function shouldStartBuiltInDaemon(): Promise<boolean> {
  if (!shouldUseDesktopDaemon()) {
    return false;
  }
  const settings = await loadDesktopSettings();
  return settings.daemon.manageBuiltInDaemon;
}

function HostRuntimeBootstrapProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const store = getHostRuntimeStore();
    const daemonStartService = getDaemonStartService({ store });
    startHostRuntimeBootstrap({
      store,
      daemonStartService,
      shouldStartDaemon: shouldStartBuiltInDaemon,
      onGateError: (message) => daemonStartService.recordError(message),
    });
  }, []);

  const anyOnlineHostServerId = useEarliestOnlineHostServerId();
  const daemonStartError = useDaemonStartLastError();
  const daemonStartIsRunning = useDaemonStartIsRunning();
  const waitForConfiguredLocalDaemon =
    hasConfiguredLocalDaemonOverride() && !shouldUseDesktopDaemon();

  const [hasGivenUpWaitingForHost, setHasGivenUpWaitingForHost] = useState(false);
  useEffect(() => {
    if (
      anyOnlineHostServerId ||
      daemonStartError ||
      daemonStartIsRunning ||
      waitForConfiguredLocalDaemon ||
      hasGivenUpWaitingForHost
    ) {
      return;
    }
    const handle = setTimeout(() => {
      setHasGivenUpWaitingForHost(true);
    }, STARTUP_GIVE_UP_TIMEOUT_MS);
    return () => {
      clearTimeout(handle);
    };
  }, [
    anyOnlineHostServerId,
    daemonStartError,
    daemonStartIsRunning,
    waitForConfiguredLocalDaemon,
    hasGivenUpWaitingForHost,
  ]);

  const retry = useCallback(() => {
    const daemonStartService = getDaemonStartService({ store: getHostRuntimeStore() });
    startDaemonIfGateAllows({
      daemonStartService,
      shouldStartDaemon: shouldStartBuiltInDaemon,
      onGateError: (message) => daemonStartService.recordError(message),
    });
  }, []);

  const splashError = !anyOnlineHostServerId ? daemonStartError : null;
  const isCurrentlyStoreReady =
    Boolean(anyOnlineHostServerId) || Boolean(splashError) || hasGivenUpWaitingForHost;
  const storeReady = useLatchedBoolean(isCurrentlyStoreReady);

  const state = useMemo<HostRuntimeBootstrapState>(
    () => ({ splashError, retry, hasGivenUpWaitingForHost, storeReady }),
    [splashError, retry, hasGivenUpWaitingForHost, storeReady],
  );

  return (
    <HostRuntimeBootstrapContext.Provider value={state}>
      {children}
    </HostRuntimeBootstrapContext.Provider>
  );
}

export { HostRuntimeBootstrapProvider };

export function useStoreReady(): boolean {
  return useContext(HostRuntimeBootstrapContext).storeReady;
}

export function useHostRuntimeBootstrapState(): HostRuntimeBootstrapState {
  return useContext(HostRuntimeBootstrapContext);
}
