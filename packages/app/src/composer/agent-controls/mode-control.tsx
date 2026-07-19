import {
  memo,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactElement,
} from "react";
import {
  Pressable,
  Text,
  View,
  type PressableStateCallbackType,
  type StyleProp,
  type TextStyle,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/shallow";
import { useStoreWithEqualityFn } from "zustand/traditional";
import {
  Bot,
  ChevronDown,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  ShieldQuestionMark,
} from "lucide-react-native";
import { type SheetHeader } from "@/components/adaptive-modal-sheet";
import { Combobox, ComboboxItem, type ComboboxOption } from "@/components/ui/combobox";
import { useSessionStore } from "@/stores/session-store";
import { useProvidersSnapshot } from "@/hooks/use-providers-snapshot";
import { resolveProviderDefinition } from "@/utils/provider-definitions";
import { useToast } from "@/contexts/toast-context";
import {
  useIsCompactFormFactor,
  WORKBENCH_COMPOSER_CONTROL_HEIGHT,
  WORKBENCH_META_LINE_HEIGHT,
} from "@/constants/layout";
import { toErrorMessage } from "@/utils/error-messages";
import { formatAgentModeLabel } from "@/composer/agent-controls/utils";
import type { AgentMode, AgentProvider } from "@chisacode/protocol/agent-types";
import {
  getModeVisuals,
  type AgentProviderDefinition,
} from "@chisacode/protocol/provider-manifest";

export type AgentModeControlPlacement = "toolbar" | "footer";

function shouldRenderForPlacement(placement: AgentModeControlPlacement, isCompact: boolean) {
  return placement === "footer" ? isCompact : !isCompact;
}

interface ModeIconProps {
  size?: number;
  color?: string;
}

const MODE_ICONS: Record<string, ComponentType<ModeIconProps>> = {
  Bot,
  ShieldCheck,
  ShieldAlert,
  ShieldOff,
  ShieldQuestionMark,
};

interface ModeComboboxOptionProps {
  option: ComboboxOption;
  selected: boolean;
  active: boolean;
  onPress: () => void;
  provider: string;
  providerDefinitions: AgentProviderDefinition[];
  iconColor: string;
  labelStyle?: StyleProp<TextStyle>;
}

function ModeComboboxOption({
  option,
  selected,
  active,
  onPress,
  provider,
  providerDefinitions,
  iconColor,
  labelStyle,
}: ModeComboboxOptionProps) {
  const visuals = getModeVisuals(provider, option.id, providerDefinitions);
  const IconComponent = visuals?.icon ? MODE_ICONS[visuals.icon] : undefined;
  const leadingSlot = useMemo(
    () => (IconComponent ? <IconComponent size={16} color={iconColor} /> : null),
    [IconComponent, iconColor],
  );
  return (
    <ComboboxItem
      label={option.label}
      selected={selected}
      active={active}
      onPress={onPress}
      leadingSlot={leadingSlot}
      labelStyle={labelStyle}
    />
  );
}

interface AgentModeControlViewProps {
  provider: string;
  providerDefinitions: AgentProviderDefinition[];
  modeOptions: AgentMode[];
  selectedModeId: string | null | undefined;
  onSelectMode: (modeId: string) => void;
  isCompact: boolean;
  disabled?: boolean;
}

function normalizeSearchQuery(value: string): string {
  return value.trim().toLowerCase();
}

function AgentModeControlView({
  provider,
  providerDefinitions,
  modeOptions,
  selectedModeId,
  onSelectMode,
  isCompact,
  disabled = false,
}: AgentModeControlViewProps) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const anchorRef = useRef<View>(null);
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const selectedMode = useMemo(() => {
    if (modeOptions.length === 0) return null;
    return modeOptions.find((m) => m.id === selectedModeId) ?? modeOptions[0];
  }, [modeOptions, selectedModeId]);

  const visuals = selectedMode
    ? getModeVisuals(provider, selectedMode.id, providerDefinitions)
    : undefined;
  const Icon = visuals?.icon ? MODE_ICONS[visuals.icon] : undefined;
  const isFullAccessMode = selectedMode?.id === "full-access";
  const fullAccessColor = theme.colors.palette.orange[600];
  const iconColor = isFullAccessMode ? fullAccessColor : theme.colors.foregroundMuted;
  const selectedModeLabel = selectedMode ? formatAgentModeLabel(selectedMode) : "";
  const fullAccessLabelStyle = useMemo(() => ({ color: fullAccessColor }), [fullAccessColor]);

  const allOptions = useMemo<ComboboxOption[]>(
    () => modeOptions.map((m) => ({ id: m.id, label: formatAgentModeLabel(m) })),
    [modeOptions],
  );
  const options = useMemo<ComboboxOption[]>(() => {
    const q = normalizeSearchQuery(searchQuery);
    if (!q) return allOptions;
    return allOptions.filter((o) => o.label.toLowerCase().includes(q));
  }, [allOptions, searchQuery]);

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) setSearchQuery("");
  }, []);

  const handlePress = useCallback(() => handleOpenChange(!open), [handleOpenChange, open]);
  const handleSelect = useCallback(
    (id: string) => {
      onSelectMode(id);
      handleOpenChange(false);
    },
    [onSelectMode, handleOpenChange],
  );

  const renderOption = useCallback(
    (args: {
      option: ComboboxOption;
      selected: boolean;
      active: boolean;
      onPress: () => void;
    }): ReactElement => (
      <ModeComboboxOption
        option={args.option}
        selected={args.selected}
        active={args.active}
        onPress={args.onPress}
        provider={provider}
        providerDefinitions={providerDefinitions}
        iconColor={args.option.id === "full-access" ? fullAccessColor : theme.colors.foreground}
        labelStyle={args.option.id === "full-access" ? fullAccessLabelStyle : undefined}
      />
    ),
    [fullAccessColor, fullAccessLabelStyle, provider, providerDefinitions, theme.colors.foreground],
  );

  const pressableStyle = useCallback(
    ({ pressed, hovered }: PressableStateCallbackType) => [
      styles.chip,
      !isCompact && styles.desktopChip,
      hovered && styles.chipHovered,
      (pressed || open) && styles.chipPressed,
      disabled && styles.chipDisabled,
    ],
    [disabled, isCompact, open],
  );

  const labelStyle = useMemo(
    () => [styles.chipLabel, isFullAccessMode && { color: fullAccessColor }],
    [fullAccessColor, isFullAccessMode],
  );

  const sheetHeader = useMemo<SheetHeader>(
    () => ({
      title: t("composer.controls.mode"),
      search: {
        onChange: setSearchQuery,
        placeholder: t("composer.controls.searchMode"),
        testID: "mode-search-input",
      },
    }),
    [t],
  );

  if (!selectedMode) return null;

  return (
    <>
      <Pressable
        ref={anchorRef}
        collapsable={false}
        disabled={disabled}
        onPress={handlePress}
        style={pressableStyle}
        accessibilityRole="button"
        accessibilityLabel={t("composer.controls.selectModeWithValue", {
          value: selectedModeLabel,
        })}
        testID="mode-control"
      >
        {Icon ? <Icon size={theme.iconSize.md} color={iconColor} /> : null}
        <Text style={labelStyle}>{selectedModeLabel}</Text>
        <ChevronDown size={theme.iconSize.sm} color={iconColor} />
      </Pressable>
      <Combobox
        options={options}
        value={selectedMode.id}
        onSelect={handleSelect}
        open={open}
        onOpenChange={handleOpenChange}
        anchorRef={anchorRef}
        desktopPlacement="top-start"
        header={sheetHeader}
        renderOption={renderOption}
      />
    </>
  );
}

