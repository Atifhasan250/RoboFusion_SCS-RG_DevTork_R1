import "dotenv/config";
import { createServer } from "node:http";
import next from "next";
import { WebSocket, WebSocketServer } from "ws";
import { realtime } from "./src/server/realtime/hub";
import { collections } from "./src/server/db/collections";
import { markOfflineZones } from "./src/server/services/offline-service";
import { recoverSystemState } from "./src/server/services/recovery-service";
import { id } from "./src/server/utils/id";
import { dashboardSnapshot } from "./src/server/services/dashboard-service";

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handler = app.getRequestHandler();

async function sendSnapshot(socket: WebSocket) {
  const snapshot = await dashboardSnapshot();
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({
    event_id: id(),
    event_type: "SNAPSHOT",
    occurred_at: snapshot.snapshot_at,
    data: snapshot,
    version: 0,
  }));
}

async function main() {
  await app.prepare();
  await recoverSystemState();

  // Staleness is checked frequently, but OFFLINE_AFTER_MS defines the actual timeout.
  const offlineTimer = setInterval(() => {
    markOfflineZones().catch(error => console.error("offline-check-failed", error));
  }, 5_000);
  (offlineTimer as unknown as { unref?: () => void }).unref?.();

  const server = createServer(handler);
  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", async socket => {
    try {
      await sendSnapshot(socket);
    } catch (error) {
      console.error("ws-snapshot-failed", error);
      socket.close(1011, "Snapshot unavailable");
      return;
    }

    const unsubscribe = realtime.subscribe((_event, payload) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
    });

    socket.on("close", unsubscribe);
    socket.on("error", error => {
      console.error("ws-client-error", error.message);
      unsubscribe();
    });
  });

  server.on("upgrade", async (request, socket, head) => {
    if (!request.url?.startsWith("/ws")) {
      app.getUpgradeHandler()(request, socket, head);
      return;
    }

    try {
      const cookieHeader = request.headers.cookie ?? "";
      const sessionId = /(?:^|; )scs_session=([^;]+)/.exec(cookieHeader)?.[1];
      const c = await collections();
      const session = sessionId
        ? await c.sessions.findOne({ id: sessionId, expiresAt: { $gt: new Date() } })
        : null;
      const user = session ? await c.users.findOne({ id: session.userId, active: true }) : null;

      if (!user) {
        socket.write("HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\n\r\n");
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, ws => wss.emit("connection", ws, request));
    } catch (error) {
      console.error("ws-upgrade-error", error);
      socket.destroy();
    }
  });

  const port = Number(process.env.PORT ?? 3000);
  server.listen(port, () => console.log(`SCS-RG server listening on port ${port}`));
}

main().catch(error => {
  console.error("Fatal startup error:", error);
  process.exit(1);
});
