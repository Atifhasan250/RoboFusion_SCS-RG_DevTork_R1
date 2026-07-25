import { collections } from "../db/collections";
import { mongoClient } from "../db/client";
import { env } from "../config/env";
import { hashSecret, id, safeEqual } from "../utils/id";
import { calculateRisk, normalize, applyHysteresis, stateForRisk } from "../risk/engine";
import { realtime } from "../realtime/hub";
import { log } from "../utils/logger";
import type { Incident, ZoneStateDoc, ActuatorCommand, IncidentEvent, SafetyState, HazardType, ConnectivityState } from "../types";
import type { z } from "zod";
import type { readingSchema } from "../validation/schemas";

type Payload = z.infer<typeof readingSchema>;

export class IngestionError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

// ── Gas normalization: ADC 0-4095, baseline ~1200, critical ~3000 (calibration defaults)
const GAS_BASELINE = 1200;
const GAS_CRITICAL = 3000;
const WATER_DRY = 0;
const WATER_CRITICAL = 80;

function computeFactors(data: Payload, fireConfirmed: boolean, warmingUp: boolean) {
  const gasFactor = warmingUp ? 0 : normalize(data.gas - GAS_BASELINE, GAS_CRITICAL - GAS_BASELINE);
  const waterFactor = normalize(data.water - WATER_DRY, WATER_CRITICAL - WATER_DRY);
  const occupancy = data.pir || data.cameraOccupancy === true;
  return { gasFactor, waterFactor, occupancy, fireConfirmed };
}

function buildCommand(state: SafetyState | "OFFLINE", stateVersion: number, zoneId: string, incidentId: string | null): Omit<ActuatorCommand, "_id"> {
  const critical = state === "CRITICAL";
  const warning = state === "WARNING";
  return {
    id: id(),
    zoneId,
    incidentId,
    stateVersion,
    safetyState: state === "OFFLINE" ? "OFFLINE" : state as SafetyState,
    led: critical ? "RED" : warning ? "YELLOW" : state === "OFFLINE" ? "BLUE" : "GREEN",
    buzzer: critical,
    relayCutoff: critical,
    commandSource: "SENSOR_STATE",
    createdAt: new Date(),
    acknowledgedAt: null,
    appliedAt: null,
  };
}

function buildEvent(
  type: IncidentEvent["eventType"],
  zoneId: string,
  incidentId: string | null,
  description: string,
  metadata: Record<string, unknown> = {},
): Omit<IncidentEvent, "_id"> {
  return {
    id: id(),
    incidentId,
    zoneId,
    eventType: type,
    eventSource: "BACKEND",
    actorUserId: null,
    description,
    metadata,
    occurredAt: new Date(),
  };
}

export async function ingest(zoneCode: string, key: string | null, data: Payload) {
  let retryCount = 0;
  while (true) {
    try {
      return await doIngest(zoneCode, key, data);
    } catch (e: any) {
      if (e.code === 11000) {
        if (e.message && (e.message.includes("bootId_1") || e.message.includes("sequence_1"))) {
          const c = await collections();
          const zone = await c.zones.findOne({ code: zoneCode });
          if (zone) {
            const existingReading = await c.readings.findOne({ zoneId: zone.id, bootId: data.bootId ?? "default", sequence: data.sequence });
            const latestCmd = await c.actuator_commands.findOne({ zoneId: zone.id }, { sort: { stateVersion: -1 } });
            return {
              accepted: true,
              duplicate: true,
              reading_id: existingReading?.id,
              zone: { safety_state: zone.state, connectivity_state: zone.connectivityState ?? "ONLINE", risk_score: zone.riskScore, state_version: zone.commandVersion },
              command: latestCmd ? { command_id: latestCmd.id, state_version: latestCmd.stateVersion, led: latestCmd.led, buzzer: latestCmd.buzzer, relay_cutoff: latestCmd.relayCutoff } : null,
            };
          }
        } else {
          // Command version or incident unique index collision
          throw new IngestionError(409, "CONCURRENT_UPDATE", "Concurrent write collision (E11000)");
        }
      }
      if (e instanceof IngestionError && e.code === "CONCURRENT_UPDATE" && retryCount < 3) {
        retryCount++;
        continue;
      }
      throw e;
    }
  }
}

