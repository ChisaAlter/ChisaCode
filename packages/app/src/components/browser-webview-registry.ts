/**
 * Owns imperative `<webview>` elements for browser panes (T3 port M14).
 *
 * React never reparents its own nodes: the registry moves a document.createElement
 * webview between a panel host and a mini-player host via appendChild.
 */

export type BrowserWebviewSlot = "panel" | "mini";

export type BrowserWebviewElement = HTMLElement & {
  setAttribute: (name: string, value: string) => void;
  style: CSSStyleDeclaration;
  parentElement: HTMLElement | null;
  remove: () => void;
};

interface RegistryEntry {
  webview: BrowserWebviewElement;
  panelHost: HTMLElement | null;
  miniHost: HTMLElement | null;
  preferredSlot: BrowserWebviewSlot;
  maskUntil: number;
}

const entries = new Map<string, RegistryEntry>();

function applyWebviewFillStyles(webview: BrowserWebviewElement): void {
  webview.style.display = "flex";
  webview.style.flex = "1";
  webview.style.width = "100%";
  webview.style.height = "100%";
  webview.style.border = "0";
  webview.style.background = "transparent";
}

function resolveTargetHost(entry: RegistryEntry): HTMLElement | null {
  if (entry.preferredSlot === "mini" && entry.miniHost) {
    return entry.miniHost;
  }
  if (entry.panelHost) {
    return entry.panelHost;
  }
  if (entry.miniHost) {
    return entry.miniHost;
  }
  return null;
}

/**
 * Moves the webview into the preferred host. Returns true when a migration ran.
 */
export function reconcileBrowserWebview(browserId: string): boolean {
  const entry = entries.get(browserId);
  if (!entry) {
    return false;
  }
  const target = resolveTargetHost(entry);
  if (!target) {
    return false;
  }
  if (entry.webview.parentElement === target) {
    return false;
  }
  applyWebviewFillStyles(entry.webview);
  // One-frame opacity mask softens the flash when migrating hosts.
  entry.webview.style.opacity = "0";
  entry.maskUntil = Date.now() + 32;
  target.appendChild(entry.webview);
  const revealAt = entry.maskUntil;
  window.setTimeout(() => {
    const current = entries.get(browserId);
    if (!current || current.maskUntil !== revealAt) {
      return;
    }
    current.webview.style.opacity = "1";
  }, 16);
  return true;
}

export function ensureBrowserWebview(
  browserId: string,
  create: () => BrowserWebviewElement,
): BrowserWebviewElement {
  const existing = entries.get(browserId);
  if (existing) {
    return existing.webview;
  }
  const webview = create();
  applyWebviewFillStyles(webview);
  entries.set(browserId, {
    webview,
    panelHost: null,
    miniHost: null,
    preferredSlot: "panel",
    maskUntil: 0,
  });
  return webview;
}

export function getBrowserWebview(browserId: string): BrowserWebviewElement | null {
  return entries.get(browserId)?.webview ?? null;
}

export function setBrowserWebviewPreferredSlot(browserId: string, slot: BrowserWebviewSlot): void {
  const entry = entries.get(browserId);
  if (!entry) {
    return;
  }
  entry.preferredSlot = slot;
  reconcileBrowserWebview(browserId);
}

export function setBrowserWebviewPanelHost(browserId: string, host: HTMLElement | null): void {
  const entry = entries.get(browserId);
  if (!entry) {
    return;
  }
  entry.panelHost = host;
  reconcileBrowserWebview(browserId);
}

export function setBrowserWebviewMiniHost(browserId: string, host: HTMLElement | null): void {
  const entry = entries.get(browserId);
  if (!entry) {
    return;
  }
  entry.miniHost = host;
  reconcileBrowserWebview(browserId);
}

/**
 * Destroys the webview when neither host still wants it.
 * Call after unregistering hosts on BrowserPane / MiniPlayer unmount.
 */
export function releaseBrowserWebviewIfOrphaned(browserId: string): boolean {
  const entry = entries.get(browserId);
  if (!entry) {
    return false;
  }
  if (entry.panelHost || entry.miniHost) {
    return false;
  }
  try {
    entry.webview.remove();
  } catch {
    // Element may already be detached.
  }
  entries.delete(browserId);
  return true;
}

/** Test helper: wipe registry between cases. */
export function resetBrowserWebviewRegistryForTests(): void {
  for (const [browserId, entry] of entries) {
    try {
      entry.webview.remove();
    } catch {
      // ignore
    }
    entries.delete(browserId);
  }
}

export function getBrowserWebviewPreferredSlot(browserId: string): BrowserWebviewSlot | null {
  return entries.get(browserId)?.preferredSlot ?? null;
}

/** Force-destroy a webview when its browser record is removed. */
export function destroyBrowserWebview(browserId: string): void {
  const entry = entries.get(browserId);
  if (!entry) {
    return;
  }
  entry.panelHost = null;
  entry.miniHost = null;
  try {
    entry.webview.remove();
  } catch {
    // ignore
  }
  entries.delete(browserId);
}
