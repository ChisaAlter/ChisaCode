import { describe, expect, it } from "vitest";
import {
  COMMON_DEV_PORTS,
  parseLsofOutput,
  scanListeningPorts,
  type DiscoveredPort,
} from "./port-scanner";
import { PortScannerController } from "./port-scanner-controller";

function execResult(status: number | null, stdout: string) {
  return { status, stdout, stderr: "" };
}

describe("scanListeningPorts", () => {
  it("parses lsof -F output into deduplicated loopback ports", () => {
    const ports = scanListeningPorts({
      platform: "darwin",
      execFn: () =>
        execResult(
          0,
          [
            "p4201",
            "cnode",
            "n127.0.0.1:5173",
            "n*:3000",
            "p4201",
            "cnode",
            "n127.0.0.1:5173",
          ].join("\n"),
        ),
    });
    expect(ports).toEqual([
      { host: "127.0.0.1", port: 5173, processName: "node" },
      { host: "127.0.0.1", port: 3000, processName: "node" },
    ]);
  });

  it("keeps the first process name when several listeners share a port", () => {
    const ports = scanListeningPorts({
      platform: "linux",
      execFn: () =>
        execResult(
          0,
          ["p100", "cnode-a", "n127.0.0.1:8080", "p200", "cnode-b", "n127.0.0.1:8080"].join("\n"),
        ),
    });
    expect(ports).toEqual([{ host: "127.0.0.1", port: 8080, processName: "node-a" }]);
  });

  it("returns empty when lsof fails", () => {
    const ports = scanListeningPorts({
      platform: "linux",
      execFn: () => execResult(1, ""),
    });
    expect(ports).toEqual([]);
  });

  it("returns empty for unsupported platforms", () => {
    const ports = scanListeningPorts({
      platform: "freebsd" as NodeJS.Platform,
      execFn: () => execResult(0, "p1\ncnode\nn127.0.0.1:3000"),
    });
    expect(ports).toEqual([]);
  });

  it("ignores lsof lines without a port suffix", () => {
    const ports = parseLsofOutput(["p1", "cnode", "n127.0.0.1", "n127.0.0.1:5173"].join("\n"));
    expect(ports).toEqual([{ host: "127.0.0.1", port: 5173, processName: "node" }]);
  });

  it("parses netstat output and enriches process names", () => {
    const ports = scanListeningPorts({
      platform: "win32",
      execFn: (command, args) => {
        const joined = args.join(" ");
        if (command === "netstat") {
          return execResult(
            0,
            [
              "  TCP    0.0.0.0:135    0.0.0.0:0    LISTENING    1552",
              "  TCP    127.0.0.1:3000    0.0.0.0:0    LISTENING    1234",
              "  TCP    127.0.0.1:3000    0.0.0.0:0    LISTENING    1234",
              "  TCP    0.0.0.0:5173    0.0.0.0:0    LISTENING    5678",
              "  UDP    0.0.0.0:5353    *:*    4",
              "",
            ].join("\n"),
          );
        }
        if (command === "powershell.exe" && joined.includes("Get-Process")) {
          return execResult(0, "1234\tnode\n5678\tesbuild");
        }
        return execResult(1, "");
      },
    });
    expect(ports).toEqual([
      { host: "127.0.0.1", port: 135 },
      { host: "127.0.0.1", port: 3000, processName: "node" },
      { host: "127.0.0.1", port: 5173, processName: "esbuild" },
    ]);
  });
});

describe("COMMON_DEV_PORTS", () => {
  it("covers the well-known Vite, Next, and CRA ports", () => {
    for (const expected of [3000, 5173, 8080]) {
      expect(COMMON_DEV_PORTS).toContain(expected);
    }
  });
});

