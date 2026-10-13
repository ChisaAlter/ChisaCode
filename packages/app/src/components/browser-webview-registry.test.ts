/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ensureBrowserWebview,
  getBrowserWebview,
  getBrowserWebviewPreferredSlot,
  reconcileBrowserWebview,
  releaseBrowserWebviewIfOrphaned,
  resetBrowserWebviewRegistryForTests,
  setBrowserWebviewMiniHost,
  setBrowserWebviewPanelHost,
  setBrowserWebviewPreferredSlot,
  type BrowserWebviewElement,
} from "./browser-webview-registry";

function createFakeWebview(): BrowserWebviewElement {
  const el = document.createElement("div") as unknown as BrowserWebviewElement;
  el.setAttribute("data-fake-webview", "1");
  return el;
}

afterEach(() => {
  resetBrowserWebviewRegistryForTests();
  vi.useRealTimers();
});

describe("browser-webview-registry", () => {
  it("creates a webview once per browserId", () => {
    const first = ensureBrowserWebview("b1", createFakeWebview);
    const second = ensureBrowserWebview("b1", createFakeWebview);
    expect(first).toBe(second);
    expect(getBrowserWebview("b1")).toBe(first);
  });

  it("appends the webview to the panel host by default", () => {
    const webview = ensureBrowserWebview("b1", createFakeWebview);
    const panel = document.createElement("div");
    setBrowserWebviewPanelHost("b1", panel);
    expect(panel.contains(webview)).toBe(true);
    expect(getBrowserWebviewPreferredSlot("b1")).toBe("panel");
  });

  it("moves the same node to the mini host when preferred slot is mini", () => {
    const webview = ensureBrowserWebview("b1", createFakeWebview);
    const panel = document.createElement("div");
    const mini = document.createElement("div");
    setBrowserWebviewPanelHost("b1", panel);
    setBrowserWebviewMiniHost("b1", mini);
    expect(panel.contains(webview)).toBe(true);

    setBrowserWebviewPreferredSlot("b1", "mini");
    expect(mini.contains(webview)).toBe(true);
    expect(panel.contains(webview)).toBe(false);
  });

  it("moves back to the panel when preferred slot returns to panel", () => {
    const webview = ensureBrowserWebview("b1", createFakeWebview);
    const panel = document.createElement("div");
    const mini = document.createElement("div");
    setBrowserWebviewPanelHost("b1", panel);
    setBrowserWebviewMiniHost("b1", mini);
    setBrowserWebviewPreferredSlot("b1", "mini");
    setBrowserWebviewPreferredSlot("b1", "panel");
    expect(panel.contains(webview)).toBe(true);
    expect(mini.contains(webview)).toBe(false);
  });

  it("does not destroy the webview while a mini host remains after panel unregisters", () => {
    const webview = ensureBrowserWebview("b1", createFakeWebview);
    const panel = document.createElement("div");
    const mini = document.createElement("div");
    setBrowserWebviewPanelHost("b1", panel);
    setBrowserWebviewMiniHost("b1", mini);
    setBrowserWebviewPreferredSlot("b1", "mini");
    setBrowserWebviewPanelHost("b1", null);
    expect(releaseBrowserWebviewIfOrphaned("b1")).toBe(false);
    expect(getBrowserWebview("b1")).toBe(webview);
    expect(mini.contains(webview)).toBe(true);
  });

  it("destroys the webview when both hosts are cleared", () => {
    ensureBrowserWebview("b1", createFakeWebview);
    const panel = document.createElement("div");
    setBrowserWebviewPanelHost("b1", panel);
    setBrowserWebviewPanelHost("b1", null);
    expect(releaseBrowserWebviewIfOrphaned("b1")).toBe(true);
    expect(getBrowserWebview("b1")).toBeNull();
  });

  it("reconcile is a no-op when already in the target host", () => {
    ensureBrowserWebview("b1", createFakeWebview);
    const panel = document.createElement("div");
    setBrowserWebviewPanelHost("b1", panel);
    expect(reconcileBrowserWebview("b1")).toBe(false);
  });

  it("falls back to mini host when panel is missing but preferred is panel", () => {
    const webview = ensureBrowserWebview("b1", createFakeWebview);
    const mini = document.createElement("div");
    setBrowserWebviewMiniHost("b1", mini);
    setBrowserWebviewPreferredSlot("b1", "panel");
    expect(mini.contains(webview)).toBe(true);
  });
});
