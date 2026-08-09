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

  it("keeps a T3-style shell DesktopSidebarControl that survives every route", () => {
    const appContainerSource = readSource("../../app/_layout/AppContainer.tsx");
    const controlSource = readSource("../../components/desktop/desktop-sidebar-control.tsx");
    const menuHeaderSource = readSource("../../components/headers/menu-header.tsx");
    const leftSidebarSource = readSource("../../components/left-sidebar.tsx");
    const softTopbarSource = readSource("./workspace-header.tsx");
    const softHomeSource = readSource("../new-workspace-screen.tsx");

    // Shell owns open/close (T3 SidebarControl) — not per-page header mounts.
    expect(appContainerSource).toContain("DesktopSidebarControl");
    expect(appContainerSource).toContain("<DesktopSidebarControl enabled={chromeEnabled} />");
    expect(appContainerSource).not.toContain("desktop-left-sidebar-open-focus");
    expect(appContainerSource).not.toContain("desktopSidebarRestoreRail");

    expect(controlSource).toContain('testID="desktop-sidebar-control"');
    expect(controlSource).toContain("PanelLeftClose");
    expect(controlSource).toContain("PanelLeft");
    expect(controlSource).toContain("toggleDesktopAgentList");
    expect(controlSource).toContain("useDesktopSidebarControlContentPad");
    // Pixel-match Soft sidebar search tile (not HeaderToggleButton border slot).
    expect(controlSource).toContain("ICON_SIZE.sm");
    expect(controlSource).toContain("borderWidth: 0");
    expect(controlSource).toContain("mutedColorMapping");
    expect(controlSource).not.toContain("HeaderToggleButton");
    expect(controlSource).toContain("TooltipTrigger");

    // Page-level SidebarMenuToggle is compact-only so Soft Home cannot lose the control.
    expect(menuHeaderSource).toContain("if (!isMobile) {");
    expect(menuHeaderSource).toContain("return null;");
    expect(menuHeaderSource).not.toContain("ThemedPanelLeft");

    // Open rail no longer hosts a second desktop close tile; top-row spacer only
    // (full-width「新对话」must not inherit shell-control left pad).
    expect(leftSidebarSource).toContain('testID="sidebar-close"');
    expect(leftSidebarSource).not.toContain("desktop-sidebar-close");
    expect(leftSidebarSource).toContain("desktopSidebarControlSpacer");
    expect(leftSidebarSource).not.toContain("useDesktopSidebarControlOverlayPad");

    // Content topbars clear the fixed control when the rail is collapsed.
    expect(softTopbarSource).toContain("useDesktopSidebarControlContentPad");
    expect(softHomeSource).toContain("useDesktopSidebarControlContentPad");
    expect(softHomeSource).not.toContain(
      "<SidebarMenuToggle />\n              <View style={styles.desktopSoftTopSpacer}",
    );
  });

  it("uses stacked floating goal / plan / subagents cards", () => {
    const source = readSource("./workspace-environment-panel.tsx");

    expect(source).toContain("function GoalCard");
    expect(source).toContain("function PlanProgressCard");
    expect(source).toContain("function SubagentsCard");
    expect(source).toContain("WORKBENCH_ENVIRONMENT_PANEL_SHADOW");
    expect(source).toContain('testID="workspace-environment-rail"');
    expect(source).toContain('testID="workspace-goal-panel"');
    expect(source).toContain('testID="workspace-task-progress-panel"');
    expect(source).toContain('testID="workspace-subagents-panel"');
    expect(source).not.toContain("function EnvironmentInfoCard");
    expect(source).not.toContain("environmentDockTabs");
  });

  it("uses the reference glyphs for the desktop workbench title chrome", () => {
    const headerSource = readSource("./workspace-header.tsx");

    // Desktop topbar follows T3 ChatHeader: project lead + session title breadcrumb.
    expect(headerSource).toContain("function DesktopWorkspaceHeaderTitle");
    expect(headerSource).toContain('testID="workspace-header-title"');
    expect(headerSource).toContain('testID="workspace-header-breadcrumb"');
    expect(headerSource).toContain("WorkspaceOpenInEditorButton");
    expect(headerSource).toContain("WorkspaceGitActions");
    expect(headerSource).toContain('testID="workspace-terminal-drawer-toggle"');
    expect(headerSource).toContain('testID="workspace-right-panel-toggle"');
  });

  it("hosts production right panel surfaces and terminal drawer", () => {
    const rightPanelSource = readSource("./workspace-right-panel.tsx");
    const drawerSource = readSource("./workspace-terminal-drawer.tsx");
    const screenSource = readSource("./workspace-screen.tsx");
    const chromeSource = readSource("./use-workspace-layout-chrome.ts");
    const centerSource = readSource("./workspace-center-column.tsx");
    const terminalsSource = readSource("./terminals/use-workspace-terminals.ts");
    const diffSource = readSource("../../git/diff-pane.tsx");
    const headerSource = readSource("./workspace-header.tsx");

    expect(rightPanelSource).toContain('testID="workspace-right-panel"');
    expect(rightPanelSource).toContain('testID="workspace-right-panel-empty"');
    expect(rightPanelSource).toContain("workspace.rightPanel.openASurface");
    expect(drawerSource).toContain('testID="workspace-terminal-drawer"');
    expect(screenSource).toContain("WorkspaceRightPanel");
    expect(screenSource).toContain("WorkspaceTerminalDrawer");
    expect(screenSource).toContain("useWorkspaceLayoutChrome");
    // P0: browser sessions are cleaned on right-panel close/unmount.
    expect(chromeSource).toContain("removeBrowser");
    expect(chromeSource).toContain("releaseRightPanelBrowser");
    // P0: drawer/right-panel terminal creation must not force a center tab.
    expect(chromeSource).toContain("openInCenterTab: false");
    expect(terminalsSource).toContain("openInCenterTab");
    expect(screenSource).toContain("openInCenterTab");
    // P0: mobile keeps a single Git write path (compact header + review band).
    expect(centerSource).toContain("WorkspaceGitActions");
    expect(centerSource).toContain('testID="workspace-mobile-header-actions"');
    expect(diffSource).toContain("showGitActions={isMobile}");
    // P1: Open Git dock routes to right-panel Diff, not floating env write UI.
    const dockSource = readSource("./use-workspace-dock-actions.ts");
    expect(dockSource).toContain("handleOpenEnvironmentChanges");
    expect(dockSource).toContain("openRightPanelDiff");
    expect(dockSource).toContain('command.type === "openGitSummary"');
    // P1: Git slot can force-load while checkout identity is pending.
    const gitActionsSource = readSource("../../git/workspace-actions.tsx");
    expect(gitActionsSource).toContain("forceLoading");
    expect(headerSource).toContain("forceLoading={isLoading}");
    expect(headerSource).toContain("showGitSlot");
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
    expect(layoutSource).toContain("elevation: 4");
  });

  it("renders a single content slot without any tab wall", () => {
    const source = readSource("./workspace-center-column.tsx");

    expect(source).not.toContain("shouldShowMobileWorkspaceTabSwitcher");
    expect(source).not.toContain("WorkspaceDesktopTabsRow");
    expect(source).toContain("<WorkspacePaneContent");
  });

  it("uses Soft soft-pill branch ctx on the compact session header", () => {
    const source = readSource("./workspace-header.tsx");

    expect(source).toContain('testID="workspace-header-title"');
    expect(source).toContain('presentation="soft-pill"');
    expect(source).toContain("compactHeaderTitleRow");
  });
});
