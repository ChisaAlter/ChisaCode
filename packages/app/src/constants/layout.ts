import { useUnistyles } from "react-native-unistyles";
import { isWeb } from "@/constants/platform";

export const FOOTER_HEIGHT = 75;

// Shared header inner height (excluding safe area insets and border)
// Used by both agent header (ScreenHeader) and explorer sidebar header
// This ensures both headers have the same visual height
export const HEADER_INNER_HEIGHT = 48;
export const HEADER_INNER_HEIGHT_MOBILE = 56;
export const WORKSPACE_SECONDARY_HEADER_HEIGHT = 56;
export const HEADER_TOP_PADDING_MOBILE = 8;

// Max width for chat content (stream view, input area, new agent form)
export const MAX_CONTENT_WIDTH = 1008;

// Minimum width for the main chat/agent area when sidebar is open.
// Both left-sidebar and explorer-sidebar reference this independently.
export const MIN_CHAT_WIDTH = 400;

// Horizontal gap between desktop sidebar and the center column.
// Applied as marginRight on the sidebar when open.
export const DESKTOP_SIDEBAR_GAP = 12;

// Width of the tab dropdown menu (new tab "+" button overflow menu)
export const TAB_DROPDOWN_WIDTH = 220;

// Desktop sidebar footer dimensions
export const SIDEBAR_FOOTER_HEIGHT = 54;
export const SIDEBAR_FOOTER_PADDING_LEFT = 18;

// Composer horizontal padding (left/right of the input area)
export const COMPOSER_HORIZONTAL_PADDING = 14;

// Desktop app constants for macOS traffic light buttons
// These buttons (close/minimize/maximize) overlay the top-left corner
export const DESKTOP_TRAFFIC_LIGHT_WIDTH = 78;
export const DESKTOP_TRAFFIC_LIGHT_HEIGHT = 45;

// Windows/Linux window controls (minimize/maximize/close) — top-right
export const DESKTOP_WINDOW_CONTROLS_WIDTH = 140;
export const DESKTOP_WINDOW_CONTROLS_HEIGHT = 29;

export {
  getIsElectron as getIsElectronRuntime,
  getIsElectronMac as getIsElectronRuntimeMac,
} from "./platform";

/**
 * Reactive hook — re-renders the component when the breakpoint changes.
 * Always use this instead of reading UnistylesRuntime.breakpoint directly.
 */
export function useIsCompactFormFactor(): boolean {
  const { rt } = useUnistyles();
  return rt.breakpoint === "xs" || rt.breakpoint === "sm";
}

// SplitContainer relies on dnd-kit and DOM-backed accessibility helpers.
// Keep that capability distinct from desktop-width layout so touch tablets
// can use the desktop shell without entering web-only code paths.
export function supportsDesktopPaneSplits(): boolean {
  return isWeb;
}
