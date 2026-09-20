import { MissingCheckoutTargetError } from "./resolve-worktree-creation-intent.js";
import { BranchAlreadyCheckedOutError, UnknownBranchError } from "../utils/worktree.js";

export type WorktreeWireErrorCode =
  | "branch_already_checked_out"
  | "missing_checkout_target"
  | "unknown_branch"
  | "unknown";

export interface WorktreeWireError {
  code: WorktreeWireErrorCode;
  message: string;
}

export class WorktreeRequestError extends Error {
  readonly code: WorktreeWireErrorCode;

  constructor(error: WorktreeWireError) {
    super(error.message);
    this.name = "WorktreeRequestError";
    this.code = error.code;
  }
}

export function toWorktreeWireError(error: unknown): WorktreeWireError {
  if (error instanceof BranchAlreadyCheckedOutError) {
    return { code: "branch_already_checked_out", message: error.message };
  }
  if (error instanceof MissingCheckoutTargetError) {
    return { code: "missing_checkout_target", message: error.message };
  }
  if (error instanceof UnknownBranchError) {
    return { code: "unknown_branch", message: error.message };
  }
  if (error instanceof Error) {
    return { code: "unknown", message: error.message };
  }
  return { code: "unknown", message: String(error) };
}

export function toWorktreeRequestError(error: unknown): WorktreeRequestError {
  return new WorktreeRequestError(toWorktreeWireError(error));
}

/** Wire payload for an agent-create failure: message plus a stable code. */
export interface AgentCreateWireError {
  code: string;
  message: string;
}

/**
 * Maps an agent-create failure to its wire error payload. Worktree error codes
 * win; otherwise a typed error carrying a stable string `code` (e.g. the dsh
 * provider's DSH_MISSING_API_KEY credential preflight) surfaces that code so
 * new clients can localize by code, while old clients keep displaying the
 * message text unchanged.
 * @param error The thrown create failure
 * @returns Stable code plus the human-readable message
 */
export function toAgentCreateWireError(error: unknown): AgentCreateWireError {
  const wireError = toWorktreeWireError(error);
  if (wireError.code !== "unknown") {
    return wireError;
  }
  const code = error instanceof Error ? Reflect.get(error, "code") : undefined;
  if (typeof code === "string" && code.length > 0) {
    return { code, message: wireError.message };
  }
  return wireError;
}
