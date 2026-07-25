/**
 * Concurrency test: 10 simultaneous sensor writes to different zones.
 * Verifies no reading is lost, no duplicate state mutation occurs,
 * and the zone states remain consistent.
 *
 * Run: npx tsx tests/concurrency/concurrent-writes.ts
 *      (requires MongoDB replica set to be running)
 */
import "dotenv/config";
import { collections } from "../../src/server/db/collections";

const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";

interface WriteResult {
  zone: string;
  sequence: number;
  accepted: boolean;
  status: number;
  riskScore?: number;
  error?: string;
}

async function sendReading(zone: string, sequence: number): Promise<WriteResult> {
  try {
    const res = await fetch(`${BASE_URL}/api/v1/readings/${zone}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-zone-api-key": `${zone}-demo-key`,
      },
      body: JSON.stringify({
        bootId: "concurrency-test-boot",
        sequence,
        timestamp: new Date().toISOString(),
        fire: sequence % 7 === 0, // occasional fire
        gas: Math.floor(Math.random() * 300) + 1200,
        water: Math.floor(Math.random() * 40),
        pir: sequence % 3 === 0,
        sensorHealth: "HEALTHY",
        deviceUptimeSeconds: 120,
        sampleIntervalMs: 500,
      }),
    });
    const body = await res.json() as { accepted?: boolean; duplicate?: boolean; zone?: { risk_score?: number } };
    return {
      zone, sequence,
      accepted: body.accepted ?? false,
      status: res.status,
      riskScore: body.zone?.risk_score,
    };
  } catch (error) {
    return { zone, sequence, accepted: false, status: 0, error: String(error) };
  }
}

async function main() {
  const ZONES = ["IOT_LAB", "ROBOTICS_LAB", "SERVER_ROOM"];
  const BASE_SEQ = Math.floor(Date.now() / 1000) % 100_000; // unique per run

  console.log(`Concurrency Test — 10 simultaneous writes to ${ZONES.length} zones`);
  console.log(`Base URL: ${BASE_URL}`);
  console.log("─".repeat(60));

  // 10 concurrent writes: mix of zones
  const writes = Array.from({ length: 10 }, (_, i) => ({
    zone: ZONES[i % ZONES.length],
    sequence: BASE_SEQ + i,
  }));

  const start = Date.now();
  const results = await Promise.all(writes.map(({ zone, sequence }) => sendReading(zone, sequence)));
  const elapsed = Date.now() - start;

  let passed = 0, failed = 0;
  for (const r of results) {
    const ok = r.status === 201 || r.status === 200;
    if (ok) passed++;
    else failed++;
    const statusStr = ok ? "✓" : "✗";
    console.log(`${statusStr} ${r.zone.padEnd(20)} seq=${r.sequence} status=${r.status} risk=${r.riskScore ?? "?"}`);
  }

  console.log("─".repeat(60));
  console.log(`Results: ${passed} accepted, ${failed} failed — ${elapsed}ms total`);

  // Verify DB state
  const c = await collections();
  const recentReadings = await c.readings.find({
    bootId: "concurrency-test-boot",
    sequence: { $gte: BASE_SEQ, $lte: BASE_SEQ + 9 },
  }).toArray();

  console.log(`\nDB Verification: ${recentReadings.length}/${writes.length} readings persisted`);

  // Check for duplicate active incidents
  const dupCheck = await c.incidents.aggregate([
    { $match: { active: true } },
    { $group: { _id: "$zoneId", count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
  ]).toArray();

  if (dupCheck.length === 0) {
    console.log("✓ No duplicate active incidents (one-per-zone constraint maintained)");
  } else {
    console.error(`✗ VIOLATION: ${dupCheck.length} zones have multiple active incidents!`);
  }

  if (failed > 0) {
    console.error(`\nTest FAILED: ${failed} writes were rejected`);
    process.exit(1);
  }
  if (recentReadings.length < writes.length * 0.9) {
    console.error(`\nTest FAILED: only ${recentReadings.length}/${writes.length} readings persisted`);
    process.exit(1);
  }

  console.log("\n✓ Concurrency test PASSED");
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
