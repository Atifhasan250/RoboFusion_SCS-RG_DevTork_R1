/* eslint-disable @typescript-eslint/no-explicit-any */
import "dotenv/config";
import { collections } from "../src/server/db/collections";

type Check = { violations: number; detail: string };

async function orphanCount(collection: ReturnType<typeof collections> extends Promise<infer C> ? C[keyof C] : never, lookup: { from: string; localField: string; foreignField: string }) {
  // The cast keeps the helper generic across typed MongoDB collections.
  const rows = await (collection as any).aggregate([
    { $lookup: { ...lookup, as: "parent" } },
    { $match: { parent: { $eq: [] } } },
    { $count: "count" },
  ]).toArray();
  return rows[0]?.count ?? 0;
}

async function main() {
  const c = await collections();
  const results: Record<string, Check> = {};

  results.orphan_zone_states = {
    violations: await orphanCount(c.zone_states as any, { from: "zones", localField: "zoneId", foreignField: "id" }),
    detail: "zone_states.zoneId → zones.id",
  };
  results.orphan_sensors = {
    violations: await orphanCount(c.sensors as any, { from: "zones", localField: "zoneId", foreignField: "id" }),
    detail: "sensors.zoneId → zones.id",
  };
  results.orphan_readings = {
    violations: await orphanCount(c.readings as any, { from: "zones", localField: "zoneId", foreignField: "id" }),
    detail: "readings.zoneId → zones.id",
  };
  results.orphan_incidents = {
    violations: await orphanCount(c.incidents as any, { from: "zones", localField: "zoneId", foreignField: "id" }),
    detail: "incidents.zoneId → zones.id",
  };
  results.orphan_incident_events_zone = {
    violations: await orphanCount(c.incident_events as any, { from: "zones", localField: "zoneId", foreignField: "id" }),
    detail: "incident_events.zoneId → zones.id",
  };

  const orphanIncidentEvents = await c.incident_events.aggregate([
    { $match: { incidentId: { $ne: null } } },
    { $lookup: { from: "incidents", localField: "incidentId", foreignField: "id", as: "incident" } },
    { $match: { incident: { $eq: [] } } },
    { $count: "count" },
  ]).toArray();
  results.orphan_incident_events_incident = {
    violations: orphanIncidentEvents[0]?.count ?? 0,
    detail: "non-null incident_events.incidentId → incidents.id",
  };

  results.orphan_acknowledgments_incident = {
    violations: await orphanCount(c.acknowledgments as any, { from: "incidents", localField: "incidentId", foreignField: "id" }),
    detail: "acknowledgments.incidentId → incidents.id",
  };
  results.orphan_acknowledgments_user = {
    violations: await orphanCount(c.acknowledgments as any, { from: "users", localField: "userId", foreignField: "id" }),
    detail: "acknowledgments.userId → users.id",
  };
  results.orphan_commands = {
    violations: await orphanCount(c.actuator_commands as any, { from: "zones", localField: "zoneId", foreignField: "id" }),
    detail: "actuator_commands.zoneId → zones.id",
  };
  results.orphan_overrides_zone = {
    violations: await orphanCount(c.manual_overrides as any, { from: "zones", localField: "zoneId", foreignField: "id" }),
    detail: "manual_overrides.zoneId → zones.id",
  };
  results.orphan_overrides_user = {
    violations: await orphanCount(c.manual_overrides as any, { from: "users", localField: "userId", foreignField: "id" }),
    detail: "manual_overrides.userId → users.id",
  };
  results.orphan_sessions = {
    violations: await orphanCount(c.sessions as any, { from: "users", localField: "userId", foreignField: "id" }),
    detail: "sessions.userId → users.id",
  };

  const duplicateActive = await c.incidents.aggregate([
    { $match: { active: true } },
    { $group: { _id: "$zoneId", count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $count: "count" },
  ]).toArray();
  results.duplicate_active_incidents = {
    violations: duplicateActive[0]?.count ?? 0,
    detail: "maximum one active incident per zone",
  };

  const duplicateCommandVersions = await c.actuator_commands.aggregate([
    { $group: { _id: { zoneId: "$zoneId", commandVersion: "$commandVersion" }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $count: "count" },
  ]).toArray();
  results.duplicate_command_versions = {
    violations: duplicateCommandVersions[0]?.count ?? 0,
    detail: "actuator command version unique within each zone",
  };

  console.log("\nIntegrity Check Results");
  console.log("─".repeat(78));
  let total = 0;
  for (const [name, check] of Object.entries(results)) {
    total += check.violations;
    console.log(`${check.violations === 0 ? "✓ PASS" : "✗ FAIL"}  ${name.padEnd(38)} ${String(check.violations).padStart(4)}  ${check.detail}`);
  }
  console.log("─".repeat(78));
  if (total > 0) throw new Error(`Integrity check failed with ${total} violation(s)`);
  console.log("✓ All integrity checks passed.");
}

main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
