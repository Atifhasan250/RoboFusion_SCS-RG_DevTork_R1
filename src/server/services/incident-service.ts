import { collections } from "../db/collections";
import { mongoClient } from "../db/client";
import { id } from "../utils/id";
import { priorityScore, rankingReason } from "../risk/engine";
import { realtime } from "../realtime/hub";
import type { Incident, HazardType } from "../types";

// ── Acknowledge (fully transactional, race-safe) ──────────────────────────────
export async function acknowledge(incidentId: string, userId: string) {
  const c = await collections();
  const client = await mongoClient();
  const session = client.startSession();
  let result: Incident | null = null;

  try {
    await session.withTransaction(async () => {
      const now = new Date();

      // Atomic: only succeeds if incident is OPEN and not yet acknowledged
      result = await c.incidents.findOneAndUpdate(
        { id: incidentId, active: true, status: "OPEN", acknowledgedAt: null },
        {
          $set: { status: "ACKNOWLEDGED", acknowledgedAt: now, acknowledgedBy: userId, updatedAt: now },
          $inc: { version: 1 },
        },
        { returnDocument: "after", session }
      ) as unknown as Incident | null;

      if (!result) {
        // Check why it failed
        const incident = await c.incidents.findOne({ id: incidentId }, { session });
        if (!incident) throw Object.assign(new Error("Incident not found"), { httpStatus: 404, code: "NOT_FOUND" });
        if (incident.status === "ACKNOWLEDGED") throw Object.assign(new Error("Already acknowledged"), { httpStatus: 409, code: "ALREADY_ACKNOWLEDGED", acknowledgedBy: incident.acknowledgedBy, acknowledgedAt: incident.acknowledgedAt });
        if (incident.status === "RESOLVED") throw Object.assign(new Error("Incident already resolved"), { httpStatus: 409, code: "ALREADY_RESOLVED" });
        throw Object.assign(new Error("Acknowledgment conflict"), { httpStatus: 409, code: "CONFLICT" });
      }

      // Insert into dedicated acknowledgments collection (unique per incident)
      await c.acknowledgments.insertOne({
        id: id(),
        incidentId,
        userId,
        acknowledgedAt: now,
      }, { session });

      // Record event
      await c.incident_events.insertOne({
        id: id(),
        incidentId,
        zoneId: result.zoneId,
        eventType: "INCIDENT_ACKNOWLEDGED",
        eventSource: "USER",
        actorUserId: userId,
        description: `Incident acknowledged by user ${userId}`,
        metadata: { incidentId, userId },
        occurredAt: now,
      }, { session });

      await c.audits.insertOne({ id: id(), type: "INCIDENT_ACKNOWLEDGED", incidentId, actorId: userId, createdAt: now }, { session });
    });
  } finally {
    await session.endSession();
  }

  // Broadcast after commit
  realtime.emit("INCIDENT_ACKNOWLEDGED", {
    event_id: id(),
    event_type: "INCIDENT_ACKNOWLEDGED",
    occurred_at: new Date().toISOString(),
    data: { incident: result },
    version: result ? (result as Incident).version ?? 1 : 1,
  });
  realtime.emit("PRIORITY_QUEUE_UPDATED", {
    event_id: id(), event_type: "PRIORITY_QUEUE_UPDATED", occurred_at: new Date().toISOString(), data: {}, version: 0,
  });

  return result;
}

// ── Priority Queue with ranking reason ───────────────────────────────────────
export async function priorityQueue() {
  const c = await collections();
  const raw = await c.incidents
    .aggregate([
      { $match: { active: true, status: { $in: ["OPEN", "ACKNOWLEDGED"] } } },
      { $lookup: { from: "zones", localField: "zoneId", foreignField: "id", as: "zone" } },
      { $unwind: "$zone" },
      { $lookup: { from: "zone_states", localField: "zoneId", foreignField: "zoneId", as: "zoneState" } },
      { $unwind: { path: "$zoneState", preserveNullAndEmptyArrays: true } },
    ])
    .toArray() as Array<Incident & { zone: { name: string; code: string; occupancy: boolean }; zoneState?: { criticalSince: Date | null; riskScore: number } }>;

  const ranked = raw
    .map((inc) => {
      const criticalSince = inc.zoneState?.criticalSince ?? inc.startedAt ?? inc.openedAt ?? new Date();
      const occupied = inc.zone.occupancy;
      const riskScore = inc.peakRiskScore ?? inc.riskScore ?? 0;
      const pScore = priorityScore(riskScore, occupied, criticalSince);
      const durationSecs = Math.max(0, (Date.now() - new Date(criticalSince).getTime()) / 1000);
      const durationBonus = Math.min(10, durationSecs / 30);
      return { inc, pScore, riskScore, occupied, criticalSince, durationBonus };
    })
    .sort((a, b) => {
      if (b.pScore !== a.pScore) return b.pScore - a.pScore;
      if (b.riskScore !== a.riskScore) return b.riskScore - a.riskScore;
      if (a.occupied !== b.occupied) return a.occupied ? -1 : 1;
      return new Date(a.criticalSince).getTime() - new Date(b.criticalSince).getTime();
    });

  return ranked.map(({ inc, pScore, riskScore, occupied, criticalSince, durationBonus }, idx) => ({
    rank: idx + 1,
    incident_id: inc.id,
    zone_id: inc.zoneId,
    zone_code: inc.zone.code,
    zone_name: inc.zone.name,
    status: inc.status,
    risk_score: riskScore,
    priority_score: pScore,
    occupancy: occupied,
    critical_duration_seconds: Math.round((Date.now() - new Date(criticalSince).getTime()) / 1000),
    primary_hazard: inc.primaryHazard ?? (inc.hazard as HazardType) ?? "NONE",
    started_at: inc.startedAt ?? inc.openedAt,
    acknowledged_at: inc.acknowledgedAt,
    ranking_reason: rankingReason({
      zoneName: inc.zone.name,
      rank: idx + 1,
      riskScore,
      occupied,
      primaryHazard: (inc.primaryHazard ?? inc.hazard ?? "NONE") as HazardType,
      criticalSince: new Date(criticalSince),
      durationBonus,
    }),
  }));
}

// ── Incident Timeline ─────────────────────────────────────────────────────────
export async function incidentTimeline(incidentId: string) {
  const c = await collections();
  const incident = await c.incidents.findOne({ id: incidentId }, { projection: { _id: 0 } });
  if (!incident) return null;
  const events = await c.incident_events
    .find({ incidentId }, { projection: { _id: 0 } })
    .sort({ occurredAt: 1 })
    .toArray();
  return { incident, events };
}
