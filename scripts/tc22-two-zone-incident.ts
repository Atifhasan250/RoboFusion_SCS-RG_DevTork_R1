import "dotenv/config";
import { collections } from "../src/server/db/collections";
import { assertTestDatabase } from "../src/server/db/test-safety";
import { env } from "../src/server/config/env";
import { hashSecret } from "../src/server/utils/id";
import { ingest } from "../src/server/services/ingestion-service";
import { acknowledge, incidentTimeline, priorityQueue } from "../src/server/services/incident-service";

const CODES = ["IOT_LAB", "ROBOTICS_LAB", "SERVER_ROOM", "DATA_SCIENCE_LAB", "SOFTWARE_LAB"] as const;

async function prepare() {
  assertTestDatabase();
  const c = await collections();
  await Promise.all([
    c.zones.deleteMany({}), c.zone_states.deleteMany({}), c.readings.deleteMany({}), c.incidents.deleteMany({}),
    c.incident_events.deleteMany({}), c.acknowledgments.deleteMany({}), c.actuator_commands.deleteMany({}),
    c.manual_overrides.deleteMany({}), c.natural_language_reports.deleteMany({}),
    c.users.deleteMany({ id: "tc22-security-user" }),
  ]);
  const now = new Date();
  await c.users.insertOne({
    id: "tc22-security-user", email: "tc22@scs.local", name: "TC22 Security",
    passwordHash: "test-only", role: "SECURITY_STAFF", active: true, createdAt: now,
  });
  for (const code of CODES) {
    await c.zones.insertOne({
      id: `tc22-${code}`, code, name: code.replaceAll("_", " "), configured: true,
      apiKeyHash: hashSecret(`${code}-demo-key`, env.ZONE_API_KEY_PEPPER),
      state: "SAFE", riskScore: 0, primaryHazard: null, occupancy: false, cameraOccupancy: false,
      connectivityState: "OFFLINE", lastReadingAt: null, lastSequence: null, commandVersion: 0,
      createdAt: now, updatedAt: now,
    });
  }
}

function payload(bootId: string, sequence: number, values: { gas?: number; water?: number; pir?: boolean } = {}) {
  return {
    bootId, sequence, timestamp: new Date(), fire: false,
    gas: values.gas ?? 1200, water: values.water ?? 0, pir: values.pir ?? false,
    sensorHealth: "HEALTHY" as const,
    sensorStatus: { fire: "ONLINE" as const, gas: "ONLINE" as const, water: "ONLINE" as const, pir: "ONLINE" as const },
    deviceUptimeSeconds: 120, sampleIntervalMs: 200,
  };
}

async function recover(code: string, bootId: string, sequence: number) {
  const c = await collections();
  await ingest(code, `${code}-demo-key`, payload(bootId, sequence, {}));
  await c.zone_states.updateOne({ zoneId: `tc22-${code}` }, { $set: { recoverySince: new Date(Date.now() - 6_000) } });
  await ingest(code, `${code}-demo-key`, payload(bootId, sequence + 1, {})); // CRITICAL -> WARNING
  const warningIncident = await c.incidents.findOne({ zoneId: `tc22-${code}` });
  if (!warningIncident?.active) throw new Error(`${code}: incident closed before SAFE`);
  await c.zone_states.updateOne({ zoneId: `tc22-${code}` }, { $set: { recoverySince: new Date(Date.now() - 6_000) } });
  await ingest(code, `${code}-demo-key`, payload(bootId, sequence + 2, {})); // WARNING -> SAFE
}

async function main() {
  await prepare();
  const c = await collections();
  console.log("TC22 — complete simultaneous two-zone incident flow");

  // Baseline five zones.
  for (const code of CODES) await ingest(code, `${code}-demo-key`, payload(`base-${code}`, 1));

  // IoT gets a fused gas+flood+occupancy event; Server Room gets gas+occupancy.
  await Promise.all([
    ingest("IOT_LAB", "IOT_LAB-demo-key", payload("tc22-iot", 1, { gas: 4095, water: 100, pir: true })),
    ingest("SERVER_ROOM", "SERVER_ROOM-demo-key", payload("tc22-server", 1, { gas: 4095, pir: true })),
  ]);
  await Promise.all([
    ingest("IOT_LAB", "IOT_LAB-demo-key", payload("tc22-iot", 2, { gas: 4095, water: 100, pir: true })),
    ingest("SERVER_ROOM", "SERVER_ROOM-demo-key", payload("tc22-server", 2, { gas: 4095, pir: true })),
  ]);

  const queue = await priorityQueue();
  if (queue.length !== 2) throw new Error(`Expected 2 critical zones, found ${queue.length}`);
  if (queue[0].zone_code !== "IOT_LAB") throw new Error(`Expected IOT_LAB first, found ${queue[0].zone_code}`);
  console.log(`✓ Priority: #1 ${queue[0].zone_code} (${queue[0].priority_score}), #2 ${queue[1].zone_code}`);

  const acknowledged = await acknowledge(queue[0].incident_id, "tc22-security-user");
  if (acknowledged?.status !== "ACKNOWLEDGED") throw new Error("Higher-priority incident was not acknowledged");
  console.log("✓ Higher-priority incident acknowledged exactly once");

  await Promise.all([
    recover("IOT_LAB", "tc22-iot", 3),
    recover("SERVER_ROOM", "tc22-server", 3),
  ]);

  const incidents = await c.incidents.find({ zoneId: { $in: ["tc22-IOT_LAB", "tc22-SERVER_ROOM"] } }).toArray();
  if (incidents.length !== 2 || incidents.some(incident => incident.status !== "RESOLVED" || incident.active)) {
    throw new Error("Both incidents did not resolve correctly");
  }
  for (const incident of incidents) {
    const timeline = await incidentTimeline(incident.id);
    const eventTypes = timeline?.events.map(event => event.eventType) ?? [];
    if (!eventTypes.includes("INCIDENT_OPENED") || !eventTypes.includes("INCIDENT_RESOLVED")) {
      throw new Error(`Incomplete timeline for ${incident.id}`);
    }
  }
  if (!(await incidentTimeline(queue[0].incident_id))?.events.some(event => event.eventType === "INCIDENT_ACKNOWLEDGED")) {
    throw new Error("Acknowledgment missing from top incident timeline");
  }

  const finalQueue = await priorityQueue();
  const states = await c.zone_states.find({ zoneId: { $in: CODES.map(code => `tc22-${code}`) } }).toArray();
  if (finalQueue.length !== 0 || states.some(state => state.safetyState !== "SAFE")) {
    throw new Error("System did not return to idle SAFE state");
  }
  console.log("✓ Both timelines complete; all five zones returned to idle SAFE; priority queue empty");
  console.log("TC22 PASSED");
}

main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
