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
 * Multi-signal short circuits (permission / agent error / idle after send)
 * release busy even when the optimistic id drifts (real providers that do not
 * echo the client messageId).
 */
export function useComposerSendProjectionAck(input: { serverId: string; agentId: string | null }): {
  /** The optimistic message id currently awaiting server adoption, or null */
  pendingSendMessageId: string | null;
  /** True while the server has adopted the pending optimistic message */
  isServerAdopted: boolean;
  /**
   * Records the optimistic message id as the one to await.
   * Call it from the dispatch-time optimistic callback; pass null to clear
   * (e.g. on send error).
   */
  trackPendingSend: (messageId: string | null) => void;
} {
  const [pendingSendMessageId, setPendingSendMessageId] = useState<string | null>(null);

  const projectionInputs = useSessionStore(
    useShallow((state) => {
      if (!input.agentId) {
        return {
          tail: EMPTY_STREAM_ITEMS,
          head: EMPTY_STREAM_ITEMS,
          hasPendingPermission: false,
          agentErrored: false,
        };
      }
      const session = state.sessions[input.serverId];
      const agent = session?.agents?.get(input.agentId);
      const pendingPermissions = session?.pendingPermissions;
      let hasPendingPermission = false;
      if (pendingPermissions) {
        for (const permission of pendingPermissions.values()) {
          if (permission.agentId === input.agentId) {
            hasPendingPermission = true;
            break;
          }
        }
      }
      const agentStatus = agent?.status ?? null;
      return {
        tail: session?.agentStreamTail?.get(input.agentId) ?? EMPTY_STREAM_ITEMS,
        head: session?.agentStreamHead?.get(input.agentId) ?? EMPTY_STREAM_ITEMS,
        hasPendingPermission,
        agentErrored: agentStatus === "error",
      };
    }),
  );

  const isServerAdopted = useMemo(
    () =>
      hasServerAdoptedOptimisticUserMessage({
        optimisticMessageId: pendingSendMessageId,
        tail: projectionInputs.tail,
        head: projectionInputs.head,
        shortCircuit: {
          hasPendingPermission: projectionInputs.hasPendingPermission,
          agentErrored: projectionInputs.agentErrored,
        },
      }),
    [pendingSendMessageId, projectionInputs],
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
