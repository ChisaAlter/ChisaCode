import type { UserMessageItem } from "@/types/stream";

/**
 * A recallable prompt previously sent by the user.
 */
export interface PromptHistoryEntry {
  id: string;
  text: string;
  createdAt: number;
}

export type PromptHistoryDirection = "back" | "forward";

export interface PromptHistoryStepInput {
  entries: readonly PromptHistoryEntry[];
  direction: PromptHistoryDirection;
  /** History browsing position; null when not browsing. 0 = newest entry. */
  position: number | null;
}

export interface PromptHistoryStepResult {
  text: string;
  position: number | null;
}

/**
 * Builds the newest-first prompt history from chronologically ordered user
 * messages. Consecutive duplicates collapse into the newest entry and
 * whitespace-only prompts are skipped. ChisaCode has no inline send-time token
 * chips (unlike T3's Lexical model), so user message text is the raw typed
 * prompt — only trimming and deduplication are needed.
 * @param messages Chronologically ordered user messages (oldest first)
 * @returns History entries ordered newest first
 */
export function buildComposerPromptHistory(
  messages: readonly UserMessageItem[],
): PromptHistoryEntry[] {
  const entries: PromptHistoryEntry[] = [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message) continue;
    const text = message.text.trim();
    if (text.length === 0) continue;
    if (entries[entries.length - 1]?.text === text) continue;
    entries.push({ id: message.id, text, createdAt: message.timestamp.getTime() });
  }
  return entries;
}

/**
 * Steps through prompt history with shell semantics (T3-faithful).
 * back: starts at the newest entry and walks older; saturates at the oldest
 * (returns null). forward: walks toward newer entries; stepping past the
 * newest clears the composer and exits browsing — T3 does not preserve the
 * pre-browse draft. A stale position beyond the current entries is clamped.
 * @param input Entries, direction, and current browsing position
 * @returns The next composer text and position, or null when the step is a no-op
 */
export function stepComposerPromptHistory(
  input: PromptHistoryStepInput,
): PromptHistoryStepResult | null {
  const { entries, direction } = input;
  if (entries.length === 0) return null;
  const position = input.position === null ? null : Math.min(input.position, entries.length - 1);

  if (direction === "back") {
    if (position === null) {
      const newest = entries[0];
      if (!newest) return null;
      return { text: newest.text, position: 0 };
    }
    if (position >= entries.length - 1) return null;
    const older = entries[position + 1];
    if (!older) return null;
    return { text: older.text, position: position + 1 };
  }

  if (position === null) return null;
  if (position === 0) return { text: "", position: null };
  const newer = entries[position - 1];
  if (!newer) return null;
  return { text: newer.text, position: position - 1 };
}

/**
 * True when the caret sits on the first visual line of the composer, so
 * ArrowUp may recall history instead of moving within the text.
 * @param value Composer text
 * @param selectionStart Caret offset
 */
export function isCursorOnFirstLine(value: string, selectionStart: number): boolean {
  return !value.slice(0, selectionStart).includes("\n");
}

/**
 * True when the caret sits on the last visual line of the composer, so
 * ArrowDown may step forward through history.
 * @param value Composer text
 * @param selectionEnd Caret end offset
 */
export function isCursorOnLastLine(value: string, selectionEnd: number): boolean {
  return !value.slice(selectionEnd).includes("\n");
}
