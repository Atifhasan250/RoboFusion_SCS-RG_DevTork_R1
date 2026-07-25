import { NextRequest, NextResponse } from "next/server";
import { collections } from "@/src/server/db/collections";
import { env } from "@/src/server/config/env";
import { hashSecret, id, safeEqual } from "@/src/server/utils/id";

export const runtime = "nodejs";

/**
 * GET /api/v1/commands/:zoneCode
 * Polled by zone nodes to get their latest actuator command.
 * Requires X-Zone-API-Key header.
 */
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ zoneCode: string }> }
) {
  const { zoneCode } = await ctx.params;
  const c = await collections();

  const zone = await c.zones.findOne({ code: zoneCode });
  if (!zone || !zone.apiKeyHash || !safeEqual(
    zone.apiKeyHash,
    hashSecret(request.headers.get("x-zone-api-key") ?? "", env.ZONE_API_KEY_PEPPER)
  )) {
    return NextResponse.json({ error: "INVALID_ZONE_KEY" }, { status: 401 });
  }

  // Get the latest persisted actuator command
  const latestCmd = await c.actuator_commands.findOne(
    { zoneId: zone.id },
    { sort: { commandVersion: -1 }, projection: { _id: 0 } }
  );

  if (!latestCmd) {
    // No command yet — return default SAFE state
    return NextResponse.json({
      command_id: null,
      state_version: 0,
      safety_state: zone.state,
      led: "GREEN",
      buzzer: false,
      relay_cutoff: false,
      issued_at: zone.updatedAt,
    });
  }

  return NextResponse.json({
    command_id: latestCmd.id,
    command_version: latestCmd.commandVersion,
    safety_state: latestCmd.safetyState,
    led: latestCmd.led,
    buzzer: latestCmd.buzzer,
    relay_cutoff: latestCmd.relayCutoff,
    command_source: latestCmd.commandSource,
    issued_at: latestCmd.createdAt,
    acknowledged_at: latestCmd.acknowledgedAt,
  });
}

/**
 * POST /api/v1/commands/:zoneCode/:commandId/acknowledge
 * Zone node acknowledges it has received and applied a command.
 */
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ zoneCode: string }> }
) {
  const { zoneCode } = await ctx.params;
  const c = await collections();

  const zone = await c.zones.findOne({ code: zoneCode });
  if (!zone || !zone.apiKeyHash || !safeEqual(
    zone.apiKeyHash,
    hashSecret(request.headers.get("x-zone-api-key") ?? "", env.ZONE_API_KEY_PEPPER)
  )) {
    return NextResponse.json({ error: "INVALID_ZONE_KEY" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as { command_id?: string };
  if (!body.command_id) {
    return NextResponse.json({ error: "MISSING_COMMAND_ID" }, { status: 422 });
  }

  const now = new Date();
  const result = await c.actuator_commands.findOneAndUpdate(
    { id: body.command_id, zoneId: zone.id },
    [ { $set: { acknowledgedAt: now, appliedAt: { $ifNull: ["$appliedAt", now] } } } ],
    { returnDocument: "after", projection: { _id: 0 } }
  );

  if (!result) {
    return NextResponse.json({ error: "COMMAND_NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({ acknowledged: true, command_id: body.command_id, applied_at: now });
}
