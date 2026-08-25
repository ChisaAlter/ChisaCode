import { expect, type Page } from "@playwright/test";

export const gotoAppShell = async (page: Page) => {
  await page.goto("/");
};

/** Composer textbox locator, bilingual by accessibility name. */
export function composerInput(page: Page) {
  return page.getByRole("textbox", { name: /Message agent|给智能体发消息/i }).first();
}

export const gotoHome = async (page: Page) => {
  await gotoAppShell(page);
  const composer = composerInput(page);
  // The app renders zh-CN by default; accept both language variants.
  const entryButton = page
    .getByText(/^(Add a project|Add project|添加项目)$/)
    .or(page.getByText(/^(New agent|新智能体|新建智能体)$/))
    .first();

  await expect
    .poll(
      async () =>
        (await composer.isVisible().catch(() => false)) ||
        (await entryButton.isVisible().catch(() => false)),
      { timeout: 10_000 },
    )
    .toBe(true);

  if (!(await composer.isVisible().catch(() => false))) {
    await entryButton.click();
  }

  await expect(composer).toBeVisible({ timeout: 30_000 });
};

export const openSettings = async (page: Page) => {
  // Navigate through the real app control so route changes stay aligned with UI behavior.
  const settingsButton = page.locator('[data-testid="sidebar-settings"]:visible').first();
  await expect(settingsButton).toBeVisible();
  await settingsButton.click();
  await expect(page).toHaveURL(/\/settings\/general(?:\?.*)?$/);
};

// The former draft-composer helpers (setWorkingDirectory, selectProvider,
// selectModel, selectMode, createAgent, createAgentWithConfig,
// createAgentInRepo, ensureHostSelected) were deleted 2026-08-25: no spec
// imported them and they drove testIDs that no longer exist in the app
// (working-directory-select, agent-model-selector, draft-*-select,
// agent-thinking-menu, worktree-attach-*). See
// docs/testing/client-e2e-test-hardening-plan-2026-08-25.md §2. Specs seed
// agents through the daemon client (createIdleAgent / seed-client) instead.
