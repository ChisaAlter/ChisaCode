import { useMemo } from "react";
import {
  MoreVertical,
  MousePointer2,
  PencilRuler,
  RotateCw,
  Trash2,
  ZoomIn,
} from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import type { PressableStateCallbackType } from "react-native";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Theme } from "@/styles/theme";

const ThemedMoreVertical = withUnistyles(MoreVertical);
const ThemedRotateCw = withUnistyles(RotateCw);
const ThemedZoomIn = withUnistyles(ZoomIn);
const ThemedPencilRuler = withUnistyles(PencilRuler);
const ThemedMousePointer2 = withUnistyles(MousePointer2);
const ThemedTrash2 = withUnistyles(Trash2);

const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const destructiveColorMapping = (theme: Theme) => ({ color: theme.colors.destructive });

export interface BrowserMoreMenuProps {
  zoomPercent: number;
  selectorActive: boolean;
  /** Dev-only entries (devtools, element selector) are hidden when false. */
  showDevItems: boolean;
  onReload: () => void;
  onZoomReset: () => void;
  onOpenDevTools: () => void;
  onToggleElementSelector: () => void;
  onClearData: () => void;
}

/**
 * Overflow "⋯" menu for the browser chrome: navigation/zoom maintenance and
 * dev tools, so `chromeRight` only keeps the zoom stepper.
 */
export function BrowserMoreMenu({
  zoomPercent,
  selectorActive,
  showDevItems,
  onReload,
  onZoomReset,
  onOpenDevTools,
  onToggleElementSelector,
  onClearData,
}: BrowserMoreMenuProps) {
  const { t } = useTranslation();

  const triggerStyle = useMemo(
    () =>
      ({
        hovered,
        pressed,
        open,
      }: PressableStateCallbackType & {
        hovered?: boolean;
        open?: boolean;
      }) => [styles.trigger, (hovered || pressed || open) && styles.triggerActive],
    [],
  );

  const reloadIcon = useMemo(() => <ThemedRotateCw size={15} uniProps={mutedColorMapping} />, []);
  const zoomIcon = useMemo(() => <ThemedZoomIn size={15} uniProps={mutedColorMapping} />, []);
  const devToolsIcon = useMemo(
    () => <ThemedPencilRuler size={15} uniProps={mutedColorMapping} />,
    [],
  );
  const selectorIcon = useMemo(
    () => <ThemedMousePointer2 size={15} uniProps={mutedColorMapping} />,
    [],
  );
  const clearDataIcon = useMemo(
    () => <ThemedTrash2 size={15} uniProps={destructiveColorMapping} />,
    [],
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        accessibilityRole="button"
        accessibilityLabel={t("browser.moreMenu")}
        style={triggerStyle}
        testID="browser-more-menu-trigger"
      >
        <ThemedMoreVertical size={16} uniProps={mutedColorMapping} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" minWidth={210} side="bottom" testID="browser-more-menu">
        <DropdownMenuItem
          onSelect={onReload}
          leading={reloadIcon}
          testID="browser-more-menu-reload"
        >
          {t("browser.reload")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={onZoomReset}
          disabled={zoomPercent === 100}
          leading={zoomIcon}
          testID="browser-more-menu-zoom-reset"
        >
          {t("browser.zoomReset")}
        </DropdownMenuItem>
        {showDevItems ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={onOpenDevTools}
              leading={devToolsIcon}
              testID="browser-more-menu-devtools"
            >
              {t("browser.openDevTools")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={onToggleElementSelector}
              leading={selectorIcon}
              testID="browser-more-menu-selector"
            >
              {selectorActive ? t("browser.cancelElementSelector") : t("browser.selectElement")}
            </DropdownMenuItem>
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={onClearData}
          destructive
          leading={clearDataIcon}
          testID="browser-more-menu-clear-data"
        >
          {t("browser.clearData")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const styles = StyleSheet.create((theme) => ({
  trigger: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  triggerActive: {
    backgroundColor: theme.colors.surface1,
  },
}));
