import { collections } from "../db/collections";
import { priorityQueue } from "./incident-service";
import { predictRisk } from "../ml/inference";
import { RISK_WEIGHTS } from "../risk/engine";

/**
 * Builds the single authoritative dashboard snapshot used by REST, WebSocket and SSE.
 * Keeping these transports on one code path prevents the UI from receiving different
 * zone/incident shapes after a reconnect.
 */
export async function dashboardSnapshot() {
  const c = await collections();
  const [baseZones, states, sensors, incidents, queue, latestPredictions] = await Promise.all([
    c.zones
      .find({ configured: true }, { projection: { _id: 0, apiKeyHash: 0 } })
      .sort({ code: 1 })
      .toArray(),
    c.zone_states.find({}, { projection: { _id: 0 } }).toArray(),
    c.sensors
      .find({ isEnabled: true }, { projection: { _id: 0 } })
      .sort({ zoneId: 1, sensorType: 1 })
      .toArray(),
    c.incidents
      .find({ active: true }, { projection: { _id: 0 } })
      .sort({ startedAt: -1 })
      .toArray(),
    priorityQueue(),
    c.predictions
      .aggregate([
        { $sort: { predictedAt: -1 } },
        { $group: { _id: "$zoneId", prediction: { $first: "$$ROOT" } } },
        { $replaceRoot: { newRoot: "$prediction" } },
        { $project: { _id: 0 } },
      ])
      .toArray(),
  ]);

  const stateByZone = new Map(states.map(state => [state.zoneId, state]));
  const sensorsByZone = new Map<string, typeof sensors>();
  for (const sensor of sensors) {
    const list = sensorsByZone.get(sensor.zoneId) ?? [];
    list.push(sensor);
    sensorsByZone.set(sensor.zoneId, list);
  }
  const storedPredictionByZone = new Map(latestPredictions.map(prediction => [prediction.zoneId as string, prediction]));
  const livePredictionEntries = await Promise.all(baseZones.map(async zone => {
    const state = stateByZone.get(zone.id);
    if (!state?.lastReceivedAt || state.connectivityState === "OFFLINE" || state.connectivityState === "NOT_CONFIGURED") {
      return [zone.id, null] as const;
    }

    const scores = state.recentRiskScores ?? [];
    const elapsedSeconds = Math.max(0.5, Math.max(1, scores.length - 1) * 0.5);
    const slope = scores.length > 1
      ? ((scores.at(-1) ?? 0) - (scores[0] ?? 0)) / elapsedSeconds / 100
      : 0;
    try {
      const model = await predictRisk({
        fire: Math.max(0, Math.min(1, state.riskComponents.fire / RISK_WEIGHTS.fire)),
        gas: Math.max(0, Math.min(1, state.riskComponents.gas / RISK_WEIGHTS.gas)),
        water: Math.max(0, Math.min(1, state.riskComponents.water / RISK_WEIGHTS.water)),
        occupancy: state.occupied ? 1 : 0,
        slope,
      });
      return [zone.id, {
        probability: model.probability,
        horizonMinutes: 2,
        modelVersion: model.modelVersion,
        advisoryOnly: true,
        predictedAt: new Date(),
      }] as const;
    } catch {
      // A bonus-model failure must never take the core live dashboard offline.
      return [zone.id, storedPredictionByZone.get(zone.id) ?? null] as const;
    }
  }));
  const predictionByZone = new Map(livePredictionEntries);

  const zones = baseZones.map(zone => {
    const state = stateByZone.get(zone.id);
    const latestPrediction = predictionByZone.get(zone.id) ?? null;
    return {
      ...zone,
      // zone_states is authoritative; the duplicated zone fields remain for fast reads.
      state: state?.safetyState ?? zone.state,
      connectivityState: state?.connectivityState ?? zone.connectivityState,
      riskScore: state?.riskScore ?? zone.riskScore,
      primaryHazard: state?.primaryHazard ?? zone.primaryHazard ?? "NONE",
      occupancy: state?.occupied ?? zone.occupancy,
      riskComponents: state?.riskComponents ?? { fire: 0, gas: 0, water: 0, occupancy: 0 },
      recentRiskScores: state?.recentRiskScores ?? [],
      isTrendingCritical: state?.isTrendingCritical ?? false,
      warningSince: state?.warningSince ?? null,
      criticalSince: state?.criticalSince ?? null,
      lastObservedAt: state?.lastObservedAt ?? null,
      lastReceivedAt: state?.lastReceivedAt ?? zone.lastReadingAt ?? null,
      stateVersion: state?.stateVersion ?? 0,
      sensors: (sensorsByZone.get(zone.id) ?? []).map(sensor => ({
        id: sensor.id,
        sensorType: sensor.sensorType,
        status: sensor.status,
        lastSeenAt: sensor.lastSeenAt,
        warmupSeconds: sensor.warmupSeconds,
      })),
      prediction: latestPrediction
        ? {
            probability: latestPrediction.probability,
            horizonMinutes: latestPrediction.horizonMinutes,
            modelVersion: latestPrediction.modelVersion,
            advisoryOnly: true,
            predictedAt: latestPrediction.predictedAt,
          }
        : null,
    };
  });

  const health = {
    configured_zones: zones.length,
    online_zones: zones.filter(zone => zone.connectivityState === "ONLINE").length,
    degraded_zones: zones.filter(zone => zone.connectivityState === "DEGRADED").length,
    offline_zones: zones.filter(zone => zone.connectivityState === "OFFLINE").length,
    critical_zones: zones.filter(zone => zone.state === "CRITICAL").length,
    warning_zones: zones.filter(zone => zone.state === "WARNING").length,
    safe_zones: zones.filter(zone => zone.state === "SAFE").length,
    open_incidents: incidents.filter(incident => incident.status === "OPEN").length,
    acknowledged_incidents: incidents.filter(incident => incident.status === "ACKNOWLEDGED").length,
  };

  return {
    snapshot_at: new Date().toISOString(),
    zones,
    incidents,
    priority_queue: queue,
    system_health: health,
  };
}
