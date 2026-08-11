# Model Gateway real-surface streaming verification

- Date: 2026-08-10 (Asia/Shanghai)
- Workspace: `C:\Ai\ChisaCode`
- Base revision: `e9534e8df`
- Surface: a real `createChisaCodeDaemon` instance bound to local TCP, called outside Vitest, with a separate gated HTTP/SSE upstream
- Historical command: `npx vite-node .omo/evidence/model-gateway-stream-real-verify.ts` (the one-off harness was removed after capture)
- Reproducible automated equivalent: `npx vitest run packages/server/src/server/bootstrap-model-gateway.test.ts --bail=1`

## Result

```json
{
  "status": "PASS",
  "convertedStatus": 200,
  "convertedContentType": "text/event-stream",
  "upstreamFirstChunkToDownstreamMs": 9,
  "requestStartToDownstreamChunkMs": 36,
  "downstreamArrivedBeforeUpstreamFinish": true,
  "clientDestroyToUpstreamCloseMs": 7,
  "upstreamClosedBeforeRelease": true
}
```

## Scenarios

1. Sent `stream: true` to the Anthropic-format gateway route while a chat-completions upstream wrote one SSE delta and stayed open. The converted downstream text delta arrived 9 ms after the upstream first chunk and before the upstream finish gate was released.
2. Sent a second streaming request through a raw Node HTTP client, waited for downstream body data, and destroyed the underlying client request. The upstream response socket closed 7 ms later while its finish gate was still held.

This verifies the daemon HTTP surface, not only the in-process response converter. Synthetic/MoA generation remains non-incremental; its cancellation propagation is covered by the targeted unit test rather than claimed as streaming generation.
