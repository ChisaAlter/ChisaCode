import type { RefObject } from "react";
import type { View } from "react-native";

export interface AssistantSelectionToolbarProps {
  containerRef: RefObject<View | null>;
}

/**
 * Native stub — selection toolbars are a web/Electron feature; native keeps the
 * platform text-selection menu. Metro picks `assistant-selection-toolbar.web.tsx`
 * on web instead.
 */
export function AssistantSelectionToolbar(_props: AssistantSelectionToolbarProps) {
  return null;
}
