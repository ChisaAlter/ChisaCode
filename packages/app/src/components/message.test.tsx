/**
 * @vitest-environment jsdom
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ThoughtMessage } from "./thought-message";

vi.mock("react-native", () => ({
  Platform: {
    select: (options: Record<string, unknown>) => options.web ?? options.default,
  },
  Pressable: ({
    accessibilityLabel,
    accessibilityRole,
    accessibilityState,
    children,
    disabled,
    onPress,
    style,
    testID,
  }: {
    accessibilityLabel?: string;
    accessibilityRole?: string;
    accessibilityState?: { expanded?: boolean };
    children: React.ReactNode;
    disabled?: boolean;
    onPress?: () => void;
    style?: unknown;
    testID?: string;
  }) =>
    React.createElement(
      "button",
      {
        "aria-expanded": accessibilityState?.expanded,
        "aria-label": accessibilityLabel,
        "data-disabled": disabled,
        "data-style": JSON.stringify(style),
        "data-testid": testID,
        disabled,
        onClick: onPress,
        role: accessibilityRole,
        type: "button",
      },
      children,
    ),
  Text: ({
    children,
    numberOfLines: _numberOfLines,
    selectable: _selectable,
    style,
    testID,
  }: {
    children: React.ReactNode;
    numberOfLines?: number;
    selectable?: boolean;
    style?: unknown;
    testID?: string;
  }) =>
    React.createElement(
      "span",
      { "data-style": JSON.stringify(style), "data-testid": testID },
      children,
    ),
  View: ({
    children,
    style,
    testID,
  }: {
    children: React.ReactNode;
    style?: unknown;
    testID?: string;
  }) =>
    React.createElement(
      "span",
      { "data-style": JSON.stringify(style), "data-testid": testID },
      children,
    ),
}));

vi.mock("lucide-react-native", () => ({
  Brain: () => React.createElement("span", { "data-testid": "brain-icon" }),
  ChevronDown: () => React.createElement("span", { "data-testid": "chevron-down" }),
  ChevronRight: () => React.createElement("span", { "data-testid": "chevron-right" }),
}));

vi.mock("react-native-unistyles", () => {
  const theme = {
    borderRadius: { md: 6 },
    colors: {
      foregroundMuted: "#71717a",
    },
    fontSize: { xs: 12 },
    spacing: { 1: 4, 2: 8 },
  };
  return {
    StyleSheet: {
      create: (factory: unknown) => (typeof factory === "function" ? factory(theme) : factory),
    },
    useUnistyles: () => ({ theme }),
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      if (key === "stream.thinking") return "Thinking";
      if (key === "stream.thinkingRunning") return "Thinking...";
      return key;
    },
  }),
}));

describe("ThoughtMessage", () => {
  it("keeps reasoning collapsed until the user expands it", () => {
    render(
      <ThoughtMessage
        text={"First private step\nSecond private step"}
        status="ready"
        isLastInSequence
      />,
    );

    expect(screen.getByText("Thinking")).toBeTruthy();
    expect(screen.queryByText("First private step", { exact: false })).toBeNull();

    fireEvent.click(screen.getByTestId("thought-message-toggle"));

    expect(screen.getByText("First private step", { exact: false })).toBeTruthy();
    expect(screen.getByText("Second private step", { exact: false })).toBeTruthy();

    fireEvent.click(screen.getByTestId("thought-message-toggle"));

    expect(screen.queryByText("First private step", { exact: false })).toBeNull();
  });

  it("uses the running label while reasoning is streaming", () => {
    render(<ThoughtMessage text="Still streaming" status="loading" isLastInSequence />);

    expect(screen.getByText("Thinking...")).toBeTruthy();
    expect(screen.queryByText("Still streaming", { exact: false })).toBeNull();
  });
});
