import "dotenv/config";
import bcrypt from "bcryptjs";
import { collections } from "../src/server/db/collections";
import { env } from "../src/server/config/env";
import { hashSecret, id } from "../src/server/utils/id";
async function main() {
  const c = await collections();
  const now = new Date();
  
  const zones = [
    ["IOT_LAB", "IoT Lab", true],
    ["ROBOTICS_LAB", "Robotics Lab", true],
    ["SERVER_ROOM", "Server Room", true]
  ] as const;

  for (const [code, name, configured] of zones) {
    const zoneId = id();
    
    // Seed zone
    await c.zones.updateOne(
      { code },
      { 
        $setOnInsert: { 
          id: zoneId, 
          code, 
          name, 
          configured, 
          apiKeyHash: configured ? hashSecret(`${code}-demo-key`, env.ZONE_API_KEY_PEPPER) : undefined, 
          state: configured ? "SAFE" : "NOT_CONFIGURED", 
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

    // Fetch the actual zone id (in case it already existed)
    const z = await c.zones.findOne({ code });
    if (z) {
      // Bootstrap full zone_states to avoid partial update bugs and satisfy JSON schema
      await c.zone_states.updateOne(
        { zoneId: z.id },
        {
          $setOnInsert: {
            zoneId: z.id,
            safetyState: "SAFE",
            connectivityState: "OFFLINE",
            riskScore: 0,
            riskComponents: { fire: 0, gas: 0, water: 0, occupancy: 0 },
            fireConfirmed: false,
            firePositiveCount: 0,
            fireClearCount: 0,
            stateVersion: 0,
            lastObservedAt: now,
            updatedAt: now
          }
        },
        { upsert: true }
      );
    }
  }

  const password = process.env.DEMO_PASSWORD ?? "ChangeMe123!";
  const users = [
    ["admin@scs.local", "Campus Admin", "ADMIN"],
    ["staff@scs.local", "Security Staff", "SECURITY_STAFF"]
  ] as const;

  for (const [email, name, role] of users) {
    await c.users.updateOne(
      { email },
      { 
        $setOnInsert: { 
          id: id(), 
          email, 
          name, 
          role, 
          active: true, 
          passwordHash: await bcrypt.hash(password, 12), 
          createdAt: now 
        } 
      },
      { upsert: true }
    );
  }

  console.log("Seeded 3 dynamic zones and two demo users.");
}
main().catch(e => { console.error(e); process.exit(1); });
