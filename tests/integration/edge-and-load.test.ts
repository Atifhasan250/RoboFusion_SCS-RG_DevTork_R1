import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { collections } from "../../src/server/db/collections";
import { assertTestDatabase } from "../../src/server/db/test-safety";
import { env } from "../../src/server/config/env";
import { hashSecret } from "../../src/server/utils/id";
import { ingest } from "../../src/server/services/ingestion-service";
import { priorityQueue } from "../../src/server/services/incident-service";
import { recoverSystemState } from "../../src/server/services/recovery-service";

const CODES = ["IOT_LAB", "ROBOTICS_LAB", "SERVER_ROOM", "DATA_SCIENCE_LAB", "SOFTWARE_LAB"] as const;

async function reset() {
  assertTestDatabase();
  const c = await collections();
  await Promise.all([
    c.zones.deleteMany({}), c.zone_states.deleteMany({}), c.readings.deleteMany({}),
    c.incidents.deleteMany({}), c.incident_events.deleteMany({}), c.actuator_commands.deleteMany({}),
    c.acknowledgments.deleteMany({}), c.manual_overrides.deleteMany({}), c.natural_language_reports.deleteMany({}),
  ]);
  const now = new Date();
  await c.zones.insertMany(CODES.map(code => ({
    id: `edge-${code}`, code, name: code.replaceAll("_", " "), configured: true,
    apiKeyHash: hashSecret(`${code}-demo-key`, env.ZONE_API_KEY_PEPPER),
    state: "SAFE" as const, riskScore: 0, primaryHazard: null, occupancy: false, cameraOccupancy: false,
    connectivityState: "OFFLINE" as const, lastReadingAt: null, lastSequence: null, commandVersion: 0,
    createdAt: now, updatedAt: now,
  })));
}

function raw(code: string, sequence: number, values: { gas?: number; water?: number; pir?: boolean } = {}) {
  return {
    bootId: `edge-${code}`, sequence, timestamp: new Date(), fire: false,
    gas: values.gas ?? 1200, water: values.water ?? 0, pir: values.pir ?? false,
    sensorHealth: "HEALTHY" as const,
    sensorStatus: { fire: "ONLINE" as const, gas: "ONLINE" as const, water: "ONLINE" as const, pir: "ONLINE" as const },
    deviceUptimeSeconds: 120, sampleIntervalMs: 500,
  };
}

async function sendTwice(code: typeof CODES[number], values: { gas?: number; water?: number; pir?: boolean }) {
  await ingest(code, `${code}-demo-key`, raw(code, 1, values));
  await ingest(code, `${code}-demo-key`, raw(code, 2, values));
}

