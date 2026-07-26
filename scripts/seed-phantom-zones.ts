import "dotenv/config";
import { collections } from "../src/server/db/collections";
import { env } from "../src/server/config/env";
import { hashSecret, id } from "../src/server/utils/id";

async function main() {
  const c = await collections();
  const now = new Date();
  for (let i = 1; i <= 30; i++) {
    const code = `PHANTOM_${i}`;
    await c.zones.updateOne(
      { code },
      {
        $set: {
          name: `Load Test Zone ${i}`,
          configured: true,
          apiKeyHash: hashSecret(`${code}-demo-key`, env.ZONE_API_KEY_PEPPER),
          updatedAt: now,
        },
        $setOnInsert: {
          id: id(), code, state: "SAFE", riskScore: 0, primaryHazard: null,
          occupancy: false, cameraOccupancy: false, connectivityState: "OFFLINE",
          lastReadingAt: null, lastSequence: null, commandVersion: 0, createdAt: now,
        },
      },
      { upsert: true },
    );
    const zone = await c.zones.findOne({ code });
    if (!zone) throw new Error(`Could not seed ${code}`);
    await c.zone_states.updateOne(
      { zoneId: zone.id },
      { $setOnInsert: {
        zoneId: zone.id, safetyState: "SAFE", connectivityState: "OFFLINE", riskScore: 0,
        riskComponents: { fire: 0, gas: 0, water: 0, occupancy: 0 }, primaryHazard: "NONE",
        occupied: false, lastReadingId: null, lastObservedAt: null, lastReceivedAt: null,
        warningSince: null, criticalSince: null, recoverySince: null,
        consecutiveWarningReadings: 0, consecutiveCriticalReadings: 0, consecutiveSafeReadings: 0,
        recentRiskScores: [], isTrendingCritical: false,
        firePositiveCount: 0, fireClearCount: 0, fireConfirmed: false, fireConfirmedAt: null,
        stateVersion: 0, updatedAt: now,
      } },
      { upsert: true },
    );
  }
  console.log("Provisioned 30 transaction-safe phantom zones.");
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
