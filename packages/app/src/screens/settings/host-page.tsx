import { ChevronRight, Globe, Monitor, Pencil, RotateCw, Trash2 } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { AdaptiveModalSheet, type SheetHeader } from "@/components/adaptive-modal-sheet";
import { AdaptiveRenameModal } from "@/components/rename-modal";
import { SettingsTextAreaCard } from "@/components/settings-textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { LocalDaemonSection } from "@/desktop/components/desktop-updates-section";
import { PairDeviceModal } from "@/desktop/components/pair-device-modal";
import { useDaemonConfig } from "@/hooks/use-daemon-config";
import { useIsLocalDaemon } from "@/hooks/use-is-local-daemon";
import {
  getHostRuntimeStore,
  isHostRuntimeConnected,
  useHostMutations,
  useHostRuntimeClient,
  useHostRuntimeIsConnected,
  useHostRuntimeSnapshot,
  useHosts,
} from "@/runtime/host-runtime";
import { CustomModelsSection } from "@/screens/settings/custom-models-section";
import { CustomModelProvidersSection } from "@/screens/settings/custom-model-providers-section";
import { ProvidersSection } from "@/screens/settings/providers-section";
import { SettingsSection } from "@/screens/settings/settings-section";
import { useSessionStore } from "@/stores/session-store";
import { settingsStyles } from "@/styles/settings";
import type { HostConnection, HostProfile } from "@/types/host-connection";
import { confirmDialog } from "@/utils/confirm-dialog";
import { formatConnectionStatus, getConnectionStatusTone } from "@/utils/daemons";
import { formatLatency } from "@/utils/latency";

const RESTART_CONFIRMATION_MESSAGE =
  "这会重启主机服务。正在运行的智能体会继续执行，应用会自动重新连接。";

function formatHostConnectionLabel(connection: HostConnection): string {
  if (connection.type === "relay") {
    return `Relay (${connection.relayEndpoint})`;
  }
  if (connection.type === "directSocket" || connection.type === "directPipe") {
    return `Local (${connection.path})`;
  }
  return `TCP (${connection.endpoint})`;
}

function formatActiveConnectionBadge(
  activeConnection: { type: HostConnection["type"]; display: string } | null,
  theme: ReturnType<typeof useUnistyles>["theme"],
): { icon: React.ReactNode; text: string } | null {
  if (!activeConnection) return null;
  if (activeConnection.type === "relay") {
    return {
      icon: <Globe size={theme.iconSize.sm} color={theme.colors.foregroundMuted} />,
      text: "中继",
    };
  }
  if (activeConnection.type === "directSocket" || activeConnection.type === "directPipe") {
    return {
      icon: <Monitor size={theme.iconSize.sm} color={theme.colors.foregroundMuted} />,
      text: "本地",
    };
  }
  return {
    icon: <Monitor size={theme.iconSize.sm} color={theme.colors.foregroundMuted} />,
    text: activeConnection.display,
  };
}

function formatDaemonVersionBadge(version: string | null): string | null {
  const trimmed = version?.trim();
  if (!trimmed) return null;
  return trimmed.startsWith("v") ? trimmed : `v${trimmed}`;
}

const REMOVE_CONNECTION_HEADER: SheetHeader = { title: "移除连接" };
const REMOVE_HOST_HEADER: SheetHeader = { title: "移除主机" };

export interface HostPageProps {
  serverId: string;
  onHostRemoved?: () => void;
}

