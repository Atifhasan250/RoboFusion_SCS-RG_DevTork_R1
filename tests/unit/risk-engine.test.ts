import { describe, expect, it } from "vitest";
import {
  calculateRisk,
  stateForRisk,
  priorityScore,
  rankingReason,
  applyHysteresis,
  normalize,
  RISK_WEIGHTS,
} from "../../src/server/risk/engine";

// ── PDF Section 13: Risk Formula ───────────────────────────────────────────────
describe("Risk Formula (PDF Section 13)", () => {
  it("uses PDF weights: fire=70, gas=70, water=70, occupancy=10", () => {
    expect(RISK_WEIGHTS.fire).toBe(70);
    expect(RISK_WEIGHTS.gas).toBe(70);
    expect(RISK_WEIGHTS.water).toBe(70);
    expect(RISK_WEIGHTS.occupancy).toBe(10);
  });

  it("caps risk score at 100", () => {
    const result = calculateRisk({ fireConfirmed: true, gasFactor: 1, waterFactor: 1, occupancy: true });
    expect(result.score).toBe(100);
  });

  it("fire alone (debounced) → CRITICAL (score 70)", () => {
    const result = calculateRisk({ fireConfirmed: true, gasFactor: 0, waterFactor: 0, occupancy: false });
    expect(result.score).toBe(70);
    expect(result.state).toBe("CRITICAL");
  });

  it("full gas alone → CRITICAL (score 70)", () => {
    const result = calculateRisk({ fireConfirmed: false, gasFactor: 1, waterFactor: 0, occupancy: false });
    expect(result.score).toBe(70);
    expect(result.state).toBe("CRITICAL");
  });

  it("full water alone → CRITICAL (score 70)", () => {
    const result = calculateRisk({ fireConfirmed: false, gasFactor: 0, waterFactor: 1, occupancy: false });
    expect(result.score).toBe(70);
    expect(result.state).toBe("CRITICAL");
  });

  it("occupancy alone cannot reach WARNING or CRITICAL", () => {
    const result = calculateRisk({ fireConfirmed: false, gasFactor: 0, waterFactor: 0, occupancy: true });
    expect(result.score).toBe(10);
    expect(result.state).toBe("SAFE");
  });

  it("moderate gas + moderate water → can reach WARNING", () => {
    // gasFactor=0.3 → 21, waterFactor=0.2 → 14, total=35 → WARNING
    const result = calculateRisk({ fireConfirmed: false, gasFactor: 0.3, waterFactor: 0.2, occupancy: false });
    expect(result.score).toBeGreaterThanOrEqual(30);
    expect(result.state).toBe("WARNING");
  });

  it("gas not warming up → 0 gas contribution when factor is 0", () => {
    const result = calculateRisk({ fireConfirmed: false, gasFactor: 0, waterFactor: 0, occupancy: false });
    expect(result.score).toBe(0);
    expect(result.state).toBe("SAFE");
  });
});

// ── PDF Section 13: State Thresholds ─────────────────────────────────────────
describe("State Thresholds (PDF Section 13)", () => {
  it("score < 30 → SAFE", () => expect(stateForRisk(29.99)).toBe("SAFE"));
  it("score = 30 → WARNING", () => expect(stateForRisk(30)).toBe("WARNING"));
  it("score = 64.99 → WARNING", () => expect(stateForRisk(64.99)).toBe("WARNING"));
  it("score = 65 → CRITICAL", () => expect(stateForRisk(65)).toBe("CRITICAL"));
  it("score = 100 → CRITICAL", () => expect(stateForRisk(100)).toBe("CRITICAL"));
});

