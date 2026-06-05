import { describe, expect, it } from "vitest";

import {
  buildWorktreeArchiveConfirmationMessage,
  buildWorktreeArchiveRiskReasons,
  type WorktreeArchiveWarningCopy,
} from "@/git/worktree-archive-warning";

const COPY: WorktreeArchiveWarningCopy = {
  addedLines: (count) => `${count} added ${count === 1 ? "line" : "lines"}`,
  deletedLines: (count) => `${count} deleted ${count === 1 ? "line" : "lines"}`,
  uncommittedChanges: "Uncommitted changes",
  uncommittedChangesWithStat: (diffStat) => `Uncommitted changes (${diffStat})`,
  unpushedCommits: (count) => `${count} unpushed ${count === 1 ? "commit" : "commits"}`,
  archiveTitle: (worktreeName) => `Archive "${worktreeName}"?`,
  archiveConfirm: "Archive",
  cancel: "Cancel",
};

describe("worktree archive warning", () => {
  it("does not require a confirmation for clean and pushed worktrees", () => {
    expect(
      buildWorktreeArchiveConfirmationMessage({
        worktreeName: "feature",
        isDirty: false,
        aheadOfOrigin: 0,
        diffStat: null,
        copy: COPY,
      }),
    ).toBeNull();
  });

  it("explains uncommitted line changes", () => {
    expect(
      buildWorktreeArchiveRiskReasons(
        {
          isDirty: true,
          aheadOfOrigin: 0,
          diffStat: { additions: 12, deletions: 1 },
        },
        COPY,
      ),
    ).toEqual(["Uncommitted changes (12 added lines, 1 deleted line)"]);
  });

  it("treats nonzero diff stats as dirty when dirty state is missing", () => {
    expect(
      buildWorktreeArchiveRiskReasons(
        {
          isDirty: undefined,
          aheadOfOrigin: 0,
          diffStat: { additions: 4, deletions: 0 },
        },
        COPY,
      ),
    ).toEqual(["Uncommitted changes (4 added lines)"]);
  });

  it("explains unpushed commits", () => {
    expect(
      buildWorktreeArchiveRiskReasons(
        {
          isDirty: false,
          aheadOfOrigin: 2,
          diffStat: null,
        },
        COPY,
      ),
    ).toEqual(["2 unpushed commits"]);
  });

  it("includes every archive risk in the confirmation copy", () => {
    expect(
      buildWorktreeArchiveConfirmationMessage({
        worktreeName: "risky-feature",
        isDirty: true,
        aheadOfOrigin: 1,
        diffStat: { additions: 1, deletions: 3 },
        copy: COPY,
      }),
    ).toBe("Uncommitted changes (1 added line, 3 deleted lines)\n1 unpushed commit");
  });
});
