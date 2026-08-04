import { expect, test } from "./fixtures";
import { expectComposerVisible } from "./helpers/composer";
import { openAgentRoute, seedMockAgentWorkspace } from "./helpers/mock-agent";
import { expectNoTerminalTabs } from "./helpers/workspace-tabs";

test.describe("Workspace desktop layout production chrome", () => {
  test("matches the production shell and adversarial surface paths", async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1280, height: 720 });
    const workspace = await seedMockAgentWorkspace({
      repoPrefix: "workspace-layout-prototype-",
      title: "你好啊",
      initialPrompt: "你好啊",
      model: "ten-second-stream",
    });

    try {
      await openAgentRoute(page, {
        workspaceId: workspace.workspaceId,
        agentId: workspace.agentId,
      });

      const sidebar = page.getByTestId("desktop-left-sidebar");
      const mainPanel = page.getByTestId("workspace-main-panel");
      const layoutControls = page.getByTestId("workspace-layout-controls");
      const rightPanelToggle = page.getByTestId("workspace-right-panel-toggle");
      const terminalDrawerToggle = page.getByTestId("workspace-terminal-drawer-toggle");
      const softTopbar = page.getByTestId("workspace-desktop-soft-topbar");
      const headerActions = page.getByTestId("workspace-header-actions");

      await expect(sidebar).toBeVisible({ timeout: 30_000 });
      await expect(mainPanel).toBeVisible({ timeout: 30_000 });
      await expect(softTopbar).toBeVisible({ timeout: 30_000 });
      await expect(layoutControls).toBeVisible({ timeout: 30_000 });
      await expect(rightPanelToggle).toBeVisible({ timeout: 30_000 });
      await expect(terminalDrawerToggle).toBeVisible({ timeout: 30_000 });
      await expect(headerActions).toBeVisible({ timeout: 30_000 });
      await expectComposerVisible(page, { timeout: 30_000 });

      // Desktop Git write path remains on the soft topbar (single write surface).
      await expect(page.getByTestId("git-actions-split-button").first()).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByTestId("changes-primary-cta").first()).toBeVisible({
        timeout: 15_000,
      });

      const sidebarBox = await sidebar.boundingBox();
      const panelBox = await mainPanel.boundingBox();
      expect(sidebarBox).not.toBeNull();
      expect(panelBox).not.toBeNull();
      expect(
        panelBox!.x,
        "main panel starts at or after the sidebar right edge",
      ).toBeGreaterThanOrEqual(sidebarBox!.x + sidebarBox!.width - 1);
      expect(panelBox!.x + panelBox!.width, "main panel extends past the sidebar").toBeGreaterThan(
        sidebarBox!.x + sidebarBox!.width,
      );

      // Right panel open/close + empty surface chooser.
      await rightPanelToggle.click();
      const rightPanel = page.getByTestId("workspace-right-panel");
      await expect(rightPanel).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId("workspace-right-panel-empty")).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.getByTestId("workspace-right-panel-card-files")).toBeVisible();
      await expect(page.getByTestId("workspace-right-panel-card-diff")).toBeVisible();
      await expect(page.getByTestId("workspace-right-panel-card-terminal")).toBeVisible();

      // Adversarial: open Files surface and require real explorer tree host.
      await page.getByTestId("workspace-right-panel-card-files").click();
      await expect(page.getByTestId("workspace-right-panel-surface-files")).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByTestId("file-explorer-tree-scroll")).toBeVisible({
        timeout: 20_000,
      });

      // Switch to Diff surface content (git workspace from seedMockAgentWorkspace).
      await rightPanelToggle.click(); // close
      await expect(rightPanel).toHaveCount(0);
      await rightPanelToggle.click(); // reopen empty chooser
      await expect(page.getByTestId("workspace-right-panel-empty")).toBeVisible({
        timeout: 10_000,
      });
      await page.getByTestId("workspace-right-panel-card-diff").click();
      await expect(page.getByTestId("workspace-right-panel-surface-diff")).toBeVisible({
        timeout: 15_000,
      });

      // P1: Open Git workbench routes to right-panel Diff, not floating env write UI.
      await page.getByTestId("workspace-right-panel-close").click();
      await expect(page.getByTestId("workspace-right-panel")).toHaveCount(0);
      await page.getByTestId("workspace-header-menu-trigger").click();
      await page.getByTestId("workspace-header-open-git-dock").click();
      await expect(page.getByTestId("workspace-right-panel")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId("workspace-right-panel-surface-diff")).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByTestId("workspace-environment-rail")).toHaveCount(0);

      // Terminal drawer dual entry must not force a center terminal tab.
      await page.getByTestId("workspace-right-panel-close").click();
      await expect(page.getByTestId("workspace-right-panel")).toHaveCount(0);
      await expectNoTerminalTabs(page);
      await terminalDrawerToggle.click();
      const terminalDrawer = page.getByTestId("workspace-terminal-drawer");
      await expect(terminalDrawer).toBeVisible({ timeout: 15_000 });
      // Ownership invariant: drawer session stays out of the center tab strip.
      await expectNoTerminalTabs(page);
      await page.getByTestId("workspace-terminal-drawer-close").click();
      await expect(terminalDrawer).toHaveCount(0);
      await expectNoTerminalTabs(page);

      // Split still available from tabs chrome when multiple tabs exist.
      const newAgent = page.getByTestId("workspace-new-agent-tab").first();
      if (await newAgent.isVisible().catch(() => false)) {
        await newAgent.click();
      }
      const splitRight = page.getByTestId("workspace-split-right");
      if (await splitRight.isVisible().catch(() => false)) {
        await splitRight.click();
        await expect(page.getByTestId("workspace-tabs-row").filter({ visible: true })).toHaveCount(
          2,
          { timeout: 30_000 },
        );
      }
    } finally {
      await workspace.cleanup();
    }
  });
});
