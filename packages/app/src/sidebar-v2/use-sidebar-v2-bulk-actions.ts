import { useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/contexts/toast-context";
import { confirmDialog } from "@/utils/confirm-dialog";
import { canSnoozeAllSelected } from "./SidebarV2BulkMenu";
import { resolveSelectedThreads } from "./actions";
import { canSnooze, type SnoozePreset } from "./snooze";
import { sidebarV2ThreadKey } from "./store";
import type { SidebarV2Thread } from "./agent-adapter";

interface UseSidebarV2BulkActionsInput {
  selectedThreadKeys: readonly string[];
  threadByKey: ReadonlyMap<string, SidebarV2Thread>;
  snoozeNow: string;
  clearSelection: () => void;
  handleSettle: (thread: SidebarV2Thread, opts?: { coParkingKeys?: ReadonlySet<string> }) => void;
  handleSnooze: (
    thread: SidebarV2Thread,
    untilIso: string,
    opts?: {
      coParkingKeys?: ReadonlySet<string>;
      skipUndoToast?: boolean;
      whenLabel?: string;
    },
  ) => void;
  handleMarkUnread: (thread: SidebarV2Thread) => void;
  handleRegenerateTitle: (thread: SidebarV2Thread) => void;
  handleDelete: (thread: SidebarV2Thread, opts?: { skipConfirm?: boolean }) => void;
}

/**
 * Bulk multi-select actions for SidebarV2, matching T3's multi-select menu.
 * Callbacks read the latest input through a ref so their identity stays
 * stable across renders — a prerequisite for the memoized sidebar rows.
 */
export function useSidebarV2BulkActions(input: UseSidebarV2BulkActionsInput) {
  const { t } = useTranslation();
  const toast = useToast();

  const inputRef = useRef(input);
  inputRef.current = input;

  const handleBulkSettle = useCallback(() => {
    const current = inputRef.current;
    const selected = resolveSelectedThreads(current.selectedThreadKeys, current.threadByKey);
    const coParkingKeys = new Set(
      selected.map((thread) => sidebarV2ThreadKey(thread.serverId, thread.id)),
    );
    for (const thread of selected) {
      if (thread.settledOverride === "settled") {
        continue;
      }
      current.handleSettle(thread, { coParkingKeys });
    }
    current.clearSelection();
  }, []);

  const handleBulkSnooze = useCallback(
    (preset: SnoozePreset) => {
      const current = inputRef.current;
      const selected = resolveSelectedThreads(current.selectedThreadKeys, current.threadByKey);
      const coParkingKeys = new Set(
        selected.map((thread) => sidebarV2ThreadKey(thread.serverId, thread.id)),
      );
      for (const thread of selected) {
        current.handleSnooze(thread, preset.snoozedUntil, {
          coParkingKeys,
          skipUndoToast: true,
          whenLabel: preset.whenLabel,
        });
      }
      toast.show(t("sidebarV2.snoozedUntil", { when: preset.whenLabel }), {
        variant: "success",
        durationMs: 5_000,
      });
      current.clearSelection();
    },
    [t, toast],
  );

  const handleBulkMarkUnread = useCallback(() => {
    const current = inputRef.current;
    const selected = resolveSelectedThreads(current.selectedThreadKeys, current.threadByKey);
    for (const thread of selected) {
      current.handleMarkUnread(thread);
    }
    current.clearSelection();
  }, []);

  const handleBulkRegenerateTitle = useCallback(() => {
    const current = inputRef.current;
    const selected = resolveSelectedThreads(current.selectedThreadKeys, current.threadByKey);
    for (const thread of selected) {
      current.handleRegenerateTitle(thread);
    }
    current.clearSelection();
  }, []);

  const handleBulkDelete = useCallback(() => {
    const current = inputRef.current;
    const selected = resolveSelectedThreads(current.selectedThreadKeys, current.threadByKey);
    if (selected.length === 0) {
      return;
    }
    void (async () => {
      const confirmed = await confirmDialog({
        title: t("sidebarV2.bulkDeleteTitle", { count: selected.length }),
        message: t("sidebarV2.bulkDeleteMessage"),
        confirmLabel: t("sidebar.deleteSession"),
        cancelLabel: t("common.cancel"),
        destructive: true,
      });
      if (!confirmed) {
        return;
      }
      const live = inputRef.current;
      for (const thread of selected) {
        live.handleDelete(thread, { skipConfirm: true });
      }
      live.clearSelection();
    })();
  }, [t]);

  const computedCapabilities = useMemo(() => {
    const selected = resolveSelectedThreads(input.selectedThreadKeys, input.threadByKey);
    return {
      canSnoozeAll: canSnoozeAllSelected(selected, input.snoozeNow, canSnooze),
      canRegenerateTitle: selected.length > 0,
    };
  }, [input.selectedThreadKeys, input.snoozeNow, input.threadByKey]);

  // Keep the capabilities object identity stable while its values are
  // unchanged so it does not defeat row memoization on unrelated updates.
  const capabilitiesRef = useRef(computedCapabilities);
  if (
    capabilitiesRef.current.canSnoozeAll !== computedCapabilities.canSnoozeAll ||
    capabilitiesRef.current.canRegenerateTitle !== computedCapabilities.canRegenerateTitle
  ) {
    capabilitiesRef.current = computedCapabilities;
  }
  const bulkMenuCapabilities = capabilitiesRef.current;

  const bulkMenuCallbacks = useMemo(
    () => ({
      onSettleSelected: handleBulkSettle,
      onSnoozeSelected: handleBulkSnooze,
      onMarkUnreadSelected: handleBulkMarkUnread,
      onRegenerateTitleSelected: handleBulkRegenerateTitle,
      onDeleteSelected: handleBulkDelete,
    }),
    [
      handleBulkDelete,
      handleBulkMarkUnread,
      handleBulkRegenerateTitle,
      handleBulkSettle,
      handleBulkSnooze,
    ],
  );

  return { bulkMenuCapabilities, bulkMenuCallbacks };
}
