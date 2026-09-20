import {
  decodeFileTransferFrame,
  FileTransferOpcode,
  type FileTransferFrame,
} from "./file-transfer.js";
import {
  decodeTerminalStreamFrame,
  TerminalStreamOpcode,
  type TerminalStreamFrame,
} from "./terminal.js";

export type BinaryFrame =
  | { kind: "terminal"; frame: TerminalStreamFrame }
  | { kind: "file_transfer"; frame: FileTransferFrame };

/**
 * Decodes a binary protocol frame by sniffing its leading opcode byte.
 *
 * Opcode-space invariant: every opcode must stay distinct from `{` (0x7b),
 * the first byte of every JSON protocol message. Server and client demux
 * incoming data by content sniffing — including binary frames the relay E2EE
 * codec delivered as strings (see the frame-type contract note in
 * @chisacode/relay crypto.ts decrypt) — so an opcode colliding with 0x7b
 * would misroute JSON messages into the binary path.
 * @param bytes Raw frame bytes (or UTF-8 re-encoded string delivery)
 * @returns The decoded frame, or null when the leading byte is not an opcode
 */
export function decodeBinaryFrame(bytes: Uint8Array): BinaryFrame | null {
  switch (bytes[0]) {
    case TerminalStreamOpcode.Output:
    case TerminalStreamOpcode.Input:
    case TerminalStreamOpcode.Resize:
    case TerminalStreamOpcode.Snapshot:
    case TerminalStreamOpcode.Restore: {
      const frame = decodeTerminalStreamFrame(bytes);
      return frame ? { kind: "terminal", frame } : null;
    }
    case FileTransferOpcode.FileBegin:
    case FileTransferOpcode.FileChunk:
    case FileTransferOpcode.FileEnd: {
      const frame = decodeFileTransferFrame(bytes);
      return frame ? { kind: "file_transfer", frame } : null;
    }
    default:
      return null;
  }
}
