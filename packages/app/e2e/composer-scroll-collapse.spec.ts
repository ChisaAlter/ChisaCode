import { expect } from "@playwright/test";
import { buildHostWorkspaceRoute } from "@/utils/host-routes";
import { test } from "./fixtures";
import { expectAgentIdle } from "./helpers/agent-stream";
import { connectSeedClient } from "./helpers/seed-client";
import { getServerId } from "./helpers/server-id";
import { createTempGitRepo } from "./helpers/workspace";
import { expectComposerEditable, expectComposerVisible } from "./helpers/composer";

// M8 gate: scrolling up through history folds the composer to a single-line
// pill; focusing / returning to bottom expands it again.
test.describe("Composer scroll collapse", () => {
  test("collapses on upward scroll and expands on focus and on return to bottom", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const serverId = getServerId();
    const repo = await createTempGitRepo("scroll-collapse-");
    const client = await connectSeedClient();
    try {
      const opened = await client.openProject(repo.path);
      if (!opened.workspace) {
        throw new Error(opened.error ?? "openProject failed");
      }
      const agent = await client.createAgent({
        provider: "mock",
        cwd: repo.path,
        model: "ten-second-stream",
        initialPrompt: "Stream a code fence.",
      });
      const agentUrl = `${buildHostWorkspaceRoute(serverId, repo.path)}?open=${encodeURIComponent(
        `agent:${agent.id}`,
      )}`;
      await page.goto(agentUrl);
      await expectComposerVisible(page);

      // Grow the stream so there is meaningful scrollback to read.
      await expectAgentIdle(page, 90_000);
      await expectComposerEditable(page);
      for (let index = 0; index < 3; index += 1) {
        const input = page.getByRole("textbox", { name: /给智能体发消息|Message agent/i }).first();
        await input.fill("Stream a code fence.");
        await input.press("Enter");
        await expectAgentIdle(page, 120_000);
        await expectComposerEditable(page);
      }

      const scroll = page.getByTestId("agent-chat-scroll");
      await expect(scroll).toBeVisible();
      const card = page.getByTestId("composer-input-card");
      const textbox = page.getByRole("textbox", { name: /给智能体发消息|Message agent/i }).first();

      // Fill the draft so the collapsed pill has real text to truncate.
      await textbox.fill("draft text that should survive the collapse cycle");

      // Fold upward wheel gestures until the card collapses (24px per fold).
      for (let index = 0; index < 8 && !(await isCollapsed(page)); index += 1) {
        await scroll.hover();
        await page.mouse.wheel(0, -40);
        await page.waitForTimeout(120);
      }
      await expect
        .poll(async () => isCollapsed(page), { timeout: 5_000, intervals: [200] })
        .toBe(true);
      const collapsedState = await card.evaluate((element) => {
        const style = window.getComputedStyle(element);
        return { radius: style.borderRadius, cardHeight: style.height };
      });
      expect(Number.parseFloat(collapsedState.cardHeight)).toBeLessThan(70);

      // Draft text survives the collapse.
      await expect(textbox).toHaveValue("draft text that should survive the collapse cycle");

      // Pointer-down on the collapsed card expands it again.
      await card.click();
      await expect
        .poll(async () => (await readCardHeight(page)) > 70, {
          timeout: 5_000,
          intervals: [200],
        })
        .toBe(true);

      // Collapse again, then return to bottom → expands.
      for (let index = 0; index < 8 && !(await isCollapsed(page)); index += 1) {
        await scroll.hover();
        await page.mouse.wheel(0, -40);
        await page.waitForTimeout(120);
      }
      await expect
        .poll(async () => (await readCardHeight(page)) < 70, {
          timeout: 5_000,
          intervals: [200],
        })
        .toBe(true);
      await page.getByTestId("scroll-to-bottom-button").click();
      await expect
        .poll(async () => (await readCardHeight(page)) > 70, {
          timeout: 10_000,
          intervals: [200],
        })
        .toBe(true);
    } finally {
      await client.close().catch(() => undefined);
      await repo.cleanup();
    }
  });
});

function readCardHeight(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate(() =>
    Number.parseFloat(
      window.getComputedStyle(
        document.querySelector('[data-testid="composer-input-card"]') ?? new HTMLElement(),
      ).height,
    ),
  );
}

async function isCollapsed(page: import("@playwright/test").Page): Promise<boolean> {
  return page.evaluate(() => {
    const card = document.querySelector('[data-testid="composer-input-card"]');
    if (!card) {
      return false;
    }
    const cardStyle = window.getComputedStyle(card);
    const cbar = card.lastElementChild;
    const cbarStyle = cbar ? window.getComputedStyle(cbar) : null;
    return (
      Number.parseFloat(cardStyle.height) < 70 &&
      (!cbarStyle || cbarStyle.opacity === "0" || cbarStyle.height === "0px")
    );
  });
}
