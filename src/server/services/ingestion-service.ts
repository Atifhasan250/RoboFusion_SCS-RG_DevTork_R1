import type { ClientSession, MongoServerError } from "mongodb";
import type { z } from "zod";
import { collections } from "../db/collections";
import { mongoClient } from "../db/client";
import { env } from "../config/env";
import { hashSecret, id, safeEqual } from "../utils/id";
import { calculateRisk, normalize, applyHysteresis, RISK_WEIGHTS } from "../risk/engine";
import { realtime } from "../realtime/hub";
import { log } from "../utils/logger";
import {
  actuatorStateChanged,
  allocateCommandVersion,
  buildActuatorCommand,
  outputForState,
} from "./command-service";
import type {
  ActuatorCommand,
  ConnectivityState,
  HazardType,
  Incident,
  IncidentEvent,
  SafetyState,
  SensorCalibration,
  ZoneStateDoc,
} from "../types";
import { readingSchema } from "../validation/schemas";

type Payload = z.output<typeof readingSchema>;
type PayloadInput = z.input<typeof readingSchema>;


export interface IngestionResult {
  accepted: boolean;
  duplicate: boolean;
  reading_id?: string;
  zone: {
    safety_state: SafetyState;
    connectivity_state: ConnectivityState;
    risk_score: number;
    state_version: number;
  };
  command: {
    command_id: string;
    command_version: number;
    led: ActuatorCommand["led"];
    buzzer: boolean;
    relay_cutoff: boolean;
  } | null;
}

export class IngestionError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

const GAS_BASELINE = 1200;
const GAS_CRITICAL = 3000;
const WATER_DRY = 0;
const WATER_CRITICAL = 80;
const FIRE_DEBOUNCE = 5;
const FIRE_CLEAR = 3;
const MAX_RETRIES = 4;

function statusFor(data: Payload, sensor: "fire" | "gas" | "water" | "pir"): SensorCalibration["status"] {
  if (data.sensorHealth === "OFFLINE") return "OFFLINE";
  const status = data.sensorStatus?.[sensor];
  if (status === "ONLINE" || status === "OFFLINE" || status === "DEGRADED" || status === "WARMING_UP" || status === "NOT_CONFIGURED") {
    return status;
  }
  if (sensor === "gas" && data.deviceUptimeSeconds < 30) return "WARMING_UP";
  return data.sensorHealth === "DEGRADED" ? "DEGRADED" : "ONLINE";
}

function priorFactor(component: number, weight: number): number {
  return Math.max(0, Math.min(1, component / weight));
}

function buildEvent(
  type: IncidentEvent["eventType"],
  zoneId: string,
  incidentId: string | null,
  description: string,
  metadata: Record<string, unknown> = {},
  source: IncidentEvent["eventSource"] = "BACKEND",
  actorUserId: string | null = null,
  occurredAt = new Date(),
): Omit<IncidentEvent, "_id"> {
  return {
    id: id(),
    incidentId,
    zoneId,
    eventType: type,
    eventSource: source,
    actorUserId,
    description,
    metadata,
    occurredAt,
  };
}

function duplicateIndexError(error: unknown): error is MongoServerError {
  return !!error && typeof error === "object" && "code" in error && (error as { code?: number }).code === 11000;
}

function transientTransactionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { hasErrorLabel?: (label: string) => boolean; code?: number };
  return candidate.hasErrorLabel?.("TransientTransactionError") === true
    || candidate.hasErrorLabel?.("UnknownTransactionCommitResult") === true
    || candidate.code === 112;
}

async function duplicateResponse(zoneCode: string, data: Payload): Promise<IngestionResult | null> {
  const c = await collections();
  const zone = await c.zones.findOne({ code: zoneCode });
  if (!zone) return null;
  const reading = await c.readings.findOne({ zoneId: zone.id, bootId: data.bootId, sequence: data.sequence });
  if (!reading) return null;
  const [state, latestCommand] = await Promise.all([
    c.zone_states.findOne({ zoneId: zone.id }),
    c.actuator_commands.findOne({ zoneId: zone.id }, { sort: { commandVersion: -1 } }),
  ]);
  return {
    accepted: true,
    duplicate: true,
    reading_id: reading.id,
    zone: {
      safety_state: state?.safetyState ?? (zone.state === "OFFLINE" || zone.state === "NOT_CONFIGURED" ? "SAFE" : zone.state),
      connectivity_state: state?.connectivityState ?? zone.connectivityState,
      risk_score: state?.riskScore ?? zone.riskScore,
      state_version: state?.stateVersion ?? 0,
    },
    command: latestCommand ? {
      command_id: latestCommand.id,
      command_version: latestCommand.commandVersion,
      led: latestCommand.led,
      buzzer: latestCommand.buzzer,
      relay_cutoff: latestCommand.relayCutoff,
    } : null,
  };
}

