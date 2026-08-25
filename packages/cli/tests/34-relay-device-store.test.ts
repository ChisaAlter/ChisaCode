import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RelayDeviceCredentialClient } from "@chisacode/client/relay-device-credentials";
import type { ConnectionOffer } from "@chisacode/protocol/connection-offer";
import {
  FileRelayDeviceCredentialStore,
  resolveRelayOfferDeviceAuth,
} from "../src/utils/relay-device-store.ts";

function buildOffer(overrides: Partial<ConnectionOffer> = {}): ConnectionOffer {
  return {
    v: 2,
    serverId: "srv_test",
    daemonPublicKeyB64: "daemon-pub-key",
    relay: { endpoint: "127.0.0.1:5555" },
    ...overrides,
  };
}

describe("FileRelayDeviceCredentialStore", () => {
  let dir: string;
  let filePath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "cli-relay-devices-"));
    filePath = join(dir, "nested", "cli-relay-devices.json");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("round-trips credentials through the credential client", async () => {
    const client = new RelayDeviceCredentialClient(new FileRelayDeviceCredentialStore(filePath));
    await client.upsert({
      serverId: "srv_a",
      deviceId: "dev_1",
      deviceSecret: "secret_1",
      daemonPublicKeyB64: "pk_a",
    });

    const reloaded = new RelayDeviceCredentialClient(new FileRelayDeviceCredentialStore(filePath));
    const credential = await reloaded.get("srv_a");
    expect(credential?.deviceId).toBe("dev_1");
    expect(credential?.deviceSecret).toBe("secret_1");
    expect(await reloaded.get("srv_missing")).toBeNull();
  });

  it("writes the store file with owner-only permissions", async () => {
    const store = new FileRelayDeviceCredentialStore(filePath);
    await store.save([
      {
        serverId: "srv_a",
        deviceId: "dev_1",
        deviceSecret: "secret_1",
        daemonPublicKeyB64: "pk_a",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
    if (process.platform !== "win32") {
      const mode = (await stat(filePath)).mode & 0o777;
      expect(mode).toBe(0o600);
    }
    const raw = JSON.parse(await readFile(filePath, "utf8")) as { version: number };
    expect(raw.version).toBe(1);
  });

  it("treats a corrupt store file as empty instead of failing", async () => {
    await writeFile(join(dir, "corrupt.json"), "not json at all", { mode: 0o600 });
    const store = new FileRelayDeviceCredentialStore(join(dir, "corrupt.json"));
    expect(await store.load()).toEqual([]);
  });

  it("drops malformed entries while keeping valid ones", async () => {
    await writeFile(
      join(dir, "mixed.json"),
      JSON.stringify({
        version: 1,
        credentials: [
          { serverId: "srv_a", deviceId: "dev_1", deviceSecret: "s1" },
          { serverId: "srv_bad" },
          null,
        ],
      }),
      { mode: 0o600 },
    );
    const store = new FileRelayDeviceCredentialStore(join(dir, "mixed.json"));
    const loaded = await store.load();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.serverId).toBe("srv_a");
  });
});

describe("resolveRelayOfferDeviceAuth", () => {
  it("prefers a stored device secret over the offer's pairing token", () => {
    const offer = buildOffer({
      authBootstrap: {
        version: 1,
        pairingToken: "token_value_1234567890",
        expiresAtMs: Date.now() + 60_000,
      },
    });
    const auth = resolveRelayOfferDeviceAuth(offer, {
      serverId: "srv_test",
      deviceId: "dev_stored",
      deviceSecret: "secret_stored",
      daemonPublicKeyB64: "daemon-pub-key",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    expect(auth).toEqual({
      version: 1,
      serverId: "srv_test",
      deviceId: "dev_stored",
      deviceSecret: "secret_stored",
    });
  });

  it("falls back to first-time pairing with a fresh device id", () => {
    const offer = buildOffer({
      authBootstrap: {
        version: 1,
        pairingToken: "token_value_1234567890",
        expiresAtMs: Date.now() + 60_000,
      },
    });
    const auth = resolveRelayOfferDeviceAuth(offer, null);
    expect(auth?.pairingToken).toBe("token_value_1234567890");
    expect(auth?.deviceSecret).toBeUndefined();
    expect(auth?.deviceId).toMatch(/^dev_/);
    expect(auth?.serverId).toBe("srv_test");
  });

  it("returns null for a legacy offer without bootstrap or stored credential", () => {
    expect(resolveRelayOfferDeviceAuth(buildOffer(), null)).toBeNull();
  });
});
