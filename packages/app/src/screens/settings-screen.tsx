import { Fragment, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { ComponentType, ReactNode } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type PressableStateCallbackType,
} from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Buffer } from "buffer";
import {
  ArrowLeft,
  Monitor,
  ChevronDown,
  Settings,
  Server,
  Keyboard,
  Stethoscope,
  Info,
  Shield,
  Puzzle,
  Plus,
  FolderGit2,
  Bot,
} from "lucide-react-native";
import { SidebarHeaderRow } from "@/components/sidebar/sidebar-header-row";
import { SidebarSeparator } from "@/components/sidebar/sidebar-separator";
import { ScreenTitle } from "@/components/headers/screen-title";
import { HeaderIconBadge } from "@/components/headers/header-icon-badge";
import { SettingsSection } from "@/screens/settings/settings-section";
import {
  useSettings,
  parseTerminalScrollbackLines,
  type AppLanguage,
  type AppSettings,
  type SendBehavior,
  type ServiceUrlBehavior,
  type Settings as EffectiveSettings,
} from "@/hooks/use-settings";
import { THEME_PREVIEWS, type ThemeName } from "@/styles/theme";
import {
  getHostRuntimeStore,
  isHostRuntimeConnected,
  useHostRuntimeIsConnected,
  useHosts,
} from "@/runtime/host-runtime";
import type { HostProfile } from "@/types/host-connection";
import { TitlebarDragRegion } from "@/components/desktop/titlebar-drag-region";
import { useWindowControlsPadding } from "@/utils/desktop-window";
import { confirmDialog } from "@/utils/confirm-dialog";
import { BackHeader } from "@/components/headers/back-header";
import { ScreenHeader } from "@/components/headers/screen-header";
import { AddHostMethodModal } from "@/components/add-host-method-modal";
import { AddHostModal } from "@/components/add-host-modal";
import { PairLinkModal } from "@/components/pair-link-modal";
import { KeyboardShortcutsSection } from "@/screens/settings/keyboard-shortcuts-section";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DesktopPermissionsSection } from "@/desktop/components/desktop-permissions-section";
import { IntegrationsSection } from "@/desktop/components/integrations-section";
import { isElectronRuntime } from "@/desktop/host";
import { useDesktopAppUpdater } from "@/desktop/updates/use-desktop-app-updater";
import {
  checkGitHubReleaseUpdate,
  type GitHubReleaseUpdateResult,
} from "@/updates/github-release-updates";
import { settingsStyles } from "@/styles/settings";
import { THINKING_TONE_NATIVE_PCM_BASE64 } from "@/utils/thinking-tone.native-pcm";
import { useVoiceAudioEngineOptional } from "@/contexts/voice-context";
import { HostPage, HostRenameButton } from "@/screens/settings/host-page";
import { CustomModelProvidersSection } from "@/screens/settings/custom-model-providers-section";
import { SyntheticModelsSection } from "@/screens/settings/synthetic-models-section";
import ProjectsScreen from "@/screens/projects-screen";
import ProjectSettingsScreen from "@/screens/project-settings-screen";
import { useIsCompactFormFactor } from "@/constants/layout";
import { useLocalDaemonServerId } from "@/hooks/use-is-local-daemon";
import { useWebScrollbarStyle } from "@/hooks/use-web-scrollbar-style";
import { resolveAppVersion } from "@/utils/app-version";
import { openExternalUrl } from "@/utils/open-external-url";
import {
  buildHostOpenProjectRoute,
  buildProjectsSettingsRoute,
  buildSettingsHostRoute,
  buildSettingsSectionRoute,
  type SettingsSectionSlug,
} from "@/utils/host-routes";
import { navigateToLastWorkspace } from "@/stores/navigation-active-workspace-store";

// ---------------------------------------------------------------------------
// View model
// ---------------------------------------------------------------------------

export type SettingsView =
  | { kind: "root" }
  | { kind: "section"; section: SettingsSectionSlug }
  | { kind: "host"; serverId: string }
  | { kind: "projects" }
  | { kind: "project"; projectKey: string };

interface SidebarSectionItem {
  id: SettingsSectionSlug;
  labelKey: string;
  icon: ComponentType<{ size: number; color: string }>;
  desktopOnly?: boolean;
}

const SIDEBAR_SECTION_ITEMS: SidebarSectionItem[] = [
  { id: "general", labelKey: "settings.sections.general", icon: Settings },
  { id: "models", labelKey: "settings.sections.models", icon: Bot },
  { id: "shortcuts", labelKey: "settings.sections.shortcuts", icon: Keyboard, desktopOnly: true },
  {
    id: "integrations",
    labelKey: "settings.sections.integrations",
    icon: Puzzle,
    desktopOnly: true,
  },
  { id: "permissions", labelKey: "settings.sections.permissions", icon: Shield, desktopOnly: true },
  { id: "diagnostics", labelKey: "settings.sections.diagnostics", icon: Stethoscope },
  { id: "about", labelKey: "settings.sections.about", icon: Info },
];

// ---------------------------------------------------------------------------
// Theme helpers (General section)
// ---------------------------------------------------------------------------

function ThemeIcon({
  theme,
  size,
  color,
}: {
  theme: AppSettings["theme"];
  size: number;
  color: string;
}) {
  return theme === "auto" ? (
    <Monitor size={size} color={color} />
  ) : (
    <ThemePreview theme={theme} width={size + 12} height={size} />
  );
}

function ThemePreview({
  theme,
  width,
  height,
}: {
  theme: ThemeName;
  width: number;
  height: number;
}) {
  const preview = THEME_PREVIEWS[theme];
  const previewStyle = useMemo(
    () => ({
      width,
      height,
      borderRadius: 4,
      backgroundColor: preview.surface,
      borderWidth: 1,
      borderColor: preview.border,
      overflow: "hidden" as const,
    }),
    [height, preview.border, preview.surface, width],
  );
  const lineStyle = useMemo(
    () => ({
      height: 1,
      backgroundColor: preview.line,
      marginHorizontal: 3,
      marginTop: 3,
    }),
    [preview.line],
  );
  const accentStyle = useMemo(
    () => ({
      position: "absolute" as const,
      top: 0,
      bottom: 0,
      left: 0,
      width: 4,
      backgroundColor: preview.accent,
    }),
    [preview.accent],
  );
  return (
    <View style={previewStyle}>
      <View style={accentStyle} />
      <View style={lineStyle} />
      <View style={lineStyle} />
    </View>
  );
}