function defaultZoneState(zoneId: string, now: Date): Omit<ZoneStateDoc, "_id"> {
  return {
    zoneId,
    safetyState: "SAFE",
    connectivityState: "OFFLINE",
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
    recentRiskScores: [],
    isTrendingCritical: false,
    firePositiveCount: 0,
    fireClearCount: 0,
    fireConfirmed: false,
    fireConfirmedAt: null,
    stateVersion: 0,
    updatedAt: now,
  };
}

async function updateSensorStatus(
  session: ClientSession,
  zoneId: string,
  data: Payload,
  now: Date,
) {
  const c = await collections();
  const mapping = [
    ["FIRE", "fire"],
    ["GAS", "gas"],
    ["WATER", "water"],
    ["PIR", "pir"],
  ] as const;

  await c.sensors.bulkWrite(mapping.map(([sensorType, payloadKey]) => {
    const status = statusFor(data, payloadKey);
    return {
      updateOne: {
        filter: { zoneId, sensorType },
        update: {
          $set: {
            status,
            ...(status !== "OFFLINE" && status !== "NOT_CONFIGURED" ? { lastSeenAt: now } : {}),
            updatedAt: now,
          },
        },
        upsert: false,
      },
    };
  }), { session, ordered: false });
}

export async function ingest(zoneCode: string, key: string | null, input: PayloadInput): Promise<IngestionResult> {
  const data = readingSchema.parse(input);
  let attempt = 0;
  while (true) {
    try {
      return await doIngest(zoneCode, key, data);
    } catch (error) {
      if (duplicateIndexError(error)) {
        const duplicate = await duplicateResponse(zoneCode, data);
        if (duplicate) return duplicate;
      }

      const retryable = transientTransactionError(error)
        || (error instanceof IngestionError && error.code === "CONCURRENT_UPDATE")
        || duplicateIndexError(error);

      if (retryable && attempt < MAX_RETRIES) {
        attempt += 1;
        await new Promise(resolve => setTimeout(resolve, 20 * attempt));
        continue;
      }
      if (duplicateIndexError(error)) {
        throw new IngestionError(409, "CONCURRENT_UPDATE", "Concurrent write collision could not be resolved");
      }
      throw error;
    }
  }
}

