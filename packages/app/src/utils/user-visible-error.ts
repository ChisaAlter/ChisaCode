import type { ToastApi } from "@/components/toast-host";
import { toErrorMessage } from "@/utils/error-messages";

export interface PresentedErrorReport {
  logLabel: string;
  error: unknown;
  message?: string;
  fallbackMessage?: string;
  notify?: boolean;
  present: (message: string) => void;
}

export type UserVisibleErrorReport = Omit<PresentedErrorReport, "present"> & {
  toast: ToastApi;
};

export type UserVisibleErrorReporterInput = Omit<UserVisibleErrorReport, "toast">;

export function reportPresentedError(input: PresentedErrorReport): void {
  console.error(input.logLabel, input.error);
  if (input.notify === false) return;
  input.present(input.message?.trim() || toErrorMessage(input.error, input.fallbackMessage));
}

export function reportUserVisibleError(input: UserVisibleErrorReport): void {
  const { toast, ...report } = input;
  reportPresentedError({ ...report, present: toast.error });
}