function themeTriggerStyle({ pressed }: PressableStateCallbackType) {
  return [styles.themeTrigger, pressed && { opacity: 0.85 }];
}

function sidebarItemStyle({ hovered }: PressableStateCallbackType & { hovered?: boolean }) {
  return [sidebarStyles.item, Boolean(hovered) && sidebarStyles.itemHovered];
}

function selectedSidebarItemStyle({ hovered }: PressableStateCallbackType & { hovered?: boolean }) {
  return [
    sidebarStyles.item,
    Boolean(hovered) && sidebarStyles.itemHovered,
    sidebarStyles.itemSelected,
  ];
}

const ROW_WITH_BORDER_STYLE = [settingsStyles.row, settingsStyles.rowBorder];

const SERVICE_URL_BEHAVIOR_VALUES: ServiceUrlBehavior[] = ["ask", "in-app", "external"];
const APP_LANGUAGE_VALUES: AppLanguage[] = ["zh-CN", "en"];

// ---------------------------------------------------------------------------
// Section components
// ---------------------------------------------------------------------------

interface GeneralSectionProps {
  settings: AppSettings;
  isDesktopApp: boolean;
  handleThemeChange: (theme: AppSettings["theme"]) => void;
  handleLanguageChange: (language: AppLanguage) => void;
  handleSendBehaviorChange: (behavior: SendBehavior) => void;
  handleServiceUrlBehaviorChange: (behavior: ServiceUrlBehavior) => void;
  handleTerminalScrollbackLinesChange: (lines: number) => void;
}

interface ThemeMenuItemProps {
  themeValue: AppSettings["theme"];
  selected: boolean;
  previewHeight: number;
  iconColor: string;
  label: string;
  onChange: (theme: AppSettings["theme"]) => void;
}

function ThemeMenuItem({
  themeValue,
  selected,
  previewHeight,
  iconColor,
  label,
  onChange,
}: ThemeMenuItemProps) {
  const handleSelect = useCallback(() => {
    onChange(themeValue);
  }, [onChange, themeValue]);
  const leading = useMemo(
    () => <ThemeIcon theme={themeValue} size={previewHeight} color={iconColor} />,
    [themeValue, previewHeight, iconColor],
  );
  return (
    <DropdownMenuItem selected={selected} onSelect={handleSelect} leading={leading}>
      {label}
    </DropdownMenuItem>
  );
}

interface LanguageMenuItemProps {
  value: AppLanguage;
  selected: boolean;
  label: string;
  onChange: (value: AppLanguage) => void;
}

function LanguageMenuItem({ value, selected, label, onChange }: LanguageMenuItemProps) {
  const handleSelect = useCallback(() => {
    onChange(value);
  }, [onChange, value]);
  return (
    <DropdownMenuItem selected={selected} onSelect={handleSelect}>
      {label}
    </DropdownMenuItem>
  );
}

interface ServiceUrlBehaviorMenuItemProps {
  value: ServiceUrlBehavior;
  selected: boolean;
  label: string;
  onChange: (value: ServiceUrlBehavior) => void;
}

function ServiceUrlBehaviorMenuItem({
  value,
  selected,
  label,
  onChange,
}: ServiceUrlBehaviorMenuItemProps) {
  const handleSelect = useCallback(() => {
    onChange(value);
  }, [onChange, value]);
  return (
    <DropdownMenuItem selected={selected} onSelect={handleSelect}>
      {label}
    </DropdownMenuItem>
  );
}