async function doIngest(zoneCode: string, key: string | null, data: Payload): Promise<IngestionResult> {
  const c = await collections();
  const zone = await c.zones.findOne({ code: zoneCode });
  if (!zone || !zone.configured) {
    throw new IngestionError(404, "UNKNOWN_ZONE", "Zone is not registered or configured");
  }
  if (!key || !zone.apiKeyHash || !safeEqual(zone.apiKeyHash, hashSecret(key, env.ZONE_API_KEY_PEPPER))) {
    throw new IngestionError(401, "INVALID_ZONE_KEY", "Zone API key rejected");
  }

  const existing = await c.readings.findOne({ zoneId: zone.id, bootId: data.bootId, sequence: data.sequence });
  if (existing) {
    log("READING_DUPLICATE", { zone_code: zoneCode, sequence: data.sequence });
    const duplicate = await duplicateResponse(zoneCode, data);
    if (!duplicate) throw new IngestionError(409, "DUPLICATE_LOOKUP_FAILED", "Duplicate reading exists but could not be reloaded");
    return duplicate;
  }

  const now = new Date();
  const stateResult = await c.zone_states.findOneAndUpdate(
    { zoneId: zone.id },
    { $setOnInsert: defaultZoneState(zone.id, now) },
    { upsert: true, returnDocument: "after" },
  );
  if (!stateResult) throw new IngestionError(500, "STATE_BOOTSTRAP_FAILED", "Could not initialize zone state");
  const zs = stateResult;

  const isLate = !!(zs.lastObservedAt && data.timestamp < zs.lastObservedAt);
  const warmingUp = data.deviceUptimeSeconds < 30;
  const requiredSensorUnavailable = (["fire", "gas", "water", "pir"] as const).some(sensor => {
    const status = data.sensorStatus?.[sensor];
    return status === "OFFLINE" || status === "NOT_CONFIGURED";
  });
  const connectivityState: ConnectivityState = data.sensorHealth === "OFFLINE" || requiredSensorUnavailable
    ? "OFFLINE"
    : data.sensorHealth === "DEGRADED" ? "DEGRADED" : "ONLINE";
  const connectivityChanged = connectivityState !== zs.connectivityState;
  const reconnected = zs.connectivityState === "OFFLINE" && connectivityState !== "OFFLINE";
  const explicitlyOffline = connectivityState === "OFFLINE" && zs.connectivityState !== "OFFLINE";

  let firePositiveCount = zs.firePositiveCount;
  let fireClearCount = zs.fireClearCount;
  let fireConfirmed = zs.fireConfirmed;
  let fireConfirmedAt = zs.fireConfirmedAt;
  const fireOnline = statusFor(data, "fire") !== "OFFLINE" && connectivityState !== "OFFLINE";

  if (!isLate && fireOnline) {
    if (data.fire) {
      firePositiveCount = Math.min(FIRE_DEBOUNCE, firePositiveCount + 1);
      fireClearCount = 0;
      if (!fireConfirmed && firePositiveCount >= FIRE_DEBOUNCE) {
        fireConfirmed = true;
        fireConfirmedAt = now;
      }
    } else {
      fireClearCount += 1;
      firePositiveCount = Math.max(0, firePositiveCount - 1);
      if (fireConfirmed && fireClearCount >= FIRE_CLEAR) {
        fireConfirmed = false;
        fireConfirmedAt = null;
        firePositiveCount = 0;
        fireClearCount = 0;
      }
    }
  }

  let gasFactor = statusFor(data, "gas") === "OFFLINE"
    ? priorFactor(zs.riskComponents.gas, RISK_WEIGHTS.gas)
    : warmingUp ? 0 : normalize(data.gas - GAS_BASELINE, GAS_CRITICAL - GAS_BASELINE);
  let waterFactor = statusFor(data, "water") === "OFFLINE"
    ? priorFactor(zs.riskComponents.water, RISK_WEIGHTS.water)
    : normalize(data.water - WATER_DRY, WATER_CRITICAL - WATER_DRY);
  let occupancy = statusFor(data, "pir") === "OFFLINE"
    ? (data.cameraOccupancy === true ? true : zs.occupied)
    : (data.pir || data.cameraOccupancy === true);

  let calculatedRisk = calculateRisk({ fireConfirmed, gasFactor, waterFactor, occupancy });

  // An explicit sensor-node OFFLINE report is not valid evidence that the zone became safe.
  if (connectivityState === "OFFLINE") {
    firePositiveCount = zs.firePositiveCount;
    fireClearCount = zs.fireClearCount;
    fireConfirmed = zs.fireConfirmed;
    fireConfirmedAt = zs.fireConfirmedAt;
    gasFactor = priorFactor(zs.riskComponents.gas, RISK_WEIGHTS.gas);
    waterFactor = priorFactor(zs.riskComponents.water, RISK_WEIGHTS.water);
    occupancy = zs.occupied;
    calculatedRisk = {
      score: zs.riskScore,
      components: zs.riskComponents,
      state: zs.safetyState,
      primaryHazard: zs.primaryHazard,
    };
  }

  const fireJustConfirmed = fireConfirmed && !zs.fireConfirmed;
  let consecutiveWarningReadings = zs.consecutiveWarningReadings;
  let consecutiveCriticalReadings = zs.consecutiveCriticalReadings;
  let consecutiveSafeReadings = zs.consecutiveSafeReadings;
  let recoverySince = zs.recoverySince;

  if (!isLate && connectivityState !== "OFFLINE") {
    if (zs.safetyState === "CRITICAL" && calculatedRisk.score < 55) {
      recoverySince ??= now;
    } else if (zs.safetyState === "WARNING" && calculatedRisk.score < 25) {
      recoverySince ??= now;
    } else {
      recoverySince = null;
    }

    if (calculatedRisk.score >= 65) {
      consecutiveCriticalReadings += 1;
      consecutiveWarningReadings += 1;
      consecutiveSafeReadings = 0;
    } else if (calculatedRisk.score >= 30) {
      consecutiveWarningReadings += 1;
      consecutiveCriticalReadings = 0;
      consecutiveSafeReadings = 0;
    } else {
      consecutiveSafeReadings += 1;
      consecutiveWarningReadings = 0;
      consecutiveCriticalReadings = 0;
    }
  }

  const recoveryStableMs = recoverySince ? now.getTime() - recoverySince.getTime() : 0;
  let nextSafetyState: SafetyState = connectivityState === "OFFLINE"
    ? zs.safetyState
    : applyHysteresis({
      currentState: zs.safetyState,
      newRiskScore: calculatedRisk.score,
      consecutiveAboveThreshold: calculatedRisk.score >= 65 ? consecutiveCriticalReadings : consecutiveWarningReadings,
      consecutiveBelowThreshold: consecutiveSafeReadings,
      recoveryStableMs,
      fireJustConfirmed,
    });

  if (zs.safetyState === "CRITICAL" && nextSafetyState === "SAFE" && recoveryStableMs < 5_000) {
    nextSafetyState = "WARNING";
  }

  const recentRiskScores = connectivityState === "OFFLINE" || isLate
    ? zs.recentRiskScores
    : [...zs.recentRiskScores, calculatedRisk.score].slice(-5);
  const isTrendingCritical = recentRiskScores.length === 5
    && recentRiskScores[4] - recentRiskScores[0] >= 15
    && calculatedRisk.score >= 40
    && calculatedRisk.score < 65;

  const stateChanged = nextSafetyState !== zs.safetyState;
  const stateVersion = zs.stateVersion + 1;
  const readingId = id();
  const fireFactor = fireConfirmed ? 1 : 0;
  const occupancyFactor = occupancy ? 1 : 0;

  const client = await mongoClient();
  const session = client.startSession();
  let activeIncidentAfter: Incident | null = null;
  let command: ActuatorCommand | null = null;
  let incidentOpened = false;
  let incidentResolved = false;
  let resolvedIncidentId: string | null = null;

  try {
    await session.withTransaction(async () => {
      await c.readings.insertOne({
        id: readingId,
        zoneId: zone.id,
        bootId: data.bootId,
        sequence: data.sequence,
        receivedAt: now,
        observedAt: data.timestamp,
        uptimeMs: data.deviceUptimeSeconds * 1000,
        sampleIntervalMs: data.sampleIntervalMs,
        replayed: data.replayed,
        replayBatchLast: data.replayBatchLast,
        fire: data.fire,
        gas: data.gas,
        water: data.water,
        pir: data.pir,
        cameraOccupancy: data.cameraOccupancy ?? null,
        sensorHealth: data.sensorHealth,
        sensorStatus: data.sensorStatus ?? {},
        fireFactor,
        gasFactor,
        waterFactor,
        occupancyFactor,
        riskScore: calculatedRisk.score,
        riskComponents: calculatedRisk.components,
        calculatedState: nextSafetyState,
        primaryHazard: calculatedRisk.primaryHazard,
        isLate,
        isWarmingUp: warmingUp,
        normalized: { gas: gasFactor, water: waterFactor, occupancy: occupancyFactor },
      }, { session });

      if (isLate) return;

      await updateSensorStatus(session, zone.id, data, now);

      const zoneStateUpdate: Partial<ZoneStateDoc> = {
        safetyState: nextSafetyState,
        connectivityState,
        riskScore: calculatedRisk.score,
        riskComponents: calculatedRisk.components,
        primaryHazard: calculatedRisk.primaryHazard,
        occupied: occupancy,
        lastReadingId: readingId,
        lastObservedAt: data.timestamp,
        lastReceivedAt: now,
        warningSince: nextSafetyState === "WARNING"
          ? (zs.safetyState === "WARNING" ? zs.warningSince : now)
          : null,
        criticalSince: nextSafetyState === "CRITICAL"
          ? (zs.safetyState === "CRITICAL" ? zs.criticalSince : now)
          : null,
        recoverySince,
        consecutiveWarningReadings,
        consecutiveCriticalReadings,
        consecutiveSafeReadings,
        recentRiskScores,
        isTrendingCritical,
        firePositiveCount,
        fireClearCount,
        fireConfirmed,
        fireConfirmedAt,
        stateVersion,
        updatedAt: now,
      };

      const stateUpdate = await c.zone_states.updateOne(
        { zoneId: zone.id, stateVersion: zs.stateVersion },
        { $set: zoneStateUpdate },
        { session },
      );
      if (stateUpdate.matchedCount !== 1) {
        throw new IngestionError(409, "CONCURRENT_UPDATE", "Zone state was modified concurrently");
      }

      const zoneUpdate = await c.zones.updateOne(
        { id: zone.id, configured: true },
        { $set: {
          state: nextSafetyState,
          riskScore: calculatedRisk.score,
          primaryHazard: calculatedRisk.primaryHazard,
          occupancy,
          cameraOccupancy: data.cameraOccupancy ?? zone.cameraOccupancy ?? false,
          connectivityState,
          lastReadingAt: data.timestamp,
          lastSequence: data.sequence,
          updatedAt: now,
        } },
        { session },
      );
      if (zoneUpdate.matchedCount !== 1) {
        throw new IngestionError(409, "ZONE_ARCHIVED_DURING_INGEST", "Zone was archived while the reading was being processed");
      }

      let activeIncident = await c.incidents.findOne({ zoneId: zone.id, active: true }, { session });

      if (nextSafetyState === "CRITICAL" && !activeIncident) {
        const newIncident: Omit<Incident, "_id"> = {
          id: id(),
          zoneId: zone.id,
          status: "OPEN",
          active: true,
          severity: "CRITICAL",
          primaryHazard: calculatedRisk.primaryHazard,
          initialRiskScore: calculatedRisk.score,
          peakRiskScore: calculatedRisk.score,
          startedAt: now,
          acknowledgedAt: null,
          acknowledgedBy: null,
          resolvedAt: null,
          resolutionReason: null,
          version: 1,
          createdAt: now,
          updatedAt: now,
          openedAt: now,
          riskScore: calculatedRisk.score,
          hazard: calculatedRisk.primaryHazard,
        };
        await c.incidents.insertOne(newIncident, { session });
        activeIncident = newIncident as Incident;
        incidentOpened = true;
        await c.incident_events.insertOne(buildEvent(
          "INCIDENT_OPENED",
          zone.id,
          newIncident.id,
          `Incident opened: ${calculatedRisk.primaryHazard} risk score ${calculatedRisk.score}`,
          { riskScore: calculatedRisk.score, hazard: calculatedRisk.primaryHazard, source: "SENSOR_TRIGGER" },
          "SENSOR",
          null,
          now,
        ), { session });
        await c.audits.insertOne({ id: id(), type: "INCIDENT_OPENED", zoneId: zone.id, incidentId: newIncident.id, createdAt: now }, { session });
      } else if (activeIncident) {
        if (calculatedRisk.score > activeIncident.peakRiskScore) {
          await c.incidents.updateOne(
            { id: activeIncident.id },
            { $set: { peakRiskScore: calculatedRisk.score, riskScore: calculatedRisk.score, updatedAt: now } },
            { session },
          );
        }

        // A WARNING state remains an active incident. Only confirmed SAFE closes it.
        if (nextSafetyState === "SAFE") {
          const resolved = await c.incidents.findOneAndUpdate(
            { id: activeIncident.id, active: true, status: { $in: ["OPEN", "ACKNOWLEDGED"] } },
            { $set: {
              status: "RESOLVED",
              active: false,
              resolvedAt: now,
              resolutionReason: "Sensor risk recovered to SAFE",
              updatedAt: now,
            }, $inc: { version: 1 } },
            { session, returnDocument: "after" },
          );
          if (resolved) {
            await c.incident_events.insertOne(buildEvent(
              "INCIDENT_RESOLVED",
              zone.id,
              activeIncident.id,
              `Incident resolved: zone returned to SAFE with risk ${calculatedRisk.score}`,
              { riskScore: calculatedRisk.score, previousState: zs.safetyState, nextSafetyState },
              "SENSOR",
              null,
              now,
            ), { session });
            await c.audits.insertOne({ id: id(), type: "INCIDENT_RESOLVED", zoneId: zone.id, incidentId: activeIncident.id, createdAt: now }, { session });
            incidentResolved = true;
            resolvedIncidentId = activeIncident.id;
            activeIncident = null;
          }
        }
      }
      activeIncidentAfter = activeIncident;

      if (stateChanged) {
        const eventType: Record<SafetyState, IncidentEvent["eventType"]> = {
          SAFE: "ZONE_SAFE",
          WARNING: "ZONE_WARNING",
          CRITICAL: "ZONE_CRITICAL",
        };
        await c.incident_events.insertOne(buildEvent(
          eventType[nextSafetyState as SafetyState],
          zone.id,
          activeIncident?.id ?? resolvedIncidentId,
          `Zone transitioned from ${zs.safetyState} to ${nextSafetyState}`,
          { previousState: zs.safetyState, nextSafetyState, riskScore: calculatedRisk.score },
          "SENSOR",
          null,
          now,
        ), { session });
      }

      if (explicitlyOffline) {
        await c.incident_events.insertOne(buildEvent(
          "SENSOR_OFFLINE",
          zone.id,
          activeIncident?.id ?? null,
          `Zone ${zone.code} reported its required sensor set OFFLINE`,
          { sensorStatus: data.sensorStatus ?? {}, preservedSafetyState: nextSafetyState, preservedRiskScore: calculatedRisk.score },
          "SENSOR",
          null,
          now,
        ), { session });
      } else if (reconnected) {
        await c.incident_events.insertOne(buildEvent(
          "ZONE_RECONNECTED",
          zone.id,
          activeIncident?.id ?? null,
          `Zone ${zone.code} reconnected and resumed valid readings`,
          { previousConnectivity: zs.connectivityState, connectivityState },
          "SENSOR",
          null,
          now,
        ), { session });
      }

      if (data.replayed && data.replayBatchLast) {
        await c.incident_events.insertOne(buildEvent(
          "CACHED_READINGS_SYNCED",
          zone.id,
          activeIncident?.id ?? null,
          `Zone ${zone.code} completed cached-reading synchronization`,
          { bootId: data.bootId, sequence: data.sequence },
          "SENSOR",
          null,
          now,
        ), { session });
      }

      await c.manual_overrides.updateMany(
        { zoneId: zone.id, active: true, expiresAt: { $lte: now } },
        { $set: { active: false, status: "EXPIRED", clearedAt: now } },
        { session },
      );
      const activeOverride = await c.manual_overrides.findOne({ zoneId: zone.id, active: true, expiresAt: { $gt: now } }, { session });
      const previousCommand = await c.actuator_commands.findOne({ zoneId: zone.id }, { session, sort: { commandVersion: -1 } });
      const baseOutput = outputForState(nextSafetyState, connectivityState);
      let led = baseOutput.led;
      let buzzer = baseOutput.buzzer;
      let relayCutoff = baseOutput.relayCutoff;

      if (activeOverride?.action === "SILENCE") {
        buzzer = false;
      } else if (activeOverride?.action === "TEST_ACTUATOR") {
        led = "RED";
        buzzer = true;
        relayCutoff = true;
      }

      const candidate = {
        safetyState: baseOutput.commandState,
        led,
        buzzer,
        relayCutoff,
      };
      if (actuatorStateChanged(previousCommand, candidate)) {
        const commandVersion = await allocateCommandVersion(zone.id, session);
        const newCommand = buildActuatorCommand({
          zoneId: zone.id,
          incident: activeIncident,
          commandVersion,
          safetyState: nextSafetyState,
          connectivityState,
          source: "SENSOR_STATE",
          led,
          buzzer,
          relayCutoff,
          now,
        });
        await c.actuator_commands.insertOne(newCommand, { session });
        command = newCommand as ActuatorCommand;
      } else {
        command = previousCommand;
      }
    });
  } finally {
    await session.endSession();
  }

  const committedCommand = command as ActuatorCommand | null;
  const updatedZone = await c.zones.findOne({ id: zone.id }, { projection: { _id: 0, apiKeyHash: 0 } });
  if (!isLate) {
    const eventName = stateChanged ? "ZONE_STATE_CHANGED" : "ZONE_READING_UPDATED";
    realtime.emit(eventName, {
      event_id: id(),
      event_type: eventName,
      occurred_at: now.toISOString(),
      data: { zone: updatedZone, riskComponents: calculatedRisk.components },
      version: stateVersion,
    });

    if (connectivityChanged) {
      realtime.emit("ZONE_CONNECTIVITY_CHANGED", {
        event_id: id(),
        event_type: "ZONE_CONNECTIVITY_CHANGED",
        occurred_at: now.toISOString(),
        data: { zone_id: zone.id, zone_code: zone.code, connectivity_state: connectivityState },
        version: stateVersion,
      });
    }

    if (isTrendingCritical && !zs.isTrendingCritical) {
      realtime.emit("TREND_CRITICAL", {
        event_id: id(),
        event_type: "TREND_CRITICAL",
        occurred_at: now.toISOString(),
        data: { zone: updatedZone },
        version: stateVersion,
      });
    }

    if (incidentOpened && activeIncidentAfter) {
      realtime.emit("INCIDENT_CREATED", {
        event_id: id(),
        event_type: "INCIDENT_CREATED",
        occurred_at: now.toISOString(),
        data: { incident: activeIncidentAfter, zone: updatedZone },
        version: stateVersion,
      });
    }
    if (incidentResolved) {
      realtime.emit("INCIDENT_RESOLVED", {
        event_id: id(),
        event_type: "INCIDENT_RESOLVED",
        occurred_at: now.toISOString(),
        data: { zone_id: zone.id, zone_code: zone.code, incident_id: resolvedIncidentId },
        version: stateVersion,
      });
    }
    if (incidentOpened || incidentResolved || nextSafetyState === "CRITICAL") {
      realtime.emit("PRIORITY_QUEUE_UPDATED", {
        event_id: id(),
        event_type: "PRIORITY_QUEUE_UPDATED",
        occurred_at: now.toISOString(),
        data: {},
        version: stateVersion,
      });
    }
    if (data.replayed && data.replayBatchLast) {
      realtime.emit("CACHED_READINGS_SYNCED", {
        event_id: id(),
        event_type: "CACHED_READINGS_SYNCED",
        occurred_at: now.toISOString(),
        data: { zone_id: zone.id, zone_code: zone.code, sequence: data.sequence },
        version: stateVersion,
      });
    }
    if (committedCommand) {
      realtime.emit("ACTUATOR_COMMAND_UPDATED", {
        event_id: id(),
        event_type: "ACTUATOR_COMMAND_UPDATED",
        occurred_at: now.toISOString(),
        data: { command: committedCommand, zone_code: zoneCode },
        version: stateVersion,
      });
    }
  } else {
    realtime.emit("ZONE_READING_UPDATED", {
      event_id: id(),
      event_type: "ZONE_READING_UPDATED",
      occurred_at: now.toISOString(),
      data: { zone: updatedZone, late: true, replayed: data.replayed },
      version: zs.stateVersion,
    });
  }

  log("READING_ACCEPTED", {
    zone_code: zoneCode,
    risk_score: isLate ? zs.riskScore : calculatedRisk.score,
    state: isLate ? zs.safetyState : nextSafetyState,
    connectivity: isLate ? zs.connectivityState : connectivityState,
    late: isLate,
    replayed: data.replayed,
    warming_up: warmingUp,
  });

  return {
    accepted: true,
    duplicate: false,
    reading_id: readingId,
    zone: {
      safety_state: isLate ? zs.safetyState : nextSafetyState,
      connectivity_state: isLate ? zs.connectivityState : connectivityState,
      risk_score: isLate ? zs.riskScore : calculatedRisk.score,
      state_version: isLate ? zs.stateVersion : stateVersion,
    },
    command: committedCommand ? {
      command_id: committedCommand.id,
      command_version: committedCommand.commandVersion,
      led: committedCommand.led,
      buzzer: committedCommand.buzzer,
      relay_cutoff: committedCommand.relayCutoff,
    } : null,
  };
}
