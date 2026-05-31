import { useCallback, useMemo, useReducer, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useIsCompactFormFactor } from "@/constants/layout";
import { Check, ChevronDown, ChevronRight, Eye, EyeOff, Link2 } from "lucide-react-native";
import type { HostProfile } from "@/types/host-connection";
import { useHosts, useHostMutations } from "@/runtime/host-runtime";
import {
  parseConnectionUri,
  serializeConnectionUri,
  serializeConnectionUriForStorage,
} from "@/utils/daemon-endpoints";
import { DaemonConnectionTestError } from "@/utils/test-daemon-connection";
import { AdaptiveModalSheet, AdaptiveTextInput, type SheetHeader } from "./adaptive-modal-sheet";
import { Button } from "@/components/ui/button";

const FLEX_ONE_STYLE = { flex: 1 } as const;
const DIRECT_CONNECTION_HEADER: SheetHeader = { title: "直接连接" };

interface DirectConnectionDraft {
  host: string;
  port: string;
  useTls: boolean;
  password: string;
}

interface PreparedDirectConnection {
  uri: string;
  endpoint: string;
  useTls: boolean;
  password?: string;
}

const styles = StyleSheet.create((theme) => ({
  field: {
    gap: theme.spacing[2],
  },
  label: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  input: {
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    color: theme.colors.foreground,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  portRow: {
    flexDirection: "row",
    gap: theme.spacing[3],
  },
  hostField: {
    flex: 1,
    minWidth: 0,
  },
  portField: {
    width: 112,
  },
  passwordRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  passwordInput: {
    flex: 1,
    minWidth: 0,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface2,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  advancedToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    alignSelf: "flex-start",
    paddingVertical: theme.spacing[1],
  },
  advancedText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  actions: {
    flexDirection: "row",
    gap: theme.spacing[3],
    marginTop: theme.spacing[2],
  },
  helper: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  error: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.sm,
  },
}));

function isIpv6Host(host: string): boolean {
  return host.includes(":") && !host.startsWith("[") && !host.endsWith("]");
}

function buildConnectionUriFromDraft(draft: DirectConnectionDraft): string {
  const host = draft.host.trim();
  const port = Number(draft.port.trim());
  if (!host) {
    throw new Error("请输入主机地址");
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("端口必须在 1 到 65535 之间");
  }

  return serializeConnectionUriForStorage({
    host,
    port,
    isIpv6: isIpv6Host(host),
    useTls: draft.useTls,
    ...(draft.password ? { password: draft.password } : {}),
  });
}

function prepareDirectConnection(draft: DirectConnectionDraft): PreparedDirectConnection {
  const parsed = parseConnectionUri(buildConnectionUriFromDraft(draft));
  const endpoint = parsed.isIpv6
    ? `[${parsed.host}]:${parsed.port}`
    : `${parsed.host}:${parsed.port}`;

  return {
    uri: serializeConnectionUri(parsed),
    endpoint,
    useTls: parsed.useTls,
    ...(parsed.password ? { password: parsed.password } : {}),
  };
}

function draftFromConnectionUri(uri: string): DirectConnectionDraft {
  const parsed = parseConnectionUri(uri);
  return {
    host: parsed.host,
    port: String(parsed.port),
    useTls: parsed.useTls,
    password: parsed.password ?? "",
  };
}

function normalizeTransportMessage(message: string | null | undefined): string | null {
  if (!message) return null;
  const trimmed = message.trim();
  if (!trimmed) return null;
  return trimmed;
}

