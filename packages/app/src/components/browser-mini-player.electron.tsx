/**
 * Floating Mini Player for an imperative Electron <webview> (T3 port M14).
 * Moves the registry-owned webview element into this host; React nodes are never reparented.
 */
import { useCallback, useEffect, useMemo, useRef, useState, createElement } from "react";
import { useTranslation } from "react-i18next";
import { useBrowserStore } from "@/stores/browser-store";
import {
  clampMiniPlayerPosition,
  clampMiniPlayerSize,
} from "@/components/browser-mini-player-layout";
import {
  releaseBrowserWebviewIfOrphaned,
  setBrowserWebviewMiniHost,
  setBrowserWebviewPreferredSlot,
} from "@/components/browser-webview-registry";

function MiniPlayerCard({
  browserId,
  bottomInset,
  containerSize,
}: {
  browserId: string;
  bottomInset: number;
  containerSize: { w: number; h: number };
}) {
  const { t } = useTranslation();
  const browser = useBrowserStore((state) => state.browsersById[browserId] ?? null);
  const updateBrowser = useBrowserStore((state) => state.updateBrowser);
  const mini = browser?.miniPlayer ?? null;
  const hostRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [hostNode, setHostNode] = useState<HTMLDivElement | null>(null);
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!mini?.enabled || !hostNode) {
      return;
    }
    setBrowserWebviewMiniHost(browserId, hostNode);
    setBrowserWebviewPreferredSlot(browserId, "mini");
    return () => {
      setBrowserWebviewMiniHost(browserId, null);
      setBrowserWebviewPreferredSlot(browserId, "panel");
      releaseBrowserWebviewIfOrphaned(browserId);
    };
  }, [browserId, mini?.enabled, hostNode]);

  const commitGeometry = useCallback(
    (position: { x: number; y: number }, size: { w: number; h: number }) => {
      const nextSize = clampMiniPlayerSize(size, containerSize, position, bottomInset);
      const nextPos = clampMiniPlayerPosition(position, containerSize, nextSize, bottomInset);
      updateBrowser(browserId, {
        miniPlayer: { enabled: true, position: nextPos, size: nextSize },
      });
    },
    [bottomInset, browserId, containerSize, updateBrowser],
  );

  // Re-clamp when the workspace container resizes.
  useEffect(() => {
    if (!mini?.enabled) {
      return;
    }
    commitGeometry(mini.position, mini.size);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reclamp on container/inset change
  }, [containerSize.w, containerSize.h, bottomInset]);

  const handleRestore = useCallback(() => {
    updateBrowser(browserId, { miniPlayer: null });
  }, [browserId, updateBrowser]);

  const handleClose = useCallback(() => {
    updateBrowser(browserId, { miniPlayer: null });
  }, [browserId, updateBrowser]);

  const onBarPointerDown = useCallback(
    (event: PointerEvent) => {
      if (!mini?.enabled) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.closest("button")) {
        return;
      }
      const card = cardRef.current;
      if (!card) {
        return;
      }
      event.preventDefault();
      setDragging(true);
      const originX = event.clientX - mini.position.x;
      const originY = event.clientY - mini.position.y;
      const size = mini.size;

      const onMove = (ev: PointerEvent) => {
        commitGeometry({ x: ev.clientX - originX, y: ev.clientY - originY }, size);
      };
      const onUp = () => {
        setDragging(false);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [commitGeometry, mini],
  );

  const onResizePointerDown = useCallback(
    (event: PointerEvent) => {
      if (!mini?.enabled) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const startX = event.clientX;
      const startY = event.clientY;
      const startW = mini.size.w;
      const startH = mini.size.h;
      const position = mini.position;

      const onMove = (ev: PointerEvent) => {
        commitGeometry(position, {
          w: startW + (ev.clientX - startX),
          h: startH + (ev.clientY - startY),
        });
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [commitGeometry, mini],
  );

  const cardStyle = useMemo(() => {
    if (!mini?.enabled) {
      return null;
    }
    return {
      position: "absolute" as const,
      left: mini.position.x,
      top: mini.position.y,
      width: mini.size.w,
      height: mini.size.h,
      zIndex: 40,
      borderRadius: 10,
      overflow: "hidden" as const,
      border: "1px solid rgba(0,0,0,0.12)",
      boxShadow: "0 16px 40px rgba(25, 32, 44, 0.18)",
      background: "#ffffff",
    };
  }, [mini?.enabled, mini?.position.x, mini?.position.y, mini?.size.w, mini?.size.h]);

  if (!mini?.enabled || !cardStyle) {
    return null;
  }

  const title = browser?.title?.trim() || browser?.url || t("browser.miniPlayerTitle");
  const showBar = hovered || dragging;

  const hostStyle = {
    position: "absolute",
    inset: 0,
  } as const;

  const barStyle = {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 28,
    display: "flex",
    alignItems: "center",
    gap: 6,
    paddingLeft: 8,
    paddingRight: 8,
    background: "linear-gradient(rgba(20,23,31,0.55), rgba(20,23,31,0))",
    cursor: "grab",
    opacity: showBar ? 1 : 0,
    transition: "opacity 0.15s",
    zIndex: 2,
  } as const;

  const resizeStyle = {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 16,
    height: 16,
    cursor: "nwse-resize",
    zIndex: 3,
  } as const;

  return createElement(
    "div",
    {
      ref: (node: HTMLDivElement | null) => {
        cardRef.current = node;
      },
      "data-testid": `browser-mini-player-${browserId}`,
      onMouseEnter: () => setHovered(true),
      onMouseLeave: () => setHovered(false),
      style: cardStyle,
    },
    createElement("div", {
      ref: (node: HTMLDivElement | null) => {
        hostRef.current = node;
        setHostNode(node);
      },
      "data-testid": `browser-mini-player-host-${browserId}`,
      style: hostStyle,
    }),
    createElement(
      "div",
      {
        "data-testid": `browser-mini-player-bar-${browserId}`,
        onPointerDown: onBarPointerDown,
        style: barStyle,
      },
      createElement("span", {
        style: {
          width: 6,
          height: 6,
          borderRadius: 999,
          background: "rgba(255,255,255,0.85)",
          flexShrink: 0,
        },
      }),
      createElement(
        "span",
        {
          style: {
            flex: 1,
            fontSize: 11,
            color: "rgba(255,255,255,0.9)",
            textShadow: "0 1px 2px rgba(0,0,0,0.4)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          },
        },
        title,
      ),
      createElement(
        "button",
        {
          type: "button",
          title: t("browser.miniPlayerRestore"),
          "aria-label": t("browser.miniPlayerRestore"),
          "data-testid": `browser-mini-player-restore-${browserId}`,
          onClick: (event: MouseEvent) => {
            event.stopPropagation();
            handleRestore();
          },
          style: {
            marginLeft: "auto",
            width: 22,
            height: 22,
            border: "none",
            borderRadius: 6,
            background: "rgba(20,23,31,0.55)",
            color: "#fff",
            cursor: "pointer",
            fontSize: 11,
          },
        },
        "⇱",
      ),
      createElement(
        "button",
        {
          type: "button",
          title: t("browser.miniPlayerClose"),
          "aria-label": t("browser.miniPlayerClose"),
          "data-testid": `browser-mini-player-close-${browserId}`,
          onClick: (event: MouseEvent) => {
            event.stopPropagation();
            handleClose();
          },
          style: {
            width: 22,
            height: 22,
            border: "none",
            borderRadius: 6,
            background: "rgba(20,23,31,0.55)",
            color: "#fff",
            cursor: "pointer",
            fontSize: 12,
          },
        },
        "×",
      ),
    ),
    createElement("div", {
      "data-testid": `browser-mini-player-resize-${browserId}`,
      onPointerDown: onResizePointerDown,
      style: resizeStyle,
    }),
  );
}

/**
 * Renders a Mini Player card for every browser with `miniPlayer.enabled`.
 * Positioned inside the workspace `threePaneRow` (absolute overlay).
 */
export function BrowserMiniPlayerLayer({ bottomInset = 0 }: { bottomInset?: number }) {
  const enabledBrowserIds = useBrowserStore((state) =>
    Object.values(state.browsersById)
      .filter((browser) => browser.miniPlayer?.enabled)
      .map((browser) => browser.browserId),
  );
  const layerRef = useRef<HTMLDivElement | null>(null);
  const [containerSize, setContainerSize] = useState({ w: 1280, h: 800 });

  useEffect(() => {
    const node = layerRef.current?.parentElement;
    if (!node || typeof ResizeObserver === "undefined") {
      setContainerSize({ w: window.innerWidth, h: window.innerHeight });
      return;
    }
    const update = () => {
      const rect = node.getBoundingClientRect();
      setContainerSize({ w: Math.round(rect.width), h: Math.round(rect.height) });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabledBrowserIds.length]);

  if (enabledBrowserIds.length === 0) {
    return null;
  }

  return createElement(
    "div",
    {
      ref: (node: HTMLDivElement | null) => {
        layerRef.current = node;
      },
      "data-testid": "browser-mini-player-layer",
      style: {
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 35,
      },
    },
    ...enabledBrowserIds.map((browserId) =>
      createElement(
        "div",
        { key: browserId, style: { pointerEvents: "auto" } },
        createElement(MiniPlayerCard, {
          browserId,
          bottomInset,
          containerSize,
        }),
      ),
    ),
  );
}
