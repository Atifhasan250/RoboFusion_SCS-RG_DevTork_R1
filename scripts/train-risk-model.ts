import { mkdir, writeFile } from "fs/promises";

/**
 * Bonus 3 training pipeline.
 *
 * The model is deliberately small and auditable: logistic regression trained on
 * deterministic synthetic 500 ms multi-sensor trajectories. It predicts whether
 * a zone will reach CRITICAL within the next two minutes. The prediction remains
 * advisory-only and is never used by the actuator path.
 */

function mulberry32(seed: number) {
  return function random() {
    let value = seed += 0x6D2B79F5;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

const random = mulberry32(20260726);
const FEATURES = ["gas", "water", "fire", "occupancy", "slope"] as const;
const SAMPLE_INTERVAL_SECONDS = 0.5;
const HORIZON_STEPS = 240; // two minutes at 500 ms

type Sample = { x: number[]; y: 0 | 1 };
type Point = { gas: number; water: number; fire: number; occupancy: number; risk: number };

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function sigmoid(value: number) {
  return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, value))));
}

function risk(point: Omit<Point, "risk">) {
  return Math.min(100,
    70 * point.fire
    + 70 * point.gas
    + 70 * point.water
    + 10 * point.occupancy,
  );
}

function generateTrajectory(length: number): Point[] {
  const mode = Math.floor(random() * 6); // stable, gas, water, fire, gas+water, mixed
  const onset = 30 + Math.floor(random() * 100);
  const growth = 0.0025 + random() * 0.005;
  const occupiedBaseline = mode === 0 ? random() > 0.78 : random() > 0.28;
  let gas = random() * 0.12;
  let water = random() * 0.08;
  let fire = 0;
  const output: Point[] = [];

  for (let step = 0; step < length; step++) {
    const afterOnset = Math.max(0, step - onset);
    const noise = () => (random() - 0.5) * 0.012;

    if (mode === 0) {
      gas = clamp(gas * 0.985 + noise(), 0, 0.25);
      water = clamp(water * 0.985 + noise(), 0, 0.2);
      fire = 0;
    } else {
      const ramp = afterOnset * growth;
      if (mode === 1 || mode === 4 || mode === 5) gas = clamp(0.06 + ramp + noise());
      else gas = clamp(gas * 0.99 + noise(), 0, 0.25);

      if (mode === 2 || mode === 4 || mode === 5) water = clamp(0.03 + ramp * (0.85 + random() * 0.2) + noise());
      else water = clamp(water * 0.99 + noise(), 0, 0.2);

      if (mode === 3 || mode === 5) {
        // Fire appears after a rising precursor window and stays confirmed.
        const fireStep = onset + 55 + Math.floor(random() * 45);
        if (step >= fireStep) fire = 1;
      }
    }

    const occupancy = occupiedBaseline
      ? (random() > 0.08 ? 1 : 0)
      : (random() > 0.82 ? 1 : 0);
    const pointWithoutRisk = { gas, water, fire, occupancy };
    output.push({ ...pointWithoutRisk, risk: risk(pointWithoutRisk) });
  }

  return output;
}

function samplesFromTrajectories(sequenceCount: number, length = 560): Sample[] {
  const samples: Sample[] = [];
  for (let sequence = 0; sequence < sequenceCount; sequence++) {
    const trajectory = generateTrajectory(length);
    for (let step = 8; step < length - HORIZON_STEPS; step += 2) {
      const current = trajectory[step];
      const previous = trajectory[step - 8];
      const elapsed = 8 * SAMPLE_INTERVAL_SECONDS;
      const slope = clamp((current.risk - previous.risk) / elapsed / 100, -1, 1);
      const future = trajectory.slice(step + 1, step + HORIZON_STEPS + 1);
      const willBeCritical = future.some(point => point.risk >= 65) ? 1 : 0;
      samples.push({
        x: [current.gas, current.water, current.fire, current.occupancy, slope],
        y: willBeCritical,
      });
    }
  }
  return samples;
}

