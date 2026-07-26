import { NextRequest, NextResponse } from "next/server";
import { collections } from "@/src/server/db/collections";
import { env } from "@/src/server/config/env";
import { hashSecret, safeEqual } from "@/src/server/utils/id";
import { outputForState } from "@/src/server/services/command-service";
import type { SafetyState } from "@/src/server/types";

export const runtime = "nodejs";

async function authenticatedZone(request: NextRequest, zoneCode: string) {
  const c = await collections();
  const zone = await c.zones.findOne({ code: zoneCode, configured: true });
  const supplied = request.headers.get("x-zone-api-key") ?? "";
  if (!zone || !zone.apiKeyHash || !safeEqual(zone.apiKeyHash, hashSecret(supplied, env.ZONE_API_KEY_PEPPER))) return null;
  return zone;
}

/** GET /api/v1/commands/:zoneCode — latest durable command for the node. */
export async function GET(request: NextRequest, ctx: { params: Promise<{ zoneCode: string }> }) {
  const { zoneCode } = await ctx.params;
  const zone = await authenticatedZone(request, zoneCode);
  if (!zone) return NextResponse.json({ error: "INVALID_ZONE_KEY" }, { status: 401 });
  const c = await collections();
  const latest = await c.actuator_commands.findOne(
    { zoneId: zone.id },
    { sort: { commandVersion: -1 }, projection: { _id: 0 } },
  );
  if (latest) {
    return NextResponse.json({
      command_id: latest.id,
      command_version: latest.commandVersion,
      safety_state: latest.safetyState,
      led: latest.led,
      buzzer: latest.buzzer,
      relay_cutoff: latest.relayCutoff,
      command_source: latest.commandSource,
      issued_at: latest.createdAt,
      acknowledged_at: latest.acknowledgedAt,
      applied_at: latest.appliedAt,
    });
  }

  const state = await c.zone_states.findOne({ zoneId: zone.id });
  const safetyState: SafetyState = state?.safetyState
    ?? (zone.state === "WARNING" || zone.state === "CRITICAL" ? zone.state : "SAFE");
  const output = outputForState(safetyState, state?.connectivityState ?? zone.connectivityState);
  return NextResponse.json({
    command_id: null,
    command_version: 0,
    safety_state: output.commandState,
    led: output.led,
    buzzer: output.buzzer,
    relay_cutoff: output.relayCutoff,
    command_source: "SYSTEM_RECOVERY",
    issued_at: zone.updatedAt,
    acknowledged_at: null,
    applied_at: null,
  });
}

/** POST /api/v1/commands/:zoneCode — idempotent command application acknowledgement. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ zoneCode: string }> }) {
  const { zoneCode } = await ctx.params;
  const zone = await authenticatedZone(request, zoneCode);
  if (!zone) return NextResponse.json({ error: "INVALID_ZONE_KEY" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { command_id?: string };
  if (!body.command_id) return NextResponse.json({ error: "MISSING_COMMAND_ID" }, { status: 422 });

  const c = await collections();
  const now = new Date();
  const command = await c.actuator_commands.findOneAndUpdate(
    { id: body.command_id, zoneId: zone.id },
    [{ $set: {
      acknowledgedAt: { $ifNull: ["$acknowledgedAt", now] },
      appliedAt: { $ifNull: ["$appliedAt", now] },
    } }],
    { returnDocument: "after", projection: { _id: 0 } },
  );
  if (!command) return NextResponse.json({ error: "COMMAND_NOT_FOUND" }, { status: 404 });

  return NextResponse.json({
    acknowledged: true,
    command_id: command.id,
    command_version: command.commandVersion,
    applied_at: command.appliedAt,
    latency_ms: command.appliedAt ? command.appliedAt.getTime() - command.createdAt.getTime() : null,
  });
}
