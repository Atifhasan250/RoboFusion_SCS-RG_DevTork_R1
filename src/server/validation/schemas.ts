import { z } from "zod";

const sensorStatusValue = z.enum(["ONLINE", "OFFLINE", "DEGRADED", "WARMING_UP", "NOT_CONFIGURED"]);

/** Raw sensor reading payload sent by Wokwi/ESP32 zone nodes. */
export const readingSchema = z.object({
  /** Unique boot instance identifier — changes on device restart. */
  bootId: z.string().min(1).max(64).default("default"),
  /** Monotonically increasing sequence number per boot. */
  sequence: z.number().int().nonnegative(),
  /** ISO timestamp of sensor observation. */
  timestamp: z.coerce.date().refine(
    date => date.getTime() <= Date.now() + 30_000,
    { message: "Timestamp cannot be more than 30 seconds in the future" },
  ),
  fire: z.boolean(),
  gas: z.number().min(0).max(4095),
  water: z.number().min(0).max(100),
  pir: z.boolean(),
  /** Development camera cross-check input. Not claimed as an ESP32-CAM implementation. */
  cameraOccupancy: z.boolean().nullable().optional(),
  sensorStatus: z.object({
    fire: sensorStatusValue.optional(),
    gas: sensorStatusValue.optional(),
    water: sensorStatusValue.optional(),
    pir: sensorStatusValue.optional(),
  }).strict().optional(),
  sensorHealth: z.enum(["HEALTHY", "DEGRADED", "OFFLINE"]),
  deviceUptimeSeconds: z.number().nonnegative(),
  sampleIntervalMs: z.number().int().min(100).max(60_000).default(500),
  /** True when a locally cached reading is being replayed after reconnection. */
  replayed: z.boolean().optional().default(false),
  /** True only for the final reading in a replay batch. */
  replayBatchLast: z.boolean().optional().default(false),
}).strict().superRefine((value, ctx) => {
  if (value.replayBatchLast && !value.replayed) {
    ctx.addIssue({ code: "custom", path: ["replayBatchLast"], message: "replayBatchLast requires replayed=true" });
  }
});

export const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
}).strict();

export const noteSchema = z.object({
  text: z.string().min(5).max(1000),
}).strict();

export const overrideSchema = z.object({
  zoneCode: z.string().min(2).max(64),
  action: z.enum(["SILENCE", "RESET", "TEST_ACTUATOR"]),
  reason: z.string().min(3).max(300),
  expiresInMinutes: z.number().int().min(1).max(480).default(30),
}).strict();
