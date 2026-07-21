import { useCallback, useMemo } from "react";
import { type PressableStateCallbackType } from "react-native";
import { Archive, Copy, MoreVertical, Pencil, Settings, Trash2 } from "lucide-react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Shortcut } from "@/components/ui/shortcut";
import { isWeb } from "@/constants/platform";
import type { Theme } from "@/styles/theme";
import { buildProjectSettingsRoute } from "@/utils/host-routes";
import type { ShortcutKey } from "@/utils/format-shortcut";

const ThemedMoreVertical = withUnistyles(MoreVertical);
const ThemedTrash2 = withUnistyles(Trash2);
const ThemedSettings = withUnistyles(Settings);
const ThemedCopy = withUnistyles(Copy);
const ThemedArchive = withUnistyles(Archive);
const ThemedPencil = withUnistyles(Pencil);

const foregroundColorMapping = (theme: Theme) => ({ color: theme.colors.foreground });
const foregroundMutedColorMapping = (theme: Theme) => ({
  color: theme.colors.foregroundMuted,
});

const trash2LeadingIcon = <ThemedTrash2 size={14} uniProps={foregroundMutedColorMapping} />;
const settingsLeadingIcon = <ThemedSettings size={14} uniProps={foregroundMutedColorMapping} />;
const copyLeadingIcon = <ThemedCopy size={14} uniProps={foregroundMutedColorMapping} />;
const archiveLeadingIcon = <ThemedArchive size={14} uniProps={foregroundMutedColorMapping} />;
const renameLeadingIcon = <ThemedPencil size={14} uniProps={foregroundMutedColorMapping} />;

function renderKebabTriggerIcon({ hovered }: { hovered?: boolean }) {
  return (
    <ThemedMoreVertical
      size={14}
      uniProps={hovered ? foregroundColorMapping : foregroundMutedColorMapping}
    />
  );
}

function projectKebabStyle({
  hovered = false,
}: PressableStateCallbackType & { hovered?: boolean }) {
  return [styles.projectKebabButton, hovered && styles.projectKebabButtonHovered];
}

function workspaceKebabStyle({
  hovered = false,
}: PressableStateCallbackType & { hovered?: boolean }) {
  return [styles.workspaceKebabButton, hovered && styles.workspaceKebabButtonHovered];
}

/** Renders project settings and removal actions for a sidebar project row. */
export function ProjectKebabMenu({
  projectKey,
  onRemoveProject,
  removeProjectStatus,
}: {
  projectKey: string;
  onRemoveProject: () => void;
  removeProjectStatus: "idle" | "pending" | "success";
}) {
  const { t } = useTranslation();
  const handleOpenProjectSettings = useCallback(() => {
    if (projectKey.trim().length === 0) return;
    router.navigate(buildProjectSettingsRoute(projectKey));
  }, [projectKey]);
  const canOpenProjectSettings = projectKey.trim().length > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        hitSlop={8}
        style={projectKebabStyle}
        accessibilityRole={isWeb ? undefined : "button"}
        accessibilityLabel={t("sidebar.projectActions")}
        testID={`sidebar-project-kebab-${projectKey}`}
      >
        {renderKebabTriggerIcon}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" width={220}>
        {canOpenProjectSettings ? (
          <DropdownMenuItem
            testID={`sidebar-project-menu-open-settings-${projectKey}`}
            leading={settingsLeadingIcon}
            onSelect={handleOpenProjectSettings}
          >
            {t("sidebar.openProjectSettings")}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          testID={`sidebar-project-menu-remove-${projectKey}`}
          leading={trash2LeadingIcon}
          status={removeProjectStatus}
          pendingLabel={t("sidebar.removing")}
          onSelect={onRemoveProject}
        >
          {t("sidebar.removeProject")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Renders copy, rename, and archive actions for a sidebar workspace row. */
export function WorkspaceKebabMenu({
  workspaceKey,
  onCopyPath,
  onCopyBranchName,
  onRename,
  onArchive,
  archiveLabel,
  archiveStatus,
  archivePendingLabel,
  archiveShortcutKeys,
}: {
  workspaceKey: string;
  onCopyPath?: () => void;
  onCopyBranchName?: () => void;
  onRename?: () => void;
  onArchive: () => void;
  archiveLabel?: string;
  archiveStatus?: "idle" | "pending" | "success";
  archivePendingLabel?: string;
  archiveShortcutKeys?: ShortcutKey[][] | null;
}) {
  const { t } = useTranslation();
  const archiveTrailing = useMemo(
    () => (archiveShortcutKeys ? <Shortcut chord={archiveShortcutKeys} /> : null),
    [archiveShortcutKeys],
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        hitSlop={8}
        style={workspaceKebabStyle}
        accessibilityRole={isWeb ? undefined : "button"}
        accessibilityLabel={t("sidebar.workspaceActions")}
        testID={`sidebar-workspace-kebab-${workspaceKey}`}
      >
        {renderKebabTriggerIcon}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" width={260}>
        {onCopyPath ? (
          <DropdownMenuItem
            testID={`sidebar-workspace-menu-copy-path-${workspaceKey}`}
            leading={copyLeadingIcon}
            onSelect={onCopyPath}
          >
            {t("sidebar.copyPath")}
          </DropdownMenuItem>
        ) : null}
        {onCopyBranchName ? (
          <DropdownMenuItem
            testID={`sidebar-workspace-menu-copy-branch-name-${workspaceKey}`}
            leading={copyLeadingIcon}
            onSelect={onCopyBranchName}
          >
            {t("sidebar.copyBranchName")}
          </DropdownMenuItem>
        ) : null}
        {onRename ? (
          <DropdownMenuItem
            testID={`sidebar-workspace-menu-rename-${workspaceKey}`}
            leading={renameLeadingIcon}
            onSelect={onRename}
          >
            {t("sidebar.renameWorkspace")}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          testID={`sidebar-workspace-menu-archive-${workspaceKey}`}
          leading={archiveLeadingIcon}
          trailing={archiveTrailing}
          status={archiveStatus}
          pendingLabel={archivePendingLabel}
          onSelect={onArchive}
        >
          {archiveLabel ?? t("sidebar.archive")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const styles = StyleSheet.create((theme) => ({
  projectKebabButton: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  projectKebabButtonHovered: {
    backgroundColor: theme.colors.surface1,
  },
  workspaceKebabButton: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    marginLeft: 2,
  },
  workspaceKebabButtonHovered: {
    backgroundColor: theme.colors.surface1,
  },
}));