const EMPTY_MODES: AgentMode[] = [];

function compareAvailableModes(a: AgentMode[], b: AgentMode[]): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

interface AgentModeControlProps {
  serverId: string;
  agentId: string;
  placement: AgentModeControlPlacement;
}

export const AgentModeControl = memo(function AgentModeControl({
  serverId,
  agentId,
  placement,
}: AgentModeControlProps) {
  const isCompact = useIsCompactFormFactor();
  const slice = useSessionStore(
    useShallow((state) => {
      const agent = state.sessions[serverId]?.agents?.get(agentId);
      if (!agent) return null;
      return {
        provider: agent.provider,
        cwd: agent.cwd,
        currentModeId: agent.currentModeId,
      };
    }),
  );
  const availableModes = useStoreWithEqualityFn(
    useSessionStore,
    (state) => state.sessions[serverId]?.agents?.get(agentId)?.availableModes ?? EMPTY_MODES,
    compareAvailableModes,
  );
  const client = useSessionStore((state) => state.sessions[serverId]?.client ?? null);
  const toast = useToast();
  const { entries: snapshotEntries } = useProvidersSnapshot(serverId, { cwd: slice?.cwd });

  const providerDefinitions = useMemo<AgentProviderDefinition[]>(() => {
    if (!slice?.provider) return [];
    const definition = resolveProviderDefinition(slice.provider, snapshotEntries);
    return definition ? [definition] : [];
  }, [slice?.provider, snapshotEntries]);

  const handleSelectMode = useCallback(
    (modeId: string) => {
      if (!client) return;
      void client.setAgentMode(agentId, modeId).catch((error) => {
        console.warn("[AgentModeControl] setAgentMode failed", error);
        toast.error(toErrorMessage(error));
      });
    },
    [agentId, client, toast],
  );

  if (!slice || availableModes.length === 0) return null;
  if (!shouldRenderForPlacement(placement, isCompact)) return null;

  return (
    <AgentModeControlView
      provider={slice.provider}
      providerDefinitions={providerDefinitions}
      modeOptions={availableModes}
      selectedModeId={slice.currentModeId}
      onSelectMode={handleSelectMode}
      isCompact={isCompact}
      disabled={!client}
    />
  );
});

