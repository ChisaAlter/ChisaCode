import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { page } from "vitest/browser";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native-unistyles", () => {
  const theme = {
    borderRadius: { md: 6 },
    colors: {
      foregroundMuted: "#71717a",
      palette: {
        black: "#000000",
        red: { 300: "#fca5a5", 600: "#dc2626" },
      },
    },
    fontSize: { xs: 12 },
    spacing: { 1: 4, 2: 8 },
  };
  return {
    StyleSheet: {
      create: (factory: unknown) => (typeof factory === "function" ? factory(theme) : factory),
    },
    useUnistyles: () => ({ theme }),
  };
});

const { ChisaThinkingIndicator } = await import("./thought-message");

const colors = {
  black: "#000000",
  muted: "#71717a",
  red: "#dc2626",
  redBright: "#fca5a5",
};

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  if (root) {
    root.unmount();
    root = null;
  }
  host?.remove();
  host = null;
});

function queryTestId(container: ParentNode, testID: string): Element | null {
  return container.querySelector(
    `[data-testid="${testID}"],[testid="${testID}"],[testID="${testID}"]`,
  );
}

async function waitForScissorsPosition(
  container: ParentNode,
  frameIndex: number,
): Promise<Element> {
  const startedAt = performance.now();
  while (performance.now() - startedAt < 1_000) {
    const scissors = queryTestId(container, `chisa-thinking-scissors-position-${frameIndex}`);
    if (scissors) {
      return scissors;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for Chisa scissors frame ${frameIndex}`);
}

describe("ChisaThinkingIndicator browser rendering", () => {
  it("renders Chisa and moves the scissors around the square-cut path in Chromium", async () => {
    await page.viewport(320, 180);

    host = document.createElement("div");
    host.style.position = "fixed";
    host.style.left = "16px";
    host.style.top = "16px";
    host.style.width = "160px";
    host.style.height = "80px";
    host.style.display = "flex";
    host.style.alignItems = "center";
    host.style.justifyContent = "center";
    document.body.append(host);

    root = createRoot(host);
    await act(async () => {
      root?.render(<ChisaThinkingIndicator status="loading" colors={colors} />);
    });

    expect(host.querySelector("svg")).toBeTruthy();
    expect(queryTestId(host, "chisa-thinking-avatar")).toBeTruthy();
    const firstPosition = queryTestId(host, "chisa-thinking-scissors-position-0");
    expect(firstPosition).toBeTruthy();
    expect(firstPosition?.querySelector("circle")?.getAttribute("cx")).toBe("4");

    const secondPosition = await waitForScissorsPosition(host, 1);
    expect(secondPosition.querySelector("circle")?.getAttribute("cx")).toBe("22");

    const screenshotPath = await page.screenshot({
      element: host,
      path: "../../.vitest-screenshots/chisa-thinking-indicator.png",
    });
    expect(screenshotPath).toContain("chisa-thinking-indicator.png");
  });
});
