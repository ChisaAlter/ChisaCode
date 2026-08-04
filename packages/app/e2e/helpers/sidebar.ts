import { expect, type Page } from "@playwright/test";
import { buildHostWorkspaceRoute } from "../../src/utils/host-routes";
import { getServerId } from "./server-id";

/**
 * Opens a workspace. Soft Home + SidebarV2 do not render classic
 * `sidebar-workspace-row-*` nodes on the home list, so this navigates by route
 * (same pattern as openAgentRoute) and still accepts the legacy testid when present.
 */
export async function selectWorkspaceInSidebar(page: Page, workspaceId: string): Promise<void> {
  const serverId = getServerId();
  const legacyRow = page.getByTestId(`sidebar-workspace-row-${serverId}:${workspaceId}`);
  if (await legacyRow.count()) {
    await expect(legacyRow).toBeVisible({ timeout: 30_000 });
    await legacyRow.click();
    return;
  }
  await page.goto(buildHostWorkspaceRoute(serverId, workspaceId), {
    waitUntil: "domcontentloaded",
  });
  await page.waitForURL((url) => url.pathname.includes("/workspace/"), { timeout: 60_000 });
}

export async function expectWorkspaceListed(page: Page, name: string): Promise<void> {
  const classic = page.locator('[data-testid^="sidebar-workspace-row-"]').filter({ hasText: name });
  if (await classic.count()) {
    await expect(classic.first()).toBeVisible({ timeout: 30_000 });
    return;
  }
  await expect(
    page.locator('[data-testid^="sidebar-v2-thread-"]').filter({ hasText: name }).first(),
  ).toBeVisible({ timeout: 30_000 });
}

export async function openMobileAgentSidebar(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Open menu" }).click();
}

export async function closeMobileAgentSidebar(page: Page): Promise<void> {
  const closeButton = page.getByTestId("sidebar-close");
  await expect(closeButton).toBeInViewport({ timeout: 5_000 });
  await closeButton.click({ force: true });
}

export async function expectMobileAgentSidebarVisible(page: Page): Promise<void> {
  await expect(
    page.getByTestId("sidebar-sessions").or(page.getByTestId("desktop-left-sidebar")),
  ).toBeInViewport({ timeout: 5_000 });
}

export async function expectMobileAgentSidebarHidden(page: Page): Promise<void> {
  await expect(page.getByTestId("sidebar-sessions")).not.toBeInViewport({ timeout: 5_000 });
}
