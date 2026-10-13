import { describe, expect, it } from "vitest";
import { resolveComposerLayoutMode } from "./composer-resting-state";

/**
 * Hook wiring is covered via agent-panel integration; this file locks the
 * unified mode table the hook consumes (including attachment→no scroll fold).
 */
describe("useComposerResting mode table", () => {
  it("prefers scrollCollapsed over resting", () => {
    expect(
      resolveComposerLayoutMode({
        timelineHasContent: true,
        isFocused: false,
        isMultiline: false,
        hasAttachments: false,
        scrollCollapsed: true,
      }),
    ).toBe("scrollCollapsed");
  });

  it("rests when idle with content and no attachments", () => {
    expect(
      resolveComposerLayoutMode({
        timelineHasContent: true,
        isFocused: false,
        isMultiline: false,
        hasAttachments: false,
        scrollCollapsed: false,
      }),
    ).toBe("resting");
  });

  it("stays expanded with attachments even when blurred", () => {
    expect(
      resolveComposerLayoutMode({
        timelineHasContent: true,
        isFocused: false,
        isMultiline: false,
        hasAttachments: true,
        scrollCollapsed: false,
      }),
    ).toBe("expanded");
  });
});
