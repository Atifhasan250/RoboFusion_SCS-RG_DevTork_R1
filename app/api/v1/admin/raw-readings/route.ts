import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/src/server/auth/session";
import { collections } from "@/src/server/db/collections";
import { id } from "@/src/server/utils/id";

export const runtime = "nodejs";

/**
 * GET /api/v1/admin/raw-readings
 * Returns recent raw sensor readings. Admin-only.
 * Supports ?zone=CODE&limit=N&from=ISO&to=ISO
 */
export async function GET(request: NextRequest) {
  try {
    await requireUser(["ADMIN"]);
    const c = await collections();
    const p = request.nextUrl.searchParams;

    const q: Record<string, unknown> = {};

    if (p.get("zone")) {
      const zone = await c.zones.findOne({ code: p.get("zone")! });
      if (!zone) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
      q.zoneId = zone.id;
    }

    if (p.get("from") || p.get("to")) {
      q.observedAt = {
        ...(p.get("from") ? { $gte: new Date(p.get("from")!) } : {}),
        ...(p.get("to") ? { $lte: new Date(p.get("to")!) } : {}),
      };
    }

    const limit = Math.min(parseInt(p.get("limit") ?? "100", 10), 500);
    const readings = await c.readings
      .find(q, { projection: { _id: 0 } })
      .sort({ observedAt: -1 })
      .limit(limit)
      .toArray();

    return NextResponse.json({ readings, count: readings.length, limit });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof AuthError ? e.code : "ERROR" },
      { status: e instanceof AuthError ? e.status : 500 }
    );
  }
}
