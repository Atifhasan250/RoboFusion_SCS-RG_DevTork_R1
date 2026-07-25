import { collections } from "../db/collections";
import { realtime } from "../realtime/hub";
import { id } from "../utils/id";

/** Mark zones that have not sent a reading within their offline timeout as OFFLINE */
export async function markOfflineZones(maxAgeMs = 10_000) {
  const c = await collections();
  const now = new Date();
  const cutoff = new Date(Date.now() - maxAgeMs);

  // Find configured zones that haven't been heard from
  const stale = await c.zones.find({
    configured: true,
    lastReadingAt: { $lt: cutoff },
    state: { $nin: ["OFFLINE", "NOT_CONFIGURED"] },
  }).toArray();

  for (const zone of stale) {
    await c.zones.updateOne(
      { id: zone.id },
      { $set: { connectivityState: "OFFLINE", updatedAt: now } }
    );
    await c.zone_states.updateOne(
      { zoneId: zone.id },
      { $set: { connectivityState: "OFFLINE", updatedAt: now } },
      { upsert: true }
    );

    // Log event
    await c.incident_events.insertOne({
      id: id(),
      incidentId: null,
      zoneId: zone.id,
      eventType: "SENSOR_OFFLINE",
      eventSource: "BACKEND",
      actorUserId: null,
      description: `Zone ${zone.code} went offline (no reading for ${Math.round(maxAgeMs / 1000)}s)`,
      metadata: { maxAgeMs, lastReadingAt: zone.lastReadingAt },
      occurredAt: now,
    });

    realtime.emit("ZONE_CONNECTIVITY_CHANGED", {
      event_id: id(),
      event_type: "ZONE_CONNECTIVITY_CHANGED",
      occurred_at: now.toISOString(),
      data: { zone_id: zone.id, zone_code: zone.code, connectivity_state: "OFFLINE" },
      version: 0,
    });
  }

  return stale.length;
}

/** Mark a zone as ONLINE when it reconnects */
export async function markZoneOnline(zoneId: string, zoneCode: string) {
  const c = await collections();
  const now = new Date();

  await c.zones.updateOne({ id: zoneId }, { $set: { connectivityState: "ONLINE", updatedAt: now } });
  await c.zone_states.updateOne({ zoneId }, { $set: { connectivityState: "ONLINE", updatedAt: now } }, { upsert: true });

  await c.incident_events.insertOne({
    id: id(),
    incidentId: null,
    zoneId,
    eventType: "ZONE_RECONNECTED",
    eventSource: "BACKEND",
    actorUserId: null,
    description: `Zone ${zoneCode} reconnected`,
    metadata: { zoneCode },
    occurredAt: now,
  });

  realtime.emit("ZONE_CONNECTIVITY_CHANGED", {
    event_id: id(),
    event_type: "ZONE_CONNECTIVITY_CHANGED",
    occurred_at: now.toISOString(),
    data: { zone_id: zoneId, zone_code: zoneCode, connectivity_state: "ONLINE" },
    version: 0,
  });
}
