import "dotenv/config";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { mongoClient } from "../../src/server/db/client";
import { collections } from "../../src/server/db/collections";
import { ingest } from "../../src/server/services/ingestion-service";
import { priorityQueue } from "../../src/server/services/incident-service";
import { env } from "../../src/server/config/env";
import { hashSecret } from "../../src/server/utils/id";
import { ObjectId } from "mongodb";

// ── Tests ────────────────────────────────────────────────────────────────────
describe("Multi-Zone Priority Ranking", () => {
  beforeAll(async () => {
    const c = await collections();
    await c.zones.deleteMany({});
    await c.zone_states.deleteMany({});
    await c.incidents.deleteMany({});
    await c.readings.deleteMany({});
    await c.actuator_commands.deleteMany({});
    
    // Create 3 zones
    const zones = [
      { id: "zone-a", code: "ZONE_A", name: "Zone A", configured: true, apiKeyHash: hashSecret("key-a", env.ZONE_API_KEY_PEPPER), state: "SAFE", riskScore: 0, primaryHazard: null, occupancy: false, connectivityState: "ONLINE", commandVersion: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: "zone-b", code: "ZONE_B", name: "Zone B", configured: true, apiKeyHash: hashSecret("key-b", env.ZONE_API_KEY_PEPPER), state: "SAFE", riskScore: 0, primaryHazard: null, occupancy: false, connectivityState: "ONLINE", commandVersion: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: "zone-c", code: "ZONE_C", name: "Zone C", configured: true, apiKeyHash: hashSecret("key-c", env.ZONE_API_KEY_PEPPER), state: "SAFE", riskScore: 0, primaryHazard: null, occupancy: false, connectivityState: "ONLINE", commandVersion: 0, createdAt: new Date(), updatedAt: new Date() },
    ];
    await c.zones.insertMany(zones as any);
  });

  afterAll(async () => {
    const client = await mongoClient();
    await client.close();
  });

  it("should rank zones properly when multiple incidents occur", async () => {
    // 1. Zone A: Fire (70)
    for (let i = 0; i < 5; i++) {
      await ingest("ZONE_A", "key-a", {
        bootId: "boot-a", sequence: i, timestamp: new Date(), fire: true, gas: 1200, water: 0, pir: false, sensorHealth: "HEALTHY", deviceUptimeSeconds: 100, sampleIntervalMs: 500
      });
    }
    
    // 2. Zone B: Gas (70) + Occupied (+10) -> 80
    for (let i = 0; i < 2; i++) {
      await ingest("ZONE_B", "key-b", {
        bootId: "boot-b", sequence: i, timestamp: new Date(), fire: false, gas: 4200, water: 0, pir: true, sensorHealth: "HEALTHY", deviceUptimeSeconds: 100, sampleIntervalMs: 500
      });
    }
    
    // 3. Zone C: Safe
    await ingest("ZONE_C", "key-c", {
      bootId: "boot-c", sequence: 1, timestamp: new Date(), fire: false, gas: 1200, water: 0, pir: false, sensorHealth: "HEALTHY", deviceUptimeSeconds: 100, sampleIntervalMs: 500
    });

    const activeIncidents = await priorityQueue();
    
    // B should be ranked higher than A because of occupancy bonus (80 vs 70)
    expect(activeIncidents.length).toBe(2);
    expect(activeIncidents[0].zone_name).toBe("Zone B");
    expect(activeIncidents[1].zone_name).toBe("Zone A");
  }, 15000);
});