export function HostPage({ serverId, onHostRemoved }: HostPageProps) {
  const daemons = useHosts();
  const host = daemons.find((entry) => entry.serverId === serverId) ?? null;
  const { theme } = useUnistyles();
  const snapshot = useHostRuntimeSnapshot(serverId);
  const isLocalDaemon = useIsLocalDaemon(serverId);

  const daemonVersion = useSessionStore(
    (state) => state.sessions[serverId]?.serverInfo?.version ?? null,
  );

  const connectionStatus = snapshot?.connectionStatus ?? "connecting";
  const activeConnection = snapshot?.activeConnection ?? null;
  const lastError = snapshot?.lastError ?? null;
  const statusLabel = formatConnectionStatus(connectionStatus);
  const statusTone = getConnectionStatusTone(connectionStatus);
  let statusColor: string;
  if (statusTone === "success") {
    statusColor = theme.colors.palette.green[400];
  } else if (statusTone === "warning") {
    statusColor = theme.colors.palette.amber[500];
  } else if (statusTone === "error") {
    statusColor = theme.colors.destructive;
  } else {
    statusColor = theme.colors.foregroundMuted;
  }
  let statusPillBg: string;
  if (statusTone === "success") {
    statusPillBg = "rgba(74, 222, 128, 0.1)";
  } else if (statusTone === "warning") {
    statusPillBg = "rgba(245, 158, 11, 0.1)";
  } else if (statusTone === "error") {
    statusPillBg = "rgba(248, 113, 113, 0.1)";
  } else {
    statusPillBg = "rgba(161, 161, 170, 0.1)";
  }
  const connectionBadge = formatActiveConnectionBadge(activeConnection, theme);
  const versionBadgeText = formatDaemonVersionBadge(daemonVersion);
  const connectionError =
    typeof lastError === "string" && lastError.trim().length > 0 ? lastError.trim() : null;

  const statusPillStyle = useMemo(
    () => [styles.statusPill, { backgroundColor: statusPillBg }],
    [statusPillBg],
  );
  const statusDotStyle = useMemo(
    () => [styles.statusDot, { backgroundColor: statusColor }],
    [statusColor],
  );
  const statusTextStyle = useMemo(() => [styles.statusText, { color: statusColor }], [statusColor]);

  if (!host) {
    return (
      <View testID={`settings-host-page-${serverId}`}>
        <View style={EMPTY_CARD_STYLE}>
          <Text style={styles.emptyText}>找不到主机</Text>
        </View>
      </View>
    );
  }

  return (
    <View testID={`settings-host-page-${serverId}`}>
      <View style={styles.identityBadges} testID="host-page-identity">
        <View style={statusPillStyle}>
          <View style={statusDotStyle} />
          <Text style={statusTextStyle}>{statusLabel}</Text>
        </View>
        {connectionBadge ? (
          <View style={styles.badgePill}>
            {connectionBadge.icon}
            <Text style={styles.badgeText} numberOfLines={1}>
              {connectionBadge.text}
            </Text>
          </View>
        ) : null}
        {versionBadgeText ? (
          <View style={styles.badgePill}>
            <Text style={styles.badgeText} numberOfLines={1}>
              {versionBadgeText}
            </Text>
          </View>
        ) : null}
      </View>
      {connectionError ? <Text style={styles.errorText}>{connectionError}</Text> : null}

      <ConnectionsSection host={host} />

      <DaemonSection host={host} isLocalDaemon={isLocalDaemon} />

      <ProvidersSection serverId={serverId} />

      <CustomModelProvidersSection serverId={serverId} />

      <CustomModelsSection serverId={serverId} />

      <RemoveHostSection host={host} onRemoved={onHostRemoved} />
    </View>
  );
}

export function HostRenameButton({ host }: { host: HostProfile }) {
  const { theme } = useUnistyles();
  const { renameHost } = useHostMutations();
  const [isEditing, setIsEditing] = useState(false);

  const handleSubmit = useCallback(
    async (value: string) => {
      const nextLabel = value.trim();
      if (nextLabel === host.label.trim()) return;
      await renameHost(host.serverId, nextLabel);
    },
    [host.label, host.serverId, renameHost],
  );

  const openEditor = useCallback(() => setIsEditing(true), []);
  const closeEditor = useCallback(() => setIsEditing(false), []);

  return (
    <>
      <Pressable
        onPress={openEditor}
        hitSlop={8}
        style={styles.identityEditButton}
        accessibilityRole="button"
        accessibilityLabel="编辑标签"
        testID="host-page-label-edit-button"
      >
        <Pencil size={theme.iconSize.sm} color={theme.colors.foregroundMuted} />
      </Pressable>

      <AdaptiveRenameModal
        visible={isEditing}
        title="重命名主机"
        initialValue={host.label}
        placeholder="我的主机"
        submitLabel="保存"
        onClose={closeEditor}
        onSubmit={handleSubmit}
        testID="host-page-rename-modal"
      />
    </>
  );
}

