import { collections } from "../db/collections";
import { realtime } from "../realtime/hub";
import { id } from "../utils/id";

/** Mark zones stale by transport timeout without changing their last known safety/risk state. */
export async function markOfflineZones(maxAgeMs = 10_000) {
  const c = await collections();
  const now = new Date();
  const cutoff = new Date(now.getTime() - maxAgeMs);
  const stale = await c.zones.find({
    configured: true,
    connectivityState: { $ne: "OFFLINE" },
    $or: [
      { lastReadingAt: { $lt: cutoff } },
      { lastReadingAt: null, createdAt: { $lt: cutoff } },
      { lastReadingAt: { $exists: false }, createdAt: { $lt: cutoff } },
    ],
  }).toArray();

  let markedOffline = 0;
  for (const zone of stale) {
    // Re-check staleness in the write filter. A reading may have arrived after the
    // initial query; without this guard the timeout job could incorrectly overwrite
    // a freshly reconnected zone as OFFLINE.
    const zoneUpdate = await c.zones.updateOne(
      {
        id: zone.id,
        configured: true,
        connectivityState: { $ne: "OFFLINE" },
        $or: [
          { lastReadingAt: { $lt: cutoff } },
          { lastReadingAt: null, createdAt: { $lt: cutoff } },
          { lastReadingAt: { $exists: false }, createdAt: { $lt: cutoff } },
        ],
      },
      { $set: { connectivityState: "OFFLINE", updatedAt: now } },
    );
    if (zoneUpdate.modifiedCount !== 1) continue;

    markedOffline += 1;
    const activeIncident = await c.incidents.findOne({ zoneId: zone.id, active: true });
    await Promise.all([
      c.zone_states.updateOne({ zoneId: zone.id }, { $set: { connectivityState: "OFFLINE", updatedAt: now } }),
      c.sensors.updateMany(
        { zoneId: zone.id, isRequired: true },
        { $set: { status: "OFFLINE", updatedAt: now } },
      ),
    ]);
    await c.incident_events.insertOne({
      id: id(),
      incidentId: activeIncident?.id ?? null,
      zoneId: zone.id,
      eventType: "SENSOR_OFFLINE",
      eventSource: "BACKEND",
      actorUserId: null,
      description: `Zone ${zone.code} went offline after ${Math.round(maxAgeMs / 1000)} seconds without a reading; last known safety state was preserved`,
      metadata: {
        maxAgeMs,
        lastReadingAt: zone.lastReadingAt,
        preservedState: zone.state,
        preservedRiskScore: zone.riskScore,
      },
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
  return markedOffline;
}

/** Explicit helper for external callers; ingestion normally records reconnection atomically itself. */
export async function markZoneOnline(zoneId: string, zoneCode: string) {
  const c = await collections();
  const now = new Date();
  const changed = await c.zones.updateOne(
    { id: zoneId, configured: true, connectivityState: "OFFLINE" },
    { $set: { connectivityState: "ONLINE", updatedAt: now } },
  );
  if (!changed.modifiedCount) return false;
  const activeIncident = await c.incidents.findOne({ zoneId, active: true });
  await Promise.all([
    c.zone_states.updateOne({ zoneId }, { $set: { connectivityState: "ONLINE", updatedAt: now } }),
    c.sensors.updateMany(
      { zoneId, isRequired: true, status: "OFFLINE" },
      { $set: { status: "ONLINE", lastSeenAt: now, updatedAt: now } },
    ),
  ]);
  await c.incident_events.insertOne({
    id: id(), incidentId: activeIncident?.id ?? null, zoneId, eventType: "ZONE_RECONNECTED", eventSource: "BACKEND",
    actorUserId: null, description: `Zone ${zoneCode} reconnected`, metadata: { zoneCode }, occurredAt: now,
  });
  realtime.emit("ZONE_CONNECTIVITY_CHANGED", {
    event_id: id(), event_type: "ZONE_CONNECTIVITY_CHANGED", occurred_at: now.toISOString(),
    data: { zone_id: zoneId, zone_code: zoneCode, connectivity_state: "ONLINE" }, version: 0,
  });
  return true;
}
