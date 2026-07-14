export function toErrorMessage(error: unknown, fallbackMessage?: string): string {
  let message: string;
  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === "string") {
    message = error;
  } else if (
    error !== null &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    message = error.message;
  } else {
    message = String(error);
  }

  const normalized = message.trim();
  if (
    normalized &&
    normalized !== "[object Object]" &&
    normalized !== "undefined" &&
    normalized !== "null"
  ) {
    return normalized;
  }
  return fallbackMessage?.trim() || message;
}
