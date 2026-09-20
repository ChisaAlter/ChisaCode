/**
 * @vitest-environment jsdom
 */
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ComposerInsertTextContext } from "@/composer/composer-insert-text-context";
import { AssistantSelectionToolbar } from "./assistant-selection-toolbar";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

interface FakeSelectionOptions {
  anchorNode: Node | null;
  text: string;
  isCollapsed?: boolean;
  rect?: Partial<DOMRect>;
}

function installFakeSelection({
  anchorNode,
  text,
  isCollapsed = false,
  rect = {},
}: FakeSelectionOptions) {
  const removeAllRanges = vi.fn(() => {
    current.isCollapsed = true;
  });
  const current = {
    anchorNode,
    isCollapsed,
    rangeCount: 1,
    toString: () => text,
    removeAllRanges,
    getRangeAt: () => ({
      getBoundingClientRect: () =>
        ({
          top: 200,
          left: 100,
          width: 80,
          height: 20,
          right: 180,
          bottom: 220,
          ...rect,
        }) as DOMRect,
    }),
  };
  vi.stubGlobal(
    "getSelection",
    vi.fn(() => current),
  );
  window.getSelection = vi.fn(() => current) as unknown as typeof window.getSelection;
  return { selection: current, removeAllRanges };
}

function dispatchSelectionChange() {
  act(() => {
    document.dispatchEvent(new Event("selectionchange"));
  });
}

function Harness({ insertText }: { insertText?: (text: string) => void }) {
  const ref = React.useRef<HTMLDivElement>(null);
  return (
    <ComposerInsertTextContext.Provider value={insertText ?? null}>
      <div ref={ref} data-testid="assistant-selection-surface" />
      <AssistantSelectionToolbar
        containerRef={ref as unknown as React.RefObject<import("react-native").View | null>}
      />
    </ComposerInsertTextContext.Provider>
  );
}

function renderToolbar(options?: { insertText?: (text: string) => void }) {
  const utils = render(<Harness insertText={options?.insertText} />);
  const container = screen.getByTestId("assistant-selection-surface") as HTMLDivElement;
  return { ...utils, container };
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.getElementById("overlay-root")?.remove();
});

describe("AssistantSelectionToolbar (web)", () => {
  it("shows the toolbar when text is selected inside the container", () => {
    const { container } = renderToolbar();
    const inner = document.createElement("p");
    inner.textContent = "hello stream";
    container.appendChild(inner);
    installFakeSelection({ anchorNode: inner.firstChild, text: "hello stream" });

    dispatchSelectionChange();

    expect(screen.getByTestId("assistant-selection-toolbar")).toBeTruthy();
    expect(screen.getByTestId("assistant-selection-copy")).toBeTruthy();
  });

  it("stays hidden when the selection is outside the container", () => {
    renderToolbar();
    const outside = document.createElement("p");
    outside.textContent = "elsewhere";
    document.body.appendChild(outside);
    installFakeSelection({ anchorNode: outside.firstChild, text: "elsewhere" });

    dispatchSelectionChange();

    expect(screen.queryByTestId("assistant-selection-toolbar")).toBeNull();
  });

  it("hides again when the selection collapses", () => {
    const { container } = renderToolbar();
    const inner = document.createElement("p");
    inner.textContent = "temp";
    container.appendChild(inner);
    const { selection } = installFakeSelection({ anchorNode: inner.firstChild, text: "temp" });

    dispatchSelectionChange();
    expect(screen.getByTestId("assistant-selection-toolbar")).toBeTruthy();

    selection.isCollapsed = true;
    dispatchSelectionChange();
    expect(screen.queryByTestId("assistant-selection-toolbar")).toBeNull();
  });

  it("inserts the selection as a markdown blockquote into the composer", () => {
    const insertText = vi.fn();
    const { container } = renderToolbar({ insertText });
    const inner = document.createElement("p");
    inner.textContent = "line one";
    container.appendChild(inner);
    installFakeSelection({ anchorNode: inner.firstChild, text: "line one\nline two" });

    dispatchSelectionChange();
    fireEvent.click(screen.getByTestId("assistant-selection-quote"));

    expect(insertText).toHaveBeenCalledWith("> line one\n> line two");
  });

  it("hides the quote button when no composer insert is provided", () => {
    const { container } = renderToolbar();
    const inner = document.createElement("p");
    inner.textContent = "abc";
    container.appendChild(inner);
    installFakeSelection({ anchorNode: inner.firstChild, text: "abc" });

    dispatchSelectionChange();

    expect(screen.queryByTestId("assistant-selection-quote")).toBeNull();
    expect(screen.getByTestId("assistant-selection-copy")).toBeTruthy();
  });

  it("clears the DOM selection after quoting", () => {
    const { container } = renderToolbar({ insertText: vi.fn() });
    const inner = document.createElement("p");
    inner.textContent = "abc";
    container.appendChild(inner);
    const { removeAllRanges } = installFakeSelection({
      anchorNode: inner.firstChild,
      text: "abc",
    });

    dispatchSelectionChange();
    fireEvent.click(screen.getByTestId("assistant-selection-quote"));

    expect(removeAllRanges).toHaveBeenCalledTimes(1);
  });

  it("dismisses on Escape", () => {
    const { container } = renderToolbar();
    const inner = document.createElement("p");
    inner.textContent = "abc";
    container.appendChild(inner);
    const { removeAllRanges } = installFakeSelection({
      anchorNode: inner.firstChild,
      text: "abc",
    });

    dispatchSelectionChange();
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(removeAllRanges).toHaveBeenCalledTimes(1);
  });
});