describe("PortScannerController", () => {
  function makeTimers() {
    const pending: { id: number; fn: () => void; at: number }[] = [];
    let nextId = 1;
    let now = 1_000;
    const timers = {
      setTimeout: vi.fn((fn: () => void, ms: number) => {
        const id = nextId++;
        pending.push({ id, fn, at: now + ms });
        return id;
      }),
      clearTimeout: vi.fn((id: number) => {
        const index = pending.findIndex((entry) => entry.id === id);
        if (index >= 0) pending.splice(index, 1);
      }),
    };
    return {
      timers,
      pending,
      advance(ms: number) {
        now += ms;
        for (const entry of [...pending].sort((a, b) => a.at - b.at)) {
          if (entry.at <= now) {
            const index = pending.findIndex((p) => p.id === entry.id);
            if (index >= 0) {
              pending.splice(index, 1);
              entry.fn();
            }
          }
        }
      },
    };
  }

  function makeScanFn(ports: DiscoveredPort[][]) {
    let call = 0;
    return vi.fn(() => ports[Math.min(call++, ports.length - 1)] ?? []);
  }

  it("pushes the snapshot immediately and on notify ticks", async () => {
    const clock = makeTimers();
    const scanFn = makeScanFn([[{ host: "127.0.0.1", port: 5173 }]]);
    const controller = new PortScannerController({
      scanFn,
      timers: clock.timers,
    });
    const seen: DiscoveredPort[][] = [];
    const unsubscribe = controller.subscribe((ports) => seen.push(ports));
    // The scan+notify loop is synchronous-fast now (no probe awaits); the
    // first push already carries the scanned snapshot.
    await vi.waitFor(() => {
      expect(seen.at(-1)).toEqual([{ host: "127.0.0.1", port: 5173 }]);
    });

    clock.advance(3_000);
    await Promise.resolve();
    await Promise.resolve();
    expect(seen.at(-1)).toEqual([{ host: "127.0.0.1", port: 5173 }]);
    unsubscribe();
    controller.stop();
  });

  it("throttles system scans to the cache TTL", async () => {
    const clock = makeTimers();
    const scanFn = makeScanFn([
      [{ host: "127.0.0.1", port: 5173 }],
      [{ host: "127.0.0.1", port: 5173 }],
    ]);
    const controller = new PortScannerController({
      scanFn,
      cacheTtlMs: 15_000,
      notifyIntervalMs: 3_000,
      timers: clock.timers,
    });
    const unsubscribe = controller.subscribe(() => undefined);
    expect(scanFn).toHaveBeenCalledTimes(1);
    clock.advance(3_000);
    clock.advance(3_000);
    clock.advance(3_000);
    clock.advance(3_000);
    // Within the 15s TTL of the first scan, no new system scan runs.
    expect(scanFn).toHaveBeenCalledTimes(1);
    unsubscribe();
    controller.stop();
  });

  it("resumes polling after the reference count returns to one", async () => {
    const clock = makeTimers();
    const scanFn = makeScanFn([
      [{ host: "127.0.0.1", port: 5173 }],
      [{ host: "127.0.0.1", port: 5173 }],
      [{ host: "127.0.0.1", port: 5173 }],
    ]);
    const controller = new PortScannerController({
      scanFn,
      timers: clock.timers,
    });
    const unsub1 = controller.subscribe(() => undefined);
    const unsub2 = controller.subscribe(() => undefined);
    unsub1();
    unsub2();
    expect(clock.pending).toHaveLength(0);

    const unsub3 = controller.subscribe(() => undefined);
    expect(clock.pending).toHaveLength(1);
    unsub3();
    controller.stop();
  });

  it("stops polling entirely after stop()", async () => {
    const clock = makeTimers();
    const controller = new PortScannerController({
      scanFn: makeScanFn([[]]),
      timers: clock.timers,
    });
    const unsubscribe = controller.subscribe(() => undefined);
    controller.stop();
    expect(clock.pending).toHaveLength(0);
    expect(controller.getPorts()).toEqual([]);
    unsubscribe();
  });
});
