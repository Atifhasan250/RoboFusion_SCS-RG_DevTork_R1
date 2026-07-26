import "dotenv/config";
import { collections } from "../src/server/db/collections";
import { id } from "../src/server/utils/id";
import type { Reading, Incident, IncidentEvent } from "../src/server/types";

async function main() {
  const c = await collections();
  const zones = await c.zones.find({ configured: true }).toArray();
  if (zones.length === 0) throw new Error("No configured zones found. Run db:seed first.");

  const docs: Omit<Reading, "_id">[] = [];
  const batchSize = 500;
  const total = 10_000;
  const seedBootId = `performance-seed-${Date.now()}`;

  for (let i = 0; i < total; i++) {
    const zone = zones[i % zones.length];
    const at = new Date(Date.now() - (total - i) * 2_000); // 2s apart
    const gasRaw = Math.random() * 400 + 1200;
    const waterRaw = Math.random() * 20;
    const gasFactor = Math.max(0, Math.min(1, (gasRaw - 1200) / 1800));
    const waterFactor = Math.max(0, Math.min(1, waterRaw / 80));
    const occupancy = i % 5 === 0;
    const riskScore = Math.round((gasFactor * 70 + waterFactor * 70 + (occupancy ? 10 : 0)) * 100) / 100;
    const state = riskScore >= 65 ? "CRITICAL" : riskScore >= 30 ? "WARNING" : "SAFE";

    docs.push({
      id: id(),
      zoneId: zone.id,
      bootId: seedBootId,
      sequence: 1_000_000 + i,
      receivedAt: at,
      observedAt: at,
      uptimeMs: (1000 + i) * 1000,
      sampleIntervalMs: 500,
      clockSynchronized: true,
      fire: false,
      gas: gasRaw,
      water: waterRaw,
      pir: occupancy,
      cameraOccupancy: null,
      sensorHealth: "HEALTHY",
      fireFactor: 0,
      gasFactor,
      waterFactor,
      occupancyFactor: occupancy ? 1 : 0,
      riskScore,
      riskComponents: { fire: 0, gas: Math.round(gasFactor * 70 * 100) / 100, water: Math.round(waterFactor * 70 * 100) / 100, occupancy: occupancy ? 10 : 0 },
      calculatedState: state,
      primaryHazard: gasFactor > 0.3 ? "GAS" : waterFactor > 0.2 ? "FLOOD" : "NONE",
      isLate: false,
      isWarmingUp: false,
      replayed: false,
      replayBatchLast: false,
      normalized: { gas: gasFactor, water: waterFactor, occupancy: occupancy ? 1 : 0 },
    });

    if (docs.length === batchSize) {
      await c.readings.insertMany(docs, { ordered: false });
      docs.length = 0;
      process.stdout.write(`\r  Seeded ${i + 1}/${total}...`);
    }
  }
  if (docs.length > 0) {
    await c.readings.insertMany(docs, { ordered: false });
  }

  console.log(`\nSeeding representative incidents for performance tests...`);
  const incidents: Omit<Incident, "_id">[] = [];
  const events: Omit<IncidentEvent, "_id">[] = [];
  for (let i = 0; i < 200; i++) {
    const zone = zones[i % zones.length];
    const incidentId = id();
    const startedAt = new Date(Date.now() - (300 - i) * 86400000);
    const resolvedAt = new Date(startedAt.getTime() + 3600000);
    incidents.push({
      id: incidentId,
      zoneId: zone.id,
      status: "RESOLVED" as const,
      active: false,
      severity: "CRITICAL" as const,
      primaryHazard: "FIRE" as const,
      peakRiskScore: 90 + Math.random() * 10,
      initialRiskScore: 65 + Math.random() * 5,
      version: 1,
      startedAt,
      acknowledgedAt: new Date(startedAt.getTime() + 10000),
      acknowledgedBy: null,
      resolvedAt,
      resolutionReason: "TEST_INCIDENT",
      createdAt: startedAt,
      updatedAt: resolvedAt,
      // Legacy fields
      openedAt: startedAt,
      riskScore: 90 + Math.random() * 10,
      hazard: "FIRE" as const,
      commandVersion: 1,
    });
    events.push({
      id: id(), incidentId, zoneId: zone.id,
      eventType: "INCIDENT_OPENED" as const, eventSource: "BACKEND" as const,
      actorUserId: null, description: "Incident started", metadata: {}, occurredAt: startedAt,
    });
    events.push({
      id: id(), incidentId, zoneId: zone.id,
      eventType: "INCIDENT_RESOLVED" as const, eventSource: "BACKEND" as const,
      actorUserId: null, description: "Incident resolved", metadata: {}, occurredAt: resolvedAt,
    });
  }
  await c.incidents.insertMany(incidents, { ordered: false });
  await c.incident_events.insertMany(events, { ordered: false });

  const count = await c.readings.countDocuments();
  const incCount = await c.incidents.countDocuments();
  console.log(`Seeded. Total readings: ${count}, incidents: ${incCount}`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
