import { expect, type Page } from "@playwright/test";
import { buildHostWorkspaceRoute } from "@/utils/host-routes";
import { composerInput, gotoHome } from "./app";

export async function openNewAgentComposer(page: Page): Promise<void> {
  await gotoHome(page);
}

/**
 * Wait for the v2 sidebar project surface (scope menu new-project button),
 * indicating the WebSocket is up and workspace hydration has completed.
 */
export async function waitForSidebarHydration(page: Page, timeout = 60_000): Promise<void> {
  await page.getByTestId("sidebar-v2-new-project").waitFor({ state: "visible", timeout });
}

/** Wait for the workspace deck to render its content slot (surface ready). */
export async function waitForWorkspaceTabsVisible(page: Page, timeout = 30_000): Promise<void> {
  await page
    .locator('[data-testid^="workspace-deck-entry-"]')
    .filter({ visible: true })
    .first()
    .waitFor({ state: "visible", timeout });
}

/** Assert the workspace center slot is not showing a terminal surface. */
export async function expectNoTerminalTabs(page: Page): Promise<void> {
  await expect(page.getByTestId("terminal-surface").filter({ visible: true })).toHaveCount(0);
}

/** Return the ids of all visible agent panels in the workspace center slot. */
export async function getVisibleWorkspaceAgentSurfaceIds(page: Page): Promise<string[]> {
  return page.locator('[data-testid^="agent-panel-"]').evaluateAll((nodes) =>
    nodes.flatMap((node) => {
      if (!(node instanceof HTMLElement)) {
        return [];
      }
      const testId = node.getAttribute("data-testid") ?? "";
      if (!testId.startsWith("agent-panel-")) {
        return [];
      }
      if (node.offsetParent === null) {
        return [];
      }
      return [testId.slice("agent-panel-".length)];
    }),
  );
}

/** Assert exactly the given agent panels are visible in the workspace center slot. */
export async function expectOnlyWorkspaceAgentSurfacesVisible(
  page: Page,
  agentIds: string[],
): Promise<void> {
  await expect
    .poll(() => getVisibleWorkspaceAgentSurfaceIds(page), { timeout: 30_000 })
    .toEqual(agentIds);
}

/** Assert the workspace center slot shows no content panel at all. */
export async function expectWorkspaceTabsAbsent(page: Page): Promise<void> {
  await expect(
    page
      .locator(
        '[data-testid^="agent-panel-"], [data-testid="terminal-surface"], [data-testid="workspace-file-pane"]',
      )
      .filter({ visible: true }),
  ).toHaveCount(0);
}

/** The v2 sidebar row for an agent thread. */
export function sidebarThreadRowLocator(page: Page, agentId: string) {
  return page.getByTestId(`sidebar-v2-thread-${agentId}`);
}

export function workspaceLabelFromPath(value: string): string {
  const normalized = value.replace(/\\/g, "/").replace(/\/+$/, "");
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? normalized;
}

/** Project basename shown by the desktop soft topbar breadcrumb lead. */
function projectLabelFromDisplayName(displayName: string): string {
  const slash = Math.max(displayName.lastIndexOf("/"), displayName.lastIndexOf("\\"));
  const label = slash >= 0 ? displayName.slice(slash + 1) : displayName;
  return label.length > 0 ? label : displayName;
}

/**
 * Opens a workspace by clicking its agent thread in the SidebarV2 sidebar.
 * The agent route redirects to the workspace route.
 */
