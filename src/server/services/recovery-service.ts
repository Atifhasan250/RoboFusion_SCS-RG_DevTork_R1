import { collections } from "../db/collections";
import { log } from "../utils/logger";
import { realtime } from "../realtime/hub";
import { id } from "../utils/id";

/**
 * Re-emits durable database state after a process restart.
 * No in-memory state is trusted — everything is sourced from MongoDB.
 */
export async function recoverSystemState() {
  const c = await collections();
  const now = new Date();

  const zones = await c.zones.find({ configured: true }, { projection: { _id: 0, apiKeyHash: 0 } }).toArray();
  const openIncidents = await c.incidents.find({ active: true }, { projection: { _id: 0 } }).toArray();
  const priorityCount = openIncidents.filter(i => i.status === "OPEN").length;

  // Log restart event to incident_events for each active zone
  for (const zone of zones) {
    await c.incident_events.insertOne({
      id: id(),
      incidentId: null,
      zoneId: zone.id,
      eventType: "BACKEND_RESTARTED",
      eventSource: "SYSTEM",
      actorUserId: null,
      description: "Backend restarted; state reloaded from MongoDB",
      metadata: { openIncidentCount: openIncidents.length },
      occurredAt: now,
    });
  }

  // Broadcast snapshot to any already-connected WS clients
  realtime.emit("SNAPSHOT", {
    event_id: id(),
    event_type: "SNAPSHOT",
    occurred_at: now.toISOString(),
    data: { zones, incidents: openIncidents },
    version: 0,
  });

  log("SYSTEM_RECOVERED", {
    zone_count: zones.length,
    open_incident_count: openIncidents.length,
    priority_queue_count: priorityCount,
  });

  return { zones: zones.length, openIncidents: openIncidents.length };
}
