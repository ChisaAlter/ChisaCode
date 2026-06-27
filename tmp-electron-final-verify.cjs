const fs = require("node:fs");
const path = require("node:path");
const { _electron: electron } = require("playwright");

const appPath = path.resolve("packages/desktop/release/win-unpacked/ChisaCode.exe");
const validationPath = path.resolve("tmp-mimo-agent-validation-final2.json");
const outPath = path.resolve("tmp-electron-final3-validation.json");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function findVisible(locator) {
  const count = await locator.count();
  for (let index = 0; index < count; index += 1) {
    const item = locator.nth(index);
    if (await item.isVisible().catch(() => false)) {
      return item;
    }
  }
  return null;
}

async function dumpTestIds(page, prefix) {
  return page.evaluate((prefixValue) => {
    return Array.from(document.querySelectorAll("[data-testid]"))
      .map((node) => {
        const element = node;
        const testId = element.getAttribute("data-testid") || "";
        const rect = element.getBoundingClientRect();
        return {
          testId,
          text: (element.textContent || "").slice(0, 160),
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          visible:
            rect.width > 0 &&
            rect.height > 0 &&
            window.getComputedStyle(element).visibility !== "hidden" &&
            window.getComputedStyle(element).display !== "none",
        };
      })
      .filter((entry) => entry.testId.includes(prefixValue));
  }, prefix);
}

async function openAgent(page, item) {
  const tabTestId = `workspace-tab-agent_${item.agentId}`;
  await page.goto(`chisacode://app/h/${item.serverId}/agent/${item.agentId}`);
  await page
    .waitForFunction(
      (testId) => {
        const element = document.querySelector(`[data-testid="${testId}"]`);
        return element?.getAttribute("aria-selected") === "true";
      },
      tabTestId,
      { timeout: 20000 },
    )
    .catch(async () => {
      await page.evaluate((testId) => {
        const element = document.querySelector(`[data-testid="${testId}"]`);
        if (element instanceof HTMLElement) {
          element.click();
        }
      }, tabTestId);
    });
  await page.waitForFunction(
    (testId) => {
      const element = document.querySelector(`[data-testid="${testId}"]`);
      return element?.getAttribute("aria-selected") === "true";
    },
    tabTestId,
    { timeout: 20000 },
  );
  await page
    .waitForFunction(
      () => {
        return document.querySelectorAll('[data-testid="assistant-message"]').length >= 3;
      },
      { timeout: 20000 },
    )
    .catch(() => undefined);
  await sleep(800);
  return { switchedBy: "agent-route-selected-tab" };

  const rowTestId = `sidebar-session-${item.serverId}-${item.agentId}`;
  const row = page.getByTestId(rowTestId);
  let target = await findVisible(row);
  if (!target) {
    const allRows = await dumpTestIds(page, rowTestId);
    throw new Error(`sidebar row not visible for ${item.provider}: ${JSON.stringify(allRows)}`);
  }

  await target.click({ force: true });
  await sleep(900);

  const expectedTexts = item.expectedTexts;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const body = await page.locator("body").innerText({ timeout: 10000 });
    if (expectedTexts.some((text) => body.includes(text))) {
      return { switchedBy: "sidebar-testid", body };
    }
    await sleep(500);
  }

  const body = await page.locator("body").innerText({ timeout: 10000 });
  const rows = await dumpTestIds(page, "sidebar-session-");
  throw new Error(
    `agent body did not switch to ${item.provider}; url=${page.url()}; rows=${JSON.stringify(
      rows,
    )}; body=${body.slice(0, 1200)}`,
  );
}

async function collectMainText(page) {
  return page.evaluate(() => {
    const entries = Array.from(
      document.querySelectorAll(
        '[data-testid="assistant-message"], [data-testid="thought-message"], [data-testid="user-message"]',
      ),
    )
      .map((node) => {
        const element = node;
        const rect = element.getBoundingClientRect();
        return {
          testId: element.getAttribute("data-testid") || "",
          text: (element.textContent || "").replace(/\s+/g, " ").trim(),
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        };
      })
      .filter((entry) => entry.width > 0 && entry.height > 0)
      .sort((left, right) => left.y - right.y);
    return {
      entries,
      text: entries.map((entry) => entry.text).join("\n"),
    };
  });
}

function collectChecks(mainText, thoughtEntries, assistantEntries, containsExpectedText) {
  const failedChecks = [];
  const containsSettingsSetup =
    mainText.includes("Workspace Setup") ||
    mainText.includes("工作区设置") ||
    mainText.includes("设置工作区");
  const containsRunning =
    mainText.includes("运行中") ||
    mainText.includes("正在运行") ||
    mainText.includes("Running") ||
    mainText.includes("running");
  const thoughtBeforeAssistant =
    thoughtEntries.length > 0 && assistantEntries.length > 0
      ? thoughtEntries[0].y < assistantEntries[0].y
      : null;
  const collapsedThoughtRows = thoughtEntries.filter((entry) => entry.height <= 44).length;
  if (assistantEntries.length < 3) {
    failedChecks.push(`expected at least 3 assistant messages, saw ${assistantEntries.length}`);
  }
  if (!containsExpectedText) {
    failedChecks.push("expected assistant text not found in main transcript");
  }
  if (containsSettingsSetup) {
    failedChecks.push("workspace setup/settings text appeared in transcript area");
  }
  if (containsRunning) {
    failedChecks.push("running text appeared in completed transcript area");
  }
  if (thoughtEntries.length > 0 && thoughtBeforeAssistant !== true) {
    failedChecks.push("thought row is not above assistant answer");
  }
  if (thoughtEntries.length > 0 && collapsedThoughtRows !== thoughtEntries.length) {
    failedChecks.push(
      `not all thought rows are collapsed: ${collapsedThoughtRows}/${thoughtEntries.length}`,
    );
  }
  return {
    failedChecks,
    containsSettingsSetup,
    containsRunning,
    thoughtBeforeAssistant,
    collapsedThoughtRows,
  };
}

