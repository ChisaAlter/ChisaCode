import type { Href } from "expo-router";
import {
  buildHostAgentDetailRoute,
  buildHostRootRoute,
  buildHostWorkspaceRoute,
} from "@/utils/host-routes";

type NotificationData = Record<string, unknown> | null | undefined;
type NotificationRoute = Extract<Href, string>;

/** Launch-intent extra containing canonical Android notification navigation JSON. */
export const ANDROID_NOTIFICATION_DATA_EXTRA = "chisacode.notification.data";
const MAX_ANDROID_NOTIFICATION_ID_LENGTH = 512;

/** Validated navigation identifiers accepted from an Android notification intent. */
export interface AndroidNotificationData extends Record<string, unknown> {
  serverId: string;
  agentId: string;
}

function readNonEmptyString(data: NotificationData, key: string): string | null {
  const value = data?.[key];
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readBoundedNotificationId(data: NotificationData, key: string): string | null {
  const value = readNonEmptyString(data, key);
  return value && value.length <= MAX_ANDROID_NOTIFICATION_ID_LENGTH ? value : null;
}

/**
 * Builds the canonical JSON stored in an Android notification launch intent.
 * @param data Notification navigation data
 * @returns Canonical JSON containing only serverId and agentId, or null when invalid
 */
export function buildAndroidNotificationData(data: NotificationData): string | null {
  const serverId = readBoundedNotificationId(data, "serverId");
  const agentId = readBoundedNotificationId(data, "agentId");
  if (!serverId || !agentId) {
    return null;
  }
  return JSON.stringify({ serverId, agentId });
}

/**
 * Parses Android launch-intent notification JSON without exposing unrelated extras.
 * @param encoded Canonical notification JSON from the native launch intent
 * @returns Validated navigation data, or null when missing or malformed
 */
export function parseAndroidNotificationData(
  encoded: string | null | undefined,
): AndroidNotificationData | null {
  if (!encoded) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(encoded);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    const data = parsed as Record<string, unknown>;
    const serverId = readBoundedNotificationId(data, "serverId");
    const agentId = readBoundedNotificationId(data, "agentId");
    return serverId && agentId ? { serverId, agentId } : null;
  } catch {
    return null;
  }
}

export function resolveNotificationTarget(data: NotificationData): {
  serverId: string | null;
  agentId: string | null;
  workspaceId: string | null;
} {
  return {
    serverId: readNonEmptyString(data, "serverId"),
    agentId: readNonEmptyString(data, "agentId"),
    workspaceId: readNonEmptyString(data, "workspaceId"),
  };
}

export function buildNotificationRoute(data: NotificationData): NotificationRoute {
  const { serverId, agentId, workspaceId } = resolveNotificationTarget(data);
  if (serverId && agentId) {
    return buildHostAgentDetailRoute(serverId, agentId, workspaceId ?? undefined);
  }
  if (serverId && workspaceId) {
    return buildHostWorkspaceRoute(serverId, workspaceId);
  }
  if (serverId) {
    return buildHostRootRoute(serverId);
  }
  return "/" as const;
}
