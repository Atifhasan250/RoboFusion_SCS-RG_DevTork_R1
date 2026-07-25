import "dotenv/config";
import { collections } from "../src/server/db/collections";
import { ingest } from "../src/server/services/ingestion-service";
import { id } from "../src/server/utils/id";

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const c = await collections();
  const zones = await c.zones.find({ configured: true }).limit(2).toArray();
  
  if (zones.length < 2) {
    console.error("Need at least 2 configured zones for this test.");
    process.exit(1);
  }

  const zone1 = zones[0];
  const zone2 = zones[1];
  const apiKey1 = null;
  const apiKey2 = null;

  console.log(`Starting TC22: Two-Zone Simultaneous Incident`);
  console.log(`Zone 1: ${zone1.code}`);
  console.log(`Zone 2: ${zone2.code}`);

  const bootId1 = id();
  const bootId2 = id();
  let seq1 = 1;
  let seq2 = 1;

  async function sendReading(zone: typeof zone1, bootId: string, seq: number, fire: boolean, gas: number, water: number, pir: boolean) {
    await ingest(zone.code, `${zone.code}-demo-key`, {
      bootId,
      sequence: seq,
      timestamp: new Date(),
      fire,
      gas,
      water,
      pir,
      sensorHealth: "HEALTHY",
      deviceUptimeSeconds: 60,
      sampleIntervalMs: 500
    });
  }

  console.log("1. Sending SAFE readings...");
  for (let i = 0; i < 3; i++) {
    await sendReading(zone1, bootId1, seq1++, false, 1200, 0, false);
    await sendReading(zone2, bootId2, seq2++, false, 1200, 0, false);
  }

  console.log("2. Escalating to WARNING in both zones...");
  for (let i = 0; i < 3; i++) {
    await sendReading(zone1, bootId1, seq1++, false, 2000, 10, true);
    await sendReading(zone2, bootId2, seq2++, false, 1800, 5, true);
  }

  console.log("3. Escalating to CRITICAL in both zones (Zone 1 > Zone 2)...");
  for (let i = 0; i < 5; i++) {
    // Zone 1 gets Fire = true (Risk ~ 100)
    await sendReading(zone1, bootId1, seq1++, true, 3000, 80, true);
    // Zone 2 gets Gas/Water = critical, no fire (Risk ~ 70-80)
    await sendReading(zone2, bootId2, seq2++, false, 3000, 50, true);
  }

  console.log("Incidents injected. Check priority queue via API (or dashboard)!");
  
  // Verify order in priority queue
  const res = await fetch("http://localhost:3000/api/v1/priority-queue");
  if (res.ok) {
    const data = await res.json();
    console.log("Priority Queue Output:");
    data.slice(0, 3).forEach((z: any, idx: number) => {
      console.log(`  #${idx+1}: ${z.zone_code} - State: ${z.safety_state}, Risk: ${z.risk_score}`);
    });
  } else {
    console.log("Could not fetch priority queue. Ensure Next.js server is running on port 3000.");
  }

  process.exit(0);
}

main().catch(console.error);
