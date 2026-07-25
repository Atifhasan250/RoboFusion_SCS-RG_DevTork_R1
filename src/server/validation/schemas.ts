import { z } from "zod";

/** Raw sensor reading payload sent by Wokwi zone nodes */
export const readingSchema = z.object({
  /** Unique boot instance identifier — changes on device restart */
  bootId: z.string().min(1).max(64).default("default"),
  /** Monotonically increasing sequence number per boot */
  sequence: z.number().int().nonnegative(),
  /** ISO timestamp of sensor observation */
  timestamp: z.coerce.date().refine(date => date.getTime() <= Date.now() + 30000, { message: "Timestamp cannot be more than 30 seconds in the future" }),
  /** Fire/flame sensor: 0 or 1 (digital) */
  fire: z.boolean(),
  /** Gas sensor ADC value (0–4095) */
  gas: z.number().min(0).max(4095),
  /** Water level sensor ADC value (0–100) */
  water: z.number().min(0).max(100),
  /** PIR occupancy: true = occupied */
  pir: z.boolean(),
  /** Optional camera occupancy cross-check */
  cameraOccupancy: z.boolean().nullable().optional(),
  /** Per-sensor status from the node */
  sensorStatus: z.record(z.string(), z.enum(["ONLINE", "OFFLINE", "DEGRADED", "WARMING_UP", "NOT_CONFIGURED"])).optional(),
  /** Overall sensor health aggregate */
  sensorHealth: z.enum(["HEALTHY", "DEGRADED", "OFFLINE"]),
  /** Device uptime in seconds (used for gas warm-up) */
  deviceUptimeSeconds: z.number().nonnegative(),
  /** Sample interval in ms (default 500) */
  sampleIntervalMs: z.number().int().positive().default(500),
}).strict();

/** Browser login */
export const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
});

/** Natural-language incident note */
export const noteSchema = z.object({
  text: z.string().min(5).max(1000),
});

/** Manual override */
export const overrideSchema = z.object({
  zoneCode: z.string().min(2).max(64),
  action: z.enum(["SILENCE", "RESET", "TEST_ACTUATOR"]),
  reason: z.string().min(3).max(300),
  expiresInMinutes: z.number().int().min(1).max(480).default(30),
});
