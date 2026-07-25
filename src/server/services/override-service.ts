import { collections } from "../db/collections";
import { mongoClient } from "../db/client";
import { id } from "../utils/id";
import { realtime } from "../realtime/hub";

// ── Manual Override Service ───────────────────────────────────────────────────

export interface OverrideInput {
  zoneCode: string;
  action: "SILENCE" | "RESET" | "TEST_ACTUATOR";
  reason: string;
  expiresInMinutes?: number;
}

/** Apply a manual override — clears any previous active override for the zone */
export async function applyOverride(input: OverrideInput, userId: string) {
  const c = await collections();
  const client = await mongoClient();
  const session = client.startSession();
  const now = new Date();

  const zone = await c.zones.findOne({ code: input.zoneCode });
  if (!zone) throw Object.assign(new Error("Zone not found"), { httpStatus: 404, code: "NOT_FOUND" });

  const expiresAt = new Date(now.getTime() + (input.expiresInMinutes ?? 30) * 60 * 1000);
  let overrideDoc: import("../types").ManualOverride | null = null;

  try {
    await session.withTransaction(async () => {
      // Clear any previous active override for this zone
      await c.manual_overrides.updateMany(
        { zoneId: zone.id, active: true },
        { $set: { active: false, status: "CLEARED", clearedAt: now } },
        { session }
      );

      // Create new override
      overrideDoc = {
        id: id(),
        zoneId: zone.id,
        userId,
        action: input.action,
        reason: input.reason,
        startedAt: now,
        expiresAt,
        clearedAt: null,
        status: "ACTIVE",
        active: true,
      };
      await c.manual_overrides.insertOne(overrideDoc, { session });

      // Log incident event
      await c.incident_events.insertOne({
        id: id(),
        incidentId: null,
        zoneId: zone.id,
        eventType: "MANUAL_OVERRIDE_APPLIED",
        eventSource: "MANUAL_OVERRIDE",
        actorUserId: userId,
        description: `Manual override applied: ${input.action} — ${input.reason}`,
        metadata: { action: input.action, reason: input.reason, expiresAt },
        occurredAt: now,
      }, { session });

      await c.audits.insertOne({
        id: id(), type: "MANUAL_OVERRIDE", zoneId: zone.id, actorId: userId,
        metadata: { action: input.action, reason: input.reason, expiresAt }, createdAt: now,
      }, { session });
    });
  } finally {
    await session.endSession();
  }

  // Broadcast
  realtime.emit("ACTUATOR_COMMAND_UPDATED", {
    event_id: id(), event_type: "ACTUATOR_COMMAND_UPDATED", occurred_at: now.toISOString(),
    data: { zone_id: zone.id, zone_code: zone.code, action: input.action, source: "MANUAL_OVERRIDE", expires_at: expiresAt },
    version: zone.commandVersion + 1,
  });

  return {
    accepted: true,
    override_id: overrideDoc!.id,
    zone_code: zone.code,
    action: input.action,
    expires_at: expiresAt,
    safety: "Manual command is audited; sensor ingestion remains authoritative after override expires.",
  };
}

/** Clear an active manual override */
export async function clearOverride(zoneCode: string, userId: string) {
  const c = await collections();
  const zone = await c.zones.findOne({ code: zoneCode });
  if (!zone) throw Object.assign(new Error("Zone not found"), { httpStatus: 404, code: "NOT_FOUND" });

  const now = new Date();
  const result = await c.manual_overrides.findOneAndUpdate(
    { zoneId: zone.id, active: true },
    { $set: { active: false, status: "CLEARED", clearedAt: now } },
    { returnDocument: "after" }
  );
  if (!result) throw Object.assign(new Error("No active override for this zone"), { httpStatus: 404, code: "NOT_FOUND" });

  await c.incident_events.insertOne({
    id: id(), incidentId: null, zoneId: zone.id, eventType: "MANUAL_OVERRIDE_CLEARED",
    eventSource: "MANUAL_OVERRIDE", actorUserId: userId,
    description: `Manual override cleared by user ${userId}`,
    metadata: { overrideId: result.id }, occurredAt: now,
  });

  await c.audits.insertOne({ id: id(), type: "MANUAL_OVERRIDE_CLEARED", zoneId: zone.id, actorId: userId, createdAt: now });

  realtime.emit("ACTUATOR_COMMAND_UPDATED", {
    event_id: id(), event_type: "ACTUATOR_COMMAND_UPDATED", occurred_at: now.toISOString(),
    data: { zone_id: zone.id, zone_code: zone.code, action: "CLEARED", source: "MANUAL_OVERRIDE_CLEARED" }, version: 0,
  });

  return { cleared: true, zone_code: zone.code };
}

/** Check if a zone has an active override */
export async function getActiveOverride(zoneId: string) {
  const c = await collections();
  return c.manual_overrides.findOne({ zoneId, active: true, expiresAt: { $gt: new Date() } }, { projection: { _id: 0 } });
}