function buildCheckResult(
  item,
  page,
  mainText,
  screenshot,
  openResult,
  thoughtEntries,
  assistantEntries,
  containsExpectedText,
  compactMain,
  compactBody,
  checks,
) {
  return {
    provider: item.provider,
    title: item.title,
    agentId: item.agentId,
    serverId: item.serverId,
    status: item.status,
    model: item.model,
    url: page.url(),
    screenshot,
    switchedBy: openResult.switchedBy,
    containsExpectedText,
    containsSettingsSetupText: checks.containsSettingsSetup,
    containsRunningText: checks.containsRunning,
    containsThoughtLabel:
      mainText.text.includes("思考") ||
      mainText.text.includes("推理") ||
      mainText.text.includes("Thought"),
    thoughtCount: thoughtEntries.length,
    assistantCount: assistantEntries.length,
    collapsedThoughtRows: checks.collapsedThoughtRows,
    firstThoughtY: thoughtEntries[0]?.y ?? null,
    firstAssistantY: assistantEntries[0]?.y ?? null,
    thoughtBeforeAssistant: checks.thoughtBeforeAssistant,
    failedChecks: checks.failedChecks,
    mainPreview: compactMain.slice(0, 1800),
    bodyPreview: compactBody.slice(0, 1000),
  };
}

async function main() {
  const records = JSON.parse(fs.readFileSync(validationPath, "utf8"));
  const expectedByProvider = {
    "xiaomi-claude": ["Claude Sonnet 4.6", "请问您希望我列出什么内容"],
    "xiaomi-codex": ["mimo-v2.5", "xiaomi-codex", "请问你想列出什么内容"],
    "xiaomi-opencode": ["xiaomi/mimo-v2-pro", "请告诉我您希望我列出哪两项内容"],
    "xiaomi-mimocode": ["mimo-v2.5", "xiaomi/mimo-v2.5", "1、2"],
    "xiaomi-pi": ["我是MiMo-v2.5", "小米LLM核心团队"],
    "xiaomi-kimi": ["我当前使用的模型是Kimi", "1、2"],
  };
  const items = records.map((record) => {
    const inspect = JSON.parse(record.inspect);
    return {
      provider: record.provider,
      title: record.title,
      agentId: record.agentId,
      serverId: null,
      status: inspect.Status,
      model: inspect.Model,
      expectedTexts: expectedByProvider[record.provider] || [],
    };
  });

  const app = await electron.launch({
    executablePath: appPath,
    args: ["--inspect=0"],
  });
  try {
    const page = await app.firstWindow();
    await page.setViewportSize({ width: 1500, height: 980 });
    await page.waitForLoadState("domcontentloaded");
    await sleep(6000);

    const serverId = await page.evaluate(() => {
      const match = window.location.href.match(/\/h\/([^/]+)\//);
      return match ? decodeURIComponent(match[1]) : null;
    });
    if (!serverId) {
      throw new Error(`could not resolve server id from ${page.url()}`);
    }
    for (const item of items) {
      item.serverId = serverId;
    }

    const results = [];
    for (const item of items) {
      const openResult = await openAgent(page, item);
      const body = await page.locator("body").innerText({ timeout: 10000 });
      const mainText = await collectMainText(page);
      const screenshot = path.resolve(`tmp-electron-final3-${item.provider}.png`);
      await page.screenshot({ path: screenshot, fullPage: false });
      const compactBody = body.replace(/\s+/g, " ");
      const compactMain = mainText.text.replace(/\s+/g, " ");
      const thoughtEntries = mainText.entries.filter((entry) => entry.testId === "thought-message");
      const assistantEntries = mainText.entries.filter(
        (entry) => entry.testId === "assistant-message",
      );
      const containsExpectedText = item.expectedTexts.some((text) => mainText.text.includes(text));
      const checks = collectChecks(
        mainText.text,
        thoughtEntries,
        assistantEntries,
        containsExpectedText,
      );
      const result = buildCheckResult(
        item,
        page,
        mainText,
        screenshot,
        openResult,
        thoughtEntries,
        assistantEntries,
        containsExpectedText,
        compactMain,
        compactBody,
        checks,
      );
      results.push(result);
    }

    fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
    const failures = results.filter((result) => result.failedChecks.length > 0);
    if (failures.length > 0) {
      throw new Error(`packaged validation failed: ${JSON.stringify(failures, null, 2)}`);
    }
    console.log(
      JSON.stringify({ outPath, screenshots: results.map((r) => r.screenshot) }, null, 2),
    );
  } finally {
    await app.close().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
