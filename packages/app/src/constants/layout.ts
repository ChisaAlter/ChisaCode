import { Dimensions } from "react-native";
import { useUnistyles } from "react-native-unistyles";
import { isAndroid, isWeb } from "@/constants/platform";

export const FOOTER_HEIGHT = 60;

// Shared header inner height (excluding safe area insets and border)
// Used by both agent header (ScreenHeader) and explorer sidebar header
// This ensures both headers have the same visual height
export const HEADER_INNER_HEIGHT = 42;
export const HEADER_INNER_HEIGHT_MOBILE = 48;
export const WORKSPACE_SECONDARY_HEADER_HEIGHT = 38;
export const HEADER_TOP_PADDING_MOBILE = 4;

// Dense workbench dimensions shared by the real Electron layout.
export const WORKBENCH_ENVIRONMENT_PANEL_WIDTH = 240;
export const WORKBENCH_ENVIRONMENT_PANEL_INSET = 8;
export const WORKBENCH_SIDEBAR_WIDTH = 200;
export const WORKBENCH_BODY_FONT_SIZE = 13;
export const WORKBENCH_BODY_LINE_HEIGHT = 18;
export const WORKBENCH_META_FONT_SIZE = 12;
export const WORKBENCH_META_LINE_HEIGHT = 16;
export const WORKBENCH_MICRO_FONT_SIZE = 11;
export const WORKBENCH_MICRO_LINE_HEIGHT = 14;
export const MIN_INTERACTIVE_TARGET_SIZE = 28;
export const WORKBENCH_NEW_CHAT_RADIUS = 8;
export const WORKBENCH_SIDEBAR_GROUP_LINE_HEIGHT = 16;
export const WORKBENCH_TAB_MIN_WIDTH = 160;
export const WORKBENCH_TAB_MAX_WIDTH = 220;
export const WORKBENCH_TAB_ESTIMATED_CHAR_WIDTH = 35 / 3;
export const WORKBENCH_FRAME_HAIRLINE_OFFSET = 2 / 3;
export const WORKBENCH_COMPOSER_HEIGHT = 133;
export const WORKBENCH_COMPOSER_HINT_FONT_SIZE = 11;
export const WORKBENCH_COMPOSER_CONTEXT_ROW_HEIGHT = 28;
export const WORKBENCH_COMPOSER_TEXTAREA_HEIGHT = 28;
export const WORKBENCH_COMPOSER_INPUT_GAP = 6;
export const WORKBENCH_COMPOSER_INPUT_PADDING_VERTICAL = 8;
export const WORKBENCH_COMPOSER_CONTROL_HEIGHT = 28;
export const WORKBENCH_HEADER_HORIZONTAL_PADDING = 14;
export const WORKBENCH_TAB_GAP = 5;
export const WORKBENCH_ENVIRONMENT_TAB_HEIGHT = 28;
export const WORKBENCH_ENVIRONMENT_TAB_RADIUS = 8;
export const WORKBENCH_ENVIRONMENT_DIFF_SUMMARY_HEIGHT = 72;
export const WORKBENCH_ENVIRONMENT_CALLOUT_HEIGHT = 57 + 1 / 3;
export const WORKBENCH_ENVIRONMENT_SECTION_GAP = 8;
export const WORKBENCH_ENVIRONMENT_ACTION_GAP = 6;
export const WORKBENCH_ENVIRONMENT_ACTION_MARGIN_BOTTOM = 10;
export const WORKBENCH_ENVIRONMENT_BRANCH_LINE_HEIGHT = 16;
export const WORKBENCH_ENVIRONMENT_CALLOUT_TITLE_LINE_HEIGHT = 18;
export const WORKBENCH_ENVIRONMENT_CALLOUT_TEXT_LINE_HEIGHT = 16;
export const WORKBENCH_ENVIRONMENT_PANEL_SHADOW = "0 4px 24px rgba(0, 0, 0, 0.22)";
// The inspector overlays the work surface instead of shrinking messages or the composer.
export const WORKBENCH_PANE_CONTENT_RIGHT_INSET = 0;
export const WORKBENCH_MESSAGE_LINE_HEIGHT = 20;
export const WORKBENCH_ASSISTANT_MESSAGE_MAX_WIDTH = 580;
export const WORKBENCH_USER_MESSAGE_MAX_WIDTH = 400;

// Desktop settings geometry from design/web3-themes-v2.html.
export const SETTINGS_DESKTOP_SIDEBAR_WIDTH = 220;
export const SETTINGS_DESKTOP_BACK_HEIGHT = 36;
export const SETTINGS_DESKTOP_NAV_ITEM_HEIGHT = 36;
export const SETTINGS_DESKTOP_HEADER_HEIGHT = 44;
export const SETTINGS_DESKTOP_BODY_PADDING = 24;
export const SETTINGS_DESKTOP_CONTENT_OUTER_MAX_WIDTH = 768;
export const SETTINGS_ROW_HORIZONTAL_PADDING = 16;
export const SETTINGS_ROW_TITLE_FONT_SIZE = 15;
export const SETTINGS_ROW_TITLE_LINE_HEIGHT = 20;
export const SETTINGS_HINT_LINE_HEIGHT = 16;
export const SETTINGS_CONTROL_HEIGHT = 32;
export const SETTINGS_INPUT_WIDTH = 64;
export const SETTINGS_LIQUID_CONTENT_BACKGROUND = "rgba(7, 14, 27, 0.25)";
export const SETTINGS_SWITCH_WIDTH = 44;
export const SETTINGS_SWITCH_HEIGHT = 28;

// Max width for chat content (stream view, input area, new agent form)
export const MAX_CONTENT_WIDTH = 1008;

// Minimum width for the main chat/agent area when sidebar is open.
// Both left-sidebar and explorer-sidebar reference this independently.
export const MIN_CHAT_WIDTH = 400;

// Horizontal gap between desktop sidebar and the center column.
// Applied as marginRight on the sidebar when open.
export const DESKTOP_SIDEBAR_GAP = 0;

// Width of the tab dropdown menu (new tab "+" button overflow menu)
export const TAB_DROPDOWN_WIDTH = 220;

// Desktop sidebar footer dimensions
export const SIDEBAR_FOOTER_HEIGHT = 78;
export const SIDEBAR_FOOTER_PADDING_LEFT = 10;

// Composer horizontal padding (left/right of the input area)
export const COMPOSER_HORIZONTAL_PADDING = 14;

// Desktop app constants for macOS traffic light buttons
// These buttons (close/minimize/maximize) overlay the top-left corner
export const DESKTOP_TRAFFIC_LIGHT_WIDTH = 78;
export const DESKTOP_TRAFFIC_LIGHT_HEIGHT = 45;

// Windows/Linux window controls (minimize/maximize/close) — top-right
export const DESKTOP_WINDOW_CONTROLS_WIDTH = 140;
export const DESKTOP_WINDOW_CONTROLS_HEIGHT = 30;

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
// Android tablets (>= 768dp width) also support pane splits for multi-pane UX.
export function supportsDesktopPaneSplits(): boolean {
  if (isWeb) return true;
  if (isAndroid) {
    const { width } = Dimensions.get("window");
    return width >= 768;
  }
  return false;
}
