import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/src/server/auth/session";
import { collections } from "@/src/server/db/collections";

export const runtime = "nodejs";

/** GET /api/v1/admin/system-health — System health for Admin users */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_: NextRequest) {
  try {
    await requireUser(["ADMIN"]);
    const c = await collections();

    const [zones, incidents, recentReadings] = await Promise.all([
      c.zones.find({ configured: true }, { projection: { _id: 0, apiKeyHash: 0 } }).toArray(),
      c.incidents.find({ active: true }, { projection: { _id: 0 } }).toArray(),
      c.readings.countDocuments({ receivedAt: { $gte: new Date(Date.now() - 60_000) } }),
    ]);

    const criticalZones = zones.filter(z => z.state === "CRITICAL");
    const offlineZones = zones.filter(z => z.connectivityState === "OFFLINE");
    const overrides = await c.manual_overrides.find({ active: true }, { projection: { _id: 0 } }).toArray();

    return NextResponse.json({
      checked_at: new Date().toISOString(),
      zones: {
        total: zones.length,
        critical: criticalZones.length,
        warning: zones.filter(z => z.state === "WARNING").length,
        safe: zones.filter(z => z.state === "SAFE").length,
        offline: offlineZones.length,
        critical_zones: criticalZones.map(z => ({ code: z.code, name: z.name, risk_score: z.riskScore })),
        offline_zones: offlineZones.map(z => ({ code: z.code, name: z.name, last_seen: z.lastReadingAt })),
      },
      incidents: {
        open: incidents.filter(i => i.status === "OPEN").length,
        acknowledged: incidents.filter(i => i.status === "ACKNOWLEDGED").length,
      },
      readings_last_minute: recentReadings,
      active_overrides: overrides.length,
      overrides,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof AuthError ? e.code : "ERROR" },
      { status: e instanceof AuthError ? e.status : 500 }
    );
  }
}
