import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import {
  RELAY_DEVICE_AUTH_VERSION,
  buildRelayDeviceAuthTranscript,
  computeRelayDeviceAuthProof,
  createRelayAuthChallenge,
  verifyRelayDeviceAuthProof,
} from "./relay-device-auth.js";
import { RelayDeviceCredentialStore } from "./relay-device-credential-store.js";

describe("relay device auth crypto", () => {
  test("builds stable transcript and verifies matching proofs", () => {
    const fields = {
      serverId: "srv_test",
      daemonPublicKeyB64: "daemon-pub",
      clientPublicKeyB64: "client-pub",
      deviceId: "dev_abc",
      challenge: "challenge-1",
    };
    const transcriptA = buildRelayDeviceAuthTranscript({
      version: RELAY_DEVICE_AUTH_VERSION,
      ...fields,
    });
    const transcriptB = buildRelayDeviceAuthTranscript({
      version: RELAY_DEVICE_AUTH_VERSION,
      ...fields,
    });
    expect(transcriptA).toBe(transcriptB);

    const secret = "device-secret-value";
    const proof = computeRelayDeviceAuthProof(secret, fields);
    const proof2 = computeRelayDeviceAuthProof(secret, fields);
    expect(verifyRelayDeviceAuthProof(proof, proof2)).toBe(true);
    expect(
      verifyRelayDeviceAuthProof(proof, computeRelayDeviceAuthProof("other-secret", fields)),
    ).toBe(false);
  });

  test("createRelayAuthChallenge returns high-entropy unique values", () => {
    const a = createRelayAuthChallenge();
    const b = createRelayAuthChallenge();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(20);
  });
});

describe("RelayDeviceCredentialStore", () => {
  const cleanup: string[] = [];

  afterEach(() => {
    for (const dir of cleanup.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("issues pairing token, consumes once, rejects replay", () => {
    const home = mkdtempSync(join(tmpdir(), "relay-dev-store-"));
    cleanup.push(home);
    const store = new RelayDeviceCredentialStore(home);
    const { token } = store.issuePairingToken(60_000);
    expect(store.consumePairingToken(token)).toBe(true);
    expect(store.consumePairingToken(token)).toBe(false);
  });

  test("issues device with preferred id and verifies secret/proof", () => {
    const home = mkdtempSync(join(tmpdir(), "relay-dev-store-"));
    cleanup.push(home);
    const store = new RelayDeviceCredentialStore(home);
    const { deviceId, deviceSecret } = store.issueDevice("phone", "dev_preferred_1");
    expect(deviceId).toBe("dev_preferred_1");
    expect(store.verifyDeviceSecret(deviceId, deviceSecret)).toBe(true);
    expect(store.verifyDeviceSecret(deviceId, "wrong")).toBe(false);

    const challenge = createRelayAuthChallenge();
    const proof = computeRelayDeviceAuthProof(deviceSecret, {
      serverId: "srv_1",
      daemonPublicKeyB64: "daemon-pub",
      clientPublicKeyB64: "client-pub",
      deviceId,
      challenge,
    });
    expect(
      store.verifyDeviceProof({
        deviceId,
        proof,
        challenge,
        serverId: "srv_1",
        daemonPublicKeyB64: "daemon-pub",
        clientPublicKeyB64: "client-pub",
      }),
    ).toBe(true);
    // challenge replay rejected
    expect(
      store.verifyDeviceProof({
        deviceId,
        proof,
        challenge,
        serverId: "srv_1",
        daemonPublicKeyB64: "daemon-pub",
        clientPublicKeyB64: "client-pub",
      }),
    ).toBe(false);

    expect(store.revokeDevice(deviceId)).toBe(true);
    expect(store.verifyDeviceSecret(deviceId, deviceSecret)).toBe(false);
  });

  test("rejects expired pairing token", () => {
    const home = mkdtempSync(join(tmpdir(), "relay-dev-store-"));
    cleanup.push(home);
    const store = new RelayDeviceCredentialStore(home);
    const { token } = store.issuePairingToken(-1);
    expect(store.consumePairingToken(token)).toBe(false);
  });
});
