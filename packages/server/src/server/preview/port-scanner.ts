import { spawnSync } from "node:child_process";

/**
 * A listening TCP port on the daemon host that serves HTTP content.
 */
export interface DiscoveredPort {
  host: string;
  port: number;
  processName?: string;
}

export interface ScanListeningPortsOptions {
  platform?: NodeJS.Platform;
  execFn?: (
    command: string,
    args: string[],
  ) => { status: number | null; stdout: string; stderr: string };
}

const COMMON_DEV_PORTS = [
  3000, 3001, 3333, 4173, 4200, 4321, 5000, 5173, 5174, 5175, 5500, 8000, 8080, 8081, 8888, 9000,
] as const;

function defaultExec(command: string, args: string[]) {
  // PowerShell's first invocation in a fresh process pays .NET JIT cost that
  // can exceed 10s on loaded machines; a timeout here silently yields an
  // empty scan for that round.
  return spawnSync(command, args, { encoding: "utf8", timeout: 25_000 });
}

export function parseLsofOutput(stdout: string): DiscoveredPort[] {
  const ports = new Map<number, DiscoveredPort>();
  let currentProcess: string | null = null;
  let currentPid: string | null = null;
  for (const line of stdout.split("\n")) {
    if (line.startsWith("p")) {
      currentPid = line.slice(1) || null;
      continue;
    }
    if (line.startsWith("c")) {
      currentProcess = line.slice(1) || currentProcess;
      continue;
    }
    if (!line.startsWith("n")) {
      continue;
    }
    // n<host>:<port> (TCP, LISTEN only per the lsof filter)
    const address = line.slice(1);
    const portMatch = /:(\d+)$/.exec(address);
    if (!portMatch) {
      continue;
    }
    const port = Number(portMatch[1]);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      continue;
    }
    if (ports.has(port)) {
      continue;
    }
    ports.set(port, {
      host: "127.0.0.1",
      port,
      ...(currentProcess ? { processName: currentProcess } : {}),
    });
    void currentPid;
  }
  return [...ports.values()];
}

function parseNetstatOutput(
  stdout: string,
  execFn: (
    command: string,
    args: string[],
  ) => { status: number | null; stdout: string; stderr: string },
): DiscoveredPort[] {
  // netstat -ano lines: "  TCP    0.0.0.0:135    0.0.0.0:0    LISTENING    1234"
  const ports = new Map<number, DiscoveredPort>();
  const pidsByPort = new Map<number, string>();
  for (const line of stdout.split("\n")) {
    const match = /^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/i.exec(line);
    if (!match) {
      continue;
    }
    const port = Number(match[1]);
    const pid = match[2];
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      continue;
    }
    if (!pidsByPort.has(port)) {
      pidsByPort.set(port, pid);
    }
  }
  if (pidsByPort.size === 0) {
    return [];
  }
  // Process names are cosmetic; resolving them in bulk keeps the port list
  // fast even when the name lookup fails entirely.
  const nameByPid = resolveProcessNames([...pidsByPort.values()], execFn);
  for (const [port, pid] of pidsByPort) {
    const processName = nameByPid.get(pid);
    ports.set(port, {
      host: "127.0.0.1",
      port,
      ...(processName ? { processName } : {}),
    });
  }
  return [...ports.values()];
}

function resolveProcessNames(
  pids: string[],
  execFn: (
    command: string,
    args: string[],
  ) => { status: number | null; stdout: string; stderr: string },
): Map<string, string> {
  const nameByPid = new Map<string, string>();
  // One Get-Process call per 25-PID chunk keeps command lines short; a failed
  // chunk only drops those names.
  for (let index = 0; index < pids.length; index += 25) {
    const chunk = pids.slice(index, index + 25);
    const result = execFn("powershell.exe", [
      "-NoProfile",
      "-Command",
      `Get-Process -Id ${chunk.join(",")} -ErrorAction SilentlyContinue | Select-Object Id,ProcessName | ForEach-Object { "$($_.Id)\t$($_.ProcessName)" }`,
    ]);
    if (result.status !== 0) {
      continue;
    }
    for (const line of result.stdout.split("\n")) {
      const [pid, name] = line.trim().split(/\t/);
      if (pid && name) {
        nameByPid.set(pid, name);
      }
    }
  }
  return nameByPid;
}

/**
 * Lists TCP ports currently listening on the daemon host (best effort).
 * Windows uses Get-NetTCPConnection; macOS/Linux use lsof. When the platform
 * command fails, falls back to probing {@link COMMON_DEV_PORTS} over HTTP.
 * The caller still filters results to HTTP responders before display.
 * @param options Platform override and injectable exec for tests
 * @returns Deduplicated discovered ports; empty when detection is unavailable
 */
export function scanListeningPorts(options: ScanListeningPortsOptions = {}): DiscoveredPort[] {
  const platform = options.platform ?? process.platform;
  const execFn = options.execFn ?? defaultExec;
  if (platform === "win32") {
    // netstat is instant and dependable from Electron-spawned workers;
    // Get-NetTCPConnection pays PowerShell .NET JIT cost that can exceed the
    // scan budget on loaded machines.
    const result = execFn("netstat", ["-ano", "-p", "TCP"]);
    if (result.status === 0 && result.stdout.trim().length > 0) {
      return parseNetstatOutput(result.stdout, execFn);
    }
    return [];
  }
  if (platform === "darwin" || platform === "linux") {
    const result = execFn("lsof", ["-iTCP", "-sTCP:LISTEN", "-P", "-n", "-F", "pcn"]);
    if (result.status === 0 && result.stdout.trim().length > 0) {
      return parseLsofOutput(result.stdout);
    }
    return [];
  }
  return [];
}

export { COMMON_DEV_PORTS };
