# phase4b-terminal-reconnect evidence

- recordedAt: 2026-08-10T06-13-02Z
- branch: codex/production-hardening-2026-08-10
- TerminalClient streamSubscriptionIntents + resubscribeStreams on reconnect
- clearStreamSlots keeps intents; unsubscribe/exit clear intents
- targeted tests: daemon-client-binary-frames 55 + terminal-stream-router + lanes 62 passed; lint 0
