# Relay Auth Handshake v2 — Threat Model & ADR

- Status: accepted (non-UI foundation)
- Date: 2026-08-10
- Plan: `.omc/plans/chisacode-production-hardening-plan.md` Phase 2
- Branch: `codex/production-hardening-2026-08-10`

## Problem

The current relay E2EE path authenticates **encryption**, not **client identity**:

- Possession of a connection offer (daemon public key + `serverId` + relay endpoint) is sufficient to complete ECDH and send daemon session messages.
- Session resume keys on a client-chosen `clientId`.
- `handleDaemonRehello` only protects re-key on an already-open socket; a fresh connect from an offer-holder is accepted.

Released clients `v1.0.0`–`v1.0.2` (including `android-v1.0.2` / `desktop-windows-v1.0.2`) speak this offer-only protocol.

## Trust boundaries

| Actor                   | Trust assumption                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| Local daemon            | Trusted; holds device credential store under `$CHISACODE_HOME`                                               |
| Local client host store | Trusted for its own device secret; cleared on host removal / revoke                                          |
| Relay                   | Untrusted for confidentiality of payload; may observe metadata, delay/drop/reorder frames, terminate sockets |
| Offer holder (QR/link)  | Treated as bearer credential until first successful pairing consumes bootstrap token                         |

## Relay-visible metadata (must be documented, not ignored)

Even with E2EE payload confidentiality, the relay can observe:

- stable `serverId` (routing key)
- connection open/close times and duration
- message sizes and frequencies
- `connectionId` correlation across reconnects within a session
- plaintext handshake frames (`e2ee_hello` / `e2ee_ready` / auth frames)

Relay-auth Ed25519 authenticates **daemon → relay**, not **client → daemon**. It is not a substitute for client identity.

## Selected design (ADR-2 refined)

1. **Offer append-only**: optional `authBootstrap` block (`version`, short-lived one-time pairing token). Old parsers strip unknown fields.
2. **Pairing**: new device presents bootstrap token over the encrypted channel; daemon issues a random per-device secret (never logged).
3. **Subsequent connects**: daemon challenge → client HMAC proof over canonical transcript (handshake version, `serverId`, daemon pubkey, client ephemeral pubkey, device id, challenge). Timing-safe compare before any session handler.
4. **Session reuse**: must re-prove device identity; bare `clientId` is insufficient.
5. **Transport gate**: auth requirement applies only when `transport === "relay"`. Direct/local hello remains network-reachability trust.
6. **Legacy**: mandatory temporary acceptance of offer-only clients with **old security level** UX/logging; no silent permanent default. Explicit COMPAT delete version required. Force-new-only is opt-in.

## Non-goals (this phase)

- UI redesign (requires HTML prototype approval first)
- Replacing Curve25519/XSalsa20-Poly1305
- Authenticating direct/local sockets
- Making the relay zero-knowledge for metadata

## Acceptance for non-UI foundation

- Threat model committed
- Protocol schema accepts optional auth bootstrap without breaking old parsers
- Device credential store persists create/last-used/revoked metadata; secrets never logged
- Crypto helpers for challenge/HMAC proof with unit tests
- Legacy path explicitly modeled (accept + mark legacy, or reject with upgrade reason when force-new enabled)
