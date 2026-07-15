import type { ToastApi } from "@/components/toast-host";
import { toErrorMessage } from "@/utils/error-messages";

export interface ErrorLogger {
  error(label: string, error: unknown): void;
}

export interface PresentedErrorReport {
  logLabel: string;
  error: unknown;
  logger?: ErrorLogger;
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
  const logger = input.logger ?? console;
  logger.error(input.logLabel, input.error);
  if (input.notify === false) return;
  input.present(input.message?.trim() || toErrorMessage(input.error, input.fallbackMessage));
}

export function reportUserVisibleError(input: UserVisibleErrorReport): void {
  const { toast, ...report } = input;
  reportPresentedError({ ...report, present: toast.error });
}
