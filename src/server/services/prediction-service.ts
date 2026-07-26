import { collections } from "../db/collections";
import { predictRisk } from "../ml/inference";
import { id } from "../utils/id";

export async function calculateZonePrediction(zoneId: string, persist = false) {
  const c = await collections();
  const readings = await c.readings
    .find({ zoneId, isLate: false, isWarmingUp: false, sensorHealth: { $ne: "OFFLINE" } })
    .sort({ receivedAt: -1 })
    .limit(8)
    .toArray();

  const current = readings[0];
  if (!current) return null;

  const oldest = readings.at(-1)!;
  const elapsedSeconds = Math.max(
    1,
    (new Date(current.receivedAt).getTime() - new Date(oldest.receivedAt).getTime()) / 1000,
  );
  const slope = readings.length > 1
    ? (current.riskScore - oldest.riskScore) / elapsedSeconds / 100
    : 0;

  const features = {
    gas: current.normalized.gas,
    water: current.normalized.water,
    fire: current.fireFactor ?? (current.fire ? 1 : 0),
    occupancy: current.normalized.occupancy,
    slope,
  };
  const prediction = await predictRisk(features);
  const predictedAt = new Date();

  if (persist) {
    const recent = await c.predictions.findOne({
      zoneId,
      modelVersion: prediction.modelVersion,
      predictedAt: { $gte: new Date(Date.now() - 60_000) },
    });
    if (!recent) {
      await c.predictions.insertOne({
        id: id(),
        zoneId,
        source: "TRAINED_MODEL",
        probability: prediction.probability,
        modelVersion: prediction.modelVersion,
        horizonMinutes: 2,
        featureSnapshot: features,
        advisoryOnly: true,
        predictedAt,
      });
    }
  }

  return {
    probability: prediction.probability,
    modelVersion: prediction.modelVersion,
    advisoryOnly: true,
    horizonMinutes: 2,
    predictedAt,
    liveRiskScore: current.riskScore,
    featureSnapshot: features,
  };
}
