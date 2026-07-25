import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/src/server/auth/session";
import { incidentTimeline } from "@/src/server/services/incident-service";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ incidentId: string }> }
) {
  try {
    await requireUser();
    const { incidentId } = await ctx.params;
    const result = await incidentTimeline(incidentId);
    if (!result) {
      return NextResponse.json({ error: "NOT_FOUND", message: "Incident not found" }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof AuthError ? e.code : "ERROR" },
      { status: e instanceof AuthError ? e.status : 500 }
    );
  }
}
