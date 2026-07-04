/* eslint-disable react-hooks/exhaustive-deps */
import { useCallback, useMemo, useState } from "react";
import {
  Pressable,
  Text,
  View,
  type GestureResponderEvent,
  type PressableStateCallbackType,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { settingsStyles } from "@/styles/settings";
import { useHostRuntimeIsConnected, useHostRuntimeClient } from "@/runtime/host-runtime";
import { useProvidersSnapshot } from "@/hooks/use-providers-snapshot";
import { useDaemonConfig } from "@/hooks/use-daemon-config";
import { buildProviderDefinitions } from "@/utils/provider-definitions";
import { getProviderIcon } from "@/components/provider-icons";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Switch } from "@/components/ui/switch";
import { SettingsSection } from "@/screens/settings/settings-section";
import { useToast } from "@/contexts/toast-context";
import { useProviderSettingsStore } from "@/stores/provider-settings-store";
import { useIsCompactFormFactor } from "@/constants/layout";
import { ChevronRight, Download, RefreshCw } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

type ProviderDefinition = ReturnType<typeof buildProviderDefinitions>[number];
type ProviderEntry = NonNullable<ReturnType<typeof useProvidersSnapshot>["entries"]>[number];

type StatusTone = "success" | "warning" | "danger" | "muted" | "loading";

interface ProviderStatus {
  tone: StatusTone;
  label: string;
  modelCount: number | null;
  versionLabel: string | null;
}

function getProviderStatus(
  status: string,
  enabled: boolean,
  modelCount: number,
  installedVersion: string | null | undefined,
  t: TFunction,
): ProviderStatus {
  let versionLabel: string | null = null;
  if (installedVersion) {
    versionLabel = `v${installedVersion}`;
  } else if (status === "unavailable") {
    versionLabel = t("providers.notInstalled");
  }
  if (!enabled)
    return { tone: "muted", label: t("providers.disabled"), modelCount: null, versionLabel };
  if (status === "loading")
    return { tone: "loading", label: t("providers.loading"), modelCount: null, versionLabel };
  if (status === "error")
    return { tone: "danger", label: t("providers.error"), modelCount: null, versionLabel };
  if (status === "ready") {
    return {
      tone: "success",
      label: t("providers.ready"),
      modelCount: modelCount > 0 ? modelCount : null,
      versionLabel,
    };
  }
  return { tone: "warning", label: t("providers.missing"), modelCount: null, versionLabel };
}

interface ProviderRowProps {
  def: ProviderDefinition;
  entry: ProviderEntry;
  enabled: boolean;
  isToggling: boolean;
  isFirst: boolean;
  serverId: string;
  onPress: (providerId: string) => void;
  onToggleEnabled: (providerId: string, enabled: boolean) => void;
}