function GeneralSection({
  settings,
  isDesktopApp,
  handleThemeChange,
  handleLanguageChange,
  handleSendBehaviorChange,
  handleServiceUrlBehaviorChange,
  handleTerminalScrollbackLinesChange,
}: GeneralSectionProps) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const iconSize = theme.iconSize.md;
  const iconColor = theme.colors.foregroundMuted;
  const themePreviewHeight = 18;
  const [terminalScrollbackValue, setTerminalScrollbackValue] = useState(
    String(settings.terminalScrollbackLines),
  );
  const sendBehaviorOptions = useMemo(
    () => [
      { value: "interrupt" as const, label: t("settings.general.defaultSend.options.interrupt") },
      { value: "queue" as const, label: t("settings.general.defaultSend.options.queue") },
    ],
    [t],
  );

  const handleTerminalScrollbackChangeText = useCallback((value: string) => {
    setTerminalScrollbackValue(value.replace(/[^\d]/g, ""));
  }, []);

  const commitTerminalScrollback = useCallback(() => {
    const parsed = parseTerminalScrollbackLines(terminalScrollbackValue);
    const nextValue = parsed ?? settings.terminalScrollbackLines;
    setTerminalScrollbackValue(String(nextValue));
    if (nextValue !== settings.terminalScrollbackLines) {
      handleTerminalScrollbackLinesChange(nextValue);
    }
  }, [
    handleTerminalScrollbackLinesChange,
    settings.terminalScrollbackLines,
    terminalScrollbackValue,
  ]);

  useEffect(() => {
    setTerminalScrollbackValue(String(settings.terminalScrollbackLines));
  }, [settings.terminalScrollbackLines]);

  return (
    <SettingsSection title={t("settings.general.title")}>
      <View style={settingsStyles.card}>
        <View style={settingsStyles.row}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>{t("settings.general.theme.title")}</Text>
          </View>
          <DropdownMenu>
            <DropdownMenuTrigger style={themeTriggerStyle}>
              <ThemeIcon theme={settings.theme} size={iconSize} color={iconColor} />
              <Text style={styles.themeTriggerText}>
                {t(`settings.general.theme.options.${settings.theme}`)}
              </Text>
              <ChevronDown size={theme.iconSize.sm} color={iconColor} />
            </DropdownMenuTrigger>
            <DropdownMenuContent side="bottom" align="end" width={200}>
              {(["light", "dark", "auto"] as const).map((themeValue) => (
                <ThemeMenuItem
                  key={themeValue}
                  themeValue={themeValue}
                  selected={settings.theme === themeValue}
                  previewHeight={themePreviewHeight}
                  iconColor={iconColor}
                  label={t(`settings.general.theme.options.${themeValue}`)}
                  onChange={handleThemeChange}
                />
              ))}
              <DropdownMenuSeparator />
              {(["zinc", "midnight", "claude", "ghostty", "liquid-neon", "chisaki"] as const).map(
                (themeValue) => (
                  <ThemeMenuItem
                    key={themeValue}
                    themeValue={themeValue}
                    selected={settings.theme === themeValue}
                    previewHeight={themePreviewHeight}
                    iconColor={iconColor}
                    label={t(`settings.general.theme.options.${themeValue}`)}
                    onChange={handleThemeChange}
                  />
                ),
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </View>
        <View style={ROW_WITH_BORDER_STYLE}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>{t("settings.general.language.title")}</Text>
            <Text style={settingsStyles.rowHint}>{t("settings.general.language.description")}</Text>
          </View>
          <DropdownMenu>
            <DropdownMenuTrigger style={themeTriggerStyle}>
              <Text style={styles.themeTriggerText}>
                {t(`settings.general.language.options.${settings.language}`)}
              </Text>
              <ChevronDown size={theme.iconSize.sm} color={iconColor} />
            </DropdownMenuTrigger>
            <DropdownMenuContent side="bottom" align="end" width={200}>
              {APP_LANGUAGE_VALUES.map((value) => (
                <LanguageMenuItem
                  key={value}
                  value={value}
                  selected={settings.language === value}
                  label={t(`settings.general.language.options.${value}`)}
                  onChange={handleLanguageChange}
                />
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </View>
        <View style={ROW_WITH_BORDER_STYLE}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>{t("settings.general.defaultSend.title")}</Text>
            <Text style={settingsStyles.rowHint}>
              {t("settings.general.defaultSend.description")}
            </Text>
          </View>
          <SegmentedControl
            size="sm"
            value={settings.sendBehavior}
            onValueChange={handleSendBehaviorChange}
            options={sendBehaviorOptions}
          />
        </View>
        {isDesktopApp ? (
          <View style={ROW_WITH_BORDER_STYLE}>
            <View style={settingsStyles.rowContent}>
              <Text style={settingsStyles.rowTitle}>{t("settings.general.serviceUrls.title")}</Text>
              <Text style={settingsStyles.rowHint}>
                {t("settings.general.serviceUrls.description")}
              </Text>
            </View>
            <DropdownMenu>
              <DropdownMenuTrigger style={themeTriggerStyle}>
                <Text style={styles.themeTriggerText}>
                  {t(`settings.general.serviceUrls.options.${settings.serviceUrlBehavior}`)}
                </Text>
                <ChevronDown size={theme.iconSize.sm} color={iconColor} />
              </DropdownMenuTrigger>
              <DropdownMenuContent side="bottom" align="end" width={200}>
                {SERVICE_URL_BEHAVIOR_VALUES.map((value) => (
                  <ServiceUrlBehaviorMenuItem
                    key={value}
                    value={value}
                    selected={settings.serviceUrlBehavior === value}
                    label={t(`settings.general.serviceUrls.options.${value}`)}
                    onChange={handleServiceUrlBehaviorChange}
                  />
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </View>
        ) : null}
        <View style={ROW_WITH_BORDER_STYLE}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>
              {t("settings.general.terminalScrollback.title")}
            </Text>
            <Text style={settingsStyles.rowHint}>
              {t("settings.general.terminalScrollback.description")}
            </Text>
          </View>
          <TextInput
            value={terminalScrollbackValue}
            onChangeText={handleTerminalScrollbackChangeText}
            onBlur={commitTerminalScrollback}
            onSubmitEditing={commitTerminalScrollback}
            keyboardType="number-pad"
            inputMode="numeric"
            selectTextOnFocus
            style={styles.terminalScrollbackInput}
            accessibilityLabel={t("settings.general.terminalScrollback.accessibilityLabel")}
          />
        </View>
      </View>
    </SettingsSection>
  );
}

interface DiagnosticsSectionProps {
  voiceAudioEngine: ReturnType<typeof useVoiceAudioEngineOptional>;
  isPlaybackTestRunning: boolean;
  playbackTestResult: string | null;
  handlePlaybackTest: () => Promise<void>;
}

function DiagnosticsSection({
  voiceAudioEngine,
  isPlaybackTestRunning,
  playbackTestResult,
  handlePlaybackTest,
}: DiagnosticsSectionProps) {
  const { t } = useTranslation();
  const handlePlayPress = useCallback(() => {
    void handlePlaybackTest();
  }, [handlePlaybackTest]);
  return (
    <SettingsSection title={t("settings.diagnostics.title")}>
      <View style={settingsStyles.card}>
        <View style={settingsStyles.row}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>{t("settings.diagnostics.testAudio")}</Text>
            {playbackTestResult ? (
              <Text style={settingsStyles.rowHint}>{playbackTestResult}</Text>
            ) : null}
          </View>
          <Button
            variant="secondary"
            size="sm"
            onPress={handlePlayPress}
            disabled={!voiceAudioEngine || isPlaybackTestRunning}
          >
            {isPlaybackTestRunning
              ? t("settings.diagnostics.playing")
              : t("settings.diagnostics.playTest")}
          </Button>
        </View>
      </View>
    </SettingsSection>
  );
}

function AboutSection({ isDesktopApp }: { isDesktopApp: boolean }) {
  const { t } = useTranslation();
  return (
    <>
      <SettingsSection title={t("settings.about.title")}>
        <View style={settingsStyles.card}>
          {isDesktopApp ? <DesktopAppUpdateRow /> : <GitHubReleaseUpdateRow />}
        </View>
      </SettingsSection>
      <ConnectedHostsSection />
    </>
  );
}

function ConnectedHostsSection() {
  const { t } = useTranslation();
  const hosts = useHosts();
  if (hosts.length === 0) {
    return null;
  }
  return (
    <SettingsSection title={t("settings.about.connectedHosts")}>
      <View style={settingsStyles.card}>
        {hosts.map((host, index) => (
          <HostVersionRow key={host.serverId} host={host} showBorder={index > 0} />
        ))}
      </View>
    </SettingsSection>
  );
}

function HostVersionRow({ host, showBorder }: { host: HostProfile; showBorder: boolean }) {
  const { t } = useTranslation();
  const isConnected = useHostRuntimeIsConnected(host.serverId);

  const rowStyle = useMemo(
    () => [settingsStyles.row, showBorder && settingsStyles.rowBorder],
    [showBorder],
  );

  return (
    <View style={rowStyle}>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle} numberOfLines={1}>
          {host.label}
        </Text>
        <Text style={settingsStyles.rowHint}>{t("settings.about.thisDevice")}</Text>
      </View>
      <Text style={styles.aboutValue}>
        {isConnected ? t("settings.about.online") : t("settings.about.offline")}
      </Text>
    </View>
  );
}

function getUpdateButtonLabel(
  isInstalling: boolean,
  latestVersion: string | null | undefined,
  t: TFunction,
): string {
  if (isInstalling) return t("settings.updates.installing");
  if (latestVersion) return t("settings.updates.installConfirm");
  return t("settings.updates.update");
}

function DesktopAppUpdateRow() {
  const { t } = useTranslation();
  const { settings, updateSettings } = useSettings();
  const {
    isDesktopApp,
    statusText,
    availableUpdate,
    errorMessage,
    isChecking,
    isInstalling,
    checkForUpdates,
    installUpdate,
  } = useDesktopAppUpdater();

  useFocusEffect(
    useCallback(() => {
      if (!isDesktopApp) {
        return undefined;
      }
      void checkForUpdates({ silent: true });
      return undefined;
    }, [checkForUpdates, isDesktopApp]),
  );

  const handleCheckForUpdates = useCallback(() => {
    if (!isDesktopApp) {
      return;
    }
    void checkForUpdates();
  }, [checkForUpdates, isDesktopApp]);

  const handleReleaseChannelChange = useCallback(
    (releaseChannel: EffectiveSettings["releaseChannel"]) => {
      void updateSettings({ releaseChannel });
    },
    [updateSettings],
  );

  const handleInstallUpdate = useCallback(() => {
    if (!isDesktopApp) {
      return;
    }

    void confirmDialog({
      title: t("settings.updates.installTitle"),
      message: t("settings.updates.installMessage"),
      confirmLabel: t("settings.updates.installConfirm"),
      cancelLabel: t("common.cancel"),
    })
      .then((confirmed) => {
        if (!confirmed) {
          return;
        }
        void installUpdate();
        return;
      })
      .catch((error) => {
        console.error("[Settings] Failed to open app update confirmation", error);
        Alert.alert(t("common.error"), t("settings.updates.confirmOpenFailed"));
      });
  }, [installUpdate, isDesktopApp, t]);

  const releaseChannelOptions = useMemo(
    () => [
      { value: "stable" as const, label: t("settings.updates.stable") },
      { value: "beta" as const, label: t("settings.updates.beta") },
    ],
    [t],
  );

  if (!isDesktopApp) {
    return null;
  }

  return (
    <>
      <View style={ROW_WITH_BORDER_STYLE}>
        <View style={settingsStyles.rowContent}>
          <Text style={settingsStyles.rowTitle}>{t("settings.updates.releaseChannel")}</Text>
          <Text style={settingsStyles.rowHint}>{t("settings.updates.releaseChannelHint")}</Text>
        </View>
        <SegmentedControl
          size="sm"
          value={settings.releaseChannel}
          onValueChange={handleReleaseChannelChange}
          options={releaseChannelOptions}
        />
      </View>
      <View style={ROW_WITH_BORDER_STYLE}>
        <View style={settingsStyles.rowContent}>
          <Text style={settingsStyles.rowTitle}>{t("settings.updates.appUpdates")}</Text>
          <Text style={settingsStyles.rowHint}>{statusText}</Text>
          {errorMessage ? <Text style={styles.aboutErrorText}>{errorMessage}</Text> : null}
        </View>
        <View style={styles.aboutUpdateActions}>
          <Button
            variant="outline"
            size="sm"
            onPress={handleCheckForUpdates}
            disabled={isChecking || isInstalling}
          >
            {isChecking ? t("settings.updates.checking") : t("settings.updates.check")}
          </Button>
          <Button
            variant="default"
            size="sm"
            onPress={handleInstallUpdate}
            disabled={isChecking || isInstalling || !availableUpdate}
          >
            {getUpdateButtonLabel(isInstalling, availableUpdate?.latestVersion, t)}
          </Button>
        </View>
      </View>
    </>
  );
}

function formatVersionLabel(version: string | null | undefined): string {
  const trimmed = version?.trim();
  if (!trimmed) {
    return "\u2014";
  }
  return trimmed.startsWith("v") ? trimmed : `v${trimmed}`;
}

function getGitHubReleaseStatusText({
  isChecking,
  result,
  errorMessage,
  t,
}: {
  isChecking: boolean;
  result: GitHubReleaseUpdateResult | null;
  errorMessage: string | null;
  t: TFunction;
}): string {
  if (isChecking) {
    return t("settings.updates.githubChecking");
  }
  if (errorMessage) {
    return t("settings.updates.githubFailed");
  }
  if (!result) {
    return t("settings.updates.githubNotChecked");
  }
  if (result.status === "available") {
    return t("settings.updates.githubAvailable", {
      version: formatVersionLabel(result.latestVersion),
    });
  }
  if (result.status === "up-to-date") {
    return t("settings.updates.githubUpToDate");
  }
  return t("settings.updates.githubLatest", {
    version: formatVersionLabel(result.latestVersion),
  });
}

function GitHubReleaseUpdateRow() {
  const { t } = useTranslation();
  const currentVersion = useMemo(() => resolveAppVersion(), []);
  const [result, setResult] = useState<GitHubReleaseUpdateResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  const runCheck = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!silent) {
        setIsChecking(true);
      }
      setErrorMessage(null);
      try {
        const nextResult = await checkGitHubReleaseUpdate({ currentVersion });
        setResult(nextResult);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!silent) {
          setErrorMessage(message);
        }
      } finally {
        if (!silent) {
          setIsChecking(false);
        }
      }
    },
    [currentVersion],
  );

  useFocusEffect(
    useCallback(() => {
      void runCheck({ silent: true });
      return undefined;
    }, [runCheck]),
  );

  const handleCheck = useCallback(() => {
    void runCheck();
  }, [runCheck]);

  const handleOpenRelease = useCallback(() => {
    const url = result?.releaseUrl;
    if (!url) {
      return;
    }
    void openExternalUrl(url);
  }, [result?.releaseUrl]);

  const handleDownloadApk = useCallback(() => {
    const url = result?.androidApkUrl ?? result?.releaseUrl;
    if (!url) {
      return;
    }
    void openExternalUrl(url);
  }, [result?.androidApkUrl, result?.releaseUrl]);

  const statusText = getGitHubReleaseStatusText({ isChecking, result, errorMessage, t });
  const canOpenRelease = Boolean(result?.releaseUrl);
  const canDownloadApk = Boolean(result?.androidApkUrl);

  return (
    <View style={settingsStyles.row}>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle}>{t("settings.updates.githubReleases")}</Text>
        <Text style={settingsStyles.rowHint}>{statusText}</Text>
        <Text style={settingsStyles.rowHint}>
          {t("settings.updates.githubCurrentVersion", {
            version: formatVersionLabel(currentVersion),
          })}
        </Text>
        {errorMessage ? <Text style={styles.aboutErrorText}>{errorMessage}</Text> : null}
      </View>
      <View style={styles.aboutUpdateActions}>
        <Button variant="outline" size="sm" onPress={handleCheck} disabled={isChecking}>
          {isChecking ? t("settings.updates.checking") : t("settings.updates.check")}
        </Button>
        {canDownloadApk ? (
          <Button variant="outline" size="sm" onPress={handleDownloadApk}>
            {t("settings.updates.downloadAndroidApk")}
          </Button>
        ) : null}
        <Button variant="default" size="sm" onPress={handleOpenRelease} disabled={!canOpenRelease}>
          {t("settings.updates.openRelease")}
        </Button>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

function useAnyOnlineHostServerId(serverIds: string[]): string | null {
  const runtime = getHostRuntimeStore();
  return useSyncExternalStore(
    (onStoreChange) => runtime.subscribeAll(onStoreChange),
    () => {
      let firstOnlineServerId: string | null = null;
      let firstOnlineAt: string | null = null;
      for (const serverId of serverIds) {
        const snapshot = runtime.getSnapshot(serverId);
        const lastOnlineAt = snapshot?.lastOnlineAt ?? null;
        if (!isHostRuntimeConnected(snapshot) || !lastOnlineAt) {
          continue;
        }
        if (!firstOnlineAt || lastOnlineAt < firstOnlineAt) {
          firstOnlineAt = lastOnlineAt;
          firstOnlineServerId = serverId;
        }
      }
      return firstOnlineServerId;
    },
    () => null,
  );
}

interface SidebarSectionButtonProps {
  itemId: SettingsSectionSlug;
  label: string;
  icon: ComponentType<{ size: number; color: string }>;
  isSelected: boolean;
  onSelect: (section: SettingsSectionSlug) => void;
}

function SidebarSectionButton({
  itemId,
  label,
  icon: IconComponent,
  isSelected,
  onSelect,
}: SidebarSectionButtonProps) {
  const { theme } = useUnistyles();
  const handlePress = useCallback(() => {
    onSelect(itemId);
  }, [onSelect, itemId]);
  const accessibilityState = useMemo(() => ({ selected: isSelected }), [isSelected]);
  const labelStyle = useMemo(
    () => [sidebarStyles.label, isSelected && { color: theme.colors.foreground }],
    [isSelected, theme.colors.foreground],
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      onPress={handlePress}
      style={isSelected ? selectedSidebarItemStyle : sidebarItemStyle}
    >
      <IconComponent
        size={theme.iconSize.md}
        color={isSelected ? theme.colors.foreground : theme.colors.foregroundMuted}
      />
      <Text style={labelStyle} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

interface SidebarProjectsButtonProps {
  isSelected: boolean;
  onSelect: () => void;
}

function SidebarProjectsButton({ isSelected, onSelect }: SidebarProjectsButtonProps) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const accessibilityState = useMemo(() => ({ selected: isSelected }), [isSelected]);
  const labelStyle = useMemo(
    () => [sidebarStyles.label, isSelected && { color: theme.colors.foreground }],
    [isSelected, theme.colors.foreground],
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      onPress={onSelect}
      testID="settings-projects"
      style={isSelected ? selectedSidebarItemStyle : sidebarItemStyle}
    >
      <FolderGit2
        size={theme.iconSize.md}
        color={isSelected ? theme.colors.foreground : theme.colors.foregroundMuted}
      />
      <Text style={labelStyle} numberOfLines={1}>
        {t("settings.projects")}
      </Text>
    </Pressable>
  );
}

interface SidebarHostItemProps {
  serverId: string;
  label: string;
  isSelected: boolean;
  isLocal: boolean;
  onSelect: (serverId: string) => void;
}

function SidebarHostItem({ serverId, label, isSelected, isLocal, onSelect }: SidebarHostItemProps) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const handlePress = useCallback(() => {
    onSelect(serverId);
  }, [onSelect, serverId]);
  const accessibilityState = useMemo(() => ({ selected: isSelected }), [isSelected]);
  const labelStyle = useMemo(
    () => [sidebarStyles.label, isSelected && { color: theme.colors.foreground }],
    [isSelected, theme.colors.foreground],
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      onPress={handlePress}
      testID={`settings-host-entry-${serverId}`}
      style={isSelected ? selectedSidebarItemStyle : sidebarItemStyle}
    >
      <Server
        size={theme.iconSize.md}
        color={isSelected ? theme.colors.foreground : theme.colors.foregroundMuted}
      />
      <Text style={labelStyle} numberOfLines={1}>
        {label}
      </Text>
      {isLocal ? (
        <Text style={sidebarStyles.localMarker} testID="settings-host-local-marker">
          {t("settings.local")}
        </Text>
      ) : null}
    </Pressable>
  );
}

interface SettingsSidebarProps {
  view: SettingsView;
  onSelectSection: (section: SettingsSectionSlug) => void;
  onSelectHost: (serverId: string) => void;
  onSelectProjects: () => void;
  onAddHost: () => void;
  onBackToWorkspace: () => void;
  layout: "desktop" | "mobile";
}

function SettingsSidebar({
  view,
  onSelectSection,
  onSelectHost,
  onSelectProjects,
  onAddHost,
  onBackToWorkspace,
  layout,
}: SettingsSidebarProps) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const hosts = useHosts();
  const localServerId = useLocalDaemonServerId();
  const sortedHosts = useMemo(() => {
    if (!localServerId) {
      return hosts;
    }
    const localIndex = hosts.findIndex((host) => host.serverId === localServerId);
    if (localIndex <= 0) {
      return hosts;
    }
    const next = hosts.slice();
    const [local] = next.splice(localIndex, 1);
    next.unshift(local);
    return next;
  }, [hosts, localServerId]);
  const isDesktopApp = isElectronRuntime();
  const items = SIDEBAR_SECTION_ITEMS.filter((item) => !item.desktopOnly || isDesktopApp);
  const insets = useSafeAreaInsets();
  const padding = useWindowControlsPadding("sidebar");
  const isDesktop = layout === "desktop";
  const containerStyle = useMemo(
    () => [
      isDesktop ? sidebarStyles.desktopContainer : sidebarStyles.mobileContainer,
      isDesktop ? { paddingTop: insets.top } : null,
    ],
    [insets.top, isDesktop],
  );
  const selectedSectionId = view.kind === "section" ? view.section : null;
  const selectedServerId = view.kind === "host" ? view.serverId : null;
  const isProjectsSelected = view.kind === "projects" || view.kind === "project";
  const paddingTopStyle = useMemo(() => ({ height: padding.top }), [padding.top]);

  return (
    <View style={containerStyle} testID="settings-sidebar">
      {isDesktop ? (
        <>
          <TitlebarDragRegion />
          {padding.top > 0 ? <View style={paddingTopStyle} /> : null}
        </>
      ) : null}
      {isDesktop ? (
        <SidebarHeaderRow
          icon={ArrowLeft}
          label={t("settings.back")}
          onPress={onBackToWorkspace}
          testID="settings-back-to-workspace"
        />
      ) : null}
      <View style={sidebarStyles.list}>
        {items.map((item) => (
          <Fragment key={item.id}>
            <SidebarSectionButton
              itemId={item.id}
              label={t(item.labelKey)}
              icon={item.icon}
              isSelected={selectedSectionId === item.id}
              onSelect={onSelectSection}
            />
            {item.id === "general" ? (
              <SidebarProjectsButton isSelected={isProjectsSelected} onSelect={onSelectProjects} />
            ) : null}
          </Fragment>
        ))}
      </View>
      <SidebarSeparator />
      <View style={sidebarStyles.list}>
        {sortedHosts.map((host) => (
          <SidebarHostItem
            key={host.serverId}
            serverId={host.serverId}
            label={host.label}
            isSelected={selectedServerId === host.serverId}
            isLocal={localServerId !== null && host.serverId === localServerId}
            onSelect={onSelectHost}
          />
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("settings.addHost")}
          onPress={onAddHost}
          testID="settings-add-host"
          style={sidebarItemStyle}
        >
          <Plus size={theme.iconSize.md} color={theme.colors.foregroundMuted} />
          <Text style={sidebarStyles.label} numberOfLines={1}>
            {t("settings.addHost")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export interface SettingsScreenProps {
  view: SettingsView;
}

export default function SettingsScreen({ view }: SettingsScreenProps) {
  const router = useRouter();
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const voiceAudioEngine = useVoiceAudioEngineOptional();
  const { settings, isLoading: settingsLoading, updateSettings } = useSettings();
  const [isAddHostMethodVisible, setIsAddHostMethodVisible] = useState(false);
  const [isDirectHostVisible, setIsDirectHostVisible] = useState(false);
  const [isPasteLinkVisible, setIsPasteLinkVisible] = useState(false);
  const [isPlaybackTestRunning, setIsPlaybackTestRunning] = useState(false);
  const [playbackTestResult, setPlaybackTestResult] = useState<string | null>(null);
  const isDesktopApp = isElectronRuntime();
  const isCompactLayout = useIsCompactFormFactor();
  const insets = useSafeAreaInsets();
  const insetBottomStyle = useMemo(() => ({ paddingBottom: insets.bottom }), [insets.bottom]);
  const webScrollbarStyle = useWebScrollbarStyle();
  const scrollViewStyle = useMemo(
    () => [styles.scrollView, webScrollbarStyle],
    [webScrollbarStyle],
  );
  const hosts = useHosts();
  const localServerId = useLocalDaemonServerId();
  const hostServerIds = useMemo(() => hosts.map((host) => host.serverId), [hosts]);
  const anyOnlineServerId = useAnyOnlineHostServerId(hostServerIds);

  const handleThemeChange = useCallback(
    (nextTheme: AppSettings["theme"]) => {
      void updateSettings({ theme: nextTheme });
    },
    [updateSettings],
  );

  const handleLanguageChange = useCallback(
    (language: AppLanguage) => {
      void updateSettings({ language });
    },
    [updateSettings],
  );

  const handleSendBehaviorChange = useCallback(
    (behavior: SendBehavior) => {
      void updateSettings({ sendBehavior: behavior });
    },
    [updateSettings],
  );

  const handleServiceUrlBehaviorChange = useCallback(
    (behavior: ServiceUrlBehavior) => {
      void updateSettings({ serviceUrlBehavior: behavior });
    },
    [updateSettings],
  );

  const handleTerminalScrollbackLinesChange = useCallback(
    (terminalScrollbackLines: number) => {
      void updateSettings({ terminalScrollbackLines });
    },
    [updateSettings],
  );

  const handlePlaybackTest = useCallback(async () => {
    if (!voiceAudioEngine || isPlaybackTestRunning) {
      return;
    }

    setIsPlaybackTestRunning(true);
    setPlaybackTestResult(null);

    try {
      const bytes = Buffer.from(THINKING_TONE_NATIVE_PCM_BASE64, "base64");
      await voiceAudioEngine.initialize();
      voiceAudioEngine.stop();
      await voiceAudioEngine.play({
        type: "audio/pcm;rate=16000;bits=16",
        size: bytes.byteLength,
        async arrayBuffer() {
          return Uint8Array.from(bytes).buffer;
        },
      });
      setPlaybackTestResult(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[Settings] Playback test failed", error);
      setPlaybackTestResult(t("settings.diagnostics.playbackFailed", { message }));
    } finally {
      setIsPlaybackTestRunning(false);
    }
  }, [isPlaybackTestRunning, t, voiceAudioEngine]);

  const closeAddConnectionFlow = useCallback(() => {
    setIsAddHostMethodVisible(false);
    setIsDirectHostVisible(false);
    setIsPasteLinkVisible(false);
  }, []);

  const goBackToAddConnectionMethods = useCallback(() => {
    setIsDirectHostVisible(false);
    setIsPasteLinkVisible(false);
    setIsAddHostMethodVisible(true);
  }, []);

  const handleAddHost = useCallback(() => {
    setIsAddHostMethodVisible(true);
  }, []);

  const handleSelectDirectConnection = useCallback(() => {
    setIsAddHostMethodVisible(false);
    setIsDirectHostVisible(true);
  }, []);

  const handleSelectPasteLink = useCallback(() => {
    setIsAddHostMethodVisible(false);
    setIsPasteLinkVisible(true);
  }, []);

  const handleHostAdded = useCallback(
    ({ serverId }: { serverId: string }) => {
      const target = buildSettingsHostRoute(serverId);
      if (isCompactLayout) {
        router.push(target);
      } else {
        router.replace(target);
      }
    },
    [isCompactLayout, router],
  );

  const handleSelectSection = useCallback(
    (section: SettingsSectionSlug) => {
      const target = buildSettingsSectionRoute(section);
      if (isCompactLayout) {
        router.push(target);
      } else {
        router.replace(target);
      }
    },
    [isCompactLayout, router],
  );

  const handleSelectHost = useCallback(
    (serverId: string) => {
      const target = buildSettingsHostRoute(serverId);
      if (isCompactLayout) {
        router.push(target);
      } else {
        router.replace(target);
      }
    },
    [isCompactLayout, router],
  );

  const handleSelectProjects = useCallback(() => {
    const target = buildProjectsSettingsRoute();
    if (isCompactLayout) {
      router.push(target);
    } else {
      router.replace(target);
    }
  }, [isCompactLayout, router]);

  const handleScanQr = useCallback(() => {
    closeAddConnectionFlow();
    router.push({
      pathname: "/pair-scan",
      params: { source: "settings" },
    });
  }, [closeAddConnectionFlow, router]);

  const handleHostRemoved = useCallback(() => {
    const fallback = buildSettingsSectionRoute("general");
    if (isCompactLayout) {
      router.replace("/settings");
    } else {
      router.replace(fallback);
    }
  }, [isCompactLayout, router]);

  const handleBackToRoot = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/settings");
    }
  }, [router]);

  const handleBackToWorkspace = useCallback(() => {
    if (navigateToLastWorkspace()) {
      return;
    }
    if (anyOnlineServerId) {
      router.replace(buildHostOpenProjectRoute(anyOnlineServerId));
      return;
    }
    router.replace("/");
  }, [anyOnlineServerId, router]);

  const detailHeader = ((): {
    title: string;
    Icon: ComponentType<{ size: number; color: string }>;
    titleAccessory?: ReactNode;
  } | null => {
    if (view.kind === "host") {
      const host = hosts.find((h) => h.serverId === view.serverId);
      if (!host) return null;
      return {
        title: host.label,
        Icon: Server,
        titleAccessory: <HostRenameButton host={host} />,
      };
    }
    if (view.kind === "section") {
      const item = SIDEBAR_SECTION_ITEMS.find((s) => s.id === view.section);
      if (!item) return null;
      return { title: t(item.labelKey), Icon: item.icon };
    }
    if (view.kind === "project" || view.kind === "projects") {
      return { title: t("settings.projects"), Icon: FolderGit2 };
    }
    return null;
  })();

  const content = (() => {
    if (view.kind === "host") {
      return <HostPage serverId={view.serverId} onHostRemoved={handleHostRemoved} />;
    }
    if (view.kind === "projects") {
      return <ProjectsScreen view={view} />;
    }
    if (view.kind === "project") {
      return <ProjectSettingsScreen projectKey={view.projectKey} />;
    }
    if (view.kind === "section") {
      switch (view.section) {
        case "general":
          return (
            <GeneralSection
              settings={settings}
              isDesktopApp={isDesktopApp}
              handleThemeChange={handleThemeChange}
              handleLanguageChange={handleLanguageChange}
              handleSendBehaviorChange={handleSendBehaviorChange}
              handleServiceUrlBehaviorChange={handleServiceUrlBehaviorChange}
              handleTerminalScrollbackLinesChange={handleTerminalScrollbackLinesChange}
            />
          );
        case "shortcuts":
          return isDesktopApp ? <KeyboardShortcutsSection /> : null;
        case "models":
          return anyOnlineServerId ? (
            <>
              <CustomModelProvidersSection serverId={localServerId ?? anyOnlineServerId} />
              <SyntheticModelsSection serverId={localServerId ?? anyOnlineServerId} />
            </>
          ) : (
            <View style={styles.placeholder}>
              <Text style={styles.placeholderText}>{t("settings.models.noHost")}</Text>
            </View>
          );
        case "integrations":
          return isDesktopApp ? <IntegrationsSection /> : null;
        case "permissions":
          return isDesktopApp ? <DesktopPermissionsSection /> : null;
        case "diagnostics":
          return (
            <DiagnosticsSection
              voiceAudioEngine={voiceAudioEngine}
              isPlaybackTestRunning={isPlaybackTestRunning}
              playbackTestResult={playbackTestResult}
              handlePlaybackTest={handlePlaybackTest}
            />
          );
        case "about":
          return <AboutSection isDesktopApp={isDesktopApp} />;
      }
    }
    return null;
  })();

  if (settingsLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>{t("settings.loading")}</Text>
      </View>
    );
  }

  const addHostModals = (
    <>
      <AddHostMethodModal
        visible={isAddHostMethodVisible}
        onClose={closeAddConnectionFlow}
        onDirectConnection={handleSelectDirectConnection}
        onPasteLink={handleSelectPasteLink}
        onScanQr={handleScanQr}
      />
      <AddHostModal
        visible={isDirectHostVisible}
        onClose={closeAddConnectionFlow}
        onCancel={goBackToAddConnectionMethods}
        onSaved={handleHostAdded}
      />
      <PairLinkModal
        visible={isPasteLinkVisible}
        onClose={closeAddConnectionFlow}
        onCancel={goBackToAddConnectionMethods}
        onSaved={handleHostAdded}
      />
    </>
  );

  // Mobile root: full-screen sidebar-as-list.
  if (isCompactLayout && view.kind === "root") {
    return (
      <View style={styles.container}>
        <BackHeader title={t("settings.title")} onBack={handleBackToWorkspace} />
        <ScrollView style={scrollViewStyle} contentContainerStyle={insetBottomStyle}>
          <SettingsSidebar
            view={view}
            onSelectSection={handleSelectSection}
            onSelectHost={handleSelectHost}
            onSelectProjects={handleSelectProjects}
            onAddHost={handleAddHost}
            onBackToWorkspace={handleBackToWorkspace}
            layout="mobile"
          />
        </ScrollView>
        {addHostModals}
      </View>
    );
  }

  // Mobile detail: full-screen content with a back header. Project detail uses
  // an app-level back (out of settings, to the workspace) since the in-body
  // "Back to projects" ghost button handles list-level back; other detail views
  // step back to the settings root.
  const detailBackHandler = view.kind === "project" ? handleBackToWorkspace : handleBackToRoot;
  if (isCompactLayout) {
    return (
      <View style={styles.container}>
        <BackHeader
          title={detailHeader?.title}
          titleAccessory={detailHeader?.titleAccessory}
          onBack={detailBackHandler}
        />
        <ScrollView style={scrollViewStyle} contentContainerStyle={insetBottomStyle}>
          <View style={styles.content}>{content}</View>
        </ScrollView>
        {addHostModals}
      </View>
    );
  }

  // Desktop split view — mirrors AppContainer: sidebar owns the titlebar drag
  // region + traffic-light padding; detail pane renders whatever header the
  // selected section provides.
  return (
    <View style={styles.container}>
      <View style={desktopStyles.row}>
        <SettingsSidebar
          view={view}
          onSelectSection={handleSelectSection}
          onSelectHost={handleSelectHost}
          onSelectProjects={handleSelectProjects}
          onAddHost={handleAddHost}
          onBackToWorkspace={handleBackToWorkspace}
          layout="desktop"
        />
        <View style={desktopStyles.contentPane}>
          <ScreenHeader
            borderless={!detailHeader}
            windowControlsPaddingRole="detailHeader"
            left={
              detailHeader ? (
                <>
                  <HeaderIconBadge>
                    <detailHeader.Icon
                      size={theme.iconSize.md}
                      color={theme.colors.foregroundMuted}
                    />
                  </HeaderIconBadge>
                  <ScreenTitle testID="settings-detail-header-title">
                    {detailHeader.title}
                  </ScreenTitle>
                  {detailHeader.titleAccessory}
                </>
              ) : null
            }
            leftStyle={desktopStyles.detailLeft}
          />
          <ScrollView style={scrollViewStyle} contentContainerStyle={insetBottomStyle}>
            <View style={styles.content}>{content}</View>
          </ScrollView>
        </View>
      </View>
      {addHostModals}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create((theme) => ({
  loadingContainer: {
    flex: 1,
    backgroundColor: theme.colors.surface0,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.lg,
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.surface0,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: theme.spacing[4],
    paddingTop: theme.spacing[6],
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
  },
  aboutValue: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  aboutVersionMismatch: {
    color: theme.colors.palette.amber[500],
  },
  aboutErrorText: {
    color: theme.colors.palette.red[300],
    fontSize: theme.fontSize.xs,
    marginTop: theme.spacing[1],
  },
  aboutUpdateActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  themeTrigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    minHeight: 36,
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderAccent,
    backgroundColor: theme.colors.surface2,
  },
  themeTriggerText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  terminalScrollbackInput: {
    width: 112,
    minHeight: 36,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderAccent,
    backgroundColor: theme.colors.surface0,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    textAlign: "right",
  },
  placeholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.spacing[8],
  },
  placeholderText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
}));

const desktopStyles = StyleSheet.create((theme) => ({
  row: {
    flex: 1,
    flexDirection: "row",
  },
  contentPane: {
    flex: 1,
  },
  detailLeft: {
    gap: theme.spacing[2],
  },
}));

const sidebarStyles = StyleSheet.create((theme) => ({
  desktopContainer: {
    width: 320,
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
  },
  mobileContainer: {
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
  },
  list: {
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
    gap: theme.spacing[1],
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    minHeight: 36,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: "transparent",
  },
  itemHovered: {
    backgroundColor: theme.colors.surface1,
  },
  itemSelected: {
    backgroundColor: theme.colors.surface0,
    borderColor: theme.colors.borderAccent,
    ...theme.shadow.sm,
  },
  label: {
    fontSize: theme.fontSize.base,
    color: theme.colors.foregroundMuted,
    fontWeight: theme.fontWeight.normal,
    flex: 1,
  },
  localMarker: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundMuted,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface3,
  },
}));
