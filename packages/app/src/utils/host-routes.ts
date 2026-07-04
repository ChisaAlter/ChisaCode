import { Buffer } from "buffer";

type NullableString = string | null | undefined;
const BASE64_WORKSPACE_ID_PREFIX = "b64_";

interface SettingsRouteOptions {
  returnTo?: NullableString;
}

function stripSearchAndHash(pathname: string): string {
  const hashIndex = pathname.indexOf("#");
  const queryIndex = pathname.indexOf("?");
  const end = [hashIndex, queryIndex]
    .filter((index) => index >= 0)
    .reduce((min, index) => Math.min(min, index), pathname.length);
  return pathname.slice(0, end);
}

function extractSearch(pathname: string): string {
  const queryIndex = pathname.indexOf("?");
  if (queryIndex < 0) {
    return "";
  }
  const hashIndex = pathname.indexOf("#", queryIndex);
  return hashIndex >= 0
    ? pathname.slice(queryIndex + 1, hashIndex)
    : pathname.slice(queryIndex + 1);
}

function trimNonEmpty(value: NullableString): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeSettingsReturnToRoute(value: string | string[] | null | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const normalized = trimNonEmpty(rawValue);
  if (!normalized || !normalized.startsWith("/") || normalized.startsWith("//")) {
    return null;
  }

  const pathOnly = stripSearchAndHash(normalized);
  if (pathOnly === "/settings" || pathOnly.startsWith("/settings/")) {
    return null;
  }

  return normalized;
}

function appendSettingsReturnTo(route: string, options?: SettingsRouteOptions) {
  const returnTo = normalizeSettingsReturnToRoute(options?.returnTo);
  if (!returnTo) {
    return route;
  }
  const separator = route.includes("?") ? "&" : "?";
  return `${route}${separator}returnTo=${encodeURIComponent(returnTo)}`;
}

