import type { HostRuntimeConnectionStatus } from "@/runtime/host-runtime";
import { assertUnreachable } from "./exhaustive";

export function formatConnectionStatus(status: HostRuntimeConnectionStatus): string {
  switch (status) {
    case "online":
      return "在线";
    case "connecting":
      return "连接中";
    case "offline":
      return "离线";
    case "error":
      return "错误";
    case "idle":
      return "空闲";
    default:
      return assertUnreachable(status);
  }
}

export type ConnectionStatusTone = "success" | "warning" | "error" | "muted";

export function getConnectionStatusTone(status: HostRuntimeConnectionStatus): ConnectionStatusTone {
  switch (status) {
    case "online":
      return "success";
    case "connecting":
      return "warning";
    case "error":
      return "error";
    case "offline":
      return "warning";
    case "idle":
      return "muted";
    default:
      return assertUnreachable(status);
  }
}