function balancedShuffle(rows: Sample[]) {
  const positives = rows.filter(row => row.y === 1);
  const negatives = rows.filter(row => row.y === 0);
  const positiveSize = Math.min(positives.length, Math.floor(negatives.length / 2));
  const negativeSize = Math.min(negatives.length, positiveSize * 2);
  if (positiveSize === 0 || negativeSize === 0) throw new Error("Synthetic dataset contains only one class");
  // Keep twice as many stable/non-critical windows so an idle zone stays low-probability.
  const result = [...positives.slice(0, positiveSize), ...negatives.slice(0, negativeSize)];
  for (let index = result.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function train(rows: Sample[]) {
  const weights = Array(FEATURES.length + 1).fill(0) as number[];
  const learningRate = 0.35;
  const regularization = 0.001;

  for (let epoch = 0; epoch < 900; epoch++) {
    const gradient = Array(weights.length).fill(0) as number[];
    for (const row of rows) {
      const probability = sigmoid(weights[0] + row.x.reduce((sum, value, index) => sum + value * weights[index + 1], 0));
      const error = probability - row.y;
      gradient[0] += error;
      row.x.forEach((value, index) => { gradient[index + 1] += error * value; });
    }
    for (let index = 0; index < weights.length; index++) {
      const penalty = index === 0 ? 0 : regularization * weights[index];
      weights[index] -= learningRate * (gradient[index] / rows.length + penalty);
    }
  }
  return weights;
}

function evaluate(rows: Sample[], weights: number[]) {
  let truePositive = 0;
  let trueNegative = 0;
  let falsePositive = 0;
  let falseNegative = 0;

  for (const row of rows) {
    const positive = sigmoid(weights[0] + row.x.reduce((sum, value, index) => sum + value * weights[index + 1], 0)) >= 0.5;
    if (positive && row.y) truePositive++;
    else if (positive) falsePositive++;
    else if (row.y) falseNegative++;
    else trueNegative++;
  }

  const precision = truePositive / Math.max(1, truePositive + falsePositive);
  const recall = truePositive / Math.max(1, truePositive + falseNegative);
  const specificity = trueNegative / Math.max(1, trueNegative + falsePositive);
  return {
    accuracy: (truePositive + trueNegative) / rows.length,
    precision,
    recall,
    specificity,
    f1: 2 * precision * recall / Math.max(Number.EPSILON, precision + recall),
    confusionMatrix: [[trueNegative, falsePositive], [falseNegative, truePositive]],
  };
}

async function main() {
  const trainingRows = balancedShuffle(samplesFromTrajectories(240));
  const testRows = balancedShuffle(samplesFromTrajectories(70));
  const weights = train(trainingRows);
  // Conservative calibration: keep a completely idle zone below the attention threshold.
  weights[0] -= 0.2;
  const metrics = evaluate(testRows, weights);
  const coefficients = Object.fromEntries(FEATURES.map((feature, index) => [feature, weights[index + 1]]));
  const noHazardProbability = sigmoid(weights[0]);

  if (metrics.accuracy < 0.75 || metrics.precision < 0.72 || metrics.recall < 0.60 || metrics.specificity < 0.72) {
    throw new Error(`Model validation failed: ${JSON.stringify(metrics)}`);
  }
  if (noHazardProbability > 0.15) throw new Error(`No-hazard probability is too high: ${noHazardProbability}`);
  if (coefficients.fire <= 0 || coefficients.slope <= 0) throw new Error("Fire and trend coefficients must be positive");

  await mkdir("models", { recursive: true });
  await writeFile("models/risk-model-v1.json", JSON.stringify({
    version: "v2-synthetic-2min",
    algorithm: "logistic-regression-gradient-descent",
    trainingData: "Deterministic synthetic 500 ms multi-sensor trajectories; stable, gas, water, fire and combined escalation profiles",
    horizonMinutes: 2,
    features: FEATURES,
    intercept: weights[0],
    coefficients,
    trainedAt: new Date().toISOString(),
    safety: "Advisory only. This output is excluded from all buzzer, relay and LED actuation decisions.",
  }, null, 2));
  await writeFile("models/metrics-v1.json", JSON.stringify({
    ...metrics,
    noHazardProbability,
    dataset: { total: trainingRows.length + testRows.length, train: trainingRows.length, test: testRows.length },
    horizonMinutes: 2,
    source: "Synthetic/simulated data",
    note: "Held-out validation for CRITICAL threshold crossing within the next two minutes. Metrics do not represent field performance.",
  }, null, 2));

  console.log("Training complete", { metrics, noHazardProbability, coefficients });
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
