import { expect, test } from "./fixtures";
import { expectComposerVisible } from "./helpers/composer";
import { openAgentRoute, seedMockAgentWorkspace } from "./helpers/mock-agent";

async function expectBoxCloseTo(
  value: number,
  expected: number,
  tolerance: number,
  label: string,
): Promise<void> {
  expect(
    Math.abs(value - expected),
    `${label}: expected ${value} near ${expected}`,
  ).toBeLessThanOrEqual(tolerance);
}

test.describe("Workspace desktop layout prototype", () => {
  test("matches the prototype shell and core desktop interactions", async ({ page }) => {
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
      const tabsRow = page.getByTestId("workspace-tabs-row").filter({ visible: true }).first();
      const environmentRail = page.getByTestId("workspace-environment-rail");

      await expect(sidebar).toBeVisible({ timeout: 30_000 });
      await expect(mainPanel).toBeVisible({ timeout: 30_000 });
      await expect(tabsRow).toBeVisible({ timeout: 30_000 });
      await expect(environmentRail).toBeVisible({ timeout: 30_000 });
      await expectComposerVisible(page, { timeout: 30_000 });

      const sidebarBox = await sidebar.boundingBox();
      const panelBox = await mainPanel.boundingBox();
      const tabsBox = await tabsRow.boundingBox();
      const railBox = await environmentRail.boundingBox();
      expect(sidebarBox).not.toBeNull();
      expect(panelBox).not.toBeNull();
      expect(tabsBox).not.toBeNull();
      expect(railBox).not.toBeNull();

      await expectBoxCloseTo(sidebarBox!.width, 320, 4, "sidebar width");
      await expectBoxCloseTo(tabsBox!.height, 56, 2, "tabs row height");
      await expectBoxCloseTo(railBox!.width, 300, 2, "environment rail width");
      expect(panelBox!.x, "main panel sits to the right of the sidebar").toBeGreaterThan(
        sidebarBox!.x + sidebarBox!.width,
      );
      expect(railBox!.x, "environment rail floats inside the main panel").toBeGreaterThan(
        panelBox!.x,
      );
      expect(
        railBox!.x + railBox!.width,
        "environment rail stays inside panel",
      ).toBeLessThanOrEqual(panelBox!.x + panelBox!.width);

      await page.getByTestId("workspace-environment-toggle").click();
      await expect(environmentRail).toHaveCount(0);
      await page.getByTestId("workspace-environment-toggle").click();
      await expect(environmentRail).toBeVisible({ timeout: 10_000 });

      await page.getByTestId("workspace-new-terminal").click();
      await expect(
        page.locator('[data-testid^="workspace-tab-terminal"]').filter({ visible: true }).first(),
      ).toBeVisible({ timeout: 30_000 });

      await page.getByTestId("workspace-split-right").click();
      await expect(page.getByTestId("workspace-tabs-row").filter({ visible: true })).toHaveCount(
        2,
        { timeout: 30_000 },
      );
    } finally {
      await workspace.cleanup();
    }
  });
});
