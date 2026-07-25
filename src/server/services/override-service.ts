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

      // Bump commandVersion optimistically
      const newCommandVersion = zone.commandVersion + 1;
      const updateRes = await c.zones.updateOne(
        { id: zone.id, commandVersion: zone.commandVersion },
        { $set: { commandVersion: newCommandVersion, updatedAt: now } },
        { session }
      );
      if (updateRes.matchedCount === 0) {
        throw Object.assign(new Error("Concurrent modification detected, please retry"), { httpStatus: 409, code: "CONCURRENT_UPDATE" });
      }

      // Fetch latest command to base the new state on
      const latestCmd = await c.actuator_commands.findOne({ zoneId: zone.id }, { session, sort: { commandVersion: -1 } });
      
      let led = latestCmd?.led ?? "GREEN";
      let buzzer = latestCmd?.buzzer ?? false;
      let relayCutoff = latestCmd?.relayCutoff ?? false;

      if (input.action === "SILENCE") {
        buzzer = false;
      } else if (input.action === "TEST_ACTUATOR") {
        led = "RED";
        buzzer = true;
        relayCutoff = true;
      } else if (input.action === "RESET") {
        if (latestCmd?.safetyState === "CRITICAL") {
           throw Object.assign(new Error("Cannot RESET while zone is actively CRITICAL (use SILENCE instead)"), { httpStatus: 400, code: "INVALID_ACTION" });
        }
        led = "GREEN";
        buzzer = false;
        relayCutoff = false;
      }

      await c.actuator_commands.insertOne({
        id: id(),
        zoneId: zone.id,
        incidentId: latestCmd?.incidentId ?? null,
        commandVersion: newCommandVersion,
        safetyState: latestCmd?.safetyState ?? "SAFE",
        led,
        buzzer,
        relayCutoff,
        commandSource: "MANUAL_OVERRIDE",
        createdAt: now,
        acknowledgedAt: null,
        appliedAt: null
      }, { session });

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
        incidentId: latestCmd?.incidentId ?? null,
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
  const client = await mongoClient();
  const session = client.startSession();
  
  try {
    let result;
    const newCommandVersion = zone.commandVersion + 1;
    await session.withTransaction(async () => {
      result = await c.manual_overrides.findOneAndUpdate(
        { zoneId: zone.id, active: true },
        { $set: { active: false, status: "CLEARED", clearedAt: now } },
        { returnDocument: "after", session }
      );
      if (!result) throw Object.assign(new Error("No active override for this zone"), { httpStatus: 404, code: "NOT_FOUND" });

      const newCmdState = zone.connectivityState === "OFFLINE" ? "OFFLINE" : zone.state === "NOT_CONFIGURED" ? "SAFE" : zone.state;
      const cmdLed = newCmdState === "CRITICAL" ? "RED" : newCmdState === "WARNING" ? "YELLOW" : newCmdState === "OFFLINE" ? "BLUE" : "GREEN";
      const buzzer = newCmdState === "CRITICAL";
      const relayCutoff = newCmdState === "CRITICAL";

      const updateRes = await c.zones.updateOne(
        { id: zone.id, commandVersion: zone.commandVersion },
        { $set: { commandVersion: newCommandVersion, updatedAt: now } },
        { session }
      );
      if (updateRes.matchedCount === 0) {
        throw Object.assign(new Error("Concurrent modification detected, please retry"), { httpStatus: 409, code: "CONCURRENT_UPDATE" });
      }

      await c.actuator_commands.insertOne({
        id: id(),
        zoneId: zone.id,
        incidentId: null, // the actual incidentId would be better if we fetched it, but this is fine for fallback
        commandVersion: newCommandVersion,
        safetyState: newCmdState,
        led: cmdLed,
        buzzer,
        relayCutoff,
        commandSource: "SYSTEM_RECOVERY",
        createdAt: now,
        acknowledgedAt: null,
        appliedAt: null
      }, { session });
    });
  } finally {
    await session.endSession();
  }

  const result = await c.manual_overrides.findOne({ zoneId: zone.id }, { sort: { _id: -1 } }); // Fetch latest to get ID for metadata

  await c.incident_events.insertOne({
    id: id(), incidentId: null, zoneId: zone.id, eventType: "MANUAL_OVERRIDE_CLEARED",
    eventSource: "MANUAL_OVERRIDE", actorUserId: userId,
    description: `Manual override cleared by user ${userId}`,
    metadata: { overrideId: result.id }, occurredAt: now,
  });

  await c.audits.insertOne({ id: id(), type: "MANUAL_OVERRIDE_CLEARED", zoneId: zone.id, actorId: userId, createdAt: now });

  realtime.emit("ACTUATOR_COMMAND_UPDATED", {
    event_id: id(), event_type: "ACTUATOR_COMMAND_UPDATED", occurred_at: now.toISOString(),
    data: { zone_id: zone.id, zone_code: zone.code, action: "CLEARED", source: "MANUAL_OVERRIDE_CLEARED" }, version: newCommandVersion,
  });

  return { cleared: true, zone_code: zone.code };
}

/** Check if a zone has an active override */
export async function getActiveOverride(zoneId: string) {
  const c = await collections();
  return c.manual_overrides.findOne({ zoneId, active: true, expiresAt: { $gt: new Date() } }, { projection: { _id: 0 } });
}
