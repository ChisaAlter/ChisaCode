/**
 * @vitest-environment jsdom
 */
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThoughtMessage } from "./thought-message";

afterEach(cleanup);

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
  Image: ({
    source: _source,
    style,
    testID,
  }: {
    source?: unknown;
    style?: unknown;
    testID?: string;
  }) => React.createElement("img", { "data-style": JSON.stringify(style), "data-testid": testID }),
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
  ChevronDown: () => React.createElement("span", { "data-testid": "chevron-down" }),
  ChevronRight: () => React.createElement("span", { "data-testid": "chevron-right" }),
}));

function svgElement(tagName: string) {
  return function SvgElement({
    children,
    testID,
    ...props
  }: {
    children?: React.ReactNode;
    testID?: string;
    [key: string]: unknown;
  }) {
    return React.createElement(tagName, { ...props, "data-testid": testID }, children);
  };
}

vi.mock("react-native-svg", () => ({
  default: svgElement("svg"),
  Circle: svgElement("circle"),
  G: svgElement("g"),
  Line: svgElement("line"),
  Rect: svgElement("rect"),
}));

vi.mock("react-native-unistyles", () => {
  const theme = {
    borderRadius: { md: 6 },
    colors: {
      foregroundMuted: "#71717a",
      palette: {
        black: "#000000",
        red: { 300: "#fca5a5", 600: "#dc2626" },
      },
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
      if (key === "stream.thinking") return "推理过程";
      if (key === "stream.thinkingRunning") return "正在推理";
      return key;
    },
  }),
}));

describe("ThoughtMessage", () => {
  it("shows reasoning content by default and lets the user collapse it", () => {
    render(
      <ThoughtMessage
        text={"First private step\nSecond private step"}
        status="ready"
        isLastInSequence
      />,
    );

    expect(screen.getByText("推理过程")).toBeTruthy();
    expect(screen.getByText("First private step", { exact: false })).toBeTruthy();
    expect(screen.getByText("Second private step", { exact: false })).toBeTruthy();

    fireEvent.click(screen.getByTestId("thought-message-toggle"));

    expect(screen.queryByText("First private step", { exact: false })).toBeNull();
  });

  it("uses the running label while reasoning is streaming", () => {
    render(<ThoughtMessage text="Still streaming" status="loading" isLastInSequence />);

    expect(screen.getByText("正在推理")).toBeTruthy();
    expect(screen.getByTestId("chisa-thinking-indicator")).toBeTruthy();
    expect(screen.getByText("Still streaming", { exact: false })).toBeTruthy();
  });

  it("moves the visible scissors around the square-cut path while reasoning is streaming", () => {
    vi.useFakeTimers();
    try {
      render(<ThoughtMessage text="Still streaming" status="loading" isLastInSequence />);

      const firstPosition = screen.getByTestId("chisa-thinking-scissors-position-0");
      expect(firstPosition).toBeTruthy();
      expect(screen.getByTestId("chisa-thinking-avatar")).toBeTruthy();
      expect(firstPosition.querySelector("circle")?.getAttribute("cx")).toBe("4");

      act(() => {
        vi.advanceTimersByTime(260);
      });

      const secondPosition = screen.getByTestId("chisa-thinking-scissors-position-1");
      expect(secondPosition).toBeTruthy();
      expect(secondPosition.querySelector("circle")?.getAttribute("cx")).toBe("22");
    } finally {
      vi.useRealTimers();
    }
  });
});