// ── PDF Section 15: State Hysteresis ─────────────────────────────────────────
describe("State Hysteresis (PDF Section 15)", () => {
  it("SAFE + risk>=30 but only 1 reading → stays SAFE", () => {
    const result = applyHysteresis({
      currentState: "SAFE", newRiskScore: 35,
      consecutiveAboveThreshold: 1, consecutiveBelowThreshold: 0,
      recoveryStableMs: 0, fireJustConfirmed: false,
    });
    expect(result).toBe("SAFE");
  });

  it("SAFE + risk>=30 with 2 readings → transitions to WARNING", () => {
    const result = applyHysteresis({
      currentState: "SAFE", newRiskScore: 35,
      consecutiveAboveThreshold: 2, consecutiveBelowThreshold: 0,
      recoveryStableMs: 0, fireJustConfirmed: false,
    });
    expect(result).toBe("WARNING");
  });

  it("CRITICAL + risk<55 but only 2s → stays CRITICAL (need 5s)", () => {
    const result = applyHysteresis({
      currentState: "CRITICAL", newRiskScore: 40,
      consecutiveAboveThreshold: 0, consecutiveBelowThreshold: 3,
      recoveryStableMs: 2000, fireJustConfirmed: false,
    });
    expect(result).toBe("CRITICAL");
  });

  it("CRITICAL + risk<55 with 5s stable → transitions to WARNING", () => {
    const result = applyHysteresis({
      currentState: "CRITICAL", newRiskScore: 40,
      consecutiveAboveThreshold: 0, consecutiveBelowThreshold: 3,
      recoveryStableMs: 5000, fireJustConfirmed: false,
    });
    expect(result).toBe("WARNING");
  });

  it("WARNING + risk<25 with 5s stable → transitions to SAFE", () => {
    const result = applyHysteresis({
      currentState: "WARNING", newRiskScore: 20,
      consecutiveAboveThreshold: 0, consecutiveBelowThreshold: 3,
      recoveryStableMs: 5000, fireJustConfirmed: false,
    });
    expect(result).toBe("SAFE");
  });

  it("fire just confirmed → immediate CRITICAL regardless of hysteresis", () => {
    const result = applyHysteresis({
      currentState: "SAFE", newRiskScore: 70,
      consecutiveAboveThreshold: 0, consecutiveBelowThreshold: 0,
      recoveryStableMs: 0, fireJustConfirmed: true,
    });
    expect(result).toBe("CRITICAL");
  });
});

// ── PDF Section 18: Priority Score ───────────────────────────────────────────
describe("Priority Score (PDF Section 18)", () => {
  it("base = riskScore, no occupancy, fresh incident", () => {
    const criticalSince = new Date();
    const score = priorityScore(75, false, criticalSince);
    expect(score).toBeCloseTo(75, 0);
  });

  it("occupancy bonus = 10", () => {
    const criticalSince = new Date();
    const withOcc = priorityScore(75, true, criticalSince);
    const withoutOcc = priorityScore(75, false, criticalSince);
    expect(withOcc - withoutOcc).toBeCloseTo(10, 0);
  });

  it("duration bonus caps at 10 (after 300s)", () => {
    const criticalSince = new Date(Date.now() - 400_000); // 400s ago
    const score = priorityScore(75, false, criticalSince);
    expect(score).toBe(85); // 75 + 10 (max duration)
  });
});

// ── Ranking Reason ────────────────────────────────────────────────────────────
describe("Ranking Reason", () => {
  it("generates non-empty human-readable reason", () => {
    const reason = rankingReason({
      zoneName: "IoT Lab", rank: 1, riskScore: 88, occupied: true,
      primaryHazard: "FIRE", criticalSince: new Date(Date.now() - 60_000), durationBonus: 2,
    });
    expect(reason).toContain("IoT Lab");
    expect(reason).toContain("first");
    expect(reason.length).toBeGreaterThan(20);
  });
});

// ── Sensor Normalization ──────────────────────────────────────────────────────
describe("Sensor Normalization", () => {
  it("normalize clamps to 0-1", () => {
    expect(normalize(0, 100)).toBe(0);
    expect(normalize(50, 100)).toBe(0.5);
    expect(normalize(100, 100)).toBe(1);
    expect(normalize(200, 100)).toBe(1); // clamp
    expect(normalize(-10, 100)).toBe(0); // clamp
  });
});
