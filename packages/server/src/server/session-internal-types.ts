// Internal types extracted from session.ts that have minimal external dependencies.
// These are implementation details of the Session class and not part of its public API.

import type { FSWatcher } from "node:fs";

import type { LocalSpeechModelId } from "./speech/providers/local/models.js";
import type { SpeechReadinessSnapshot } from "./speech/speech-runtime.js";

export type ProcessingPhase = "idle" | "transcribing";

export interface WorkspaceGitWatchTarget {
  cwd: string;
  workspaceId: string;
  watchers: FSWatcher[];
  debounceTimer: ReturnType<typeof setTimeout> | null;
  refreshPromise: Promise<void> | null;
  refreshQueued: boolean;
  latestDescriptorStateKey: string | null;
  lastBranchName: string | null;
}

export interface SessionRuntimeMetrics {
  terminalDirectorySubscriptionCount: number;
  terminalSubscriptionCount: number;
  inflightRequests: number;
  peakInflightRequests: number;
}

// Stub type for a feature under development (module not yet available)
export type AgentMcpTransportFactory = () => Promise<unknown>;

export interface VoiceTranscriptionResultPayload {
  text: string;
  requestId: string;
  language?: string;
  duration?: number;
  avgLogprob?: number;
  isLowConfidence?: boolean;
  byteLength?: number;
  format?: string;
  debugRecordingPath?: string;
}

export interface VoiceFeatureUnavailableContext {
  reasonCode: SpeechReadinessSnapshot["voiceFeature"]["reasonCode"];
  message: string;
  retryable: boolean;
  missingModelIds: LocalSpeechModelId[];
}

export interface VoiceFeatureUnavailableResponseMetadata {
  reasonCode?: SpeechReadinessSnapshot["voiceFeature"]["reasonCode"];
  retryable?: boolean;
  missingModelIds?: LocalSpeechModelId[];
}

export class VoiceFeatureUnavailableError extends Error {
  readonly reasonCode: SpeechReadinessSnapshot["voiceFeature"]["reasonCode"];
  readonly retryable: boolean;
  readonly missingModelIds: LocalSpeechModelId[];

  constructor(context: VoiceFeatureUnavailableContext) {
    super(context.message);
    this.name = "VoiceFeatureUnavailableError";
    this.reasonCode = context.reasonCode;
    this.retryable = context.retryable;
    this.missingModelIds = [...context.missingModelIds];
  }
}
