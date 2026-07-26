import { NextResponse } from "next/server";
import { requireUser, AuthError } from "@/src/server/auth/session";
import { collections } from "@/src/server/db/collections";

export const runtime = "nodejs";

function parseDate(value: string | null, field: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw Object.assign(new Error(`${field} must be a valid ISO date`), { httpStatus: 422, code: "INVALID_DATE" });
  }
  return date;
}

export async function GET(req: Request) {
  try {
    await requireUser();
    const c = await collections();
    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? "active";
    const from = parseDate(url.searchParams.get("from"), "from");
    const to = parseDate(url.searchParams.get("to"), "to");
    const zoneId = url.searchParams.get("zoneId");
    const zoneCode = url.searchParams.get("zoneCode");
    const hazard = url.searchParams.get("hazard");

    if (from && to && from > to) {
      throw Object.assign(new Error("from must be before or equal to to"), { httpStatus: 422, code: "INVALID_DATE_RANGE" });
    }

    const filter: Record<string, unknown> = {};
    if (status === "active") filter.active = true;
    else if (status === "resolved") filter.status = "RESOLVED";
    else if (["OPEN", "ACKNOWLEDGED", "RESOLVED"].includes(status)) filter.status = status;
    else if (status !== "all") {
      throw Object.assign(new Error("Unsupported incident status filter"), { httpStatus: 422, code: "INVALID_STATUS" });
    }

    if (zoneId) filter.zoneId = zoneId;
    if (zoneCode) {
      const zone = await c.zones.findOne({ code: zoneCode });
      if (!zone) return NextResponse.json({ error: "NOT_FOUND", message: "Zone not found" }, { status: 404 });
      filter.zoneId = zone.id;
    }
    if (hazard) {
      if (!["FIRE", "GAS", "FLOOD", "OCCUPANCY", "NONE"].includes(hazard)) {
        throw Object.assign(new Error("Invalid hazard filter"), { httpStatus: 422, code: "INVALID_HAZARD" });
      }
      filter.primaryHazard = hazard;
    }
    if (from || to) {
      filter.startedAt = {
        ...(from ? { $gte: from } : {}),
        ...(to ? { $lte: to } : {}),
      };
    }

    const incidents = await c.incidents
      .find(filter, { projection: { _id: 0 } })
      .sort({ startedAt: -1 })
      .limit(200)
      .toArray();

    return NextResponse.json({ incidents, count: incidents.length });
  } catch (error) {
    const status = error instanceof AuthError ? error.status : (error as { httpStatus?: number }).httpStatus ?? 500;
    const code = error instanceof AuthError ? error.code : (error as { code?: string }).code ?? "ERROR";
    return NextResponse.json(
      { error: code, message: error instanceof Error ? error.message : undefined },
      { status },
    );
  }
}
