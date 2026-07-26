import { realtime } from "@/src/server/realtime/hub";
import { requireUser, AuthError } from "@/src/server/auth/session";
import { collections } from "@/src/server/db/collections";
import { priorityQueue } from "@/src/server/services/incident-service";
import { id } from "@/src/server/utils/id";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireUser();
    const c = await collections();
    const [zones, incidents, queue] = await Promise.all([
      c.zones.find({ configured: true }, { projection: { _id: 0, apiKeyHash: 0 } }).sort({ code: 1 }).toArray(),
      c.incidents.find({ active: true }, { projection: { _id: 0 } }).sort({ startedAt: -1 }).toArray(),
      priorityQueue(),
    ]);
    const encoder = new TextEncoder();
    let unsubscribe: (() => void) | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    const initial = {
      event_id: id(),
      event_type: "SNAPSHOT",
      occurred_at: new Date().toISOString(),
      data: { zones, incidents, priority_queue: queue },
      version: 0,
    };

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`event: SNAPSHOT\ndata: ${JSON.stringify(initial)}\n\n`));
        unsubscribe = realtime.subscribe((event, payload) => {
          try {
            controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));
          } catch {
            // Client has already disconnected.
          }
        });
        timer = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(": keepalive\n\n"));
          } catch {
            // Client has already disconnected.
          }
        }, 15_000);
      },
      cancel() {
        unsubscribe?.();
        if (timer) clearInterval(timer);
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof AuthError ? error.code : "ERROR" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}
