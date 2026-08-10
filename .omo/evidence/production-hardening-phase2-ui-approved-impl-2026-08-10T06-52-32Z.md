# G004 prototype approval + App UI evidence

- recordedAt: 2026-08-10T06-52-32Z
- userDecision: approve prototype and begin App UI
- prototype: prototypes/relay-device-auth-pairing.html
- app UI updates:
  - pair-device-section: security chip, clear local credentials, always-visible actions
  - pair-link-modal: map device-auth failures to upgrade/re-pair copy
  - host-runtime: clearRelayDeviceCredentials mutation
  - i18n zh/en strings for security/clear/re-pair
- lint: pair UI files
- residual: full visual pixel QA vs prototype on real Electron/mobile still unverified; no device-list revoke daemon RPC UI yet (store/API side exists, settings list UI partial via clear credentials)
