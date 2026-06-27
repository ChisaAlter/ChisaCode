const path = require("node:path");
const { _electron: electron } = require("playwright");

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const app = await electron.launch({
    executablePath: path.resolve("packages/desktop/release/win-unpacked/ChisaCode.exe"),
    args: ["--inspect=0"],
  });
  try {
    const page = await app.firstWindow();
    await page.setViewportSize({ width: 1500, height: 980 });
    await page.waitForLoadState("domcontentloaded");
    await sleep(5000);
    const serverId = await page.evaluate(() => {
      const match = window.location.href.match(/\/h\/([^/]+)\//);
      return match ? decodeURIComponent(match[1]) : null;
    });
    const agentId = "8a20f70b-006f-48a9-9f4c-f55be91b2e1f";
    const targetUrl = `chisacode://app/h/${serverId}/agent/${agentId}`;
    console.log("goto", targetUrl);
    await page.goto(targetUrl);
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await sleep(1000);
      const body = await page
        .locator("body")
        .innerText()
        .catch(() => "");
      console.log("attempt", attempt, page.url(), body.slice(0, 240).replace(/\s+/g, " "));
      if (body.includes("我是MiMo-v2.5") || body.includes("小米LLM核心团队")) {
        break;
      }
    }
    await page.screenshot({ path: path.resolve("tmp-electron-route-probe-pi.png") });
  } finally {
    await app.close().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
