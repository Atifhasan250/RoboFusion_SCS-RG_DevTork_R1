import { collections } from "../db/collections";
import { log } from "../utils/logger";
import { realtime } from "../realtime/hub";
import { id } from "../utils/id";
import type { Incident } from "../types";
import { priorityQueue } from "./incident-service";

/**
 * Re-emits durable database state after a process restart.
 * No in-memory state is trusted — everything is sourced from MongoDB Atlas.
 */
export async function recoverSystemState() {
  const c = await collections();
  const now = new Date();

  const [zones, openIncidents] = await Promise.all([
    c.zones.find({ configured: true }, { projection: { _id: 0, apiKeyHash: 0 } }).toArray(),
    c.incidents.find({ active: true }, { projection: { _id: 0 } }).toArray(),
  ]);
  const incidentByZone = new Map<string, Incident>(openIncidents.map(incident => [incident.zoneId, incident as Incident]));

  // Link restart evidence to the active incident when one exists, so its full timeline remains complete.
  if (zones.length > 0) {
    await c.incident_events.insertMany(zones.map(zone => ({
      id: id(),
      incidentId: incidentByZone.get(zone.id)?.id ?? null,
      zoneId: zone.id,
      eventType: "BACKEND_RESTARTED" as const,
      eventSource: "SYSTEM" as const,
      actorUserId: null,
      description: "Backend restarted; durable state reloaded from MongoDB Atlas",
      metadata: {
        activeIncidentId: incidentByZone.get(zone.id)?.id ?? null,
        recoveredSafetyState: zone.state,
        recoveredRiskScore: zone.riskScore,
        openIncidentCount: openIncidents.length,
      },
      occurredAt: now,
    })), { ordered: false });
  }

  const queue = await priorityQueue();
  realtime.emit("SNAPSHOT", {
    event_id: id(),
    event_type: "SNAPSHOT",
    occurred_at: now.toISOString(),
    data: { zones, incidents: openIncidents, priority_queue: queue },
    version: 0,
  });

  log("SYSTEM_RECOVERED", {
    zone_count: zones.length,
    open_incident_count: openIncidents.length,
    priority_queue_count: queue.length,
  });

  return { zones: zones.length, openIncidents: openIncidents.length };
}
