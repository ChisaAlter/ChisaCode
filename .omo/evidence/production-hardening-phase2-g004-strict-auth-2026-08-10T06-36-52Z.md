# G004 remaining: strict relay device auth

- recordedAt: 2026-08-10T06-36-52Z
- worktree: C:/Ai/ChisaCode-worktrees/production-hardening-2026-08-10
- branch: codex/production-hardening-2026-08-10

## Implemented

- Server RelayDeviceCredentialStore now stores private local secret for HMAC verify + challenge replay protection
- authorizeRelayHello: pairing token issues preferred deviceId + returns deviceSecret via relay_device_auth_result
- authorizeRelayHello: subsequent connects verify HMAC proof (strict when requireDeviceAuth or proof present)
- Session resume binds/checks authenticatedDeviceId (clientId alone insufficient after bind)
- Protocol outbound WSRelayDeviceAuthResultMessageSchema
- Client DaemonClientConfig.relayDeviceAuth + onRelayDeviceAuthResult; hello includes auth material
- Client RelayDeviceCredentialClient helper + Memory store + tests
- App HostRuntime: pending pairing tokens, hello proof/pairing auth, persist deviceId/deviceSecret on host connection

## Tests

- npx vitest run relay-device-auth + relay-device-credentials + websocket-server.relay-reconnect + protocol tests => 36 passed
- lint 0 on modified modules

## Residual for full Phase 2 product completeness

- HTML prototype + App UI for re-pair/revoke flows still required by plan before UI work
- Real-surface Electron/mobile pairing QA still unverified
- Optional: expose ephemeral client E2EE public key into transcript instead of stand-in field
