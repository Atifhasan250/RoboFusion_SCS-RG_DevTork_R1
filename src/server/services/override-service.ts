import type { MongoServerError } from "mongodb";
import { collections } from "../db/collections";
import { mongoClient } from "../db/client";
import { id } from "../utils/id";
import { realtime } from "../realtime/hub";
import { allocateCommandVersion, buildActuatorCommand, outputForState } from "./command-service";
import type { ActuatorCommand, ManualOverride, SafetyState } from "../types";

export interface OverrideInput {
  zoneCode: string;
  action: "SILENCE" | "RESET" | "TEST_ACTUATOR";
  reason: string;
  expiresInMinutes?: number;
}

function isRetryable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as MongoServerError;
  return candidate.hasErrorLabel?.("TransientTransactionError") === true
    || candidate.hasErrorLabel?.("UnknownTransactionCommitResult") === true
    || candidate.code === 112
    || candidate.code === 11000;
}

async function retry<T>(work: () => Promise<T>): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await work();
    } catch (error) {
      if (!isRetryable(error) || attempt >= 4) throw error;
      attempt += 1;
      await new Promise(resolve => setTimeout(resolve, 25 * attempt));
    }
  }
}

/** Apply a manual override. Sensor-derived safety state always remains authoritative. */
export async function applyOverride(input: OverrideInput, userId: string) {
  return retry(async () => {
    const c = await collections();
    const client = await mongoClient();
    const session = client.startSession();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (input.expiresInMinutes ?? 30) * 60_000);
    let overrideDoc: ManualOverride | null = null;
    let command: ActuatorCommand | null = null;
    let zoneCode = input.zoneCode;

    try {
      await session.withTransaction(async () => {
        const zone = await c.zones.findOne({ code: input.zoneCode, configured: true }, { session });
        if (!zone) throw Object.assign(new Error("Zone not found"), { httpStatus: 404, code: "NOT_FOUND" });
        zoneCode = zone.code;
        const zoneState = await c.zone_states.findOne({ zoneId: zone.id }, { session });
        const safetyState: SafetyState = zoneState?.safetyState
          ?? (zone.state === "WARNING" || zone.state === "CRITICAL" ? zone.state : "SAFE");
        const connectivityState = zoneState?.connectivityState ?? zone.connectivityState;
        const activeIncident = await c.incidents.findOne({ zoneId: zone.id, active: true }, { session });

        if (input.action === "RESET" && safetyState === "CRITICAL") {
          throw Object.assign(
            new Error("Cannot RESET while the sensor-derived zone state is CRITICAL; use SILENCE instead"),
            { httpStatus: 409, code: "INVALID_ACTION" },
          );
        }

        await c.manual_overrides.updateMany(
          { zoneId: zone.id, active: true },
          { $set: { active: false, status: "CLEARED", clearedAt: now } },
          { session },
        );

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

        const base = outputForState(safetyState, connectivityState);
        let led = base.led;
        let buzzer = base.buzzer;
        let relayCutoff = base.relayCutoff;

        if (input.action === "SILENCE") {
          // SILENCE may mute the buzzer, but never disables a CRITICAL relay cutoff.
          buzzer = false;
        } else if (input.action === "TEST_ACTUATOR") {
          led = "RED";
          buzzer = true;
          relayCutoff = true;
        }
        // RESET returns outputs to the current sensor-derived state; it does not force SAFE.

        const commandVersion = await allocateCommandVersion(zone.id, session);
        const newCommand = buildActuatorCommand({
          zoneId: zone.id,
          incident: activeIncident,
          commandVersion,
          safetyState,
          connectivityState,
          source: "MANUAL_OVERRIDE",
          led,
          buzzer,
          relayCutoff,
          now,
        });
        await c.actuator_commands.insertOne(newCommand, { session });
        command = newCommand as ActuatorCommand;

        await c.incident_events.insertOne({
          id: id(),
          incidentId: activeIncident?.id ?? null,
          zoneId: zone.id,
          eventType: "MANUAL_OVERRIDE_APPLIED",
          eventSource: "MANUAL_OVERRIDE",
          actorUserId: userId,
          description: `Manual override applied: ${input.action} — ${input.reason}`,
          metadata: {
            action: input.action,
            reason: input.reason,
            expiresAt,
            commandVersion,
            sensorSafetyState: safetyState,
            relayCutoff,
            buzzer,
          },
          occurredAt: now,
        }, { session });
        await c.audits.insertOne({
          id: id(),
          type: "MANUAL_OVERRIDE_APPLIED",
          zoneId: zone.id,
          incidentId: activeIncident?.id,
          actorId: userId,
          metadata: { action: input.action, reason: input.reason, expiresAt, commandVersion },
          createdAt: now,
        }, { session });
      });
    } finally {
      await session.endSession();
    }

    const committedOverride = overrideDoc as ManualOverride | null;
    const committedCommand = command as ActuatorCommand | null;
    if (!committedOverride || !committedCommand) throw new Error("Override transaction completed without a command");
    realtime.emit("ACTUATOR_COMMAND_UPDATED", {
      event_id: id(),
      event_type: "ACTUATOR_COMMAND_UPDATED",
      occurred_at: now.toISOString(),
      data: { command: committedCommand, zone_code: zoneCode, action: input.action, source: "MANUAL_OVERRIDE" },
      version: committedCommand.commandVersion,
    });

    return {
      accepted: true,
      override_id: committedOverride.id,
      zone_code: zoneCode,
      action: input.action,
      expires_at: expiresAt,
      command_version: committedCommand.commandVersion,
      safety: "Sensor-derived state remains authoritative. SILENCE never resets a critical relay cutoff.",
    };
  });
}

