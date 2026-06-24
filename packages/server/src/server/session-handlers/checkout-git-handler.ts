/**
 * CheckoutGitHandler — extracted from Session.
 *
 * Handles all checkout/git/branch/stash/PR operations. Receives a
 * SessionContext for shared state (emit, logger, git services) and owns
 * checkout-specific subscriptions (checkoutDiffSubscriptions).
 *
 * Migration status: partial — stash methods + notifyGitMutation + branch
 * helpers migrated first (lowest risk). Remaining checkout/PR methods will
 * be migrated in follow-up commits.
 */

import { execCommand } from "../../utils/spawn.js";
import { toCheckoutError } from "../checkout-git-utils.js";
import type { SessionInboundMessage } from "../messages.js";
import type { GitMutationRefreshReason } from "../session-helpers.js";
import type { SessionContext, DisposableHandler } from "./session-context.js";

const CHISACODE_STASH_PREFIX = "chisacode-auto-stash:";

export class CheckoutGitHandler implements DisposableHandler {
  private readonly context: SessionContext;

  constructor(context: SessionContext) {
    this.context = context;
  }

  dispose(): void {
    // checkoutDiffSubscriptions will be migrated here once all checkout
    // methods are moved. For now this is a no-op.
  }

  // --- Git mutation notification (shared across checkout methods) ---

  private async notifyGitMutation(
    cwd: string,
    reason: GitMutationRefreshReason,
    options?: { invalidateGithub?: boolean },
  ): Promise<void> {
    if (options?.invalidateGithub) {
      this.context.github?.invalidate({ cwd });
    }
    try {
      await this.context.workspaceGitService.getSnapshot(cwd, { force: true, reason });
    } catch (error) {
      this.context.sessionLogger.warn(
        { err: error, cwd, reason },
        "Failed to force-refresh workspace git snapshot after mutation",
      );
    }
  }

  // --- Branch safety helpers (used by checkout methods migrated in follow-up) ---

  // NOTE: assertSafeGitRef, isWorkingTreeDirty, ensureCleanWorkingTree,
  // doesLocalBranchExist will be migrated together with the checkout/branch
  // methods that call them. Keeping them in Session for now avoids unused
  // declaration errors during the incremental migration.

  // --- Stash handlers ---

  async handleStashSaveRequest(
    msg: Extract<SessionInboundMessage, { type: "stash_save_request" }>,
  ): Promise<void> {
    const { cwd, requestId } = msg;
    try {
      const branchLabel = msg.branch?.trim() ?? "";
      const message = branchLabel
        ? `${CHISACODE_STASH_PREFIX} ${branchLabel}`
        : `${CHISACODE_STASH_PREFIX} unnamed`;
      await execCommand("git", ["stash", "push", "--include-untracked", "-m", message], {
        cwd,
      });
      await this.notifyGitMutation(cwd, "stash-push");
      this.context.checkoutDiffManager.scheduleRefreshForCwd(cwd);
      this.context.emit({
        type: "stash_save_response",
        payload: { cwd, success: true, error: null, requestId },
      });
    } catch (error) {
      this.context.emit({
        type: "stash_save_response",
        payload: { cwd, success: false, error: toCheckoutError(error), requestId },
      });
    }
  }

  async handleStashPopRequest(
    msg: Extract<SessionInboundMessage, { type: "stash_pop_request" }>,
  ): Promise<void> {
    const { cwd, stashIndex, requestId } = msg;
    try {
      await execCommand("git", ["stash", "pop", `stash@{${stashIndex}}`], {
        cwd,
      });
      await this.notifyGitMutation(cwd, "stash-pop");
      this.context.checkoutDiffManager.scheduleRefreshForCwd(cwd);
      this.context.emit({
        type: "stash_pop_response",
        payload: { cwd, success: true, error: null, requestId },
      });
    } catch (error) {
      this.context.emit({
        type: "stash_pop_response",
        payload: { cwd, success: false, error: toCheckoutError(error), requestId },
      });
    }
  }

  async handleStashListRequest(
    msg: Extract<SessionInboundMessage, { type: "stash_list_request" }>,
  ): Promise<void> {
    const { cwd, requestId } = msg;
    const chisacodeOnly = msg.chisacodeOnly !== false;
    try {
      const entries = await this.context.workspaceGitService.listStashes(cwd, { chisacodeOnly });

      this.context.emit({
        type: "stash_list_response",
        payload: { cwd, entries, error: null, requestId },
      });
    } catch (error) {
      this.context.emit({
        type: "stash_list_response",
        payload: { cwd, entries: [], error: toCheckoutError(error), requestId },
      });
    }
  }
}