describe.sequential("integration edge cases and combined load", () => {
  beforeEach(reset);

  it("ranks four zones that become critical together in a stable, explainable order", async () => {
    await Promise.all([
      sendTwice("IOT_LAB", { gas: 4095, water: 100, pir: true }),
      sendTwice("SERVER_ROOM", { gas: 4095, pir: true }),
      sendTwice("ROBOTICS_LAB", { gas: 4095, pir: false }),
      sendTwice("DATA_SCIENCE_LAB", { water: 100, pir: false }),
    ]);
    const first = await priorityQueue();
    const second = await priorityQueue();
    expect(first).toHaveLength(4);
    expect(first[0].zone_code).toBe("IOT_LAB");
    expect(first.map(item => item.zone_code)).toEqual(second.map(item => item.zone_code));
    expect(first.every(item => item.ranking_reason.length > 20)).toBe(true);
  });

  it("keeps database state and latest actuator command consistent", async () => {
    await sendTwice("SERVER_ROOM", { water: 100, pir: true });
    const c = await collections();
    const zone = await c.zones.findOne({ code: "SERVER_ROOM" });
    const state = await c.zone_states.findOne({ zoneId: zone!.id });
    const command = await c.actuator_commands.findOne({ zoneId: zone!.id }, { sort: { commandVersion: -1 } });
    expect(zone?.state).toBe("CRITICAL");
    expect(state?.safetyState).toBe("CRITICAL");
    expect(command?.safetyState).toBe("CRITICAL");
    expect(command?.led).toBe("RED");
    expect(command?.buzzer).toBe(true);
    expect(command?.relayCutoff).toBe(true);
  });

  it("recovers durable critical state after the backend recovery routine", async () => {
    await sendTwice("IOT_LAB", { gas: 4095, pir: true });
    const before = await (await collections()).zone_states.findOne({ zoneId: "edge-IOT_LAB" });
    const recovered = await recoverSystemState();
    const after = await (await collections()).zone_states.findOne({ zoneId: "edge-IOT_LAB" });
    expect(recovered.zones).toBe(5);
    expect(recovered.openIncidents).toBe(1);
    expect(after?.safetyState).toBe(before?.safetyState);
    expect(after?.riskScore).toBe(before?.riskScore);
  });

  it("continues accepting other zones while one zone cycles through the full lifecycle", async () => {
    const c = await collections();
    // First move Software Lab into WARNING with two moderate fused readings.
    await Promise.all([
      ingest("SOFTWARE_LAB", "SOFTWARE_LAB-demo-key", raw("SOFTWARE_LAB", 1, { gas: 2000, water: 20 })),
      ...CODES.filter(code => code !== "SOFTWARE_LAB").map(code => ingest(code, `${code}-demo-key`, raw(code, 1))),
    ]);
    await ingest("SOFTWARE_LAB", "SOFTWARE_LAB-demo-key", raw("SOFTWARE_LAB", 2, { gas: 2000, water: 20 }));
    expect((await c.zone_states.findOne({ zoneId: "edge-SOFTWARE_LAB" }))?.safetyState).toBe("WARNING");

    // Escalate while the other zones continue normal ingestion.
    await Promise.all([
      ingest("SOFTWARE_LAB", "SOFTWARE_LAB-demo-key", raw("SOFTWARE_LAB", 3, { gas: 4095, pir: true })),
      ...CODES.filter(code => code !== "SOFTWARE_LAB").map(code => ingest(code, `${code}-demo-key`, raw(code, 2))),
    ]);
    await ingest("SOFTWARE_LAB", "SOFTWARE_LAB-demo-key", raw("SOFTWARE_LAB", 4, { gas: 4095, pir: true }));
    expect((await c.zone_states.findOne({ zoneId: "edge-SOFTWARE_LAB" }))?.safetyState).toBe("CRITICAL");

    // Controlled recovery: Critical -> Warning -> Safe; incident stays active until Safe.
    await ingest("SOFTWARE_LAB", "SOFTWARE_LAB-demo-key", raw("SOFTWARE_LAB", 5));
    await c.zone_states.updateOne({ zoneId: "edge-SOFTWARE_LAB" }, { $set: { recoverySince: new Date(Date.now() - 6_000) } });
    await ingest("SOFTWARE_LAB", "SOFTWARE_LAB-demo-key", raw("SOFTWARE_LAB", 6));
    expect((await c.zone_states.findOne({ zoneId: "edge-SOFTWARE_LAB" }))?.safetyState).toBe("WARNING");
    expect((await c.incidents.findOne({ zoneId: "edge-SOFTWARE_LAB" }))?.active).toBe(true);
    await c.zone_states.updateOne({ zoneId: "edge-SOFTWARE_LAB" }, { $set: { recoverySince: new Date(Date.now() - 6_000) } });
    await ingest("SOFTWARE_LAB", "SOFTWARE_LAB-demo-key", raw("SOFTWARE_LAB", 7));
    expect((await c.zone_states.findOne({ zoneId: "edge-SOFTWARE_LAB" }))?.safetyState).toBe("SAFE");
    expect((await c.incidents.findOne({ zoneId: "edge-SOFTWARE_LAB" }))?.status).toBe("RESOLVED");
    expect(await c.readings.countDocuments()).toBeGreaterThanOrEqual(15);
  });
});
