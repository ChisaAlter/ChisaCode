import { confirmDialog } from "@/utils/confirm-dialog";

export interface WorktreeArchiveRisk {
  isDirty?: boolean | null;
  aheadOfOrigin?: number | null;
  diffStat?: { additions: number; deletions: number } | null;
}

export interface WorktreeArchiveConfirmationInput extends WorktreeArchiveRisk {
  worktreeName: string;
}

function formatDiffStat(diffStat: WorktreeArchiveRisk["diffStat"]): string | null {
  if (!diffStat) {
    return null;
  }

  const parts: string[] = [];
  if (diffStat.additions > 0) {
    parts.push(`新增 ${diffStat.additions} 行`);
  }
  if (diffStat.deletions > 0) {
    parts.push(`删除 ${diffStat.deletions} 行`);
  }

  return parts.length > 0 ? parts.join(", ") : null;
}

export function buildWorktreeArchiveRiskReasons(input: WorktreeArchiveRisk): string[] {
  const reasons: string[] = [];
  const diffStat = input.diffStat;
  const hasDiffStatChanges = diffStat ? diffStat.additions > 0 || diffStat.deletions > 0 : false;
  const hasUncommittedChanges =
    input.isDirty === true || (input.isDirty == null && hasDiffStatChanges);

  if (hasUncommittedChanges) {
    const diffStatLabel = formatDiffStat(diffStat);
    reasons.push(diffStatLabel ? `未提交的更改（${diffStatLabel}）` : "未提交的更改");
  }

  if ((input.aheadOfOrigin ?? 0) > 0) {
    const aheadOfOrigin = input.aheadOfOrigin ?? 0;
    reasons.push(`${aheadOfOrigin} 个未推送提交`);
  }

  return reasons;
}

export function buildWorktreeArchiveConfirmationMessage(
  input: WorktreeArchiveConfirmationInput,
): string | null {
  const reasons = buildWorktreeArchiveRiskReasons(input);
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
    title: `归档“${input.worktreeName}”？`,
    message,
    confirmLabel: "归档",
    cancelLabel: "取消",
    destructive: true,
  });
}
