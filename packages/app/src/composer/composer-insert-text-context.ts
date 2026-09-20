import { createContext } from "react";

export type ComposerInsertText = (text: string) => void;

/**
 * Lets far-away renderers (e.g. the assistant-message selection toolbar) append
 * text into the composer draft without prop drilling through the stream tree.
 * Provided by the panel that owns `agentInputDraft.setText`.
 */
export const ComposerInsertTextContext = createContext<ComposerInsertText | null>(null);
