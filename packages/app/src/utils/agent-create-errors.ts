import { appI18n } from "@/i18n";

/**
 * Stable daemon create-failure codes mapped to localized i18n keys. The daemon
 * sends `errorCode` on `agent_create_failed` (surfaced by the client as
 * `AgentCreateError.code`); codes listed here render localized copy, anything
 * else falls back to the daemon-provided message text.
 */
const CREATE_ERROR_CODE_I18N_KEYS: Record<string, string> = {
  DSH_MISSING_API_KEY: "panels.agent.createErrorDshMissingApiKey",
};

/**
 * Resolves the user-facing message for an agent-create failure.
 * @param error The create failure thrown by the daemon client
 * @returns Localized copy for known error codes, otherwise the raw message
 */
export function resolveAgentCreateErrorMessage(error: Error): string {
  const code = Reflect.get(error, "code");
  if (typeof code === "string") {
    const key = CREATE_ERROR_CODE_I18N_KEYS[code];
    if (key) {
      return appI18n.t(key);
    }
  }
  return error.message;
}