function ProviderRow({
  def,
  entry,
  enabled,
  isToggling,
  isFirst,
  serverId,
  onPress,
  onToggleEnabled,
}: ProviderRowProps) {
  const { t } = useTranslation();
  const isCompact = useIsCompactFormFactor();
  const client = useHostRuntimeClient(serverId);
  const [toolingAction, setToolingAction] = useState<"install" | "update" | "reinstall" | null>(
    null,
  );
  const ProviderIcon = getProviderIcon(def.id);
  const providerError =
    enabled &&
    entry.status === "error" &&
    typeof entry.error === "string" &&
    entry.error.trim().length > 0
      ? entry.error.trim()
      : null;
  const modelCount = entry.models?.length ?? 0;
  const providerStatus = getProviderStatus(
    entry.status,
    enabled,
    modelCount,
    entry.installedVersion,
    t,
  );

  const handlePress = useCallback(() => {
    onPress(def.id);
  }, [def.id, onPress]);
  const handleToggleValueChange = useCallback(
    (value: boolean) => {
      onToggleEnabled(def.id, value);
    },
    [def.id, onToggleEnabled],
  );
  const handleRunToolingAction = useCallback(
    (action: "install" | "update" | "reinstall") => {
      if (!client || toolingAction) return;
      setToolingAction(action);
      void client
        .runProviderToolingAction(def.id, action)
        .then(() => {
          return;
        })
        .catch(() => {
          return;
        })
        .finally(() => {
          setToolingAction(null);
        });
    },
    [client, def.id, toolingAction],
  );
  const canInstall = entry.installAvailable === true || entry.status === "unavailable";
  const canUpdate = entry.updateAvailable === true;
  const canReinstall =
    Boolean(entry.packageName) &&
    Boolean(entry.installedVersion) &&
    entry.versionStatus !== "not-installed";
  const handleInstall = useCallback(
    (event: GestureResponderEvent) => {
      event.stopPropagation();
      handleRunToolingAction("install");
    },
    [handleRunToolingAction],
  );
  const handleUpdate = useCallback(
    (event: GestureResponderEvent) => {
      event.stopPropagation();
      handleRunToolingAction("update");
    },
    [handleRunToolingAction],
  );
  const handleReinstall = useCallback(
    (event: GestureResponderEvent) => {
      event.stopPropagation();
      handleRunToolingAction("reinstall");
    },
    [handleRunToolingAction],
  );
  const rowStyle = useCallback(
    ({ pressed, hovered }: PressableStateCallbackType & { hovered?: boolean }) => [
      settingsStyles.row,
      !isFirst && settingsStyles.rowBorder,
      styles.row,
      isCompact && styles.compactRow,
      hovered && styles.rowHovered,
      pressed && styles.rowPressed,
    ],
    [isFirst, isCompact],
  );
  const providerSwitch = (
    <Switch
      value={enabled}
      onValueChange={handleToggleValueChange}
      disabled={isToggling}
      accessibilityLabel={t("providers.enableLabel", { provider: def.label })}
    />
  );
  const maintenanceActions = (
    <ProviderMaintenanceActions
      providerLabel={def.label}
      compact={isCompact}
      canInstall={canInstall && !canUpdate}
      canUpdate={canUpdate}
      canReinstall={canReinstall}
      toolingAction={toolingAction}
      onInstall={handleInstall}
      onUpdate={handleUpdate}
      onReinstall={handleReinstall}
    />
  );

  return (
    <Pressable
      style={rowStyle}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={t("providers.detailsLabel", { provider: def.label })}
    >
      {({ hovered }: PressableStateCallbackType & { hovered?: boolean }) =>
        isCompact ? (
          <>
            <View style={styles.compactHeaderRow}>
              <ProviderSummary
                hovered={hovered === true}
                label={def.label}
                providerStatus={providerStatus}
                providerError={providerError}
                ProviderIcon={ProviderIcon}
              />
              {providerSwitch}
            </View>
            {maintenanceActions}
          </>
        ) : (
          <>
            <ProviderSummary
              hovered={hovered === true}
              label={def.label}
              providerStatus={providerStatus}
              providerError={providerError}
              ProviderIcon={ProviderIcon}
            />
            {maintenanceActions}
            {providerSwitch}
          </>
        )
      }
    </Pressable>
  );
}

