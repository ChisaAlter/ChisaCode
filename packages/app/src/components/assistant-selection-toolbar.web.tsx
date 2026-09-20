import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  Pressable,
  Text,
  View,
  type PressableStateCallbackType,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import { ComposerInsertTextContext } from "@/composer/composer-insert-text-context";
import { isWeb } from "@/constants/platform";
import { getOverlayRoot, OVERLAY_Z } from "@/lib/overlay-root";

import type { AssistantSelectionToolbarProps } from "./assistant-selection-toolbar";

const DEFAULT_MAX_LENGTH = 5000;
const TOOLBAR_HEIGHT = 36;
const TOOLBAR_GAP = 8;

interface SelectionState {
  text: string;
  rect: DOMRect;
}

function toQuoteMarkdown(text: string): string {
  return text
    .split("\n")
    .map((line) => (line.length > 0 ? `> ${line}` : ">"))
    .join("\n");
}

/**
 * Tracks DOM text selection inside `containerRef`'s element and reports the
 * selected text plus the bounding rect used to anchor the floating toolbar.
 * jsdom tests inject a fake `window.getSelection` and drive `selectionchange`.
 */
export function useAssistantSelection(options: {
  containerRef: RefObject<View | null>;
  maxLength?: number;
}): SelectionState | null {
  const { containerRef, maxLength = DEFAULT_MAX_LENGTH } = options;
  const [selection, setSelection] = useState<SelectionState | null>(null);

  useEffect(() => {
    if (!isWeb) {
      return;
    }
    const container = containerRef.current as unknown as HTMLElement | null;
    if (!container) {
      return;
    }

    const onSelectionChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setSelection(null);
        return;
      }
      const anchor = sel.anchorNode;
      if (!anchor || !container.contains(anchor)) {
        setSelection(null);
        return;
      }
      const text = sel.toString();
      if (text.trim().length === 0 || text.length > maxLength) {
        setSelection(null);
        return;
      }
      setSelection({ text, rect: sel.getRangeAt(0).getBoundingClientRect() });
    };

    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, [containerRef, maxLength]);

  return selection;
}

function clearDomSelection(): void {
  window.getSelection()?.removeAllRanges();
}

/**
 * Floating copy/quote toolbar anchored above the current text selection inside
 * an assistant message. Rendered into the shared overlay root via portal;
 * `mousedown` is swallowed so the browser keeps the selection while the button
 * activates.
 */
export function AssistantSelectionToolbar({ containerRef }: AssistantSelectionToolbarProps) {
  const { t } = useTranslation();
  const selection = useAssistantSelection({ containerRef });
  const insertText = useContext(ComposerInsertTextContext);
  const toolbarRef = useRef<View>(null);

  useEffect(() => {
    if (!isWeb || !selection) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        clearDomSelection();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selection]);

  // Swallow mousedown so pressing a button keeps the DOM selection alive until
  // the click resolves. RNW forwards host refs to the DOM node.
  useEffect(() => {
    if (!isWeb || !selection) {
      return;
    }
    const node = toolbarRef.current as unknown as HTMLElement | null;
    if (!node) {
      return;
    }
    const onMouseDown = (event: MouseEvent) => event.preventDefault();
    node.addEventListener("mousedown", onMouseDown);
    return () => node.removeEventListener("mousedown", onMouseDown);
  }, [selection]);

  const buttonStyle = useCallback(
    ({ hovered = false, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.button,
      (Boolean(hovered) || pressed) && styles.buttonActive,
    ],
    [],
  );

  const handleCopyPress = useCallback(() => {
    if (!selection) {
      return;
    }
    void navigator.clipboard?.writeText(selection.text);
    clearDomSelection();
  }, [selection]);

  const handleQuotePress = useCallback(() => {
    if (!selection || !insertText) {
      return;
    }
    insertText(toQuoteMarkdown(selection.text));
    clearDomSelection();
  }, [selection, insertText]);

  const toolbarStyle = useMemo<StyleProp<ViewStyle>>(() => {
    if (!selection) {
      return styles.toolbar;
    }
    const top = Math.max(selection.rect.top - TOOLBAR_HEIGHT - TOOLBAR_GAP, TOOLBAR_GAP);
    const centerX = selection.rect.left + selection.rect.width / 2;
    return [
      styles.toolbar,
      // The overlay root disables pointer events; re-enable on the toolbar.
      { top, left: centerX, transform: [{ translateX: "-50%" }], pointerEvents: "auto" },
    ];
  }, [selection]);

  if (!selection) {
    return null;
  }

  const toolbar = (
    <View ref={toolbarRef} testID="assistant-selection-toolbar" style={toolbarStyle}>
      <Pressable
        testID="assistant-selection-copy"
        accessibilityRole="button"
        accessibilityLabel={t("stream.copySelection")}
        style={buttonStyle}
        onPress={handleCopyPress}
      >
        <Text style={styles.buttonText}>{t("stream.copySelection")}</Text>
      </Pressable>
      {insertText ? (
        <Pressable
          testID="assistant-selection-quote"
          accessibilityRole="button"
          accessibilityLabel={t("stream.citeSelection")}
          style={buttonStyle}
          onPress={handleQuotePress}
        >
          <Text style={styles.buttonText}>{t("stream.citeSelection")}</Text>
        </Pressable>
      ) : null}
    </View>
  );

  return createPortal(toolbar, getOverlayRoot());
}

const styles = StyleSheet.create((theme) => ({
  toolbar: {
    // Overlay root is position:fixed inset:0, so absolute children stay anchored
    // to the viewport across scroll.
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    height: TOOLBAR_HEIGHT,
    paddingHorizontal: theme.spacing[1],
    gap: theme.spacing[1],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface0,
    borderWidth: 1,
    borderColor: theme.colors.border,
    shadowColor: theme.colors.palette.black,
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    zIndex: OVERLAY_Z.selectionToolbar,
  },
  button: {
    height: 28,
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    justifyContent: "center",
    cursor: "pointer",
  },
  buttonActive: {
    backgroundColor: theme.colors.surface1,
  },
  buttonText: {
    fontSize: 13,
    color: theme.colors.foregroundSubtleText,
    fontWeight: "500",
  },
}));
