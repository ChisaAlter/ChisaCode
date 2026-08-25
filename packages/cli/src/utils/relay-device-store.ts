import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { resolveChisaCodeHome } from "@chisacode/server";
import {
  RelayDeviceCredentialClient,
  createRelayDeviceId,
  type RelayDeviceCredential,
  type RelayDeviceCredentialStoreAdapter,
} from "@chisacode/client/relay-device-credentials";
import type { ConnectionOffer } from "@chisacode/protocol/connection-offer";

const STORE_FILE_NAME = "cli-relay-devices.json";

interface StoreFileShape {
  version: 1;
  credentials: RelayDeviceCredential[];
}

function parseStoreFile(raw: string): RelayDeviceCredential[] {
  const parsed = JSON.parse(raw) as Partial<StoreFileShape> | null;
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.credentials)) {
    return [];
  }
  return parsed.credentials.filter(
    (entry): entry is RelayDeviceCredential =>
      typeof entry?.serverId === "string" &&
      typeof entry?.deviceId === "string" &&
      typeof entry?.deviceSecret === "string",
  );
}

/**
 * File-backed relay device credential store for the CLI, persisted under
 * `$CHISACODE_HOME/cli-relay-devices.json` with owner-only permissions.
 * Corrupt or unreadable store files are treated as empty rather than fatal so
 * a damaged cache can never block pairing again with a fresh offer.
 */
export class FileRelayDeviceCredentialStore implements RelayDeviceCredentialStoreAdapter {
  constructor(private readonly filePath: string) {}

  async load(): Promise<RelayDeviceCredential[]> {
    try {
      return parseStoreFile(await readFile(this.filePath, "utf8"));
    } catch {
      return [];
    }
  }

  async save(credentials: RelayDeviceCredential[]): Promise<void> {
    const payload: StoreFileShape = { version: 1, credentials };
    await mkdir(dirname(this.filePath), { recursive: true });
    // Atomic replace: never leave a truncated secrets file on crash.
    const tempPath = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(tempPath, JSON.stringify(payload, null, 2), { mode: 0o600 });
    await rename(tempPath, this.filePath);
  }
}

/**
 * Creates the CLI's relay device credential client rooted at the resolved
 * ChisaCode home for the provided environment.
 * @param env Environment to resolve `CHISACODE_HOME` from (defaults to process.env)
 * @returns A credential client backed by the CLI's on-disk store
 */
export function createCliRelayDeviceCredentialClient(
  env: NodeJS.ProcessEnv = process.env,
): RelayDeviceCredentialClient {
  const filePath = join(resolveChisaCodeHome(env), STORE_FILE_NAME);
  return new RelayDeviceCredentialClient(new FileRelayDeviceCredentialStore(filePath));
}

/** Relay device auth material passed to the daemon client for one connect attempt. */
export interface RelayOfferDeviceAuth {
  version: 1;
  serverId: string;
  deviceId: string;
  deviceSecret?: string;
  pairingToken?: string;
}

/**
 * Resolves the relay device auth to present for a connection offer. A stored
 * device secret for the offer's server wins; otherwise a fresh device id is
 * paired with the offer's one-time bootstrap token when present. Returns null
 * when neither is available (legacy offer against a daemon that does not
 * require device auth).
 * @param offer The parsed connection offer
 * @param storedCredential Previously issued credential for the offer's serverId, if any
 * @returns Auth material for the hello handshake, or null for legacy offers
 */
export function resolveRelayOfferDeviceAuth(
  offer: ConnectionOffer,
  storedCredential: RelayDeviceCredential | null,
): RelayOfferDeviceAuth | null {
  if (storedCredential) {
    return {
      version: 1,
      serverId: offer.serverId,
      deviceId: storedCredential.deviceId,
      deviceSecret: storedCredential.deviceSecret,
    };
  }
  const pairingToken = offer.authBootstrap?.pairingToken;
  if (pairingToken) {
    return {
      version: 1,
      serverId: offer.serverId,
      deviceId: createRelayDeviceId(),
      pairingToken,
    };
  }
  return null;
}
