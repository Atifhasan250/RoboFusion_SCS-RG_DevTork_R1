import type { SafetyState, HazardType } from "../types";

// ── PDF-specified weights ─────────────────────────────────────────────────────
// PDF Section 13: Teams adapt their own formula. Weights updated to match architecture and test cases.
export const RISK_WEIGHTS = { fire: 70, gas: 70, water: 70, occupancy: 10 } as const;

// ── PDF Section 13: thresholds ────────────────────────────────────────────────
// SAFE < 30 | WARNING 30-64 | CRITICAL >= 65
export function stateForRisk(score: number): SafetyState {
  if (score >= 65) return "CRITICAL";
  if (score >= 30) return "WARNING";
  return "SAFE";
}

// ── Sensor normalization ──────────────────────────────────────────────────────
export function normalize(value: number, critical: number): number {
  return Math.max(0, Math.min(1, value / Math.max(1, critical)));
}

// ── Primary Hazard ────────────────────────────────────────────────────────────
export function primaryHazard(input: {
  fireConfirmed: boolean;
  gasFactor: number;
  waterFactor: number;
  occupancy: boolean;
}): HazardType {
  const candidates: { name: HazardType; score: number }[] = [
    { name: "FIRE", score: input.fireConfirmed ? 1 : 0 },
    { name: "GAS", score: input.gasFactor },
    { name: "FLOOD", score: input.waterFactor },
    { name: "OCCUPANCY", score: input.occupancy ? 0.1 : 0 },
  ];
  const top = candidates.sort((a, b) => b.score - a.score)[0];
  return top.score > 0 ? top.name : "NONE";
}

// ── Risk Calculation ──────────────────────────────────────────────────────────
export interface RiskInput {
  fireConfirmed: boolean;
  gasFactor: number;  // 0-1
  waterFactor: number; // 0-1
  occupancy: boolean;
}

export interface RiskResult {
  score: number;
  components: { fire: number; gas: number; water: number; occupancy: number };
  state: SafetyState;
  primaryHazard: HazardType;
}

export function calculateRisk(input: RiskInput): RiskResult {
  const fireComp = input.fireConfirmed ? RISK_WEIGHTS.fire : 0;
  const gasComp = input.gasFactor * RISK_WEIGHTS.gas;
  const waterComp = input.waterFactor * RISK_WEIGHTS.water;
  const occupancyComp = input.occupancy ? RISK_WEIGHTS.occupancy : 0;
  const raw = fireComp + gasComp + waterComp + occupancyComp;
  const score = Math.round(Math.min(100, raw) * 100) / 100;
  const components = {
    fire: Math.round(fireComp * 100) / 100,
    gas: Math.round(gasComp * 100) / 100,
    water: Math.round(waterComp * 100) / 100,
    occupancy: occupancyComp,
  };
  return {
    score,
    components,
    state: stateForRisk(score),
    primaryHazard: primaryHazard({
      fireConfirmed: input.fireConfirmed,
      gasFactor: input.gasFactor,
      waterFactor: input.waterFactor,
      occupancy: input.occupancy,
    }),
  };
}

// ── Priority Score (PDF Section 18) ──────────────────────────────────────────
// priority = riskScore + occupancyBonus(10) + durationBonus(min 10, seconds/30)
export function priorityScore(
  riskScore: number,
  occupied: boolean,
  criticalSince: Date,
): number {
  const durationSecs = Math.max(0, (Date.now() - criticalSince.getTime()) / 1000);
  const occupancyBonus = occupied ? 10 : 0;
  const durationBonus = Math.min(10, durationSecs / 30);
  return Math.round((riskScore + occupancyBonus + durationBonus) * 100) / 100;
}

// ── Ranking Reason Generator ──────────────────────────────────────────────────
export function rankingReason(params: {
  zoneName: string;
  rank: number;
  riskScore: number;
  occupied: boolean;
  primaryHazard: HazardType;
  criticalSince: Date;
  durationBonus: number;
  hasNlpBonus?: boolean;
}): string {
  const { zoneName, rank, riskScore, occupied, primaryHazard: hazard, criticalSince, durationBonus, hasNlpBonus } = params;
  const durationSecs = Math.round((Date.now() - criticalSince.getTime()) / 1000);
  const durationText = durationSecs >= 60
    ? `${Math.round(durationSecs / 60)} min`
    : `${durationSecs}s`;
  const ordinals = ["first", "second", "third", "fourth", "fifth"];
  const rankWord = ordinals[rank - 1] ?? `#${rank}`;
  const parts: string[] = [`${zoneName} is ranked ${rankWord}`];
  const reasons: string[] = [];
  if (riskScore >= 80) reasons.push(`critically high risk score of ${riskScore}`);
  else reasons.push(`risk score of ${riskScore}`);
  if (hazard !== "NONE" && hazard !== "OCCUPANCY") reasons.push(`active ${hazard.toLowerCase()} hazard`);
  if (occupied) reasons.push("confirmed occupancy");
  if (durationBonus > 0) reasons.push(`sustained critical for ${durationText}`);
  if (hasNlpBonus) reasons.push(`recent HIGH severity NLP report`);
  if (reasons.length) parts.push(`because it has ${reasons.join(", ")}.`);
  return parts.join(" ");
}

// ── Hysteresis State Transition (PDF Section 15) ──────────────────────────────
// ENTER WARNING:  risk >= 30 AND >= 2 consecutive valid readings
// ENTER CRITICAL: risk >= 65 AND >= 2 consecutive valid readings
//                 (fire debounce complete allows immediate critical)
// RECOVER CRITICAL→WARNING: risk < 55 AND >= 5s stable
// RECOVER WARNING→SAFE:     risk < 25 AND >= 5s stable
export interface HysteresisInput {
  currentState: SafetyState;
  newRiskScore: number;
  consecutiveAboveThreshold: number; // readings >= threshold
  consecutiveBelowThreshold: number; // readings < recovery threshold
  recoveryStableMs: number; // how long risk has been below recovery threshold
  fireJustConfirmed: boolean; // allows immediate CRITICAL on fire
}

export function applyHysteresis(input: HysteresisInput): SafetyState {
  const { currentState, newRiskScore, consecutiveAboveThreshold, consecutiveBelowThreshold, recoveryStableMs, fireJustConfirmed } = input;

  // Immediate CRITICAL on confirmed fire regardless of hysteresis
  if (fireJustConfirmed && newRiskScore >= 65) return "CRITICAL";

  switch (currentState) {
    case "SAFE":
      if (newRiskScore >= 65 && consecutiveAboveThreshold >= 2) return "CRITICAL";
      if (newRiskScore >= 30 && consecutiveAboveThreshold >= 2) return "WARNING";
      return "SAFE";

    case "WARNING":
      if (newRiskScore >= 65 && consecutiveAboveThreshold >= 2) return "CRITICAL";
      // Recover WARNING → SAFE: risk < 25 AND >= 5s stable
      if (newRiskScore < 25 && recoveryStableMs >= 5000) return "SAFE";
      return "WARNING";

    case "CRITICAL":
      // Recover CRITICAL → WARNING: risk < 55 AND >= 5s stable
      if (newRiskScore < 55 && recoveryStableMs >= 5000) return "WARNING";
      return "CRITICAL";

    default:
      return stateForRisk(newRiskScore);
  }
}
