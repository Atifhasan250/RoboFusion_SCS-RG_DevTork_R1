import { collections } from "../db/collections";
import { mongoClient } from "../db/client";
import { id } from "../utils/id";
import { priorityScore, rankingReason } from "../risk/engine";
import { realtime } from "../realtime/hub";
import type { Incident, HazardType } from "../types";

// ── Acknowledge (fully transactional, race-safe) ──────────────────────────────
export async function acknowledge(incidentId: string, userId: string): Promise<Incident> {
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

  const committed = result as Incident | null;
  if (!committed) {
    throw Object.assign(new Error("Acknowledgment did not commit"), { httpStatus: 409, code: "CONFLICT" });
  }

  // Broadcast after commit
  realtime.emit("INCIDENT_ACKNOWLEDGED", {
    event_id: id(),
    event_type: "INCIDENT_ACKNOWLEDGED",
    occurred_at: new Date().toISOString(),
    data: { incident: committed },
    version: committed.version ?? 1,
  });
  realtime.emit("PRIORITY_QUEUE_UPDATED", {
    event_id: id(), event_type: "PRIORITY_QUEUE_UPDATED", occurred_at: new Date().toISOString(), data: {}, version: 0,
  });

  return committed;
}

// ── Priority Queue with deterministic ranking reason ─────────────────────────
export async function priorityQueue() {
  const c = await collections();
  const raw = await c.incidents
    .aggregate([
      { $match: { active: true, status: { $in: ["OPEN", "ACKNOWLEDGED"] } } },
      { $lookup: { from: "zones", localField: "zoneId", foreignField: "id", as: "zone" } },
      { $unwind: "$zone" },
      { $match: { "zone.configured": true } },
      { $lookup: { from: "zone_states", localField: "zoneId", foreignField: "zoneId", as: "zoneState" } },
      { $unwind: "$zoneState" },
      // Incidents remain active through WARNING, but only currently CRITICAL zones belong in the response queue.
      { $match: { "zoneState.safetyState": "CRITICAL" } },
      {
        $lookup: {
          from: "natural_language_reports",
          let: { incidentId: "$id", zoneCode: "$zone.code", hazard: "$primaryHazard" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$validationStatus", "ACCEPTED"] },
                    { $eq: ["$linkedIncidentId", "$$incidentId"] },
                    { $eq: ["$parsedZoneCode", "$$zoneCode"] },
                    { $eq: ["$parsedHazard", "$$hazard"] },
                    { $gte: ["$createdAt", new Date(Date.now() - 10 * 60 * 1000)] },
                  ],
                },
              },
            },
          ],
          as: "nlpReports",
        },
      },
    ])
    .toArray() as Array<Incident & {
      zone: { name: string; code: string; occupancy: boolean };
      zoneState: { criticalSince: Date | null; riskScore: number; occupied: boolean };
      nlpReports: Array<{ rankingBoost?: number }>;
    }>;

  const ranked = raw
    .map((incident) => {
      const criticalSince = incident.zoneState.criticalSince ?? incident.startedAt ?? incident.openedAt ?? new Date();
      const occupied = incident.zoneState.occupied ?? incident.zone.occupancy;
      const riskScore = incident.zoneState.riskScore ?? incident.riskScore ?? 0;
      const nlpBonus = Math.min(7, Math.max(0, ...incident.nlpReports.map(report => report.rankingBoost ?? 0)));
      const pScore = priorityScore(riskScore, occupied, criticalSince) + nlpBonus;
      const durationSecs = Math.max(0, (Date.now() - new Date(criticalSince).getTime()) / 1000);
      const durationBonus = Math.min(10, durationSecs / 30);
      return { incident, pScore, riskScore, occupied, criticalSince, durationBonus, nlpBonus };
    })
    .sort((a, b) => {
      if (b.pScore !== a.pScore) return b.pScore - a.pScore;
      if (b.riskScore !== a.riskScore) return b.riskScore - a.riskScore;
      if (a.occupied !== b.occupied) return a.occupied ? -1 : 1;
      const timeDiff = new Date(a.criticalSince).getTime() - new Date(b.criticalSince).getTime();
      if (timeDiff !== 0) return timeDiff;
      return a.incident.zone.code.localeCompare(b.incident.zone.code);
    });

  return ranked.map(({ incident, pScore, riskScore, occupied, criticalSince, durationBonus, nlpBonus }, index) => ({
    rank: index + 1,
    incident_id: incident.id,
    zone_id: incident.zoneId,
    zone_code: incident.zone.code,
    zone_name: incident.zone.name,
    status: incident.status,
    risk_score: riskScore,
    priority_score: Math.round(pScore * 100) / 100,
    occupancy: occupied,
    critical_duration_seconds: Math.round((Date.now() - new Date(criticalSince).getTime()) / 1000),
    primary_hazard: incident.primaryHazard ?? (incident.hazard as HazardType) ?? "NONE",
    started_at: incident.startedAt ?? incident.openedAt,
    acknowledged_at: incident.acknowledgedAt,
    nlp_advisory_bonus: nlpBonus,
    ranking_reason: rankingReason({
      zoneName: incident.zone.name,
      rank: index + 1,
      riskScore,
      occupied,
      primaryHazard: (incident.primaryHazard ?? incident.hazard ?? "NONE") as HazardType,
      criticalSince: new Date(criticalSince),
      durationBonus,
      hasNlpBonus: nlpBonus > 0,
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
    .sort({ occurredAt: 1, _id: 1 })
    .toArray();
  return { incident, events };
}
