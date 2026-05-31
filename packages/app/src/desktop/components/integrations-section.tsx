import { useCallback, useMemo } from "react";
import { Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { ArrowUpRight, Terminal, Blocks, Check } from "lucide-react-native";
import { settingsStyles } from "@/styles/settings";
import { SettingsSection } from "@/screens/settings/settings-section";
import { Button } from "@/components/ui/button";
import { openExternalUrl } from "@/utils/open-external-url";
import { confirmDialog } from "@/utils/confirm-dialog";
import {
  shouldUseDesktopDaemon,
  type SkillOp,
  type SkillsStatus,
} from "@/desktop/daemon/desktop-daemon";
import { useCliInstall, useSkillsStatus } from "@/desktop/hooks/use-install-status";
import { useTranslation } from "react-i18next";

const CLI_DOCS_URL = "https://chisacode.sh/docs/cli";
const SKILLS_DOCS_URL = "https://chisacode.sh/docs/skills";
const ROW_WITH_BORDER_STYLE = [settingsStyles.row, settingsStyles.rowBorder];

const OP_KIND_ORDER: Record<SkillOp["kind"], number> = { add: 0, update: 1, delete: 2 };

function formatUpdateMessage(
  ops: readonly SkillOp[],
  labels: Record<SkillOp["kind"], string>,
): string {
  const sorted = [...ops].sort((a, b) => {
    const kindOrder = OP_KIND_ORDER[a.kind] - OP_KIND_ORDER[b.kind];
    return kindOrder !== 0 ? kindOrder : a.name.localeCompare(b.name);
  });
  return sorted.map((op) => `${labels[op.kind]} ${op.name}`).join("\n");
}

export function IntegrationsSection() {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const showSection = shouldUseDesktopDaemon();
  const {
    status: cliStatus,
    isInstalling: isInstallingCli,
    install: installCli,
    refresh: refreshCliStatus,
  } = useCliInstall();
  const {
    status: skillsStatus,
    isWorking: isSkillsWorking,
    install: installSkills,
    update: updateSkills,
    uninstall: uninstallSkills,
    refresh: refreshSkillsStatus,
  } = useSkillsStatus();

  useFocusEffect(
    useCallback(() => {
      if (!showSection) return undefined;
      refreshCliStatus();
      void refreshSkillsStatus();
      return undefined;
    }, [refreshCliStatus, refreshSkillsStatus, showSection]),
  );

  const handleInstallCli = useCallback(() => {
    if (isInstallingCli) return;
    installCli();
  }, [installCli, isInstallingCli]);

  const handleInstallSkills = useCallback(() => {
    if (isSkillsWorking) return;
    void installSkills();
  }, [installSkills, isSkillsWorking]);

  const handleUpdateSkills = useCallback(async () => {
    if (isSkillsWorking) return;
    const ops = skillsStatus?.ops ?? [];
    const confirmed = await confirmDialog({
      title: t("settings.integrations.updateSkillsTitle"),
      message:
        ops.length > 0
          ? formatUpdateMessage(ops, {
              add: t("settings.integrations.opAdd"),
              update: t("settings.integrations.opUpdate"),
              delete: t("settings.integrations.opDelete"),
            })
          : t("settings.integrations.syncBundledSkills"),
      confirmLabel: t("settings.integrations.update"),
    });
    if (!confirmed) return;
    await updateSkills();
  }, [isSkillsWorking, skillsStatus, updateSkills, t]);

  const handleUninstallSkills = useCallback(async () => {
    if (isSkillsWorking) return;
    const confirmed = await confirmDialog({
      title: t("settings.integrations.uninstallSkillsTitle"),
      message: t("settings.integrations.uninstallSkillsMessage"),
      confirmLabel: t("settings.integrations.uninstall"),
      destructive: true,
    });
    if (!confirmed) return;
    await uninstallSkills();
  }, [isSkillsWorking, uninstallSkills, t]);

  const handleOpenCliDocs = useCallback(() => {
    void openExternalUrl(CLI_DOCS_URL);
  }, []);

  const handleOpenSkillsDocs = useCallback(() => {
    void openExternalUrl(SKILLS_DOCS_URL);
  }, []);

  const arrowIcon = useMemo(
    () => <ArrowUpRight size={theme.iconSize.sm} color={theme.colors.foregroundMuted} />,
    [theme.iconSize.sm, theme.colors.foregroundMuted],
  );

  const trailing = useMemo(
    () => (
      <View style={styles.headerLinks}>
        <Button
          variant="ghost"
          size="sm"
          leftIcon={arrowIcon}
          textStyle={settingsStyles.sectionHeaderLinkText}
          style={settingsStyles.sectionHeaderLink}
          onPress={handleOpenCliDocs}
          accessibilityLabel={t("settings.integrations.openCliDocs")}
        >
          {t("settings.integrations.cliDocs")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          leftIcon={arrowIcon}
          textStyle={settingsStyles.sectionHeaderLinkText}
          style={settingsStyles.sectionHeaderLink}
          onPress={handleOpenSkillsDocs}
          accessibilityLabel={t("settings.integrations.openSkillsDocs")}
        >
          {t("settings.integrations.skillsDocs")}
        </Button>
      </View>
    ),
    [arrowIcon, handleOpenCliDocs, handleOpenSkillsDocs, t],
  );

  if (!showSection) {
    return null;
  }

  const skillsState = skillsStatus?.state ?? null;

  return (
    <SettingsSection title={t("settings.integrations.title")} trailing={trailing}>
      <View style={settingsStyles.card}>
        <View style={settingsStyles.row}>
          <View style={settingsStyles.rowContent}>
            <View style={styles.rowTitleRow}>
              <Terminal size={theme.iconSize.md} color={theme.colors.foreground} />
              <Text style={settingsStyles.rowTitle}>{t("settings.integrations.commandLine")}</Text>
            </View>
            <Text style={settingsStyles.rowHint}>{t("settings.integrations.commandLineHint")}</Text>
          </View>
          {cliStatus?.installed ? (
            <View style={styles.installedLabel}>
              <Check size={14} color={theme.colors.foregroundMuted} />
              <Text style={styles.mutedText}>{t("settings.integrations.installed")}</Text>
            </View>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onPress={handleInstallCli}
              disabled={isInstallingCli}
            >
              {isInstallingCli
                ? t("settings.integrations.installing")
                : t("settings.integrations.install")}
            </Button>
          )}
        </View>
        <View style={ROW_WITH_BORDER_STYLE}>
          <View style={settingsStyles.rowContent}>
            <View style={styles.rowTitleRow}>
              <Blocks size={theme.iconSize.md} color={theme.colors.foreground} />
              <Text style={settingsStyles.rowTitle}>
                {t("settings.integrations.orchestrationSkills")}
              </Text>
            </View>
            <Text style={settingsStyles.rowHint}>
              {skillsState === "drift"
                ? t("settings.integrations.skillsDriftHint")
                : t("settings.integrations.skillsUpToDateHint")}
            </Text>
          </View>
          <SkillsActions
            state={skillsState}
            isWorking={isSkillsWorking}
            onInstall={handleInstallSkills}
            onUpdate={handleUpdateSkills}
            onUninstall={handleUninstallSkills}
          />
        </View>
      </View>
    </SettingsSection>
  );
}

interface SkillsActionsProps {
  state: SkillsStatus["state"] | null;
  isWorking: boolean;
  onInstall: () => void;
  onUpdate: () => void;
  onUninstall: () => void;
}

function SkillsActions({ state, isWorking, onInstall, onUpdate, onUninstall }: SkillsActionsProps) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();

  if (state === "up-to-date") {
    return (
      <View style={styles.actionsRow}>
        <View style={styles.installedLabel}>
          <Check size={14} color={theme.colors.foregroundMuted} />
          <Text style={styles.mutedText}>{t("settings.integrations.installed")}</Text>
        </View>
        <Button variant="outline" size="sm" onPress={onUninstall} disabled={isWorking}>
          {t("settings.integrations.uninstall")}
        </Button>
      </View>
    );
  }

  if (state === "drift") {
    return (
      <View style={styles.actionsRow}>
        <Button variant="outline" size="sm" onPress={onUpdate} disabled={isWorking}>
          {isWorking ? t("settings.integrations.updating") : t("settings.integrations.update")}
        </Button>
        <Button variant="outline" size="sm" onPress={onUninstall} disabled={isWorking}>
          {t("settings.integrations.uninstall")}
        </Button>
      </View>
    );
  }

  return (
    <Button variant="outline" size="sm" onPress={onInstall} disabled={isWorking}>
      {isWorking ? t("settings.integrations.installing") : t("settings.integrations.install")}
    </Button>
  );
}

const styles = StyleSheet.create((theme) => ({
  headerLinks: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[0],
  },
  rowTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  installedLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  mutedText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
}));
