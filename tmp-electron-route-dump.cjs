const fs = require("node:fs");
const path = require("node:path");
const { _electron: electron } = require("playwright");

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const log = [];
  const app = await electron.launch({
    executablePath: path.resolve("packages/desktop/release/win-unpacked/ChisaCode.exe"),
    args: ["--inspect=0"],
  });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1500, height: 980 });
  await page.waitForLoadState("domcontentloaded");
  await sleep(5000);
  const serverId = await page.evaluate(() => {
    const match = window.location.href.match(/\/h\/([^/]+)\//);
    return match ? decodeURIComponent(match[1]) : null;
  });
  const agentId = process.argv[2] || "8a20f70b-006f-48a9-9f4c-f55be91b2e1f";
  await page.goto(`chisacode://app/h/${serverId}/agent/${agentId}`);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await sleep(1000);
    const snapshot = await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll("[data-testid]"));
      const tabs = nodes
        .filter((node) => (node.getAttribute("data-testid") || "").startsWith("workspace-tab-"))
        .map((node) => {
          const rect = node.getBoundingClientRect();
          return {
            testId: node.getAttribute("data-testid"),
            selected: node.getAttribute("aria-selected"),
            text: (node.textContent || "").replace(/\s+/g, " ").trim(),
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          };
        });
      const messages = nodes
        .filter((node) =>
          ["assistant-message", "thought-message", "user-message"].includes(
            node.getAttribute("data-testid") || "",
          ),
        )
        .map((node) => {
          const rect = node.getBoundingClientRect();
          return {
            testId: node.getAttribute("data-testid"),
            text: (node.textContent || "").replace(/\s+/g, " ").trim().slice(0, 240),
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          };
        });
      return { url: window.location.href, tabs, messages };
    });
    log.push({ attempt, snapshot });
    if (snapshot.messages.some((message) => message.testId === "assistant-message")) {
      break;
    }
  }
  await page.screenshot({ path: path.resolve("tmp-electron-route-dump.png") });
  fs.writeFileSync(path.resolve("tmp-electron-route-dump.json"), JSON.stringify(log, null, 2));
  app.process()?.kill?.();
}

main().catch((error) => {
  fs.writeFileSync(path.resolve("tmp-electron-route-dump-error.txt"), String(error?.stack || error));
  process.exit(1);
});
