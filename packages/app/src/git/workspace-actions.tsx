import { withUnistyles } from "react-native-unistyles";
import {
  Archive,
  ArrowDownUp,
  Download,
  GitCommitHorizontal,
  GitMerge,
  RefreshCcw,
  Upload,
} from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { GitHubIcon } from "@/components/icons/github-icon";
import { GitActionsSplitButton } from "@/git/actions-split-button";
import { useGitActions } from "@/git/use-actions";
import type { GitActions } from "@/git/policy";
import type { Theme } from "@/styles/theme";

interface WorkspaceGitActionsProps {
  serverId: string;
  cwd: string;
  hideLabels?: boolean;
  /**
   * When the workspace header is still resolving checkout identity, keep the Git
   * chip mounted in a loading state so Open/Git geometry never collapses.
   */
  forceLoading?: boolean;
}

const ThemedGitCommitHorizontal = withUnistyles(GitCommitHorizontal);
const ThemedDownload = withUnistyles(Download);
const ThemedUpload = withUnistyles(Upload);
const ThemedArrowDownUp = withUnistyles(ArrowDownUp);
const ThemedGitHubIcon = withUnistyles(GitHubIcon);
const ThemedGitMerge = withUnistyles(GitMerge);
const ThemedRefreshCcw = withUnistyles(RefreshCcw);
const ThemedArchive = withUnistyles(Archive);

const mutedColorMapping = (theme: Theme) => ({
  color: theme.colors.foregroundMuted,
});

const ICONS = {
  commit: <ThemedGitCommitHorizontal size={16} uniProps={mutedColorMapping} />,
  pull: <ThemedDownload size={16} uniProps={mutedColorMapping} />,
  push: <ThemedUpload size={16} uniProps={mutedColorMapping} />,
  pullAndPush: <ThemedArrowDownUp size={16} uniProps={mutedColorMapping} />,
  viewPr: <ThemedGitHubIcon size={16} uniProps={mutedColorMapping} />,
  createPr: <ThemedGitHubIcon size={16} uniProps={mutedColorMapping} />,
  mergePrSquash: <ThemedGitHubIcon size={16} uniProps={mutedColorMapping} />,
  mergePrMerge: <ThemedGitHubIcon size={16} uniProps={mutedColorMapping} />,
  mergePrRebase: <ThemedGitHubIcon size={16} uniProps={mutedColorMapping} />,
  merge: <ThemedGitMerge size={16} uniProps={mutedColorMapping} />,
  mergeFromBase: <ThemedRefreshCcw size={16} uniProps={mutedColorMapping} />,
  archive: <ThemedArchive size={16} uniProps={mutedColorMapping} />,
};

const EMPTY_GIT_ACTIONS: GitActions = {
  primary: null,
  secondary: [],
  menu: [],
};

export function WorkspaceGitActions({
  serverId,
  cwd,
  hideLabels,
  forceLoading = false,
}: WorkspaceGitActionsProps) {
  const { t } = useTranslation();
  const { gitActions, isGit, isStatusLoading, statusError } = useGitActions({
    serverId,
    cwd,
    icons: ICONS,
    // Keep status query warm while header is still resolving checkout identity.
    enabled: cwd.trim().length > 0,
  });

  const showLoadingChip = forceLoading || isStatusLoading;

  // Always reserve the topbar Git slot once mounted.
  // Loading / non-git query lag / clean idle must not collapse the control next to Open.
  if (!isGit && !showLoadingChip) {
    // Status resolved as not-git (or hard error with no git payload): keep a disabled chip
    // so the header geometry stays stable instead of vanishing.
    return (
      <GitActionsSplitButton
        gitActions={EMPTY_GIT_ACTIONS}
        hideLabels={hideLabels}
        idleLabel={statusError ? t("git.refreshFailed") : t("git.notGitRepository")}
        loading={false}
      />
    );
  }

  return (
    <GitActionsSplitButton
      gitActions={isGit ? gitActions : EMPTY_GIT_ACTIONS}
      hideLabels={hideLabels}
      idleLabel={t("git.actionUpToDate")}
      loading={showLoadingChip && !isGit}
    />
  );
}
