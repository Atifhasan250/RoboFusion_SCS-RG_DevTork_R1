import "dotenv/config";
import { collections } from "../src/server/db/collections";

async function main() {
  const c = await collections();
  const results: Record<string, { orphans: number; detail: string }> = {};

  // 1. Readings with no matching zone
  const orphanReadings = await c.readings.aggregate([
    { $lookup: { from: "zones", localField: "zoneId", foreignField: "id", as: "zone" } },
    { $match: { zone: { $eq: [] } } },
    { $count: "count" },
  ]).toArray();
  results["orphan_readings"] = {
    orphans: orphanReadings[0]?.count ?? 0,
    detail: "readings.zoneId → zones.id",
  };

  // 1.5 Sensors with no matching zone
  const orphanSensors = await c.sensors.aggregate([
    { $lookup: { from: "zones", localField: "zoneId", foreignField: "id", as: "zone" } },
    { $match: { zone: { $eq: [] } } },
    { $count: "count" },
  ]).toArray();
  results["orphan_sensors"] = {
    orphans: orphanSensors[0]?.count ?? 0,
    detail: "sensors.zoneId → zones.id",
  };

  // 2. Incidents with no matching zone
  const orphanIncidents = await c.incidents.aggregate([
    { $lookup: { from: "zones", localField: "zoneId", foreignField: "id", as: "zone" } },
    { $match: { zone: { $eq: [] } } },
    { $count: "count" },
  ]).toArray();
  results["orphan_incidents"] = {
    orphans: orphanIncidents[0]?.count ?? 0,
    detail: "incidents.zoneId → zones.id",
  };

  // 3. Acknowledgments with no matching incident
  const orphanAcks = await c.acknowledgments.aggregate([
    { $lookup: { from: "incidents", localField: "incidentId", foreignField: "id", as: "incident" } },
    { $match: { incident: { $eq: [] } } },
    { $count: "count" },
  ]).toArray();
  results["orphan_acknowledgments"] = {
    orphans: orphanAcks[0]?.count ?? 0,
    detail: "acknowledgments.incidentId → incidents.id",
  };

  // 4. Actuator commands with no matching zone
  const orphanCmds = await c.actuator_commands.aggregate([
    { $lookup: { from: "zones", localField: "zoneId", foreignField: "id", as: "zone" } },
    { $match: { zone: { $eq: [] } } },
    { $count: "count" },
  ]).toArray();
  results["orphan_commands"] = {
    orphans: orphanCmds[0]?.count ?? 0,
    detail: "actuator_commands.zoneId → zones.id",
  };

  // 5. Duplicate active incidents per zone (should be 0)
  const dupActiveIncidents = await c.incidents.aggregate([
    { $match: { active: true } },
    { $group: { _id: "$zoneId", count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $count: "violations" },
  ]).toArray();
  results["duplicate_active_incidents"] = {
    orphans: dupActiveIncidents[0]?.violations ?? 0,
    detail: "one active incident per zone (partialFilterExpression index)",
  };

  // 6. Sessions referencing non-existent users
  const orphanSessions = await c.sessions.aggregate([
    { $lookup: { from: "users", localField: "userId", foreignField: "id", as: "user" } },
    { $match: { user: { $eq: [] } } },
    { $count: "count" },
  ]).toArray();
  results["orphan_sessions"] = {
    orphans: orphanSessions[0]?.count ?? 0,
    detail: "sessions.userId → users.id",
  };

  // ── Report ─────────────────────────────────────────────────────────────────
  console.log("\nIntegrity Check Results:");
  console.log("─".repeat(60));
  let totalViolations = 0;
  for (const [key, { orphans, detail }] of Object.entries(results)) {
    const status = orphans === 0 ? "✓ PASS" : "✗ FAIL";
    console.log(`${status.padEnd(8)} ${key.padEnd(35)} orphans: ${orphans} — ${detail}`);
    totalViolations += orphans;
  }
  console.log("─".repeat(60));

  if (totalViolations > 0) {
    throw new Error(`Integrity check FAILED: ${totalViolations} total violations found`);
  }
  console.log("✓ All integrity checks passed — zero orphan documents.");
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
