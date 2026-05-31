import { useCallback } from "react";
import { pickDirectory } from "@/desktop/pick-directory";
import { useKeyboardShortcutsStore } from "@/stores/keyboard-shortcuts-store";
import { useIsLocalDaemon } from "./use-is-local-daemon";
import { useOpenProject } from "./use-open-project";

export function useOpenProjectPicker(serverId: string | null): () => Promise<void> {
  const normalizedServerId = serverId?.trim() ?? "";
  const isLocalDaemon = useIsLocalDaemon(normalizedServerId);
  const setProjectPickerOpen = useKeyboardShortcutsStore((state) => state.setProjectPickerOpen);
  const openProject = useOpenProject(serverId);

  return useCallback(async () => {
    if (!normalizedServerId) {
      return;
    }

    if (!isLocalDaemon) {
      setProjectPickerOpen(true);
      return;
    }

    const path = await pickDirectory();
    if (path === null) {
      return;
    }

    await openProject(path);
  }, [isLocalDaemon, normalizedServerId, openProject, setProjectPickerOpen]);
}
