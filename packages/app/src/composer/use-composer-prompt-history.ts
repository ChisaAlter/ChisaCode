import { useCallback, useEffect, useMemo, useRef } from "react";
import { useSessionStore } from "@/stores/session-store";
import type { StreamItem, UserMessageItem } from "@/types/stream";
import {
  type PromptHistoryDirection,
  buildComposerPromptHistory,
  stepComposerPromptHistory,
} from "@/composer/input/composer-prompt-history";

const EMPTY_STREAM_ITEMS: readonly StreamItem[] = [];

export interface UseComposerPromptHistoryInput {
  serverId: string;
  agentId: string;
  currentText: string;
  setText: (text: string) => void;
}

/**
 * Recalls previously sent prompts with ArrowUp/ArrowDown (web/Electron only).
 * History is derived from the session store's canonical tail plus live head
 * user messages; it only rebuilds when those arrays change, never per delta.
 * Editing the recalled text ends browsing (T3 shell semantics).
 * @param input Session identifiers plus the controlled draft text and setter
 * @returns An `onPromptHistoryStep` callback returning true when applied
 */
export function useComposerPromptHistory(input: UseComposerPromptHistoryInput): {
  onPromptHistoryStep: (direction: PromptHistoryDirection) => boolean;
} {
  const { serverId, agentId, currentText, setText } = input;
  const tail = useSessionStore((state) => state.sessions[serverId]?.agentStreamTail?.get(agentId));
  const head = useSessionStore((state) => state.sessions[serverId]?.agentStreamHead?.get(agentId));

  const entries = useMemo(() => {
    const messages: UserMessageItem[] = [];
    for (const item of tail ?? EMPTY_STREAM_ITEMS) {
      if (item.kind === "user_message") messages.push(item);
    }
    for (const item of head ?? EMPTY_STREAM_ITEMS) {
      if (item.kind === "user_message") messages.push(item);
    }
    return buildComposerPromptHistory(messages);
  }, [tail, head]);

  const positionRef = useRef<number | null>(null);
  const recalledTextRef = useRef<string | null>(null);

  // Editing ends browsing: any text change that is not the in-flight recall.
  useEffect(() => {
    if (positionRef.current === null) return;
    if (currentText !== recalledTextRef.current) {
      positionRef.current = null;
      recalledTextRef.current = null;
    }
  }, [currentText]);

  const onPromptHistoryStep = useCallback(
    (direction: PromptHistoryDirection): boolean => {
      const step = stepComposerPromptHistory({
        entries,
        direction,
        position: positionRef.current,
      });
      if (!step) return false;
      positionRef.current = step.position;
      recalledTextRef.current = step.text;
      setText(step.text);
      return true;
    },
    [entries, setText],
  );

  return { onPromptHistoryStep };
}
