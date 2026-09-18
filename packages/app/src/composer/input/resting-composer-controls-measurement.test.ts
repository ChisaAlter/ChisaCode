import { describe, expect, it } from "vitest";

import { layoutRestingComposerControls } from "./resting-composer-controls-measurement";

const ctl = (
  id: string,
  width: number,
  extra: Partial<{ flexible: boolean; minWidth: number; pinned: boolean }> = {},
) => ({ id, width, ...extra });

describe("layoutRestingComposerControls", () => {
  it("keeps every control inline when they all fit", () => {
    const layout = layoutRestingComposerControls({
      availableWidth: 300,
      controls: [ctl("model", 100), ctl("attach", 32), ctl("send", 34)],
      overflowButtonWidth: 28,
    });
    expect(layout.visibleIds).toEqual(["model", "attach", "send"]);
    expect(layout.overflowIds).toEqual([]);
    expect(layout.needsOverflowButton).toBe(false);
  });

  it("returns an empty layout for no controls", () => {
    const layout = layoutRestingComposerControls({
      availableWidth: 100,
      controls: [],
      overflowButtonWidth: 28,
    });
    expect(layout.visibleIds).toEqual([]);
    expect(layout.overflowIds).toEqual([]);
    expect(layout.needsOverflowButton).toBe(false);
  });

  it("overflows right-to-left until the row plus the trigger fits", () => {
    const layout = layoutRestingComposerControls({
      availableWidth: 100,
      controls: [ctl("a", 40), ctl("b", 40), ctl("c", 40)],
      overflowButtonWidth: 28,
      gap: 4,
    });
    // visible = a(40) + gap(4) + b? -> 40+4+40+28+4 = 116 > 100, so b must go too.
    // visible = a(40) + gap(4) + btn(28) = 72 <= 100.
    expect(layout.visibleIds).toEqual(["a"]);
    expect(layout.overflowIds).toEqual(["b", "c"]);
    expect(layout.needsOverflowButton).toBe(true);
  });

  it("accounts for the overflow trigger width when deciding", () => {
    const layout = layoutRestingComposerControls({
      availableWidth: 70,
      controls: [ctl("a", 40), ctl("b", 40)],
      overflowButtonWidth: 28,
      gap: 0,
    });
    // Natural 80 > 70 -> overflow. a(40) + btn(28) = 68 <= 70 -> only b goes.
    expect(layout.visibleIds).toEqual(["a"]);
    expect(layout.overflowIds).toEqual(["b"]);
  });

  it("lets the trigger width force additional overflows", () => {
    const layout = layoutRestingComposerControls({
      availableWidth: 60,
      controls: [ctl("a", 40), ctl("b", 40)],
      overflowButtonWidth: 28,
      gap: 0,
    });
    // [a]+btn = 68 > 60 -> a must overflow too; the trigger alone fits (28<=60).
    expect(layout.visibleIds).toEqual([]);
    expect(layout.overflowIds).toEqual(["a", "b"]);
    expect(layout.needsOverflowButton).toBe(true);
  });

  it("never overflows a pinned control", () => {
    const layout = layoutRestingComposerControls({
      availableWidth: 60,
      controls: [ctl("a", 40), ctl("send", 34, { pinned: true })],
      overflowButtonWidth: 28,
    });
    // a overflows (40+34+28 > 60); pinned send stays even if total exceeds.
    expect(layout.visibleIds).toEqual(["send"]);
    expect(layout.overflowIds).toEqual(["a"]);
  });

  it("shrinks a flexible control to its minimum before overflowing anything", () => {
    const layout = layoutRestingComposerControls({
      availableWidth: 100,
      controls: [
        ctl("model", 80, { flexible: true, minWidth: 30 }),
        ctl("send", 34, { pinned: true }),
      ],
      overflowButtonWidth: 28,
      gap: 4,
    });
    // Floor 30 fits (30+4+34=68<=100); slack 100-68=32 grows it back to 62.
    expect(layout.visibleIds).toEqual(["model", "send"]);
    expect(layout.overflowIds).toEqual([]);
    expect(layout.flexibleWidths.model).toBe(62);
    expect(layout.needsOverflowButton).toBe(false);
  });

  it("restores leftover slack to a visible flexible control", () => {
    const layout = layoutRestingComposerControls({
      availableWidth: 90,
      controls: [
        ctl("model", 60, { flexible: true, minWidth: 30 }),
        ctl("attach", 32),
        ctl("send", 34, { pinned: true }),
      ],
      overflowButtonWidth: 28,
      gap: 4,
    });
    // Natural: 60+4+32+4+34 = 134 > 90. Shrink model to 30: 30+4+32+4+34=104 >90.
    // Overflow attach: model+4+send = 30+4+34=68 + gap(4)+btn(28) = 100 > 90?
    // 30+4+34 + 4 + 28 = 100 > 90 -> attach AND model? model flexible at floor 30.
    // Overflow order right-to-left non-pinned: attach first. Still 100>90,
    // then model (flexible, non-pinned) overflows too.
    expect(layout.overflowIds).toEqual(["model", "attach"]);
    expect(layout.visibleIds).toEqual(["send"]);
  });

  it("overflows a flexible control when even its floor does not fit", () => {
    const layout = layoutRestingComposerControls({
      availableWidth: 50,
      controls: [
        ctl("model", 80, { flexible: true, minWidth: 30 }),
        ctl("send", 34, { pinned: true }),
      ],
      overflowButtonWidth: 28,
      gap: 4,
    });
    // floor: 30+4+34 = 68 > 50 -> model overflows; send stays pinned.
    expect(layout.visibleIds).toEqual(["send"]);
    expect(layout.overflowIds).toEqual(["model"]);
  });

  it("gives a flexible control partial slack up to its natural width", () => {
    const layout = layoutRestingComposerControls({
      availableWidth: 120,
      controls: [
        ctl("model", 60, { flexible: true, minWidth: 30 }),
        ctl("attach", 32),
        ctl("send", 34, { pinned: true }),
      ],
      overflowButtonWidth: 28,
      gap: 4,
    });
    // Natural 134 > 120. Shrink model to 30: 104 <= 120 -> all visible.
    // slack = 120 - 104 = 16 -> model grows to 46.
    expect(layout.visibleIds).toEqual(["model", "attach", "send"]);
    expect(layout.flexibleWidths.model).toBe(46);
  });

  it("ignores gap for a single visible control", () => {
    const layout = layoutRestingComposerControls({
      availableWidth: 40,
      controls: [ctl("a", 40), ctl("send", 34, { pinned: true })],
      overflowButtonWidth: 28,
      gap: 4,
    });
    // visible = send(34) + btn(28) + gap(4) = 66 > 40 — still overflows only a;
    // pinned stays regardless.
    expect(layout.visibleIds).toEqual(["send"]);
    expect(layout.overflowIds).toEqual(["a"]);
  });
});
