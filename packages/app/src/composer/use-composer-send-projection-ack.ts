import { useCallback, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useSessionStore } from "@/stores/session-store";
import { hasServerAdoptedOptimisticUserMessage } from "@/timeline/session-stream-reducers";
import type { StreamItem } from "@/types/stream";

const EMPTY_STREAM_ITEMS: readonly StreamItem[] = [];

/**
 * Composer send-busy state driven by server projection instead of the submit
 * promise.
 *
 * When the user hits send, an optimistic user message is written to the agent
 * stream immediately. The daemon later projects the same message id into the
 * timeline without the `optimistic` marker. The composer should stay busy
 * until that projection is visible, so double-sends are blocked while the
 * message is genuinely in flight — but it must not stay busy until the whole
 * turn settles (a long run would lock the composer for minutes).
 *
 * `trackPendingSend` captures the latest optimistic user message id present in
 * the stream at send time; `isServerAdopted` flips once that id appears
 * without the optimistic marker. Callers combine it with their own submit
 * promise state (e.g. `isProcessing && !isServerAdopted`).
 */
export function useComposerSendProjectionAck(input: { serverId: string; agentId: string | null }): {
  /** The optimistic message id currently awaiting server adoption, or null */
  pendingSendMessageId: string | null;
  /** True while the server has adopted the pending optimistic message */
  isServerAdopted: boolean;
  /**
   * Records the latest optimistic user message id as the one to await.
   * Call it right after dispatching the send; pass null to clear
   * (e.g. on send error).
   */
  trackPendingSend: (messageId: string | null) => void;
} {
  const [pendingSendMessageId, setPendingSendMessageId] = useState<string | null>(null);

  const streamItems = useSessionStore(
    useShallow((state) => {
      if (!input.agentId) {
        return { tail: EMPTY_STREAM_ITEMS, head: EMPTY_STREAM_ITEMS };
      }
      const session = state.sessions[input.serverId];
      return {
        tail: session?.agentStreamTail?.get(input.agentId) ?? EMPTY_STREAM_ITEMS,
        head: session?.agentStreamHead?.get(input.agentId) ?? EMPTY_STREAM_ITEMS,
      };
    }),
  );

  const isServerAdopted = useMemo(
    () =>
      hasServerAdoptedOptimisticUserMessage({
        optimisticMessageId: pendingSendMessageId,
        tail: streamItems.tail,
        head: streamItems.head,
      }),
    [pendingSendMessageId, streamItems.head, streamItems.tail],
  );

  const trackPendingSend = useCallback((messageId: string | null) => {
    setPendingSendMessageId(messageId);
  }, []);

  return {
    pendingSendMessageId,
    isServerAdopted,
    trackPendingSend,
  };
}
