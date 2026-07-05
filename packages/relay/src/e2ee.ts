export { createClientChannel, createDaemonChannel, EncryptedChannel } from "./encrypted-channel.js";
export type { Transport, EncryptedChannelEvents } from "./encrypted-channel.js";

export {
  generateKeyPair,
  exportPublicKey,
  importPublicKey,
  exportSecretKey,
  importSecretKey,
  encrypt,
  decrypt,
  deriveSharedKey,
  SALT_LENGTH,
  SEQ_LENGTH,
} from "./crypto.js";
export type { KeyPair, SharedKey, DecryptResult } from "./crypto.js";
