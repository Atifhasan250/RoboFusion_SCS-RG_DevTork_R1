import { NextResponse } from "next/server";
import { requireUser, AuthError } from "@/src/server/auth/session";
import { collections } from "@/src/server/db/collections";
import { priorityQueue } from "@/src/server/services/incident-service";

export const runtime = "nodejs";

/**
 * GET /api/v1/dashboard/snapshot
 * Returns a full authoritative snapshot: zones with risk details, open incidents,
 * priority queue, and system health summary.
 * Used on initial page load and after WebSocket reconnect.
 */
export async function GET() {
  try {
    await requireUser();
    const c = await collections();

    const [zones, incidents, queue, systemHealth] = await Promise.all([
      c.zones.find({ configured: true }, { projection: { _id: 0, apiKeyHash: 0 } }).sort({ code: 1 }).toArray(),
      c.incidents.find({ active: true }, { projection: { _id: 0 } }).sort({ startedAt: -1 }).toArray(),
      priorityQueue(),
      c.zones.aggregate([
        { $match: { configured: true } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            online: { $sum: { $cond: [{ $eq: ["$connectivityState", "ONLINE"] }, 1, 0] } },
            critical: { $sum: { $cond: [{ $eq: ["$state", "CRITICAL"] }, 1, 0] } },
            warning: { $sum: { $cond: [{ $eq: ["$state", "WARNING"] }, 1, 0] } },
            safe: { $sum: { $cond: [{ $eq: ["$state", "SAFE"] }, 1, 0] } },
            offline: { $sum: { $cond: [{ $eq: ["$connectivityState", "OFFLINE"] }, 1, 0] } },
          },
        },
      ]).toArray(),
    ]);

    const health = systemHealth[0] ?? { total: 0, online: 0, critical: 0, warning: 0, safe: 0, offline: 0 };

    return NextResponse.json({
      snapshot_at: new Date().toISOString(),
      zones,
      incidents,
      priority_queue: queue,
      system_health: {
        configured_zones: health.total,
        online_zones: health.online,
        offline_zones: health.offline,
        critical_zones: health.critical,
        warning_zones: health.warning,
        safe_zones: health.safe,
        open_incidents: incidents.filter(i => i.status === "OPEN").length,
        acknowledged_incidents: incidents.filter(i => i.status === "ACKNOWLEDGED").length,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof AuthError ? e.code : "ERROR" },
      { status: e instanceof AuthError ? e.status : 500 }
    );
  }
}
