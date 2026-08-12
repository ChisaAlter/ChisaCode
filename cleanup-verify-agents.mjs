import { DaemonClient } from "./packages/client/dist/daemon-client.js";
import WebSocket from "ws";
const client = new DaemonClient({
  url: "ws://127.0.0.1:6767/ws",
  clientId: "verify-cleanup-" + Math.random().toString(36).slice(2),
  clientType: "cli",
  appVersion: "1.0.2",
  webSocketFactory: (url, options) => new WebSocket(url, options?.protocols, { headers: options?.headers }),
});
await client.connect();
try {
  const { entries } = await client.fetchAgents();
  const targets = ["72840d74-f87b-4a76-be08-dc3002489402", "3be7e1d0-4f6e-43d0-aaab-6e75d2171cce"];
  for (const id of targets) {
    const exists = entries.some(e => e.agent.id === id);
    if (!exists) { console.log("absent (already cleaned):", id); continue; }
    await client.deleteAgent(id);
    console.log("deleted:", id);
  }
  const remaining = (await client.fetchAgents()).entries.map(e => e.agent.id);
  console.log("remaining agents:", remaining.length);
} catch (e) {
  console.log("ERROR:", String(e).slice(0, 200));
}
await client.close();
