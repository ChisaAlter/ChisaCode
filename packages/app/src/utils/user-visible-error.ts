import type { ToastApi } from "@/components/toast-host";
import { toErrorMessage } from "@/utils/error-messages";

export interface UserVisibleErrorReport {
  toast: ToastApi;
  logLabel: string;
  error: unknown;
  message?: string;
  notify?: boolean;
}

export type UserVisibleErrorReporterInput = Omit<UserVisibleErrorReport, "toast">;

export function reportUserVisibleError(input: UserVisibleErrorReport): void {
  console.error(input.logLabel, input.error);
  if (input.notify === false) return;
  input.toast.error(input.message?.trim() || toErrorMessage(input.error));
}
