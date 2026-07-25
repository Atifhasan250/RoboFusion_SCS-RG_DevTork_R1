import "dotenv/config";
import { collections } from "../src/server/db/collections";
import { env } from "../src/server/config/env";
import { hashSecret, id } from "../src/server/utils/id";

async function main() {
  const c = await collections();
  const now = new Date();

  for (let i = 1; i <= 30; i++) {
    const code = `PHANTOM_${i}`;
    const zId = id();

    await c.zones.updateOne(
      { code },
      {
        $setOnInsert: {
          id: zId,
          code,
          name: `Load Test Zone ${i}`,
          configured: true,
          apiKeyHash: hashSecret(`${code}-demo-key`, env.ZONE_API_KEY_PEPPER),
          state: "SAFE",
          riskScore: 0,
          primaryHazard: null,
          occupancy: false,
          commandVersion: 0,
          createdAt: now,
          updatedAt: now
        }
      },
      { upsert: true }
    );

    const z = await c.zones.findOne({ code });
    if (z) {
      await c.zone_states.updateOne(
        { zoneId: z.id },
        {
          $setOnInsert: {
            zoneId: z.id,
            safetyState: "SAFE",
            connectivityState: "OFFLINE",
            riskScore: 0,
            riskComponents: { fire: 0, gas: 0, water: 0, occupancy: 0 },
            primaryHazard: "NONE",
            occupied: false,
            lastReadingId: null,
            lastObservedAt: null,
            lastReceivedAt: null,
            warningSince: null,
            criticalSince: null,
            recoverySince: null,
            consecutiveWarningReadings: 0,
            consecutiveCriticalReadings: 0,
            consecutiveSafeReadings: 0,
            firePositiveCount: 0,
            fireClearCount: 0,
            fireConfirmed: false,
            fireConfirmedAt: null,
            stateVersion: 0,
            updatedAt: now
          }
        },
        { upsert: true }
      );
    }
  }
  console.log("Provisioned 30 protected phantom zones with initial zone states.");
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
