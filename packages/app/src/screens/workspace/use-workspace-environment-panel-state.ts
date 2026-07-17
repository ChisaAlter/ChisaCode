import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { LayoutChangeEvent } from "react-native";

import { MIN_CHAT_WIDTH, WORKBENCH_ENVIRONMENT_PANEL_INSET } from "@/constants/layout";
import type { ExplorerCheckoutContext } from "@/stores/explorer-checkout-context";
import type { WorkspaceEnvironmentDockState } from "@/screens/workspace/workspace-environment-dock-model";

const ENVIRONMENT_PANEL_HORIZONTAL_INSETS = WORKBENCH_ENVIRONMENT_PANEL_INSET * 2;

type WorkspaceEnvironmentPanelMode = "auto" | "forced-open" | "forced-closed";
type ExplorerPanelAction = (input: {
  isCompact: boolean;
  checkout: ExplorerCheckoutContext;
}) => void;
type SetExplorerTabForCheckout = (
  input: ExplorerCheckoutContext & { tab: "changes" | "files" },
) => void;

interface UseWorkspaceEnvironmentPanelStateInput {
  panelWidth: number;
  isMobile: boolean;
  isExplorerOpen: boolean;
  activeExplorerCheckout: ExplorerCheckoutContext | null;
  closeDesktopFileExplorer: () => void;
  openFileExplorerForCheckout: ExplorerPanelAction;
  toggleFileExplorerForCheckout: ExplorerPanelAction;
  setExplorerTabForCheckout: SetExplorerTabForCheckout;
}

interface UseWorkspaceEnvironmentPanelStateResult {
  environmentDockState: WorkspaceEnvironmentDockState;
  setEnvironmentDockState: Dispatch<SetStateAction<WorkspaceEnvironmentDockState>>;
  setEnvironmentPanelMode: Dispatch<SetStateAction<WorkspaceEnvironmentPanelMode>>;
  isEnvironmentPanelVisible: boolean;
  handleCenterContentLayout: (event: LayoutChangeEvent) => void;
  handleToggleEnvironmentPanel: () => void;
  handleOpenEnvironmentChanges: () => void;
}

function getEnvironmentExplorerTab(checkout: ExplorerCheckoutContext): "changes" | "files" {
  return checkout.isGit ? "changes" : "files";
}

/** Returns whether the floating inspector leaves enough usable chat width. */
export function shouldAutoShowEnvironmentPanel(contentWidth: number, panelWidth: number): boolean {
  return contentWidth - panelWidth - ENVIRONMENT_PANEL_HORIZONTAL_INSETS >= MIN_CHAT_WIDTH;
}

/** Owns responsive environment-panel visibility, dock state, and explorer transitions. */
export function useWorkspaceEnvironmentPanelState(
  input: UseWorkspaceEnvironmentPanelStateInput,
): UseWorkspaceEnvironmentPanelStateResult {
  const {
    panelWidth,
    isMobile,
    isExplorerOpen,
    activeExplorerCheckout,
    closeDesktopFileExplorer,
    openFileExplorerForCheckout,
    toggleFileExplorerForCheckout,
    setExplorerTabForCheckout,
  } = input;
  const [environmentPanelMode, setEnvironmentPanelMode] =
    useState<WorkspaceEnvironmentPanelMode>("auto");
  const [centerContentSize, setCenterContentSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [environmentDockState, setEnvironmentDockState] = useState<WorkspaceEnvironmentDockState>({
    open: true,
    activeTab: "git-summary",
  });

  const hasEnoughSpaceForEnvironmentPanel = useMemo(() => {
    if (!centerContentSize) {
      return true;
    }
    return shouldAutoShowEnvironmentPanel(centerContentSize.width, panelWidth);
  }, [centerContentSize, panelWidth]);
  const previousHasEnoughSpaceRef = useRef(hasEnoughSpaceForEnvironmentPanel);
  const isEnvironmentPanelVisible =
    environmentPanelMode === "forced-open" ||
    (environmentPanelMode === "auto" && hasEnoughSpaceForEnvironmentPanel);

  useEffect(() => {
    const wasEnough = previousHasEnoughSpaceRef.current;
    previousHasEnoughSpaceRef.current = hasEnoughSpaceForEnvironmentPanel;
    if (
      !wasEnough &&
      hasEnoughSpaceForEnvironmentPanel &&
      environmentPanelMode === "forced-closed"
    ) {
      setEnvironmentPanelMode("auto");
    }
  }, [environmentPanelMode, hasEnoughSpaceForEnvironmentPanel]);

  useEffect(() => {
    if (!isMobile && isEnvironmentPanelVisible && isExplorerOpen) {
      closeDesktopFileExplorer();
    }
  }, [closeDesktopFileExplorer, isEnvironmentPanelVisible, isExplorerOpen, isMobile]);

  const handleCenterContentLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setCenterContentSize((current) =>
      current?.width === width && current.height === height ? current : { width, height },
    );
  }, []);

  const handleToggleEnvironmentPanel = useCallback(() => {
    if (!isEnvironmentPanelVisible) {
      setEnvironmentDockState((state) => ({ ...state, open: true }));
    }
    setEnvironmentPanelMode(isEnvironmentPanelVisible ? "forced-closed" : "forced-open");
    if (!isEnvironmentPanelVisible && isExplorerOpen && activeExplorerCheckout) {
      if (isMobile) {
        toggleFileExplorerForCheckout({
          isCompact: true,
          checkout: activeExplorerCheckout,
        });
      } else {
        closeDesktopFileExplorer();
      }
    }
  }, [
    activeExplorerCheckout,
    closeDesktopFileExplorer,
    isEnvironmentPanelVisible,
    isExplorerOpen,
    isMobile,
    toggleFileExplorerForCheckout,
  ]);

  const handleOpenEnvironmentChanges = useCallback(() => {
    if (!activeExplorerCheckout) {
      return;
    }
    setExplorerTabForCheckout({
      ...activeExplorerCheckout,
      tab: getEnvironmentExplorerTab(activeExplorerCheckout),
    });
    openFileExplorerForCheckout({
      isCompact: isMobile,
      checkout: activeExplorerCheckout,
    });
    setEnvironmentPanelMode("forced-closed");
  }, [activeExplorerCheckout, isMobile, openFileExplorerForCheckout, setExplorerTabForCheckout]);

  return {
    environmentDockState,
    setEnvironmentDockState,
    setEnvironmentPanelMode,
    isEnvironmentPanelVisible,
    handleCenterContentLayout,
    handleToggleEnvironmentPanel,
    handleOpenEnvironmentChanges,
  };
}