function formatTechnicalTransportDetails(details: (string | null)[]): string | null {
  const unique = Array.from(
    new Set(
      details
        .map((value) => normalizeTransportMessage(value))
        .filter((value): value is string => Boolean(value))
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
  );

  if (unique.length === 0) return null;

  const allGeneric = unique.every((value) => {
    const lower = value.toLowerCase();
    return lower === "transport error" || lower === "transport closed";
  });

  if (allGeneric) {
    return `${unique[0]}（没有更多详情）`;
  }

  return unique.join(" — ");
}

function buildConnectionFailureCopy(
  endpoint: string,
  error: unknown,
): { title: string; detail: string | null; raw: string | null } {
  const title = `无法连接到 ${endpoint}。`;

  const raw = (() => {
    if (error instanceof DaemonConnectionTestError) {
      return (
        formatTechnicalTransportDetails([error.reason, error.lastError]) ??
        normalizeTransportMessage(error.message)
      );
    }
    if (error instanceof Error) {
      return normalizeTransportMessage(error.message);
    }
    return null;
  })();

  const rawLower = raw?.toLowerCase() ?? "";
  let detail: string | null = null;

  if (raw === "Incorrect password" || raw === "Password required") {
    detail = raw === "Incorrect password" ? "密码不正确。" : "需要密码。";
  } else if (rawLower.includes("timed out")) {
    detail = "连接超时。请检查主机、端口和网络。";
  } else if (
    rawLower.includes("econnrefused") ||
    rawLower.includes("connection refused") ||
    rawLower.includes("err_connection_refused")
  ) {
    detail = "连接被拒绝。请确认服务器是否正在该地址运行。";
  } else if (rawLower.includes("enotfound") || rawLower.includes("not found")) {
    detail = "找不到主机。请检查主机名后重试。";
  } else if (rawLower.includes("ehostunreach") || rawLower.includes("host is unreachable")) {
    detail = "主机不可达。请检查网络和防火墙。";
  } else if (
    rawLower.includes("certificate") ||
    rawLower.includes("tls") ||
    rawLower.includes("ssl")
  ) {
    detail = "TLS 错误。直接连接只有在 daemon 前面有 TLS 终止层时才使用 SSL。";
  } else {
    detail = "无法连接。请检查主机、端口，并确认 daemon 可访问。";
  }

  return { title, detail, raw };
}

export interface AddHostModalProps {
  visible: boolean;
  onClose: () => void;
  onCancel?: () => void;
  onSaved?: (result: {
    profile: HostProfile;
    serverId: string;
    hostname: string | null;
    isNewHost: boolean;
  }) => void;
}

export function AddHostModal({ visible, onClose, onCancel, onSaved }: AddHostModalProps) {
  const { theme } = useUnistyles();
  const daemons = useHosts();
  const { probeAndUpsertDirectConnection } = useHostMutations();
  const isMobile = useIsCompactFormFactor();

  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("6767");
  const [useTls, setUseTls] = useState(false);
  const [password, setPassword] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [advancedUri, setAdvancedUri] = useState("");
  const [inputResetKey, bumpInputResetKey] = useReducer((key: number) => key + 1, 0);

  const clearInput = useCallback(() => {
    setHost("");
    setPort("6767");
    setUseTls(false);
    setPassword("");
    setIsPasswordVisible(false);
    setIsAdvancedOpen(false);
    setAdvancedUri("");
    bumpInputResetKey();
  }, []);

  const connectIcon = useMemo(
    () => <Link2 size={16} color={theme.colors.palette.white} />,
    [theme.colors.palette.white],
  );
  const hostFieldStyle = useMemo(() => [styles.field, styles.hostField], []);
  const portFieldStyle = useMemo(() => [styles.field, styles.portField], []);
  const checkboxStyle = useMemo(
    () => [styles.checkbox, useTls ? styles.checkboxChecked : null],
    [useTls],
  );
  const passwordInputStyle = useMemo(() => [styles.input, styles.passwordInput], []);
  const useTlsAccessibilityState = useMemo(
    () => ({ checked: useTls, disabled: isSaving }),
    [isSaving, useTls],
  );

  const handleClose = useCallback(() => {
    if (isSaving) return;
    clearInput();
    setErrorMessage("");
    onClose();
  }, [isSaving, clearInput, onClose]);

  const handleCancel = useCallback(() => {
    if (isSaving) return;
    clearInput();
    setErrorMessage("");
    (onCancel ?? onClose)();
  }, [isSaving, clearInput, onCancel, onClose]);

  const handleSave = useCallback(async () => {
    if (isSaving) return;

    let connection: PreparedDirectConnection;
    try {
      connection = prepareDirectConnection({ host, port, useTls, password });
    } catch (error) {
      const message = error instanceof Error ? error.message : "连接信息无效";
      setErrorMessage(message);
      return;
    }

    try {
      setIsSaving(true);
      setErrorMessage("");

      const { profile, serverId, hostname } = await probeAndUpsertDirectConnection({
        endpoint: connection.endpoint,
        useTls: connection.useTls,
        ...(connection.password ? { password: connection.password } : {}),
      });
      const isNewHost = !daemons.some((daemon) => daemon.serverId === serverId);

      onSaved?.({ profile, serverId, hostname, isNewHost });
      handleClose();
    } catch (error) {
      const { title, detail, raw: rawDetail } = buildConnectionFailureCopy(connection.uri, error);
      let combined: string;
      if (rawDetail && detail && rawDetail !== detail) {
        combined = `${title}\n${detail}\n详情：${rawDetail}`;
      } else if (detail) {
        combined = `${title}\n${detail}`;
      } else {
        combined = title;
      }
      setErrorMessage(combined);
      if (!isMobile) {
        Alert.alert("连接失败", combined);
      }
    } finally {
      setIsSaving(false);
    }
  }, [
    daemons,
    handleClose,
    host,
    isMobile,
    isSaving,
    onSaved,
    password,
    port,
    probeAndUpsertDirectConnection,
    useTls,
  ]);

  const handleSubmitEditing = useCallback(() => {
    void handleSave();
  }, [handleSave]);

  const handleSavePress = useCallback(() => {
    void handleSave();
  }, [handleSave]);

  const handleToggleUseTls = useCallback(() => {
    if (isSaving) return;
    setUseTls((current) => !current);
  }, [isSaving]);

  const handleTogglePasswordVisibility = useCallback(() => {
    setIsPasswordVisible((current) => !current);
  }, []);

  const handleToggleAdvanced = useCallback(() => {
    if (!isAdvancedOpen) {
      try {
        setAdvancedUri(buildConnectionUriFromDraft({ host, port, useTls, password }));
      } catch {
        setAdvancedUri("");
      }
      setErrorMessage("");
      setIsAdvancedOpen(true);
      return;
    }

    try {
      const next = draftFromConnectionUri(advancedUri);
      setHost(next.host);
      setPort(next.port);
      setUseTls(next.useTls);
      setPassword(next.password);
      setErrorMessage("");
      bumpInputResetKey();
    } catch {
      setErrorMessage("");
    }
    setIsAdvancedOpen(false);
  }, [advancedUri, host, isAdvancedOpen, password, port, useTls]);

  const AdvancedIcon = isAdvancedOpen ? ChevronDown : ChevronRight;
  const PasswordIcon = isPasswordVisible ? EyeOff : Eye;

  return (
    <AdaptiveModalSheet
      header={DIRECT_CONNECTION_HEADER}
      visible={visible}
      onClose={handleClose}
      testID="add-host-modal"
    >
      <Text style={styles.helper}>输入ChisaCode服务器地址。</Text>

      <View style={styles.portRow}>
        <View style={hostFieldStyle}>
          <Text style={styles.label}>主机</Text>
          <AdaptiveTextInput
            testID="direct-host-input"
            nativeID="direct-host-input"
            accessibilityLabel="主机"
            initialValue={host}
            resetKey={`direct-host-${inputResetKey}`}
            value={host}
            onChangeText={setHost}
            placeholder="localhost"
            placeholderTextColor={theme.colors.foregroundMuted}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            editable={!isSaving}
            returnKeyType="next"
          />
        </View>
        <View style={portFieldStyle}>
          <Text style={styles.label}>端口</Text>
          <AdaptiveTextInput
            testID="direct-port-input"
            nativeID="direct-port-input"
            accessibilityLabel="端口"
            initialValue={port}
            resetKey={`direct-port-${inputResetKey}`}
            value={port}
            onChangeText={setPort}
            placeholder="6767"
            placeholderTextColor={theme.colors.foregroundMuted}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="number-pad"
            editable={!isSaving}
            returnKeyType="done"
            onSubmitEditing={handleSubmitEditing}
          />
        </View>
      </View>

      <Pressable
        style={styles.checkboxRow}
        onPress={handleToggleUseTls}
        disabled={isSaving}
        accessibilityRole="checkbox"
        accessibilityLabel="使用 SSL"
        accessibilityState={useTlsAccessibilityState}
        testID="direct-ssl-toggle"
      >
        <View style={checkboxStyle}>
          {useTls ? (
            <View testID="direct-ssl-toggle-checked">
              <Check size={14} color={theme.colors.accentForeground} />
            </View>
          ) : null}
        </View>
        <Text style={styles.label}>使用 SSL</Text>
      </Pressable>

      <View style={styles.field}>
        <Text style={styles.label}>密码</Text>
        <View style={styles.passwordRow}>
          <AdaptiveTextInput
            testID="direct-password-input"
            nativeID="direct-password-input"
            accessibilityLabel="密码"
            initialValue={password}
            resetKey={`direct-password-${inputResetKey}`}
            value={password}
            onChangeText={setPassword}
            placeholder="可选"
            placeholderTextColor={theme.colors.foregroundMuted}
            style={passwordInputStyle}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry={!isPasswordVisible}
            editable={!isSaving}
            returnKeyType="done"
            onSubmitEditing={handleSubmitEditing}
          />
          <Pressable
            style={styles.iconButton}
            onPress={handleTogglePasswordVisibility}
            disabled={isSaving}
            accessibilityRole="button"
            accessibilityLabel={isPasswordVisible ? "隐藏密码" : "显示密码"}
            testID="direct-password-visibility-toggle"
          >
            <PasswordIcon size={18} color={theme.colors.foregroundMuted} />
          </Pressable>
        </View>
      </View>

      <View style={styles.field}>
        <Pressable
          style={styles.advancedToggle}
          onPress={handleToggleAdvanced}
          disabled={isSaving}
          accessibilityRole="button"
          accessibilityLabel={isAdvancedOpen ? "隐藏高级选项" : "显示高级选项"}
          testID="direct-host-advanced-toggle"
        >
          <AdvancedIcon size={16} color={theme.colors.foregroundMuted} />
          <Text style={styles.advancedText}>高级</Text>
        </Pressable>
        {isAdvancedOpen ? (
          <AdaptiveTextInput
            testID="direct-host-uri-input"
            nativeID="direct-host-uri-input"
            accessibilityLabel="连接 URI"
            initialValue={advancedUri}
            resetKey={`direct-host-uri-${inputResetKey}`}
            value={advancedUri}
            onChangeText={setAdvancedUri}
            placeholder="tcp://localhost:6767?ssl=true"
            placeholderTextColor={theme.colors.foregroundMuted}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            editable={!isSaving}
            returnKeyType="done"
            onSubmitEditing={handleToggleAdvanced}
          />
        ) : null}
        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
      </View>

      <View style={styles.actions}>
        <Button
          style={FLEX_ONE_STYLE}
          variant="secondary"
          onPress={handleCancel}
          disabled={isSaving}
        >
          取消
        </Button>
        <Button
          style={FLEX_ONE_STYLE}
          variant="default"
          onPress={handleSavePress}
          disabled={isSaving}
          leftIcon={connectIcon}
          testID="direct-host-submit"
        >
          {isSaving ? "连接中..." : "连接"}
        </Button>
      </View>
    </AdaptiveModalSheet>
  );
}
