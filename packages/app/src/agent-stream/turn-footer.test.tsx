/**
 * @vitest-environment jsdom
 */
import React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

vi.mock("react-native", () => ({
  Platform: {
    select: (options: Record<string, unknown>) => options.web ?? options.default,
  },
  Text: ({
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
  Image: ({
    source: _source,
    style,
    testID,
  }: {
    source?: unknown;
    style?: unknown;
    testID?: string;
  }) => React.createElement("img", { "data-style": JSON.stringify(style), "data-testid": testID }),
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

vi.mock("lucide-react-native", () => ({
  ChevronDown: () => React.createElement("span", { "data-testid": "chevron-down" }),
  ChevronRight: () => React.createElement("span", { "data-testid": "chevron-right" }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("react-native-unistyles", () => {
  const theme = {
    borderRadius: { md: 6 },
    colorScheme: "light",
    colors: {
      foregroundMuted: "#71717a",
      palette: {
        black: "#000000",
        red: { 300: "#fca5a5", 600: "#dc2626" },
      },
    },
    fontSize: { xs: 12 },
    spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 6: 24 },
  };
  return {
    StyleSheet: {
      create: (factory: (currentTheme: unknown) => unknown) => factory(theme),
    },
    withUnistyles: (Component: React.ComponentType) => {
      return function UnistylesWrapped(props: {
        uniProps?: (currentTheme: unknown) => Record<string, unknown>;
        [key: string]: unknown;
      }) {
        const { uniProps, ...rest } = props;
        const mapped = uniProps ? uniProps(theme) : {};
        return React.createElement(Component, { ...rest, ...mapped });
      };
    },
  };
});

vi.mock("@/utils/time", () => ({
  formatDuration: () => "22s",
}));

const { RunningTurnFooter } = await import("./running-turn-footer");

describe("RunningTurnFooter", () => {
  it("uses the Chisa thinking indicator for a running turn", () => {
    render(<RunningTurnFooter inFlightTurnStartedAt={new Date("2026-06-18T00:00:00.000Z")} />);

    expect(screen.getByTestId("turn-working-indicator")).toBeTruthy();
    expect(screen.getByTestId("chisa-thinking-indicator")).toBeTruthy();
    expect(screen.getByTestId("turn-working-elapsed")).toBeTruthy();
  });

  it("moves the visible scissors around the square-cut path for a running turn", () => {
    vi.useFakeTimers();
    try {
      render(<RunningTurnFooter inFlightTurnStartedAt={new Date("2026-06-18T00:00:00.000Z")} />);

      expect(screen.getByTestId("chisa-thinking-scissors-position-0")).toBeTruthy();

      act(() => {
        vi.advanceTimersByTime(260);
      });

      expect(screen.getByTestId("chisa-thinking-scissors-position-1")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});
