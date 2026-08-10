# phase4a-file-transfer evidence

- recordedAt: 2026-08-10T06-13-02Z
- branch: codex/production-hardening-2026-08-10
- server chunk 1MB FileChunk loop + stats.size guard
- client binary timeout 15m; idle timer 60s per begin/chunk
- restart/shutdown 10s untouched
- targeted tests: daemon-client-binary-frames 55 + terminal-stream-router + lanes 62 passed; lint 0
