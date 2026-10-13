import { describe, expect, it } from "vitest";
import {
  deriveIsComposerResting,
  isComposerLayoutCollapsed,
  resolveComposerLayoutMode,
} from "./composer-resting-state";

const base = {
  timelineHasContent: true,
  isFocused: false,
  isMultiline: false,
  hasAttachments: false,
  scrollCollapsed: false,
};

describe("deriveIsComposerResting", () => {
  it("rests when the stream has content and the composer is idle", () => {
    expect(deriveIsComposerResting(base)).toBe(true);
  });

  it("does not rest while focused", () => {
    expect(deriveIsComposerResting({ ...base, isFocused: true })).toBe(false);
  });

  it("does not rest while multiline", () => {
    expect(deriveIsComposerResting({ ...base, isMultiline: true })).toBe(false);
  });

  it("does not rest with attachments", () => {
    expect(deriveIsComposerResting({ ...base, hasAttachments: true })).toBe(false);
  });

  it("does not rest when the timeline is empty", () => {
    expect(deriveIsComposerResting({ ...base, timelineHasContent: false })).toBe(false);
  });

  it("yields to scroll-collapse (mutually exclusive)", () => {
    expect(deriveIsComposerResting({ ...base, scrollCollapsed: true })).toBe(false);
  });

  it("respects enabled=false (draft composers)", () => {
    expect(deriveIsComposerResting({ ...base, enabled: false })).toBe(false);
  });
});

describe("resolveComposerLayoutMode", () => {
  it("returns scrollCollapsed when the wheel fold is active", () => {
    expect(resolveComposerLayoutMode({ ...base, scrollCollapsed: true })).toBe("scrollCollapsed");
  });

  it("returns resting when idle with content", () => {
    expect(resolveComposerLayoutMode(base)).toBe("resting");
  });

  it("returns expanded when focused", () => {
    expect(resolveComposerLayoutMode({ ...base, isFocused: true })).toBe("expanded");
  });

  it("marks resting and scroll as collapsed chrome", () => {
    expect(isComposerLayoutCollapsed("resting")).toBe(true);
    expect(isComposerLayoutCollapsed("scrollCollapsed")).toBe(true);
    expect(isComposerLayoutCollapsed("expanded")).toBe(false);
  });
});
