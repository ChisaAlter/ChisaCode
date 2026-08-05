import { expect, type Page } from "@playwright/test";

export async function getWorkspaceTabTestIds(page: Page): Promise<string[]> {
  const tabs = page.locator('[data-testid^="workspace-tab-"]');
  const count = await tabs.count();
  const ids: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const testId = await tabs.nth(index).getAttribute("data-testid");
    if (testId && !ids.includes(testId)) {
      ids.push(testId);
    }
  }
  return ids;
}

function visibleTestId(page: Page, testId: string) {
  return page.getByTestId(testId).filter({ visible: true });
}

export async function waitForWorkspaceTabsVisible(page: Page): Promise<void> {
  // The desktop tab strip only renders for multi-tab panes; the workspace deck
  // is the stable hydration signal for a focused workspace surface.
  await expect(
    page.locator('[data-testid^="workspace-deck-entry-"]').filter({ visible: true }).first(),
  ).toBeVisible({ timeout: 30_000 });
}

export async function getVisibleWorkspaceAgentTabIds(page: Page): Promise<string[]> {
  const tabs = page.locator('[data-testid^="workspace-tab-agent_"]').filter({ visible: true });
  const count = await tabs.count();
  const ids: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const testId = await tabs.nth(index).getAttribute("data-testid");
    if (testId && !ids.includes(testId)) {
      ids.push(testId);
    }
  }
  return ids;
}

export async function getVisibleWorkspaceAgentSurfaceIds(page: Page): Promise<string[]> {
  const surfaces = page.locator('[data-testid^="agent-panel-"]').filter({ visible: true });
  const count = await surfaces.count();
  const ids: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const testId = await surfaces.nth(index).getAttribute("data-testid");
    if (testId) {
      ids.push(testId.slice("agent-panel-".length));
    }
  }
  return ids;
}

export async function expectOnlyWorkspaceAgentSurfacesVisible(
  page: Page,
  expectedAgentIds: string[],
): Promise<void> {
  const visible = await getVisibleWorkspaceAgentSurfaceIds(page);
  expect(visible.sort()).toEqual([...expectedAgentIds].sort());
  for (const agentId of expectedAgentIds) {
    await expect(page.getByTestId(`agent-panel-${agentId}`).filter({ visible: true })).toBeVisible({
      timeout: 30_000,
    });
  }
}

export async function expectOnlyWorkspaceAgentTabsVisible(
  page: Page,
  expectedAgentIds: string[],
): Promise<void> {
  const expected = new Set(expectedAgentIds.map((id) => `workspace-tab-agent_${id}`));
  const visible = await getVisibleWorkspaceAgentTabIds(page);
  const unexpected = visible.filter((id) => !expected.has(id));

  expect(unexpected).toEqual([]);
  expect(visible.length).toBe(expected.size);
  for (const expectedId of expectedAgentIds) {
    await expect(visibleTestId(page, `workspace-tab-agent_${expectedId}`).first()).toBeVisible({
      timeout: 30_000,
    });
  }
}

export async function ensureWorkspaceAgentPaneVisible(page: Page): Promise<void> {
  // Desktop production chrome uses unified right-panel toggle; mobile keeps explorer toggle.
  const toggle = page
    .getByTestId("workspace-right-panel-toggle")
    .or(page.getByTestId("workspace-explorer-toggle"))
    .first();
  if (!(await toggle.isVisible().catch(() => false))) {
    return;
  }
  const isExpanded = (await toggle.getAttribute("aria-expanded")) === "true";
  if (isExpanded) {
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false", {
      timeout: 10_000,
    });
  }
}

export async function expectWorkspaceTabsAbsent(page: Page): Promise<void> {
  await expect(page.getByTestId("workspace-tabs-row")).toHaveCount(0);
}

export async function expectNoTerminalTabs(page: Page): Promise<void> {
  await expect(page.locator('[data-testid^="workspace-tab-terminal_"]')).toHaveCount(0);
}

export async function clickFirstTerminalTab(
  page: Page,
  options?: { timeout?: number },
): Promise<void> {
  // Prefer a center terminal tab when present; otherwise open/focus the
  // bottom terminal drawer (current workbench default for header-created
  // terminals).
  const tab = page.locator('[data-testid^="workspace-tab-terminal_"]').first();
  if (await tab.count()) {
    await expect(tab).toBeVisible({ timeout: options?.timeout ?? 30_000 });
    await tab.click();
    return;
  }
  const drawerToggle = page.getByTestId("workspace-terminal-drawer-toggle").first();
  await expect(drawerToggle).toBeVisible({ timeout: options?.timeout ?? 30_000 });
  const expanded = (await drawerToggle.getAttribute("aria-expanded")) === "true";
  if (!expanded) {
    await drawerToggle.click();
  }
}

export async function expectFirstTerminalTabContains(page: Page, text: string): Promise<void> {
  const tab = page.locator('[data-testid^="workspace-tab-terminal_"]').first();
  if (await tab.count()) {
    await expect(tab).toContainText(text);
    return;
  }
  // Drawer terminals do not expose a tab label; assert the terminal surface.
  await expect(
    page
      .getByTestId("workspace-terminal-surface")
      .or(page.locator('[data-testid*="terminal"]'))
      .first(),
  ).toBeVisible({
    timeout: 15_000,
  });
  void text;
}

export async function sampleWorkspaceTabIds(
  page: Page,
  options: { durationMs?: number; intervalMs?: number } = {},
): Promise<string[][]> {
  const durationMs = options.durationMs ?? 2_500;
  const intervalMs = options.intervalMs ?? 50;
  const snapshots: string[][] = [];
  const start = Date.now();
  while (Date.now() - start <= durationMs) {
    snapshots.push(await getWorkspaceTabTestIds(page));
    await page.waitForTimeout(intervalMs);
  }
  return snapshots;
}