function ProviderMaintenanceActions({
  providerLabel,
  compact,
  canInstall,
  canUpdate,
  canReinstall,
  toolingAction,
  onInstall,
  onUpdate,
  onReinstall,
}: {
  providerLabel: string;
  compact: boolean;
  canInstall: boolean;
  canUpdate: boolean;
  canReinstall: boolean;
  toolingAction: "install" | "update" | "reinstall" | null;
  onInstall: (event: GestureResponderEvent) => void;
  onUpdate: (event: GestureResponderEvent) => void;
  onReinstall: (event: GestureResponderEvent) => void;
}) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const rowStyle = useMemo(
    () => [styles.actionsRow, compact && styles.compactActionsRow],
    [compact],
  );
  if (!canInstall && !canUpdate && !canReinstall) return null;
  return (
    <View style={rowStyle}>
      {canInstall ? (
        <Pressable
          onPress={onInstall}
          disabled={toolingAction !== null}
          accessibilityLabel={t("providers.install")}
          style={styles.actionButton}
        >
          {toolingAction === "install" ? (
            <LoadingSpinner size={14} color={theme.colors.accent} />
          ) : (
            <Download size={14} color={theme.colors.accent} />
          )}
          <Text style={styles.actionLabel}>{t("providers.install")}</Text>
        </Pressable>
      ) : null}
      {canUpdate ? (
        <Pressable
          onPress={onUpdate}
          disabled={toolingAction !== null}
          accessibilityLabel={t("providers.update")}
          style={styles.actionButton}
        >
          {toolingAction === "update" ? (
            <LoadingSpinner size={14} color={theme.colors.accent} />
          ) : (
            <RefreshCw size={14} color={theme.colors.accent} />
          )}
          <Text style={styles.actionLabel}>{t("providers.update")}</Text>
        </Pressable>
      ) : null}
      {canReinstall ? (
        <Pressable
          onPress={onReinstall}
          disabled={toolingAction !== null}
          accessibilityLabel={t("settings.integrations.reinstallAgentTool", {
            provider: providerLabel,
          })}
          style={styles.actionButton}
        >
          {toolingAction === "reinstall" ? (
            <LoadingSpinner size={14} color={theme.colors.accent} />
          ) : (
            <RefreshCw size={14} color={theme.colors.accent} />
          )}
          <Text style={styles.actionLabel}>{t("settings.integrations.reinstall")}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ProviderSummary({
  hovered,
  label,
  providerStatus,
  providerError,
  ProviderIcon,
}: {
  hovered: boolean;
  label: string;
  providerStatus: ProviderStatus;
  providerError: string | null;
  ProviderIcon: ReturnType<typeof getProviderIcon>;
}) {
  const { theme } = useUnistyles();
  const isCompact = useIsCompactFormFactor();
  const titleRowStyle = useMemo(
    () => [styles.titleRow, isCompact && styles.compactTitleRow],
    [isCompact],
  );
  const titleStyle = useMemo(() => [settingsStyles.rowTitle, styles.providerTitle], []);
  return (
    <View style={styles.rowContent}>
      <ChevronRight
        size={theme.iconSize.sm}
        color={hovered ? theme.colors.foreground : theme.colors.foregroundMuted}
      />
      <ProviderIcon size={theme.iconSize.md} color={theme.colors.foreground} />
      <View style={styles.textColumn}>
        <View style={titleRowStyle}>
          <Text style={titleStyle} numberOfLines={1}>
            {label}
          </Text>
          {!isCompact ? <Text style={styles.separator}>·</Text> : null}
          <StatusIndicator status={providerStatus} compact={isCompact} />
        </View>
        {providerError ? (
          <Text style={styles.errorText} numberOfLines={isCompact ? 4 : 3}>
            {providerError}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function getDotColor(tone: StatusTone, theme: ReturnType<typeof useUnistyles>["theme"]): string {
  switch (tone) {
    case "success":
      return theme.colors.statusSuccess;
    case "warning":
      return theme.colors.statusWarning;
    case "danger":
      return theme.colors.statusDanger;
    default:
      return theme.colors.foregroundMuted;
  }
}

function StatusIndicator({
  status,
  compact = false,
}: {
  status: ProviderStatus;
  compact?: boolean;
}) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const rowStyle = useMemo(() => [styles.statusRow, compact && styles.compactStatusRow], [compact]);
  const dotStyle = useMemo(
    () => [styles.statusDot, { backgroundColor: getDotColor(status.tone, theme) }],
    [status.tone, theme],
  );

  return (
    <View style={rowStyle}>
      {status.tone === "loading" ? (
        <LoadingSpinner size={10} color={theme.colors.foregroundMuted} />
      ) : (
        <View style={dotStyle} />
      )}
      <Text style={styles.statusLabel}>{status.label}</Text>
      {status.modelCount !== null ? (
        <>
          <Text style={styles.separator}>·</Text>
          <Text style={styles.statusLabel}>
            {t("providers.modelCount", { count: status.modelCount })}
          </Text>
        </>
      ) : null}
      {status.versionLabel ? (
        <>
          <Text style={styles.separator}>·</Text>
          <Text style={styles.statusLabel}>{status.versionLabel}</Text>
        </>
      ) : null}
    </View>
  );
}

export interface ProvidersSectionProps {
  serverId: string;
}

export function ProvidersSection({ serverId }: ProvidersSectionProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const isConnected = useHostRuntimeIsConnected(serverId);
  const { entries, isLoading } = useProvidersSnapshot(serverId);
  const { patchConfig } = useDaemonConfig(serverId);
  const openProviderSettings = useProviderSettingsStore((state) => state.open);
  const [pendingProviderId, setPendingProviderId] = useState<string | null>(null);

  const providerDefinitions = useMemo(() => buildProviderDefinitions(entries), [entries]);
  const hasServer = serverId.length > 0;

  const handleOpenProviderSettings = useCallback(
    (providerId: string) => {
      openProviderSettings({ serverId, provider: providerId });
    },
    [openProviderSettings, serverId],
  );
  const handleToggleEnabled = useCallback(
    async (providerId: string, enabled: boolean) => {
      setPendingProviderId(providerId);
      try {
        await patchConfig({ providers: { [providerId]: { enabled } } });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
      } finally {
        setPendingProviderId((current) => (current === providerId ? null : current));
      }
    },
    [patchConfig, toast],
  );

  return (
    <SettingsSection
      title={t("providers.title")}
      testID="host-page-providers-card"
      style={styles.sectionSpacing}
    >
      {!hasServer || !isConnected ? (
        <View style={EMPTY_CARD_STYLE}>
          <Text style={styles.emptyText}>{t("providers.connectToView")}</Text>
        </View>
      ) : null}
      {hasServer && isConnected && isLoading ? (
        <View style={EMPTY_CARD_STYLE}>
          <Text style={styles.emptyText}>{t("common.loading")}</Text>
        </View>
      ) : null}
      {hasServer && isConnected && !isLoading && providerDefinitions.length > 0 ? (
        <View style={settingsStyles.card}>
          {providerDefinitions.map((def, index) => {
            const entry = entries?.find((candidate) => candidate.provider === def.id);
            if (!entry) return null;
            return (
              <ProviderRow
                key={def.id}
                def={def}
                entry={entry}
                enabled={entry.enabled ?? true}
                isToggling={pendingProviderId === def.id}
                isFirst={index === 0}
                serverId={serverId}
                onPress={handleOpenProviderSettings}
                onToggleEnabled={handleToggleEnabled}
              />
            );
          })}
        </View>
      ) : null}
    </SettingsSection>
  );
}

const styles = StyleSheet.create((theme) => ({
  sectionSpacing: {
    marginBottom: theme.spacing[4],
  },
  emptyCard: {
    padding: theme.spacing[4],
    alignItems: "center",
  },
  emptyText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
  },
  row: {
    gap: theme.spacing[3],
    minHeight: 56,
  },
  compactRow: {
    flexDirection: "column",
    alignItems: "stretch",
    justifyContent: "flex-start",
    gap: theme.spacing[3],
    minHeight: 0,
  },
  rowHovered: {
    backgroundColor: theme.colors.surface2,
  },
  rowPressed: {
    backgroundColor: theme.colors.surface3,
  },
  rowContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    minWidth: 0,
  },
  compactHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: theme.spacing[3],
    minWidth: 0,
  },
  textColumn: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    minWidth: 0,
  },
  compactTitleRow: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: theme.spacing[1],
  },
  providerTitle: {
    flexShrink: 1,
    minWidth: 0,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1.5],
    minWidth: 0,
  },
  compactStatusRow: {
    flexWrap: "wrap",
    alignItems: "center",
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  separator: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  errorText: {
    color: theme.colors.palette.red[300],
    fontSize: theme.fontSize.xs,
    marginTop: theme.spacing[1],
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  compactActionsRow: {
    flexWrap: "wrap",
    justifyContent: "flex-start",
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    minHeight: 40,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface2,
  },
  actionLabel: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.xs,
  },
}));

const EMPTY_CARD_STYLE = [settingsStyles.card, styles.emptyCard];
