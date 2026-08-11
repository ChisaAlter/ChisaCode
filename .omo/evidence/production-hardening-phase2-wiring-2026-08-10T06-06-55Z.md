# Phase 2 Relay Auth Wiring Evidence

- recordedAt: 2026-08-10T06-06-55Z
- branch: codex/production-hardening-2026-08-10

## Landed

- offer.authBootstrap issued by pairing-offer + bootstrap
- hello.relayDeviceAuth optional schema field (append-only)
- websocket authorizeRelayHello: legacy accept by default; require via CHISACODE_RELAY_REQUIRE_DEVICE_AUTH=1
- relay-transport passes chisacodeHome/serverId/requireDeviceAuth into ExternalSocketMetadata
- device credential store + HMAC helpers
- threat model doc

## Tests

- relay-device-auth + connection-offer + websocket-server.relay-reconnect: 28+ passed
- lint 0 on modified modules

## Still incomplete for full G004

- client host secret persistence + hello proof generation
- strict HMAC verify of device secret on every reconnect
- session resume bound to authenticatedDeviceId (not only clientId)
- HTML prototype + App UI
- SECURITY.md claim rewrites (phase 6 overlap)
