import { useEffect, useRef, useState } from "react";
import type { DiscoveredPort } from "@chisacode/protocol/messages";
import { useHostRuntimeClient } from "@/runtime/host-runtime";

/**
 * Filters daemon-reported listening ports down to those actually serving an
 * HTML document. Runs in the renderer on purpose: the daemon worker's
 * Electron RUN_AS_NODE runtime cannot read loopback HTTP responses from its
 * own process, while this probe rides the window's normal network stack.
 * @param ports Listener snapshot from the daemon
 * @returns The subset of ports serving HTML, probed with a small concurrency cap
 */
async function filterHtmlServers(ports: DiscoveredPort[]): Promise<DiscoveredPort[]> {
  const CONCURRENCY = 8;
  const html: DiscoveredPort[] = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, ports.length) }, async () => {
    while (cursor < ports.length) {
      const port = ports[cursor];
      cursor += 1;
      if (!port) {
        continue;
      }
      try {
        const response = await fetch(`http://${port.host}:${port.port}/`, {
          signal: AbortSignal.timeout(2_500),
          headers: { accept: "text/html,application/xhtml+xml" },
        });
        const contentType = response.headers.get("content-type") ?? "";
        if (response.ok && /text\/html|application\/xhtml\+xml/i.test(contentType)) {
          html.push(port);
          continue;
        }
        if (response.ok) {
          const body = await response.text();
          if (body.length <= 1_000_000 && /<html[\s>]|<!doctype\s+html/i.test(body)) {
            html.push(port);
          }
        }
      } catch {
        // Not an HTTP/HTML server — skip.
      }
    }
  });
  await Promise.all(workers);
  return html;
}

/**
 * Subscribes to daemon-side local dev-server discovery. Returns the listening
 * ports on the daemon host that serve an HTML document; empty while the
 * daemon does not advertise the discoveredPorts feature or nothing matches.
 * @param serverId Daemon connection to subscribe on
 * @returns The current discovered HTML-server snapshot
 */
export function useDiscoveredServers(serverId: string): DiscoveredPort[] {
  const client = useHostRuntimeClient(serverId);
  const [ports, setPorts] = useState<DiscoveredPort[]>([]);
  const portsRef = useRef<DiscoveredPort[]>([]);

  useEffect(() => {
    if (!client) {
      setPorts([]);
      return;
    }
    let filterGeneration = 0;
    const unsubscribeEvent = client.on("discovered_ports", (message) => {
      // The daemon's platform scan can return a transient empty snapshot
      // (child-process flake); keep the last non-empty list rather than
      // flashing the card list away.
      if (message.ports.length === 0 && portsRef.current.length > 0) {
        return;
      }
      const generation = ++filterGeneration;
      void filterHtmlServers(message.ports).then(
        (filtered) => {
          if (generation === filterGeneration) {
            portsRef.current = filtered;
            setPorts(filtered);
          }
          return undefined;
        },
        () => undefined,
      );
    });
    client.subscribeDiscoveredPorts();
    return () => {
      filterGeneration += 1;
      unsubscribeEvent();
      client.unsubscribeDiscoveredPorts();
    };
  }, [client]);

  return ports;
}
