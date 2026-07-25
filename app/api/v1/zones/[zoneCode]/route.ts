import { NextResponse } from "next/server";
import { requireUser, AuthError } from "@/src/server/auth/session";
import { collections } from "@/src/server/db/collections";

export async function GET(_: Request, ctx: { params: Promise<{ zoneCode: string }> }) {
  try {
    const user = await requireUser();
    const { zoneCode } = await ctx.params;
    const c = await collections();
    const zone = await c.zones.findOne({ code: zoneCode }, { projection: { _id: 0, apiKeyHash: 0 } });
    if (!zone) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    const readings = user.role === "ADMIN" ? await c.readings.find({ zoneId: zone.id }, { projection: { _id: 0 } }).sort({ observedAt: -1 }).limit(50).toArray() : [];
    return NextResponse.json({ zone, readings });
  } catch (e) {
    return NextResponse.json({ error: e instanceof AuthError ? e.code : "ERROR" }, { status: e instanceof AuthError ? e.status : 500 });
  }
}

export async function DELETE(_: Request, ctx: { params: Promise<{ zoneCode: string }> }) {
  try {
    const user = await requireUser();
    if (user.role !== "ADMIN") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const { zoneCode } = await ctx.params;
    const c = await collections();
    
    const zone = await c.zones.findOne({ code: zoneCode });
    if (!zone) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

    // Referential integrity checks
    const activeIncident = await c.incidents.findOne({ zoneId: zone.id, active: true });
    if (activeIncident) {
      return NextResponse.json({ error: "CANNOT_DELETE_ACTIVE_INCIDENT", message: "Zone has active incidents" }, { status: 409 });
    }
    const readingsCount = await c.readings.countDocuments({ zoneId: zone.id });
    if (readingsCount > 0) {
      return NextResponse.json({ error: "CANNOT_DELETE_HAS_READINGS", message: "Zone has historical readings" }, { status: 409 });
    }

    await c.zones.deleteOne({ id: zone.id });
    await c.zone_states.deleteOne({ zoneId: zone.id });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof AuthError ? e.code : "ERROR" }, { status: e instanceof AuthError ? e.status : 500 });
  }
}
