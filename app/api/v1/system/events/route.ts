import { realtime } from "@/src/server/realtime/hub";
import { requireUser, AuthError } from "@/src/server/auth/session";
export const runtime = "nodejs";
export async function GET() { 
  try { 
    await requireUser(); 
    const encoder = new TextEncoder(); 
    let unsubscribe: () => void;
    let timer: NodeJS.Timeout;
    const stream = new ReadableStream({ 
      start(controller) { 
        controller.enqueue(encoder.encode(`event: snapshot\ndata: ${JSON.stringify({ connectedAt: new Date().toISOString() })}\n\n`)); 
        unsubscribe = realtime.subscribe((event, payload) => {
          try {
            controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));
          } catch (e) {
            // connection already closed
          }
        }); 
        timer = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(`: keepalive\n\n`));
          } catch (e) {
            // connection already closed
          }
        }, 15_000); 
      },
      cancel() {
        if (unsubscribe) unsubscribe();
        if (timer) clearInterval(timer);
      }
    }); 
    return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } }); 
  } catch (e) { 
    return Response.json({ error: e instanceof AuthError ? e.code : "ERROR" }, { status: e instanceof AuthError ? e.status : 500 }); 
  } 
}
