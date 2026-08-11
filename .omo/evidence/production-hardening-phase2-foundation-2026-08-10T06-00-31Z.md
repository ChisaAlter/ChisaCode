# Phase 2 Relay Auth Foundation Evidence (non-UI)

- recordedAt: 2026-08-10T06-00-31Z
- branch: codex/production-hardening-2026-08-10
- head: e9534e8df762bd95eead83e5562346c13b38b7a3

## Delivered

- docs/security/relay-auth-handshake-v2-threat-model.md
- protocol relay-device-auth schemas + connection-offer.authBootstrap optional field
- package export ./relay-device-auth
- server RelayDeviceCredentialStore (hashed secrets, one-time pairing tokens, revoke)
- server HMAC proof helpers + tests
- mandatory legacy decision documented in threat model (accept v1.0.x offer-only with old security level; force-new opt-in)

## Tests

- protocol relay-device-auth + connection-offer + package-exports + server relay-device-auth: 60 passed
- lint 0 on new modules

## Explicitly NOT done in this checkpoint

- Wire auth into encrypted-channel / websocket hello / relay-transport
- Session reuse re-auth against externalSessionsByKey
- Client host credential persistence
- App UI / prototypes (blocked on HTML prototype approval per plan)
- SECURITY.md absolute-claim rewrites (scheduled with Phase 6, partial overlap)

## Residual risk

- Foundation alone does not close the offer-as-bearer attack; transport integration remains required before Phase 2 can be marked fully complete.
