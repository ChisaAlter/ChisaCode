# First-send startup real daemon verification (2026-08-09)

## Command

```bash
npx tsx packages/server/scripts/verify-first-send-startup.ts
```

Script: `packages/server/scripts/verify-first-send-startup.ts`  
Logger: pino `level: "trace"` (equivalent to `CHISACODE_LOG_LEVEL=trace` for the in-process daemon harness)

## Environment

- Isolated in-process daemon via `createChisaCodeDaemon` (`listen: 127.0.0.1:0`)
- Real codex provider clients (`agentClients: {}`, no fakes)
- Host codex CLI: `codex-cli 0.146.0`
- Does **not** touch the main daemon on port 6767

## Assertions

1. `send_agent_message` returns `accepted` with `pendingRun: true` before `provider.codex.spawn`
2. No listModels-style throwaway spawn after send (`provider.codex.spawn` without `agentId`)

## Result (PASS)

```json
{
  "pendingRun": true,
  "sendStartedAt": 6068.7832,
  "sendAcceptedAt": 6072.8624,
  "firstAcceptedAt": 6072.880499999999,
  "firstSpawnAfterSendAt": 6318.9046,
  "acceptedBeforeSpawn": true,
  "listModelsSpawnAfterSendCount": 0,
  "spawnAfterSendCount": 1,
  "spawnMessagesAfterSend": [
    {
      "t": 6319,
      "agentId": "f98563f7-f3a6-4c53-8ed4-9f494671da53",
      "goalsEnabled": true
    }
  ]
}
```

Interpretation:

- Acceptance took ~4ms after send start
- Codex app-server spawn happened ~246ms after acceptance
- The post-send spawn carried the agent id (session connect path), not a listModels throwaway
- `pendingRun: true` confirms non-blocking send response semantics

## Not covered by this run

- Web Playwright specs for composer busy / create handoff UI
- Packaged Electron surface verification

Those remain explicit open gates for UI slices in the plan.
