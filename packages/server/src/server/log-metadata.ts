import { createHash } from "node:crypto";

const LOG_IDENTIFIER_HASH_SAMPLE_CODE_UNITS = 256;

export interface UntrustedLogIdentifierSummary {
  length: number;
  fingerprint: string;
}

/**
 * Summarizes an untrusted identifier without retaining raw text or control characters.
 * @param value Untrusted identifier to summarize
 * @returns Fixed-size length and fingerprint metadata
 */
export function summarizeUntrustedLogIdentifier(value: string): UntrustedLogIdentifierSummary {
  const sample = value.slice(0, LOG_IDENTIFIER_HASH_SAMPLE_CODE_UNITS);
  const fingerprint = createHash("sha256")
    .update(String(value.length))
    .update(":")
    .update(sample)
    .digest("hex")
    .slice(0, 16);
  return { length: value.length, fingerprint };
}