function encodeSegment(value: string): string {
  return encodeURIComponent(value);
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function toBase64UrlNoPad(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64UrlNoPadUtf8(input: string): string | null {
  const normalized = input.trim();
  if (normalized.length === 0) {
    return null;
  }
  if (!/^[A-Za-z0-9_-]+$/.test(normalized)) {
    return null;
  }

  const base64 = normalized.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");

  let decoded: string;
  try {
    decoded = Buffer.from(padded, "base64").toString("utf8");
  } catch {
    return null;
  }

  return decoded;
}

function tryDecodeBase64UrlNoPadUtf8(input: string): string | null {
  const normalized = input.trim();
  const decoded = decodeBase64UrlNoPadUtf8(normalized);
  if (!decoded) {
    return null;
  }

  // Validate via round-trip to avoid false positives ("workspace-1" etc).
  if (toBase64UrlNoPad(decoded) !== normalized) {
    return null;
  }

  return decoded;
}

function normalizeWorkspaceId(value: string): string {
  return value.trim();
}

function isUrlSafeWorkspaceId(value: string): boolean {
  return /^[A-Za-z0-9._~-]+$/.test(value);
}

function isLegacyPathLikeWorkspaceValue(value: string): boolean {
  return value.includes("/") || value.includes("\\") || /^[A-Za-z]:[\\/]/.test(value);
}

export type WorkspaceOpenIntent =
  | { kind: "agent"; agentId: string }
  | { kind: "terminal"; terminalId: string }
  | { kind: "terminal-new" }
  | { kind: "changes" }
  | { kind: "file"; path: string }
  | { kind: "draft"; draftId: string }
  | { kind: "setup"; workspaceId: string };

export function parseWorkspaceOpenIntent(
  value: string | null | undefined,
): WorkspaceOpenIntent | null {
  const normalized = trimNonEmpty(value);
  if (!normalized) {
    return null;
  }

  const fixedIntent = normalized.toLowerCase();
  if (fixedIntent === "changes") {
    return { kind: "changes" };
  }
  if (fixedIntent === "terminal") {
    return { kind: "terminal-new" };
  }

  const separator = normalized.indexOf(":");
  if (separator <= 0 || separator >= normalized.length - 1) {
    return null;
  }

  const kind = normalized.slice(0, separator).trim().toLowerCase();
  const payload = trimNonEmpty(normalized.slice(separator + 1));
  if (!payload) {
    return null;
  }

  if (kind === "agent") {
    return { kind: "agent", agentId: payload };
  }
  if (kind === "terminal") {
    if (payload.toLowerCase() === "new") {
      return { kind: "terminal-new" };
    }
    return { kind: "terminal", terminalId: payload };
  }
  if (kind === "changes") {
    if (payload.toLowerCase() !== "review") {
      return null;
    }
    return { kind: "changes" };
  }
  if (kind === "draft") {
    return { kind: "draft", draftId: payload };
  }
  if (kind === "file") {
    const decodedPath = decodeFilePathFromPathSegment(payload);
    if (!decodedPath) {
      return null;
    }
    return { kind: "file", path: decodedPath };
  }
  if (kind === "setup") {
    const workspaceId = decodeWorkspaceIdFromPathSegment(payload);
    if (!workspaceId) {
      return null;
    }
    return { kind: "setup", workspaceId };
  }

  return null;
}

export function isWorkspaceScreenOpenIntent(intent: WorkspaceOpenIntent): boolean {
  return intent.kind === "changes" || intent.kind === "terminal-new";
}

export function parseHostWorkspaceOpenIntentFromPathname(
  pathname: string,
): WorkspaceOpenIntent | null {
  const search = extractSearch(pathname);
  if (!search) {
    return null;
  }
  return parseWorkspaceOpenIntent(new URLSearchParams(search).get("open"));
}

export function encodeWorkspaceIdForPathSegment(workspaceId: string): string {
  const normalized = trimNonEmpty(workspaceId);
  if (!normalized) {
    return "";
  }
  const id = normalizeWorkspaceId(normalized);
  if (isUrlSafeWorkspaceId(id)) {
    return id;
  }
  return `${BASE64_WORKSPACE_ID_PREFIX}${toBase64UrlNoPad(id)}`;
}

export function decodeWorkspaceIdFromPathSegment(workspaceIdSegment: string): string | null {
  const normalizedSegment = trimNonEmpty(workspaceIdSegment);
  if (!normalizedSegment) {
    return null;
  }

  const decoded = trimNonEmpty(decodeSegment(normalizedSegment));
  if (!decoded) {
    return null;
  }

  if (decoded.startsWith(BASE64_WORKSPACE_ID_PREFIX)) {
    const encodedPayload = decoded.slice(BASE64_WORKSPACE_ID_PREFIX.length);
    const prefixedDecoded =
      tryDecodeBase64UrlNoPadUtf8(encodedPayload) ?? decodeBase64UrlNoPadUtf8(encodedPayload);
    return prefixedDecoded ? normalizeWorkspaceId(prefixedDecoded) : null;
  }

  const base64Decoded = tryDecodeBase64UrlNoPadUtf8(decoded);
  if (base64Decoded && isLegacyPathLikeWorkspaceValue(base64Decoded)) {
    return normalizeWorkspaceId(base64Decoded);
  }

  const relaxedBase64Decoded = decodeBase64UrlNoPadUtf8(decoded);
  if (relaxedBase64Decoded && isLegacyPathLikeWorkspaceValue(relaxedBase64Decoded)) {
    return normalizeWorkspaceId(relaxedBase64Decoded);
  }

  return normalizeWorkspaceId(decoded);
}

export function encodeFilePathForPathSegment(filePath: string): string {
  const normalized = trimNonEmpty(filePath);
  if (!normalized) {
    return "";
  }
  return toBase64UrlNoPad(normalized);
}

export function decodeFilePathFromPathSegment(filePathSegment: string): string | null {
  const normalizedSegment = trimNonEmpty(filePathSegment);
  if (!normalizedSegment) {
    return null;
  }
  const decoded = trimNonEmpty(decodeSegment(normalizedSegment));
  if (!decoded) {
    return null;
  }
  return tryDecodeBase64UrlNoPadUtf8(decoded);
}

export function parseServerIdFromPathname(pathname: string): string | null {
  const pathOnly = stripSearchAndHash(pathname);
  const match = pathOnly.match(/^\/h\/([^/]+)(?:\/|$)/);
  if (!match) {
    return null;
  }
  const raw = match[1];
  if (!raw) {
    return null;
  }
  return trimNonEmpty(decodeSegment(raw));
}

export function parseSettingsHostRouteFromPathname(pathname: string): string | null {
  const pathOnly = stripSearchAndHash(pathname);
  const match = pathOnly.match(/^\/settings\/hosts\/([^/]+)(?:\/|$)/);
  if (!match) {
    return null;
  }

  const raw = match[1];
  if (!raw) {
    return null;
  }
  return trimNonEmpty(decodeSegment(raw));
}

export function parseHostAgentRouteFromPathname(
  pathname: string,
): { serverId: string; agentId: string } | null {
  const pathOnly = stripSearchAndHash(pathname);
  const match = pathOnly.match(/^\/h\/([^/]+)\/agent\/([^/]+)(?:\/|$)/);
  if (!match) {
    return null;
  }

  const [, encodedServerId, encodedAgentId] = match;
  if (!encodedServerId || !encodedAgentId) {
    return null;
  }

  const serverId = trimNonEmpty(decodeSegment(encodedServerId));
  const agentId = trimNonEmpty(decodeSegment(encodedAgentId));
  if (!serverId || !agentId) {
    return null;
  }

  return { serverId, agentId };
}

export function parseHostWorkspaceRouteFromPathname(
  pathname: string,
): { serverId: string; workspaceId: string } | null {
  const pathOnly = stripSearchAndHash(pathname);
  const match = pathOnly.match(/^\/h\/([^/]+)\/workspace\/([^/]+)\/?$/);
  if (!match) {
    return null;
  }

  const serverId = trimNonEmpty(decodeSegment(match[1]));
  if (!serverId) {
    return null;
  }

  const rawWorkspaceId = match[2];
  const workspaceId = decodeWorkspaceIdFromPathSegment(rawWorkspaceId);
  if (!workspaceId) {
    return null;
  }
  return { serverId, workspaceId };
}

export function buildHostWorkspaceRoute(serverId: string, workspaceId: string) {
  const normalizedServerId = trimNonEmpty(serverId);
  const normalizedWorkspaceId = trimNonEmpty(workspaceId);
  if (!normalizedServerId || !normalizedWorkspaceId) {
    return "/" as const;
  }
  const encodedWorkspaceId = encodeWorkspaceIdForPathSegment(normalizedWorkspaceId);
  if (!encodedWorkspaceId) {
    return "/" as const;
  }
  return `/h/${encodeSegment(normalizedServerId)}/workspace/${encodeSegment(encodedWorkspaceId)}` as const;
}

export function buildHostWorkspaceOpenRoute(
  serverId: string,
  workspaceId: string,
  openIntent: string,
) {
  const base = buildHostWorkspaceRoute(serverId, workspaceId);
  const normalizedOpenIntent = trimNonEmpty(openIntent);
  if (base === "/" || !normalizedOpenIntent) {
    return base;
  }
  return `${base}?open=${encodeURIComponent(normalizedOpenIntent)}` as const;
}

export function buildHostAgentDetailRoute(serverId: string, agentId: string, workspaceId?: string) {
  const normalizedWorkspaceId = trimNonEmpty(workspaceId);
  if (normalizedWorkspaceId) {
    const normalizedAgentId = trimNonEmpty(agentId);
    if (!normalizedAgentId) {
      return "/" as const;
    }
    return buildHostWorkspaceOpenRoute(
      serverId,
      normalizedWorkspaceId,
      `agent:${normalizedAgentId}`,
    );
  }
  const normalizedServerId = trimNonEmpty(serverId);
  const normalizedAgentId = trimNonEmpty(agentId);
  if (!normalizedServerId || !normalizedAgentId) {
    return "/" as const;
  }
  return `${buildHostRootRoute(normalizedServerId)}/agent/${encodeSegment(normalizedAgentId)}` as const;
}

export function buildHostRootRoute(serverId: string) {
  const normalized = trimNonEmpty(serverId);
  if (!normalized) {
    return "/" as const;
  }
  return `/h/${encodeSegment(normalized)}` as const;
}

export function buildHostSessionsRoute(serverId: string) {
  const base = buildHostRootRoute(serverId);
  if (base === "/") {
    return "/" as const;
  }
  return `${base}/sessions` as const;
}

export function buildHostOpenProjectRoute(serverId: string) {
  const base = buildHostRootRoute(serverId);
  if (base === "/") {
    return "/" as const;
  }
  return `${base}/open-project` as const;
}

export function buildHostNewWorkspaceRoute(
  serverId: string,
  sourceDirectory?: NullableString,
  options?: { displayName?: string; projectId?: string; draftKey?: string },
) {
  const base = buildHostRootRoute(serverId);
  const normalizedSourceDirectory = trimNonEmpty(sourceDirectory);
  if (base === "/") {
    return "/" as const;
  }
  if (!normalizedSourceDirectory && !options) {
    return `${base}/new` as const;
  }
  const params = new URLSearchParams();
  if (normalizedSourceDirectory) {
    params.set("dir", normalizedSourceDirectory);
  }
  const displayName = trimNonEmpty(options?.displayName);
  const projectId = trimNonEmpty(options?.projectId);
  const draftKey = trimNonEmpty(options?.draftKey);
  if (displayName) {
    params.set("name", displayName);
  }
  if (projectId) {
    params.set("projectId", projectId);
  }
  if (draftKey) {
    params.set("draft", draftKey);
  }
  const search = params.toString();
  return search ? (`${base}/new?${search}` as const) : (`${base}/new` as const);
}

export const SETTINGS_SECTION_SLUGS = [
  "general",
  "models",
  "usage",
  "skills",
  "mcp",
  "shortcuts",
  "integrations",
  "permissions",
  "diagnostics",
  "feedback",
  "about",
] as const;

export type SettingsSectionSlug = (typeof SETTINGS_SECTION_SLUGS)[number];

export function isSettingsSectionSlug(value: string): value is SettingsSectionSlug {
  return (SETTINGS_SECTION_SLUGS as readonly string[]).includes(value);
}

export function buildSettingsRoute(): "/settings";
export function buildSettingsRoute(options: SettingsRouteOptions): string;
export function buildSettingsRoute(options?: SettingsRouteOptions) {
  return appendSettingsReturnTo("/settings", options);
}

export function buildSettingsSectionRoute(section: SettingsSectionSlug): `/settings/${string}`;
export function buildSettingsSectionRoute(
  section: SettingsSectionSlug,
  options: SettingsRouteOptions,
): string;
export function buildSettingsSectionRoute(
  section: SettingsSectionSlug,
  options?: SettingsRouteOptions,
) {
  return appendSettingsReturnTo(`/settings/${section}`, options);
}

export function buildSettingsHostRoute(serverId: string): `/settings/hosts/${string}`;
export function buildSettingsHostRoute(serverId: string, options: SettingsRouteOptions): string;
export function buildSettingsHostRoute(serverId: string, options?: SettingsRouteOptions) {
  const normalized = trimNonEmpty(serverId);
  if (!normalized) {
    throw new Error("buildSettingsHostRoute requires a non-empty serverId");
  }
  return appendSettingsReturnTo(`/settings/hosts/${encodeSegment(normalized)}`, options);
}

export function buildProjectsSettingsRoute(): "/settings/projects";
export function buildProjectsSettingsRoute(options: SettingsRouteOptions): string;
export function buildProjectsSettingsRoute(options?: SettingsRouteOptions) {
  return appendSettingsReturnTo("/settings/projects", options);
}

export function buildProjectSettingsRoute(projectKey: string): `/settings/projects/${string}`;
export function buildProjectSettingsRoute(
  projectKey: string,
  options: SettingsRouteOptions,
): string;
export function buildProjectSettingsRoute(projectKey: string, options?: SettingsRouteOptions) {
  const normalized = trimNonEmpty(projectKey);
  if (!normalized) {
    throw new Error("buildProjectSettingsRoute requires a non-empty projectKey");
  }
  return appendSettingsReturnTo(`/settings/projects/${encodeSegment(normalized)}`, options);
}

export function mapPathnameToServer(pathname: string, nextServerId: string) {
  const normalized = trimNonEmpty(nextServerId);
  if (!normalized) {
    return "/" as const;
  }

  if (parseSettingsHostRouteFromPathname(pathname)) {
    return buildSettingsHostRoute(normalized);
  }

  const suffix = pathname.replace(/^\/h\/[^/]+\/?/, "");
  const base = buildHostRootRoute(normalized);
  if (suffix.startsWith("settings")) {
    return buildSettingsHostRoute(normalized);
  }
  if (suffix.startsWith("sessions")) {
    return `${base}/sessions` as const;
  }
  if (suffix.startsWith("open-project")) {
    return `${base}/open-project` as const;
  }
  const workspaceRoute = parseHostWorkspaceRouteFromPathname(pathname);
  if (workspaceRoute) {
    return buildHostWorkspaceRoute(normalized, workspaceRoute.workspaceId);
  }
  if (suffix.startsWith("agent/")) {
    return `${base}/${suffix}` as const;
  }
  return base;
}
