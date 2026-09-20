import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { scanListeningPorts } from "./port-scanner";
import { PortScannerController } from "./port-scanner-controller";

// Real-pipeline integration: a live loopback HTTP server must be discovered
// by the actual scan + probe path (no mocks).
describe("port scanner integration (real scan)", () => {
  let server: Server;
  const port = 9_315;

  beforeAll(async () => {
    server = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end("<!doctype html><html><body>integration-fixture</body></html>");
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", () => resolve());
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("scanListeningPorts lists the live fixture port on this host", () => {
    const ports = scanListeningPorts();
    expect(ports.some((entry) => entry.port === port)).toBe(true);
  });

  it("PortScannerController discovers the live fixture without probes mocked", async () => {
    const controller = new PortScannerController({
      scanFn: () => scanListeningPorts(),
      cacheTtlMs: 1_000,
      notifyIntervalMs: 500,
    });
    const waitForFixturePort = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("no snapshot with fixture port")), 30_000);
      const check = (ports: { port: number; host: string }[]) => {
        if (ports.some((entry) => entry.port === port)) {
          clearTimeout(timeout);
          resolve(ports);
        }
      };
      controller.subscribe(check);
    });
    const seen = await waitForFixturePort;
    expect(seen.some((entry) => entry.port === port && entry.host === "127.0.0.1")).toBe(true);
    controller.stop();
  });
});
