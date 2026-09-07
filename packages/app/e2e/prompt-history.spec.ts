import { test } from "./fixtures";
import { composerInput } from "./helpers/app";
import { expectAgentIdle } from "./helpers/agent-stream";
import {
  expectComposerDraft,
  expectComposerEditable,
  startRunningMockAgent,
} from "./helpers/composer";

test.describe("Composer prompt history", () => {
  test("ArrowUp recalls sent prompts, editing exits, ArrowDown clears", async ({ page }) => {
    test.setTimeout(180_000);
    const prompt = "Recall me with arrow keys please.";
    const { client, repo } = await startRunningMockAgent(page, {
      prefix: "prompt-history-",
      // The first dev-server page load takes tens of seconds (metro cold
      // bundle); a 10s stream would already be over when the page renders.
      model: "one-minute-stream",
      prompt,
    });
    try {
      // The one-minute mock stream must finish before the prompt enters the
      // canonical history the recall hook reads from.
      await expectAgentIdle(page, 90_000);
      const composer = composerInput(page);
      await expectComposerEditable(page);

      // ArrowUp on an empty composer recalls the newest sent prompt.
      await composer.click();
      await composer.press("ArrowUp");
      await expectComposerDraft(page, prompt);

      // Editing the recalled text ends browsing; the next ArrowUp restarts
      // from the newest entry rather than continuing from a stale position.
      await composer.press("End");
      await composer.type(" ");
      await composer.press("ArrowUp");
      await expectComposerDraft(page, prompt);

      // ArrowDown steps forward past the newest entry and clears the draft
      // (T3 shell semantics; the pre-browse draft is not preserved).
      await composer.press("ArrowDown");
      await expectComposerDraft(page, "");

      // Inside a multi-line draft, ArrowUp on a lower line moves the caret
      // within the text instead of recalling history.
      const multiline = "first line\nsecond line";
      await composer.fill(multiline);
      await composer.press("ArrowUp");
      await expectComposerDraft(page, multiline);
    } finally {
      await client.close();
      await repo.cleanup();
    }
  });
});
