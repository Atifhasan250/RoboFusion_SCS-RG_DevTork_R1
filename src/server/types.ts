import type { ObjectId } from "mongodb";

// ── Core State Types ──────────────────────────────────────────────────────────
export type SafetyState = "SAFE" | "WARNING" | "CRITICAL";
export type ConnectivityState = "ONLINE" | "DEGRADED" | "OFFLINE" | "NOT_CONFIGURED";
/** Legacy union kept for backward compat within old zone.state usages */
export type ZoneState = SafetyState | "OFFLINE" | "NOT_CONFIGURED";
export type Role = "ADMIN" | "SECURITY_STAFF";
export type IncidentStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
export type HazardType = "FIRE" | "GAS" | "FLOOD" | "OCCUPANCY" | "NONE";
export type CommandSource = "SENSOR_STATE" | "MANUAL_OVERRIDE" | "SYSTEM_RECOVERY";
export type LedState = "GREEN" | "YELLOW" | "RED" | "BLUE" | "OFF";
export type EventType =
  | "SENSOR_READING_ACCEPTED"
  | "SENSOR_READING_REJECTED"
  | "SENSOR_OFFLINE"
  | "SENSOR_ONLINE"
  | "ZONE_WARNING"
  | "ZONE_CRITICAL"
  | "ZONE_SAFE"
  | "ZONE_DEGRADED"
  | "INCIDENT_OPENED"
  | "INCIDENT_ACKNOWLEDGED"
  | "INCIDENT_RESOLVED"
  | "BUZZER_ACTIVATED"
  | "BUZZER_DEACTIVATED"
  | "RELAY_CUTOFF_ACTIVATED"
  | "RELAY_RESET"
  | "MANUAL_OVERRIDE_APPLIED"
  | "MANUAL_OVERRIDE_CLEARED"
  | "BACKEND_RESTARTED"
  | "ZONE_RECONNECTED"
  | "CACHED_READINGS_SYNCED"
  | "PREDICTION_UPDATED"
  | "NATURAL_LANGUAGE_REPORT_ACCEPTED"
  | "NATURAL_LANGUAGE_REPORT_REJECTED";

export type EventSource = "SENSOR" | "BACKEND" | "USER" | "MANUAL_OVERRIDE" | "SYSTEM" | "ML" | "NLP";

