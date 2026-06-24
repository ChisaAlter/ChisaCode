// Audio-related constants, types, and pure helpers extracted from session.ts.
// These have no dependency on the Session class or its mutable state.

export const PCM_SAMPLE_RATE = 16000;
export const PCM_CHANNELS = 1;
export const PCM_BITS_PER_SAMPLE = 16;
export const PCM_BYTES_PER_MS = (PCM_SAMPLE_RATE * PCM_CHANNELS * (PCM_BITS_PER_SAMPLE / 8)) / 1000;
export const MIN_STREAMING_SEGMENT_DURATION_MS = 1000;
export const MIN_STREAMING_SEGMENT_BYTES = Math.round(
  PCM_BYTES_PER_MS * MIN_STREAMING_SEGMENT_DURATION_MS,
);

export interface VoiceModeBaseConfig {
  systemPrompt?: string;
}

export interface AudioBufferState {
  chunks: Buffer[];
  format: string;
  isPCM: boolean;
  totalPCMBytes: number;
}

/**
 * Wrap a raw PCM buffer in a WAV container so it can be played by clients that
 * expect a self-describing audio format.
 */
export function convertPCMToWavBuffer(
  pcmBuffer: Buffer,
  sampleRate: number,
  channels: number,
  bitsPerSample: number,
): Buffer {
  const headerSize = 44;
  const wavBuffer = Buffer.alloc(headerSize + pcmBuffer.length);
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;

  wavBuffer.write("RIFF", 0);
  wavBuffer.writeUInt32LE(36 + pcmBuffer.length, 4);
  wavBuffer.write("WAVE", 8);
  wavBuffer.write("fmt ", 12);
  wavBuffer.writeUInt32LE(16, 16);
  wavBuffer.writeUInt16LE(1, 20);
  wavBuffer.writeUInt16LE(channels, 22);
  wavBuffer.writeUInt32LE(sampleRate, 24);
  wavBuffer.writeUInt32LE(byteRate, 28);
  wavBuffer.writeUInt16LE(blockAlign, 32);
  wavBuffer.writeUInt16LE(bitsPerSample, 34);
  wavBuffer.write("data", 36);
  wavBuffer.writeUInt32LE(pcmBuffer.length, 40);
  pcmBuffer.copy(wavBuffer, 44);

  return wavBuffer;
}
