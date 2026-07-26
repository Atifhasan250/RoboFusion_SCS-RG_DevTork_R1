import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/src/server/auth/session";
import { collections } from "@/src/server/db/collections";

export const runtime = "nodejs";

/**
 * GET /api/v1/zones/status
 * Returns live state of all configured zones with risk details.
 * Includes zone_states data for detailed hysteresis info.
 */
export async function GET(_request: NextRequest) {
  try {
    await requireUser();
    const c = await collections();

    const zones = await c.zones
      .aggregate([
        { $match: { configured: true } },
        { $project: { _id: 0, apiKeyHash: 0 } },
        {
          $lookup: {
            from: "zone_states",
            localField: "id",
            foreignField: "zoneId",
            as: "liveState",
          },
        },
        { $unwind: { path: "$liveState", preserveNullAndEmptyArrays: true } },
        {
          $addFields: {
            risk_components: "$liveState.riskComponents",
            consecutive_critical: "$liveState.consecutiveCriticalReadings",
            fire_confirmed: "$liveState.fireConfirmed",
            state_version: "$liveState.stateVersion",
            warning_since: "$liveState.warningSince",
            critical_since: "$liveState.criticalSince",
          },
        },
        { $project: { liveState: 0 } },
        { $sort: { code: 1 } },
      ])
      .toArray();

    return NextResponse.json({ zones, count: zones.length });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof AuthError ? e.code : "ERROR" },
      { status: e instanceof AuthError ? e.status : 500 }
    );
  }
}
