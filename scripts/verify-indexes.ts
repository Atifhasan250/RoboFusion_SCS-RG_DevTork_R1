import "dotenv/config";
import { db } from "../src/server/db/client";

const REQUIRED_INDEXES: Record<string, string[][]> = {
  zones: [["code"]],
  zone_states: [["zoneId"]],
  readings: [["zoneId", "bootId", "sequence"], ["zoneId", "observedAt"]],
  incidents: [["severity", "startedAt"], ["zoneId", "startedAt"]],
  incident_events: [["incidentId", "occurredAt"]],
  acknowledgments: [["incidentId"]],
  actuator_commands: [["zoneId", "stateVersion"]],
  users: [["email"]],
  sessions: [["expiresAt"]],
};

async function main() {
  const d = await db();
  console.log("Verifying indexes...\n");
  let allPassed = true;

  for (const [colName, requiredKeys] of Object.entries(REQUIRED_INDEXES)) {
    const indexes = await d.collection(colName).indexes();
    const existingKeys = indexes.map(ix => Object.keys(ix.key).join(","));
    console.log(`Collection: ${colName}`);
    for (const required of requiredKeys) {
      const key = required.join(",");
      const found = existingKeys.some(k => k.startsWith(key) || k === key);
      const status = found ? "✓" : "✗ MISSING";
      if (!found) allPassed = false;
      console.log(`  ${status} [${key}]`);
    }
  }

  // Note: explain() for full stats — run npm run db:indexes:explain
  console.log("  Run 'npm run db:indexes:explain' for full executionStats evidence.");

  if (!allPassed) throw new Error("Some required indexes are missing!");
  console.log("\n✓ All required indexes verified.");
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
