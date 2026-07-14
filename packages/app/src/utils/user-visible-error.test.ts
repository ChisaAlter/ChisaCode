import { afterEach, describe, expect, it, vi } from "vitest";
import type { ToastApi } from "@/components/toast-host";
import { reportUserVisibleError } from "./user-visible-error";

function createToast(): ToastApi {
  return {
    show: vi.fn(),
    copied: vi.fn(),
    error: vi.fn(),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("reportUserVisibleError", () => {
  it("logs the original error and presents the user-facing message", () => {
    const error = new Error("internal detail");
    const toast = createToast();
    vi.spyOn(console, "error").mockImplementation(() => {});

    reportUserVisibleError({
      toast,
      logLabel: "[Settings] Failed to save",
      error,
      message: "Unable to save settings",
    });

    expect(console.error).toHaveBeenCalledWith("[Settings] Failed to save", error);
    expect(toast.error).toHaveBeenCalledWith("Unable to save settings");
  });

  it("can preserve logging without notifying an unmounted surface", () => {
    const toast = createToast();
    vi.spyOn(console, "error").mockImplementation(() => {});

    reportUserVisibleError({
      toast,
      logLabel: "[Settings] Failed after unmount",
      error: new Error("late rejection"),
      message: "Unable to save settings",
      notify: false,
    });

    expect(console.error).toHaveBeenCalledOnce();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("uses a localized fallback for opaque errors", () => {
    const toast = createToast();
    vi.spyOn(console, "error").mockImplementation(() => {});

    reportUserVisibleError({
      toast,
      logLabel: "[Settings] Failed to load",
      error: {},
      fallbackMessage: "Unable to load settings",
    });

    expect(toast.error).toHaveBeenCalledWith("Unable to load settings");
  });

  it("normalizes the original error when no display message is provided", () => {
    const toast = createToast();
    vi.spyOn(console, "error").mockImplementation(() => {});

    reportUserVisibleError({
      toast,
      logLabel: "[Settings] Failed to save",
      error: new Error("Daemon rejected the update"),
    });

    expect(toast.error).toHaveBeenCalledWith("Daemon rejected the update");
  });
});
