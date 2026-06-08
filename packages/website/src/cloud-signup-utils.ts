/**
 * Pure utilities for cloud signup form validation and Discord embed building.
 * Extracted from cloud-signup.ts for testability.
 */

export interface CloudSignupInput {
  email: string;
  name?: string;
  company?: string;
  role?: string;
  message: string;
  honeypot?: string;
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function asString(v: unknown, max: number): string {
  if (typeof v !== "string") throw new Error("expected string");
  const trimmed = v.trim();
  if (trimmed.length > max) throw new Error("field too long");
  return trimmed;
}

export function validate(raw: unknown): CloudSignupInput {
  if (typeof raw !== "object" || raw === null) throw new Error("invalid input");
  const r = raw as Record<string, unknown>;

  const email = asString(r.email, 320);
  if (!EMAIL_RE.test(email)) throw new Error("invalid email");

  const message = asString(r.message, 4000);
  if (message.length === 0) throw new Error("message required");

  const name = r.name === undefined || r.name === "" ? undefined : asString(r.name, 200);
  const company =
    r.company === undefined || r.company === "" ? undefined : asString(r.company, 200);
  const role = r.role === undefined || r.role === "" ? undefined : asString(r.role, 200);
  const honeypot = typeof r.honeypot === "string" ? r.honeypot : "";

  return { email, name, company, role, message, honeypot };
}

export function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

export function buildEmbed(input: CloudSignupInput) {
  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    { name: "Email", value: truncate(input.email, 1024), inline: true },
  ];
  if (input.name) {
    fields.push({ name: "Name", value: truncate(input.name, 1024), inline: true });
  }
  if (input.company) {
    fields.push({ name: "Company", value: truncate(input.company, 1024), inline: true });
  }
  if (input.role) {
    fields.push({ name: "Role", value: truncate(input.role, 1024), inline: true });
  }
  fields.push({ name: "Message", value: truncate(input.message, 1024) });

  return {
    title: "ChisaCode Cloud signup",
    color: 0x5865f2,
    fields,
    timestamp: new Date().toISOString(),
  };
}
