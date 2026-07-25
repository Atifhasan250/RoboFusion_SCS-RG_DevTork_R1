import { mkdir, writeFile } from "fs/promises";

// Seeded PRNG
function mulberry32(a: number) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}
const rand = mulberry32(12345);

type Sample = { x: number[]; y: 0 | 1 };
const sig = (n: number) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, n))));

function generateTimeSeriesData(numSequences = 100, length = 50): Sample[] {
  const samples: Sample[] = [];
  
  for (let seq = 0; seq < numSequences; seq++) {
    // Generate a random trajectory for the zone
    let gas = rand() * 0.5;
    let water = rand() * 0.5;
    let fire = 0;
    let occ = 0;
    
    // Some sequences will escalate
    const escalates = rand() > 0.5;
    const trajectory = [];
    
    for (let t = 0; t < length; t++) {
      if (escalates) {
        gas = Math.min(1.0, gas + rand() * 0.1);
        water = Math.min(1.0, water + rand() * 0.1);
        if (t > length / 2 && rand() > 0.8) fire = 1;
      } else {
        gas = Math.max(0, gas + (rand() - 0.5) * 0.1);
        water = Math.max(0, water + (rand() - 0.5) * 0.1);
        if (rand() > 0.95) fire = 1; else fire = 0;
      }
      occ = rand() > 0.5 ? 1 : 0;
      
      const risk = Math.min(100, 70 * fire + 70 * gas + 70 * water + 10 * occ);
      trajectory.push({ gas, water, fire, occ, risk });
    }
    
    // We want to predict if it will be CRITICAL (risk >= 65) in 5 steps (time horizon)
    const horizon = 5;
    for (let t = 1; t < length - horizon; t++) {
      const current = trajectory[t];
      const prev = trajectory[t-1];
      const slope = (current.risk - prev.risk) / 100; // normalize slope
      
      // Target: is there a critical state in the next `horizon` steps?
      let willBeCritical = 0 as 0 | 1;
      for (let f = 1; f <= horizon; f++) {
        if (trajectory[t + f].risk >= 65) {
          willBeCritical = 1;
          break;
        }
      }
      
      samples.push({
        x: [current.gas, current.water, current.fire, current.occ, slope],
        y: willBeCritical
      });
    }
  }
  
  // Balance the dataset
  const positives = samples.filter(s => s.y === 1);
  const negatives = samples.filter(s => s.y === 0);
  const minCount = Math.min(positives.length, negatives.length);
  
  // Downsample to match class balance
  const balanced = [
    ...positives.slice(0, minCount),
    ...negatives.slice(0, minCount)
  ];
  
  // Shuffle
  for (let i = balanced.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [balanced[i], balanced[j]] = [balanced[j], balanced[i]];
  }
  
  return balanced;
}

function train(rows: Sample[]) {
  const w = [0, 0, 0, 0, 0, 0];
  const learningRate = 0.1;
  const epochs = 1000;
  
  for (let epoch = 0; epoch < epochs; epoch++) {
    const g = Array(6).fill(0);
    for (const { x, y } of rows) {
      const p = sig(w[0] + x.reduce((s, v, i) => s + v * w[i + 1], 0));
      const e = p - y;
      g[0] += e;
      x.forEach((v, i) => g[i + 1] += e * v);
    }
    w.forEach((_, i) => w[i] -= (learningRate * g[i]) / rows.length);
  }
  return w;
}

function evaluate(rows: Sample[], w: number[]) {
  let tp = 0, tn = 0, fp = 0, fn = 0;
  for (const { x, y } of rows) {
    const p = sig(w[0] + x.reduce((s, v, i) => s + v * w[i + 1], 0)) >= 0.5 ? 1 : 0;
    if (p && y) tp++;
    else if (p) fp++;
    else if (y) fn++;
    else tn++;
  }
  
  const precision = tp / (tp + fp || 1);
  const recall = tp / (tp + fn || 1);
  const specificity = tn / (tn + fp || 1);
  const accuracy = (tp + tn) / rows.length;
  
  return {
    accuracy,
    precision,
    recall,
    specificity,
    f1: 2 * precision * recall / (precision + recall || 1),
    confusionMatrix: [[tn, fp], [fn, tp]]
  };
}

async function main() {
  const rows = generateTimeSeriesData(200, 50);
  const split = Math.floor(rows.length * 0.8);
  const trainData = rows.slice(0, split);
  const testData = rows.slice(split);
  
  const weights = train(trainData);
  const metrics = evaluate(testData, weights);
  
  await mkdir("models", { recursive: true });
  await writeFile("models/risk-model-v1.json", JSON.stringify({
    version: "v1",
    algorithm: "logistic-regression-gradient-descent",
    trainingData: "Synthetic simulated multi-sensor time-series (Horizon=5)",
    features: ["gas", "water", "fire", "occupancy", "slope"],
    intercept: weights[0],
    coefficients: Object.fromEntries(["gas", "water", "fire", "occupancy", "slope"].map((n, i) => [n, weights[i + 1]])),
    trainedAt: new Date().toISOString()
  }, null, 2));
  
  await writeFile("models/metrics-v1.json", JSON.stringify({
    ...metrics,
    dataset: { total: rows.length, train: trainData.length, test: testData.length },
    note: "Simulated prediction of CRITICAL threshold crossing within future horizon."
  }, null, 2));
  
  console.log("Training complete. Metrics:", metrics);
}

main().catch(e => { console.error(e); process.exit(1); });
