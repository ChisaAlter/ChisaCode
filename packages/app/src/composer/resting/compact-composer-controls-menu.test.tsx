/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CompactComposerControlsFallbackList } from "./compact-composer-controls-fallback";
import type { CompactComposerControlItem } from "./compact-composer-controls-fallback";

const EMPTY_ITEMS: CompactComposerControlItem[] = [];
const modelSelect = vi.fn();
const MODEL_ITEMS: CompactComposerControlItem[] = [
  { id: "model", label: "Model", onSelect: modelSelect },
];

describe("CompactComposerControlsFallbackList", () => {
  beforeEach(() => {
    modelSelect.mockClear();
  });

  it("renders nothing when empty", () => {
    const { container } = render(<CompactComposerControlsFallbackList items={EMPTY_ITEMS} />);
    expect(container.firstChild).toBeNull();
  });

  it("invokes onSelect for a row", () => {
    render(<CompactComposerControlsFallbackList items={MODEL_ITEMS} />);
    fireEvent.click(screen.getByText("Model"));
    expect(modelSelect).toHaveBeenCalledTimes(1);
  });
});