function ConnectionsSection({ host }: { host: HostProfile }) {
  const { removeConnection } = useHostMutations();
  const snapshot = useHostRuntimeSnapshot(host.serverId);
  const probeByConnectionId = snapshot?.probeByConnectionId ?? new Map();
  const [pendingRemoveConnection, setPendingRemoveConnection] = useState<{
    connectionId: string;
    title: string;
  } | null>(null);
  const [isRemovingConnection, setIsRemovingConnection] = useState(false);

  const handleRequestRemove = useCallback((connection: HostConnection) => {
    setPendingRemoveConnection({
      connectionId: connection.id,
      title: formatHostConnectionLabel(connection),
    });
  }, []);

  const handleCloseConfirm = useCallback(() => {
    if (isRemovingConnection) return;
    setPendingRemoveConnection(null);
  }, [isRemovingConnection]);

  const handleCancelConfirm = useCallback(() => {
    setPendingRemoveConnection(null);
  }, []);

  const handleConfirmRemove = useCallback(() => {
    if (!pendingRemoveConnection) return;
    const { connectionId } = pendingRemoveConnection;
    setIsRemovingConnection(true);
    void removeConnection(host.serverId, connectionId)
      .then(() => setPendingRemoveConnection(null))
      .catch((error) => {
        console.error("[HostPage] Failed to remove connection", error);
        Alert.alert("错误", "无法移除连接");
      })
      .finally(() => setIsRemovingConnection(false));
  }, [pendingRemoveConnection, removeConnection, host.serverId]);

  return (
    <SettingsSection title="连接">
      <View style={settingsStyles.card} testID="host-page-connections-card">
        {host.connections.map((conn, index) => {
          const probe = probeByConnectionId.get(conn.id);
          return (
            <ConnectionRow
              key={conn.id}
              connection={conn}
              showBorder={index > 0}
              latencyMs={probe?.status === "available" ? probe.latencyMs : undefined}
              latencyLoading={!probe || probe.status === "pending"}
              latencyError={probe?.status === "unavailable"}
              onRemove={handleRequestRemove}
            />
          );
        })}
      </View>

      {pendingRemoveConnection ? (
        <AdaptiveModalSheet
          header={REMOVE_CONNECTION_HEADER}
          visible
          onClose={handleCloseConfirm}
          testID="remove-connection-confirm-modal"
        >
          <Text style={styles.confirmText}>
            要移除 {pendingRemoveConnection.title} 吗？此操作无法撤销。
          </Text>
          <View style={styles.confirmActions}>
            <Button
              variant="secondary"
              size="sm"
              style={FLEX_1_STYLE}
              onPress={handleCancelConfirm}
              disabled={isRemovingConnection}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              size="sm"
              style={FLEX_1_STYLE}
              onPress={handleConfirmRemove}
              disabled={isRemovingConnection}
              testID="remove-connection-confirm"
            >
              移除
            </Button>
          </View>
        </AdaptiveModalSheet>
      ) : null}
    </SettingsSection>
  );
}

function ConnectionRow({
  connection,
  showBorder,
  latencyMs,
  latencyLoading,
  latencyError,
  onRemove,
}: {
  connection: HostConnection;
  showBorder: boolean;
  latencyMs: number | null | undefined;
  latencyLoading: boolean;
  latencyError: boolean;
  onRemove: (connection: HostConnection) => void;
}) {
  const { theme } = useUnistyles();
  const title = formatHostConnectionLabel(connection);

  const latencyText = (() => {
    if (latencyLoading) return "...";
    if (latencyError) return "超时";
    if (latencyMs != null) return formatLatency(latencyMs);
    return "\u2014";
  })();
  const latencyColor = latencyError ? theme.colors.palette.red[300] : theme.colors.foregroundMuted;

  const handlePressRemove = useCallback(() => {
    onRemove(connection);
  }, [onRemove, connection]);

  const rowStyle = useMemo(
    () => [settingsStyles.row, showBorder && settingsStyles.rowBorder],
    [showBorder],
  );
  const latencyTextStyle = useMemo(
    () => [styles.connectionLatency, { color: latencyColor }],
    [latencyColor],
  );
  const destructiveTextStyle = useMemo(
    () => ({ color: theme.colors.destructive }),
    [theme.colors.destructive],
  );

  return (
    <View style={rowStyle}>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle} numberOfLines={1}>
          {title}
        </Text>
      </View>
      <Text style={latencyTextStyle}>{latencyText}</Text>
      <Button
        variant="ghost"
        size="sm"
        textStyle={destructiveTextStyle}
        onPress={handlePressRemove}
      >
        移除
      </Button>
    </View>
  );
}

