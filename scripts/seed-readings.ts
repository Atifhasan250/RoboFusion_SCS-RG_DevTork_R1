import "dotenv/config";
import { collections } from "../src/server/db/collections";
import { id } from "../src/server/utils/id";
import type { Reading } from "../src/server/types";

async function main() {
  const c = await collections();
  const zones = await c.zones.find({ configured: true }).toArray();
  if (zones.length === 0) throw new Error("No configured zones found. Run db:seed first.");

  const docs: Omit<Reading, "_id">[] = [];
  const batchSize = 500;
  const total = 10_000;

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
      bootId: "seed-boot-001",
      sequence: 1_000_000 + i,
      receivedAt: at,
      observedAt: at,
      uptimeMs: (1000 + i) * 1000,
      sampleIntervalMs: 500,
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
      normalized: { gas: gasFactor, water: waterFactor, occupancy: occupancy ? 1 : 0 },
    });

    if (docs.length === batchSize) {
      await c.readings.insertMany(docs, { ordered: false }).catch(() => {});
      docs.length = 0;
      process.stdout.write(`\r  Seeded ${i + 1}/${total}...`);
    }
  }
  if (docs.length > 0) {
    await c.readings.insertMany(docs, { ordered: false }).catch(() => {});
  }

  const count = await c.readings.countDocuments();
  console.log(`\nSeeded. Total readings in DB: ${count}`);
}

main().catch(e => { console.error(e); process.exit(1); });
