import { expect } from "@playwright/test";
import { test } from "./fixtures";
import { awaitAssistantMessage, expectAgentIdle } from "./helpers/agent-stream";
import { expectComposerEditable, startRunningMockAgent, submitMessage } from "./helpers/composer";

// M4 gate: a completed turn's trailing turn_changes renders as a collapsible
// changed-files tree under the assistant message; expanding lists grouped
// files with diff stats; clicking a file row opens its preview tab.
test.describe("Turn changes tree", () => {
  test("trailing turn_changes renders a collapsible tree on idle", async ({ page }) => {
    test.setTimeout(180_000);
    const { client, repo } = await startRunningMockAgent(page, {
      prefix: "turn-changes-",
      model: "one-minute-stream",
      prompt: "End the turn with a tool run.",
    });
    try {
      await awaitAssistantMessage(page);
      await expectAgentIdle(page, 90_000);
      await expectComposerEditable(page);

      // Submit once more on the idle agent so the turn completes while the
      // page is already interactive (avoids the cold-bundle race swallowing
      // the trailing payload before assertions begin).
      await submitMessage(page, "End the turn with a tool run.");
      await expectAgentIdle(page, 120_000);

      const tree = page.getByTestId("turn-changes-tree").last();
      await expect(tree).toBeVisible({ timeout: 30_000 });
      // Collapsed by default: only the header row shows.
      await expect(tree.getByTestId("turn-changes-header")).toBeVisible();
      expect(await tree.getByTestId("turn-changes-file-row").count()).toBe(0);

      // Expand: file rows render with the fixture paths.
      await tree.getByTestId("turn-changes-header").click();
      await expect(tree.getByTestId("turn-changes-file-row").first()).toBeVisible({
        timeout: 10_000,
      });
      const rowCount = await tree.getByTestId("turn-changes-file-row").count();
      expect(rowCount).toBeGreaterThanOrEqual(4);

      // Directory grouping: the shared parent directory renders as a row.
      await expect(tree.getByText(/packages\/app\/src\/hooks\//).first()).toBeVisible();

      // Click a file row → its preview tab opens (file tab title/path shows).
      await tree.getByTestId("turn-changes-file-row").first().click();
      await page.waitForURL(/\/workspace\//, { timeout: 15_000 });
    } finally {
      await client.close().catch(() => undefined);
      await repo.cleanup();
    }
  });
});
