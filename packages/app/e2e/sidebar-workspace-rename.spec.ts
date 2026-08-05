import { expect, test } from "./fixtures";
import { gotoAppShell } from "./helpers/app";
import { seedWorkspace } from "./helpers/seed-client";
import { createIdleAgent } from "./helpers/archive-tab";
import { sidebarThreadRowLocator, waitForSidebarHydration } from "./helpers/workspace-ui";

test.describe("Sidebar thread rename", () => {
  test("renaming via the thread context menu updates the title in the sidebar", async ({
    page,
  }) => {
    const workspace = await seedWorkspace({ repoPrefix: "sidebar-rename-" });
    const agent = await createIdleAgent(workspace.client, {
      cwd: workspace.repoPath,
      title: "Feature Rename",
    });

    try {
      await gotoAppShell(page);
      await waitForSidebarHydration(page);

      const row = sidebarThreadRowLocator(page, agent.id);
      await expect(row).toBeVisible({ timeout: 30_000 });
      await row.click({ button: "right" });
      await page.getByTestId("sidebar-v2-menu-rename").click();

      const input = row.getByRole("textbox");
      await expect(input).toBeVisible({ timeout: 10_000 });
      await input.fill("Feature Rename 2");
      await input.press("Enter");

      await expect(row).toContainText("Feature Rename 2", { timeout: 30_000 });
    } finally {
      await workspace.cleanup();
    }
  });
});
