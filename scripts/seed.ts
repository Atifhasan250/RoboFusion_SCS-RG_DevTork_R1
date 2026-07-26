import "dotenv/config";
import bcrypt from "bcryptjs";
import { collections } from "../src/server/db/collections";
import { env } from "../src/server/config/env";
import { hashSecret, id } from "../src/server/utils/id";
import type { SensorCalibration, ZoneStateDoc } from "../src/server/types";

const ZONES = [
  ["IOT_LAB", "IoT Lab"],
  ["ROBOTICS_LAB", "Robotics Lab"],
  ["SERVER_ROOM", "Server Room"],
  ["DATA_SCIENCE_LAB", "Data Science Lab"],
  ["SOFTWARE_LAB", "Software Lab"],
] as const;

const SENSOR_DEFAULTS: Array<Omit<SensorCalibration, "_id" | "id" | "zoneId" | "createdAt" | "updatedAt">> = [
  {
    sensorType: "FIRE", rawMin: 0, rawMax: 1, baselineRaw: 0, criticalRaw: 1,
    direction: "ASCENDING", warmupSeconds: 0, debounceCount: 2,
    isRequired: true, isEnabled: true, status: "OFFLINE", lastSeenAt: null,
  },
  {
    sensorType: "GAS", rawMin: 0, rawMax: 4095, baselineRaw: 1200, criticalRaw: 3000,
    direction: "ASCENDING", warmupSeconds: 30, debounceCount: 1,
    isRequired: true, isEnabled: true, status: "OFFLINE", lastSeenAt: null,
  },
  {
    sensorType: "WATER", rawMin: 0, rawMax: 100, baselineRaw: 0, criticalRaw: 80,
    direction: "ASCENDING", warmupSeconds: 0, debounceCount: 1,
    isRequired: true, isEnabled: true, status: "OFFLINE", lastSeenAt: null,
  },
  {
    sensorType: "PIR", rawMin: 0, rawMax: 1, baselineRaw: 0, criticalRaw: 1,
    direction: "ASCENDING", warmupSeconds: 0, debounceCount: 2,
    isRequired: true, isEnabled: true, status: "OFFLINE", lastSeenAt: null,
  },
];

function initialState(zoneId: string, now: Date): Omit<ZoneStateDoc, "_id"> {
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

async function main() {
  const c = await collections();
  const now = new Date();

  for (const [code, name] of ZONES) {
    const proposedId = id();
    await c.zones.updateOne(
      { code },
      {
        $set: {
          name,
          configured: true,
          apiKeyHash: hashSecret(`${code}-demo-key`, env.ZONE_API_KEY_PEPPER),
          updatedAt: now,
        },
        $setOnInsert: {
          id: proposedId,
          code,
          state: "SAFE",
          riskScore: 0,
          primaryHazard: null,
          occupancy: false,
          cameraOccupancy: false,
          connectivityState: "OFFLINE",
          lastReadingAt: null,
          lastSequence: null,
          commandVersion: 0,
          createdAt: now,
        },
      },
      { upsert: true },
    );

    const zone = await c.zones.findOne({ code });
    if (!zone) throw new Error(`Failed to seed ${code}`);

    // Repair fields that were absent in earlier seed versions without resetting live state.
    await c.zones.updateOne(
      { id: zone.id },
      {
        $set: {
          ...(zone.connectivityState === undefined ? { connectivityState: "OFFLINE" as const } : {}),
          ...(zone.lastReadingAt === undefined ? { lastReadingAt: null } : {}),
          ...(zone.lastSequence === undefined ? { lastSequence: null } : {}),
          ...(zone.commandVersion === undefined ? { commandVersion: 0 } : {}),
        },
      },
    );

    await c.zone_states.updateOne(
      { zoneId: zone.id },
      { $setOnInsert: initialState(zone.id, now) },
      { upsert: true },
    );

    for (const sensor of SENSOR_DEFAULTS) {
      const { status, lastSeenAt, ...calibration } = sensor;
      await c.sensors.updateOne(
        { zoneId: zone.id, sensorType: sensor.sensorType },
        {
          // Update static calibration without erasing live health on every deploy.
          $set: {
            ...calibration,
            updatedAt: now,
          },
          $setOnInsert: {
            id: id(),
            zoneId: zone.id,
            status,
            lastSeenAt,
            createdAt: now,
          },
        },
        { upsert: true },
      );
    }
  }

  // Keep the normal demonstration scope deterministic: running the main seed leaves
  // exactly the five official zones configured. Phantom/load-test zones are preserved
  // historically but archived until `npm run db:seed:phantoms` is run again.
  const officialCodes = ZONES.map(([code]) => code);
  const archivedZones = await c.zones.find({ code: { $nin: officialCodes }, configured: true }).toArray();
  if (archivedZones.length) {
    const archivedIds = archivedZones.map(zone => zone.id);
    await Promise.all([
      c.zones.updateMany(
        { id: { $in: archivedIds } },
        { $set: { configured: false, connectivityState: "NOT_CONFIGURED", updatedAt: now } },
      ),
      c.zone_states.updateMany(
        { zoneId: { $in: archivedIds } },
        { $set: { connectivityState: "NOT_CONFIGURED", updatedAt: now } },
      ),
      c.sensors.updateMany(
        { zoneId: { $in: archivedIds } },
        { $set: { status: "NOT_CONFIGURED", updatedAt: now } },
      ),
    ]);
  }

  // Repair older partial zone_states documents while preserving valid live values.
  const repairDefaults = initialState("placeholder", now);
  const states = await c.zone_states.find({}).toArray();
  for (const state of states) {
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(repairDefaults)) {
      if (key === "zoneId") continue;
      if ((state as unknown as Record<string, unknown>)[key] === undefined) patch[key] = value;
    }
    if (Object.keys(patch).length) await c.zone_states.updateOne({ zoneId: state.zoneId }, { $set: patch });
  }

  const password = "scs-grid"; // Hardcoded as requested
  const users = [
    ["admin@scs.local", "Campus Admin", "ADMIN"],
    ["staff@scs.local", "Security Staff", "SECURITY_STAFF"],
  ] as const;
  for (const [email, name, role] of users) {
    await c.users.updateOne(
      { email },
      {
        $set: { name, role, active: true, passwordHash: await bcrypt.hash(password, 12) },
        $setOnInsert: {
          id: id(),
          email,
          createdAt: now,
        },
      },
      { upsert: true },
    );
  }

  const officialZones = await c.zones.find({ code: { $in: ZONES.map(([code]) => code) }, configured: true }).toArray();
  const [zoneCount, sensorCount] = await Promise.all([
    Promise.resolve(officialZones.length),
    c.sensors.countDocuments({
      zoneId: { $in: officialZones.map(zone => zone.id) },
      sensorType: { $in: ["FIRE", "GAS", "WATER", "PIR"] },
    }),
  ]);
  console.log(`Seed complete: ${zoneCount} configured zones, ${sensorCount} core sensor records, 2 demo users.`);
}

main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
