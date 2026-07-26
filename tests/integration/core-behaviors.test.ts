import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { collections } from "../../src/server/db/collections";
import { assertTestDatabase } from "../../src/server/db/test-safety";
import { env } from "../../src/server/config/env";
import { hashSecret } from "../../src/server/utils/id";
import { ingest } from "../../src/server/services/ingestion-service";
import { applyOverride } from "../../src/server/services/override-service";
import { priorityQueue } from "../../src/server/services/incident-service";

const now = () => new Date();

async function resetAndSeed() {
  assertTestDatabase();
  const c = await collections();
  await Promise.all([
    c.readings.deleteMany({}), c.incidents.deleteMany({}), c.incident_events.deleteMany({}),
    c.acknowledgments.deleteMany({}), c.actuator_commands.deleteMany({}), c.manual_overrides.deleteMany({}),
    c.sensors.deleteMany({}), c.zone_states.deleteMany({}), c.zones.deleteMany({}), c.natural_language_reports.deleteMany({}),
    c.users.deleteMany({ id: "admin-test" }),
  ]);
  await c.users.insertOne({
    id: "admin-test", email: "admin-test@scs.local", name: "Integration Admin",
    passwordHash: "test-only", role: "ADMIN", active: true, createdAt: now(),
  });
  const zones = [
    ["IOT_LAB", "IoT Lab"], ["ROBOTICS_LAB", "Robotics Lab"], ["SERVER_ROOM", "Server Room"],
    ["DATA_SCIENCE_LAB", "Data Science Lab"], ["SOFTWARE_LAB", "Software Lab"],
  ] as const;
  for (const [code, name] of zones) {
    await c.zones.insertOne({
      id: `id-${code}`, code, name, configured: true,
      apiKeyHash: hashSecret(`${code}-demo-key`, env.ZONE_API_KEY_PEPPER),
      state: "SAFE", riskScore: 0, primaryHazard: null, occupancy: false,
      cameraOccupancy: false,
      connectivityState: "OFFLINE",
      lastReadingAt: null,
      lastReceivedAt: null,
      lastSequence: null,
      commandVersion: 0,
      createdAt: now(), updatedAt: now(),
    });
  }
}

function reading(sequence: number, values: Partial<Parameters<typeof ingest>[2]> = {}): Parameters<typeof ingest>[2] {
  return {
    bootId: "integration-boot",
    sequence,
    timestamp: now(),
    fire: false,
    gas: 1200,
    water: 0,
    pir: false,
    sensorHealth: "HEALTHY",
    sensorStatus: { fire: "ONLINE", gas: "ONLINE", water: "ONLINE", pir: "ONLINE" },
    deviceUptimeSeconds: 120,
    sampleIntervalMs: 200,
    ...values,
  };
}

async function makeCritical(code = "IOT_LAB", startSequence = 1) {
  for (let i = 0; i < 2; i++) {
    await ingest(code, `${code}-demo-key`, reading(startSequence + i, { gas: 4095, pir: true }));
  }
}

