/**
 * @vitest-environment jsdom
 */
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArchivedAgentCallout } from "./archived-agent-callout";

const { refreshAgentMock, reportErrorMock, theme } = vi.hoisted(() => ({
  refreshAgentMock: vi.fn(),
  reportErrorMock: vi.fn(),
  theme: {
    spacing: { 3: 12, 4: 16, 6: 24 },
    borderWidth: { 1: 1 },
    borderRadius: { "2xl": 8 },
    fontSize: { base: 15 },
    colors: {
      surface1: "#fff",
      borderAccent: "#ddd",
      foregroundMuted: "#666",
    },
  },
}));

vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: (factory: unknown) => (typeof factory === "function" ? factory(theme) : factory),
  },
}));

vi.mock("react-native-reanimated", () => ({
  default: {
    View: "div",
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "session.archivedCallout": "This agent has been archived",
        "session.unarchive": "Unarchive",
        "session.unarchiveFailed": "Unable to unarchive agent",
      };
      return translations[key] ?? key;
    },
  }),
}));

vi.mock("@/runtime/host-runtime", () => ({
  useHostRuntimeClient: () => ({ refreshAgent: refreshAgentMock }),
  useHostRuntimeIsConnected: () => true,
}));

vi.mock("@/hooks/use-keyboard-shift-style", () => ({
  useKeyboardShiftStyle: () => ({ style: undefined }),
}));

vi.mock("@/hooks/use-user-visible-error", () => ({
  useUserVisibleErrorReporter: () => reportErrorMock,
}));

vi.mock("@/components/ui/button", async () => {
  const ReactModule = await import("react");
  return {
    Button: ({
      children,
      disabled,
      onPress,
    }: {
      children?: React.ReactNode;
      disabled?: boolean;
      onPress?: () => void;
    }) =>
      ReactModule.createElement(
        "button",
        {
          disabled: disabled || undefined,
          onClick: () => {
            if (!disabled) onPress?.();
          },
          type: "button",
        },
        children,
      ),
  };
});

describe("ArchivedAgentCallout", () => {
  beforeEach(() => {
    refreshAgentMock.mockReset();
    reportErrorMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("reports an unarchive failure and allows retrying", async () => {
    const error = new Error("daemon offline");
    refreshAgentMock.mockRejectedValueOnce(error);
    render(<ArchivedAgentCallout serverId="server-1" agentId="agent-1" />);

    const button = screen.getByRole("button", { name: "Unarchive" });
    fireEvent.click(button);

    await waitFor(() => {
      expect(reportErrorMock).toHaveBeenCalledWith({
        logLabel: "[ArchivedAgentCallout] Failed to unarchive agent",
        error,
        fallbackMessage: "Unable to unarchive agent",
      });
    });
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });
});
