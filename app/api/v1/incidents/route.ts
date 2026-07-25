import { NextResponse } from "next/server";
import { requireUser, AuthError } from "@/src/server/auth/session";
import { collections } from "@/src/server/db/collections";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    await requireUser();
    const c = await collections();

    const url = new URL(req.url);
    const status = url.searchParams.get("status") || "active";
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const zoneId = url.searchParams.get("zoneId");
    
    const filter: any = {};
    
    if (status === "active") filter.active = true;
    else if (status === "resolved") filter.status = "RESOLVED";
    else if (status === "OPEN" || status === "ACKNOWLEDGED" || status === "RESOLVED") filter.status = status;

    if (zoneId) filter.zoneId = zoneId;

    if (from || to) {
      filter.startedAt = {};
      if (from) filter.startedAt.$gte = new Date(from);
      if (to) filter.startedAt.$lte = new Date(to);
    }

    const incidents = await c.incidents
      .find(filter, {
        projection: { _id: 0 },
        sort: { startedAt: -1 },
        limit: 200,
      })
      .toArray();

    return NextResponse.json({ incidents, count: incidents.length });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof AuthError ? e.code : "ERROR" },
      { status: e instanceof AuthError ? e.status : 500 }
    );
  }
}
