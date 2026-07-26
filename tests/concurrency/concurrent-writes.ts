/**
 * Ten simultaneous transactional writes across the five official zones.
 * Uses .env.test through scripts/run-with-test-env.mjs and never calls the main/demo server.
 */
import "dotenv/config";
import { collections } from "../../src/server/db/collections";
import { assertTestDatabase } from "../../src/server/db/test-safety";
import { env } from "../../src/server/config/env";
import { hashSecret } from "../../src/server/utils/id";
import { ingest } from "../../src/server/services/ingestion-service";

const ZONES = ["IOT_LAB", "ROBOTICS_LAB", "SERVER_ROOM", "DATA_SCIENCE_LAB", "SOFTWARE_LAB"] as const;

async function prepare() {
  assertTestDatabase();
  const c = await collections();
  await Promise.all([
    c.zones.deleteMany({}), c.zone_states.deleteMany({}), c.readings.deleteMany({}),
    c.incidents.deleteMany({}), c.incident_events.deleteMany({}), c.actuator_commands.deleteMany({}),
    c.acknowledgments.deleteMany({}), c.manual_overrides.deleteMany({}),
  ]);
  const now = new Date();
  await c.zones.insertMany(ZONES.map(code => ({
    id: `concurrency-${code}`,
    code,
    name: code.replaceAll("_", " "),
    configured: true,
    apiKeyHash: hashSecret(`${code}-demo-key`, env.ZONE_API_KEY_PEPPER),
    state: "SAFE" as const,
    riskScore: 0,
    primaryHazard: null,
    occupancy: false,
    cameraOccupancy: false,
    connectivityState: "OFFLINE" as const,
    lastReadingAt: null,
    lastSequence: null,
    commandVersion: 0,
    createdAt: now,
    updatedAt: now,
  })));
}

async function main() {
  await prepare();
  const c = await collections();
  const writes = Array.from({ length: 10 }, (_, index) => {
    const zoneCode = ZONES[index % ZONES.length];
    return ingest(zoneCode, `${zoneCode}-demo-key`, {
      bootId: "concurrency-test-boot",
      sequence: index + 1,
      timestamp: new Date(),
      fire: false,
      gas: index % 4 === 0 ? 3200 : 1200 + index * 10,
      water: index % 6 === 0 ? 85 : 0,
      pir: index % 3 === 0,
      sensorHealth: "HEALTHY",
      sensorStatus: { fire: "ONLINE", gas: "ONLINE", water: "ONLINE", pir: "ONLINE" },
      deviceUptimeSeconds: 120,
      sampleIntervalMs: 500,
    });
  });

  const started = Date.now();
  const outcomes = await Promise.allSettled(writes);
  const elapsed = Date.now() - started;
  const failures = outcomes.filter(outcome => outcome.status === "rejected");
  const stored = await c.readings.countDocuments({ bootId: "concurrency-test-boot" });
  const duplicateActive = await c.incidents.aggregate([
    { $match: { active: true } },
    { $group: { _id: "$zoneId", count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
  ]).toArray();

  if (failures.length || stored !== 10 || duplicateActive.length) {
    throw new Error(`Concurrency failure: rejected=${failures.length}, stored=${stored}, duplicate-active=${duplicateActive.length}`);
  }
  console.log(`✓ Ten simultaneous writes committed in ${elapsed} ms with no data loss or duplicate active incidents.`);
}

main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
