import { expect } from "@playwright/test";
import { buildHostWorkspaceRoute } from "@/utils/host-routes";
import { test } from "./fixtures";
import { expectAgentIdle } from "./helpers/agent-stream";
import { expectComposerEditable, expectComposerVisible, submitMessage } from "./helpers/composer";
import { connectSeedClient } from "./helpers/seed-client";
import { getServerId } from "./helpers/server-id";
import { createTempGitRepo } from "./helpers/workspace";

// M7 gate: an agent run failure renders in the composer banner stack attached
// to the input card (no seam line), dismissing it hides that message, and a
// *different* failure in the same thread still surfaces.
test.describe("Composer banner stack", () => {
  test("attaches an agent error, dismisses it, and surfaces a different error", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const serverId = getServerId();
    const repo = await createTempGitRepo("composer-banner-");
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
        initialPrompt: "Say hello.",
      });
      const agentUrl = `${buildHostWorkspaceRoute(serverId, repo.path)}?open=${encodeURIComponent(
        `agent:${agent.id}`,
      )}`;
      await page.goto(agentUrl);
      await expectComposerVisible(page);
      await expectAgentIdle(page, 90_000);
      await expectComposerEditable(page);

      // Fail a turn on the settled agent so the error surfaces in the stack.
      await submitMessage(page, "Fail the turn: 上游限流（HTTP 429）");
      const banner = page.getByTestId("agent-run-error-banner").first();
      await expect(banner).toBeVisible({ timeout: 60_000 });
      await expect(banner).toContainText("上游限流（HTTP 429）");

      // Attached seam: the banner squares its bottom edge and the input card
      // squares its top edge, so the pair reads as one continuous surface.
      const seam = await banner.evaluate((element) => {
        const bannerStyle = window.getComputedStyle(element);
        const card = document.querySelector('[data-testid="composer-input-card"]');
        const cardStyle = card ? window.getComputedStyle(card) : null;
        return {
          bannerBorderBottomWidth: bannerStyle.borderBottomWidth,
          bannerBottomLeftRadius: bannerStyle.borderBottomLeftRadius,
          bannerBackground: bannerStyle.backgroundColor,
          cardBorderTopWidth: cardStyle?.borderTopWidth ?? null,
          cardBorderLeftWidth: cardStyle?.borderLeftWidth ?? null,
          cardTopLeftRadius: cardStyle?.borderTopLeftRadius ?? null,
          cardBottomLeftRadius: cardStyle?.borderBottomLeftRadius ?? null,
        };
      });
      expect(seam.bannerBorderBottomWidth).toBe("0px");
      expect(seam.bannerBottomLeftRadius).toBe("0px");
      expect(seam.cardBorderTopWidth, JSON.stringify(seam)).toBe("0px");
      expect(seam.cardTopLeftRadius).toBe("0px");
      // The card keeps its side/bottom border and rounded bottom, so the pair
      // still reads as one card rather than two stacked boxes.
      expect(seam.cardBorderLeftWidth).toBe("1px");
      expect(seam.cardBottomLeftRadius).toBe("18px");
      expect(seam.bannerBackground).not.toBe("rgba(0, 0, 0, 0)");

      // Dismiss: the banner leaves the surface.
      await page.getByTestId("agent-run-error-banner-dismiss").first().click();
      await expect(banner).toBeHidden({ timeout: 15_000 });

      // A different failure in the same thread is a different message identity,
      // so it surfaces even though the first one stays dismissed.
      await expectComposerEditable(page);
      await submitMessage(page, "Fail the turn: 会话历史同步失败");
      await expect(banner).toBeVisible({ timeout: 60_000 });
      await expect(banner).toContainText("会话历史同步失败");
      await expect(banner).not.toContainText("上游限流");
    } finally {
      await client.close().catch(() => undefined);
      await repo.cleanup();
    }
  });
});