async function doIngest(zoneCode: string, key: string | null, data: Payload) {
  const c = await collections();

  // ── Auth ──────────────────────────────────────────────────────────────────
  const zone = await c.zones.findOne({ code: zoneCode });
  if (!zone || !zone.configured) throw new IngestionError(404, "UNKNOWN_ZONE", "Zone is not registered or configured");
  if (!key || !zone.apiKeyHash || !safeEqual(zone.apiKeyHash, hashSecret(key, env.ZONE_API_KEY_PEPPER)))
    throw new IngestionError(401, "INVALID_ZONE_KEY", "Zone API key rejected");

  // ── Duplicate Detection ───────────────────────────────────────────────────
  const bootId = data.bootId ?? "default";
  const existingReading = await c.readings.findOne({ zoneId: zone.id, bootId, sequence: data.sequence });
  if (existingReading) {
    const latestCmd = await c.actuator_commands.findOne({ zoneId: zone.id }, { sort: { stateVersion: -1 } });
    log("READING_DUPLICATE", { zone_code: zoneCode, sequence: data.sequence });
    return {
      accepted: false,
      duplicate: true,
      reading_id: existingReading.id,
      zone: { safety_state: zone.state, connectivity_state: zone.connectivityState ?? "ONLINE", risk_score: zone.riskScore, state_version: zone.commandVersion },
      command: latestCmd ? { command_id: latestCmd.id, state_version: latestCmd.stateVersion, led: latestCmd.led, buzzer: latestCmd.buzzer, relay_cutoff: latestCmd.relayCutoff } : null,
    };
  }

  // ── Load current zone state (from zone_states) ───────────────────────────
  let zoneState = await c.zone_states.findOne({ zoneId: zone.id });
  const now = new Date();

  if (!zoneState) {
    // Bootstrap zone state doc using upsert to avoid race conditions
    const bootstrap: Omit<ZoneStateDoc, "_id"> = {
      zoneId: zone.id,
      safetyState: "SAFE",
      connectivityState: "ONLINE",
      riskScore: 0,
      riskComponents: { fire: 0, gas: 0, water: 0, occupancy: 0 },
      primaryHazard: "NONE",
      occupied: false,
      lastReadingId: null,
      lastObservedAt: null,
      lastReceivedAt: null,
      warningSince: null,
      criticalSince: null,
      recoverySince: null,
      consecutiveWarningReadings: 0,
      consecutiveCriticalReadings: 0,
      consecutiveSafeReadings: 0,
      firePositiveCount: 0,
      fireClearCount: 0,
      fireConfirmed: false,
      fireConfirmedAt: null,
      stateVersion: 0,
      updatedAt: now,
    };
    
    const result = await c.zone_states.findOneAndUpdate(
       { zoneId: zone.id },
       { $setOnInsert: bootstrap },
       { upsert: true, returnDocument: "after" }
    );
    zoneState = result as typeof zoneState;
  }
  // zoneState is non-null from here on
  const zs = zoneState!;

  // ── Late-reading check ─────────────────────────────────────────────────────
  const isLate = !!(zs.lastObservedAt && data.timestamp < zs.lastObservedAt);
  const uptimeMs = data.deviceUptimeSeconds * 1000;
  const warmingUp = uptimeMs < 30_000;

  // ── Fire debounce ─────────────────────────────────────────────────────────
  let { firePositiveCount, fireClearCount, fireConfirmed, fireConfirmedAt } = zs;
  const FIRE_DEBOUNCE = 2; // 2 consecutive positive readings (~1s at 500ms interval)
  const FIRE_CLEAR = 3;

  if (data.fire) {
    firePositiveCount++;
    fireClearCount = 0;
    if (!fireConfirmed && firePositiveCount >= FIRE_DEBOUNCE) {
      fireConfirmed = true;
      fireConfirmedAt = now;
    }
  } else {
    fireClearCount++;
    firePositiveCount = Math.max(0, firePositiveCount - 1);
    if (fireConfirmed && fireClearCount >= FIRE_CLEAR) {
      fireConfirmed = false;
      fireClearCount = 0;
    }
  }
  const fireJustConfirmed = fireConfirmed && !zs.fireConfirmed;

  // ── Risk calculation ──────────────────────────────────────────────────────
  const { gasFactor, waterFactor, occupancy } = computeFactors(data, fireConfirmed, warmingUp);
  const risk = calculateRisk({ fireConfirmed, gasFactor, waterFactor, occupancy });

  // ── Connectivity state ────────────────────────────────────────────────────
  const connectivityState: ConnectivityState =
    data.sensorHealth === "OFFLINE" ? "OFFLINE"
    : data.sensorHealth === "DEGRADED" ? "DEGRADED"
    : "ONLINE";

  // ── Hysteresis state transition ───────────────────────────────────────────
  let { consecutiveWarningReadings, consecutiveCriticalReadings, consecutiveSafeReadings } = zs;
  const prevState = zs.safetyState;
  let recoverySince = zs.recoverySince;
  if (prevState === "CRITICAL" && risk.score < 55) {
    if (!recoverySince) recoverySince = now;
  } else if (prevState === "WARNING" && risk.score < 25) {
    if (!recoverySince) recoverySince = now;
  } else {
    recoverySince = null;
  }

  const recoveryStableMs = recoverySince ? now.getTime() - recoverySince.getTime() : 0;

  if (risk.score >= 65) { consecutiveCriticalReadings++; consecutiveWarningReadings++; consecutiveSafeReadings = 0; }
  else if (risk.score >= 30) { consecutiveWarningReadings++; consecutiveCriticalReadings = 0; consecutiveSafeReadings = 0; }
  else { consecutiveSafeReadings++; consecutiveWarningReadings = 0; consecutiveCriticalReadings = 0; }

  const nextSafetyState = connectivityState === "OFFLINE" ? prevState : applyHysteresis({
    currentState: prevState,
    newRiskScore: risk.score,
    consecutiveAboveThreshold: risk.score >= 65 ? consecutiveCriticalReadings : consecutiveWarningReadings,
    consecutiveBelowThreshold: consecutiveSafeReadings,
    recoveryStableMs,
    fireJustConfirmed,
  });

  const stateChanged = nextSafetyState !== prevState;
  const newStaleVersion = zs.stateVersion + 1;
  const fireFactor = fireConfirmed ? 1 : 0;
  const occupancyFactor = occupancy ? 1 : 0;

  const newReadingId = id();

  // ── Transaction ───────────────────────────────────────────────────────────
  const client = await mongoClient();
  const session = client.startSession();
  let openIncident: Incident | null = null;
  let command: ActuatorCommand | null = null;
  let incidentStateEvent: IncidentEvent | null = null;

  try {
    await session.withTransaction(async () => {
      // 1. Insert reading
      await c.readings.insertOne({
        id: newReadingId,
        zoneId: zone.id,
        bootId,
        sequence: data.sequence,
        receivedAt: now,
        observedAt: data.timestamp,
        uptimeMs,
        sampleIntervalMs: 500,
        fire: data.fire,
        gas: data.gas,
        water: data.water,
        pir: data.pir,
        cameraOccupancy: data.cameraOccupancy ?? null,
        sensorHealth: data.sensorHealth,
        fireFactor,
        gasFactor,
        waterFactor,
        occupancyFactor,
        riskScore: risk.score,
        riskComponents: risk.components,
        calculatedState: risk.state,
        primaryHazard: risk.primaryHazard,
        isLate,
        isWarmingUp: warmingUp,
        normalized: { gas: gasFactor, water: waterFactor, occupancy: occupancyFactor },
      }, { session });

      // 2. Update zone_states (only if not late)
      if (!isLate) {
        const zoneStateUpdate: Partial<ZoneStateDoc> = {
          safetyState: nextSafetyState,
          connectivityState,
          riskScore: risk.score,
          riskComponents: risk.components,
          primaryHazard: risk.primaryHazard,
          occupied: occupancy,
          lastReadingId: newReadingId,
          lastObservedAt: data.timestamp,
          lastReceivedAt: now,
          firePositiveCount,
          fireClearCount,
          fireConfirmed,
          fireConfirmedAt: fireConfirmedAt ?? null,
          consecutiveWarningReadings,
          consecutiveCriticalReadings,
          consecutiveSafeReadings,
          stateVersion: newStaleVersion,
          updatedAt: now,
          warningSince: nextSafetyState === "WARNING" && prevState !== "WARNING" ? now : (nextSafetyState === "WARNING" ? zs.warningSince : null),
          criticalSince: nextSafetyState === "CRITICAL" && prevState !== "CRITICAL" ? now : (nextSafetyState === "CRITICAL" ? zs.criticalSince : null),
          recoverySince,
        };
        const updateResult = await c.zone_states.updateOne(
          { zoneId: zone.id, stateVersion: zs.stateVersion },
          { $set: zoneStateUpdate },
          { session }
        );
        if (updateResult.matchedCount === 0) {
          throw new IngestionError(409, "CONCURRENT_UPDATE", "Zone state was modified concurrently");
        }

        // 3. Update zone snapshot (for fast reads)
        await c.zones.updateOne(
          { id: zone.id },
          { $set: { state: nextSafetyState, riskScore: risk.score, primaryHazard: risk.primaryHazard, occupancy, connectivityState, lastReadingAt: data.timestamp, lastSequence: data.sequence, commandVersion: newStaleVersion, updatedAt: now } },
          { session }
        );

      // 4. Incident management
      const activeIncident: Incident | null = await c.incidents.findOne({ zoneId: zone.id, active: true }, { session }) as Incident | null;

      if (nextSafetyState === "CRITICAL" && !activeIncident) {
        // Open new incident
        const newIncident: Omit<Incident, "_id"> = {
          id: id(),
          zoneId: zone.id,
          status: "OPEN",
          active: true,
          severity: "CRITICAL",
          primaryHazard: risk.primaryHazard,
          initialRiskScore: risk.score,
          peakRiskScore: risk.score,
          startedAt: now,
          acknowledgedAt: null,
          acknowledgedBy: null,
          resolvedAt: null,
          resolutionReason: null,
          version: 1,
          createdAt: now,
          updatedAt: now,
          // legacy
          openedAt: now,
          riskScore: risk.score,
          hazard: risk.primaryHazard,
          commandVersion: newStaleVersion,
        };
        await c.incidents.insertOne(newIncident, { session });
        openIncident = newIncident as Incident;

        const openEvent = buildEvent("INCIDENT_OPENED", zone.id, newIncident.id, `Incident opened: ${risk.primaryHazard} risk score ${risk.score}`, { riskScore: risk.score, hazard: risk.primaryHazard });
        await c.incident_events.insertOne(openEvent, { session });
        incidentStateEvent = openEvent as IncidentEvent;
        await c.audits.insertOne({ id: id(), type: "INCIDENT_OPENED", zoneId: zone.id, incidentId: newIncident.id, createdAt: now }, { session });
      } else if (activeIncident) {
        // Update peak risk score
        if (risk.score > (activeIncident.peakRiskScore ?? 0)) {
          await c.incidents.updateOne({ id: activeIncident.id }, { $set: { peakRiskScore: risk.score, updatedAt: now } }, { session });
        }

        // Resolve if zone recovered
        if (nextSafetyState === "SAFE" || nextSafetyState === "WARNING") {
          await c.incidents.updateOne(
            { id: activeIncident.id, active: true, status: { $in: ["OPEN", "ACKNOWLEDGED"] } },
            { $set: { status: "RESOLVED", active: false, resolvedAt: now, resolutionReason: "Sensor risk recovered", updatedAt: now }, $inc: { version: 1 } },
            { session }
          );
          const resolveEvent = buildEvent("INCIDENT_RESOLVED", zone.id, activeIncident.id, `Incident resolved: risk dropped to ${risk.score}`, { riskScore: risk.score, prevState, nextSafetyState });
          await c.incident_events.insertOne(resolveEvent, { session });
          incidentStateEvent = resolveEvent as IncidentEvent;
          await c.audits.insertOne({ id: id(), type: "INCIDENT_RESOLVED", zoneId: zone.id, incidentId: activeIncident.id, createdAt: now }, { session });
          openIncident = null;
        } else {
          openIncident = activeIncident;
        }
      }

      // 5. State change events
      if (stateChanged) {
        const evtTypeMap: Record<SafetyState, IncidentEvent["eventType"]> = {
          CRITICAL: "ZONE_CRITICAL", WARNING: "ZONE_WARNING", SAFE: "ZONE_SAFE",
        };
        const stateEvt = buildEvent(evtTypeMap[nextSafetyState], zone.id, openIncident?.id ?? null, `Zone transitioned from ${prevState} to ${nextSafetyState}`, { prevState, nextSafetyState, riskScore: risk.score });
        await c.incident_events.insertOne(stateEvt, { session });
      }

      // 6. Persist actuator command (only if state changed or new command version)
      const prevCmd = await c.actuator_commands.findOne({ zoneId: zone.id }, { session, sort: { stateVersion: -1 } });
      const newCmdState = connectivityState === "OFFLINE" ? "OFFLINE" : nextSafetyState;
      const cmdLed = newCmdState === "CRITICAL" ? "RED" : newCmdState === "WARNING" ? "YELLOW" : newCmdState === "OFFLINE" ? "BLUE" : "GREEN";

      // Expire old overrides
      await c.manual_overrides.updateMany(
        { zoneId: zone.id, active: true, expiresAt: { $lte: now } },
        { $set: { active: false, status: "EXPIRED" } },
        { session }
      );

      const activeOverride = await c.manual_overrides.findOne({ zoneId: zone.id, active: true }, { session });
      
      let cmdBuzzer = newCmdState === "CRITICAL";
      let cmdRelay = newCmdState === "CRITICAL";

      if (activeOverride) {
        if (activeOverride.action === "SILENCE") cmdBuzzer = false;
        if (activeOverride.action === "TEST_ACTUATOR") {
           cmdBuzzer = true;
           cmdRelay = true;
        }
      }

      // Only create a new command doc if the actuator state actually changed
      if (!prevCmd || prevCmd.led !== cmdLed || prevCmd.buzzer !== cmdBuzzer || prevCmd.relayCutoff !== cmdRelay) {
        const newCmd = buildCommand(newCmdState as SafetyState | "OFFLINE", newStaleVersion, zone.id, openIncident?.id ?? null);
        newCmd.buzzer = cmdBuzzer;
        newCmd.relayCutoff = cmdRelay;
        await c.actuator_commands.insertOne(newCmd, { session });
        command = newCmd;
      } else {
        command = prevCmd as ActuatorCommand;
      }
      
      } // End of !isLate block
    });
  } finally {
    await session.endSession();
  }

  // ── WebSocket broadcast ───────────────────────────────────────────────────
  const updatedZone = await c.zones.findOne({ id: zone.id }, { projection: { _id: 0, apiKeyHash: 0 } });
  
  if (!isLate) {
    const wsEvent = {
      event_id: id(),
      event_type: stateChanged ? "ZONE_STATE_CHANGED" : "ZONE_READING_UPDATED",
      occurred_at: now.toISOString(),
      data: { zone: updatedZone, riskComponents: risk.components },
      version: newStaleVersion,
    };
    realtime.emit(wsEvent.event_type, wsEvent);

    if (openIncident && stateChanged && nextSafetyState === "CRITICAL") {
      realtime.emit("INCIDENT_CREATED", {
        event_id: id(), event_type: "INCIDENT_CREATED", occurred_at: now.toISOString(),
        data: { incident: openIncident, zone: updatedZone }, version: newStaleVersion,
      });
      realtime.emit("PRIORITY_QUEUE_UPDATED", {
        event_id: id(), event_type: "PRIORITY_QUEUE_UPDATED", occurred_at: now.toISOString(),
        data: {}, version: newStaleVersion,
      });
    }

    if (stateChanged && (nextSafetyState === "SAFE" || nextSafetyState === "WARNING") && incidentStateEvent) {
      realtime.emit("INCIDENT_RESOLVED", {
        event_id: id(), event_type: "INCIDENT_RESOLVED", occurred_at: now.toISOString(),
        data: { zoneId: zone.id }, version: newStaleVersion,
      });
      realtime.emit("PRIORITY_QUEUE_UPDATED", {
        event_id: id(), event_type: "PRIORITY_QUEUE_UPDATED", occurred_at: now.toISOString(),
        data: {}, version: newStaleVersion,
      });
    }

    // Live priority queue update for critical zones if score or occupancy changes
    if (nextSafetyState === "CRITICAL" && (!stateChanged) && (zs.riskScore !== risk.score || zs.occupied !== occupancy)) {
      realtime.emit("PRIORITY_QUEUE_UPDATED", {
        event_id: id(), event_type: "PRIORITY_QUEUE_UPDATED", occurred_at: now.toISOString(),
        data: {}, version: newStaleVersion,
      });
    }

    if (command) {
      realtime.emit("ACTUATOR_COMMAND_UPDATED", {
        event_id: id(), event_type: "ACTUATOR_COMMAND_UPDATED", occurred_at: now.toISOString(),
        data: { command, zone_code: zoneCode }, version: newStaleVersion,
      });
    }
  } else {
    // Late reading: don't alter authoritative state broadcast, just announce a late reading
    realtime.emit("ZONE_READING_UPDATED", {
      event_id: id(),
      event_type: "ZONE_READING_UPDATED",
      occurred_at: now.toISOString(),
      data: { zone: updatedZone, riskComponents: zs.riskComponents }, // fallback to prev state
      version: zs.stateVersion,
    });
  }

  log("READING_ACCEPTED", { zone_code: zoneCode, risk_score: risk.score, state: nextSafetyState, late: isLate, warming_up: warmingUp });

  return {
    accepted: true,
    duplicate: false,
    reading_id: newReadingId,
    zone: {
      safety_state: isLate ? zs.safetyState : nextSafetyState,
      connectivity_state: isLate ? zs.connectivityState : connectivityState,
      risk_score: isLate ? zs.riskScore : risk.score,
      state_version: isLate ? zs.stateVersion : newStaleVersion,
    },
    command: command ? {
      command_id: (command as ActuatorCommand).id,
      state_version: (command as ActuatorCommand).stateVersion,
      led: (command as ActuatorCommand).led,
      buzzer: (command as ActuatorCommand).buzzer,
      relay_cutoff: (command as ActuatorCommand).relayCutoff,
    } : null,
  };
}