/** Clear the current override and restore outputs from the latest durable sensor state. */
export async function clearOverride(zoneCode: string, userId: string) {
  return retry(async () => {
    const c = await collections();
    const client = await mongoClient();
    const session = client.startSession();
    const now = new Date();
    let command: ActuatorCommand | null = null;
    let clearedOverrideId: string | null = null;

    try {
      await session.withTransaction(async () => {
        const zone = await c.zones.findOne({ code: zoneCode, configured: true }, { session });
        if (!zone) throw Object.assign(new Error("Zone not found"), { httpStatus: 404, code: "NOT_FOUND" });
        const cleared = await c.manual_overrides.findOneAndUpdate(
          { zoneId: zone.id, active: true },
          { $set: { active: false, status: "CLEARED", clearedAt: now } },
          { session, returnDocument: "after" },
        );
        if (!cleared) throw Object.assign(new Error("No active override for this zone"), { httpStatus: 404, code: "NOT_FOUND" });
        clearedOverrideId = cleared.id;

        const zoneState = await c.zone_states.findOne({ zoneId: zone.id }, { session });
        const safetyState: SafetyState = zoneState?.safetyState
          ?? (zone.state === "WARNING" || zone.state === "CRITICAL" ? zone.state : "SAFE");
        const connectivityState = zoneState?.connectivityState ?? zone.connectivityState;
        const activeIncident = await c.incidents.findOne({ zoneId: zone.id, active: true }, { session });
        const commandVersion = await allocateCommandVersion(zone.id, session);
        const recoveryCommand = buildActuatorCommand({
          zoneId: zone.id,
          incident: activeIncident,
          commandVersion,
          safetyState,
          connectivityState,
          source: "SYSTEM_RECOVERY",
          now,
        });
        await c.actuator_commands.insertOne(recoveryCommand, { session });
        command = recoveryCommand as ActuatorCommand;

        await c.incident_events.insertOne({
          id: id(),
          incidentId: activeIncident?.id ?? null,
          zoneId: zone.id,
          eventType: "MANUAL_OVERRIDE_CLEARED",
          eventSource: "MANUAL_OVERRIDE",
          actorUserId: userId,
          description: `Manual override cleared by user ${userId}`,
          metadata: { overrideId: cleared.id, commandVersion },
          occurredAt: now,
        }, { session });
        await c.audits.insertOne({
          id: id(),
          type: "MANUAL_OVERRIDE_CLEARED",
          zoneId: zone.id,
          incidentId: activeIncident?.id,
          actorId: userId,
          metadata: { overrideId: cleared.id, commandVersion },
          createdAt: now,
        }, { session });
      });
    } finally {
      await session.endSession();
    }

    const committedCommand = command as ActuatorCommand | null;
    if (!committedCommand) throw new Error("Override clear transaction completed without a recovery command");
    realtime.emit("ACTUATOR_COMMAND_UPDATED", {
      event_id: id(),
      event_type: "ACTUATOR_COMMAND_UPDATED",
      occurred_at: now.toISOString(),
      data: { command: committedCommand, zone_code: zoneCode, action: "CLEARED", source: "MANUAL_OVERRIDE_CLEARED" },
      version: committedCommand.commandVersion,
    });
    return { cleared: true, override_id: clearedOverrideId, zone_code: zoneCode, command_version: committedCommand.commandVersion };
  });
}

export async function getActiveOverride(zoneId: string) {
  const c = await collections();
  return c.manual_overrides.findOne(
    { zoneId, active: true, expiresAt: { $gt: new Date() } },
    { projection: { _id: 0 } },
  );
}
