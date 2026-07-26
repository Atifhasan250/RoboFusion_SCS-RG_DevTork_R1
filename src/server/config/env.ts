import { z } from "zod";

const schema = z.object({
  MONGODB_URI: z.string().min(1).default("mongodb://127.0.0.1:27017/?replicaSet=rs0"),
  MONGODB_DB: z.string().min(1).default("robofusion"),
  SESSION_SECRET: z.string().min(32).default("development-only-session-secret-change-me-123456789"),
  ZONE_API_KEY_PEPPER: z.string().min(16).default("development-zone-key-pepper-change-me"),
  APP_ORIGIN: z.string().url().default("http://localhost:3000"),
  APP_ENV: z.enum(["development", "test", "production"]).default("development"),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-3.5-flash"),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_PRIMARY_MODEL: z.string().default("google/gemini-3.5-flash"),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  ML_MODEL_PATH: z.string().default("models/risk-model-v1.json"),
  LOG_LEVEL: z.string().default("info"),
});

export const env = schema.parse(process.env);
