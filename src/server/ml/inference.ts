import { readFile } from "fs/promises";
import path from "path";
import { env } from "../config/env";

export interface RiskFeatures {
  gas: number;
  water: number;
  fire: number;
  occupancy: number;
  slope: number;
}

type Model = {
  version: string;
  intercept: number;
  coefficients: Record<keyof RiskFeatures, number>;
};

let model: Model | undefined;

async function loadModel(): Promise<Model> {
  if (!model) {
    const file = path.join(process.cwd(), env.ML_MODEL_PATH);
    model = JSON.parse(await readFile(file, "utf8")) as Model;
  }
  return model;
}

export async function modelReady() {
  const loaded = await loadModel();
  return { loaded: true, version: loaded.version };
}

export async function predictRisk(input: RiskFeatures) {
  const currentModel = await loadModel();
  const logit = currentModel.intercept + Object.entries(currentModel.coefficients)
    .reduce((sum, [key, weight]) => sum + input[key as keyof RiskFeatures] * weight, 0);
  return {
    probability: Math.round((1 / (1 + Math.exp(-logit))) * 10_000) / 10_000,
    modelVersion: currentModel.version,
    advisoryOnly: true,
  };
}
