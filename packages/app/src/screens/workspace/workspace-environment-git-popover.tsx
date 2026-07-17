import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
  type PressableStateCallbackType,
} from "react-native";
import { Check, GitBranch, GitCommitHorizontal, RefreshCcw, Upload } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { AdaptiveTextInput } from "@/components/adaptive-modal-sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/contexts/toast-context";
import { useCheckoutGitActionsStore, type CheckoutGitActionStatus } from "@/git/actions-store";
import { useCheckoutStatusQuery } from "@/git/use-status-query";
import type { Theme } from "@/styles/theme";

interface WorkspaceEnvironmentGitPopoverProps {
  serverId: string;
  cwd: string | null;
  currentBranchName: string | null;
  children: ReactNode;
}

interface GitPopoverAvailability {
  branchLabel: string;
  actionsEnabled: boolean;
  commitDisabled: boolean;
  commitAndPushDisabled: boolean;
  pushDisabled: boolean;
}

const ThemedActivityIndicator = withUnistyles(ActivityIndicator);
const ThemedCheck = withUnistyles(Check);
const ThemedGitBranch = withUnistyles(GitBranch);
const ThemedGitCommitHorizontal = withUnistyles(GitCommitHorizontal);
const ThemedRefreshCcw = withUnistyles(RefreshCcw);
const ThemedUpload = withUnistyles(Upload);

const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const foregroundColorMapping = (theme: Theme) => ({ color: theme.colors.foreground });

function normalizeCommitMessage(message: string): string | undefined {
  const trimmed = message.trim();
  return trimmed ? trimmed : undefined;
}

type CheckoutStatus = ReturnType<typeof useCheckoutStatusQuery>["status"];

function getGitStatusValue<T>(
  status: CheckoutStatus,
  getValue: (gitStatus: NonNullable<CheckoutStatus> & { isGit: true }) => T,
  fallback: T,
): T {
  if (!status?.isGit) {
    return fallback;
  }
  return getValue(status);
}

function resolveBranchLabel(input: {
  currentBranchName: string | null;
  fallbackBranchLabel: string;
  status: CheckoutStatus;
}): string {
  return (
    input.currentBranchName ??
    getGitStatusValue(input.status, (gitStatus) => gitStatus.currentBranch, null) ??
    input.fallbackBranchLabel
  );
}

function buildGitPopoverAvailability(input: {
  actionsEnabled: boolean;
  currentBranchName: string | null;
  fallbackBranchLabel: string;
  isLoading: boolean;
  status: CheckoutStatus;
}): GitPopoverAvailability {
  const { actionsEnabled, currentBranchName, fallbackBranchLabel, isLoading, status } = input;
  const isGit = Boolean(status?.isGit);
  const isDirty = getGitStatusValue(status, (gitStatus) => gitStatus.isDirty, false);
  const hasRemote = Boolean(status?.hasRemote);
  const aheadOfOrigin = getGitStatusValue(status, (gitStatus) => gitStatus.aheadOfOrigin ?? 0, 0);
  const behindOfOrigin = getGitStatusValue(status, (gitStatus) => gitStatus.behindOfOrigin ?? 0, 0);
  const baseDisabled = !actionsEnabled || isLoading || Boolean(status?.error) || !isGit;
  const commitDisabled = baseDisabled || !isDirty;

  return {
    branchLabel: resolveBranchLabel({ currentBranchName, fallbackBranchLabel, status }),
    actionsEnabled,
    commitDisabled,
    commitAndPushDisabled: commitDisabled || !hasRemote || behindOfOrigin > 0,
    pushDisabled: baseDisabled || !hasRemote || aheadOfOrigin <= 0 || behindOfOrigin > 0,
  };
}

