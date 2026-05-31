import React, { type ReactElement, useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { settingsStyles } from "@/styles/settings";
import { SettingsSection } from "@/screens/settings/settings-section";
import { ArrowUpRight, Copy, FileText, Activity } from "lucide-react-native";
import { AdaptiveModalSheet, type SheetHeader } from "@/components/adaptive-modal-sheet";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { openExternalUrl } from "@/utils/open-external-url";
import { isVersionMismatch } from "@/desktop/updates/desktop-updates";
import { getCliDaemonStatus, shouldUseDesktopDaemon } from "@/desktop/daemon/desktop-daemon";
import { useBuiltInDaemonManagement } from "@/desktop/hooks/use-built-in-daemon-management";
import { useDaemonStatus } from "@/desktop/hooks/use-daemon-status";
import { useDesktopSettings, type DesktopSettings } from "@/desktop/settings/desktop-settings";
import { resolveAppVersion } from "@/utils/app-version";

type DesktopDaemonSettings = DesktopSettings["daemon"];

function useKeepRunningAfterQuitToggle(args: {
  settings: DesktopDaemonSettings;
  updateSettings: (next: Partial<DesktopDaemonSettings>) => Promise<unknown>;
}) {
  const { settings, updateSettings } = args;
  const [isUpdatingKeepRunningAfterQuit, setIsUpdatingKeepRunningAfterQuit] = useState(false);

  const handleToggleKeepRunningAfterQuit = useCallback(() => {
    setIsUpdatingKeepRunningAfterQuit(true);
    void updateSettings({ keepRunningAfterQuit: !settings.keepRunningAfterQuit })
      .catch(() => {
        // useDesktopSettings owns the user-visible IPC error.
      })
      .finally(() => {
        setIsUpdatingKeepRunningAfterQuit(false);
      });
  }, [settings.keepRunningAfterQuit, updateSettings]);

  return { isUpdatingKeepRunningAfterQuit, handleToggleKeepRunningAfterQuit };
}

function useDaemonCliStatusModal() {
  const [cliStatusOutput, setCliStatusOutput] = useState<string | null>(null);
  const [isCliStatusModalOpen, setIsCliStatusModalOpen] = useState(false);
  const [isLoadingCliStatus, setIsLoadingCliStatus] = useState(false);

  const handleOpenCliStatus = useCallback(async () => {
    setIsLoadingCliStatus(true);
    try {
      setCliStatusOutput(await getCliDaemonStatus());
      setIsCliStatusModalOpen(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setCliStatusOutput(`获取 daemon 状态失败：${message}`);
      setIsCliStatusModalOpen(true);
    } finally {
      setIsLoadingCliStatus(false);
    }
  }, []);

  const handleCopyCliStatus = useCallback(() => {
    if (!cliStatusOutput) {
      return;
    }
    void Clipboard.setStringAsync(cliStatusOutput)
      .then(() => {
        Alert.alert("已复制", "状态已复制到剪贴板。");
        return;
      })
      .catch((error) => {
        console.error("[Settings] Failed to copy daemon status", error);
      });
  }, [cliStatusOutput]);

  const handleCloseCliStatusModal = useCallback(() => setIsCliStatusModalOpen(false), []);

  return {
    cliStatusOutput,
    isCliStatusModalOpen,
    isLoadingCliStatus,
    handleCopyCliStatus,
    handleOpenCliStatus,
    handleCloseCliStatusModal,
  };
}

function useDaemonLogsModal(daemonLogs: { logPath?: string } | null) {
  const [isLogsModalOpen, setIsLogsModalOpen] = useState(false);

  const handleCopyLogPath = useCallback(() => {
    const logPath = daemonLogs?.logPath;
    if (!logPath) {
      return;
    }

    void Clipboard.setStringAsync(logPath)
      .then(() => {
        Alert.alert("已复制", "日志路径已复制。");
        return;
      })
      .catch((error) => {
        console.error("[Settings] Failed to copy log path", error);
        Alert.alert("错误", "无法复制日志路径。");
      });
  }, [daemonLogs?.logPath]);

  const handleOpenLogs = useCallback(() => {
    if (!daemonLogs) {
      return;
    }
    setIsLogsModalOpen(true);
  }, [daemonLogs]);

  const handleCloseLogsModal = useCallback(() => setIsLogsModalOpen(false), []);

  return { isLogsModalOpen, handleCopyLogPath, handleOpenLogs, handleCloseLogsModal };
}

interface DaemonLogsModalProps {
  visible: boolean;
  onClose: () => void;
  daemonLogs: { logPath?: string; contents?: string } | null;
}

function DaemonLogsModal({ visible, onClose, daemonLogs }: DaemonLogsModalProps) {
  return (
    <AdaptiveModalSheet
      visible={visible}
      onClose={onClose}
      header={DAEMON_LOGS_HEADER}
      testID="managed-daemon-logs-dialog"
      snapPoints={LOGS_MODAL_SNAP_POINTS}
    >
      <View style={styles.modalBody}>
        <Text style={settingsStyles.rowHint}>{daemonLogs?.logPath ?? "日志路径不可用"}</Text>
        <Text style={styles.logOutput} selectable>
          {daemonLogs?.contents?.length ? daemonLogs.contents : "（日志文件为空）"}
        </Text>
      </View>
    </AdaptiveModalSheet>
  );
}

interface DaemonCliStatusModalProps {
  visible: boolean;
  onClose: () => void;
  cliStatusOutput: string | null;
  onCopy: () => void;
}

function DaemonCliStatusModal({
  visible,
  onClose,
  cliStatusOutput,
  onCopy,
}: DaemonCliStatusModalProps) {
  return (
    <AdaptiveModalSheet
      visible={visible}
      onClose={onClose}
      header={DAEMON_STATUS_HEADER}
      testID="daemon-cli-status-dialog"
      snapPoints={CLI_STATUS_MODAL_SNAP_POINTS}
    >
      <View style={styles.modalBody}>
        <Text style={styles.logOutput} selectable>
          {cliStatusOutput ?? ""}
        </Text>
        <View style={styles.modalActions}>
          <Button variant="outline" size="sm" onPress={onClose}>
            关闭
          </Button>
          <Button size="sm" onPress={onCopy}>
            复制
          </Button>
        </View>
      </View>
    </AdaptiveModalSheet>
  );
}

interface DaemonInfoCardProps {
  daemonStatusStateText: string;
  daemonStatusDetailText: string;
  isDaemonManagementPaused: boolean;
  copyIcon: ReactElement;
  fileTextIcon: ReactElement;
  activityIcon: ReactElement;
  handleToggleDaemonManagement: () => void;
  isUpdatingDaemonManagement: boolean;
  keepRunningAfterQuit: boolean;
  handleToggleKeepRunningAfterQuit: () => void;
  isUpdatingKeepRunningAfterQuit: boolean;
  daemonLogs: { logPath?: string } | null;
  handleCopyLogPath: () => void;
  handleOpenLogs: () => void;
  handleRunCliStatus: () => void;
  isLoadingCliStatus: boolean;
}

function DaemonInfoCard(props: DaemonInfoCardProps) {
  const {
    daemonStatusStateText,
    daemonStatusDetailText,
    isDaemonManagementPaused,
    copyIcon,
    fileTextIcon,
    activityIcon,
    handleToggleDaemonManagement,
    isUpdatingDaemonManagement,
    keepRunningAfterQuit,
    handleToggleKeepRunningAfterQuit,
    isUpdatingKeepRunningAfterQuit,
    daemonLogs,
    handleCopyLogPath,
    handleOpenLogs,
    handleRunCliStatus,
    isLoadingCliStatus,
  } = props;

  return (
    <View style={settingsStyles.card}>
      <View style={settingsStyles.row}>
        <View style={settingsStyles.rowContent}>
          <Text style={settingsStyles.rowTitle}>状态</Text>
          <Text style={settingsStyles.rowHint}>这里只显示桌面端内置 daemon</Text>
        </View>
        <View style={styles.statusValueGroup}>
          <Text style={styles.valueText}>{daemonStatusStateText}</Text>
          <Text style={styles.valueSubtext}>{daemonStatusDetailText}</Text>
        </View>
      </View>
      <View style={ROW_WITH_BORDER_STYLE}>
        <View style={settingsStyles.rowContent}>
          <Text style={settingsStyles.rowTitle}>管理内置 daemon</Text>
          <Text style={settingsStyles.rowHint}>允许芙露德莉斯启动和停止内置 daemon</Text>
        </View>
        <Switch
          value={!isDaemonManagementPaused}
          onValueChange={handleToggleDaemonManagement}
          disabled={isUpdatingDaemonManagement}
          accessibilityLabel="管理内置 daemon"
        />
      </View>
      <View style={ROW_WITH_BORDER_STYLE}>
        <View style={settingsStyles.rowContent}>
          <Text style={settingsStyles.rowTitle}>退出后保持 daemon 运行</Text>
          <Text style={settingsStyles.rowHint}>退出芙露德莉斯后 daemon 会继续运行</Text>
        </View>
        <Switch
          value={keepRunningAfterQuit}
          onValueChange={handleToggleKeepRunningAfterQuit}
          disabled={isUpdatingKeepRunningAfterQuit}
          accessibilityLabel="退出后保持 daemon 运行"
        />
      </View>
      <View style={ROW_WITH_BORDER_STYLE}>
        <View style={settingsStyles.rowContent}>
          <Text style={settingsStyles.rowTitle}>日志文件</Text>
          <Text style={settingsStyles.rowHint}>{daemonLogs?.logPath ?? "日志路径不可用"}</Text>
        </View>
        <View style={styles.actionGroup}>
          {daemonLogs?.logPath ? (
            <Button variant="outline" size="sm" leftIcon={copyIcon} onPress={handleCopyLogPath}>
              复制路径
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            leftIcon={fileTextIcon}
            onPress={handleOpenLogs}
            disabled={!daemonLogs}
          >
            打开日志
          </Button>
        </View>
      </View>
      <View style={ROW_WITH_BORDER_STYLE}>
        <View style={settingsStyles.rowContent}>
          <Text style={settingsStyles.rowTitle}>完整状态</Text>
          <Text style={settingsStyles.rowHint}>运行 `paseo daemon status` 并显示输出</Text>
        </View>
        <Button
          variant="outline"
          size="sm"
          leftIcon={activityIcon}
          onPress={handleRunCliStatus}
          disabled={isLoadingCliStatus}
        >
          {isLoadingCliStatus ? "加载中..." : "查看状态"}
        </Button>
      </View>
    </View>
  );
}

export function LocalDaemonSection() {
  const { theme } = useUnistyles();
  const showSection = shouldUseDesktopDaemon();
  const appVersion = resolveAppVersion();
  const { settings, updateSettings, isLoading: isLoadingSettings } = useDesktopSettings();
  const daemonSettings = settings.daemon;
  const updateDaemonSettings = useCallback(
    (updates: Partial<DesktopDaemonSettings>) => updateSettings({ daemon: updates }),
    [updateSettings],
  );
  const { data, isLoading, error: statusError, setStatus, refetch } = useDaemonStatus();

  const daemonStatus = data?.status ?? null;
  const daemonLogs = data?.logs ?? null;
  const daemonVersion = daemonStatus?.version ?? null;

  const daemonVersionMismatch = isVersionMismatch(appVersion, daemonVersion);
  const daemonStatusStateText =
    statusError ?? (daemonStatus?.status === "running" ? "运行中" : "未运行");
  const daemonStatusDetailText = `PID ${daemonStatus?.pid ? daemonStatus.pid : "—"}`;
  const isDaemonManagementPaused = !daemonSettings.manageBuiltInDaemon;

  const { isUpdating: isUpdatingDaemonManagement, toggle: handleToggleDaemonManagement } =
    useBuiltInDaemonManagement({
      daemonStatus,
      settings: daemonSettings,
      updateSettings: updateDaemonSettings,
      setStatus,
      refreshStatus: refetch,
    });
  const { isUpdatingKeepRunningAfterQuit, handleToggleKeepRunningAfterQuit } =
    useKeepRunningAfterQuitToggle({
      settings: daemonSettings,
      updateSettings: updateDaemonSettings,
    });

  const { isLogsModalOpen, handleCopyLogPath, handleOpenLogs, handleCloseLogsModal } =
    useDaemonLogsModal(daemonLogs);

  const {
    cliStatusOutput,
    isCliStatusModalOpen,
    isLoadingCliStatus,
    handleCopyCliStatus,
    handleOpenCliStatus,
    handleCloseCliStatusModal,
  } = useDaemonCliStatusModal();
  const handleRunCliStatus = useCallback(() => {
    void handleOpenCliStatus();
  }, [handleOpenCliStatus]);

  const handleOpenAdvancedSettings = useCallback(
    () => void openExternalUrl(ADVANCED_DAEMON_SETTINGS_URL),
    [],
  );

  const advancedSettingsIcon = useMemo(
    () => <ArrowUpRight size={theme.iconSize.sm} color={theme.colors.foregroundMuted} />,
    [theme.iconSize.sm, theme.colors.foregroundMuted],
  );
  const copyIcon = useMemo(
    () => <Copy size={theme.iconSize.sm} color={theme.colors.foreground} />,
    [theme.iconSize.sm, theme.colors.foreground],
  );
  const fileTextIcon = useMemo(
    () => <FileText size={theme.iconSize.sm} color={theme.colors.foreground} />,
    [theme.iconSize.sm, theme.colors.foreground],
  );
  const activityIcon = useMemo(
    () => <Activity size={theme.iconSize.sm} color={theme.colors.foreground} />,
    [theme.iconSize.sm, theme.colors.foreground],
  );

  const advancedSettingsButton = useMemo(
    () => (
      <Button
        variant="ghost"
        size="sm"
        leftIcon={advancedSettingsIcon}
        textStyle={settingsStyles.sectionHeaderLinkText}
        style={settingsStyles.sectionHeaderLink}
        onPress={handleOpenAdvancedSettings}
        accessibilityLabel="打开高级 daemon 设置"
      >
        高级设置
      </Button>
    ),
    [advancedSettingsIcon, handleOpenAdvancedSettings],
  );

  if (!showSection) {
    return null;
  }

  return (
    <SettingsSection
      title="Daemon"
      trailing={advancedSettingsButton}
      testID="host-page-daemon-lifecycle-card"
    >
      {isLoading || isLoadingSettings ? (
        <View style={LOADING_CARD_STYLE}>
          <ActivityIndicator size="small" color={theme.colors.foregroundMuted} />
        </View>
      ) : (
        <>
          <DaemonInfoCard
            daemonStatusStateText={daemonStatusStateText}
            daemonStatusDetailText={daemonStatusDetailText}
            isDaemonManagementPaused={isDaemonManagementPaused}
            copyIcon={copyIcon}
            fileTextIcon={fileTextIcon}
            activityIcon={activityIcon}
            handleToggleDaemonManagement={handleToggleDaemonManagement}
            isUpdatingDaemonManagement={isUpdatingDaemonManagement}
            keepRunningAfterQuit={daemonSettings.keepRunningAfterQuit}
            handleToggleKeepRunningAfterQuit={handleToggleKeepRunningAfterQuit}
            isUpdatingKeepRunningAfterQuit={isUpdatingKeepRunningAfterQuit}
            daemonLogs={daemonLogs}
            handleCopyLogPath={handleCopyLogPath}
            handleOpenLogs={handleOpenLogs}
            handleRunCliStatus={handleRunCliStatus}
            isLoadingCliStatus={isLoadingCliStatus}
          />

          {daemonVersionMismatch ? (
            <View style={styles.warningCard}>
              <Text style={styles.warningText}>
                {"应用和 daemon 版本不一致。建议将二者更新到相同版本，以获得最佳体验。"}
              </Text>
            </View>
          ) : null}
        </>
      )}

      <DaemonLogsModal
        visible={isLogsModalOpen}
        onClose={handleCloseLogsModal}
        daemonLogs={daemonLogs}
      />

      <DaemonCliStatusModal
        visible={isCliStatusModalOpen}
        onClose={handleCloseCliStatusModal}
        cliStatusOutput={cliStatusOutput}
        onCopy={handleCopyCliStatus}
      />
    </SettingsSection>
  );
}

const ADVANCED_DAEMON_SETTINGS_URL = "https://paseo.sh/docs/configuration";

const styles = StyleSheet.create((theme) => ({
  actionGroup: {
    flexDirection: "row",
    gap: theme.spacing[2],
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  loadingCard: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.spacing[6],
  },
  statusValueGroup: {
    alignItems: "flex-end",
    gap: 2,
  },
  valueText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  valueSubtext: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  warningCard: {
    marginTop: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.palette.amber[500],
    backgroundColor: "rgba(245, 158, 11, 0.12)",
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
  },
  warningText: {
    color: theme.colors.palette.amber[500],
    fontSize: theme.fontSize.xs,
  },
  modalBody: {
    gap: theme.spacing[3],
    paddingBottom: theme.spacing[2],
  },
  logOutput: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    lineHeight: 18,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
  },
}));

const LOADING_CARD_STYLE = [settingsStyles.card, styles.loadingCard];
const ROW_WITH_BORDER_STYLE = [settingsStyles.row, settingsStyles.rowBorder];
const LOGS_MODAL_SNAP_POINTS = ["70%", "92%"];
const CLI_STATUS_MODAL_SNAP_POINTS = ["60%", "85%"];
const DAEMON_LOGS_HEADER: SheetHeader = { title: "Daemon 日志" };
const DAEMON_STATUS_HEADER: SheetHeader = { title: "Daemon 状态" };
