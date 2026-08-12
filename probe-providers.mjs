import { DaemonClient } from "./packages/client/dist/daemon-client.js";
import WebSocket from "ws";
const client = new DaemonClient({
  url: "ws://127.0.0.1:6767/ws",
  clientId: "probe-providers-" + Math.random().toString(36).slice(2),
  clientType: "cli",
  appVersion: "1.0.2",
  webSocketFactory: (url, options) => new WebSocket(url, options?.protocols, { headers: options?.headers }),
});
await client.connect();
try {
  const snapshot = await client.getProvidersSnapshot({ cwd: "C:/Users/48818/AppData/Local/Temp/sidebar-single-row-4Xw53Y" });
  const providers = snapshot.providers ?? snapshot;
  console.log("snapshot keys:", Object.keys(providers).slice(0, 20));
  if (Array.isArray(providers)) {
    console.log("provider count:", providers.length, providers.map(p => p.id ?? p.provider));
  } else {
    console.log(JSON.stringify(providers).slice(0, 800));
  }
} catch (e) {
  console.log("ERROR:", String(e).slice(0, 300));
}
await client.close();