// ── Zone (core identity/config) ───────────────────────────────────────────────
export interface Zone {
  _id?: ObjectId;
  id: string;
  code: string;
  name: string;
  configured: boolean;
  apiKeyHash?: string;
  // Derived live state (kept on zone for fast reads; zone_states is authoritative)
  state: ZoneState;
  riskScore: number;
  primaryHazard: HazardType | null;
  occupancy: boolean;
  cameraOccupancy?: boolean;
  connectivityState: ConnectivityState;
  lastReadingAt?: Date;
  lastSequence?: number;
  commandVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

// ── Zone State (authoritative durable state — separate collection) ─────────────
export interface ZoneStateDoc {
  _id?: ObjectId;
  zoneId: string; // unique ref → zones.id
  safetyState: SafetyState;
  connectivityState: ConnectivityState;
  riskScore: number;
  riskComponents: { fire: number; gas: number; water: number; occupancy: number };
  primaryHazard: HazardType;
  occupied: boolean;
  lastReadingId: string | null;
  lastObservedAt: Date | null;
  lastReceivedAt: Date | null;
  // Hysteresis tracking
  warningSince: Date | null;
  criticalSince: Date | null;
  consecutiveWarningReadings: number;
  consecutiveCriticalReadings: number;
  consecutiveSafeReadings: number;
  // Fire debounce
  firePositiveCount: number;
  fireClearCount: number;
  fireConfirmed: boolean;
  fireConfirmedAt: Date | null;
  // Version for optimistic concurrency
  stateVersion: number;
  updatedAt: Date;
}

// ── Sensor Calibration ────────────────────────────────────────────────────────
export interface SensorCalibration {
  _id?: ObjectId;
  id: string;
  zoneId: string; // ref → zones.id
  sensorType: "FIRE" | "GAS" | "WATER" | "PIR" | "CAMERA";
  rawMin: number;
  rawMax: number;
  baselineRaw: number;
  criticalRaw: number;
  direction: "ASCENDING" | "DESCENDING";
  warmupSeconds: number;
  debounceCount: number;
  isRequired: boolean;
  isEnabled: boolean;
  status: "ONLINE" | "OFFLINE" | "DEGRADED" | "WARMING_UP" | "NOT_CONFIGURED";
  lastSeenAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// ── Reading ───────────────────────────────────────────────────────────────────
export interface Reading {
  _id?: ObjectId;
  id: string;
  zoneId: string;
  bootId: string;
  sequence: number;
  receivedAt: Date;
  observedAt: Date;
  uptimeMs: number;
  sampleIntervalMs: number;
  fire: boolean;
  gas: number;
  water: number;
  pir: boolean;
  cameraOccupancy?: boolean | null;
  sensorHealth: "HEALTHY" | "DEGRADED" | "OFFLINE";
  sensorStatus?: Record<string, string>;
  // Computed
  fireFactor: number;
  gasFactor: number;
  waterFactor: number;
  occupancyFactor: number;
  riskScore: number;
  riskComponents: { fire: number; gas: number; water: number; occupancy: number };
  calculatedState: SafetyState;
  primaryHazard: HazardType;
  isLate: boolean;
  isWarmingUp: boolean;
  normalized: { gas: number; water: number; occupancy: number };
}

// ── Incident ──────────────────────────────────────────────────────────────────
export interface Incident {
  _id?: ObjectId;
  id: string;
  zoneId: string; // ref → zones.id
  status: IncidentStatus;
  active: boolean; // true while OPEN or ACKNOWLEDGED
  severity: "CRITICAL";
  primaryHazard: HazardType;
  initialRiskScore: number;
  peakRiskScore: number;
  startedAt: Date;
  acknowledgedAt?: Date | null;
  acknowledgedBy?: string | null; // ref → users.id
  resolvedAt?: Date | null;
  resolutionReason?: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  // Legacy compat fields
  openedAt?: Date;
  riskScore?: number;
  hazard?: string;
  commandVersion?: number;
}

// ── Incident Events ───────────────────────────────────────────────────────────
export interface IncidentEvent {
  _id?: ObjectId;
  id: string;
  incidentId: string | null; // ref → incidents.id
  zoneId: string; // ref → zones.id
  eventType: EventType;
  eventSource: EventSource;
  actorUserId: string | null; // ref → users.id
  description: string;
  metadata: Record<string, unknown>;
  occurredAt: Date;
}

// ── Acknowledgment ────────────────────────────────────────────────────────────
export interface Acknowledgment {
  _id?: ObjectId;
  id: string;
  incidentId: string; // unique ref → incidents.id
  userId: string; // ref → users.id
  acknowledgedAt: Date;
  note?: string;
}

// ── Actuator Command ──────────────────────────────────────────────────────────
export interface ActuatorCommand {
  _id?: ObjectId;
  id: string;
  zoneId: string; // ref → zones.id
  incidentId: string | null; // ref → incidents.id
  stateVersion: number;
  safetyState: SafetyState | "OFFLINE";
  led: LedState;
  buzzer: boolean;
  relayCutoff: boolean;
  commandSource: CommandSource;
  createdAt: Date;
  acknowledgedAt: Date | null;
  appliedAt: Date | null;
}

// ── Manual Override ───────────────────────────────────────────────────────────
export interface ManualOverride {
  _id?: ObjectId;
  id: string;
  zoneId: string; // ref → zones.id
  userId: string; // ref → users.id
  action: "SILENCE" | "RESET" | "TEST_ACTUATOR";
  reason: string;
  startedAt: Date;
  expiresAt: Date;
  clearedAt: Date | null;
  status: "ACTIVE" | "EXPIRED" | "CLEARED";
  active: boolean;
}

// ── Prediction ────────────────────────────────────────────────────────────────
export interface Prediction {
  _id?: ObjectId;
  id: string;
  zoneId: string; // ref → zones.id
  source: "TRAINED_MODEL" | "GEMINI_ADVISORY" | "OPENROUTER_ADVISORY";
  modelVersion: string;
  probability: number;
  horizonMinutes: number;
  featureSnapshot: Record<string, number>;
  advisoryOnly: boolean;
  predictedAt: Date;
}

// ── Natural Language Report ───────────────────────────────────────────────────
export interface NaturalLanguageReport {
  _id?: ObjectId;
  id: string;
  userId: string; // ref → users.id
  rawText: string;
  provider: "gemini" | "openrouter" | "deterministic";
  parsedZoneCode: string | null;
  parsedHazard: HazardType | null;
  estimatedSeverity: "LOW" | "MEDIUM" | "HIGH" | null;
  summary: string | null;
  validationStatus: "ACCEPTED" | "REJECTED";
  createdAt: Date;
}

// ── Audit Event ───────────────────────────────────────────────────────────────
export interface AuditEvent {
  _id?: ObjectId;
  id: string;
  type: string;
  zoneId?: string;
  incidentId?: string;
  actorId?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

// ── User ──────────────────────────────────────────────────────────────────────
export interface User {
  _id?: ObjectId;
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: Role;
  active: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
}

// ── Session ───────────────────────────────────────────────────────────────────
export interface Session {
  _id?: ObjectId;
  id: string;
  userId: string;
  csrfToken: string;
  expiresAt: Date;
  createdAt: Date;
}
