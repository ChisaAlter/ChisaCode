import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("workbench fidelity style boundaries", () => {
  it("keeps the message stream aligned to the framed desktop canvas", () => {
    const source = readSource("../../agent-stream/view.tsx");

    expect(source).toContain("marginTop: -WORKBENCH_FRAME_HAIRLINE_OFFSET");
  });

  it("uses the reference system font only on the desktop Electron workspace", () => {
    const source = readSource("../../app/_layout/AppContainer.tsx");

    expect(source).toContain('[data-testid="app-surface"] *');
    expect(source).toContain("font-family: system-ui");
    expect(source).toContain('pathname.includes("/workspace/")');
  });

  it("uses Codex-style stacked floating environment cards", () => {
    const source = readSource("./workspace-environment-panel.tsx");

    expect(source).toContain("function EnvironmentInfoCard");
    expect(source).toContain("function TaskProgressCard");
    expect(source).toContain("{progress ? <TaskProgressCard progress={progress} /> : null}");
    expect(source).toContain("WORKBENCH_ENVIRONMENT_PANEL_SHADOW");
    expect(source).toContain('testID="workspace-environment-panel"');
    expect(source).toContain('testID="workspace-task-progress-panel"');
    expect(source).not.toContain("environmentDockTabs");
  });

  it("uses the reference glyphs for the desktop workbench tabs", () => {
    const tabsSource = readSource("./workspace-desktop-tabs-row.tsx");
    const headerSource = readSource("./workspace-header.tsx");

    expect(tabsSource).toContain('agent: "✦"');
    expect(tabsSource).toContain('terminal: "▸"');
    expect(tabsSource).toContain('browser: "◎"');
    // Soft topbar title is plain session label (no icon chip in header).
    expect(headerSource).toContain("function DesktopWorkspaceHeaderTitle");
    expect(headerSource).toContain('testID="workspace-header-title"');
  });

  it("keeps Agent panel wrappers transparent above the Liquid Glass workspace canvas", () => {
    const source = readSource("../../panels/agent-panel.tsx");

    expect(source).toContain('from "@/styles/workbench-surface-roles"');
    expect(source.match(/resolveThemeWorkbenchSurfaceRoles\(theme\)\.content/g)).toHaveLength(4);
    expect(source).not.toContain("backgroundColor: theme.colors.surfaceWorkspace");
  });

  it("keeps the new-workspace Soft Home draft vertically centered on desktop", () => {
    const source = readSource("../new-workspace-screen.tsx");
    const softHomeSource = readSource("../../composer/draft/soft-home-empty.tsx");

    expect(source).toContain("SoftHomeEmpty");
    expect(source).toContain("softHomeComposerInputAreaStyle");
    expect(source).toContain("function ImportSessionAction");
    expect(source).toContain('variant="ghost"');
    expect(source).not.toContain("contentCentered");
    expect(source).not.toContain("ImportSessionCard");
    expect(source).not.toContain("styles.importCard");
    // Soft Home host owns horizontal inset on all form factors (no double dock pad).
    expect(source).toContain("inputAreaStyle={softHomeComposerInputAreaStyle}");
    // Shared Soft Home shell owns optical vertical placement.
    expect(softHomeSource).toContain("softHomeTopInset");
    expect(softHomeSource).toContain("resolveSoftHomeTopInset");
    expect(softHomeSource).toContain("useWindowDimensions");
    // Compact Soft Home keeps a mini hero (not bottom-sheet-only dock).
    expect(softHomeSource).toContain("softHomeTitleCompact");
    expect(softHomeSource).toContain("<SoftHomeHero");
    expect(softHomeSource).toContain("compact={compact}");
  });

  it("shares Soft composer card elevation with native platforms", () => {
    const inputSource = readSource("../../composer/input/input.tsx");
    const layoutSource = readSource("../../composer/draft/soft-home-layout.ts");

    expect(layoutSource).toContain("function resolveSoftComposerCardElevation");
    expect(inputSource).toContain("resolveSoftComposerCardElevation");
    expect(layoutSource).toContain("elevation: 3");
  });

  it("hides the Soft compact tab wall until at least two tabs exist", () => {
    const source = readSource("./workspace-center-column.tsx");

    expect(source).toContain("shouldShowMobileWorkspaceTabSwitcher");
    expect(source).toContain("shouldShowMobileWorkspaceTabSwitcher(mobileTabSwitcher.tabs.length)");
  });

  it("uses Soft soft-pill branch ctx on the compact session header", () => {
    const source = readSource("./workspace-header.tsx");

    expect(source).toContain('testID="workspace-header-title"');
    expect(source).toContain('presentation="soft-pill"');
    expect(source).toContain("compactHeaderTitleRow");
  });
});