function DaemonSection({ host, isLocalDaemon }: { host: HostProfile; isLocalDaemon: boolean }) {
  return (
    <>
      <SettingsSection title="主机服务设置">
        <InjectChisaCodeToolsCard serverId={host.serverId} />
        <AppendSystemPromptCard serverId={host.serverId} />
      </SettingsSection>
      {isLocalDaemon ? (
        <SettingsSection title="配对设备">
          <PairDeviceRow />
        </SettingsSection>
      ) : null}
      {isLocalDaemon ? <LocalDaemonSection /> : null}
    </>
  );
}

const delay = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

function RestartDaemonCard({ host }: { host: HostProfile }) {
  const { theme } = useUnistyles();
  const daemonClient = useHostRuntimeClient(host.serverId);
  const isConnected = useHostRuntimeIsConnected(host.serverId);
  const runtime = getHostRuntimeStore();
  const [isRestarting, setIsRestarting] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const isHostConnected = useCallback(
    () => isHostRuntimeConnected(runtime.getSnapshot(host.serverId)),
    [host.serverId, runtime],
  );

  const waitForCondition = useCallback(
    async (predicate: () => boolean, timeoutMs: number, intervalMs = 250) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (!isMountedRef.current) return false;
        if (predicate()) return true;
        await delay(intervalMs);
      }
      return predicate();
    },
    [],
  );

  const waitForDaemonRestart = useCallback(async () => {
    const disconnectTimeoutMs = 7000;
    const reconnectTimeoutMs = 30000;
    if (isHostConnected()) {
      await waitForCondition(() => !isHostConnected(), disconnectTimeoutMs);
    }
    const reconnected = await waitForCondition(() => isHostConnected(), reconnectTimeoutMs);
    if (isMountedRef.current) {
      setIsRestarting(false);
      if (!reconnected) {
        Alert.alert("无法重新连接", `${host.label} 没有恢复在线。请确认它已经重启。`);
      }
    }
  }, [host.label, isHostConnected, waitForCondition]);

  const handleRestart = useCallback(() => {
    if (!daemonClient) {
      Alert.alert("主机不可用", "此主机尚未连接。请等待它上线后再重启。");
      return;
    }
    if (!isHostConnected()) {
      Alert.alert("主机离线", "此主机已离线。ChisaCode会自动重连，请等待它恢复在线后再重启。");
      return;
    }

    void confirmDialog({
      title: `重启 ${host.label}`,
      message: RESTART_CONFIRMATION_MESSAGE,
      confirmLabel: "重启",
      cancelLabel: "取消",
      destructive: true,
    })
      .then((confirmed) => {
        if (!confirmed) return;
        setIsRestarting(true);
        void daemonClient
          .restartServer(`settings_daemon_restart_${host.serverId}`)
          .catch((error) => {
            console.error(`[HostPage] Failed to restart daemon ${host.label}`, error);
            if (!isMountedRef.current) return;
            setIsRestarting(false);
            Alert.alert("错误", "发送重启请求失败。ChisaCode会自动重连，请在主机显示在线后重试。");
          });
        void waitForDaemonRestart();
        return;
      })
      .catch((error) => {
        console.error(`[HostPage] Failed to open restart confirmation for ${host.label}`, error);
        Alert.alert("错误", "无法打开重启确认对话框。");
      });
  }, [daemonClient, host.label, host.serverId, isHostConnected, waitForDaemonRestart]);

  const restartIcon = useMemo(
    () => <RotateCw size={theme.iconSize.sm} color={theme.colors.foreground} />,
    [theme.iconSize.sm, theme.colors.foreground],
  );

  return (
    <View style={settingsStyles.card} testID="host-page-restart-card">
      <View style={settingsStyles.row}>
        <View style={settingsStyles.rowContent}>
          <Text style={settingsStyles.rowTitle}>重启主机服务</Text>
          <Text style={settingsStyles.rowHint}>重启主机服务进程。应用会自动重新连接</Text>
        </View>
        <Button
          variant="outline"
          size="sm"
          leftIcon={restartIcon}
          onPress={handleRestart}
          disabled={isRestarting || !daemonClient || !isConnected}
          testID="host-page-restart-button"
        >
          {isRestarting ? "正在重启..." : "重启"}
        </Button>
      </View>
    </View>
  );
}

