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
    expect(headerSource).toContain(">✦</Text>");
  });

  it("keeps Agent panel wrappers transparent above the Liquid Glass workspace canvas", () => {
    const source = readSource("../../panels/agent-panel.tsx");

    expect(source).toContain('from "@/styles/workbench-surface-roles"');
    expect(source.match(/resolveThemeWorkbenchSurfaceRoles\(theme\)\.content/g)).toHaveLength(3);
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
    // Shared Soft Home shell owns optical vertical placement.
    expect(softHomeSource).toContain("softHomeTopInset");
    expect(softHomeSource).toContain("useWindowDimensions");
  });
});
