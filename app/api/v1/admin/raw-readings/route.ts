import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/src/server/auth/session";
import { collections } from "@/src/server/db/collections";

export const runtime = "nodejs";

function dateParam(value: string | null, field: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw Object.assign(new Error(`${field} must be a valid ISO date`), { httpStatus: 422, code: "INVALID_DATE" });
  return date;
}

/** GET /api/v1/admin/raw-readings?zone=CODE&limit=N&from=ISO&to=ISO */
export async function GET(request: NextRequest) {
  try {
    await requireUser(["ADMIN"]);
    const c = await collections();
    const params = request.nextUrl.searchParams;
    const filter: Record<string, unknown> = {};

    const zoneCode = params.get("zone");
    if (zoneCode) {
      const zone = await c.zones.findOne({ code: zoneCode });
      if (!zone) return NextResponse.json({ error: "NOT_FOUND", message: "Zone not found" }, { status: 404 });
      filter.zoneId = zone.id;
    }

    const from = dateParam(params.get("from"), "from");
    const to = dateParam(params.get("to"), "to");
    if (from && to && from > to) throw Object.assign(new Error("from must be before or equal to to"), { httpStatus: 422, code: "INVALID_DATE_RANGE" });
    if (from || to) filter.observedAt = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };

    const parsedLimit = Number.parseInt(params.get("limit") ?? "100", 10);
    if (!Number.isFinite(parsedLimit) || parsedLimit < 1) {
      throw Object.assign(new Error("limit must be a positive integer"), { httpStatus: 422, code: "INVALID_LIMIT" });
    }
    const limit = Math.min(parsedLimit, 500);
    const readings = await c.readings
      .find(filter, { projection: { _id: 0 } })
      .sort({ observedAt: -1 })
      .limit(limit)
      .toArray();

    return NextResponse.json({ readings, count: readings.length, limit });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof AuthError ? error.code : (error as { code?: string }).code ?? "ERROR",
        message: error instanceof Error ? error.message : undefined,
      },
      { status: error instanceof AuthError ? error.status : (error as { httpStatus?: number }).httpStatus ?? 500 },
    );
  }
}