function InjectChisaCodeToolsCard({ serverId }: { serverId: string }) {
  const isConnected = useHostRuntimeIsConnected(serverId);
  const { config, patchConfig } = useDaemonConfig(serverId);

  const handleValueChange = useCallback(
    (next: boolean) => {
      void patchConfig({
        mcp: {
          injectIntoAgents: next,
        },
      });
    },
    [patchConfig],
  );

  if (!isConnected) return null;

  return (
    <View style={settingsStyles.card} testID="host-page-inject-mcp-card">
      <View style={settingsStyles.row}>
        <View style={settingsStyles.rowContent}>
          <Text style={settingsStyles.rowTitle}>启用 ChisaCode 工具</Text>
          <Text style={settingsStyles.rowHint}>智能体将能够管理 worktree、智能体和计划任务</Text>
        </View>
        <Switch
          value={config?.mcp.injectIntoAgents !== false}
          onValueChange={handleValueChange}
          accessibilityLabel="注入ChisaCode工具"
        />
      </View>
    </View>
  );
}

function AppendSystemPromptCard({ serverId }: { serverId: string }) {
  const isConnected = useHostRuntimeIsConnected(serverId);
  const { config, patchConfig } = useDaemonConfig(serverId);
  const persistedPrompt = config?.appendSystemPrompt ?? "";
  const [draft, setDraft] = useState(persistedPrompt);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const header = useMemo<SheetHeader>(() => ({ title: "追加系统提示词" }), []);

  useEffect(() => {
    setDraft(persistedPrompt);
  }, [persistedPrompt]);

  const hasChanges = draft !== persistedPrompt;

  const handleOpen = useCallback(() => {
    setDraft(persistedPrompt);
    setIsEditing(true);
  }, [persistedPrompt]);

  const handleClose = useCallback(() => {
    if (isSaving) return;
    setDraft(persistedPrompt);
    setIsEditing(false);
  }, [isSaving, persistedPrompt]);

  const handleSave = useCallback(() => {
    setIsSaving(true);
    void patchConfig({ appendSystemPrompt: draft })
      .then(() => {
        setIsEditing(false);
        return;
      })
      .catch((error) => {
        console.error("[HostPage] Failed to save append system prompt", error);
      })
      .finally(() => setIsSaving(false));
  }, [draft, patchConfig]);

  const handleReset = useCallback(() => {
    setDraft(persistedPrompt);
  }, [persistedPrompt]);

  if (!isConnected) return null;

  return (
    <>
      <View style={settingsStyles.card} testID="host-page-append-system-prompt-card">
        <View style={settingsStyles.row}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>系统提示词</Text>
            <Text style={settingsStyles.rowHint}>为所有智能体追加系统提示词</Text>
          </View>
          <Button
            variant="outline"
            size="sm"
            onPress={handleOpen}
            testID="host-page-append-system-prompt-edit"
          >
            编辑
          </Button>
        </View>
      </View>

      {isEditing ? (
        <AdaptiveModalSheet
          header={header}
          visible
          onClose={handleClose}
          testID="host-page-append-system-prompt-sheet"
          desktopMaxWidth={560}
        >
          <SettingsTextAreaCard
            testID="host-page-append-system-prompt-input"
            accessibilityLabel="追加系统提示词"
            value={draft}
            onChangeText={setDraft}
            placeholder="Always keep replies concise."
          />
          <View style={styles.appendPromptActions}>
            <Button
              variant="ghost"
              size="sm"
              onPress={handleReset}
              disabled={!hasChanges || isSaving}
              testID="host-page-append-system-prompt-reset"
            >
              重置
            </Button>
            <Button
              variant="default"
              size="sm"
              onPress={handleSave}
              disabled={!hasChanges || isSaving}
              testID="host-page-append-system-prompt-save"
            >
              {isSaving ? "保存中..." : "保存"}
            </Button>
          </View>
        </AdaptiveModalSheet>
      ) : null}
    </>
  );
}

function PairDeviceRow() {
  const { theme } = useUnistyles();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleOpen = useCallback(() => setIsModalOpen(true), []);
  const handleClose = useCallback(() => setIsModalOpen(false), []);

  return (
    <View style={settingsStyles.card}>
      <Pressable
        style={settingsStyles.row}
        onPress={handleOpen}
        accessibilityRole="button"
        testID="host-page-pair-device-row"
      >
        <View style={settingsStyles.rowContent}>
          <Text style={settingsStyles.rowTitle}>配对设备</Text>
          <Text style={settingsStyles.rowHint}>扫描二维码或复制链接，将手机连接到此主机</Text>
        </View>
        <ChevronRight size={theme.iconSize.sm} color={theme.colors.foregroundMuted} />
      </Pressable>

      <PairDeviceModal
        visible={isModalOpen}
        onClose={handleClose}
        testID="host-page-pair-device-card"
      />
    </View>
  );
}