export async function switchAgentViaSidebar(page: Page, agentId: string): Promise<void> {
  const row = sidebarThreadRowLocator(page, agentId);
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.click();
  await expect(page).toHaveURL(/\/workspace\//, { timeout: 30_000 });
}

/**
 * Opens a workspace by route. SidebarV2 lists agent threads, not workspaces,
 * so agent-less workspaces are reachable only by URL.
 */
export async function openWorkspaceViaRoute(
  page: Page,
  serverId: string,
  workspaceId: string,
): Promise<void> {
  await page.goto(buildHostWorkspaceRoute(serverId, workspaceId), {
    waitUntil: "domcontentloaded",
  });
  await page.waitForURL((url) => url.pathname.includes("/workspace/"), { timeout: 60_000 });
}

export async function expectSidebarThreadActive(input: {
  page: Page;
  agentId: string;
  selected?: boolean;
}): Promise<void> {
  const row = sidebarThreadRowLocator(input.page, input.agentId);
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(row).toHaveAttribute("aria-selected", input.selected === false ? "false" : "true", {
    timeout: 30_000,
  });
}

/**
 * Wait for an agent's thread row to appear in the sidebar, confirming the
 * agent snapshot has been hydrated into the session store.
 */
export async function waitForThreadInSidebar(page: Page, agentId: string): Promise<void> {
  await sidebarThreadRowLocator(page, agentId).waitFor({ state: "visible", timeout: 60_000 });
}

export async function expectWorkspaceHeader(
  page: Page,
  input: { title: string; subtitle: string },
): Promise<void> {
  const titleLocator = page.getByTestId("workspace-header-title").filter({ visible: true });
  // Desktop soft topbar renders the project as a breadcrumb lead
  // (workspace-header-workspace-ctx) instead of a subtitle; mobile keeps the
  // subtitle testid. Match on the project basename, which both surfaces show.
  const projectSurface = page
    .getByTestId("workspace-header-subtitle")
    .filter({ visible: true })
    .or(page.getByTestId("workspace-header-workspace-ctx").filter({ visible: true }));
  const projectLabel = projectLabelFromDisplayName(input.subtitle);

  await expect(titleLocator.first()).toHaveText(input.title, {
    timeout: 30_000,
  });
  await expect(projectSurface.first()).toContainText(projectLabel, {
    timeout: 30_000,
  });
}

/**
 * Asserts the workspace header after a freshly created workspace opens. The
 * new workspace's agent title is daemon-generated (unpredictable), so only
 * the header title presence and the breadcrumb project label are asserted.
 */
export async function expectNewWorkspaceHeader(
  page: Page,
  projectDisplayName: string,
): Promise<void> {
  await expect(
    page.getByTestId("workspace-header-title").filter({ visible: true }).first(),
  ).toBeVisible({ timeout: 30_000 });
  const projectLabel = projectLabelFromDisplayName(projectDisplayName);
  await expect(
    page.getByTestId("workspace-header-workspace-ctx").filter({ visible: true }).first(),
  ).toContainText(projectLabel, { timeout: 30_000 });
}

export async function expectReconnectingToastVisible(
  page: Page,
  options?: { timeout?: number },
): Promise<void> {
  await expect(page.getByTestId("agent-reconnecting-toast")).toBeVisible({
    timeout: options?.timeout ?? 30_000,
  });
}

export async function expectReconnectingToastGone(
  page: Page,
  options?: { timeout?: number },
): Promise<void> {
  await expect(page.getByTestId("agent-reconnecting-toast")).toHaveCount(0, {
    timeout: options?.timeout ?? 30_000,
  });
}

export async function expectHostConnectingOrOffline(
  page: Page,
  options?: { timeout?: number },
): Promise<void> {
  await expect(page.getByTestId("workspace-route-gate")).toBeVisible({
    timeout: options?.timeout ?? 30_000,
  });
}

export async function expectMenuButtonVisible(page: Page): Promise<void> {
  await expect(
    page
      .getByTestId("menu-button")
      .or(page.getByTestId("sidebar-settings"))
      .filter({ visible: true })
      .first(),
  ).toBeVisible({ timeout: 10_000 });
}

export async function expectWorkspaceHeaderAbsent(page: Page): Promise<void> {
  await expect(page.getByTestId("workspace-header-title")).toHaveCount(0);
}

export function workspaceDeckEntryLocator(page: Page, serverId: string, workspaceId: string) {
  return page.getByTestId(`workspace-deck-entry-${serverId}:${workspaceId}`);
}

export async function expectWorkspaceDeckEntryCount(page: Page, count: number): Promise<void> {
  await expect(page.locator('[data-testid^="workspace-deck-entry-"]')).toHaveCount(count);
}

export async function seedWorkspaceActivity(page: Page, marker: string): Promise<void> {
  const input = composerInput(page);
  await expect(input).toBeEditable({ timeout: 30_000 });
  await input.fill(marker);
  await input.press("Enter");
  await expect(page).toHaveURL(/\/workspace\//, { timeout: 30_000 });
}