export function WorkspaceEnvironmentGitPopover({
  serverId,
  cwd,
  currentBranchName,
  children,
}: WorkspaceEnvironmentGitPopoverProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [addAll, setAddAll] = useState(true);
  const normalizedCwd = cwd?.trim() ?? "";
  const actionsEnabled = normalizedCwd.length > 0;
  const { status, isLoading, isFetching } = useCheckoutStatusQuery({
    serverId,
    cwd: normalizedCwd,
    enabled: open && actionsEnabled,
  });
  const commitStatus = useCheckoutGitActionsStore((state) =>
    state.getStatus({ serverId, cwd: normalizedCwd, actionId: "commit" }),
  );
  const commitAndPushStatus = useCheckoutGitActionsStore((state) =>
    state.getStatus({ serverId, cwd: normalizedCwd, actionId: "commit-and-push" }),
  );
  const pushStatus = useCheckoutGitActionsStore((state) =>
    state.getStatus({ serverId, cwd: normalizedCwd, actionId: "push" }),
  );
  const refreshStatus = useCheckoutGitActionsStore((state) =>
    state.getStatus({ serverId, cwd: normalizedCwd, actionId: "refresh" }),
  );
  const runCommit = useCheckoutGitActionsStore((state) => state.commit);
  const runCommitAndPush = useCheckoutGitActionsStore((state) => state.commitAndPush);
  const runPush = useCheckoutGitActionsStore((state) => state.push);
  const runRefresh = useCheckoutGitActionsStore((state) => state.refresh);

  const availability = useMemo(
    () =>
      buildGitPopoverAvailability({
        actionsEnabled,
        currentBranchName,
        fallbackBranchLabel: t("workspace.environment.branch"),
        isLoading,
        status,
      }),
    [actionsEnabled, currentBranchName, isLoading, status, t],
  );

  const commitInput = useMemo(
    () => ({
      serverId,
      cwd: normalizedCwd,
      message: normalizeCommitMessage(message),
      addAll,
    }),
    [addAll, message, normalizedCwd, serverId],
  );

  const handleActionError = useCallback(
    (error: unknown, fallback: string) => {
      toast.error(error instanceof Error ? error.message : fallback);
    },
    [toast],
  );

  const handleCommit = useCallback(() => {
    void (async () => {
      try {
        await runCommit(commitInput);
        toast.show(t("git.actionCommitted"), { variant: "success" });
        setOpen(false);
      } catch (error) {
        handleActionError(error, t("git.actionFailedCommit"));
      }
    })();
  }, [commitInput, handleActionError, runCommit, t, toast]);

  const handleCommitAndPush = useCallback(() => {
    void (async () => {
      try {
        await runCommitAndPush(commitInput);
        toast.show(t("workspace.environment.gitActions.committedAndPushed"), {
          variant: "success",
        });
        setOpen(false);
      } catch (error) {
        handleActionError(error, t("workspace.environment.gitActions.commitAndPushFailed"));
      }
    })();
  }, [commitInput, handleActionError, runCommitAndPush, t, toast]);

  const handlePush = useCallback(() => {
    void (async () => {
      try {
        await runPush({ serverId, cwd: normalizedCwd });
        toast.show(t("git.actionPushed"), { variant: "success" });
        setOpen(false);
      } catch (error) {
        handleActionError(error, t("git.actionFailedPush"));
      }
    })();
  }, [handleActionError, normalizedCwd, runPush, serverId, t, toast]);

  const handleRefresh = useCallback(() => {
    if (!actionsEnabled) return;
    void runRefresh({ serverId, cwd: normalizedCwd }).catch((error) =>
      handleActionError(error, t("git.refreshFailed")),
    );
  }, [actionsEnabled, handleActionError, normalizedCwd, runRefresh, serverId, t]);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        testID="workspace-environment-git-actions-trigger"
        accessibilityRole="button"
        accessibilityLabel={t("workspace.environment.commitOrPush")}
        style={styles.triggerRow}
      >
        {children}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        width={420}
        maxWidth={420}
        horizontalPadding={0}
        testID="workspace-environment-git-actions-popover"
      >
        <View style={styles.popover}>
          <View style={styles.header}>
            <View style={styles.branchGroup}>
              <ThemedGitBranch size={14} uniProps={mutedColorMapping} />
              <Text style={styles.branchLabel} numberOfLines={1}>
                {availability.branchLabel}
              </Text>
            </View>
            <Pressable
              testID="workspace-environment-git-refresh"
              accessibilityRole="button"
              accessibilityLabel={t("git.refreshState")}
              disabled={!availability.actionsEnabled || refreshStatus === "pending"}
              onPress={handleRefresh}
              style={styles.iconButton}
            >
              {refreshStatus === "pending" || isFetching ? (
                <ThemedActivityIndicator size="small" uniProps={foregroundColorMapping} />
              ) : (
                <ThemedRefreshCcw size={15} uniProps={mutedColorMapping} />
              )}
            </Pressable>
          </View>

          <AdaptiveTextInput
            testID="workspace-environment-commit-message"
            initialValue={message}
            resetKey={open ? "open" : "closed"}
            onChangeText={setMessage}
            placeholder={t("workspace.environment.gitActions.commitMessagePlaceholder")}
            multiline
            numberOfLines={2}
            textAlignVertical="top"
            style={styles.messageInput}
          />

          <IncludeUnstagedToggle value={addAll} onValueChange={setAddAll} />

          <GitActionList
            commitDisabled={availability.commitDisabled}
            commitStatus={commitStatus}
            commitAndPushDisabled={availability.commitAndPushDisabled}
            commitAndPushStatus={commitAndPushStatus}
            pushDisabled={availability.pushDisabled}
            pushStatus={pushStatus}
            onCommit={handleCommit}
            onCommitAndPush={handleCommitAndPush}
            onPush={handlePush}
          />
        </View>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function GitActionList({
  commitDisabled,
  commitStatus,
  commitAndPushDisabled,
  commitAndPushStatus,
  pushDisabled,
  pushStatus,
  onCommit,
  onCommitAndPush,
  onPush,
}: {
  commitDisabled: boolean;
  commitStatus: CheckoutGitActionStatus;
  commitAndPushDisabled: boolean;
  commitAndPushStatus: CheckoutGitActionStatus;
  pushDisabled: boolean;
  pushStatus: CheckoutGitActionStatus;
  onCommit: () => void;
  onCommitAndPush: () => void;
  onPush: () => void;
}) {
  const { t } = useTranslation();
  const commitIcon = useMemo(
    () => <ThemedGitCommitHorizontal size={16} uniProps={mutedColorMapping} />,
    [],
  );
  const uploadIcon = useMemo(() => <ThemedUpload size={16} uniProps={mutedColorMapping} />, []);
  const shortcutPill = useMemo(() => <ShortcutPill label="Ctrl+Enter" />, []);

  return (
    <View style={styles.actionList}>
      <DropdownMenuItem
        testID="workspace-environment-action-commit"
        leading={commitIcon}
        trailing={shortcutPill}
        disabled={commitDisabled}
        status={commitStatus}
        pendingLabel={t("git.actionCommitting")}
        successLabel={t("git.actionCommitted")}
        closeOnSelect={false}
        onSelect={onCommit}
      >
        {t("git.actionCommit")}
      </DropdownMenuItem>
      <DropdownMenuItem
        testID="workspace-environment-action-commit-and-push"
        leading={uploadIcon}
        disabled={commitAndPushDisabled}
        status={commitAndPushStatus}
        pendingLabel={t("workspace.environment.gitActions.committingAndPushing")}
        successLabel={t("workspace.environment.gitActions.committedAndPushed")}
        closeOnSelect={false}
        onSelect={onCommitAndPush}
      >
        {t("workspace.environment.gitActions.commitAndPush")}
      </DropdownMenuItem>
      <DropdownMenuItem
        testID="workspace-environment-action-push"
        leading={uploadIcon}
        disabled={pushDisabled}
        status={pushStatus}
        pendingLabel={t("git.actionPushing")}
        successLabel={t("git.actionPushed")}
        closeOnSelect={false}
        onSelect={onPush}
      >
        {t("git.actionPush")}
      </DropdownMenuItem>
    </View>
  );
}

function IncludeUnstagedToggle({
  value,
  onValueChange,
}: {
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  const { t } = useTranslation();
  const handlePress = useCallback(() => onValueChange(!value), [onValueChange, value]);
  const checkboxStyle = useMemo(
    () => [styles.checkbox, value ? styles.checkboxChecked : null],
    [value],
  );
  const accessibilityState = useMemo(() => ({ checked: value }), [value]);

  return (
    <Pressable
      testID="workspace-environment-include-unstaged"
      accessibilityRole="checkbox"
      accessibilityState={accessibilityState}
      accessibilityLabel={t("workspace.environment.gitActions.includeUnstaged")}
      onPress={handlePress}
      style={styles.checkboxRow}
    >
      <View style={checkboxStyle}>
        {value ? <ThemedCheck size={12} uniProps={foregroundColorMapping} /> : null}
      </View>
      <Text style={styles.checkboxLabel}>
        {t("workspace.environment.gitActions.includeUnstaged")}
      </Text>
    </Pressable>
  );
}

function ShortcutPill({ label }: { label: string }) {
  return (
    <View style={styles.shortcutPill}>
      <Text style={styles.shortcutText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  popover: {
    paddingVertical: theme.spacing[2],
    minWidth: 0,
  },
  triggerRow: ({ hovered, pressed }: PressableStateCallbackType & { hovered?: boolean }) => ({
    flex: 1,
    minHeight: 28,
    height: 28,
    paddingVertical: 0,
    paddingHorizontal: 0,
    borderRadius: theme.borderRadius.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
    backgroundColor: hovered || pressed ? theme.colors.surface2 : "transparent",
  }),
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[1],
    paddingBottom: theme.spacing[2],
  },
  branchGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    minWidth: 0,
    flex: 1,
  },
  branchLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    minWidth: 0,
    flexShrink: 1,
  },
  iconButton: ({ hovered, pressed }: PressableStateCallbackType & { hovered?: boolean }) => ({
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
    backgroundColor: hovered || pressed ? theme.colors.surface2 : "transparent",
  }),
  messageInput: {
    minHeight: 78,
    marginHorizontal: theme.spacing[4],
    marginTop: theme.spacing[1],
    marginBottom: theme.spacing[3],
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    fontSize: theme.fontSize.sm,
    lineHeight: theme.fontSize.sm * 1.4,
  },
  checkboxRow: ({ hovered, pressed }: PressableStateCallbackType & { hovered?: boolean }) => ({
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    minHeight: 36,
    paddingHorizontal: theme.spacing[4],
    backgroundColor: hovered || pressed ? theme.colors.surface1 : "transparent",
  }),
  checkbox: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.borderAccent,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface0,
  },
  checkboxChecked: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accent,
  },
  checkboxLabel: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    lineHeight: theme.fontSize.sm * 1.35,
    minWidth: 0,
    flexShrink: 1,
  },
  actionList: {
    paddingTop: theme.spacing[2],
  },
  shortcutPill: {
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 1,
    backgroundColor: theme.colors.surface2,
  },
  shortcutText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
}));
