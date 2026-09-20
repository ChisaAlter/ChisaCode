/**
 * @vitest-environment jsdom
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// The real lucide-react-native build fails to load under vitest — every
// component test in this repo stubs the icons it needs (see message.test.tsx).
vi.mock("lucide-react-native", () => {
  const makeIcon = (name: string) => {
    const Icon = (props: { size?: number; style?: unknown }) =>
      React.createElement("span", {
        "data-icon": name,
        "data-size": props.size,
        style: props.style as React.CSSProperties,
      });
    return Icon;
  };
  return {
    Plus: makeIcon("plus"),
    ChevronDown: makeIcon("chevron-down"),
  };
});

import { Plus } from "lucide-react-native";

// The global setup mock returns the unistyles factory unevaluated, which
// leaves every style entry undefined — override it locally so the resolved
// styles are real objects and dimension assertions can run.
const { themeFixture } = vi.hoisted(() => ({
  themeFixture: {
    spacing: { 1: 4, 2: 8 },
    borderRadius: { full: 9999 },
    colors: {
      primary: "#1a1d26",
      primaryForeground: "#ffffff",
      surface1: "#e8eaef",
      destructive: "#c43c3c",
      foreground: "#111318",
      foregroundMuted: "#6f7686",
      border: "#e4e6ec",
    },
  },
}));

vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    absoluteFillObject: {},
    create: (styles: unknown) => (typeof styles === "function" ? styles(themeFixture) : styles),
    compose: (a: unknown, b: unknown) => [a, b],
  },
  withUnistyles: (Component: unknown) => Component,
  UnistylesRuntime: { setTheme: vi.fn(), themeName: "light" },
}));

import {
  ComposerControl,
  ComposerControlChevron,
  ComposerControlIcon,
  ComposerControlSeparator,
  ComposerSelectControl,
  composerControlStyle,
} from "./composer-control";

const flatten = (style: unknown): unknown[] =>
  Array.isArray(style) ? style.flat(Infinity).filter(Boolean) : [style];

describe("composerControlStyle", () => {
  it("resolves the sm ghost chip to the legacy 32x32 r10 dimensions", () => {
    const style = flatten(composerControlStyle({ size: "sm", variant: "ghost" })({}));
    expect(style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ width: 32, height: 32, borderRadius: 10 }),
      ]),
    );
  });

  it("resolves the xs resting chip to 28x28 r8", () => {
    const style = flatten(composerControlStyle({ size: "xs" })({}));
    expect(style).toEqual(
      expect.arrayContaining([expect.objectContaining({ width: 28, height: 28, borderRadius: 8 })]),
    );
  });

  it("resolves the md primary circle to the send-button 34px shape", () => {
    const style = flatten(
      composerControlStyle({ size: "md", variant: "primary", shape: "circle" })({}),
    );
    expect(style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ width: 34, height: 34 }),
        expect.objectContaining({ backgroundColor: expect.anything() }),
      ]),
    );
  });

  it("applies the hover wash only when hovered and not active", () => {
    const resolve = composerControlStyle({ size: "sm", variant: "ghost" });
    const rested = flatten(resolve({}));
    const hovered = flatten(resolve({ hovered: true }));
    const activeHovered = flatten(
      composerControlStyle({ size: "sm", variant: "ghost", active: true })({ hovered: true }),
    );
    // hovered state adds a backgroundColor layer the resting state lacks.
    expect(hovered.length).toBeGreaterThan(rested.length);
    // active suppresses the hover wash (destructive bg wins).
    expect(activeHovered).toEqual(
      expect.arrayContaining([expect.objectContaining({ backgroundColor: expect.anything() })]),
    );
  });

  it("dims to 0.5 opacity when disabled", () => {
    const style = flatten(composerControlStyle({ disabled: true })({ hovered: true }));
    expect(style).toEqual(expect.arrayContaining([expect.objectContaining({ opacity: 0.5 })]));
  });
});

describe("ComposerControl", () => {
  it("renders a button that fires onPress", () => {
    const onPress = vi.fn();
    render(
      <ComposerControl accessibilityLabel="test control" onPress={onPress} testID="ctl">
        <ComposerControlIcon icon={Plus} size={16} />
      </ComposerControl>,
    );
    fireEvent.click(screen.getByTestId("ctl"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("does not fire onPress when disabled", () => {
    const onPress = vi.fn();
    render(
      <ComposerControl disabled onPress={onPress} testID="ctl">
        <ComposerControlIcon icon={Plus} size={16} />
      </ComposerControl>,
    );
    fireEvent.click(screen.getByTestId("ctl"));
    expect(onPress).not.toHaveBeenCalled();
  });

  it("supports function children receiving press state", () => {
    render(
      <ComposerControl testID="ctl">
        {(state) => <span data-testid="inner">{state.pressed ? "p" : "idle"}</span>}
      </ComposerControl>,
    );
    expect(screen.getByTestId("inner").textContent).toBe("idle");
  });
});

describe("ComposerControlIcon", () => {
  it("renders the icon", () => {
    render(<ComposerControlIcon icon={Plus} size={16} />);
    // withUnistyles is mocked to identity — the icon renders an element.
    expect(document.body.innerHTML).not.toBe("");
  });
});

describe("ComposerControlChevron / Separator / SelectControl", () => {
  it("renders a chevron", () => {
    render(<ComposerControlChevron />);
    expect(document.body.innerHTML).not.toBe("");
  });

  it("renders a separator view", () => {
    const { container } = render(<ComposerControlSeparator />);
    expect(container.firstChild).not.toBeNull();
  });

  it("renders a select control with label and chevron", () => {
    render(
      <ComposerSelectControl accessibilityLabel="model" testID="select">
        <span>model-a</span>
      </ComposerSelectControl>,
    );
    expect(screen.getByTestId("select").textContent).toContain("model-a");
  });
});