function RemoveHostSection({ host, onRemoved }: { host: HostProfile; onRemoved?: () => void }) {
  const { theme } = useUnistyles();
  const { removeHost } = useHostMutations();
  const [isConfirming, setIsConfirming] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  const destructiveTextStyle = useMemo(
    () => ({ color: theme.colors.destructive }),
    [theme.colors.destructive],
  );

  const handleOpenConfirm = useCallback(() => setIsConfirming(true), []);
  const handleCloseConfirm = useCallback(() => {
    if (isRemoving) return;
    setIsConfirming(false);
  }, [isRemoving]);
  const handleCancel = useCallback(() => setIsConfirming(false), []);
  const handleConfirmRemove = useCallback(() => {
    setIsRemoving(true);
    void removeHost(host.serverId)
      .then(() => {
        setIsConfirming(false);
        onRemoved?.();
        return;
      })
      .catch((error) => {
        console.error("[HostPage] Failed to remove host", error);
        Alert.alert("错误", "无法移除主机");
      })
      .finally(() => setIsRemoving(false));
  }, [host.serverId, onRemoved, removeHost]);

  const removeIcon = useMemo(
    () => <Trash2 size={theme.iconSize.sm} color={theme.colors.destructive} />,
    [theme.iconSize.sm, theme.colors.destructive],
  );

  return (
    <SettingsSection title="危险操作" testID="host-page-remove-host-card">
      <RestartDaemonCard host={host} />

      <View style={settingsStyles.card}>
        <View style={settingsStyles.row}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>移除主机</Text>
            <Text style={settingsStyles.rowHint}>从此设备移除该主机及其保存的连接</Text>
          </View>
          <Button
            variant="outline"
            size="sm"
            leftIcon={removeIcon}
            textStyle={destructiveTextStyle}
            onPress={handleOpenConfirm}
            testID="host-page-remove-host-button"
          >
            移除
          </Button>
        </View>
      </View>

      {isConfirming ? (
        <AdaptiveModalSheet
          header={REMOVE_HOST_HEADER}
          visible
          onClose={handleCloseConfirm}
          testID="remove-host-confirm-modal"
        >
          <Text style={styles.confirmText}>要移除 {host.label} 吗？这会删除它保存的连接。</Text>
          <View style={styles.confirmActions}>
            <Button
              variant="secondary"
              size="sm"
              style={FLEX_1_STYLE}
              onPress={handleCancel}
              disabled={isRemoving}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              size="sm"
              style={FLEX_1_STYLE}
              onPress={handleConfirmRemove}
              disabled={isRemoving}
              testID="remove-host-confirm"
            >
              移除
            </Button>
          </View>
        </AdaptiveModalSheet>
      ) : null}
    </SettingsSection>
  );
}

const styles = StyleSheet.create((theme) => ({
  identityEditButton: {
    padding: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
  },
  identityBadges: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    flexWrap: "wrap",
    marginBottom: theme.spacing[6],
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 4,
    borderRadius: theme.borderRadius.full,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: theme.borderRadius.full,
  },
  statusText: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.normal,
  },
  badgePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 4,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface3,
    maxWidth: 200,
  },
  badgeText: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.normal,
    color: theme.colors.foregroundMuted,
    flexShrink: 1,
  },
  errorText: {
    color: theme.colors.palette.red[300],
    fontSize: theme.fontSize.xs,
    marginBottom: theme.spacing[2],
  },
  connectionLatency: {
    fontSize: theme.fontSize.sm,
    marginRight: theme.spacing[2],
  },
  confirmText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  confirmActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    marginTop: theme.spacing[4],
  },
  appendPromptActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
  },
  emptyCard: {
    padding: theme.spacing[4],
    alignItems: "center",
  },
  emptyText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
}));

const FLEX_1_STYLE = { flex: 1 };
const EMPTY_CARD_STYLE = [settingsStyles.card, styles.emptyCard];
