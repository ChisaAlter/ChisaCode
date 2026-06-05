import { confirmDialog } from "@/utils/confirm-dialog";

export interface WorktreeArchiveRisk {
  isDirty?: boolean | null;
  aheadOfOrigin?: number | null;
  diffStat?: { additions: number; deletions: number } | null;
}

export interface WorktreeArchiveConfirmationInput extends WorktreeArchiveRisk {
  worktreeName: string;
  copy: WorktreeArchiveWarningCopy;
}

export interface WorktreeArchiveWarningCopy {
  addedLines: (count: number) => string;
  deletedLines: (count: number) => string;
  uncommittedChanges: string;
  uncommittedChangesWithStat: (diffStat: string) => string;
  unpushedCommits: (count: number) => string;
  archiveTitle: (worktreeName: string) => string;
  archiveConfirm: string;
  cancel: string;
}

function formatDiffStat(
  diffStat: WorktreeArchiveRisk["diffStat"],
  copy: WorktreeArchiveWarningCopy,
): string | null {
  if (!diffStat) {
    return null;
  }

  const parts: string[] = [];
  if (diffStat.additions > 0) {
    parts.push(copy.addedLines(diffStat.additions));
  }
  if (diffStat.deletions > 0) {
    parts.push(copy.deletedLines(diffStat.deletions));
  }

  return parts.length > 0 ? parts.join(", ") : null;
}

export function buildWorktreeArchiveRiskReasons(
  input: WorktreeArchiveRisk,
  copy: WorktreeArchiveWarningCopy,
): string[] {
  const reasons: string[] = [];
  const diffStat = input.diffStat;
  const hasDiffStatChanges = diffStat ? diffStat.additions > 0 || diffStat.deletions > 0 : false;
  const hasUncommittedChanges =
    input.isDirty === true || (input.isDirty == null && hasDiffStatChanges);

  if (hasUncommittedChanges) {
    const diffStatLabel = formatDiffStat(diffStat, copy);
    reasons.push(
      diffStatLabel ? copy.uncommittedChangesWithStat(diffStatLabel) : copy.uncommittedChanges,
    );
  }

  if ((input.aheadOfOrigin ?? 0) > 0) {
    const aheadOfOrigin = input.aheadOfOrigin ?? 0;
    reasons.push(copy.unpushedCommits(aheadOfOrigin));
  }

  return reasons;
}

export function buildWorktreeArchiveConfirmationMessage(
  input: WorktreeArchiveConfirmationInput,
): string | null {
  const reasons = buildWorktreeArchiveRiskReasons(input, input.copy);
  if (reasons.length === 0) {
    return null;
  }

  return reasons.join("\n");
}

export async function confirmRiskyWorktreeArchive(
  input: WorktreeArchiveConfirmationInput,
): Promise<boolean> {
  const message = buildWorktreeArchiveConfirmationMessage(input);
  if (!message) {
    return true;
  }

  return await confirmDialog({
    title: input.copy.archiveTitle(input.worktreeName),
    message,
    confirmLabel: input.copy.archiveConfirm,
    cancelLabel: input.copy.cancel,
    destructive: true,
  });
}
