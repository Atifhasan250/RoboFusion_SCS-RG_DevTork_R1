import "dotenv/config";
import { createServer } from "node:http";
import next from "next";
import { WebSocket, WebSocketServer } from "ws";
import { realtime } from "./src/server/realtime/hub";
import { collections } from "./src/server/db/collections";
import { markOfflineZones } from "./src/server/services/offline-service";
import { recoverSystemState } from "./src/server/services/recovery-service";
import { id } from "./src/server/utils/id";
import { priorityQueue } from "./src/server/services/incident-service";

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handler = app.getRequestHandler();

async function sendSnapshot(socket: WebSocket) {
  const c = await collections();
  const [zones, incidents, queue] = await Promise.all([
    c.zones.find({ configured: true }, { projection: { _id: 0, apiKeyHash: 0 } }).sort({ code: 1 }).toArray(),
    c.incidents.find({ active: true }, { projection: { _id: 0 } }).toArray(),
    priorityQueue(),
  ]);
  socket.send(JSON.stringify({
    event_id: id(),
    event_type: "SNAPSHOT",
    occurred_at: new Date().toISOString(),
    data: {
      zones,
      incidents,
      priority_queue: queue,
      server_time: new Date().toISOString(),
    },
    version: 0,
  }));
}

async function main() {
  await app.prepare();
  await recoverSystemState();

  // Mark offline zones every 5s
  setInterval(() => {
    markOfflineZones().catch(error => console.error("offline-check-failed", error));
  }, 5_000).unref();

  const server = createServer(handler);
  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", async (socket) => {
    // Send full snapshot on connect
    await sendSnapshot(socket);

    // Forward all realtime events with standardised envelope
    const unsubscribe = realtime.subscribe((event, payload) => {
      if (socket.readyState !== WebSocket.OPEN) return;
      // payload should already be a proper event envelope from services
      socket.send(JSON.stringify(payload));
    });

    socket.on("close", unsubscribe);
    socket.on("error", (err) => {
      console.error("ws-client-error", err.message);
      unsubscribe();
    });
  });

  // Auth guard on WS upgrade
  server.on("upgrade", async (request, socket, head) => {
    console.log("UPGRADE REQUEST:", request.url);
    if (!request.url?.startsWith("/ws")) {
      const upgradeHandler = app.getUpgradeHandler();
      return upgradeHandler(request, socket, head);
    }

    try {
      console.log("WS auth check...");
      const cookieHeader = request.headers.cookie ?? "";
      const sessionId = /(?:^|; )scs_session=([^;]+)/.exec(cookieHeader)?.[1];

      const c = await collections();
      const session = sessionId
        ? await c.sessions.findOne({ id: sessionId, expiresAt: { $gt: new Date() } })
        : null;
      const user = session
        ? await c.users.findOne({ id: session.userId, active: true })
        : null;

      if (!user) {
        console.log("WS Auth failed, no user found for sessionId:", sessionId);
        socket.write("HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\n\r\n");
        socket.destroy();
        return;
      }

      console.log("WS Auth success for:", user.email);
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    } catch (err) {
      console.error("ws-upgrade-error", err);
      socket.destroy();
    }
  });

  server.listen(Number(process.env.PORT ?? 3000), () => {
    console.log(`SCS-RG server listening on port ${process.env.PORT ?? 3000}`);
  });
}

main().catch(error => {
  console.error("Fatal startup error:", error);
  process.exit(1);
});
