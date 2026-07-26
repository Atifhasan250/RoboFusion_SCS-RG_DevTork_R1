import "dotenv/config";
import { collections } from "../../src/server/db/collections";
import { assertTestDatabase } from "../../src/server/db/test-safety";
import { env } from "../../src/server/config/env";
import { hashSecret } from "../../src/server/utils/id";
import { ingest } from "../../src/server/services/ingestion-service";
import { acknowledge } from "../../src/server/services/incident-service";

async function main() {
  assertTestDatabase();
  const c = await collections();
  await Promise.all([
    c.acknowledgments.deleteMany({}), c.incident_events.deleteMany({}), c.incidents.deleteMany({}),
    c.actuator_commands.deleteMany({}), c.readings.deleteMany({}), c.zone_states.deleteMany({}),
    c.zones.deleteMany({}), c.users.deleteMany({ id: { $in: ["race-user-a", "race-user-b"] } }),
  ]);

  const now = new Date();
  await c.zones.insertOne({
    id: "race-zone", code: "IOT_LAB", name: "IoT Lab", configured: true,
    apiKeyHash: hashSecret("IOT_LAB-demo-key", env.ZONE_API_KEY_PEPPER),
    state: "SAFE", riskScore: 0, primaryHazard: null, occupancy: false, cameraOccupancy: false,
    connectivityState: "OFFLINE", lastReadingAt: null, lastSequence: null, commandVersion: 0,
    createdAt: now, updatedAt: now,
  });
  await c.users.insertMany([
    { id: "race-user-a", email: "race-a@scs.local", name: "Race A", passwordHash: "test-only", role: "ADMIN", active: true, createdAt: now },
    { id: "race-user-b", email: "race-b@scs.local", name: "Race B", passwordHash: "test-only", role: "SECURITY_STAFF", active: true, createdAt: now },
  ]);

  const payload = (sequence: number) => ({
    bootId: "race-boot", sequence, timestamp: new Date(), fire: false, gas: 4095, water: 0, pir: true,
    sensorHealth: "HEALTHY" as const,
    sensorStatus: { fire: "ONLINE" as const, gas: "ONLINE" as const, water: "ONLINE" as const, pir: "ONLINE" as const },
    deviceUptimeSeconds: 120, sampleIntervalMs: 200,
  });
  await ingest("IOT_LAB", "IOT_LAB-demo-key", payload(1));
  await ingest("IOT_LAB", "IOT_LAB-demo-key", payload(2));
  const incident = await c.incidents.findOne({ zoneId: "race-zone", active: true });
  if (!incident) throw new Error("Could not create an open incident for the acknowledgment race test");

  const outcomes = await Promise.allSettled([
    acknowledge(incident.id, "race-user-a"),
    acknowledge(incident.id, "race-user-b"),
  ]);
  const fulfilled = outcomes.filter(result => result.status === "fulfilled");
  const rejected = outcomes.filter(result => result.status === "rejected");
  const stored = await c.acknowledgments.find({ incidentId: incident.id }).toArray();
  const finalIncident = await c.incidents.findOne({ id: incident.id });

  if (fulfilled.length !== 1 || rejected.length !== 1 || stored.length !== 1 || finalIncident?.status !== "ACKNOWLEDGED") {
    throw new Error(`Race failure: fulfilled=${fulfilled.length}, rejected=${rejected.length}, stored=${stored.length}, status=${finalIncident?.status}`);
  }
  console.log("✓ Acknowledgment race passed: exactly one winner, one conflict, one durable acknowledgment.");
}

main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
