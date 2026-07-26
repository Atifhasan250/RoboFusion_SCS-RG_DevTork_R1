import { realtime } from "@/src/server/realtime/hub";
import { requireUser, AuthError } from "@/src/server/auth/session";
import { dashboardSnapshot } from "@/src/server/services/dashboard-service";
import { id } from "@/src/server/utils/id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUser();
    const snapshot = await dashboardSnapshot();
    const encoder = new TextEncoder();
    let unsubscribe: (() => void) | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    const initial = {
      event_id: id(),
      event_type: "SNAPSHOT",
      occurred_at: snapshot.snapshot_at,
      data: snapshot,
      version: 0,
    };

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`event: SNAPSHOT\ndata: ${JSON.stringify(initial)}\n\n`));
        unsubscribe = realtime.subscribe((event, payload) => {
          try {
            controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));
          } catch {
            // Browser disconnected between callback scheduling and enqueue.
          }
        });
        timer = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(": keepalive\n\n"));
          } catch {
            // Browser already disconnected.
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
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof AuthError ? error.code : "ERROR" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}
