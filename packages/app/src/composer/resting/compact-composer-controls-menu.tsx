import { useMemo, type ReactElement } from "react";
import { MoreHorizontal } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import type { Theme } from "@/styles/theme";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { composerControlStyle } from "@/composer/input/composer-control";
import type { CompactComposerControlItem } from "./compact-composer-controls-fallback";

export type { CompactComposerControlItem } from "./compact-composer-controls-fallback";
export { CompactComposerControlsFallbackList } from "./compact-composer-controls-fallback";

const ThemedMoreHorizontal = withUnistyles(MoreHorizontal);
const mutedColor = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

export interface CompactComposerControlsMenuProps {
  items: readonly CompactComposerControlItem[];
  visible?: boolean;
  testID?: string;
}

/**
 * "⋯" overflow menu for resting-bar controls that no longer fit inline
 * (T3 port M15). Pair with `layoutRestingComposerControls`.
 */
export function CompactComposerControlsMenu({
  items,
  visible = true,
  testID = "composer-resting-overflow-menu",
}: CompactComposerControlsMenuProps): ReactElement | null {
  const { t } = useTranslation();
  const resolveControlStyle = useMemo(
    () => composerControlStyle({ size: "xs", variant: "ghost" }),
    [],
  );
  const triggerStyle = useMemo(
    () =>
      ({ hovered, pressed, open }: { hovered?: boolean; pressed?: boolean; open?: boolean }) => [
        resolveControlStyle({ hovered, pressed }),
        (open ?? false) && styles.triggerOpen,
      ],
    [resolveControlStyle],
  );

  if (!visible || items.length === 0) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        accessibilityRole="button"
        accessibilityLabel={t("composer.restingMoreControls")}
        style={triggerStyle}
        testID={`${testID}-trigger`}
      >
        <ThemedMoreHorizontal size={14} uniProps={mutedColor} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" minWidth={170} side="top" testID={testID}>
        {items.map((item) => (
          <DropdownMenuItem
            key={item.id}
            onSelect={item.onSelect}
            leading={item.leading}
            testID={`${testID}-item-${item.id}`}
          >
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const styles = StyleSheet.create((theme) => ({
  triggerOpen: {
    backgroundColor: theme.colors.surface1,
  },
}));