export interface DraftAgentModeControlProps {
  selectedProvider: AgentProvider | null;
  providerDefinitions: AgentProviderDefinition[];
  modeOptions: AgentMode[];
  selectedMode: string;
  onSelectMode: (modeId: string) => void;
  disabled?: boolean;
  placement: AgentModeControlPlacement;
}

export function DraftAgentModeControl({
  selectedProvider,
  providerDefinitions,
  modeOptions,
  selectedMode,
  onSelectMode,
  disabled,
  placement,
}: DraftAgentModeControlProps) {
  const isCompact = useIsCompactFormFactor();
  if (!selectedProvider || modeOptions.length === 0) return null;
  if (!shouldRenderForPlacement(placement, isCompact)) return null;
  return (
    <AgentModeControlView
      provider={selectedProvider}
      providerDefinitions={providerDefinitions}
      modeOptions={modeOptions}
      selectedModeId={selectedMode}
      onSelectMode={onSelectMode}
      isCompact={isCompact}
      disabled={disabled}
    />
  );
}

const styles = StyleSheet.create((theme) => ({
  chip: {
    height: 28,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "transparent",
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius["2xl"],
  },
  desktopChip: {
    minWidth: 90,
    height: WORKBENCH_COMPOSER_CONTROL_HEIGHT,
    // Flat into the composer surface — no chip border/fill.
    backgroundColor: "transparent",
    gap: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  chipHovered: {
    backgroundColor: theme.colors.surface2,
  },
  chipPressed: {
    backgroundColor: theme.colors.surface0,
  },
  chipDisabled: {
    opacity: 0.5,
  },
  chipLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    lineHeight: WORKBENCH_META_LINE_HEIGHT,
    fontWeight: theme.fontWeight.normal,
  },
}));