describe.sequential("core backend/hardware semantics", () => {
  beforeEach(resetAndSeed);


  it("accepts simultaneous readings from all five official zones without data loss", async () => {
    const codes = ["IOT_LAB", "ROBOTICS_LAB", "SERVER_ROOM", "DATA_SCIENCE_LAB", "SOFTWARE_LAB"];
    const results = await Promise.all(codes.map((code, index) =>
      ingest(code, `${code}-demo-key`, { ...reading(index + 1), bootId: `five-zone-${code}` }),
    ));
    const c = await collections();
    expect(results.every(result => result.accepted && !result.duplicate)).toBe(true);
    expect(await c.readings.countDocuments({ bootId: { $regex: "^five-zone-" } })).toBe(5);
  });

  it("rejects impossible raw values before storing or calculating risk", async () => {
    await expect(ingest("IOT_LAB", "IOT_LAB-demo-key", reading(1, { gas: 4096 }))).rejects.toThrow();
    await expect(ingest("IOT_LAB", "IOT_LAB-demo-key", reading(2, { water: -1 }))).rejects.toThrow();
    const c = await collections();
    expect(await c.readings.countDocuments({ zoneId: "id-IOT_LAB" })).toBe(0);
  });

  it("suppresses gas during the first 30 seconds of device warm-up", async () => {
    const result = await ingest("IOT_LAB", "IOT_LAB-demo-key", reading(1, {
      gas: 4095, deviceUptimeSeconds: 10,
    }));
    expect(result.zone.risk_score).toBe(0);
    expect(result.zone.safety_state).toBe("SAFE");
    const c = await collections();
    expect((await c.readings.findOne({ zoneId: "id-IOT_LAB" }))?.isWarmingUp).toBe(true);
  });

  it("requires five flame samples and ignores a shorter flicker", async () => {
    for (let sequence = 1; sequence <= 4; sequence++) {
      const result = await ingest("IOT_LAB", "IOT_LAB-demo-key", reading(sequence, { fire: true }));
      expect(result.zone.safety_state).toBe("SAFE");
    }
    const fifth = await ingest("IOT_LAB", "IOT_LAB-demo-key", reading(5, { fire: true }));
    expect(fifth.zone.safety_state).toBe("CRITICAL");
    const c = await collections();
    expect((await c.zone_states.findOne({ zoneId: "id-IOT_LAB" }))?.fireConfirmed).toBe(true);
  });

  it("resets the fire debounce counter after a confirmed flame clears", async () => {
    for (let sequence = 1; sequence <= 10; sequence++) {
      await ingest("IOT_LAB", "IOT_LAB-demo-key", reading(sequence, { fire: true }));
    }
    for (let sequence = 11; sequence <= 13; sequence++) {
      await ingest("IOT_LAB", "IOT_LAB-demo-key", reading(sequence, { fire: false }));
    }
    const c = await collections();
    let state = await c.zone_states.findOne({ zoneId: "id-IOT_LAB" });
    expect(state?.fireConfirmed).toBe(false);
    expect(state?.firePositiveCount).toBe(0);

    await ingest("IOT_LAB", "IOT_LAB-demo-key", reading(14, { fire: true }));
    state = await c.zone_states.findOne({ zoneId: "id-IOT_LAB" });
    expect(state?.fireConfirmed).toBe(false);
    expect(state?.firePositiveCount).toBe(1);
  });

  it("stores an out-of-order reading as late without overwriting current state", async () => {
    const currentTime = new Date();
    await ingest("IOT_LAB", "IOT_LAB-demo-key", reading(1, { timestamp: currentTime, gas: 4095 }));
    await ingest("IOT_LAB", "IOT_LAB-demo-key", reading(2, { timestamp: new Date(currentTime.getTime() - 5_000), gas: 1200 }));
    const c = await collections();
    const late = await c.readings.findOne({ zoneId: "id-IOT_LAB", sequence: 2 });
    const state = await c.zone_states.findOne({ zoneId: "id-IOT_LAB" });
    expect(late?.isLate).toBe(true);
    expect(state?.lastObservedAt?.getTime()).toBe(currentTime.getTime());
  });

  it("deduplicates a network retry without a second reading or command", async () => {
    const first = await ingest("IOT_LAB", "IOT_LAB-demo-key", reading(1));
    const second = await ingest("IOT_LAB", "IOT_LAB-demo-key", reading(1));
    const c = await collections();
    expect(first.duplicate).toBe(false);
    expect(second?.duplicate).toBe(true);
    expect(await c.readings.countDocuments({ zoneId: "id-IOT_LAB", bootId: "integration-boot", sequence: 1 })).toBe(1);
  });

  it("preserves a confirmed critical state and occupancy when the required sensors go offline", async () => {
    await makeCritical();
    const c = await collections();
    const before = await c.zone_states.findOne({ zoneId: "id-IOT_LAB" });
    expect(before?.safetyState).toBe("CRITICAL");
    expect(before?.occupied).toBe(true);

    await ingest("IOT_LAB", "IOT_LAB-demo-key", reading(3, {
      gas: 0, water: 0, pir: false, fire: false,
      sensorHealth: "OFFLINE",
      sensorStatus: { fire: "OFFLINE", gas: "OFFLINE", water: "OFFLINE", pir: "OFFLINE" },
    }));
    const after = await c.zone_states.findOne({ zoneId: "id-IOT_LAB" });
    expect(after?.connectivityState).toBe("OFFLINE");
    expect(after?.safetyState).toBe("CRITICAL");
    expect(after?.riskScore).toBe(before?.riskScore);
    expect(after?.occupied).toBe(true);
    expect(await c.incidents.countDocuments({ zoneId: "id-IOT_LAB", active: true })).toBe(1);
  });

  it("marks the zone OFFLINE when an individual required PIR sensor disconnects", async () => {
    await ingest("IOT_LAB", "IOT_LAB-demo-key", reading(1, { pir: true }));
    await ingest("IOT_LAB", "IOT_LAB-demo-key", reading(2, { pir: true }));
    const c = await collections();
    const before = await c.zone_states.findOne({ zoneId: "id-IOT_LAB" });
    expect(before?.occupied).toBe(true);

    await ingest("IOT_LAB", "IOT_LAB-demo-key", reading(3, {
      pir: false,
      sensorHealth: "DEGRADED",
      sensorStatus: { fire: "ONLINE", gas: "ONLINE", water: "ONLINE", pir: "OFFLINE" },
    }));
    const after = await c.zone_states.findOne({ zoneId: "id-IOT_LAB" });
    expect(after?.connectivityState).toBe("OFFLINE");
    expect(after?.occupied).toBe(true);
    expect(after?.riskScore).toBe(before?.riskScore);
  });

  it("keeps an incident active through WARNING and resolves it only after SAFE", async () => {
    await makeCritical();
    const c = await collections();
    await ingest("IOT_LAB", "IOT_LAB-demo-key", reading(3, { gas: 2000, pir: false }));
    await c.zone_states.updateOne({ zoneId: "id-IOT_LAB" }, { $set: { recoverySince: new Date(Date.now() - 6_000) } });
    await ingest("IOT_LAB", "IOT_LAB-demo-key", reading(4, { gas: 2000, pir: false }));
    let state = await c.zone_states.findOne({ zoneId: "id-IOT_LAB" });
    let incident = await c.incidents.findOne({ zoneId: "id-IOT_LAB" });
    expect(state?.safetyState).toBe("WARNING");
    expect(incident?.active).toBe(true);

    await c.zone_states.updateOne({ zoneId: "id-IOT_LAB" }, { $set: { recoverySince: new Date(Date.now() - 6_000) } });
    await ingest("IOT_LAB", "IOT_LAB-demo-key", reading(5));
    state = await c.zone_states.findOne({ zoneId: "id-IOT_LAB" });
    incident = await c.incidents.findOne({ zoneId: "id-IOT_LAB" });
    expect(state?.safetyState).toBe("SAFE");
    expect(incident?.status).toBe("RESOLVED");
    expect(incident?.active).toBe(false);
  });

  it("allocates unique command versions when SILENCE and a critical sensor update happen together", async () => {
    await makeCritical();
    await Promise.all([
      ingest("IOT_LAB", "IOT_LAB-demo-key", reading(3, { gas: 4095, pir: true })),
      applyOverride({ zoneCode: "IOT_LAB", action: "SILENCE", reason: "Race test", expiresInMinutes: 5 }, "admin-test"),
    ]);
    const c = await collections();
    const commands = await c.actuator_commands.find({ zoneId: "id-IOT_LAB" }).sort({ commandVersion: 1 }).toArray();
    expect(new Set(commands.map(command => command.commandVersion)).size).toBe(commands.length);
    const latest = commands.at(-1)!;
    expect(latest.relayCutoff).toBe(true);
    expect(latest.buzzer).toBe(false);
    expect((await c.zone_states.findOne({ zoneId: "id-IOT_LAB" }))?.safetyState).toBe("CRITICAL");
  });

  it("keeps WARNING incidents out of the current CRITICAL priority queue", async () => {
    await makeCritical();
    const c = await collections();
    await ingest("IOT_LAB", "IOT_LAB-demo-key", reading(3, { gas: 2000 }));
    await c.zone_states.updateOne({ zoneId: "id-IOT_LAB" }, { $set: { recoverySince: new Date(Date.now() - 6_000) } });
    await ingest("IOT_LAB", "IOT_LAB-demo-key", reading(4, { gas: 2000 }));
    expect((await c.incidents.findOne({ zoneId: "id-IOT_LAB" }))?.active).toBe(true);
    expect(await priorityQueue()).toHaveLength(0);
  });
});
